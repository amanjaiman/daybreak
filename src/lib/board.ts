// Pure data helpers for the Dashboard's user-arranged board: which cards
// exist, their default arrangement, and the reorder math for drag/keyboard
// moves. Kept dependency-free so both settings.tsx (load-time validation)
// and Board.tsx (drag logic) can import it without a circular reference.

export type CardId = "weather" | "todos" | "reading" | "news" | "football" | "shows" | "stocks";

export const CARD_IDS: CardId[] = ["weather", "todos", "reading", "news", "football", "shows", "stocks"];

// Three user-arranged columns. This grouping approximates the old masonry
// layout's natural packing as a sane starting point for first-run users.
export const DEFAULT_BOARD: CardId[][] = [
  ["weather", "todos", "reading"],
  ["news"],
  ["football", "shows", "stocks"],
];

/** Guarantee every known card appears exactly once, tolerating settings saved by an older or newer build. */
export function normalizeBoard(board: unknown): CardId[][] {
  const raw = Array.isArray(board) ? (board as unknown[]) : DEFAULT_BOARD;
  const cols: CardId[][] = [0, 1, 2].map((i) =>
    Array.isArray(raw[i])
      ? (raw[i] as unknown[]).filter((id): id is CardId => CARD_IDS.includes(id as CardId))
      : [],
  );
  const present = new Set(cols.flat());
  for (const id of CARD_IDS) {
    if (present.has(id)) continue;
    cols.reduce((shortest, c) => (c.length < shortest.length ? c : shortest)).push(id);
  }
  return cols;
}

/** Move `id` to `target` (a column + insertion index, measured before removal), returning new columns. */
export function reorderBoard(
  columns: CardId[][],
  id: CardId,
  target: { col: number; index: number },
): CardId[][] {
  const next = columns.map((c) => [...c]);
  let fromCol = -1;
  let fromIndex = -1;
  for (let c = 0; c < next.length; c++) {
    const i = next[c].indexOf(id);
    if (i !== -1) {
      fromCol = c;
      fromIndex = i;
      break;
    }
  }
  if (fromCol === -1) return columns;

  next[fromCol].splice(fromIndex, 1);
  let insertIndex = target.index;
  if (target.col === fromCol && fromIndex < target.index) insertIndex -= 1;
  next[target.col].splice(insertIndex, 0, id);
  return next;
}
