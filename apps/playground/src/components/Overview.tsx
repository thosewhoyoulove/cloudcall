import { StatusBadge } from '@cloudcall/ui';
import type { NavId } from '../nav';
import type { Workbench } from '../use-workbench';
import { directionLabel, formatDuration, sdkStateLabel } from '../format';

export function Overview({ bench, onOpen }: { bench: Workbench; onOpen: (view: NavId) => void }) {
  const { diagnostics, media, state, active, now } = bench;
  const recent = [...bench.calls].reverse().slice(0, 5);
  return (
    <div className="page">
      <header className="page-intro">
        <h2>工作台</h2>
        <p>软电话在中间，SDK 生命周期和信令在右侧检查器。这里只汇总真实运行数据。</p>
      </header>
      <section className="statline" aria-label="运行摘要">
        <div>
          <strong>{sdkStateLabel[state]}</strong>
          <span>SDK</span>
        </div>
        <div>
          <strong>{diagnostics.calls}</strong>
          <span>会话</span>
        </div>
        <div>
          <strong>{media.activeStreams}</strong>
          <span>媒体流</span>
        </div>
        <div>
          <strong>{diagnostics.listeners}</strong>
          <span>监听器</span>
        </div>
      </section>

      {active ? (
        <button type="button" className="live-row" onClick={() => onOpen('softphone')}>
          <span>
            {directionLabel[active.direction]} · {active.phoneNumber}
          </span>
          <StatusBadge state={active.state} />
          <time>
            {active.connectedAt ? formatDuration(now - active.connectedAt) : callWait(active.state)}
          </time>
          <span className="live-go">打开软电话</span>
        </button>
      ) : (
        <button type="button" className="live-row is-idle" onClick={() => onOpen('softphone')}>
          <span>没有进行中的通话</span>
          <span className="live-go">去拨号</span>
        </button>
      )}

      <section className="block">
        <div className="block-head">
          <h2>最近会话</h2>
          <button type="button" className="text-btn" onClick={() => onOpen('sessions')}>
            全部
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="empty">暂无会话</p>
        ) : (
          <ul className="session-list">
            {recent.map((call) => (
              <li key={call.id}>
                <span>
                  <b>{call.phoneNumber}</b>
                  <small>{directionLabel[call.direction]}</small>
                </span>
                <StatusBadge state={call.state} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function callWait(state: string): string {
  if (state === 'incoming') return '等待接听';
  if (state === 'ringing' || state === 'connecting') return '等待接通';
  return state;
}
