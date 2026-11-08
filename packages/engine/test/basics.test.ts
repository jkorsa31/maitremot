import { describe, expect, it } from 'vitest';
import {
  BOARD_SIZE,
  CENTER,
  FRENCH_TILE_SET,
  PREMIUM_LAYOUT,
  createRng,
  createSetWordList,
  createTileSet,
  isLetter,
  normalizeWord,
  premiumAt,
  shuffle,
} from '../src';

describe('tile set', () => {
  it('has 102 tiles including 2 blanks, with unique ids', () => {
    const tiles = createTileSet();
    expect(tiles).toHaveLength(102);
    expect(tiles.filter((t) => t.letter === null)).toHaveLength(2);
    expect(new Set(tiles.map((t) => t.id)).size).toBe(102);
  });

  it('gives each letter its count', () => {
    const tiles = createTileSet();
    expect(tiles.filter((t) => t.letter === 'E')).toHaveLength(FRENCH_TILE_SET.letters.E.count);
    expect(tiles.filter((t) => t.letter === 'Z')).toHaveLength(1);
  });

  it('recognizes letters', () => {
    expect(isLetter('A')).toBe(true);
    expect(isLetter('a')).toBe(false);
    expect(isLetter('É')).toBe(false);
    expect(isLetter('AB')).toBe(false);
  });
});

describe('board layout', () => {
  const counts = (premium: string) => PREMIUM_LAYOUT.flat().filter((p) => p === premium).length;

  it('has the expected number of each bonus', () => {
    expect(counts('TW')).toBe(8);
    expect(counts('DW')).toBe(16);
    expect(counts('TL')).toBe(12);
    expect(counts('DL')).toBe(28);
  });

  it('is symmetric along both axes and the diagonal', () => {
    const last = BOARD_SIZE - 1;
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const p = premiumAt({ row, col });
        expect(premiumAt({ row: col, col: row })).toBe(p);
        expect(premiumAt({ row: last - row, col })).toBe(p);
        expect(premiumAt({ row, col: last - col })).toBe(p);
      }
    }
  });

  it('has a plain center square', () => {
    expect(premiumAt({ row: CENTER, col: CENTER })).toBeNull();
  });
});

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('shuffles into a permutation without touching the input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const output = shuffle(input, createRng(1));
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...output].sort()).toEqual(input);
  });
});

describe('dictionary', () => {
  it('normalizes accents and ligatures', () => {
    expect(normalizeWord('Écrêté')).toBe('ECRETE');
    expect(normalizeWord('cœur')).toBe('COEUR');
    expect(normalizeWord('naïve')).toBe('NAIVE');
  });

  it('looks up normalized words', () => {
    const words = createSetWordList(['été', 'mot']);
    expect(words.has('ETE')).toBe(true);
    expect(words.has('MOT')).toBe(true);
    expect(words.has('MOTS')).toBe(false);
  });
});
