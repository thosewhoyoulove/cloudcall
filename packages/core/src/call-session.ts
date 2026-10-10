import { TypedEventBus } from './event-bus';
import { isTerminal, transition } from './call-machine';
import type {
  CallEvent,
  CallHandle,
  CallSnapshot,
  Command,
  MediaAdapter,
  SignalingTransport,
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
    this.snapshot = next;
    this.bus.emit('updated', this.getSnapshot());
    this.onUpdate(this.getSnapshot());
    if (isTerminal(next.state)) void this.media.release(this.id);
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
    if (this.snapshot.state !== 'active' && this.snapshot.state !== 'holding')
      return Promise.reject(new Error('Transfer requires an active call'));
    if (!/^\+?[0-9*#]{3,20}$/.test(target))
      return Promise.reject(new Error('Transfer target is invalid'));
    return this.enqueue(() => this.send('transfer', { target }));
  }
  private command(type: Command['type'], event: CallEvent, acquire = false): Promise<void> {
    return this.enqueue(async () => {
      if (isTerminal(this.snapshot.state)) return;
      if (acquire) await this.media.acquire(this.id, this.signal);
      // Local intent wins synchronously; a late REMOTE_ACCEPTED is ignored by the terminal state.
      this.apply(event);
      try {
        await this.send(type);
      } catch (error) {
        if (!isTerminal(this.snapshot.state))
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
