import type { ReactNode } from "react";

/**
 * Monochrome line icons in the spirit of SF Symbols: 20x20 grid, 1.5px stroke, currentColor.
 * Icons are decorative; the button that holds one carries the accessible name (aria-label) and the tooltip (title).
 */
const PATHS: Record<string, ReactNode> = {
  // Documents and places
  doc: <><path d="M5.5 2.5h6l4 4v11a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1z" /><path d="M11.5 2.5v4h4" /></>,
  folder: <path d="M2.5 5.5a1 1 0 0 1 1-1h4l2 2h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" />,
  plus: <path d="M10 4v12M4 10h12" />,
  close: <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />,
  check: <path d="M4.5 10.5l3.5 3.5 7.5-8" />,
  // Toolbar
  master: <><rect x="3" y="8" width="14" height="9" rx="1.5" /><path d="M5 5.5h10M7 3h6" /></>,
  note: <><path d="M10 4.5H5A1.5 1.5 0 0 0 3.5 6v9A1.5 1.5 0 0 0 5 16.5h9a1.5 1.5 0 0 0 1.5-1.5v-5" /><path d="M14.5 3.5l2 2-7 7H7.5v-2z" /></>,
  terminal: <><rect x="2.5" y="4" width="15" height="12" rx="2" /><path d="M6 8l2.5 2L6 12M10.5 12.5h3.5" /></>,
  help: <><circle cx="10" cy="10" r="7.5" /><path d="M7.8 8a2.2 2.2 0 1 1 3.2 2c-.7.4-1 .8-1 1.5" /><circle cx="10" cy="14" r=".6" fill="currentColor" stroke="none" /></>,
  export: <><path d="M10 2.5v9M6.5 6l3.5-3.5L13.5 6" /><path d="M4.5 9.5v6A1.5 1.5 0 0 0 6 17h8a1.5 1.5 0 0 0 1.5-1.5v-6" /></>,
  // Console bar
  gear: <><circle cx="10" cy="10" r="2.5" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /></>,
  play: <path d="M6.5 4.5v11l9-5.5z" />,
  stop: <rect x="5" y="5" width="10" height="10" rx="1.5" />,
  restart: <><path d="M15.5 10a5.5 5.5 0 1 1-1.6-3.9" /><path d="M15.5 3.5v3.3h-3.3" /></>,
  // Inbox
  clip: <path d="M12.5 7.5l-5.5 5.5a2 2 0 0 0 2.8 2.8l6-6a3.5 3.5 0 0 0-5-5l-6 6" />,
  undo: <><path d="M7 5.5L3.5 9l3.5 3.5" /><path d="M3.5 9h8a4 4 0 0 1 0 8H8" /></>,
  // Slide layouts
  layoutText: <path d="M3.5 5h13M3.5 8.5h9M3.5 12h13M3.5 15.5h9" />,
  layout2col: <><rect x="2.5" y="4" width="15" height="12" rx="2" /><path d="M10 4v12" /></>,
  layoutImage: <><rect x="2.5" y="4" width="15" height="12" rx="2" /><circle cx="7" cy="8" r="1.3" /><path d="M17.5 13l-4-4-6 6" /></>,
};

export type IconName = keyof typeof PATHS;
export const ICON_NAMES = Object.keys(PATHS) as IconName[];

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const body = PATHS[name];
  if (!body) return null;
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-icon={name}>
      {body}
    </svg>
  );
}
