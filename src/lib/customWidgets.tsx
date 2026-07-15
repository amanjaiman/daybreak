import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { isCustomId } from "./board";
import type { CustomId } from "./board";
import { useSettings } from "./settings";
import { pollJob, startGeneration } from "./generateJob";

/**
 * User-generated widgets ("Generate Widget" in the bubble menu). Each one is
 * a spec produced by OpenAI — static HTML plus a script run inside the card
 * (see components/CustomWidget.tsx) — persisted to localStorage.
 *
 * Generation is async: a widget is added to the board as a `pending`
 * placeholder the moment the job starts, then patched to `ready` (or `error`)
 * when the backend finishes. The placeholder — including its job id — is
 * persisted, so closing the tab mid-generation and returning resumes polling
 * instead of losing the widget.
 *
 * Widget-private data lives under a separate per-widget key (dataKey) so
 * deleting a widget can also clean up whatever it stored.
 */
export type CustomWidget = {
  id: CustomId;
  /** Generation lifecycle: pending (job running) -> ready, or error. */
  status: "pending" | "ready" | "error";
  /** Backend job id while status is pending (used to resume polling). */
  jobId?: string;
  /** Message shown when generation itself failed (status === "error"). */
  genError?: string;
  title: string;
  /** Flat icon name from src/components/widgetIcons.tsx (the card icon). */
  icon: string;
  /** The user's request, kept so a widget can be inspected/regenerated later. */
  prompt: string;
  html: string;
  script: string;
  /** Polling interval for data widgets; null for purely local ones. */
  refreshMs: number | null;
  createdAt: number;
};

/** What the generation endpoint returns — everything but identity + lifecycle. */
export type GeneratedWidget = Pick<CustomWidget, "title" | "icon" | "html" | "script" | "refreshMs">;

const STORAGE_KEY = "daybreak.customWidgets";

export const dataKey = (id: CustomId) => `daybreak.widget.${id.slice("custom:".length)}`;

// Pure (no React) so settings.tsx can call it while validating the saved
// board layout at load time. Older stored widgets predate `status`; treat a
// missing status as "ready" so they keep working.
export function loadCustomWidgets(): CustomWidget[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (w): w is CustomWidget =>
          !!w &&
          typeof (w as CustomWidget).id === "string" &&
          isCustomId((w as CustomWidget).id) &&
          typeof (w as CustomWidget).script === "string",
      )
      .map((w) => ({ ...w, status: w.status ?? "ready", icon: w.icon ?? "panel" }));
  } catch {
    return [];
  }
}

type CustomWidgetsContext = {
  widgets: CustomWidget[];
  /** Add a pending placeholder card for a started job; returns its id. */
  addPending: (jobId: string, prompt: string) => void;
  /** Re-run generation for a widget that failed (or to regenerate). */
  retry: (id: CustomId) => Promise<void>;
  remove: (id: CustomId) => void;
};

const Ctx = createContext<CustomWidgetsContext>({
  widgets: [],
  addPending: () => {},
  retry: async () => {},
  remove: () => {},
});

export function CustomWidgetsProvider({ children }: { children: ReactNode }) {
  const { settings, update } = useSettings();
  const [widgets, setWidgets] = useState<CustomWidget[]>(loadCustomWidgets);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  }, [widgets]);

  const patch = (id: CustomId, changes: Partial<CustomWidget>) =>
    setWidgets((all) => all.map((w) => (w.id === id ? { ...w, ...changes } : w)));

  const addPending: CustomWidgetsContext["addPending"] = (jobId, prompt) => {
    const widget: CustomWidget = {
      id: `custom:${crypto.randomUUID()}`,
      status: "pending",
      jobId,
      title: "Generating…",
      icon: "panel",
      prompt,
      html: "",
      script: "",
      refreshMs: null,
      createdAt: Date.now(),
    };
    setWidgets((all) => [...all, widget]);
    // Surface the new placeholder at the top of the emptiest column.
    const board = settings.board.map((c) => [...c]);
    board.reduce((shortest, c) => (c.length < shortest.length ? c : shortest)).unshift(widget.id);
    update({ board });
  };

  const retry: CustomWidgetsContext["retry"] = async (id) => {
    const widget = widgets.find((w) => w.id === id);
    if (!widget) return;
    patch(id, { status: "pending", jobId: undefined, genError: undefined, title: "Generating…", icon: "panel" });
    try {
      const jobId = await startGeneration(widget.prompt);
      patch(id, { jobId });
    } catch (err) {
      patch(id, { status: "error", genError: err instanceof Error ? err.message : String(err) });
    }
  };

  const remove = (id: CustomId) => {
    setWidgets((all) => all.filter((w) => w.id !== id));
    update({ board: settings.board.map((col) => col.filter((c) => c !== id)) });
    localStorage.removeItem(dataKey(id));
    localStorage.removeItem(`${dataKey(id)}.ai`); // widget.ai response cache
  };

  // Drive polling for every pending widget that has a job id, and resume it
  // for placeholders restored from localStorage on load. One poller per job;
  // cancel it if the widget is removed or otherwise leaves the pending state.
  const pollers = useRef<Map<string, () => void>>(new Map());
  useEffect(() => {
    for (const w of widgets) {
      if (w.status !== "pending" || !w.jobId || pollers.current.has(w.jobId)) continue;
      const { id, jobId } = w;
      const cancel = pollJob(jobId, {
        onDone: (spec) => {
          pollers.current.delete(jobId);
          patch(id, { ...spec, status: "ready", jobId: undefined, genError: undefined });
        },
        onError: (message) => {
          pollers.current.delete(jobId);
          patch(id, { status: "error", jobId: undefined, genError: message });
        },
      });
      pollers.current.set(jobId, cancel);
    }
    // Stop pollers whose job is no longer an active pending widget.
    for (const [jobId, cancel] of pollers.current) {
      if (!widgets.some((w) => w.jobId === jobId && w.status === "pending")) {
        cancel();
        pollers.current.delete(jobId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgets]);

  return <Ctx.Provider value={{ widgets, addPending, retry, remove }}>{children}</Ctx.Provider>;
}

export const useCustomWidgets = () => useContext(Ctx);
