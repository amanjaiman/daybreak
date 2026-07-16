import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { config } from "../config";
import { DEFAULT_BOARD, normalizeBoard, normalizeSpans } from "./board";
import type { BoardId, CustomId, Spans } from "./board";

export type Topic = { id: string; label: string; query: string };
export type League = { slug: string; label: string };

export type Layout = "grid" | "flow";
export type Theme = "system" | "light" | "dark";

export type Settings = {
  name: string;
  layout: Layout;
  theme: Theme;
  /** Locked view: hides reposition handles, card Edit buttons, and widget Remove. */
  locked: boolean;
  board: BoardId[][];
  /** Grid widths (2 or 3 columns) for cards that have been resized; default 1. */
  spans: Spans;
  location: { label: string; latitude: number; longitude: number };
  topics: Topic[];
  nbaTeam: { espnId: string; name: string };
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
  board: DEFAULT_BOARD,
  spans: {},
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
function storedCustomIds(): CustomId[] {
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
    const merged = raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Settings>) } : defaults;
    const board = normalizeBoard(merged.board, storedCustomIds());
    return { ...merged, board, spans: normalizeSpans(merged.spans, board) };
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
