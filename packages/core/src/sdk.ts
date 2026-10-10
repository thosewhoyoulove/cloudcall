import { CallSession } from './call-session';
import { TypedEventBus } from './event-bus';
import { ResourceScope } from './resource-scope';
import {
  CloudCallError,
  type CallHandle,
  type CallSnapshot,
  type CloudCallOptions,
  type DialRequest,
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
  constructor(private readonly options: CloudCallOptions) {}
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
    const call = this.createCall({
      id,
      phoneNumber: request.phoneNumber,
      direction: 'outbound',
      state: 'connecting',
      muted: false,
      startedAt: Date.now(),
      revision: 0,
    });
    await this.options.transport.send(
      { id: crypto.randomUUID(), callId: id, type: 'dial', payload: request },
      this.scope.controller.signal,
    );
    this.scope.timeout(() => {
      if (!['active', 'ended', 'failed'].includes(call.getSnapshot().state))
        call.apply({ type: 'TIMEOUT' });
    }, this.options.config?.callTimeoutMs ?? 30_000);
    return call;
  }
  async destroy(): Promise<void> {
    if (this.state === 'destroyed' || this.state === 'destroying') return;
    this.setState('destroying');
    for (const call of this.calls.values()) call.apply({ type: 'DESTROY' });
    try {
      await this.scope.dispose();
      await this.options.media.destroy();
    } finally {
      this.calls.clear();
      this.seenMessages.clear();
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
    if (call) void call.applyRemote(event.event);
  }
  private createCall(snapshot: CallSnapshot): CallSession {
    const call = new CallSession(
      snapshot,
      this.options.transport,
      this.options.media,
      this.scope.controller.signal,
      (value) => {
        this.bus.emit('call:updated', value);
        if (value.state === 'ended' || value.state === 'failed') this.bus.emit('call:ended', value);
      },
    );
    this.calls.set(snapshot.id, call);
    this.bus.emit('call:created', snapshot);
    return call;
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
