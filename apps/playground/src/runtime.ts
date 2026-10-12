import { MockTransport, SipTransport } from '@cloudcall/signaling';
import { MockMediaAdapter } from '@cloudcall/webrtc';
import type { SipConfiguration } from '@cloudcall/signaling';

const env = (import.meta as ImportMeta & { env: { PROD: boolean; VITE_CALL_MODE?: string } }).env;
if (env.VITE_CALL_MODE && !['sip', 'mock'].includes(env.VITE_CALL_MODE))
  throw new Error('VITE_CALL_MODE must be sip or mock');
export const realCalls =
  env.VITE_CALL_MODE === 'sip' || (env.PROD && env.VITE_CALL_MODE !== 'mock');

export function createRuntime() {
  if (!realCalls) {
    const transport = new MockTransport();
    const media = new MockMediaAdapter();
    return { transport, media, mockTransport: transport, mockMedia: media, sip: undefined };
  }
  const sip = new SipTransport(async (signal) => {
    const response = await fetch('/api/telephony/config', {
      credentials: 'same-origin',
      signal,
      cache: 'no-store',
    });
    if (!response.ok)
      throw new Error(response.status === 401 ? '登录已过期，请重新登录' : '无法获取通话配置');
    return (await response.json()) as SipConfiguration;
  });
  return { transport: sip, media: sip, mockTransport: undefined, mockMedia: undefined, sip };
}
