import { describe, expect, it } from 'vitest';
import {
  type Board,
  type Direction,
  type GeneratedMove,
  type Letter,
  type PlacedTile,
  type Position,
  type Tile,
  BOARD_SIZE,
  LETTERS,
  analyzePlacement,
  buildDawg,
  cellAt,
  createEmptyBoard,
  generateMoves,
  scoreMove,
} from '../src';
import { boardWith, tilesOf } from './helpers';

const WORDS = [
  'AS', 'ES', 'ET', 'EU', 'IL', 'LA', 'LE', 'MA', 'ME', 'MI', 'MU', 'NE', 'NI', 'NU', 'OS', 'OU',
  'SA', 'SE', 'SI', 'TA', 'TE', 'TU', 'UN', 'ARE', 'ART', 'MAT', 'MAL', 'MER', 'MIE', 'MOT',
  'MOTS', 'NOM', 'NOTE', 'OSE', 'RAT', 'RATE', 'RATES', 'RIME', 'ROSE', 'SALE', 'SEL', 'SOL',
  'TAS', 'TEL', 'TOME', 'TOMES', 'TRAM', 'ARMES', 'MATES', 'METS', 'MOTEL', 'MOTELS', 'LIMES',
  'ETE', 'ETES', 'SAMOURAI', 'REMISAIT', 'MERITAS', 'MISERAT', 'TRAMES',
]; // prettier-ignore
const dawg = buildDawg(WORDS, LETTERS.join(''));
const dictionary = new Set(WORDS);

const key = (move: { placements: readonly { pos: Position; letter: Letter; blank: boolean }[] }) =>
  move.placements
    .map((p) => `${p.pos.row},${p.pos.col},${p.letter}${p.blank ? '*' : ''}`)
    .sort()
    .join(' ');

/** Generated moves as comparable `key → score` entries. */
function generated(board: Board, rack: Tile[]): Map<string, number> {
  const result = new Map<string, number>();
  const moves: GeneratedMove[] = generateMoves(board, rack, dawg);
  for (const move of moves) {
    const k = key({
      placements: move.placements.map((p) => {
        const tile = rack.find((t) => t.id === p.tileId)!;
        return { pos: p.pos, letter: (p.letter ?? tile.letter)!, blank: tile.letter === null };
      }),
    });
    expect(result.has(k), `duplicate move ${k}`).toBe(false);
    result.set(k, move.score);
  }
  return result;
}

/**
 * Reference implementation: tries EVERY ordered selection of rack tiles from
 * EVERY square in both directions, and asks the rules engine whether it is
 * legal. Slow but obviously correct.
 */
function bruteForce(board: Board, rack: Tile[]): Map<string, number> {
  const result = new Map<string, number>();
  const tryTiles = (tiles: PlacedTile[]) => {
    const analysis = analyzePlacement(board, tiles);
    if (!analysis.ok || !analysis.value.words.every((w) => dictionary.has(w.word))) return;
    const k = key({
      placements: tiles.map((t) => ({ pos: t.pos, letter: t.cell.letter, blank: t.cell.isBlank })),
    });
    result.set(k, scoreMove(analysis.value.words, tiles.length).total);
  };

  const extend = (pos: Position, dir: Direction, used: Set<number>, tiles: PlacedTile[]) => {
    // Skip occupied squares: the next tile goes on the next free one.
    while (pos.row < BOARD_SIZE && pos.col < BOARD_SIZE && cellAt(board, pos)) {
      pos = dir === 'horizontal' ? { ...pos, col: pos.col + 1 } : { ...pos, row: pos.row + 1 };
    }
    if (pos.row >= BOARD_SIZE || pos.col >= BOARD_SIZE) return;
    const next = dir === 'horizontal' ? { ...pos, col: pos.col + 1 } : { ...pos, row: pos.row + 1 };
    rack.forEach((tile, i) => {
      if (used.has(i)) return;
      const letters = tile.letter === null ? LETTERS : [tile.letter];
      for (const letter of letters) {
        const placed = [
          ...tiles,
          { pos, cell: { letter, isBlank: tile.letter === null, tileId: tile.id } },
        ];
        tryTiles(placed);
        extend(next, dir, new Set([...used, i]), placed);
      }
    });
  };

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (cellAt(board, { row, col })) continue;
      for (const dir of ['horizontal', 'vertical'] as const)
        extend({ row, col }, dir, new Set(), []);
    }
  }
  return result;
}

describe('move generator', () => {
  it.each([
    ['empty board', createEmptyBoard(), 'MOTSE'],
    ['one word', boardWith([{ row: 7, col: 5 }, 'horizontal', 'RATE']), 'MOSLE'],
    [
      'crossing words',
      boardWith(
        [{ row: 7, col: 5 }, 'horizontal', 'RATE'],
        [{ row: 5, col: 8 }, 'vertical', 'NOTE'],
        [{ row: 10, col: 6 }, 'horizontal', 'TEL'],
      ),
      'MOSLA',
    ],
    ['with a blank', boardWith([{ row: 7, col: 6 }, 'horizontal', 'MOT']), 'E?S'],
    ['board edge', boardWith([{ row: 0, col: 11 }, 'horizontal', 'TOME']), 'SARE'],
  ])('finds exactly the legal moves, with the right scores (%s)', (_name, board, letters) => {
    const rack = tilesOf(letters);
    const expected = bruteForce(board, rack);
    const actual = generated(board, rack);
    expect(expected.size).toBeGreaterThan(0);
    expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
    for (const [k, score] of expected) expect(actual.get(k), k).toBe(score);
  });

  it('counts the 50-point bonus for a 7-tile move', () => {
    const moves = generateMoves(createEmptyBoard(), tilesOf('SAMOURI'), dawg);
    expect(moves.some((m) => m.word === 'SAMOURAI')).toBe(false); // needs 8 letters
    const all7 = generateMoves(
      boardWith([{ row: 7, col: 7 }, 'vertical', 'A']),
      tilesOf('SMOURAI'),
      dawg,
    ).filter((m) => m.placements.length === 7);
    expect(all7.length).toBeGreaterThan(0);
    for (const move of all7) expect(move.score).toBeGreaterThan(50);
  });

  it('returns the leave (tiles kept)', () => {
    const rack = tilesOf('MOTXX');
    const mot = generateMoves(createEmptyBoard(), rack, dawg).find((m) => m.word === 'MOT')!;
    expect(mot.leave.map((t) => t.letter)).toEqual(['X', 'X']);
  });

  it('finds nothing when no word fits', () => {
    expect(generateMoves(createEmptyBoard(), tilesOf('XXXX'), dawg)).toEqual([]);
  });
});
