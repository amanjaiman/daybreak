import { useEffect, useRef, useState } from "react";
import { useSettings } from "./lib/settings";
import { Board } from "./components/Board";
import { FlowPage } from "./components/FlowPage";
import { Fab } from "./components/Fab";
import { Onboarding } from "./components/Onboarding";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// Click the name in the greeting to change it.
function EditableName() {
  const { settings, update } = useSettings();
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const save = () => {
    const value = inputRef.current?.value.trim();
    if (value) update({ name: value });
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="masthead__name-input"
        defaultValue={settings.name}
        aria-label="Your name"
        autoFocus
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button className="masthead__name" title="Click to change your name" onClick={() => setEditing(true)}>
      {settings.name}
    </button>
  );
}

export default function App() {
  const { settings } = useSettings();
  // Re-running setup from the bubble menu; first runs are driven by the
  // persisted `onboarded` flag instead.
  const [personalizing, setPersonalizing] = useState(false);
  const flow = settings.layout === "flow";
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // An explicit theme choice is stamped on <html>; "system" leaves it to the
  // prefers-color-scheme media query in CSS.
  useEffect(() => {
    if (settings.theme === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = settings.theme;
    }
  }, [settings.theme]);

  if (!settings.onboarded || personalizing) {
    return <Onboarding rerun={settings.onboarded} onClose={() => setPersonalizing(false)} />;
  }

  return (
    <div className={`shell${flow ? " shell--flow" : ""}`}>
      <header>
        <div className="masthead">
          <span className="masthead__date">{today}</span>
        </div>
        <h1 className="masthead__greeting">
          {greeting()}, <EditableName />
        </h1>
      </header>

      {flow ? <FlowPage /> : <Board />}

      <footer className="footer">
        Weather by Open-Meteo · News via Hacker News &amp; ESPN · Concerts via Bandsintown ·
        Quotes via Yahoo Finance
      </footer>

      <Fab onPersonalize={() => setPersonalizing(true)} />
    </div>
  );
}
