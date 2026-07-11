import { useEffect, useRef, useState } from "react";
import { Card } from "./Card";
import { dataKey, useCustomWidgets } from "../lib/customWidgets";
import type { CustomWidget } from "../lib/customWidgets";
import { RefreshIcon } from "./icons";

/**
 * The surface a generated widget's script runs against. This is the whole
 * contract between the OpenAI-produced code and the app — the generation
 * system prompt (netlify/functions/generate-widget.ts) documents exactly
 * this shape, so keep the two in sync.
 */
type WidgetApi = {
  root: HTMLElement;
  store: { get<T>(): T | null; set(value: unknown): void };
  getJSON: (url: string) => Promise<unknown>;
  esc: (s: unknown) => string;
  refresh: () => void;
};

function makeApi(widget: CustomWidget, root: HTMLElement, refresh: () => void): WidgetApi {
  const key = dataKey(widget.id);
  return {
    root,
    store: {
      get: () => {
        try {
          return JSON.parse(localStorage.getItem(key) ?? "null");
        } catch {
          return null;
        }
      },
      set: (value) => localStorage.setItem(key, JSON.stringify(value)),
    },
    getJSON: async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    },
    esc: (s) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;"),
    refresh,
  };
}

/**
 * Runs a generated widget: the stored HTML is stamped into the card body,
 * then the stored script executes against the WidgetApi. Refreshing (manual
 * button, the polling interval, or api.refresh()) resets the body and reruns
 * the script from scratch, so scripts stay simple and idempotent — any state
 * worth keeping goes through api.store.
 */
export function CustomWidgetCard({ widget }: { widget: CustomWidget }) {
  const { remove } = useCustomWidgets();
  const rootRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [runKey, setRunKey] = useState(0);
  const rerun = () => setRunKey((k) => k + 1);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.innerHTML = widget.html;
    setError(null);
    try {
      const fn = new Function("widget", `"use strict";\n${widget.script}`);
      fn(makeApi(widget, root, rerun));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    return () => {
      root.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.id, widget.html, widget.script, runKey]);

  useEffect(() => {
    if (!widget.refreshMs) return;
    const timer = setInterval(rerun, Math.max(60_000, widget.refreshMs));
    return () => clearInterval(timer);
  }, [widget.refreshMs]);

  return (
    <Card
      title={widget.title}
      icon={<span className="widget__emoji">{widget.emoji}</span>}
      actions={
        <span className="widget__actions">
          {widget.refreshMs != null && (
            <button className="card__more card__more--reveal" title="Refresh" aria-label={`Refresh ${widget.title}`} onClick={rerun}>
              <RefreshIcon />
            </button>
          )}
          <button
            className="card__more card__more--reveal"
            onClick={() => {
              if (window.confirm(`Remove the "${widget.title}" widget? Its saved data is deleted too.`)) {
                remove(widget.id);
              }
            }}
          >
            Remove
          </button>
        </span>
      }
    >
      {error ? (
        <div className="widget__error">
          This widget hit an error: {error}
          <button className="list__toggle" onClick={rerun}>
            Try again
          </button>
        </div>
      ) : null}
      <div ref={rootRef} style={error ? { display: "none" } : undefined} />
    </Card>
  );
}
