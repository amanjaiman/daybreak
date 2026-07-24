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
  ["shows", "stocks"],
];

export const DEFAULT_SPANS: Spans = { search: 3 };

// Cards every board keeps — they never appear in `hidden` and aren't offered
// as choices during onboarding or in Personalize.
export const ALWAYS_ON: CardId[] = ["search", "todos", "reading"];

// Opt-in cards render if a board already has them, but are never auto-added.
// Football is a single-sport widget (a personal interest, not a universal
// framework), so new users don't get it — they'd generate a sport widget
// instead. Legacy boards that already have it keep it.
export const OPT_IN: CardId[] = ["football"];

/**
 * Guarantee every known card appears exactly once, tolerating settings saved
 * by an older or newer build. `customIds` is the set of generated widgets
 * that currently exist — board entries pointing at deleted widgets are
 * dropped, and widgets missing from the board are slotted in. Cards in
 * `hidden` (built-in or generated, left off via onboarding/Personalize) are
 * dropped and stay off; ALWAYS_ON cards can't be hidden; OPT_IN cards are
 * kept if present but never auto-added.
 */
export function normalizeBoard(
  board: unknown,
  customIds: CustomId[] = [],
  hidden: BoardId[] = [],
): BoardId[][] {
  const off = new Set<BoardId>(hidden.filter((id) => !ALWAYS_ON.includes(id as CardId)));
  // Cards allowed to stay on the board if already there (everything known and
  // not hidden — including opt-in cards like football).
  const known = new Set<string>([
    ...CARD_IDS.filter((id) => !off.has(id)),
    ...customIds.filter((id) => !off.has(id)),
  ]);
  // Cards to slot in when missing — excludes opt-in cards, which only appear
  // for boards that already carry them.
  const autoAdd = [
    ...CARD_IDS.filter((id) => !off.has(id) && !OPT_IN.includes(id)),
    ...customIds.filter((id) => !off.has(id)),
  ];
  const raw = Array.isArray(board) ? (board as unknown[]) : DEFAULT_BOARD;
  const cols: BoardId[][] = [0, 1, 2].map((i) =>
    Array.isArray(raw[i])
      ? (raw[i] as unknown[]).filter((id): id is BoardId => typeof id === "string" && known.has(id))
      : [],
  );
  const present = new Set(cols.flat());

  // Search was added after the original built-ins. Users whose saved board
  // predates it should get it in the same useful first-run position instead
  // of at the bottom of whichever column happened to be shortest.
  if (!present.has("search")) {
    cols[0].unshift("search");
    present.add("search");
  }

  for (const id of autoAdd) {
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
