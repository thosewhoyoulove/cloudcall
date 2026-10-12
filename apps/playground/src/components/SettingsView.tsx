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
            ? '真实通话模式。分机配置由登录后的服务端提供。'
            : '外观和实例操作。媒体设备枚举不属于 Mock Adapter，这里不会列出虚构的麦克风。'}
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
