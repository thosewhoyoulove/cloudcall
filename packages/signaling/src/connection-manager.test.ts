import { describe, expect, it, vi } from 'vitest';
import { ConnectionManager } from './connection-manager';
class FakeSocket {
  static readonly OPEN = 1;
  readyState = 1;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  sent: string[] = [];
  send(v: string) {
    this.sent.push(v);
  }
  close() {}
}
describe('ConnectionManager', () => {
  it('does not queue unsafe call commands', () => {
    const socket = new FakeSocket();
    const manager = new ConnectionManager({
      url: 'ws://mock',
      socketFactory: () => socket as unknown as WebSocket,
    });
    expect(() => manager.send({ id: '1', type: 'hangup' })).toThrow(/not replayed/);
  });
  it('deduplicates concurrent connect', () => {
    const factory = vi.fn(() => new FakeSocket() as unknown as WebSocket);
    const manager = new ConnectionManager({ url: 'ws://mock', socketFactory: factory });
    manager.connect();
    manager.connect();
    expect(factory).toHaveBeenCalledTimes(1);
    manager.close();
  });
});
