import { describe, expect, it, vi } from 'vitest';
import { createCloudCall } from './sdk';
import type { MediaAdapter, SignalingTransport, TransportEvent } from './types';
function fixtures() {
  const listeners = new Set<(event: TransportEvent) => void>();
  const transport: SignalingTransport = {
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    send: vi.fn(async () => {}),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  const media: MediaAdapter = {
    acquire: vi.fn(async () => {}),
    release: vi.fn(async () => {}),
    setMuted: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
  };
  return { transport, media, listeners };
}
describe('CloudCallSDK lifecycle', () => {
  it('deduplicates init and destroy', async () => {
    const f = fixtures();
    const sdk = createCloudCall({
      transport: f.transport,
      media: f.media,
      host: { getAccessToken: async () => '' },
    });
    await Promise.all([sdk.init(), sdk.init()]);
    expect(f.transport.connect).toHaveBeenCalledTimes(1);
    await Promise.all([sdk.destroy(), sdk.destroy()]);
    expect(f.transport.disconnect).toHaveBeenCalledTimes(1);
  });
  it('ignores late signals after destroy', async () => {
    const f = fixtures();
    const sdk = createCloudCall({
      transport: f.transport,
      media: f.media,
      host: { getAccessToken: async () => '' },
    });
    await sdk.init();
    const call = await sdk.dial({ phoneNumber: '10086' });
    await sdk.destroy();
    f.listeners.forEach((fn) =>
      fn({
        type: 'call-event',
        callId: call.id,
        event: { type: 'REMOTE_ACCEPTED' },
        messageId: 'late',
      }),
    );
    expect(call.getSnapshot().state).toBe('ended');
  });
  it('isolates two instances', async () => {
    const a = fixtures(),
      b = fixtures();
    const one = createCloudCall({
        transport: a.transport,
        media: a.media,
        host: { getAccessToken: async () => '' },
      }),
      two = createCloudCall({
        transport: b.transport,
        media: b.media,
        host: { getAccessToken: async () => '' },
      });
    await Promise.all([one.init(), two.init()]);
    await one.dial({ phoneNumber: '10086' });
    expect(one.getCalls()).toHaveLength(1);
    expect(two.getCalls()).toHaveLength(0);
    await Promise.all([one.destroy(), two.destroy()]);
  });
});
