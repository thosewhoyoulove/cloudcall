import { describe, expect, it } from 'vitest';
import { createCloudCall, type MediaAdapter, type SignalingTransport } from './index';
describe('resource pressure', () => {
  it('creates and destroys 100 isolated instances without retained SDK resources', async () => {
    for (let index = 0; index < 100; index++) {
      const transport: SignalingTransport = {
        connect: async () => {},
        disconnect: async () => {},
        send: async () => {},
        subscribe: () => () => {},
      };
      const media: MediaAdapter = {
        acquire: async () => {},
        release: async () => {},
        setMuted: async () => {},
        destroy: async () => {},
      };
      const sdk = createCloudCall({ transport, media, host: { getAccessToken: async () => '' } });
      await sdk.init();
      await sdk.destroy();
      expect(sdk.diagnostics()).toEqual({
        state: 'destroyed',
        calls: 0,
        listeners: 0,
        seenMessages: 0,
      });
    }
  });
});
