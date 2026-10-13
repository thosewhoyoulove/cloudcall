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
  it('ends the call and releases media when sending dial fails', async () => {
    const f = fixtures();
    vi.mocked(f.transport.send).mockRejectedValueOnce(new Error('Offline'));
    const sdk = createCloudCall({
      transport: f.transport,
      media: f.media,
      host: { getAccessToken: async () => '' },
    });
    await sdk.init();
    await expect(sdk.dial({ phoneNumber: '1001' })).rejects.toThrow('Offline');
    expect(sdk.getCalls()[0]?.state).toBe('failed');
    expect(f.media.release).toHaveBeenCalled();
    await sdk.destroy();
  });
  it('does not end a held call when the ringing deadline expires', async () => {
    vi.useFakeTimers();
    const f = fixtures();
    const sdk = createCloudCall({
      transport: f.transport,
      media: f.media,
      host: { getAccessToken: async () => '' },
      config: { callTimeoutMs: 100 },
    });
    try {
      await sdk.init();
      const call = await sdk.dial({ phoneNumber: '1001' });
      f.listeners.forEach((listener) =>
        listener({
          type: 'call-event',
          callId: call.id,
          messageId: 'accepted',
          event: { type: 'REMOTE_ACCEPTED' },
        }),
      );
      await Promise.resolve();
      await call.hold();
      await vi.advanceTimersByTimeAsync(100);
      expect(call.getSnapshot().state).toBe('holding');
    } finally {
      await sdk.destroy();
      vi.useRealTimers();
    }
  });
  it('times out unanswered inbound calls and releases the SIP session', async () => {
    vi.useFakeTimers();
    const f = fixtures();
    const sdk = createCloudCall({
      transport: f.transport,
      media: f.media,
      host: { getAccessToken: async () => '' },
      config: { callTimeoutMs: 100 },
    });
    try {
      await sdk.init();
      f.listeners.forEach((listener) =>
        listener({ type: 'incoming', call: { id: 'incoming', phoneNumber: '1001' } }),
      );
      await vi.advanceTimersByTimeAsync(100);
      expect(sdk.getCall('incoming')?.getSnapshot().endReason).toBe('timeout');
      expect(f.media.release).toHaveBeenCalledWith('incoming');
    } finally {
      await sdk.destroy();
      vi.useRealTimers();
    }
  });
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
  it('tracks agent presence, screen pop, blind transfer and recording', async () => {
    vi.useFakeTimers();
    const f = fixtures();
    const stopped: string[] = [];
    const pops: string[] = [];
    const sdk = createCloudCall({
      transport: f.transport,
      media: f.media,
      host: {
        getAccessToken: async () => '',
        screenPop: (pop) => {
          pops.push(pop.phoneNumber);
        },
      },
      recording: {
        start: async () => ({ id: 'rec-1' }),
        stop: async (_call, id) => {
          stopped.push(id);
        },
      },
      config: { wrapUpMs: 1_000 },
    });
    try {
      const presence: string[] = [];
      sdk.on('agent:presence', (event) => presence.push(event.presence));
      sdk.on('crm:screen-pop', (pop) => pops.push(`event:${pop.direction}`));
      await sdk.init();
      expect(sdk.getAgentPresence()).toBe('available');
      const call = await sdk.dial({ phoneNumber: '10086', businessContext: { account: 'AC-1' } });
      expect(sdk.getAgentPresence()).toBe('busy');
      expect(pops).toEqual(['event:outbound', '10086']);
      f.listeners.forEach((listener) =>
        listener({
          type: 'call-event',
          callId: call.id,
          messageId: 'accepted',
          event: { type: 'REMOTE_ACCEPTED' },
        }),
      );
      await Promise.resolve();
      await call.startRecording();
      expect(call.getSnapshot().recording).toBe('recording');
      sdk.setAgentPresence('away');
      expect(sdk.getAgentPresence()).toBe('busy');
      expect(sdk.getDesiredPresence()).toBe('away');
      await call.transfer('10010');
      expect(call.getSnapshot().endReason).toBe('transferred');
      expect(stopped).toEqual(['rec-1']);
      expect(sdk.getAgentPresence()).toBe('wrap-up');
      await vi.advanceTimersByTimeAsync(1_000);
      expect(sdk.getAgentPresence()).toBe('away');
      expect(presence).toContain('wrap-up');
    } finally {
      await sdk.destroy();
      vi.useRealTimers();
    }
  });
  it('publishes media quality samples for active calls', async () => {
    vi.useFakeTimers();
    const f = fixtures();
    f.media.getQuality = vi.fn(async () => ({
      timestamp: 1,
      level: 'fair' as const,
      jitterMs: 50,
      roundTripTimeMs: 220,
      packetsLost: 2,
      packetsReceived: 80,
    }));
    const sdk = createCloudCall({
      transport: f.transport,
      media: f.media,
      host: { getAccessToken: async () => '' },
      config: { qualityIntervalMs: 500 },
    });
    const samples: string[] = [];
    sdk.on('call:quality', (sample) => samples.push(sample.quality.level));
    try {
      await sdk.init();
      const call = await sdk.dial({ phoneNumber: '1001' });
      f.listeners.forEach((listener) =>
        listener({
          type: 'call-event',
          callId: call.id,
          messageId: 'accepted',
          event: { type: 'REMOTE_ACCEPTED' },
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
      expect(call.getSnapshot().state).toBe('active');
      await vi.advanceTimersByTimeAsync(500);
      expect(samples).toContain('fair');
    } finally {
      await sdk.destroy();
      vi.useRealTimers();
    }
  });
});
