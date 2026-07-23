import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { config } from "../config";
import { CARD_IDS, DEFAULT_BOARD, DEFAULT_SPANS, normalizeBoard, normalizeSpans } from "./board";
import type { BoardId, CardId, CustomId, Spans } from "./board";

export type Topic = { id: string; label: string; query: string };
export type League = { slug: string; label: string };

export type Layout = "grid" | "flow";
export type Theme = "system" | "light" | "dark";
export type SearchProvider = "google" | "bing" | "perplexity" | "chatgpt" | "claude";

export type Settings = {
  name: string;
  layout: Layout;
  theme: Theme;
  /** Locked view: hides reposition handles, card Edit buttons, and widget Remove. */
  locked: boolean;
  searchProvider: SearchProvider;
  /** False until the first-run setup flow has completed (see Onboarding.tsx). */
  onboarded: boolean;
  /** Built-in cards left out during onboarding — kept off the board and out of Flow. */
  hidden: CardId[];
  board: BoardId[][];
  /** Grid widths (2 or 3 columns) for cards that have been resized; default 1. */
  spans: Spans;
  location: { label: string; latitude: number; longitude: number };
  topics: Topic[];
  /** Team tab on the News card; null hides the tab. */
  nbaTeam: { espnId: string; name: string } | null;
  stocks: string[];
  soccerLeagues: League[];
  concertRadiusMiles: number;
};

// config.ts only supplies first-run defaults; everything is editable in-app
// and persisted here.
const defaults: Settings = {
  name: config.name,
  layout: "grid",
  theme: "system",
  locked: false,
  searchProvider: "google",
  onboarded: false,
  hidden: [],
  board: DEFAULT_BOARD,
  spans: DEFAULT_SPANS,
  location: config.location,
  topics: config.topics,
  nbaTeam: { espnId: config.nbaTeam.espnId, name: config.nbaTeam.name },
  stocks: config.stocks,
  soccerLeagues: config.soccerLeagues,
  concertRadiusMiles: config.concertRadiusMiles,
};

const STORAGE_KEY = "daybreak.settings";

// Generated-widget ids referenced by the saved board only survive
// normalization if the widget itself still exists. Read straight from
// localStorage (not via lib/customWidgets) to avoid a circular import.
export function storedCustomIds(): CustomId[] {
  try {
    const raw = JSON.parse(localStorage.getItem("daybreak.customWidgets") ?? "[]") as { id?: string }[];
    return (Array.isArray(raw) ? raw : [])
      .map((w) => w?.id)
      .filter((id): id is CustomId => typeof id === "string" && id.startsWith("custom:"));
  } catch {
    return [];
  }
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // Settings saved before onboarding existed lack the flag — anyone with a
    // saved dashboard has already made it theirs, so don't re-run setup.
    const merged = raw
      ? { ...defaults, onboarded: true, ...(JSON.parse(raw) as Partial<Settings>) }
      : defaults;
    const hidden = (Array.isArray(merged.hidden) ? merged.hidden : []).filter(
      (id): id is CardId => (CARD_IDS as string[]).includes(id),
    );
    // Boards saved before the Search card existed get it slotted in by
    // normalizeBoard — give it its intended full-width span as well (unless
    // the user has since left it off during onboarding).
    const hadSearch =
      hidden.includes("search") ||
      (Array.isArray(merged.board) &&
        merged.board.some((column) => Array.isArray(column) && column.includes("search")));
    const board = normalizeBoard(merged.board, storedCustomIds(), hidden);
    const spans = normalizeSpans(merged.spans, board);
    if (!hadSearch) spans.search = 3;
    const searchProvider: SearchProvider = (
      ["google", "bing", "perplexity", "chatgpt", "claude"] as const
    ).includes(merged.searchProvider as SearchProvider)
      ? merged.searchProvider
      : defaults.searchProvider;
    return { ...merged, searchProvider, hidden, board, spans };
  } catch {
    return defaults;
  }
}

type SettingsContext = {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
};

const Ctx = createContext<SettingsContext>({ settings: defaults, update: () => {} });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));

  return <Ctx.Provider value={{ settings, update }}>{children}</Ctx.Provider>;
}

export const useSettings = () => useContext(Ctx);
