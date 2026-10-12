import type { NavId } from '../nav';
import { NAV } from '../nav';
import { Icon } from '../icons';

export function Sidebar({
  view,
  onView,
  realCalls = false,
}: {
  view: NavId;
  onView: (view: NavId) => void;
  realCalls?: boolean;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="mark" aria-hidden="true">
          CC
        </span>
        <div>
          <strong>CloudCall Console</strong>
          <span>开发者工作台</span>
        </div>
      </div>
      <nav className="nav-list" aria-label="主导航">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={view === item.id ? 'nav is-active' : 'nav'}
            aria-current={view === item.id ? 'page' : undefined}
            onClick={() => onView(item.id)}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <p className="side-foot">{realCalls ? 'SIP 信令 · WebRTC 音频' : 'Mock 信令 · Mock 媒体'}</p>
    </aside>
  );
}
