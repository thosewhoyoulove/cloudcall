import { StatusBadge } from '@cloudcall/ui';
import type { Workbench } from '../use-workbench';
import { directionLabel, endReasonLabel, formatClock, formatDuration } from '../format';

export function Sessions({
  bench,
  onRedial,
}: {
  bench: Workbench;
  onRedial: (phoneNumber: string) => void;
}) {
  const rows = [...bench.calls].reverse();
  return (
    <div className="page">
      <header className="page-intro">
        <h2>通话会话</h2>
        <p>列表来自 SDK 内存中的会话快照。回拨只填入号码，不会自动拨出。</p>
      </header>
      {rows.length === 0 ? (
        <p className="empty">还没有通话记录。</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>号码</th>
                <th>方向</th>
                <th>状态</th>
                <th>开始</th>
                <th>时长</th>
                <th>结束</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((call) => (
                <tr key={call.id}>
                  <td className="mono">{call.phoneNumber}</td>
                  <td>{directionLabel[call.direction]}</td>
                  <td>
                    <StatusBadge state={call.state} />
                  </td>
                  <td>{formatClock(call.startedAt)}</td>
                  <td className="mono">
                    {call.connectedAt
                      ? formatDuration((call.endedAt ?? bench.now) - call.connectedAt)
                      : '—'}
                  </td>
                  <td>{call.endReason ? endReasonLabel[call.endReason] : '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="text-btn"
                      onClick={() => onRedial(call.phoneNumber)}
                    >
                      回拨
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
