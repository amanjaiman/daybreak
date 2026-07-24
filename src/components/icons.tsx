const base = {
  fill: "none",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  viewBox: "0 0 24 24",
} as const;

export const SunIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
  </svg>
);

export const NewsIcon = () => (
  <svg {...base}>
    <path d="M4 5h13v14H6a2 2 0 0 1-2-2V5Z" />
    <path d="M17 8h3v9a2 2 0 0 1-2 2M7 9h7M7 13h7M7 17h4" />
  </svg>
);

export const CheckCircleIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </svg>
);

export const BallIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v3.5M12 12l3.4 2.4M12 12 8.6 14.4M12 6.5l4.8-1.6M12 6.5 7.2 4.9M18.5 16l-3.1-1.6M5.5 16l3.1-1.6M9.5 20.6l2.5-4.1 2.5 4.1" />
  </svg>
);

export const MusicIcon = () => (
  <svg {...base}>
    <path d="M9 18V5l10-2v13" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </svg>
);

export const HoopIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3.5 9a15 15 0 0 1 17 0M3.5 15a15 15 0 0 0 17 0M12 3v18" />
  </svg>
);

export const TicketIcon = () => (
  <svg {...base}>
    <path d="M4 8a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4V8Z" />
    <path d="M14 6.5v2M14 11v2M14 15.5v2" />
  </svg>
);

export const BookIcon = () => (
  <svg {...base}>
    <path d="M12 6.5C10.6 5 8.6 4.5 6 4.5c-.8 0-1.5.1-2 .2V18c.5-.1 1.2-.2 2-.2 2.6 0 4.6.5 6 2 1.4-1.5 3.4-2 6-2 .8 0 1.5.1 2 .2V4.7c-.5-.1-1.2-.2-2-.2-2.6 0-4.6.5-6 2Z" />
    <path d="M12 6.5v13.3" />
  </svg>
);

export const ChartIcon = () => (
  <svg {...base}>
    <path d="M4 5v13a1 1 0 0 0 1 1h15" />
    <path d="m7 14 4-4.5 3.5 3L19 7" />
  </svg>
);

export const MoonIcon = () => (
  <svg {...base}>
    <path d="M20 13.5A8 8 0 0 1 10.5 4 8 8 0 1 0 20 13.5Z" />
  </svg>
);

export const RefreshIcon = () => (
  <svg {...base}>
    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path d="M20 3v4h-4" />
  </svg>
);

export const SparkleIcon = () => (
  <svg {...base}>
    <path d="M12 4c.6 3.8 2.2 5.4 6 6-3.8.6-5.4 2.2-6 6-.6-3.8-2.2-5.4-6-6 3.8-.6 5.4-2.2 6-6Z" />
    <path d="M19 15.5c.3 1.7 1 2.4 2.5 2.7-1.5.3-2.2 1-2.5 2.7-.3-1.7-1-2.4-2.5-2.7 1.5-.3 2.2-1 2.5-2.7ZM5.5 3.5c.25 1.4.85 2 2.25 2.25-1.4.25-2 .85-2.25 2.25-.25-1.4-.85-2-2.25-2.25 1.4-.25 2-.85 2.25-2.25Z" />
  </svg>
);

export const LockIcon = () => (
  <svg {...base}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

export const UnlockIcon = () => (
  <svg {...base}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 7.5-2" />
  </svg>
);

export const GridIcon = () => (
  <svg {...base}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </svg>
);

export const FlowIcon = () => (
  <svg {...base}>
    <path d="M5 6h14M5 10h14M5 14h9M5 18h6" />
  </svg>
);

export const GripIcon = () => (
  <svg viewBox="0 0 16 8" fill="currentColor" aria-hidden="true">
    <circle cx="2" cy="2" r="1.3" />
    <circle cx="8" cy="2" r="1.3" />
    <circle cx="14" cy="2" r="1.3" />
    <circle cx="2" cy="6" r="1.3" />
    <circle cx="8" cy="6" r="1.3" />
    <circle cx="14" cy="6" r="1.3" />
  </svg>
);

export const NoteIcon = () => (
  <svg {...base}>
    <path d="M5 4h14v11l-5 5H5V4Z" />
    <path d="M14 20v-5h5M8.5 9h7M8.5 13h4" />
  </svg>
);

export const TimerIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 13.5V9M9.5 2.5h5M18.5 6.5l1.5-1.5" />
  </svg>
);

export const MicIcon = () => (
  <svg {...base}>
    <rect x="9" y="3" width="6" height="10" rx="3" />
    <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
  </svg>
);

export const MagnifierIcon = () => (
  <svg {...base}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m15.8 15.8 4.7 4.7" />
  </svg>
);

export const SlidersIcon = () => (
  <svg {...base}>
    <path d="M5 5v4.5M5 13.5V19M12 5v1.5M12 10.5V19M19 5v7.5M19 16.5V19" />
    <path d="M3 11h4M10 8.5h4M17 14.5h4" />
  </svg>
);

export const CheckIcon = () => (
  <svg viewBox="0 0 12 12" fill="none" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="m2.5 6.5 2.5 2.5 4.5-6" />
  </svg>
);
