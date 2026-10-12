import type { CallHandle, CallSnapshot } from '@cloudcall/core';

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
