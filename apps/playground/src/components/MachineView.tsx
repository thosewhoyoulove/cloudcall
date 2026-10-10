import { StatusBadge } from '@cloudcall/ui';
import { acceptedEvents } from '@cloudcall/core';
import type { CallSnapshot, CallState } from '@cloudcall/core';
import type { Workbench } from '../use-workbench';
import {
  callStateLabel,
  directionLabel,
  endReasonLabel,
  formatClock,
  formatDuration,
} from '../format';

const outbound: CallState[] = [
  'connecting',
  'ringing',
  'active',
  'holding',
  'reconnecting',
  'ended',
];
const inbound: CallState[] = ['incoming', 'active', 'holding', 'ended'];

export function MachineView({ bench }: { bench: Workbench }) {
  const subject = bench.active ?? bench.latest;
  return (
    <div className="page">
      <header className="page-intro">
        <h2>状态机</h2>
        <p>高亮来自当前会话快照。可接受事件读取自 Core 的迁移表，不会在界面里另写一套状态。</p>
      </header>
      {subject ? (
        <MachineDetail subject={subject} now={bench.now} live={Boolean(bench.active)} />
      ) : (
        <Empty />
      )}
    </div>
  );
}

export function MachineDetail({
  subject,
  now,
  live,
}: {
  subject: CallSnapshot;
  now: number;
  live: boolean;
}) {
  const track = subject.direction === 'inbound' ? inbound : outbound;
  return (
    <div className="machine">
      <p className="kicker">{live ? '当前会话' : '最近一次会话'}</p>
      <ol className="rail" aria-label="状态轨道">
        {track.map((state) => (
          <li key={state} data-current={state === subject.state ? 'true' : 'false'}>
            <span>{callStateLabel[state]}</span>
            <small>{state}</small>
          </li>
        ))}
      </ol>
      <dl className="facts">
        <div>
          <dt>号码</dt>
          <dd>{subject.phoneNumber}</dd>
        </div>
        <div>
          <dt>方向</dt>
          <dd>{directionLabel[subject.direction]}</dd>
        </div>
        <div>
          <dt>状态</dt>
          <dd>
            <StatusBadge state={subject.state} />
          </dd>
        </div>
        <div>
          <dt>修订</dt>
          <dd>{subject.revision}</dd>
        </div>
        <div>
          <dt>静音</dt>
          <dd>{subject.muted ? '是' : '否'}</dd>
        </div>
        <div>
          <dt>开始</dt>
          <dd>{formatClock(subject.startedAt)}</dd>
        </div>
        <div>
          <dt>接通</dt>
          <dd>{subject.connectedAt ? formatClock(subject.connectedAt) : '—'}</dd>
        </div>
        <div>
          <dt>时长</dt>
          <dd>
            {subject.connectedAt
              ? formatDuration((subject.endedAt ?? now) - subject.connectedAt)
              : '—'}
          </dd>
        </div>
        <div>
          <dt>结束原因</dt>
          <dd>{subject.endReason ? endReasonLabel[subject.endReason] : '—'}</dd>
        </div>
        <div>
          <dt>会话 ID</dt>
          <dd className="mono">{subject.id}</dd>
        </div>
      </dl>
      <h3>当前可接受事件</h3>
      {acceptedEvents(subject.state).length === 0 ? (
        <p className="muted">终态，不再接受事件。</p>
      ) : (
        <ul className="chips">
          {acceptedEvents(subject.state).map((event) => (
            <li key={event}>{event}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Empty() {
  return <p className="empty">还没有会话。从软电话拨出，或在检查器的调试页模拟呼入。</p>;
}
