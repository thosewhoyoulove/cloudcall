import { useEffect, useState } from 'react';
import type { NavId, InspectorTab } from './nav';
import { VIEW_TITLE } from './nav';
import { isTypingTarget, presenceLabel, sdkStateLabel } from './format';
import { Icon } from './icons';
import { useWorkbench } from './use-workbench';
import { Sidebar } from './components/Sidebar';
import { Inspector } from './components/Inspector';
import { Softphone } from './components/Softphone';
import { Overview } from './components/Overview';
import { Sessions } from './components/Sessions';
import { LogsView } from './components/LogsView';
import { NetworkView } from './components/NetworkView';
import { SettingsView } from './components/SettingsView';
import { MachineView } from './components/MachineView';
import { Login } from './components/Login';
import { realCalls } from './runtime';

type Theme = 'dark' | 'light';

export function App() {
  const [epoch, setEpoch] = useState(0);
  const shell = <Shell key={epoch} onRecreate={() => setEpoch((value) => value + 1)} />;
  return realCalls ? <Login>{shell}</Login> : shell;
}

function Shell({ onRecreate }: { onRecreate: () => void }) {
  const [view, setView] = useState<NavId>('softphone');
  const [tab, setTab] = useState<InspectorTab>('lifecycle');
  const [inspectorOpen, setInspectorOpen] = useState(
    () => window.matchMedia('(min-width: 1100px)').matches,
  );
  const [theme, setTheme] = useState<Theme>(() =>
    localStorage.getItem('cloudcall-theme') === 'light' ? 'light' : 'dark',
  );
  const bench = useWorkbench();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('cloudcall-theme', theme);
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1099px)');
    const closeOnNarrow = () => {
      if (media.matches) setInspectorOpen(false);
    };
    media.addEventListener('change', closeOnNarrow);
    return () => media.removeEventListener('change', closeOnNarrow);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setInspectorOpen(false);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target) || view !== 'softphone') return;
      if (/^[0-9*#]$/.test(event.key)) {
        event.preventDefault();
        void bench.pressDigit(event.key).catch(() => {});
        return;
      }
      if (event.key === 'Backspace') {
        bench.backspace();
        return;
      }
      if (event.key === 'Enter' && !bench.active) {
        event.preventDefault();
        void bench.dial();
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'm') void bench.toggleMute();
      if (key === 'h') void bench.toggleHold();
      if (key === 'a') void bench.acceptIncoming();
      if (key === 'r') void bench.rejectIncoming();
      if (key === 'k') void bench.hangupActive();
      if (key === 'b') void bench.toggleRecording();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bench, view]);

  return (
    <div className="shell" data-inspector={inspectorOpen ? 'open' : 'closed'}>
      <Sidebar view={view} onView={setView} realCalls={bench.realCalls} />
      <div className="workspace">
        <header className="topbar">
          <div className="top-title">
            <p className="product">CloudCall Console</p>
            <h1>{VIEW_TITLE[view]}</h1>
          </div>
          <div className="top-actions">
            <label className="agent-select">
              <span className="sr-only">座席意图</span>
              <select
                aria-label="座席意图"
                value={bench.desiredPresence}
                disabled={bench.state !== 'ready'}
                onChange={(event) =>
                  bench.setDesiredPresence(event.target.value === 'away' ? 'away' : 'available')
                }
              >
                <option value="available">可接听</option>
                <option value="away">离开</option>
              </select>
            </label>
            <span
              className={`presence presence-${bench.presence === 'available' ? 'live' : bench.presence === 'offline' ? 'down' : 'wait'}`}
            >
              <i />
              {presenceLabel[bench.presence]}
              <code>{sdkStateLabel[bench.state]}</code>
            </span>
            <button
              type="button"
              className="icon-btn"
              aria-label={theme === 'dark' ? '切换为浅色主题' : '切换为深色主题'}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-pressed={inspectorOpen}
              aria-label={inspectorOpen ? '收起检查器' : '展开检查器'}
              onClick={() => setInspectorOpen((open) => !open)}
            >
              <Icon name="panel" />
            </button>
          </div>
        </header>
        <div className="canvas">
          {!bench.realCalls && (
            <div className="banner banner-quiet" role="status">
              Mock 演示模式。拨号、转接、录音钩子和质量采样都在本地完成，不连接 PBX。
            </div>
          )}
          {bench.realCalls && (
            <div className="banner" role="status">
              {bench.registration === 'registered'
                ? '真实 SIP 模式 · 分机已注册'
                : bench.registration === 'connecting'
                  ? '真实 SIP 模式 · 正在注册分机'
                  : '真实 SIP 模式 · 信令已断开，当前通话不会自动恢复'}
              <button type="button" onClick={() => void bench.resumeAudio()}>
                播放通话声音
              </button>
              {!bench.registered && bench.state === 'ready' && (
                <button type="button" onClick={onRecreate}>
                  重新连接
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  void bench
                    .destroySdk()
                    .then(() => fetch('/api/logout', { method: 'POST' }))
                    .then((response) => {
                      if (!response.ok) throw new Error('退出登录失败');
                      window.location.reload();
                    })
                    .catch(bench.reportError);
                }}
              >
                退出登录
              </button>
            </div>
          )}
          {bench.faults.offline ? (
            <div className="banner" role="status">
              信令已标记为离线。后续 connect 和 send 会被 Mock Transport 拒绝。
            </div>
          ) : null}
          {bench.state === 'failed' ? (
            <div className="banner banner-danger" role="alert">
              SDK 初始化失败。
              <button type="button" onClick={bench.retryInit}>
                重试
              </button>
            </div>
          ) : null}
          {bench.state === 'destroyed' ? (
            <div className="banner" role="status">
              实例已销毁，不能再次初始化。
              <button type="button" onClick={onRecreate}>
                创建新实例
              </button>
            </div>
          ) : null}
          {bench.error ? (
            <div className="banner banner-danger" role="alert">
              <span>{bench.error}</span>
              <button type="button" onClick={bench.dismissError} aria-label="关闭错误">
                关闭
              </button>
            </div>
          ) : null}

          {view === 'overview' && <Overview bench={bench} onOpen={setView} />}
          {view === 'softphone' && <Softphone bench={bench} />}
          {view === 'sessions' && (
            <Sessions
              bench={bench}
              onRedial={(phoneNumber) => {
                bench.setNumber(phoneNumber);
                setView('softphone');
              }}
            />
          )}
          {view === 'inspector' && <MachineView bench={bench} />}
          {view === 'logs' && <LogsView bench={bench} />}
          {view === 'network' && <NetworkView bench={bench} />}
          {view === 'settings' && (
            <SettingsView bench={bench} theme={theme} onTheme={setTheme} onRecreate={onRecreate} />
          )}
        </div>
      </div>
      <button
        type="button"
        className="scrim"
        aria-label="关闭检查器"
        tabIndex={-1}
        onClick={() => setInspectorOpen(false)}
      />
      <Inspector
        bench={bench}
        tab={tab}
        onTab={setTab}
        onClose={() => setInspectorOpen(false)}
        onRecreate={onRecreate}
      />
    </div>
  );
}
