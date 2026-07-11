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
