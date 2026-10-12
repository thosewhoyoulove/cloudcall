import type { Workbench } from '../use-workbench';
import { sdkStateLabel } from '../format';

export function NetworkView({ bench }: { bench: Workbench }) {
  if (bench.realCalls)
    return (
      <div className="page">
        <header className="page-intro">
          <h2>网络</h2>
          <p>真实 SIP / WebRTC 通话连接</p>
        </header>
        <p role="status">分机：{bench.registered ? '已注册' : '未注册，请重新连接'}</p>
        <p>当前音频会话：{bench.media.activeStreams}</p>
        <p>跨网络通话需要可用的 TURN 服务。连接失败原因会显示在页面提示中。</p>
      </div>
    );
  const offline = bench.faults.offline;
  const connected = bench.state === 'ready' && !offline;
  return (
    <div className="page">
      <header className="page-intro">
        <h2>网络</h2>
        <p>
          这些开关写进 Mock Transport 和 Mock
          Media。它们改变下一次真实指令的结果，而不是只改界面文案。
        </p>
      </header>
      <section className="statline" aria-label="连接状态">
        <div>
          <strong>{connected ? '可用' : offline ? '离线' : sdkStateLabel[bench.state]}</strong>
          <span>信令</span>
        </div>
        <div>
          <strong>{bench.faults.latencyMs} ms</strong>
          <span>注入延迟</span>
        </div>
        <div>
          <strong>{bench.diagnostics.seenMessages}</strong>
          <span>已见消息</span>
        </div>
        <div>
          <strong>{bench.permissionDenied ? '拒绝' : '允许'}</strong>
          <span>麦克风</span>
        </div>
      </section>

      <div className="settings-list">
        <label className="field">
          <span>
            信令延迟
            <small>影响拨号后振铃和接通的等待时间</small>
          </span>
          <span className="field-control">
            <input
              aria-label="信令延迟"
              type="range"
              min={0}
              max={3000}
              step={50}
              value={bench.faults.latencyMs}
              onChange={(event) => bench.patchFaults({ latencyMs: Number(event.target.value) })}
            />
            <output>{bench.faults.latencyMs} ms</output>
          </span>
        </label>
        <Switch
          label="重复消息"
          hint="同一条 call-event 投递两次，SDK 应按 messageId 去重"
          checked={bench.faults.duplicate}
          onChange={(value) => bench.patchFaults({ duplicate: value })}
        />
        <Switch
          label="消息乱序"
          hint="先投递 REMOTE_ACCEPTED，再投递序号更小的 REMOTE_RINGING"
          checked={bench.faults.outOfOrder}
          onChange={(value) => bench.patchFaults({ outOfOrder: value })}
        />
        <Switch
          label="网络离线"
          hint="connect 与 send 都会失败"
          checked={bench.faults.offline}
          onChange={(value) => bench.patchFaults({ offline: value })}
        />
        <Switch
          label="拒绝麦克风"
          hint="接通时 Mock Media 抛出 NotAllowedError，会话进入 failed"
          checked={bench.permissionDenied}
          onChange={bench.setMicDenied}
        />
        <div className="field">
          <span>
            下一条指令失败
            <small>只生效一次，然后自动恢复</small>
          </span>
          <button type="button" className="btn-quiet" onClick={bench.failNext}>
            注入失败
          </button>
        </div>
      </div>
    </div>
  );
}

function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="field">
      <span>
        {label}
        <small>{hint}</small>
      </span>
      <input
        className="toggle"
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
