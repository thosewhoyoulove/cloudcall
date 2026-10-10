import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'overview'
  | 'phone'
  | 'sessions'
  | 'inspector'
  | 'logs'
  | 'network'
  | 'settings'
  | 'sun'
  | 'moon'
  | 'panel'
  | 'close'
  | 'backspace'
  | 'search'
  | 'phone-in'
  | 'phone-out';

const paths: Record<IconName, ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  phone: (
    <path d="M8 3.5h2.2l1.2 3-1.6 1a12 12 0 0 0 5.7 5.7l1-1.6 3 1.2V15a2 2 0 0 1-2.2 2A14.5 14.5 0 0 1 6 5.7 2 2 0 0 1 8 3.5Z" />
  ),
  sessions: (
    <>
      <path d="M8 6h12" />
      <path d="M8 12h12" />
      <path d="M8 18h12" />
      <path d="M4 6h.01" />
      <path d="M4 12h.01" />
      <path d="M4 18h.01" />
    </>
  ),
  inspector: (
    <>
      <path d="M8 8 4 12l4 4" />
      <path d="m16 8 4 4-4 4" />
      <path d="m13 5-2 14" />
    </>
  ),
  logs: (
    <>
      <path d="M6 4h9l4 4v12H6V4Z" />
      <path d="M14 4v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </>
  ),
  network: (
    <>
      <path d="M5 12.5a10 10 0 0 1 14 0" />
      <path d="M8.2 15.2a5.5 5.5 0 0 1 7.6 0" />
      <path d="M12 19h.01" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3V20.5M4.8 6.8l1.6 1.6M17.6 15.6l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.8 17.2l1.6-1.6M17.6 8.4l1.6-1.6" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M16 13.5A6.5 6.5 0 0 1 10.2 4 6.2 6.2 0 1 0 16 16.2c.2-.8.2-1.7 0-2.7Z" />,
  panel: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M14 4.5v15" />
    </>
  ),
  close: (
    <>
      <path d="M7 7l10 10" />
      <path d="M17 7 7 17" />
    </>
  ),
  backspace: (
    <>
      <path d="M8.5 6.5h9.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8.5L4 12l4.5-5.5Z" />
      <path d="m11 10 4 4" />
      <path d="m15 10-4 4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m15.5 15.5 3.5 3.5" />
    </>
  ),
  'phone-in': (
    <>
      <path d="M8 4h2l1 2.5-1.4.8a8 8 0 0 0 3.1 3.1l.8-1.4L16.5 10v2a1.5 1.5 0 0 1-1.6 1.5A10 10 0 0 1 6.5 5.6 1.5 1.5 0 0 1 8 4Z" />
      <path d="M15 4v4h4" />
      <path d="M19 4l-4 4" />
    </>
  ),
  'phone-out': (
    <>
      <path d="M8 4h2l1 2.5-1.4.8a8 8 0 0 0 3.1 3.1l.8-1.4L16.5 10v2a1.5 1.5 0 0 1-1.6 1.5A10 10 0 0 1 6.5 5.6 1.5 1.5 0 0 1 8 4Z" />
      <path d="M15 8V4h4" />
      <path d="M15 4l4 4" />
    </>
  ),
};

export function Icon({
  name,
  size = 16,
  ...props
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
