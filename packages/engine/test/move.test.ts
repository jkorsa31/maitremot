import { describe, expect, it } from 'vitest';
import { analyzePlacement, createEmptyBoard, scoreMove, scoreWord } from '../src';
import { boardWith, placed } from './helpers';

const empty = createEmptyBoard();
/** Board with "MOT" across the center: M(7,6) O(7,7) T(7,8). */
const withMot = boardWith([{ row: 7, col: 6 }, 'horizontal', 'MOT']);

function words(result: ReturnType<typeof analyzePlacement>): string[] {
  if (!result.ok) throw new Error(`Unexpected error ${result.error.code}`);
  return result.value.words.map((w) => w.word);
}

describe('placement rules', () => {
  it('accepts a first word through the center', () => {
    expect(words(analyzePlacement(empty, placed({ row: 7, col: 6 }, 'horizontal', 'MOT')))).toEqual(
      ['MOT'],
    );
  });

  it.each([
    ['no tiles', [], 'NO_TILES'],
    [
      'first word off center',
      placed({ row: 0, col: 0 }, 'horizontal', 'MOT'),
      'FIRST_MOVE_NOT_ON_CENTER',
    ],
    [
      'single tile first move',
      placed({ row: 7, col: 7 }, 'horizontal', 'A'),
      'FIRST_MOVE_TOO_SHORT',
    ],
    ['out of board', placed({ row: 7, col: 13 }, 'horizontal', 'MOT'), 'OUT_OF_BOARD'],
    [
      'not in line',
      [
        ...placed({ row: 7, col: 7 }, 'horizontal', 'A'),
        ...placed({ row: 8, col: 8 }, 'horizontal', 'B'),
      ],
      'NOT_IN_LINE',
    ],
    ['gap', placed({ row: 7, col: 6 }, 'horizontal', 'M.T'), 'GAP_IN_WORD'],
  ])('refuses %s', (_name, tiles, code) => {
    const result = analyzePlacement(empty, tiles);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });

  it('refuses a tile on an occupied square', () => {
    const result = analyzePlacement(withMot, placed({ row: 7, col: 7 }, 'vertical', 'AS'));
    expect(!result.ok && result.error.code).toBe('SQUARE_OCCUPIED');
  });

  it('refuses a word not touching the board', () => {
    const result = analyzePlacement(withMot, placed({ row: 0, col: 0 }, 'horizontal', 'LA'));
    expect(!result.ok && result.error.code).toBe('NOT_CONNECTED');
  });

  it('refuses the same square twice', () => {
    const tiles = [
      ...placed({ row: 7, col: 7 }, 'horizontal', 'A'),
      ...placed({ row: 7, col: 7 }, 'horizontal', 'B'),
    ];
    const result = analyzePlacement(empty, tiles);
    expect(!result.ok && result.error.code).toBe('DUPLICATE_POSITION');
  });
});

describe('formed words', () => {
  it('extends an existing word (MOT → MOTS)', () => {
    expect(words(analyzePlacement(withMot, placed({ row: 7, col: 9 }, 'horizontal', 'S')))).toEqual(
      ['MOTS'],
    );
  });

  it('fills a gap with an existing tile (O of MOT inside a vertical word)', () => {
    // "DOS" vertical through the O at (7,7): D at (6,7), S at (8,7).
    expect(words(analyzePlacement(withMot, placed({ row: 6, col: 7 }, 'vertical', 'D.S')))).toEqual(
      ['DOS'],
    );
  });

  it('collects cross words', () => {
    // "EU" played under "MO": E at (8,6), U at (8,7) → EU across, ME and OU down.
    expect(
      words(analyzePlacement(withMot, placed({ row: 8, col: 6 }, 'horizontal', 'EU'))),
    ).toEqual(['EU', 'ME', 'OU']);
  });

  it('finds the vertical word of a single tile', () => {
    // "A" under the T: forms "TA" downwards only.
    expect(words(analyzePlacement(withMot, placed({ row: 8, col: 8 }, 'horizontal', 'A')))).toEqual(
      ['TA'],
    );
  });
});

describe('scoring', () => {
  function analyzed(board: ReturnType<typeof createEmptyBoard>, tiles: ReturnType<typeof placed>) {
    const result = analyzePlacement(board, tiles);
    if (!result.ok) throw new Error(result.error.code);
    return result.value.words;
  }

  it('sums letter values on plain squares', () => {
    // M=2, O=1, T=1 on plain squares.
    const [mot] = analyzed(empty, placed({ row: 7, col: 6 }, 'horizontal', 'MOT'));
    expect(scoreWord(mot!)).toBe(4);
  });

  it('applies a double word bonus', () => {
    // (7,3) is a DW: "ZEROS" from (7,3) to (7,7) = (10+1+1+1+1) × 2.
    const [w] = analyzed(empty, placed({ row: 7, col: 3 }, 'horizontal', 'ZEROS'));
    expect(scoreWord(w!)).toBe(28);
  });

  it('gives no points to a blank, even on a letter bonus', () => {
    // (6,6) is a DL. Vertical "zA" from (6,6): blank Z (0) + A (1).
    const board = boardWith([{ row: 7, col: 5 }, 'horizontal', 'BAS']);
    const [w] = analyzed(board, placed({ row: 6, col: 6 }, 'vertical', 'z'));
    expect(w!.word).toBe('ZA');
    expect(scoreWord(w!)).toBe(1);
  });

  it('only applies bonuses to newly placed tiles', () => {
    // ZEROS already on the DW at (7,3); adding S at the end scores letters only.
    const board = boardWith([{ row: 7, col: 3 }, 'horizontal', 'ZERO']);
    const [w] = analyzed(board, placed({ row: 7, col: 7 }, 'horizontal', 'S'));
    expect(scoreWord(w!)).toBe(14);
  });

  it('adds 50 points when the 7 tiles are played', () => {
    const tiles = placed({ row: 7, col: 4 }, 'horizontal', 'ARTISTE');
    const result = scoreMove(analyzed(empty, tiles), tiles.length);
    expect(result.bonus).toBe(50);
    expect(result.total).toBe(result.words[0]!.score + 50);
  });
});
