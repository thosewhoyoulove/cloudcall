export const NAV = [
  { id: 'overview', label: '总览', icon: 'overview' },
  { id: 'softphone', label: '软电话', icon: 'phone' },
  { id: 'sessions', label: '通话会话', icon: 'sessions' },
  { id: 'inspector', label: 'SDK 检查器', icon: 'inspector' },
  { id: 'logs', label: '事件日志', icon: 'logs' },
  { id: 'network', label: '网络', icon: 'network' },
  { id: 'settings', label: '设置', icon: 'settings' },
] as const;

export type NavId = (typeof NAV)[number]['id'];

export const INSPECTOR_TABS = [
  { id: 'lifecycle', label: '生命周期' },
  { id: 'machine', label: '状态机' },
  { id: 'signaling', label: '信令' },
  { id: 'connection', label: '连接' },
  { id: 'timeline', label: '时间线' },
  { id: 'debug', label: '调试' },
] as const;

export type InspectorTab = (typeof INSPECTOR_TABS)[number]['id'];

export const VIEW_TITLE: Record<NavId, string> = {
  overview: '总览',
  softphone: '软电话',
  sessions: '通话会话',
  inspector: 'SDK 检查器',
  logs: '事件日志',
  network: '网络',
  settings: '设置',
};
