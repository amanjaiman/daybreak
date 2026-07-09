import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { config } from "../config";
import { DEFAULT_BOARD, normalizeBoard } from "./board";
import type { CardId } from "./board";

export type Topic = { id: string; label: string; query: string };
export type League = { slug: string; label: string };

export type Layout = "grid" | "flow";
export type Theme = "system" | "light" | "dark";

export type Settings = {
  name: string;
  layout: Layout;
  theme: Theme;
  board: CardId[][];
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
  board: DEFAULT_BOARD,
  location: config.location,
  topics: config.topics,
  nbaTeam: { espnId: config.nbaTeam.espnId, name: config.nbaTeam.name },
  stocks: config.stocks,
  soccerLeagues: config.soccerLeagues,
  concertRadiusMiles: config.concertRadiusMiles,
};

const STORAGE_KEY = "daybreak.settings";

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const merged = raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Settings>) } : defaults;
    return { ...merged, board: normalizeBoard(merged.board) };
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
