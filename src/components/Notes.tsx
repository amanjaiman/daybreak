import { useEffect, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Card } from "./Card";
import { NoteIcon } from "./icons";

// A single freeform scratchpad, persisted locally. No API, no accounts —
// just a place to park a thought that's always on the board.
const STORAGE_KEY = "daybreak.notes";
// How tall the pad is dragged to. Kept out of settings (like the note text
// itself) so the board's shape stays about arrangement, not content.
const HEIGHT_KEY = "daybreak.notes.height";

const DEFAULT_HEIGHT = 110;
const MIN_HEIGHT = 72;
const MAX_HEIGHT = 800;
const STEP = 24; // keyboard nudge per arrow press

const clampHeight = (h: number) => Math.min(Math.max(Math.round(h), MIN_HEIGHT), MAX_HEIGHT);

function loadHeight(): number {
  const saved = Number(localStorage.getItem(HEIGHT_KEY));
  return Number.isFinite(saved) && saved > 0 ? clampHeight(saved) : DEFAULT_HEIGHT;
}

export function Notes() {
  const [text, setText] = useState(() => localStorage.getItem(STORAGE_KEY) ?? "");
  // The pad's height lives on the card, not the textarea, so it can be dragged
  // whether or not the board is unlocked — seeing more of your notes isn't an
  // edit. The board re-flows on its own (a ResizeObserver watches each card).
  const [height, setHeight] = useState(loadHeight);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, text);
  }, [text]);

  useEffect(() => {
    localStorage.setItem(HEIGHT_KEY, String(height));
  }, [height]);

  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = height;
    setDragging(true);
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: PointerEvent) => setHeight(clampHeight(startHeight + ev.clientY - startY));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setDragging(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <Card
      title="Notes"
      icon={<NoteIcon />}
      actions={words > 0 ? <span className="card__more">{words} word{words === 1 ? "" : "s"}</span> : undefined}
    >
      <textarea
        className="notes__area"
        style={{ height }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Jot something down…"
        aria-label="Notes"
      />
      <div
        className={`notes__resize${dragging ? " is-dragging" : ""}`}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize notes"
        aria-valuenow={height}
        aria-valuemin={MIN_HEIGHT}
        aria-valuemax={MAX_HEIGHT}
        tabIndex={0}
        title="Drag to resize · double-click to reset"
        onPointerDown={startResize}
        onDoubleClick={() => setHeight(DEFAULT_HEIGHT)}
        onKeyDown={(e) => {
          const delta = e.key === "ArrowDown" ? STEP : e.key === "ArrowUp" ? -STEP : 0;
          if (delta) {
            e.preventDefault();
            setHeight((h) => clampHeight(h + delta));
          } else if (e.key === "Home") {
            e.preventDefault();
            setHeight(DEFAULT_HEIGHT);
          }
        }}
      >
        <span className="notes__grip" />
      </div>
    </Card>
  );
}
