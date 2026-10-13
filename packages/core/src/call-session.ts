import { TypedEventBus } from './event-bus';
import { isTerminal, transition } from './call-machine';
import {
  CloudCallError,
  type CallEvent,
  type CallHandle,
  type CallSnapshot,
  type Command,
  type MediaAdapter,
  type RecordingHook,
  type SignalingTransport,
} from './types';

export class CallSession implements CallHandle {
  readonly id: string;
  private readonly bus = new TypedEventBus<{ updated: CallSnapshot }>();
  private operation = Promise.resolve();
  constructor(
    private snapshot: CallSnapshot,
    private readonly transport: SignalingTransport,
    private readonly media: MediaAdapter,
    private readonly signal: AbortSignal,
    private readonly onUpdate: (snapshot: CallSnapshot) => void,
    private readonly recording?: RecordingHook,
    private readonly onError?: (error: unknown) => void,
  ) {
    this.id = snapshot.id;
  }
  getSnapshot(): CallSnapshot {
    return { ...this.snapshot };
  }
  subscribe(listener: (snapshot: CallSnapshot) => void): () => void {
    listener(this.getSnapshot());
    return this.bus.on('updated', listener);
  }
  apply(event: CallEvent): void {
    const next = transition(this.snapshot, event);
    if (next === this.snapshot) return;
    const recordingId =
      this.snapshot.recording === 'recording' ? this.snapshot.recordingId : undefined;
    this.snapshot = next;
    if (recordingId && isTerminal(next.state)) {
      this.snapshot = { ...this.snapshot, recording: 'stopped' };
      void this.recording
        ?.stop(this.getSnapshot(), recordingId)
        .catch((error: unknown) => this.onError?.(error));
    }
    this.bus.emit('updated', this.getSnapshot());
    this.onUpdate(this.getSnapshot());
    if (isTerminal(next.state)) void this.media.release(this.id).catch(() => {});
  }
  async applyRemote(event: CallEvent): Promise<void> {
    if (event.type === 'REMOTE_ACCEPTED' && !isTerminal(this.snapshot.state)) {
      try {
        await this.media.acquire(this.id, this.signal);
      } catch (error) {
        this.apply({
          type: 'FAIL',
          error: error instanceof Error ? error : new Error(String(error)),
        });
        return;
      }
      if (this.signal.aborted || isTerminal(this.snapshot.state)) {
        await this.media.release(this.id);
        return;
      }
    }
    this.apply(event);
  }
  accept(): Promise<void> {
    return this.command('accept', { type: 'ACCEPT' }, true);
  }
  reject(): Promise<void> {
    return this.command('reject', { type: 'REJECT' });
  }
  hangup(): Promise<void> {
    return this.command('hangup', { type: 'HANGUP' });
  }
  hold(): Promise<void> {
    return this.command('hold', { type: 'HOLD' });
  }
  resume(): Promise<void> {
    return this.command('resume', { type: 'RESUME' });
  }
  mute(muted = true): Promise<void> {
    return this.enqueue(async () => {
      if (isTerminal(this.snapshot.state)) return;
      await this.media.setMuted(this.id, muted);
      this.snapshot = { ...this.snapshot, muted };
      this.notify();
    });
  }
  sendDtmf(tones: string): Promise<void> {
    if (!/^[0-9A-D*#]+$/i.test(tones)) return Promise.reject(new Error('Invalid DTMF tones'));
    return this.enqueue(() => this.send('dtmf', tones));
  }
  transfer(target: string): Promise<void> {
    if (!/^\+?[0-9*#]{3,20}$/.test(target))
      return Promise.reject(new CloudCallError('VALIDATION', 'Transfer target is invalid'));
    return this.enqueue(async () => {
      if (this.snapshot.state !== 'active' && this.snapshot.state !== 'holding')
        throw new CloudCallError('INVALID_STATE', 'Transfer requires an active call');
      await this.send('transfer', { target });
      if (!isTerminal(this.snapshot.state)) this.apply({ type: 'TRANSFERRED' });
    });
  }
  startRecording(): Promise<void> {
    return this.enqueue(async () => {
      if (this.snapshot.state !== 'active' && this.snapshot.state !== 'holding')
        throw new CloudCallError('INVALID_STATE', 'Recording requires an active call');
      if (!this.recording)
        throw new CloudCallError('VALIDATION', 'Recording hook is not configured');
      if (this.snapshot.recording === 'recording' || this.snapshot.recording === 'pending') return;
      this.snapshot = { ...this.snapshot, recording: 'pending' };
      this.notify();
      try {
        const started = await this.recording.start(this.getSnapshot());
        if (isTerminal(this.snapshot.state)) {
          await this.recording.stop(this.getSnapshot(), started.id);
          return;
        }
        this.snapshot = { ...this.snapshot, recording: 'recording', recordingId: started.id };
        this.notify();
      } catch (error) {
        const rest: CallSnapshot = { ...this.snapshot, recording: 'off' };
        delete rest.recordingId;
        this.snapshot = rest;
        this.notify();
        throw error;
      }
    });
  }
  stopRecording(): Promise<void> {
    return this.enqueue(async () => {
      const recordingId = this.snapshot.recordingId;
      if (this.snapshot.recording !== 'recording' || !recordingId) return;
      this.snapshot = { ...this.snapshot, recording: 'stopped' };
      this.notify();
      await this.recording?.stop(this.getSnapshot(), recordingId);
    });
  }
  private command(type: Command['type'], event: CallEvent, acquire = false): Promise<void> {
    return this.enqueue(async () => {
      if (isTerminal(this.snapshot.state)) return;
      // Local intent wins synchronously; a late REMOTE_ACCEPTED is ignored by the terminal state.
      transition(this.snapshot, event); // Validate before sending an irreversible command.
      try {
        if (acquire) await this.media.acquire(this.id, this.signal);
        if (!this.transport.confirmsCommands) this.apply(event);
        await this.send(type);
        if (this.transport.confirmsCommands && !isTerminal(this.snapshot.state)) {
          // Incoming SIP acceptance is confirmed by the Established event.
          if (type !== 'accept') this.apply(event);
        }
      } catch (error) {
        if (
          !isTerminal(this.snapshot.state) &&
          !(this.transport.confirmsCommands && (type === 'hold' || type === 'resume'))
        )
          this.apply({
            type: 'FAIL',
            error: error instanceof Error ? error : new Error(String(error)),
          });
        throw error;
      }
    });
  }
  private send(type: Command['type'], payload?: unknown): Promise<void> {
    return this.transport.send(
      { id: crypto.randomUUID(), callId: this.id, type, payload },
      this.signal,
    );
  }
  private enqueue(task: () => Promise<void>): Promise<void> {
    const next = this.operation.then(task, task);
    this.operation = next.catch(() => undefined);
    return next;
  }
  private notify(): void {
    const value = this.getSnapshot();
    this.bus.emit('updated', value);
    this.onUpdate(value);
  }
}
