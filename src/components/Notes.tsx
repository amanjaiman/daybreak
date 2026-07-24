import { useEffect, useState } from "react";
import { Card } from "./Card";
import { NoteIcon } from "./icons";

// A single freeform scratchpad, persisted locally. No API, no accounts —
// just a place to park a thought that's always on the board.
const STORAGE_KEY = "daybreak.notes";

export function Notes() {
  const [text, setText] = useState(() => localStorage.getItem(STORAGE_KEY) ?? "");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, text);
  }, [text]);

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <Card
      title="Notes"
      icon={<NoteIcon />}
      actions={words > 0 ? <span className="card__more">{words} word{words === 1 ? "" : "s"}</span> : undefined}
    >
      <textarea
        className="notes__area"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Jot something down…"
        aria-label="Notes"
      />
    </Card>
  );
}
