import { useEffect, useState } from "react";
import { Card, EditButton } from "./Card";
import { TimerIcon } from "./icons";

/**
 * A focus (Pomodoro) timer: alternating focus/break countdowns with a
 * depleting ring. State is persisted, and a running timer is stored as an
 * absolute end time — so rearranging the board (which remounts the card) or
 * reloading the tab keeps the clock accurate instead of resetting it.
 */
const STORAGE_KEY = "daybreak.focus";
type Mode = "focus" | "break";

type State = {
  mode: Mode;
  running: boolean;
  /** When running: epoch ms the phase ends. */
  endsAt: number | null;
  /** When paused: seconds left in the phase. */
  remaining: number;
  focusMin: number;
  breakMin: number;
  /** Focus phases finished today. */
  sessions: number;
  day: string;
};

const today = () => new Date().toDateString();

const fresh = (): State => ({
  mode: "focus",
  running: false,
  endsAt: null,
  remaining: 25 * 60,
  focusMin: 25,
  breakMin: 5,
  sessions: 0,
  day: today(),
});

function load(): State {
  try {
    const s = { ...fresh(), ...(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<State>) };
    if (s.day !== today()) {
      s.sessions = 0;
      s.day = today();
    }
    return s;
  } catch {
    return fresh();
  }
}

const phaseSeconds = (s: State) => (s.mode === "focus" ? s.focusMin : s.breakMin) * 60;
const mmss = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

export function FocusTimer() {
  const [s, setS] = useState<State>(load);
  const [, tick] = useState(0);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }, [s]);

  // Re-render every 250ms while running so the countdown and ring animate.
  useEffect(() => {
    if (!s.running) return;
    const id = window.setInterval(() => tick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [s.running]);

  const remaining =
    s.running && s.endsAt != null ? Math.max(0, Math.round((s.endsAt - Date.now()) / 1000)) : s.remaining;

  // When a running phase hits zero, roll into the next one (counting finished
  // focus phases) and wait for the user to start it.
  useEffect(() => {
    if (!s.running || s.endsAt == null || Date.now() < s.endsAt) return;
    setS((prev) => {
      const finishedFocus = prev.mode === "focus";
      const mode: Mode = finishedFocus ? "break" : "focus";
      return {
        ...prev,
        mode,
        running: false,
        endsAt: null,
        remaining: (mode === "focus" ? prev.focusMin : prev.breakMin) * 60,
        sessions: finishedFocus ? prev.sessions + 1 : prev.sessions,
      };
    });
  });

  const start = () => setS((p) => ({ ...p, running: true, endsAt: Date.now() + remaining * 1000 }));
  const pause = () => setS((p) => ({ ...p, running: false, endsAt: null, remaining }));
  const reset = () => setS((p) => ({ ...p, running: false, endsAt: null, remaining: phaseSeconds(p) }));

  const setMode = (mode: Mode) =>
    setS((p) => ({ ...p, mode, running: false, endsAt: null, remaining: (mode === "focus" ? p.focusMin : p.breakMin) * 60 }));

  const setDuration = (key: "focusMin" | "breakMin", value: number) =>
    setS((p) => {
      const v = Math.min(180, Math.max(1, Math.round(value) || 1));
      const next = { ...p, [key]: v };
      // Reflect an edited duration in the current phase if it's idle.
      if (!p.running && ((key === "focusMin" && p.mode === "focus") || (key === "breakMin" && p.mode === "break"))) {
        next.remaining = v * 60;
        next.endsAt = null;
      }
      return next;
    });

  const total = phaseSeconds(s);
  const progress = total > 0 ? 1 - remaining / total : 0;
  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <Card
      title="Focus"
      icon={<TimerIcon />}
      actions={<EditButton editing={editing} onToggle={() => setEditing((v) => !v)} />}
    >
      {editing ? (
        <div className="track" style={{ borderTop: "none", marginTop: 0, paddingTop: 4 }}>
          <label className="track__row">
            Focus minutes
            <input
              type="number"
              min={1}
              max={180}
              value={s.focusMin}
              onChange={(e) => setDuration("focusMin", Number(e.target.value))}
            />
          </label>
          <label className="track__row">
            Break minutes
            <input
              type="number"
              min={1}
              max={180}
              value={s.breakMin}
              onChange={(e) => setDuration("breakMin", Number(e.target.value))}
            />
          </label>
        </div>
      ) : (
        <div className="focus">
          <div className="focus__modes" role="tablist" aria-label="Timer mode">
            {(["focus", "break"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={s.mode === m}
                className={`focus__mode${s.mode === m ? " is-active" : ""}`}
                onClick={() => setMode(m)}
              >
                {m === "focus" ? "Focus" : "Break"}
              </button>
            ))}
          </div>

          <div className="focus__dial">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle className="focus__track" cx="60" cy="60" r={R} />
              <circle
                className="focus__prog"
                cx="60"
                cy="60"
                r={R}
                strokeDasharray={C}
                strokeDashoffset={C * progress}
                transform="rotate(-90 60 60)"
              />
            </svg>
            <span className="focus__time" aria-live="off">
              {mmss(remaining)}
            </span>
          </div>

          <div className="focus__controls">
            <button className="focus__go" onClick={s.running ? pause : start}>
              {s.running ? "Pause" : remaining === total ? "Start" : "Resume"}
            </button>
            <button className="focus__reset" onClick={reset} aria-label="Reset timer">
              Reset
            </button>
          </div>

          <p className="focus__count">
            {s.sessions === 0
              ? "No focus sessions yet today."
              : `${s.sessions} focus session${s.sessions === 1 ? "" : "s"} today.`}
          </p>
        </div>
      )}
    </Card>
  );
}
