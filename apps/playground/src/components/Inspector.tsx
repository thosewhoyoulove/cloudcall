import type { InspectorTab } from '../nav';
import { INSPECTOR_TABS } from '../nav';
import type { Workbench } from '../use-workbench';
import { sdkStateLabel } from '../format';
import { Icon } from '../icons';
import { MachineDetail } from './MachineView';

export function Inspector({
  bench,
  tab,
  onTab,
  onClose,
  onRecreate,
}: {
  bench: Workbench;
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  onClose: () => void;
  onRecreate: () => void;
}) {
  const subject = bench.active ?? bench.latest;
  return (
    <aside className="inspector" aria-label="检查器">
      <div className="inspector-head">
        <strong>Inspector</strong>
        <button type="button" className="icon-btn" aria-label="收起检查器" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="tabs" role="tablist" aria-label="检查器分页">
        {INSPECTOR_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => onTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        className="inspector-body"
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {tab === 'lifecycle' && (
          <div className="inspector-stack">
            <dl className="facts facts-compact">
              <div>
                <dt>状态</dt>
                <dd>
                  {sdkStateLabel[bench.state]} <code>{bench.state}</code>
                </dd>
              </div>
              <div>
                <dt>会话</dt>
                <dd>{bench.diagnostics.calls}</dd>
              </div>
              <div>
                <dt>监听器</dt>
                <dd>{bench.diagnostics.listeners}</dd>
              </div>
              <div>
                <dt>已见消息</dt>
                <dd>{bench.diagnostics.seenMessages}</dd>
              </div>
            </dl>
            <h3>状态序列</h3>
            <LogSlice bench={bench} kind="lifecycle" empty="等待 sdk:state" />
          </div>
        )}
        {tab === 'machine' &&
          (subject ? (
            <MachineDetail subject={subject} now={bench.now} live={Boolean(bench.active)} />
          ) : (
            <p className="empty">没有会话快照。</p>
          ))}
        {tab === 'signaling' && (
          <div className="inspector-stack">
            {!bench.realCalls && (
              <p className="muted">
                延迟 {bench.faults.latencyMs} ms · 重复 {bench.faults.duplicate ? '开' : '关'} ·
                乱序 {bench.faults.outOfOrder ? '开' : '关'}
              </p>
            )}
            <LogSlice bench={bench} kind="signaling" empty="还没有信令事件" />
          </div>
        )}
        {tab === 'connection' && (
          <dl className="facts facts-compact">
            <div>
              <dt>SDK</dt>
              <dd>
                {sdkStateLabel[bench.state]} <code>{bench.state}</code>
              </dd>
            </div>
            <div>
              <dt>传输</dt>
              <dd>
                {bench.realCalls
                  ? bench.registered
                    ? '已注册'
                    : '未注册'
                  : bench.faults.offline
                    ? '离线'
                    : bench.state === 'ready'
                      ? '已连接'
                      : '未就绪'}
              </dd>
            </div>
            <div>
              <dt>媒体流</dt>
              <dd>{bench.media.activeStreams}</dd>
            </div>
            <div>
              <dt>静音流</dt>
              <dd>{bench.media.mutedStreams}</dd>
            </div>
            <div>
              <dt>麦克风</dt>
              <dd>
                {bench.realCalls
                  ? '由浏览器授权'
                  : bench.permissionDenied
                    ? '模拟拒绝'
                    : '模拟允许'}
              </dd>
            </div>
          </dl>
        )}
        {tab === 'timeline' && <LogSlice bench={bench} empty="时间线是空的" />}
        {tab === 'debug' && (
          <div className="debug-actions">
            <button
              type="button"
              className="btn-quiet"
              disabled={bench.realCalls || bench.state !== 'ready'}
              onClick={bench.simulateIncoming}
            >
              模拟呼入
            </button>
            <button
              type="button"
              className="btn-quiet"
              disabled={bench.realCalls}
              onClick={bench.failNext}
            >
              下一指令失败
            </button>
            <button
              type="button"
              className="btn-quiet"
              disabled={bench.realCalls || !bench.active}
              onClick={bench.remoteHangup}
            >
              模拟远端挂断
            </button>
            {bench.state === 'failed' ? (
              <button type="button" className="btn-quiet" onClick={bench.retryInit}>
                重试初始化
              </button>
            ) : null}
            {bench.state === 'destroyed' ? (
              <button type="button" className="btn-quiet" onClick={onRecreate}>
                创建新实例
              </button>
            ) : (
              <button type="button" className="btn-danger" onClick={bench.destroySdk}>
                销毁 SDK
              </button>
            )}
            <p className="muted">
              {bench.realCalls
                ? '真实模式不提供模拟故障。销毁后需创建新实例。'
                : '模拟呼入使用 Mock Transport。销毁后该实例不能复用。'}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

function LogSlice({
  bench,
  kind,
  empty,
}: {
  bench: Workbench;
  kind?: Workbench['logs'][number]['kind'];
  empty: string;
}) {
  const rows = bench.logs.filter((item) => (kind ? item.kind === kind : true)).slice(-40);
  if (rows.length === 0) return <p className="empty">{empty}</p>;
  return (
    <div className="mini-log" role="log">
      {rows.map((item) => (
        <div key={item.id} className="log-row" data-kind={item.kind}>
          <time>{item.time}</time>
          <em>{item.kind}</em>
          <span>{item.message}</span>
        </div>
      ))}
    </div>
  );
}
