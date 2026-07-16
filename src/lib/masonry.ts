// Pinned-column masonry with spans. Cards keep the column the user put them
// in; a card can span 2-3 columns, in which case it sits below everything
// above it in every column it covers, and the covered columns resume below it.
// Pure (no DOM) so it's easy to reason about and test — Board.tsx feeds it
// measured heights and applies the resulting rectangles.

import { clampSpan, spanOf } from "./board";
import type { BoardId, Spans } from "./board";

export type Rect = { x: number; y: number; w: number; h: number };
export type Layout = { rects: Map<BoardId, Rect>; height: number };

/**
 * Place every card. `columns` is the board (up to 3 ordered columns); `heights`
 * are the measured pixel heights per card; `colWidth`/`gap` size the tracks.
 * With `colCount === 1` (mobile), all columns are flattened into one stack and
 * spans are ignored.
 */
export function computeLayout(
  columns: BoardId[][],
  spans: Spans,
  heights: Map<BoardId, number>,
  colCount: number,
  colWidth: number,
  gap: number,
): Layout {
  const rects = new Map<BoardId, Rect>();

  if (colCount <= 1) {
    let y = 0;
    for (const col of columns) {
      for (const id of col) {
        const h = heights.get(id) ?? 0;
        rects.set(id, { x: 0, y, w: colWidth, h });
        y += h + gap;
      }
    }
    return { rects, height: Math.max(0, y - gap) };
  }

  const colY = new Array<number>(colCount).fill(0);
  const ptr = columns.map(() => 0);
  let left = columns.reduce((n, col) => n + col.length, 0);

  while (left > 0) {
    // The column that still has cards and whose stack is currently shortest
    // (leftmost wins ties, so a spanning card from the left claims the top).
    let c = -1;
    for (let k = 0; k < colCount; k++) {
      if (ptr[k] >= columns[k].length) continue;
      if (c === -1 || colY[k] < colY[c]) c = k;
    }

    const id = columns[c][ptr[c]];
    const s = clampSpan(spanOf(spans, id), c, colCount);
    // A spanning card must clear the bottom of every column it covers.
    let top = 0;
    for (let k = c; k < c + s; k++) top = Math.max(top, colY[k]);
    const h = heights.get(id) ?? 0;
    rects.set(id, {
      x: c * (colWidth + gap),
      y: top,
      w: s * colWidth + (s - 1) * gap,
      h,
    });
    for (let k = c; k < c + s; k++) colY[k] = top + h + gap;
    ptr[c]++;
    left--;
  }

  return { rects, height: Math.max(0, Math.max(...colY) - gap) };
}
