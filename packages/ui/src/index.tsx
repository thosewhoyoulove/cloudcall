import type { CallHandle, CallQuality, CallSnapshot } from '@cloudcall/core';

export function CallControls({
  call,
  snapshot,
  onError,
}: {
  call: CallHandle;
  snapshot: CallSnapshot;
  onError?: (error: unknown) => void;
}) {
  const run = (operation: Promise<void>) => {
    void operation.catch((error: unknown) => onError?.(error));
  };
  const active = snapshot.state === 'active' || snapshot.state === 'holding';
  return (
    <div className="call-controls" role="group" aria-label="通话控制">
      {snapshot.state === 'incoming' && (
        <>
          <button type="button" className="ctrl ctrl-reject" onClick={() => run(call.reject())}>
            拒接
          </button>
          <button type="button" className="ctrl ctrl-accept" onClick={() => run(call.accept())}>
            接听
          </button>
        </>
      )}
      {active && (
        <>
          <button
            type="button"
            className="ctrl"
            aria-pressed={snapshot.muted}
            onClick={() => run(call.mute(!snapshot.muted))}
          >
            {snapshot.muted ? '取消静音' : '静音'}
          </button>
          <button
            type="button"
            className="ctrl"
            aria-pressed={snapshot.state === 'holding'}
            onClick={() => run(snapshot.state === 'holding' ? call.resume() : call.hold())}
          >
            {snapshot.state === 'holding' ? '恢复' : '保持'}
          </button>
          <button
            type="button"
            className="ctrl"
            aria-pressed={snapshot.recording === 'recording'}
            onClick={() =>
              run(snapshot.recording === 'recording' ? call.stopRecording() : call.startRecording())
            }
          >
            {snapshot.recording === 'recording' ? '停止录音' : '录音'}
          </button>
        </>
      )}
      {!['ended', 'failed', 'incoming'].includes(snapshot.state) && (
        <button type="button" className="ctrl ctrl-hangup" onClick={() => run(call.hangup())}>
          挂断
        </button>
      )}
    </div>
  );
}
export function StatusBadge({ state }: { state: CallSnapshot['state'] }) {
  return <span className={`status status-${state}`}>{state}</span>;
}

const QUALITY_LABEL = { good: '良好', fair: '一般', poor: '较差', unknown: '未知' } as const;

export function QualityMeter({ quality }: { quality: CallQuality | undefined }) {
  const level = quality?.level ?? 'unknown';
  const detail = [
    quality?.roundTripTimeMs !== undefined ? `RTT ${Math.round(quality.roundTripTimeMs)}ms` : '',
    quality?.jitterMs !== undefined ? `抖动 ${Math.round(quality.jitterMs)}ms` : '',
    quality?.packetsLost !== undefined ? `丢包 ${quality.packetsLost}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <span className={`quality quality-${level}`} title={detail || undefined} aria-live="polite">
      质量 {QUALITY_LABEL[level]}
    </span>
  );
}
