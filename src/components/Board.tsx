import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { CardId } from "../lib/board";
import { reorderBoard } from "../lib/board";
import { useSettings } from "../lib/settings";
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

/**
 * Cards you drag to arrange, in three columns you own. The floating label's
 * position is written straight to the DOM in the pointermove handler
 * (bypassing React state) so dragging stays smooth without re-rendering all
 * seven cards on every pixel of movement — only dragId/dropTarget (which
 * change rarely, on crossing an item boundary) go through React state.
 */
export function Board() {
  const { settings, update } = useSettings();
  const columns = settings.board;
  const [dragId, setDragId] = useState<CardId | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [pendingFocus, setPendingFocus] = useState<CardId | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const startPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!pendingFocus) return;
    document
      .querySelector<HTMLButtonElement>(`[data-board-item="${pendingFocus}"] .board__handle`)
      ?.focus();
    setPendingFocus(null);
  }, [pendingFocus]);

  const commit = (id: CardId, target: DropTarget) => update({ board: reorderBoard(columns, id, target) });

  const startDrag = (id: CardId) => (e: ReactPointerEvent<HTMLButtonElement>) => {
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
      const colEl = el ? (el.closest("[data-board-col]") as HTMLElement | null) : null;

      if (itemEl && itemEl.dataset.boardItem !== id) {
        const rect = itemEl.getBoundingClientRect();
        const col = Number(itemEl.dataset.itemCol);
        let index = Number(itemEl.dataset.itemIndex);
        if (ev.clientY > rect.top + rect.height / 2) index += 1;
        target = { col, index };
      } else if (colEl && !itemEl) {
        const col = Number(colEl.dataset.boardCol);
        target = { col, index: columns[col].length };
      } else {
        target = null;
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

  const move = (id: CardId, dir: "up" | "down" | "left" | "right") => {
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

  return (
    <>
      <main className="board">
        {columns.map((col, c) => (
          <div className="board__col" data-board-col={c} key={c}>
            {col.map((id, i) => (
              <div
                className={`board__item${dragId === id ? " is-dragging" : ""}`}
                data-board-item={id}
                data-item-col={c}
                data-item-index={i}
                key={id}
              >
                {dropTarget?.col === c && dropTarget.index === i && dragId !== id && (
                  <div className="board__drop-line" />
                )}
                <button
                  className="board__handle"
                  aria-label={`Reposition ${TITLES[id]}. Drag, or use arrow keys.`}
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
                {CARDS[id]}
              </div>
            ))}
            {dropTarget?.col === c && dropTarget.index === col.length && (
              <div className="board__drop-line" />
            )}
          </div>
        ))}
      </main>
      {dragId && (
        <div
          className="board__ghost"
          ref={ghostRef}
          style={{ left: startPos.current.x, top: startPos.current.y }}
        >
          {TITLES[dragId]}
        </div>
      )}
    </>
  );
}
