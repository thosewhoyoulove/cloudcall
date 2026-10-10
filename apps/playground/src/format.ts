import type { CallEndReason, CallState, SdkState } from '@cloudcall/core';

export const callStateLabel: Record<CallState, string> = {
  connecting: '正在连接',
  incoming: '来电',
  ringing: '正在振铃',
  active: '通话中',
  holding: '保持',
  reconnecting: '重新连接',
  ending: '正在结束',
  ended: '已结束',
  failed: '失败',
};

export const sdkStateLabel: Record<SdkState, string> = {
  created: '已创建',
  initializing: '初始化中',
  ready: '就绪',
  destroying: '销毁中',
  destroyed: '已销毁',
  failed: '初始化失败',
};

export const endReasonLabel: Record<CallEndReason, string> = {
  'local-hangup': '本地挂断',
  'remote-hangup': '对端挂断',
  rejected: '已拒接',
  cancelled: '已取消',
  timeout: '超时',
  'network-error': '网络错误',
  'signaling-error': '信令错误',
  'sdk-destroyed': '实例销毁',
};

export const directionLabel = { inbound: '呼入', outbound: '呼出' } as const;

export const PAD: { digit: string; letters: string }[] = [
  { digit: '1', letters: '' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
  { digit: '*', letters: '' },
  { digit: '0', letters: '+' },
  { digit: '#', letters: '' },
];

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select'));
}
