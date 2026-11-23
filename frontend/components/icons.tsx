import type { ProjectKind } from '../lib/api';

/**
 * The one icon set: 24px grid, 1.5px stroke, round caps, currentColor. Every icon is
 * decoration next to a text label or inside a labelled button, so each is aria-hidden.
 */
const PATHS = {
  house: (
    <>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9v11h13V9" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
  car: (
    <>
      <path d="M5 16.5V12l1.8-4.6A2 2 0 0 1 8.7 6h6.6a2 2 0 0 1 1.9 1.4L19 12v4.5" />
      <path d="M3.5 12.5h17v4h-17z" />
      <path d="M6.5 16.5v2M17.5 16.5v2" />
    </>
  ),
  family: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9.5" r="2.25" />
      <path d="M3.5 19.5c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" />
      <path d="M15.5 14.3c2.7.2 5 2.2 5 5.2" />
    </>
  ),
  admin: (
    <>
      <path d="M7 3.5h7l4.5 4.5v12.5H7z" />
      <path d="M14 3.5V8h4.5" />
      <path d="M10 12.5h5.5M10 16h5.5" />
    </>
  ),
  networking: <path d="M6 4h3l1.5 4-2 1.3a10 10 0 0 0 6.2 6.2l1.3-2 4 1.5v3A2 2 0 0 1 18 20 14 14 0 0 1 4 6a2 2 0 0 1 2-2z" />,
  other: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" />
    </>
  ),
  open: <circle cx="12" cy="12" r="8.5" />,
  waiting: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  done: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.2l2.4 2.4 4.6-4.8" />
    </>
  ),
  overview: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </>
  ),
  contact: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.8-3.6 3.6-6 7-6s6.2 2.4 7 6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  place: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  repeat: (
    <>
      <path d="M17 3.5l2.5 2.5L17 8.5" />
      <path d="M4.5 11.5V10a4 4 0 0 1 4-4h11" />
      <path d="M7 20.5 4.5 18 7 15.5" />
      <path d="M19.5 12.5V14a4 4 0 0 1-4 4h-11" />
    </>
  ),
  cost: (
    <>
      <path d="M3.5 12.5V4.5h8l9 9-8 8z" />
      <circle cx="8" cy="9" r="1.25" />
    </>
  ),
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l8.5-8.5M16.5 6.5l2.5 2.5M14 9l2 2" />
    </>
  ),
  chevronRight: <path d="M9.5 6l6 6-6 6" />,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  notes: <path d="M5 6.5h14M5 11.5h14M5 16.5h9" />,
  phone: <path d="M6 4h3l1.5 4-2 1.3a10 10 0 0 0 6.2 6.2l1.3-2 4 1.5v3A2 2 0 0 1 18 20 14 14 0 0 1 4 6a2 2 0 0 1 2-2z" />,
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  pencil: <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, strokeWidth = 1.5, className }: { name: IconName; size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className ?? ''}`}
    >
      {PATHS[name]}
    </svg>
  );
}

const KIND_ICONS: Record<ProjectKind, IconName> = {
  house: 'house',
  car: 'car',
  family: 'family',
  admin: 'admin',
  networking: 'networking',
  other: 'other',
};

export function KindIcon({ kind, size, className }: { kind: ProjectKind; size?: number; className?: string }) {
  return <Icon name={KIND_ICONS[kind]} size={size} className={className} />;
}

export const KIND_LABELS: Record<ProjectKind, string> = {
  house: 'House',
  car: 'Car',
  family: 'Family',
  admin: 'Life admin',
  networking: 'People',
  other: 'Other',
};
