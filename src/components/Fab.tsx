import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSettings } from "../lib/settings";
import { useCustomWidgets } from "../lib/customWidgets";
import type { GeneratedWidget } from "../lib/customWidgets";
import { FlowIcon, GridIcon, MoonIcon, SparkleIcon, SunIcon } from "./icons";

// The favicon's dawn mark, drawn with theme tokens so the bubble follows
// light/dark mode: dark disc with light strokes in light mode, and the
// inverse in dark mode.
function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M8 21a8 8 0 0 1 16 0" fill="none" stroke="var(--bg)" strokeWidth="2.25" strokeLinecap="round" />
      <path d="M16 7v3M7.6 11.6l2.1 2.1M24.4 11.6l-2.1 2.1M6 21h20" stroke="var(--bg)" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

async function requestWidget(prompt: string): Promise<GeneratedWidget> {
  const res = await fetch("/api/generate-widget", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<GeneratedWidget> & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `${res.status} ${res.statusText}`);
  return data as GeneratedWidget;
}

function GenerateDialog({ onClose }: { onClose: () => void }) {
  const { add } = useCustomWidgets();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const spec = await requestWidget(trimmed);
      add({ ...spec, prompt: trimmed });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="genie" role="dialog" aria-modal="true" aria-label="Generate a widget">
      <form onSubmit={submit}>
        <h2 className="genie__title">
          <SparkleIcon />
          Generate a widget
        </h2>
        <p className="genie__hint">
          Describe what you want to keep an eye on — it's built to match Daybreak and added to your board.
        </p>
        <textarea
          className="genie__input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={'e.g. "A widget to track my friends\' birthdays"'}
          rows={3}
          maxLength={2000}
          autoFocus
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        {error && <p className="genie__error">{error}</p>}
        <div className="genie__row">
          <button type="button" className="genie__cancel" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="genie__go" disabled={busy || !prompt.trim()}>
            {busy ? "Designing your widget…" : "Generate"}
          </button>
        </div>
        {busy && <p className="genie__wait">This usually takes 15–45 seconds.</p>}
      </form>
    </div>
  );
}

/**
 * The floating Daybreak bubble (bottom right). Hovering — or tapping, on
 * touch — fans out the action bubbles: Generate Widget, the dash/flow layout
 * switch, and the light/dark theme toggle.
 */
export function Fab() {
  const { settings, update } = useSettings();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  const dark =
    settings.theme === "dark" ||
    (settings.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const flow = settings.layout === "flow";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDialog(false);
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A short grace period before closing so the pointer can cross the gap
  // between bubbles without collapsing the menu.
  const enter = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const leave = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 240);
  };

  return (
    <>
      {dialog && <GenerateDialog onClose={() => setDialog(false)} />}
      <div
        className={`fab${open && !dialog ? " is-open" : ""}`}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={enter}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) leave();
        }}
      >
        <div className="fab__menu" aria-hidden={!open || dialog}>
          <button
            className="fab__action"
            tabIndex={open ? 0 : -1}
            onClick={() => update({ theme: dark ? "light" : "dark" })}
          >
            <span className="fab__label">{dark ? "Light mode" : "Dark mode"}</span>
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            className="fab__action"
            tabIndex={open ? 0 : -1}
            onClick={() => update({ layout: flow ? "grid" : "flow" })}
          >
            <span className="fab__label">{flow ? "Dashboard view" : "Flow view"}</span>
            {flow ? <GridIcon /> : <FlowIcon />}
          </button>
          <button
            className="fab__action fab__action--primary"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              setDialog(true);
              setOpen(false);
            }}
          >
            <span className="fab__label">Generate widget</span>
            <SparkleIcon />
          </button>
        </div>
        <button
          className="fab__logo"
          aria-label="Daybreak actions"
          aria-expanded={open && !dialog}
          onClick={() => setOpen((v) => !v)}
        >
          <Logo />
        </button>
      </div>
    </>
  );
}
