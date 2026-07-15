import type { ReactElement } from "react";
import {
  BallIcon,
  BookIcon,
  ChartIcon,
  CheckCircleIcon,
  HoopIcon,
  MoonIcon,
  MusicIcon,
  NewsIcon,
  SunIcon,
  TicketIcon,
} from "./icons";

/**
 * Flat, monochrome icon set for generated widgets — so a generated card wears
 * the same line icons as the built-in cards instead of a colored emoji. The
 * generator returns an icon NAME (see netlify → supabase/functions/_shared/
 * generate.ts, which lists the exact same names); we map it to an SVG here.
 * Keep the name list in generate.ts in sync with the keys below.
 *
 * These render inside `.card__title`, which sizes them to 14px and strokes
 * them with var(--ink-3), so they match the built-ins automatically.
 */

// Same line style as components/icons.tsx (stroke comes from CSS).
const s = {
  fill: "none",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  viewBox: "0 0 24 24",
} as const;

const MoneyIcon = () => (
  <svg {...s}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v10" />
    <path d="M14.6 9.4a2.6 2 0 0 0-2.6-1.3c-1.5 0-2.6.8-2.6 1.9s1.1 1.5 2.6 1.8 2.6.8 2.6 1.9-1.1 1.9-2.6 1.9a2.6 2 0 0 1-2.6-1.3" />
  </svg>
);

const CalendarIcon = () => (
  <svg {...s}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 9.5h16M8 3v4M16 3v4" />
    <path d="M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" />
  </svg>
);

const ClockIcon = () => (
  <svg {...s}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3.2 2" />
  </svg>
);

const TrophyIcon = () => (
  <svg {...s}>
    <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
    <path d="M8 6H5.2a1.8 1.8 0 0 0 1.9 3M16 6h2.8a1.8 1.8 0 0 1-1.9 3" />
    <path d="M12 13v4M9.5 20h5M10.5 17h3" />
  </svg>
);

const VideoIcon = () => (
  <svg {...s}>
    <rect x="3" y="5" width="18" height="13" rx="2" />
    <path d="M10 9.3l4.2 2.7-4.2 2.7V9.3Z" />
    <path d="M9 21h6" />
  </svg>
);

const ListIcon = () => (
  <svg {...s}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
  </svg>
);

const BuildingIcon = () => (
  <svg {...s}>
    <path d="M3 20h18" />
    <path d="M4 11h16M12 3 4 8h16L12 3Z" />
    <path d="M6 20v-9M10 20v-9M14 20v-9M18 20v-9" />
  </svg>
);

const GlobeIcon = () => (
  <svg {...s}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3c2.6 2.5 2.6 15.5 0 18-2.6-2.5-2.6-15.5 0-18Z" />
  </svg>
);

const StarIcon = () => (
  <svg {...s}>
    <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L4.4 9.7l5.8-.8L12 3.6Z" />
  </svg>
);

const HeartIcon = () => (
  <svg {...s}>
    <path d="M12 20s-7-4.4-7-9.3A3.7 3.7 0 0 1 12 8a3.7 3.7 0 0 1 7 2.7C19 15.6 12 20 12 20Z" />
  </svg>
);

const FlameIcon = () => (
  <svg {...s}>
    <path d="M12 3c3 3 5 5.6 5 9a5 5 0 0 1-10 0c0-1.6.6-3 1.6-4.2.3 1.2 1.1 1.8 2 1.8 1.5 0 1.4-2 .4-3.4C11 5.6 11 4 12 3Z" />
  </svg>
);

const FoodIcon = () => (
  <svg {...s}>
    <path d="M7 3v5a2 2 0 0 0 4 0V3M9 8v13" />
    <path d="M16.5 3c-2 1-2 6 0 7v11" />
  </svg>
);

const PlaneIcon = () => (
  <svg {...s}>
    <path d="M21 4 3 11l6 2.5L21 4Z" />
    <path d="M9 13.5V20l3.6-3.9" />
  </svg>
);

