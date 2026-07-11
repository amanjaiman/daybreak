import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { isCustomId } from "./board";
import type { CustomId } from "./board";
import { useSettings } from "./settings";

/**
 * User-generated widgets ("Generate Widget" in the bubble menu). Each one is
 * a spec returned by the OpenAI API — static HTML plus a script run inside
 * the card (see components/CustomWidget.tsx) — persisted to localStorage.
 * Widget-private data lives under a separate per-widget key (dataKey) so
 * deleting a widget can also clean up whatever it stored.
 */
export type CustomWidget = {
  id: CustomId;
  title: string;
  emoji: string;
  /** The user's request, kept so a widget can be inspected/regenerated later. */
  prompt: string;
  html: string;
  script: string;
  /** Polling interval for data widgets; null for purely local ones. */
  refreshMs: number | null;
  createdAt: number;
};

/** What the generation endpoint returns — everything but identity. */
export type GeneratedWidget = Pick<CustomWidget, "title" | "emoji" | "html" | "script" | "refreshMs">;

const STORAGE_KEY = "daybreak.customWidgets";

export const dataKey = (id: CustomId) => `daybreak.widget.${id.slice("custom:".length)}`;

// Pure (no React) so settings.tsx can call it while validating the saved
// board layout at load time.
export function loadCustomWidgets(): CustomWidget[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (w): w is CustomWidget =>
        !!w &&
        typeof (w as CustomWidget).id === "string" &&
        isCustomId((w as CustomWidget).id) &&
        typeof (w as CustomWidget).script === "string",
    );
  } catch {
    return [];
  }
}

type CustomWidgetsContext = {
  widgets: CustomWidget[];
  add: (spec: GeneratedWidget & { prompt: string }) => void;
  remove: (id: CustomId) => void;
};

const Ctx = createContext<CustomWidgetsContext>({ widgets: [], add: () => {}, remove: () => {} });

export function CustomWidgetsProvider({ children }: { children: ReactNode }) {
  const { settings, update } = useSettings();
  const [widgets, setWidgets] = useState<CustomWidget[]>(loadCustomWidgets);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  }, [widgets]);

  const add: CustomWidgetsContext["add"] = (spec) => {
    const widget: CustomWidget = { ...spec, id: `custom:${crypto.randomUUID()}`, createdAt: Date.now() };
    setWidgets((all) => [...all, widget]);
    // Surface the new widget at the top of the emptiest column.
    const board = settings.board.map((c) => [...c]);
    board.reduce((shortest, c) => (c.length < shortest.length ? c : shortest)).unshift(widget.id);
    update({ board });
  };

  const remove = (id: CustomId) => {
    setWidgets((all) => all.filter((w) => w.id !== id));
    update({ board: settings.board.map((col) => col.filter((c) => c !== id)) });
    localStorage.removeItem(dataKey(id));
    localStorage.removeItem(`${dataKey(id)}.ai`); // widget.ai response cache
  };

  return <Ctx.Provider value={{ widgets, add, remove }}>{children}</Ctx.Provider>;
}

export const useCustomWidgets = () => useContext(Ctx);
