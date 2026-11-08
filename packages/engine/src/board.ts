/**
 * The board: a 15×15 grid, its bonus squares, and the tiles placed on it.
 *
 * Coordinates are `{ row, col }`, both 0-based, (0, 0) being the top-left
 * corner. The center square (7, 7) is where the first word must be played.
 */

import type { Letter } from './tiles';

export const BOARD_SIZE = 15;
export const CENTER = Math.floor(BOARD_SIZE / 2); // 7

export interface Position {
  readonly row: number;
  readonly col: number;
}

/**
 * Bonus square kinds:
 * - DL / TL: the letter placed there counts double / triple;
 * - DW / TW: the whole word counts double / triple.
 * A bonus only applies on the turn a tile is placed on it.
 */
export type Premium = 'DL' | 'TL' | 'DW' | 'TW';

/**
 * MaitreMot's own bonus layout, described for one eighth of the board only
 * (rows 0–7, col >= row). `buildPremiumLayout` mirrors it across the diagonal
 * and both axes, so the board has the same 8-fold symmetry as a classic board
 * while keeping its own, distinctive arrangement.
 *
 * Resulting totals: 8 TW, 16 DW, 12 TL, 28 DL. The center is a plain start square.
 */
const PREMIUM_OCTANT: ReadonlyArray<readonly [row: number, col: number, premium: Premium]> = [
  [0, 0, 'DW'],
  [0, 4, 'TW'],
  [0, 7, 'DL'],
  [1, 2, 'DL'],
  [1, 5, 'TL'],
  [2, 2, 'DW'],
  [2, 6, 'DL'],
  [3, 3, 'DL'],
  [3, 7, 'DW'],
  [4, 4, 'TL'],
  [5, 5, 'DW'],
  [6, 6, 'DL'],
];

/** Builds the full 15×15 bonus grid (`null` = plain square) from the octant above. */
function buildPremiumLayout(): ReadonlyArray<ReadonlyArray<Premium | null>> {
  const grid: (Premium | null)[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array<Premium | null>(BOARD_SIZE).fill(null),
  );
  const last = BOARD_SIZE - 1;
  for (const [r, c, premium] of PREMIUM_OCTANT) {
    // The 8 symmetric images of (r, c): swap row/col, then mirror each axis.
    for (const [a, b] of [
      [r, c],
      [c, r],
    ] as const) {
      for (const row of [a, last - a]) {
        for (const col of [b, last - b]) {
          grid[row]![col] = premium;
        }
      }
    }
  }
  return grid;
}

/** Bonus layout, indexed `[row][col]`. */
export const PREMIUM_LAYOUT = buildPremiumLayout();

export function premiumAt(pos: Position): Premium | null {
  return PREMIUM_LAYOUT[pos.row]?.[pos.col] ?? null;
}

/** A tile lying on the board. For a blank, `letter` is the letter chosen by the player. */
export interface BoardCell {
  readonly letter: Letter;
  readonly isBlank: boolean;
  readonly tileId: number;
}

/**
 * The board contents, indexed `[row][col]`, `null` for an empty square.
 * Treated as immutable: functions return a new board instead of mutating it.
 */
export type Board = ReadonlyArray<ReadonlyArray<BoardCell | null>>;

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => Array<BoardCell | null>(BOARD_SIZE).fill(null));
}

export function isOnBoard(pos: Position): boolean {
  return pos.row >= 0 && pos.row < BOARD_SIZE && pos.col >= 0 && pos.col < BOARD_SIZE;
}

/** Cell at `pos`, or `null` if the square is empty or outside the board. */
export function cellAt(board: Board, pos: Position): BoardCell | null {
  return board[pos.row]?.[pos.col] ?? null;
}

export function isBoardEmpty(board: Board): boolean {
  return board.every((row) => row.every((cell) => cell === null));
}

/** Returns a copy of `board` with the given cells added. Rows not touched are shared. */
export function withCells(
  board: Board,
  cells: ReadonlyArray<{ readonly pos: Position; readonly cell: BoardCell }>,
): Board {
  const rows = [...board];
  for (const { pos, cell } of cells) {
    const row = [...(rows[pos.row] ?? [])];
    row[pos.col] = cell;
    rows[pos.row] = row;
  }
  return rows;
}
