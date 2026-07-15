import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { BoardId, CardId, Span } from "../lib/board";
import { clampSpan, isCustomId, reorderBoard, spanOf } from "../lib/board";
import { computeLayout } from "../lib/masonry";
import type { Layout } from "../lib/masonry";
import { useSettings } from "../lib/settings";
import { useCustomWidgets } from "../lib/customWidgets";
import { CustomWidgetCard } from "./CustomWidget";
import { Weather } from "./Weather";
import { News } from "./News";
import { Todos } from "./Todos";
import { Soccer } from "./Soccer";
import { Shows } from "./Shows";
import { Stocks } from "./Stocks";
import { ReadingQueue } from "./ReadingQueue";
import { GripIcon } from "./icons";

// Record<CardId, …> means TypeScript won't compile if a card is added to
// CardId without a matching entry here (or vice versa) — the type system
// keeps this registry and lib/board.ts's id list in sync.
const CARDS: Record<CardId, ReactNode> = {
  weather: <Weather />,
  todos: <Todos />,
  reading: <ReadingQueue />,
  news: <News />,
  football: <Soccer />,
  shows: <Shows />,
  stocks: <Stocks />,
};

const TITLES: Record<CardId, string> = {
  weather: "Weather",
  todos: "Todos",
  reading: "Reading",
  news: "News",
  football: "Football",
  shows: "Shows",
  stocks: "Stocks",
};

type DropTarget = { col: number; index: number };

