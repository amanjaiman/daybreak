// Pure data helpers for the Dashboard's user-arranged board: which cards
// exist, their default arrangement, and the reorder math for drag/keyboard
// moves. Kept dependency-free so both settings.tsx (load-time validation)
// and Board.tsx (drag logic) can import it without a circular reference.

export type CardId = "weather" | "todos" | "reading" | "news" | "football" | "shows" | "stocks";

// User-generated widgets (see lib/customWidgets.tsx) live on the board next
// to the built-in cards, keyed by a "custom:" prefix so the two id spaces
// can't collide.
export type CustomId = `custom:${string}`;
export type BoardId = CardId | CustomId;

export const isCustomId = (id: string): id is CustomId => id.startsWith("custom:");

export const CARD_IDS: CardId[] = ["weather", "todos", "reading", "news", "football", "shows", "stocks"];

// How many of the (up to 3) columns a card spans on the grid. A card anchored
// in column c can be at most 3 - c wide (column 2 is always width 1), so its
// span never overflows the board. Only non-default widths (2, 3) are stored.
export type Span = 1 | 2 | 3;
export type Spans = Partial<Record<BoardId, 2 | 3>>;

export const spanOf = (spans: Spans | undefined, id: BoardId): Span => spans?.[id] ?? 1;

/** Widest a card in column `col` may be, given `colCount` columns total. */
export const maxSpan = (col: number, colCount = 3): Span => Math.max(1, colCount - col) as Span;

export const clampSpan = (span: number, col: number, colCount = 3): Span =>
  (Math.min(Math.max(1, Math.round(span)), maxSpan(col, colCount)) as Span);

/**
 * Keep spans consistent with the board: drop entries for cards no longer on it,
 * clamp each remaining span to what its column allows, and store only 2/3.
 */
export function normalizeSpans(spans: unknown, columns: BoardId[][]): Spans {
  const raw = (spans && typeof spans === "object" ? spans : {}) as Record<string, unknown>;
  const out: Spans = {};
  columns.forEach((col, c) => {
    for (const id of col) {
      const s = clampSpan(Number(raw[id]) || 1, c);
      if (s !== 1) out[id] = s;
    }
  });
  return out;
}

// Three user-arranged columns. This grouping approximates the old masonry
// layout's natural packing as a sane starting point for first-run users.
export const DEFAULT_BOARD: BoardId[][] = [
  ["weather", "todos", "reading"],
  ["news"],
  ["football", "shows", "stocks"],
];

/**
 * Guarantee every known card appears exactly once, tolerating settings saved
 * by an older or newer build. `customIds` is the set of generated widgets
 * that currently exist — board entries pointing at deleted widgets are
 * dropped, and widgets missing from the board are slotted in.
 */
export function normalizeBoard(board: unknown, customIds: CustomId[] = []): BoardId[][] {
  const known = new Set<string>([...CARD_IDS, ...customIds]);
  const raw = Array.isArray(board) ? (board as unknown[]) : DEFAULT_BOARD;
  const cols: BoardId[][] = [0, 1, 2].map((i) =>
    Array.isArray(raw[i])
      ? (raw[i] as unknown[]).filter((id): id is BoardId => typeof id === "string" && known.has(id))
      : [],
  );
  const present = new Set(cols.flat());
  for (const id of [...CARD_IDS, ...customIds]) {
    if (present.has(id)) continue;
    cols.reduce((shortest, c) => (c.length < shortest.length ? c : shortest)).push(id);
  }
  return cols;
}

/** Move `id` to `target` (a column + insertion index, measured before removal), returning new columns. */
export function reorderBoard(
  columns: BoardId[][],
  id: BoardId,
  target: { col: number; index: number },
): BoardId[][] {
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
