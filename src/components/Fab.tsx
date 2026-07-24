import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSettings } from "../lib/settings";
import { useCustomWidgets } from "../lib/customWidgets";
import { startGeneration } from "../lib/generateJob";
import { FlowIcon, GridIcon, LockIcon, MoonIcon, SlidersIcon, SparkleIcon, SunIcon, UnlockIcon } from "./icons";

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

// Prompts offered to first-timers who may not know what "generate a widget"
// can do — clicking one fills the box so they can send or tweak it.
const STARTER_IDEAS: { label: string; prompt: string }[] = [
  {
    label: "Sports",
    prompt:
      "Create a widget that shows me the upcoming NBA games, and also optionally let's me follow one specific team so I can always have their upcoming games in view. There should be a clear distinction between other games and games of the team I'm following.",
  },
  {
    label: "Gas prices",
    prompt:
      "Create a widget that shows me the average gas price in my area given a zipcode, and also a chart of the gas price in the last month so I can see the trend. In this case, increasing is red and decreasing is green.",
  },
  {
    label: "Planner",
    prompt:
      "Give me a daily planner so I can see todos in an hourly view, with enough space between tasks so it's easy to read.",
  },
];

function GenerateDialog({ onClose }: { onClose: () => void }) {
  const { addPending, widgets } = useCustomWidgets();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Only nudge people who haven't generated anything yet.
  const firstTime = widgets.length === 0;

  // Kicking off the job returns fast (~1s); the widget then builds in the
  // background and shows as a placeholder card on the board. So we only wait
  // for the job to start, then close — no long modal spinner.
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const jobId = await startGeneration(trimmed);
      addPending(jobId, trimmed);
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
        {firstTime && (
          <div className="genie__ideas">
            <span className="genie__ideas-label">Try</span>
            {STARTER_IDEAS.map((idea) => (
              <button
                type="button"
                key={idea.label}
                className="genie__idea"
                onClick={() => {
                  setPrompt(idea.prompt);
                  inputRef.current?.focus();
                }}
              >
                {idea.label}
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={inputRef}
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
            {busy ? "Starting…" : "Generate"}
          </button>
        </div>
        {busy && <p className="genie__wait">Adding a placeholder to your board — it'll fill in shortly.</p>}
      </form>
    </div>
  );
}

/**
 * The floating Daybreak bubble (bottom right). The bubble itself is the
 * Generate Widget action; hovering it fans out the secondary bubbles —
 * personalize (re-run setup), view lock, the dash/flow layout switch, and
 * the light/dark theme toggle.
 */
export function Fab({ onPersonalize }: { onPersonalize: () => void }) {
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
            onClick={() => {
              setOpen(false);
              onPersonalize();
            }}
          >
            <span className="fab__label">Personalize</span>
            <SlidersIcon />
          </button>
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
            className={`fab__action${settings.locked ? " is-active" : ""}`}
            tabIndex={open ? 0 : -1}
            onClick={() => update({ locked: !settings.locked })}
          >
            <span className="fab__label">{settings.locked ? "Unlock view" : "Lock view"}</span>
            {settings.locked ? <UnlockIcon /> : <LockIcon />}
          </button>
        </div>
        <button
          className="fab__logo"
          aria-label="Generate widget"
          title="Generate widget"
          onClick={() => {
            setDialog(true);
            setOpen(false);
          }}
        >
          <span className="fab__label fab__label--logo">Generate widget</span>
          <Logo />
        </button>
      </div>
    </>
  );
}
