import type { ReactNode } from "react";

export function Card({
  title,
  icon,
  actions,
  children,
}: {
  title: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <header className="card__head">
        <h2 className="card__title">
          {icon}
          {title}
        </h2>
        {actions}
      </header>
      <div className="card__body">{children}</div>
    </section>
  );
}

// Edit/Done toggle for a card header. Hidden until the header is hovered
// (or the button is focused), except while editing — "Done" must stay visible.
export function EditButton({ editing, onToggle }: { editing: boolean; onToggle: () => void }) {
  return (
    <button
      className={`card__more card__more--reveal${editing ? " is-editing" : ""}`}
      onClick={onToggle}
    >
      {editing ? "Done" : "Edit"}
    </button>
  );
}

export function SkeletonRows({ rows = 3, height = 18 }: { rows?: number; height?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "6px 0" }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height, width: `${100 - (i % 3) * 12}%` }} />
      ))}
    </div>
  );
}
