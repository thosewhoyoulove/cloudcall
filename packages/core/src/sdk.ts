import { CallSession } from './call-session';
import { TypedEventBus } from './event-bus';
import { ResourceScope } from './resource-scope';
import {
  CloudCallError,
  type AgentPresence,
  type CallHandle,
  type CallSnapshot,
  type CloudCallOptions,
  type DialRequest,
  type PresenceReason,
  type ScreenPop,
  type SdkEvents,
  type SdkState,
  type TransportEvent,
} from './types';

export class CloudCallSDK {
  private state: SdkState = 'created';
  private scope = new ResourceScope();
  private readonly bus = new TypedEventBus<SdkEvents>();
  private readonly calls = new Map<string, CallSession>();
  private readonly seenMessages = new Set<string>();
  private initPromise?: Promise<void>;
  private presence: AgentPresence = 'offline';
  private desiredPresence: 'available' | 'away' = 'available';
  private clearWrapUp: (() => void) | undefined;
  constructor(private readonly options: CloudCallOptions) {}
  getAgentPresence(): AgentPresence {
    return this.presence;
  }
  getDesiredPresence(): 'available' | 'away' {
    return this.desiredPresence;
  }
  setAgentPresence(next: 'available' | 'away'): void {
    this.assertReady();
    this.desiredPresence = next;
    if (this.presence === 'busy' || this.presence === 'wrap-up') return;
    this.publishPresence(next, 'manual');
  }
  getState(): SdkState {
    return this.state;
  }
  getCalls(): CallSnapshot[] {
    return [...this.calls.values()].map((call) => call.getSnapshot());
  }
  getCall(id: string): CallHandle | undefined {
    return this.calls.get(id);
  }
  on<K extends keyof SdkEvents>(event: K, listener: (value: SdkEvents[K]) => void): () => void {
    return this.bus.on(event, listener);
  }
  init(): Promise<void> {
    if (this.state === 'ready') return Promise.resolve();
    if (this.state === 'initializing' && this.initPromise) return this.initPromise;
    if (this.state === 'destroyed' || this.state === 'destroying')
      return Promise.reject(
        new CloudCallError('DESTROYED', 'A destroyed SDK instance cannot be initialized again'),
      );
    this.setState('initializing');
    const generation = this.scope;
    this.initPromise = (async () => {
      await this.options.host.getAccessToken(generation.controller.signal);
      await this.options.transport.connect(generation.controller.signal);
      if (generation.controller.signal.aborted)
        throw new CloudCallError('DESTROYED', 'Initialization was cancelled');
      generation.add(
        this.options.transport.subscribe((event) => this.handleTransportEvent(event, generation)),
      );
      generation.add(() => this.options.transport.disconnect());
      this.setState('ready');
      this.publishPresence(this.desiredPresence, 'manual');
      this.startQualitySampler();
    })().catch((error) => {
      if (this.state !== 'destroying' && this.state !== 'destroyed') this.setState('failed');
      throw error;
    });
    return this.initPromise;
  }
  async dial(request: DialRequest): Promise<CallHandle> {
    this.assertReady();
    const max = this.options.config?.maxConcurrentCalls ?? 2;
    const active = this.getCalls().filter(
      (call) => call.state !== 'ended' && call.state !== 'failed',
    ).length;
    if (active >= max)
      throw new CloudCallError('CAPACITY', `Maximum ${max} concurrent calls reached`);
    if (!/^\+?[0-9*#]{3,20}$/.test(request.phoneNumber))
      throw new CloudCallError('VALIDATION', 'Phone number is invalid');
    const id = crypto.randomUUID();
    const snapshot: CallSnapshot = {
      id,
      phoneNumber: request.phoneNumber,
      direction: 'outbound',
      state: 'connecting',
      muted: false,
      startedAt: Date.now(),
      revision: 0,
    };
    if (request.businessContext) snapshot.businessContext = request.businessContext;
    const call = this.createCall(snapshot);
    try {
      await this.options.transport.send(
        { id: crypto.randomUUID(), callId: id, type: 'dial', payload: request },
        this.scope.controller.signal,
      );
    } catch (error) {
      call.apply({
        type: 'FAIL',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
    return call;
  }
  async destroy(): Promise<void> {
    if (this.state === 'destroyed' || this.state === 'destroying') return;
    this.setState('destroying');
    this.clearWrapUp?.();
    for (const call of this.calls.values()) call.apply({ type: 'DESTROY' });
    try {
      await this.scope.dispose();
      await this.options.media.destroy();
    } finally {
      this.calls.clear();
      this.seenMessages.clear();
      this.publishPresence('offline', 'destroy');
      this.setState('destroyed');
      this.bus.clear();
    }
  }
  diagnostics(): { state: SdkState; calls: number; listeners: number; seenMessages: number } {
    return {
      state: this.state,
      calls: this.calls.size,
      listeners: this.bus.listenerCount(),
      seenMessages: this.seenMessages.size,
    };
  }
  private handleTransportEvent(event: TransportEvent, scope: ResourceScope): void {
    if (scope !== this.scope || scope.controller.signal.aborted || this.state !== 'ready') return;
    if (event.type === 'incoming') {
      if (!this.calls.has(event.call.id))
        this.createCall({
          ...event.call,
          direction: 'inbound',
          state: 'incoming',
          muted: false,
          startedAt: Date.now(),
          revision: 0,
        });
      return;
    }
    if (this.seenMessages.has(event.messageId)) return;
    this.seenMessages.add(event.messageId);
    const call = this.calls.get(event.callId);
    if (call) {
      if (event.event.type === 'FAIL')
        this.bus.emit(
          'error',
          new CloudCallError('TRANSPORT', event.event.error.message, event.event.error),
        );
      void call.applyRemote(event.event).catch((error: unknown) => {
        this.bus.emit('error', new CloudCallError('TRANSPORT', 'Invalid remote call event', error));
      });
    }
  }
  private createCall(snapshot: CallSnapshot): CallSession {
    const call = new CallSession(
      snapshot,
      this.options.transport,
      this.options.media,
      this.scope.controller.signal,
      (value) => {
        this.bus.emit('call:updated', value);
        if (value.state === 'ended' || value.state === 'failed') {
          this.bus.emit('call:ended', value);
          this.noteCallActivity();
        }
      },
      this.options.recording,
      (error) => {
        this.bus.emit(
          'error',
          error instanceof CloudCallError
            ? error
            : new CloudCallError('MEDIA', 'Recording hook failed', error),
        );
      },
    );
    this.calls.set(snapshot.id, call);
    this.scope.timeout(() => {
      if (['connecting', 'ringing', 'incoming'].includes(call.getSnapshot().state))
        call.apply({ type: 'TIMEOUT' });
    }, this.options.config?.callTimeoutMs ?? 30_000);
    this.bus.emit('call:created', snapshot);
    this.emitScreenPop(snapshot);
    this.noteCallActivity();
    return call;
  }
  private emitScreenPop(snapshot: CallSnapshot): void {
    const pop: ScreenPop = {
      callId: snapshot.id,
      phoneNumber: snapshot.phoneNumber,
      direction: snapshot.direction,
    };
    if (snapshot.businessContext) pop.businessContext = snapshot.businessContext;
    this.bus.emit('crm:screen-pop', pop);
    void Promise.resolve(this.options.host.screenPop?.(pop)).catch((error: unknown) => {
      this.bus.emit('error', new CloudCallError('VALIDATION', 'Screen pop hook failed', error));
    });
  }
  private noteCallActivity(): void {
    if (this.state !== 'ready') return;
    if (this.hasLiveCall()) {
      this.clearWrapUp?.();
      this.clearWrapUp = undefined;
      this.publishPresence('busy', 'call');
      return;
    }
    const wrapUpMs = this.options.config?.wrapUpMs ?? 0;
    if (wrapUpMs > 0) {
      this.publishPresence('wrap-up', 'wrap-up');
      this.clearWrapUp?.();
      this.clearWrapUp = this.scope.timeout(() => {
        this.clearWrapUp = undefined;
        if (this.state === 'ready' && !this.hasLiveCall())
          this.publishPresence(this.desiredPresence, 'manual');
      }, wrapUpMs);
      return;
    }
    this.publishPresence(this.desiredPresence, 'manual');
  }
  private hasLiveCall(): boolean {
    return this.getCalls().some((call) => call.state !== 'ended' && call.state !== 'failed');
  }
  private publishPresence(presence: AgentPresence, reason: PresenceReason): void {
    if (this.presence === presence) return;
    this.presence = presence;
    this.bus.emit('agent:presence', { presence, reason });
  }
  private startQualitySampler(): void {
    const interval = this.options.config?.qualityIntervalMs ?? 2_000;
    if (!interval || !this.options.media.getQuality) return;
    const timer = setInterval(() => {
      void this.sampleQuality();
    }, interval);
    this.scope.add(() => clearInterval(timer));
  }
  private async sampleQuality(): Promise<void> {
    const read = this.options.media.getQuality;
    if (!read || this.state !== 'ready') return;
    for (const call of this.calls.values()) {
      const snapshot = call.getSnapshot();
      if (snapshot.state !== 'active' && snapshot.state !== 'holding') continue;
      try {
        const quality = await read.call(this.options.media, snapshot.id);
        if (quality && this.state === 'ready')
          this.bus.emit('call:quality', { callId: snapshot.id, quality });
      } catch (error) {
        if (this.state === 'ready')
          this.bus.emit('error', new CloudCallError('MEDIA', 'Call quality sample failed', error));
      }
    }
  }
  private assertReady(): void {
    if (this.state !== 'ready')
      throw new CloudCallError(
        this.state === 'destroyed' ? 'DESTROYED' : 'NOT_INITIALIZED',
        `SDK is ${this.state}`,
      );
  }
  private setState(state: SdkState): void {
    this.state = state;
    this.bus.emit('sdk:state', state);
  }
}

export function createCloudCall(options: CloudCallOptions): CloudCallSDK {
  return new CloudCallSDK(options);
}