const EDGE = 72;
const SCROLL_SPEED = 16;
const GAP = 18; // matches the board gap in index.css
const COLS = 3;
const MOBILE = 980; // below this the board collapses to a single column

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/** Segmented 1·2·3 width control shown in a card's chrome when unlocked. */
function WidthControl({ span, onSet }: { span: Span; onSet: (span: Span) => void }) {
  return (
    <div className="board__width" role="group" aria-label="Card width">
      {([1, 2, 3] as const).map((n) => (
        <button
          key={n}
          type="button"
          className={`board__width-opt${span === n ? " is-active" : ""}`}
          aria-pressed={span === n}
          aria-label={`Width ${n} column${n > 1 ? "s" : ""}`}
          title={`${n} column${n > 1 ? "s" : ""}`}
          onClick={() => onSet(n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/**
 * Cards you drag to arrange, in up to three columns you own. A card can be
 * resized (unlocked view) to span 1-3 columns; a wide card overflows to the
 * right and pushes the columns it covers down. Because spanning breaks normal
 * column flow, positions are computed by lib/masonry.ts from measured heights
 * and applied as absolute left/top — see useMasonry below. The floating drag
 * label is written straight to the DOM to keep dragging smooth.
 */
export function Board() {
  const { settings, update } = useSettings();
  const { widgets } = useCustomWidgets();
  const columns = settings.board;
  const spans = settings.spans;

  const [dragId, setDragId] = useState<BoardId | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [pendingFocus, setPendingFocus] = useState<BoardId | null>(null);

  // Generated widgets render through CustomWidgetCard; built-ins come from
  // the static CARDS registry. Titles feed the drag ghost and aria labels.
  const widgetById = new Map(widgets.map((w) => [w.id, w]));
  const titleOf = (id: BoardId) => (isCustomId(id) ? (widgetById.get(id)?.title ?? "Widget") : TITLES[id]);
  const cardOf = (id: BoardId) => {
    if (!isCustomId(id)) return CARDS[id];
    const widget = widgetById.get(id);
    return widget ? <CustomWidgetCard widget={widget} /> : null;
  };

  // --- masonry measurement + layout --------------------------------------
  const containerRef = useRef<HTMLElement>(null);
  const itemNodes = useRef(new Map<BoardId, HTMLElement>());
  const roRef = useRef<ResizeObserver | null>(null);
  const frame = useRef(0);
  // Latest inputs, so the ResizeObserver callback always reads current data.
  const inputs = useRef({ columns, spans });
  inputs.current = { columns, spans };

  const [state, setState] = useState<{ layout: Layout; colCount: number; colWidth: number }>({
    layout: { rects: new Map(), height: 0 },
    colCount: COLS,
    colWidth: 0,
  });
  const { layout, colCount, colWidth } = state;

  const ghostRef = useRef<HTMLDivElement>(null);
  const startPos = useRef({ x: 0, y: 0 });

  const runLayout = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const width = el.clientWidth;
    if (!width) return;
    const cc = width < MOBILE ? 1 : COLS;
    const colW = cc === 1 ? width : (width - GAP * (COLS - 1)) / COLS;
    const { columns: cols, spans: sp } = inputs.current;

    // Set each item's width first, so its measured height is the height at the
    // width it will actually render at (avoids the masonry measure-at-wrong-
    // width problem).
    cols.forEach((col, c) => {
      for (const id of col) {
        const node = itemNodes.current.get(id);
        if (!node) continue;
        const s = cc === 1 ? 1 : clampSpan(spanOf(sp, id), c);
        node.style.width = `${s * colW + (s - 1) * GAP}px`;
      }
    });

    const heights = new Map<BoardId, number>();
    for (const col of cols) for (const id of col) heights.set(id, itemNodes.current.get(id)?.offsetHeight ?? 0);

    setState({ layout: computeLayout(cols, sp, heights, cc, colW, GAP), colCount: cc, colWidth: colW });
  }, []);

  const schedule = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(runLayout);
  }, [runLayout]);

  // One ResizeObserver watches the container (width) and every card (height).
  useEffect(() => {
    const ro = new ResizeObserver(schedule);
    roRef.current = ro;
    if (containerRef.current) ro.observe(containerRef.current);
    for (const node of itemNodes.current.values()) ro.observe(node);
    return () => {
      ro.disconnect();
      roRef.current = null;
      cancelAnimationFrame(frame.current);
    };
  }, [schedule]);

  const setItemRef = useCallback((id: BoardId, node: HTMLElement | null) => {
    const prev = itemNodes.current.get(id);
    if (prev && roRef.current) roRef.current.unobserve(prev);
    if (node) {
      itemNodes.current.set(id, node);
      roRef.current?.observe(node);
    } else {
      itemNodes.current.delete(id);
    }
  }, []);

  // Re-measure synchronously (before paint) whenever the arrangement changes,
  // or when locking toggles the per-card chrome strip (which shifts heights).
  useLayoutEffect(() => {
    runLayout();
  }, [columns, spans, widgets, settings.locked, runLayout]);

  // --- arrangement + width edits -----------------------------------------
  const commit = (id: BoardId, target: DropTarget) => {
    const board = reorderBoard(columns, id, target);
    // A card can't stay wider than its new column allows.
    const span = clampSpan(spanOf(spans, id), target.col);
    const nextSpans = { ...spans };
    if (span === 1) delete nextSpans[id];
    else nextSpans[id] = span;
    update({ board, spans: nextSpans });
  };

  // Any card can take any width. A card can only span rightward, so when it
  // won't fit from its current column (e.g. a column-2 card set to width 2),
  // shift its anchor left just enough to make room — it grows leftward.
  const setSpan = (id: BoardId, col: number, span: Span) => {
    const s = Math.min(Math.max(1, span), COLS) as Span;
    const targetCol = Math.min(col, COLS - s);
    let board = columns;
    if (targetCol !== col) {
      const index = Math.min(columns[col].indexOf(id), columns[targetCol].length);
      board = reorderBoard(columns, id, { col: targetCol, index });
    }
    const next = { ...spans };
    if (s === 1) delete next[id];
    else next[id] = s;
    update({ board, spans: next });
  };

  useEffect(() => {
    if (!pendingFocus) return;
    document
      .querySelector<HTMLButtonElement>(`[data-board-item="${pendingFocus}"] .board__handle`)
      ?.focus();
    setPendingFocus(null);
  }, [pendingFocus]);

  const startDrag = (id: BoardId) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    startPos.current = { x: e.clientX, y: e.clientY };
    setDragId(id);
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    let target: DropTarget | null = null;

    const onMove = (ev: PointerEvent) => {
      if (ghostRef.current) {
        ghostRef.current.style.left = `${ev.clientX}px`;
        ghostRef.current.style.top = `${ev.clientY}px`;
      }
      if (ev.clientY < EDGE) window.scrollBy(0, -SCROLL_SPEED);
      else if (ev.clientY > window.innerHeight - EDGE) window.scrollBy(0, SCROLL_SPEED);

      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const itemEl = el ? (el.closest("[data-board-item]") as HTMLElement | null) : null;

      if (itemEl && itemEl.dataset.boardItem !== id) {
        const rect = itemEl.getBoundingClientRect();
        const col = Number(itemEl.dataset.itemCol);
        let index = Number(itemEl.dataset.itemIndex);
        if (ev.clientY > rect.top + rect.height / 2) index += 1;
        target = { col, index };
      } else if (!itemEl && containerRef.current) {
        // Empty space: choose the column under the pointer and append.
        const cr = containerRef.current.getBoundingClientRect();
        const inside = ev.clientX >= cr.left && ev.clientX <= cr.right && ev.clientY >= cr.top && ev.clientY <= cr.bottom;
        if (inside) {
          const col = colCount === 1 ? 0 : clamp(Math.floor((ev.clientX - cr.left) / (colWidth + GAP)), 0, COLS - 1);
          target = { col, index: columns[col].length };
        } else {
          target = null;
        }
      }
      setDropTarget(target);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (target) commit(id, target);
      setDragId(null);
      setDropTarget(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const move = (id: BoardId, dir: "up" | "down" | "left" | "right") => {
    let col = -1;
    let index = -1;
    columns.forEach((c, ci) => {
      const i = c.indexOf(id);
      if (i !== -1) {
        col = ci;
        index = i;
      }
    });
    if (col === -1) return;

    let target: DropTarget;
    if (dir === "up") {
      if (index === 0) return;
      target = { col, index: index - 1 };
    } else if (dir === "down") {
      if (index === columns[col].length - 1) return;
      target = { col, index: index + 2 };
    } else {
      const nextCol = dir === "left" ? col - 1 : col + 1;
      if (nextCol < 0 || nextCol >= columns.length) return;
      target = { col: nextCol, index: Math.min(index, columns[nextCol].length) };
    }
    commit(id, target);
    setPendingFocus(id);
  };

  // Absolutely-positioned insertion indicator (replaces the old in-flow line).
  const indicator = (() => {
    if (!dropTarget || !dragId) return null;
    const { col, index } = dropTarget;
    const x = colCount === 1 ? 0 : col * (colWidth + GAP);
    let y = 0;
    if (index > 0) {
      const above = columns[col][index - 1];
      const r = layout.rects.get(above);
      if (r) y = r.y + r.h + GAP / 2;
    } else {
      y = -GAP / 2;
    }
    return (
      <div
        className="board__drop-line"
        style={{ left: x, top: Math.max(0, y - 1.5), width: colCount === 1 ? "100%" : colWidth }}
      />
    );
  })();

  return (
    <>
      <main className="board" ref={containerRef} style={{ height: layout.height }}>
        {columns.flatMap((col, c) =>
          col.map((id, i) => {
            const rect = layout.rects.get(id);
            return (
              <div
                className={`board__item${dragId === id ? " is-dragging" : ""}`}
                data-board-item={id}
                data-item-col={c}
                data-item-index={i}
                key={id}
                ref={(node) => setItemRef(id, node)}
                style={
                  rect
                    ? { left: rect.x, top: rect.y, width: rect.w }
                    : { left: 0, top: 0, visibility: "hidden" }
                }
              >
                {!settings.locked && (
                  <div className="board__chrome">
                    <button
                      className="board__handle"
                      aria-label={`Reposition ${titleOf(id)}. Drag, or use arrow keys.`}
                      onPointerDown={startDrag(id)}
                      onKeyDown={(e) => {
                        const dir =
                          e.key === "ArrowUp"
                            ? "up"
                            : e.key === "ArrowDown"
                              ? "down"
                              : e.key === "ArrowLeft"
                                ? "left"
                                : e.key === "ArrowRight"
                                  ? "right"
                                  : null;
                        if (dir) {
                          e.preventDefault();
                          move(id, dir);
                        }
                      }}
                    >
                      <GripIcon />
                    </button>
                    {colCount > 1 && (
                      <WidthControl span={spanOf(spans, id)} onSet={(s) => setSpan(id, c, s)} />
                    )}
                  </div>
                )}
                {cardOf(id)}
              </div>
            );
          }),
        )}
        {indicator}
      </main>
      {dragId && (
        <div className="board__ghost" ref={ghostRef} style={{ left: startPos.current.x, top: startPos.current.y }}>
          {titleOf(dragId)}
        </div>
      )}
    </>
  );
}
