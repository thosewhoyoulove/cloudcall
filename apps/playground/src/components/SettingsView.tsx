import type { Workbench } from '../use-workbench';

export function SettingsView({
  bench,
  theme,
  onTheme,
  onRecreate,
}: {
  bench: Workbench;
  theme: 'dark' | 'light';
  onTheme: (theme: 'dark' | 'light') => void;
  onRecreate: () => void;
}) {
  return (
    <div className="page">
      <header className="page-intro">
        <h2>设置</h2>
        <p>
          {bench.realCalls
            ? '真实通话模式。分机配置由登录后的服务端提供。设备选择从下一通电话开始生效。'
            : 'Mock 列出演示设备，方便走通选择流程。它们不会打开本机麦克风。'}
        </p>
      </header>
      <div className="settings-list">
        <div className="field">
          <span>
            外观
            <small>默认深色。选择会记在这台浏览器里。</small>
          </span>
          <div className="segmented" role="group" aria-label="主题">
            <button type="button" aria-pressed={theme === 'dark'} onClick={() => onTheme('dark')}>
              深色
            </button>
            <button type="button" aria-pressed={theme === 'light'} onClick={() => onTheme('light')}>
              浅色
            </button>
          </div>
        </div>
        <DeviceField
          label="麦克风"
          hint="下一通通话使用。真实模式需要浏览器授权后才会显示设备名。"
          devices={bench.devices.filter((device) => device.kind === 'audioinput')}
          value={bench.inputDevice}
          onChange={(deviceId) => void bench.chooseInput(deviceId)}
        />
        <DeviceField
          label="扬声器"
          hint="已接通的真实通话会立即切换输出。Mock 只记住选择。"
          devices={bench.devices.filter((device) => device.kind === 'audiooutput')}
          value={bench.outputDevice}
          onChange={(deviceId) => void bench.chooseOutput(deviceId)}
        />
        <div className="field">
          <span>
            实例
            <small>
              {bench.state === 'destroyed'
                ? '当前实例已销毁，创建新实例后重新连接。'
                : bench.state === 'failed'
                  ? '初始化失败后可以重试。若仍处于离线，重试会再次失败。'
                  : `当前状态 ${bench.state}。销毁是终态。`}
            </small>
          </span>
          <span className="field-control">
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
          </span>
        </div>
      </div>
      <h3>键盘</h3>
      <dl className="shortcuts">
        <div>
          <dt>Enter</dt>
          <dd>拨打当前号码</dd>
        </div>
        <div>
          <dt>0–9 * #</dt>
          <dd>空闲时输入号码，通话中发送 DTMF</dd>
        </div>
        <div>
          <dt>Backspace</dt>
          <dd>删除一位号码</dd>
        </div>
        <div>
          <dt>M</dt>
          <dd>静音或取消静音</dd>
        </div>
        <div>
          <dt>H</dt>
          <dd>保持或恢复</dd>
        </div>
        <div>
          <dt>A / R</dt>
          <dd>接听或拒接来电</dd>
        </div>
        <div>
          <dt>K</dt>
          <dd>挂断当前通话</dd>
        </div>
        <div>
          <dt>B</dt>
          <dd>开始或停止录音钩子</dd>
        </div>
        <div>
          <dt>Esc</dt>
          <dd>收起检查器</dd>
        </div>
      </dl>
      <p className="muted">
        焦点在输入框里时，这些快捷键不会抢走按键。系统开启减少动态效果后，波形停止动画。
      </p>
    </div>
  );
}

function DeviceField({
  label,
  hint,
  devices,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  devices: { deviceId: string; label: string }[];
  value: string;
  onChange: (deviceId: string) => void;
}) {
  return (
    <label className="field">
      <span>
        {label}
        <small>{hint}</small>
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={devices.length === 0}
      >
        <option value="">{devices.length === 0 ? '没有可用设备' : '默认设备'}</option>
        {devices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || device.deviceId}
          </option>
        ))}
      </select>
    </label>
  );
}
