/**
 * Move geometry: checks that tiles put on the board form a legal placement and
 * extracts every word the move creates.
 *
 * This module knows nothing about players, racks or the dictionary: it only
 * looks at the board. `game.ts` adds rack ownership and word validity on top.
 *
 * Rules enforced here:
 * 1. at least one tile, every tile on an empty square inside the board;
 * 2. all new tiles on a single row or a single column;
 * 3. no gap: between the first and last new tile, every square is filled
 *    (by a new tile or by one already on the board);
 * 4. first move: covers the center square and has at least 2 tiles;
 * 5. later moves: at least one new tile touches a tile already on the board.
 */

import {
  type Board,
  type BoardCell,
  type Position,
  CENTER,
  cellAt,
  isBoardEmpty,
  isOnBoard,
  withCells,
} from './board';
import type { Letter } from './tiles';

/** A tile the player wants to put down, already resolved to its letter. */
export interface PlacedTile {
  readonly pos: Position;
  readonly cell: BoardCell;
}

/** One letter of a formed word. `isNew` = placed during this move (bonuses apply). */
export interface WordCell {
  readonly pos: Position;
  readonly letter: Letter;
  readonly isBlank: boolean;
  readonly isNew: boolean;
}

export type Direction = 'horizontal' | 'vertical';

/** A word created (or extended) by a move. */
export interface FormedWord {
  readonly word: string;
  readonly direction: Direction;
  readonly cells: readonly WordCell[];
}

/** Reasons a placement can be refused. The UI turns these codes into French messages. */
export type PlacementError =
  | { readonly code: 'NO_TILES' }
  | { readonly code: 'OUT_OF_BOARD'; readonly pos: Position }
  | { readonly code: 'SQUARE_OCCUPIED'; readonly pos: Position }
  | { readonly code: 'DUPLICATE_POSITION'; readonly pos: Position }
  | { readonly code: 'NOT_IN_LINE' }
  | { readonly code: 'GAP_IN_WORD' }
  | { readonly code: 'FIRST_MOVE_NOT_ON_CENTER' }
  | { readonly code: 'FIRST_MOVE_TOO_SHORT' }
  | { readonly code: 'NOT_CONNECTED' };

/** Generic success-or-error value, used instead of exceptions for expected failures. */
export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export interface PlacementAnalysis {
  /** All words formed, the main word (along the move's line) first. */
  readonly words: readonly FormedWord[];
  /** The board as it would be after the move. */
  readonly board: Board;
}

/** Unit step along each direction. */
const STEP: Record<Direction, Position> = {
  horizontal: { row: 0, col: 1 },
  vertical: { row: 1, col: 0 },
};

const NEIGHBORS: readonly Position[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

function add(a: Position, b: Position, factor = 1): Position {
  return { row: a.row + b.row * factor, col: a.col + b.col * factor };
}

const posKey = (pos: Position): string => `${pos.row},${pos.col}`;

/**
 * Reads the full word passing through `start` along `direction` on `board`:
 * walks backwards to the first letter, then forwards to the last one.
 * Returns `null` when the "word" would be a single letter (that is not a word).
 */
function readWord(
  board: Board,
  start: Position,
  direction: Direction,
  newPositions: ReadonlySet<string>,
): FormedWord | null {
  const step = STEP[direction];
  let first = start;
  while (cellAt(board, add(first, step, -1)) !== null) first = add(first, step, -1);

  const cells: WordCell[] = [];
  for (let pos = first; ; pos = add(pos, step)) {
    const cell = cellAt(board, pos);
    if (cell === null) break;
    cells.push({
      pos,
      letter: cell.letter,
      isBlank: cell.isBlank,
      isNew: newPositions.has(posKey(pos)),
    });
  }
  if (cells.length < 2) return null;
  return { word: cells.map((c) => c.letter).join(''), direction, cells };
}

/**
 * Validates the geometry of a move and returns the words it forms.
 * Does NOT check the dictionary.
 */
export function analyzePlacement(
  board: Board,
  tiles: readonly PlacedTile[],
): Result<PlacementAnalysis, PlacementError> {
  const fail = (error: PlacementError) => ({ ok: false, error }) as const;

  // Rule 1: something to play, on free squares inside the board.
  if (tiles.length === 0) return fail({ code: 'NO_TILES' });
  const seen = new Set<string>();
  for (const { pos } of tiles) {
    if (!isOnBoard(pos)) return fail({ code: 'OUT_OF_BOARD', pos });
    if (cellAt(board, pos) !== null) return fail({ code: 'SQUARE_OCCUPIED', pos });
    if (seen.has(posKey(pos))) return fail({ code: 'DUPLICATE_POSITION', pos });
    seen.add(posKey(pos));
  }

  // Rule 2: a single line. With one tile both are true; we then pick
  // 'horizontal' as the main direction (the vertical word is found as a cross word).
  const first = tiles[0]!.pos;
  const sameRow = tiles.every((t) => t.pos.row === first.row);
  const sameCol = tiles.every((t) => t.pos.col === first.col);
  if (!sameRow && !sameCol) return fail({ code: 'NOT_IN_LINE' });
  const direction: Direction = sameRow ? 'horizontal' : 'vertical';
  const cross: Direction = direction === 'horizontal' ? 'vertical' : 'horizontal';

  const after = withCells(board, tiles);

  // Rule 3: no gap between the extreme new tiles (existing tiles may fill the holes).
  const along = (p: Position) => (direction === 'horizontal' ? p.col : p.row);
  const sorted = [...tiles].sort((a, b) => along(a.pos) - along(b.pos));
  const start = sorted[0]!.pos;
  const length = along(sorted[sorted.length - 1]!.pos) - along(start);
  for (let i = 0; i <= length; i++) {
    if (cellAt(after, add(start, STEP[direction], i)) === null)
      return fail({ code: 'GAP_IN_WORD' });
  }

  if (isBoardEmpty(board)) {
    // Rule 4: opening move.
    if (!seen.has(posKey({ row: CENTER, col: CENTER }))) {
      return fail({ code: 'FIRST_MOVE_NOT_ON_CENTER' });
    }
    if (tiles.length < 2) return fail({ code: 'FIRST_MOVE_TOO_SHORT' });
  } else {
    // Rule 5: must touch the existing tiles. Checking the neighbors of the new
    // tiles is enough: a tile "bridged" inside the main word is a neighbor too.
    const touches = tiles.some(({ pos }) =>
      NEIGHBORS.some((d) => cellAt(board, add(pos, d)) !== null),
    );
    if (!touches) return fail({ code: 'NOT_CONNECTED' });
  }

  // Collect words: the main word, then one cross word per new tile (if any).
  const words: FormedWord[] = [];
  const main = readWord(after, start, direction, seen);
  if (main) words.push(main);
  for (const { pos } of sorted) {
    const crossWord = readWord(after, pos, cross, seen);
    if (crossWord) words.push(crossWord);
  }

  return { ok: true, value: { words, board: after } };
}