const PinIcon = () => (
  <svg {...s}>
    <path d="M12 21s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10Z" />
    <circle cx="12" cy="11" r="2.2" />
  </svg>
);

const BellIcon = () => (
  <svg {...s}>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2.2H4.5L6 16Z" />
    <path d="M10 21a2 2 0 0 0 4 0" />
  </svg>
);

const GiftIcon = () => (
  <svg {...s}>
    <rect x="4" y="9" width="16" height="11" rx="1.5" />
    <path d="M3.5 9h17M12 9v11" />
    <path d="M12 9c-1.2-2.8-5-2.8-4 0M12 9c1.2-2.8 5-2.8 4 0" />
  </svg>
);

const DropletIcon = () => (
  <svg {...s}>
    <path d="M12 3c3 4 5.5 6.6 5.5 9.5a5.5 5.5 0 0 1-11 0C6.5 9.6 9 7 12 3Z" />
  </svg>
);

const LeafIcon = () => (
  <svg {...s}>
    <path d="M20 4C10 4 4 10 4 20c10 0 16-6 16-16Z" />
    <path d="M4 20C8 14 12 10 18 7" />
  </svg>
);

const CarIcon = () => (
  <svg {...s}>
    <path d="M3 13l2-4.5A2 2 0 0 1 6.8 7h10.4a2 2 0 0 1 1.8 1.5L21 13v4a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4Z" />
    <path d="M3 13h18" />
    <circle cx="7.5" cy="13.5" r="1.3" />
    <circle cx="16.5" cy="13.5" r="1.3" />
  </svg>
);

const CartIcon = () => (
  <svg {...s}>
    <circle cx="9" cy="20" r="1.4" />
    <circle cx="17" cy="20" r="1.4" />
    <path d="M3 4h2l2.4 11.4a1.5 1.5 0 0 0 1.5 1.2h7.6a1.5 1.5 0 0 0 1.5-1.2L21 8H6" />
  </svg>
);

const MailIcon = () => (
  <svg {...s}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M4 7.5l8 6 8-6" />
  </svg>
);

const FlagIcon = () => (
  <svg {...s}>
    <path d="M5 21V4M5 5h11l-2 3 2 3H5" />
  </svg>
);

const CodeIcon = () => (
  <svg {...s}>
    <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5.5l-3 13" />
  </svg>
);

// Neutral default — a generic card. Used when the generator's icon name isn't
// recognized, and for the pending placeholder.
const PanelIcon = () => (
  <svg {...s}>
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <path d="M4 9.5h16M8 13h8M8 16h5" />
  </svg>
);

// Error state.
const AlertIcon = () => (
  <svg {...s}>
    <path d="M12 4 2.5 20h19L12 4Z" />
    <path d="M12 10v4M12 17h.01" />
  </svg>
);

const WIDGET_ICONS: Record<string, () => ReactElement> = {
  news: NewsIcon,
  chart: ChartIcon,
  money: MoneyIcon,
  calendar: CalendarIcon,
  clock: ClockIcon,
  weather: SunIcon,
  moon: MoonIcon,
  ball: BallIcon,
  basketball: HoopIcon,
  trophy: TrophyIcon,
  music: MusicIcon,
  ticket: TicketIcon,
  video: VideoIcon,
  book: BookIcon,
  check: CheckCircleIcon,
  list: ListIcon,
  building: BuildingIcon,
  globe: GlobeIcon,
  star: StarIcon,
  heart: HeartIcon,
  flame: FlameIcon,
  food: FoodIcon,
  plane: PlaneIcon,
  pin: PinIcon,
  bell: BellIcon,
  gift: GiftIcon,
  droplet: DropletIcon,
  leaf: LeafIcon,
  car: CarIcon,
  cart: CartIcon,
  mail: MailIcon,
  flag: FlagIcon,
  code: CodeIcon,
  panel: PanelIcon,
  alert: AlertIcon,
};

/** Render a generated widget's flat icon by name (falls back to a generic card). */
export function WidgetIcon({ name }: { name?: string }) {
  const Icon = (name && WIDGET_ICONS[name]) || PanelIcon;
  return <Icon />;
}
