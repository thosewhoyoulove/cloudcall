import { useEffect, useMemo, useRef, useState } from 'react';
import type { LogKind, Workbench } from '../use-workbench';
import { Icon } from '../icons';

const FILTERS: { id: 'all' | LogKind; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'lifecycle', label: '生命周期' },
  { id: 'call', label: '会话' },
  { id: 'state', label: '状态' },
  { id: 'signaling', label: '信令' },
  { id: 'fault', label: '故障' },
  { id: 'error', label: '错误' },
];

export function LogsView({ bench }: { bench: Workbench }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<(typeof FILTERS)[number]['id']>('all');
  const [stick, setStick] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return bench.logs.filter((item) => {
      if (kind !== 'all' && item.kind !== kind) return false;
      if (!needle) return true;
      return `${item.kind} ${item.message}`.toLowerCase().includes(needle);
    });
  }, [bench.logs, kind, query]);

  useEffect(() => {
    const node = scroller.current;
    if (!stick || !node) return;
    node.scrollTop = node.scrollHeight;
  }, [rows, stick]);

  return (
    <div className="page page-fill">
      <header className="page-intro">
        <h2>事件日志</h2>
        <p>按时间顺序记录 SDK 生命周期、会话迁移和 Mock 信令。搜索只过滤显示，不改变 SDK。</p>
      </header>
      <div className="console">
        <div className="console-bar">
          <label className="search">
            <Icon name="search" size={14} />
            <input
              aria-label="搜索日志"
              placeholder="搜索"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="filters" role="toolbar" aria-label="日志类型">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={kind === item.id}
                onClick={() => setKind(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={stick}
              onChange={(event) => setStick(event.target.checked)}
            />
            跟随底部
          </label>
          <button type="button" className="text-btn" onClick={bench.clearLogs}>
            清空
          </button>
        </div>
        <div
          className="console-list"
          ref={scroller}
          onScroll={(event) => {
            const node = event.currentTarget;
            const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
            setStick(distance < 48);
          }}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {rows.length === 0 ? (
            <p className="empty">没有匹配的事件。</p>
          ) : (
            rows.map((item) => (
              <div className="log-row" key={item.id} data-kind={item.kind}>
                <time>{item.time}</time>
                <em>{item.kind}</em>
                <span>{item.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
