import type { ReactNode } from "react";
import { storedCustomIds, useSettings } from "../lib/settings";
import type { League, Settings, Topic } from "../lib/settings";
import { balanceBoard, normalizeBoard, normalizeSpans } from "../lib/board";
import type { BoardId, CardId } from "../lib/board";
import { TRACKED_KEY } from "./Shows";
import type { Tracked } from "./Shows";
import { BallIcon, ChartIcon, MoonIcon, NewsIcon, SunIcon, TicketIcon } from "./icons";

/**
 * Pieces shared by first-run setup (Onboarding.tsx) and the settings panel
 * (Personalize.tsx): the widget catalog, suggestion lists, the pill picker,
 * and the one place that turns a draft of choices into saved settings.
 */

export type WidgetInfo = { id: CardId; icon: ReactNode; title: string; desc: string };

// Universal built-ins — general frameworks anyone can use and tune to their
// own taste. These are what onboarding offers and Personalize toggles. Search,
// Todos and Reading are ALWAYS_ON (lib/board) so they aren't listed here.
// Specific interests (a particular sport, a particular team) are deliberately
// NOT built-ins — they belong to News topics or a generated widget.
export const WIDGET_CATALOG: WidgetInfo[] = [
  { id: "weather", icon: <SunIcon />, title: "Weather", desc: "Right now, plus the week ahead" },
  { id: "news", icon: <NewsIcon />, title: "News", desc: "Headlines for topics you follow" },
  { id: "shows", icon: <TicketIcon />, title: "Shows", desc: "Concerts near your city" },
  { id: "stocks", icon: <ChartIcon />, title: "Stocks", desc: "Your watchlist at a glance" },
];

// Football is a single-sport widget: a personal interest, not a universal
// framework, so it isn't offered to new users. It stays here only so a board
// that already has it (or hides it) can still manage it from Personalize.
export const LEGACY_WIDGETS: WidgetInfo[] = [
  { id: "football", icon: <BallIcon />, title: "Football", desc: "Fixtures and live scores" },
];

// Gentle starting points — tapping one adds it, nothing is preselected.
export const TOPIC_IDEAS = [
  { label: "Tech", query: "technology OR software" },
  { label: "AI", query: "AI OR LLM" },
  { label: "Startups", query: "startup OR funding" },
  { label: "Science", query: "science OR research" },
  { label: "Climate", query: "climate OR energy" },
  { label: "Design", query: "design OR UX" },
];
export const STOCK_IDEAS = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "TSLA", "SPY"];
export const STARTER_LEAGUES = new Set(["uefa.champions", "eng.1", "fifa.world"]);

/** The Daybreak mark — same drawing as the favicon, in theme colors. */
export function DaybreakMark({ size = 44 }: { size?: number }) {
  return (
    <svg className="setup__mark" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--ink)" />
      <path d="M8 21a8 8 0 0 1 16 0" fill="none" stroke="var(--bg)" strokeWidth="2.25" strokeLinecap="round" />
      <path d="M16 7v3M7.6 11.6l2.1 2.1M24.4 11.6l-2.1 2.1M6 21h20" stroke="var(--bg)" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

/** Sun/moon theme flip, usable anywhere the bubble menu isn't. */
export function ThemeToggle() {
  const { settings, update } = useSettings();
  const dark =
    settings.theme === "dark" ||
    (settings.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return (
    <button
      type="button"
      className="setup__theme"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      onClick={() => update({ theme: dark ? "light" : "dark" })}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

export type Pill = { key: string; label: string; on: boolean };

/**
 * A row of toggleable pills, optionally with an inline "add your own" input.
 * Custom additions are the caller's to track — they should come back through
 * `pills` looking exactly like the predefined ones.
 */
export function PillPicker({
  pills,
  onToggle,
  addPlaceholder,
  onAdd,
  transform = (v: string) => v,
}: {
  pills: Pill[];
  onToggle: (key: string) => void;
  addPlaceholder?: string;
  onAdd?: (value: string) => void;
  transform?: (value: string) => string;
}) {
  const add = (input: HTMLInputElement) => {
    const value = transform(input.value.trim());
    if (value && onAdd) onAdd(value);
    input.value = "";
  };
  return (
    <div className="setup__picker">
      <div className="onboard__ideas">
        {pills.map((p) => (
          <button
            type="button"
            key={p.key}
            className={`pick${p.on ? " is-on" : ""}`}
            aria-pressed={p.on}
            onClick={() => onToggle(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {onAdd && (
        <div className="onboard__addrow">
          <input
            className="onboard__input"
            placeholder={addPlaceholder}
            aria-label={addPlaceholder}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(e.currentTarget);
              }
            }}
          />
          <button
            type="button"
            className="onboard__add"
            onClick={(e) => add(e.currentTarget.previousElementSibling as HTMLInputElement)}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

export function readTracked(): Tracked[] {
  try {
    const raw = JSON.parse(localStorage.getItem(TRACKED_KEY) ?? "[]") as Tracked[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export type SetupDraft = {
  name: string;
  location: { label: string; latitude: number; longitude: number };
  topics: Topic[];
  leagues: League[];
  stocks: string[];
  artists: string[];
  hidden: BoardId[];
};

/**
 * Turn a draft of setup choices into saved settings. The tracked-performer
 * list is always (re)written — entries whose names survive keep their
 * original watch city, new names watch near the chosen home — so config.ts's
 * personal defaults can never seed it later. `balance` spreads a sparse board
 * across all three columns (first run); Personalize leaves arrangement alone.
 */
export function applySetup(
  settings: Settings,
  update: (patch: Partial<Settings>) => void,
  draft: SetupDraft,
  { balance = false }: { balance?: boolean } = {},
) {
  let board = normalizeBoard(settings.board, storedCustomIds(), draft.hidden);
  if (balance) board = balanceBoard(board);

  const kept = readTracked().filter((t) => draft.artists.includes(t.name));
  const have = new Set(kept.map((t) => t.name));
  const added = draft.artists
    .filter((a) => !have.has(a))
    .map(
      (performer): Tracked => ({
        id: crypto.randomUUID(),
        name: performer,
        locLabel: draft.location.label,
        lat: draft.location.latitude,
        lon: draft.location.longitude,
      }),
    );
  localStorage.setItem(TRACKED_KEY, JSON.stringify([...kept, ...added]));

  update({
    name: draft.name.trim(),
    location: draft.location,
    topics: draft.topics,
    soccerLeagues: draft.leagues,
    stocks: draft.stocks,
    hidden: draft.hidden,
    board,
    spans: normalizeSpans(settings.spans, board),
    onboarded: true,
  });
}
