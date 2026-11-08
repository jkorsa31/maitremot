/**
 * Tiles: the letters, their point values and how many of each are in the bag.
 *
 * Words are always handled as UPPERCASE letters A–Z without accents: in French
 * word games "É", "È", "Ê"... are all played with a plain "E" tile. The
 * dictionary builder (step 3) strips accents the same way.
 */

/** The 26 playable letters. */
export const LETTERS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
] as const; // prettier-ignore

export type Letter = (typeof LETTERS)[number];

/** Type guard: is `value` a single uppercase letter A–Z? */
export function isLetter(value: string): value is Letter {
  return value.length === 1 && value >= 'A' && value <= 'Z';
}

/**
 * A physical tile. A blank ("joker") has `letter: null` while it sits on a
 * rack or in the bag; the player picks the letter it stands for only when
 * placing it on the board (see `Placement` in move.ts).
 *
 * Each tile has a unique `id` so the UI can track it during drag & drop and so
 * we can check that a player really owns the tiles they try to play.
 */
export interface Tile {
  readonly id: number;
  readonly letter: Letter | null;
}

export function isBlank(tile: Tile): boolean {
  return tile.letter === null;
}

/** Count and point value of one kind of tile. */
export interface TileSpec {
  readonly count: number;
  readonly points: number;
}

/**
 * Tile set tuned for French: 100 letters + 2 blanks = 102 tiles.
 * Frequent letters (E, A, I...) are worth 1 point, rare ones (K, W, X, Y, Z) 10.
 */
export const FRENCH_TILE_SET: {
  readonly letters: Record<Letter, TileSpec>;
  readonly blanks: number;
} = {
  letters: {
    A: { count: 9, points: 1 },
    B: { count: 2, points: 3 },
    C: { count: 2, points: 3 },
    D: { count: 3, points: 2 },
    E: { count: 15, points: 1 },
    F: { count: 2, points: 4 },
    G: { count: 2, points: 2 },
    H: { count: 2, points: 4 },
    I: { count: 8, points: 1 },
    J: { count: 1, points: 8 },
    K: { count: 1, points: 10 },
    L: { count: 5, points: 1 },
    M: { count: 3, points: 2 },
    N: { count: 6, points: 1 },
    O: { count: 6, points: 1 },
    P: { count: 2, points: 3 },
    Q: { count: 1, points: 8 },
    R: { count: 6, points: 1 },
    S: { count: 6, points: 1 },
    T: { count: 6, points: 1 },
    U: { count: 6, points: 1 },
    V: { count: 2, points: 4 },
    W: { count: 1, points: 10 },
    X: { count: 1, points: 10 },
    Y: { count: 1, points: 10 },
    Z: { count: 1, points: 10 },
  },
  blanks: 2,
};

/** Point value of a tile. Blanks are always worth 0, whatever letter they stand for. */
export function tilePoints(tile: Tile): number {
  return tile.letter === null ? 0 : FRENCH_TILE_SET.letters[tile.letter].points;
}

/** Point value of a letter played from a regular (non-blank) tile. */
export function letterPoints(letter: Letter): number {
  return FRENCH_TILE_SET.letters[letter].points;
}

/** Builds the full, ordered (unshuffled) list of tiles, with ids 0..101. */
export function createTileSet(): Tile[] {
  const tiles: Tile[] = [];
  let nextId = 0;
  for (const letter of LETTERS) {
    for (let i = 0; i < FRENCH_TILE_SET.letters[letter].count; i++) {
      tiles.push({ id: nextId++, letter });
    }
  }
  for (let i = 0; i < FRENCH_TILE_SET.blanks; i++) {
    tiles.push({ id: nextId++, letter: null });
  }
  return tiles;
}
