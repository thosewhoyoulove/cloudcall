import { useEffect, useState, type CSSProperties } from 'react';
import { StatusBadge, CallControls, QualityMeter } from '@cloudcall/ui';
import type { Workbench } from '../use-workbench';
import {
  PAD,
  callStateLabel,
  directionLabel,
  endReasonLabel,
  formatDuration,
  lookupCaller,
  sdkStateLabel,
} from '../format';
import { Icon } from '../icons';

const BARS = [7, 12, 9, 16, 11, 18, 8, 14, 10, 17, 12, 7];

export function Softphone({ bench }: { bench: Workbench }) {
  const { active, handle, latest, state, now } = bench;
  const [transferTo, setTransferTo] = useState('');
  const [dtmf, setDtmf] = useState<string | null>(null);
  useEffect(() => {
    if (!dtmf) return;
    const timer = window.setTimeout(() => setDtmf(null), 900);
    return () => window.clearTimeout(timer);
  }, [dtmf]);
  const terminal = latest && (latest.state === 'ended' || latest.state === 'failed');
  const tone = active
    ? active.state === 'incoming'
      ? 'incoming'
      : active.state === 'active'
        ? 'active'
        : active.state === 'holding'
          ? 'holding'
          : active.state === 'failed'
            ? 'failed'
            : 'outbound'
    : 'idle';
  const padMode =
    active && (active.state === 'active' || active.state === 'holding')
      ? 'dtmf'
      : active
        ? 'locked'
        : 'dial';
  const headline = active ? callStateLabel[active.state] : sdkStateLabel[state];
  const duration =
    active?.connectedAt !== undefined ? formatDuration(now - active.connectedAt) : null;
  const level = !active
    ? 'idle'
    : active.state === 'active' && !active.muted
      ? 'live'
      : active.muted
        ? 'muted'
        : active.state === 'holding'
          ? 'held'
          : 'wait';
  const hint = dtmf
    ? `已发送 DTMF ${dtmf}`
    : state !== 'ready'
      ? sdkStateLabel[state]
      : padMode === 'dtmf'
        ? '按键作为 DTMF 发送 · M 静音 · H 保持'
        : padMode === 'locked'
          ? active?.state === 'incoming'
            ? 'A 接听 · R 拒接'
            : active?.state === 'reconnecting'
              ? '媒体重连中，可挂断。信令断开不会自动恢复通话'
              : '正在呼叫，可以挂断'
          : 'Enter 拨打 · Backspace 删除 · M 静音 · H 保持 · K 挂断 · B 录音';

  return (
    <div className="soft-layout">
      <section className="phone" data-tone={tone} aria-label="软电话">
        <div className="phone-status" aria-live="polite">
          <i className="tone-dot" data-tone={tone} />
          <span>{headline}</span>
          {active ? <StatusBadge state={active.state} /> : null}
          {active && (active.state === 'active' || active.state === 'holding') ? (
            <QualityMeter quality={bench.quality} />
          ) : null}
          {duration ? <time>{duration}</time> : null}
        </div>

        {bench.screenPop ? (
          <div className="screen-pop" role="status">
            <div>
              <span>CRM 弹屏 · {bench.screenPop.direction === 'inbound' ? '呼入' : '呼出'}</span>
              <strong>{lookupCaller(bench.screenPop.phoneNumber)?.name ?? '未匹配客户'}</strong>
              <small>
                {bench.screenPop.phoneNumber}
                {lookupCaller(bench.screenPop.phoneNumber)
                  ? ` · ${lookupCaller(bench.screenPop.phoneNumber)?.account}`
                  : ' · 宿主可在 screenPop 钩子里打开 CRM'}
              </small>
            </div>
            <button type="button" onClick={bench.dismissScreenPop}>
              关闭
            </button>
          </div>
        ) : null}

        {!active && terminal && latest ? (
          <div className="outcome">
            <span>
              {directionLabel[latest.direction]} {latest.phoneNumber}
            </span>
            <StatusBadge state={latest.state} />
            <span className="muted">
              {latest.endReason ? endReasonLabel[latest.endReason] : callStateLabel[latest.state]}
            </span>
          </div>
        ) : null}

        <div className="readout">
          <span>{active ? directionLabel[active.direction] : '号码'}</span>
          <input
            aria-label="电话号码"
            inputMode="tel"
            autoComplete="off"
            readOnly={Boolean(active)}
            value={active ? active.phoneNumber : bench.number}
            onChange={(event) =>
              bench.setNumber(event.target.value.replace(/[^\d*#+]/g, '').slice(0, 20))
            }
          />
          {!active ? (
            <button
              type="button"
              className="icon-btn"
              aria-label="删除一位"
              onMouseDown={(event) => event.preventDefault()}
              onClick={bench.backspace}
            >
              <Icon name="backspace" />
            </button>
          ) : null}
        </div>

        <div className={`level level-${level}`} aria-hidden="true">
          {level === 'idle'
            ? null
            : BARS.map((height, index) => (
                <span
                  key={index}
                  style={{ '--h': `${height}px`, '--i': String(index) } as CSSProperties}
                />
              ))}
        </div>
        <span className="sr-only">
          {level === 'live'
            ? '音频活动'
            : level === 'muted'
              ? '麦克风已静音'
              : level === 'held'
                ? '通话保持，音频暂停'
                : '无音频'}
        </span>

        <div
          className="pad"
          role="group"
          aria-label={padMode === 'dtmf' ? 'DTMF 拨号盘' : '拨号盘'}
        >
          {PAD.map((key) => (
            <button
              key={key.digit}
              type="button"
              className="key"
              disabled={padMode === 'locked' || (padMode === 'dial' && state !== 'ready')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                void bench
                  .pressDigit(key.digit)
                  .then(() => {
                    if (padMode === 'dtmf') setDtmf(key.digit);
                  })
                  .catch(() => {});
              }}
            >
              <b>{key.digit}</b>
              <small>{key.letters}</small>
            </button>
          ))}
        </div>

        {active && handle ? (
          <CallControls call={handle} snapshot={active} onError={bench.reportError} />
        ) : (
          <button
            type="button"
            className="btn-dial"
            disabled={state !== 'ready' || !bench.registered}
            onClick={() => void bench.dial()}
          >
            拨打电话
          </button>
        )}

        {active && (active.state === 'active' || active.state === 'holding') ? (
          <form
            className="transfer"
            onSubmit={(event) => {
              event.preventDefault();
              void bench
                .transfer(transferTo)
                .then(() => setTransferTo(''))
                .catch(() => {});
            }}
          >
            <input
              aria-label="转接号码"
              inputMode="tel"
              placeholder="盲转号码"
              value={transferTo}
              onChange={(event) =>
                setTransferTo(event.target.value.replace(/[^\d*#+]/g, '').slice(0, 20))
              }
            />
            <button type="submit">转接</button>
          </form>
        ) : null}

        <p className="hint">{hint}</p>
        {active && (active.state === 'active' || active.state === 'holding') ? (
          <p className="hint">
            {bench.realCalls
              ? '盲转在 PBX 接受 SIP REFER 后结束本通，不表示目标已经接听。录音按钮调用宿主钩子，不在浏览器里存音频。'
              : '演示转接会在命令成功后结束本通。录音钩子只记录开始和停止，不采集音频。'}
          </p>
        ) : null}
      </section>

      <aside className="recent">
        <h2>最近会话</h2>
        {bench.calls.length === 0 ? (
          <p className="empty">拨出或模拟呼入后，会话会出现在这里。</p>
        ) : (
          <ul>
            {[...bench.calls]
              .reverse()
              .slice(0, 6)
              .map((call) => (
                <li key={call.id}>
                  <span>
                    <b>{call.phoneNumber}</b>
                    <small>
                      {directionLabel[call.direction]}
                      {call.connectedAt
                        ? ` · ${formatDuration((call.endedAt ?? now) - call.connectedAt)}`
                        : ''}
                    </small>
                  </span>
                  <StatusBadge state={call.state} />
                </li>
              ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
