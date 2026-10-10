import type { CallEvent, Command, SignalingTransport, TransportEvent } from '@cloudcall/core';

export interface FaultProfile {
  latencyMs: number;
  duplicate: boolean;
  outOfOrder: boolean;
  failNext: boolean;
  offline: boolean;
}
export class MockTransport implements SignalingTransport {
  readonly faults: FaultProfile = {
    latencyMs: 350,
    duplicate: false,
    outOfOrder: false,
    failNext: false,
    offline: false,
  };
  private readonly listeners = new Set<(event: TransportEvent) => void>();
  private connected = false;
  configureFaults(patch: Partial<FaultProfile>): void {
    Object.assign(this.faults, patch);
  }
  async connect(signal: AbortSignal): Promise<void> {
    await this.delay(80, signal);
    if (this.faults.offline) throw new Error('Mock network is offline');
    this.connected = true;
  }
  async disconnect(): Promise<void> {
    this.connected = false;
  }
  subscribe(listener: (event: TransportEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  async send(command: Command, signal: AbortSignal): Promise<void> {
    if (!this.connected || this.faults.offline) throw new Error('[Mock] signaling unavailable');
    await this.delay(this.faults.latencyMs, signal);
    if (this.faults.failNext) {
      this.faults.failNext = false;
      throw new Error('[Mock] injected command failure');
    }
    if (command.type === 'dial') {
      const events: CallEvent[] = this.faults.outOfOrder
        ? [
            { type: 'REMOTE_ACCEPTED', sequence: 2 },
            { type: 'REMOTE_RINGING', sequence: 1 },
          ]
        : [
            { type: 'REMOTE_RINGING', sequence: 1 },
            { type: 'REMOTE_ACCEPTED', sequence: 2 },
          ];
      events.forEach((event, index) =>
        setTimeout(
          () =>
            this.emit({
              type: 'call-event',
              callId: command.callId,
              event,
              messageId: `${command.id}-${index}`,
            }),
          this.faults.latencyMs * (index + 1),
        ),
      );
    }
  }
  simulateIncoming(phoneNumber = '400-800-8888'): string {
    const id = crypto.randomUUID();
    this.emit({ type: 'incoming', call: { id, phoneNumber } });
    return id;
  }
  simulateRemoteHangup(callId: string): void {
    this.emit({
      type: 'call-event',
      callId,
      event: { type: 'REMOTE_HANGUP' },
      messageId: crypto.randomUUID(),
    });
  }
  private emit(event: TransportEvent): void {
    for (const listener of this.listeners) {
      listener(event);
      if (this.faults.duplicate && event.type === 'call-event') listener(event);
    }
  }
  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = setTimeout(resolve, ms);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(id);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
  }
}
