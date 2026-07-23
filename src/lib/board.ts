// Pure data helpers for the Dashboard's user-arranged board: which cards
// exist, their default arrangement, and the reorder math for drag/keyboard
// moves. Kept dependency-free so both settings.tsx (load-time validation)
// and Board.tsx (drag logic) can import it without a circular reference.

export type CardId = "search" | "weather" | "todos" | "reading" | "news" | "football" | "shows" | "stocks";

// User-generated widgets (see lib/customWidgets.tsx) live on the board next
// to the built-in cards, keyed by a "custom:" prefix so the two id spaces
// can't collide.
export type CustomId = `custom:${string}`;
export type BoardId = CardId | CustomId;

export const isCustomId = (id: string): id is CustomId => id.startsWith("custom:");

export const CARD_IDS: CardId[] = ["search", "weather", "todos", "reading", "news", "football", "shows", "stocks"];

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
  ["search", "weather", "todos", "reading"],
  ["news"],
  ["football", "shows", "stocks"],
];

export const DEFAULT_SPANS: Spans = { search: 3 };

/**
 * Guarantee every known card appears exactly once, tolerating settings saved
 * by an older or newer build. `customIds` is the set of generated widgets
 * that currently exist — board entries pointing at deleted widgets are
 * dropped, and widgets missing from the board are slotted in. Built-in cards
 * in `hidden` (left out during onboarding) are dropped and stay off.
 */
export function normalizeBoard(
  board: unknown,
  customIds: CustomId[] = [],
  hidden: CardId[] = [],
): BoardId[][] {
  const shown = CARD_IDS.filter((id) => !hidden.includes(id));
  const known = new Set<string>([...shown, ...customIds]);
  const raw = Array.isArray(board) ? (board as unknown[]) : DEFAULT_BOARD;
  const cols: BoardId[][] = [0, 1, 2].map((i) =>
    Array.isArray(raw[i])
      ? (raw[i] as unknown[]).filter((id): id is BoardId => typeof id === "string" && known.has(id))
      : [],
  );
  const present = new Set(cols.flat());

  // Search was added after the original built-ins. Existing users should get
  // it in the same useful first-run position instead of at the bottom of
  // whichever column happened to be shortest — unless they've left it off.
  if (!present.has("search") && !hidden.includes("search")) {
    cols[0].unshift("search");
    present.add("search");
  }

  for (const id of [...shown, ...customIds]) {
    if (present.has(id)) continue;
    cols.reduce((shortest, c) => (c.length < shortest.length ? c : shortest)).push(id);
  }
  return cols;
}

/**
 * Spread cards so no column sits empty while another stacks several — a board
 * holding only a few onboarding picks should still fill its width.
 */
export function balanceBoard(columns: BoardId[][]): BoardId[][] {
  const next = columns.map((c) => [...c]);
  for (;;) {
    const empty = next.find((c) => c.length === 0);
    const longest = next.reduce((a, b) => (b.length > a.length ? b : a));
    if (!empty || longest.length < 2) return next;
    empty.push(longest.pop()!);
  }
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
