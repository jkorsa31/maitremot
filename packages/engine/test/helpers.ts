/**
 * Test helpers: build boards, racks and placements from short strings so the
 * tests read like the game ("put MOT across at row 7, col 6").
 */

import {
  type Board,
  type BoardCell,
  type Direction,
  type GameState,
  type Letter,
  type Placement,
  type PlacedTile,
  type Position,
  type Tile,
  createEmptyBoard,
  withCells,
} from '../src';

let nextTestTileId = 10_000;

/** Tiles for a word; '?' stands for a blank. */
export function tilesOf(letters: string): Tile[] {
  return [...letters].map((ch) => ({
    id: nextTestTileId++,
    letter: ch === '?' ? null : (ch as Letter),
  }));
}

/** Positions of a word starting at `start` and going in `direction`. */
export function positions(start: Position, direction: Direction, length: number): Position[] {
  return Array.from({ length }, (_, i) =>
    direction === 'horizontal'
      ? { row: start.row, col: start.col + i }
      : { row: start.row + i, col: start.col },
  );
}

/**
 * PlacedTiles (for move.ts) for `word` at `start`. Lowercase letters mean
 * "played with a blank". A '.' skips a square (used to leave existing tiles).
 */
export function placed(start: Position, direction: Direction, word: string): PlacedTile[] {
  return positions(start, direction, word.length)
    .map((pos, i) => ({ pos, ch: word[i]! }))
    .filter(({ ch }) => ch !== '.')
    .map(({ pos, ch }) => ({
      pos,
      cell: {
        letter: ch.toUpperCase() as Letter,
        isBlank: ch !== ch.toUpperCase(),
        tileId: nextTestTileId++,
      },
    }));
}

/** A board with the given words already on it. */
export function boardWith(
  ...words: Array<[start: Position, direction: Direction, word: string]>
): Board {
  let board = createEmptyBoard();
  for (const [start, direction, word] of words)
    board = withCells(board, placed(start, direction, word));
  return board;
}

/** Replaces the rack of player `index`; returns the new state and the new tiles. */
export function withRack(
  state: GameState,
  index: number,
  letters: string,
): { state: GameState; rack: Tile[] } {
  const rack = tilesOf(letters);
  return {
    state: { ...state, players: state.players.map((p, i) => (i === index ? { ...p, rack } : p)) },
    rack,
  };
}

/**
 * Placements (for game.ts) spelling `word` from `rack`. Lowercase letters are
 * played with a blank ('?') of the rack; '.' skips an already occupied square.
 */
export function placementsFor(
  rack: readonly Tile[],
  start: Position,
  direction: Direction,
  word: string,
): Placement[] {
  const available = [...rack];
  const result: Placement[] = [];
  positions(start, direction, word.length).forEach((pos, i) => {
    const ch = word[i]!;
    if (ch === '.') return;
    const isBlankLetter = ch !== ch.toUpperCase();
    const index = available.findIndex((t) => (isBlankLetter ? t.letter === null : t.letter === ch));
    if (index < 0) throw new Error(`No tile for "${ch}" in rack`);
    const tile = available.splice(index, 1)[0]!;
    result.push(
      isBlankLetter
        ? { tileId: tile.id, pos, letter: ch.toUpperCase() as Letter }
        : { tileId: tile.id, pos },
    );
  });
  return result;
}

export const cell = (letter: Letter, isBlank = false): BoardCell => ({
  letter,
  isBlank,
  tileId: -1,
});
