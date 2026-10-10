// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { MockMediaAdapter } from './index';
describe('MockMediaAdapter', () => {
  it('releases all resources on destroy', async () => {
    const media = new MockMediaAdapter();
    await media.acquire('c1', new AbortController().signal);
    await media.setMuted('c1', true);
    expect(media.diagnostics()).toEqual({ activeStreams: 1, mutedStreams: 1 });
    await media.destroy();
    expect(media.diagnostics()).toEqual({ activeStreams: 0, mutedStreams: 0 });
  });
  it('models permission denial explicitly', async () => {
    const media = new MockMediaAdapter();
    media.permissionDenied = true;
    await expect(media.acquire('c1', new AbortController().signal)).rejects.toMatchObject({
      name: 'NotAllowedError',
    });
  });
});
