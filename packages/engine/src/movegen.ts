/**
 * Move generator: finds EVERY legal move for a rack on a board, with its score.
 *
 * This is the classic algorithm of Appel & Jacobson ("The World's Fastest
 * Scrabble Program", 1988), adapted to our DAWG. Main ideas:
 *
 * 1. **One direction at a time.** We only generate horizontal words. Vertical
 *    words are found by running the same code on the *transposed* board.
 *
 * 2. **Cross-checks.** Before searching a row, we compute for each empty square
 *    the set of letters that may go there without creating an invalid
 *    vertical word with the tiles above / below it (a 26-bit mask). The search
 *    then never tries a letter that would break a cross word.
 *
 * 3. **Anchors.** A new word must touch existing tiles, so it must cover at
 *    least one "anchor": an empty square next to a tile (the center square on
 *    an empty board). For each anchor we build:
 *    - a *left part*: letters placed on the free squares just left of the
 *      anchor (or the tiles already there, if any);
 *    - then we *extend right* from the anchor, letter by letter, following
 *      the DAWG, through empty squares (using rack tiles) and occupied
 *      squares (using the letter already there).
 *    The left part only uses squares that are NOT anchors, so each move is
 *    generated from exactly one anchor (its leftmost one): no duplicates.
 *
 * 4. **Scoring on the fly.** The score is accumulated while placing letters,
 *    which is much faster than calling `analyzePlacement` + `scoreMove` for
 *    each of the thousands of candidates. Unit tests check both give the
 *    same result.
 */

import { BOARD_SIZE, CENTER, type Board, type Position, premiumAt } from './board';
import type { Dawg, DawgNode } from './dawg';
import { stepIsFinal, stepTarget } from './dawg';
import type { Placement } from './game';
import { ALL_TILES_BONUS, RACK_SIZE } from './scoring';
import { LETTERS, type Tile, letterPoints } from './tiles';

export interface GeneratedMove {
  readonly placements: readonly Placement[];
  /** Total score, including cross words and the 7-tile bonus. */
  readonly score: number;
  /** The word along the move's line (cross words are not listed). */
  readonly word: string;
  readonly direction: 'horizontal' | 'vertical';
  /** Tiles left on the rack after the move, used by the AI to judge the leave. */
  readonly leave: readonly Tile[];
}

const N = BOARD_SIZE;
const ALL_LETTERS_MASK = (1 << 26) - 1;
const EMPTY = -1;
const POINTS = LETTERS.map((l) => letterPoints(l));

/**
 * The board as flat arrays, possibly transposed. Square (r, c) is at r * N + c.
 * `letters` holds letter indexes (0 = A ... 25 = Z) or EMPTY.
 */
interface Grid {
  readonly letters: Int8Array;
  readonly blanks: Uint8Array;
  readonly transposed: boolean;
}

function toGrid(board: Board, transposed: boolean): Grid {
  const letters = new Int8Array(N * N).fill(EMPTY);
  const blanks = new Uint8Array(N * N);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const cell = transposed ? board[c]?.[r] : board[r]?.[c];
      if (cell) {
        letters[r * N + c] = cell.letter.charCodeAt(0) - 65;
        blanks[r * N + c] = cell.isBlank ? 1 : 0;
      }
    }
  }
  return { letters, blanks, transposed };
}

/** Real board position of square (r, c) of a grid. */
function realPos(grid: Grid, r: number, c: number): Position {
  return grid.transposed ? { row: c, col: r } : { row: r, col: c };
}

/** Points of the tile already on square `i` (0 for a blank). */
function existingPoints(grid: Grid, i: number): number {
  return grid.blanks[i] ? 0 : POINTS[grid.letters[i]!]!;
}

const LETTER_MULTIPLIER = { DL: 2, TL: 3, DW: 1, TW: 1 } as const;
const WORD_MULTIPLIER = { DL: 1, TL: 1, DW: 2, TW: 3 } as const;

/**
 * Generates all legal moves for `rack` on `board`, using `dawg` as dictionary
 * (its alphabet must be A–Z). Moves are returned in no particular order.
 */
export function generateMoves(board: Board, rack: readonly Tile[], dawg: Dawg): GeneratedMove[] {
  if (dawg.alphabet !== LETTERS.join('')) throw new Error('The DAWG alphabet must be A–Z');

  // Rack as counters: how many of each letter, and how many blanks.
  const counts = new Int8Array(26);
  let blanks = 0;
  for (const tile of rack) {
    if (tile.letter === null) blanks++;
    else counts[tile.letter.charCodeAt(0) - 65]!++;
  }

  const moves: GeneratedMove[] = [];
  const seenSingleTile = new Set<string>();
  const boardIsEmpty = board.every((row) => row.every((cell) => cell === null));

  for (const transposed of [false, true]) {
    const grid = toGrid(board, transposed);
    const direction = transposed ? 'vertical' : 'horizontal';

    // Squares of the move being built, as parallel stacks (cheaper than objects).
    const placedCols: number[] = [];
    const placedLetters: number[] = [];
    const placedBlank: boolean[] = [];

    for (let r = 0; r < N; r++) {
      const { crossMask, crossScore, hasCross } = crossChecks(grid, r, dawg);
      const filled = (c: number) => c >= 0 && c < N && grid.letters[r * N + c] !== EMPTY;
      const isAnchor = (c: number) =>
        !filled(c) &&
        (boardIsEmpty
          ? r === CENTER && c === CENTER
          : filled(c - 1) ||
            filled(c + 1) ||
            (r > 0 && grid.letters[(r - 1) * N + c] !== EMPTY) ||
            (r < N - 1 && grid.letters[(r + 1) * N + c] !== EMPTY));

      /** Saves the current move: the word spans [start, end). */
      const record = (start: number, end: number, score: number) => {
        const tilesUsed = placedCols.length;
        const total = score + (tilesUsed === RACK_SIZE ? ALL_TILES_BONUS : 0);

        // A one-tile move is found in both directions: keep it once.
        if (tilesUsed === 1) {
          const pos = realPos(grid, r, placedCols[0]!);
          const key = `${pos.row},${pos.col},${placedLetters[0]},${placedBlank[0]}`;
          if (seenSingleTile.has(key)) return;
          seenSingleTile.add(key);
        }

        // Assign actual rack tiles to the letters used.
        const available = [...rack];
        const placements: Placement[] = placedCols.map((c, i) => {
          const letter = LETTERS[placedLetters[i]!]!;
          const index = available.findIndex((t) =>
            placedBlank[i] ? t.letter === null : t.letter === letter,
          );
          const tile = available.splice(index, 1)[0]!;
          const pos = realPos(grid, r, c);
          return placedBlank[i] ? { tileId: tile.id, pos, letter } : { tileId: tile.id, pos };
        });

        let word = '';
        for (let c = start; c < end; c++) {
          const i = placedCols.indexOf(c);
          word += LETTERS[i >= 0 ? placedLetters[i]! : grid.letters[r * N + c]!];
        }
        moves.push({ placements, score: total, word, direction, leave: available });
      };

      /**
       * Score bookkeeping, passed down the recursion:
       * - mainSum:   letter points of the main word (letter bonuses applied);
       * - mainMult:  product of the word bonuses under the new tiles;
       * - crossSum:  total score of the cross words created so far.
       */
      const placeTile = (
        c: number,
        letter: number,
        blank: boolean,
        mainSum: number,
        mainMult: number,
        crossSum: number,
      ): [number, number, number] => {
        const premium = premiumAt(realPos(grid, r, c));
        const lm = premium ? LETTER_MULTIPLIER[premium] : 1;
        const wm = premium ? WORD_MULTIPLIER[premium] : 1;
        const value = (blank ? 0 : POINTS[letter]!) * lm;
        const cross = hasCross[c] ? (crossScore[c]! + value) * wm : 0;
        return [mainSum + value, mainMult * wm, crossSum + cross];
      };

      /**
       * Extends the word to the right from column `c`.
       * `node` is the DAWG node reached so far, `isWord` whether the letters so
       * far form a complete word, `anchor` the anchor column of this move.
       */
      const extendRight = (
        c: number,
        node: DawgNode,
        isWord: boolean,
        anchor: number,
        start: number,
        mainSum: number,
        mainMult: number,
        crossSum: number,
      ): void => {
        if (c < N && filled(c)) {
          // Occupied square: the word must go through its letter.
          const i = r * N + c;
          const step = dawg.step(node, grid.letters[i]!);
          if (step < 0) return;
          extendRight(
            c + 1,
            stepTarget(step),
            stepIsFinal(step),
            anchor,
            start,
            mainSum + existingPoints(grid, i),
            mainMult,
            crossSum,
          );
          return;
        }

        // Empty square or edge of the board: the word may end here, provided
        // it covers the anchor (c > anchor) and is in the dictionary.
        if (isWord && c > anchor) record(start, c, mainSum * mainMult + crossSum);
        if (c >= N) return;

        const mask = crossMask[c]!;
        dawg.forEachEdge(node, (letter, final, target) => {
          if ((mask & (1 << letter)) === 0) return;
          const tryWith = (blank: boolean) => {
            placedCols.push(c);
            placedLetters.push(letter);
            placedBlank.push(blank);
            const [s, m, x] = placeTile(c, letter, blank, mainSum, mainMult, crossSum);
            extendRight(c + 1, target, final, anchor, start, s, m, x);
            placedCols.pop();
            placedLetters.pop();
            placedBlank.pop();
          };
          if (counts[letter]! > 0) {
            counts[letter]!--;
            tryWith(false);
            counts[letter]!++;
          }
          if (blanks > 0) {
            blanks--;
            tryWith(true);
            blanks++;
          }
        });
      };

      /**
       * Builds every left part of up to `limit` letters (all ending just before
       * `anchor`), then extends each one to the right.
       */
      const leftPart = (
        node: DawgNode,
        letters: number[],
        blanksUsed: boolean[],
        limit: number,
        anchor: number,
      ): void => {
        // Place the current left part on the squares just before the anchor.
        const start = anchor - letters.length;
        let mainSum = 0;
        let mainMult = 1;
        let crossSum = 0;
        for (let i = 0; i < letters.length; i++) {
          placedCols.push(start + i);
          placedLetters.push(letters[i]!);
          placedBlank.push(blanksUsed[i]!);
          [mainSum, mainMult, crossSum] = placeTile(
            start + i,
            letters[i]!,
            blanksUsed[i]!,
            mainSum,
            mainMult,
            crossSum,
          );
        }
        extendRight(anchor, node, false, anchor, start, mainSum, mainMult, crossSum);
        for (let i = 0; i < letters.length; i++) {
          placedCols.pop();
          placedLetters.pop();
          placedBlank.pop();
        }

        if (letters.length >= limit) return;
        dawg.forEachEdge(node, (letter, _final, target) => {
          const tryWith = (blank: boolean) => {
            letters.push(letter);
            blanksUsed.push(blank);
            leftPart(target, letters, blanksUsed, limit, anchor);
            letters.pop();
            blanksUsed.pop();
          };
          if (counts[letter]! > 0) {
            counts[letter]!--;
            tryWith(false);
            counts[letter]!++;
          }
          if (blanks > 0) {
            blanks--;
            tryWith(true);
            blanks++;
          }
        });
      };

      for (let anchor = 0; anchor < N; anchor++) {
        if (!isAnchor(anchor)) continue;

        if (filled(anchor - 1)) {
          // Tiles already left of the anchor: they are the (fixed) left part.
          let start = anchor - 1;
          while (filled(start - 1)) start--;
          let node = dawg.root;
          let sum = 0;
          let ok = true;
          for (let c = start; c < anchor && ok; c++) {
            const step = dawg.step(node, grid.letters[r * N + c]!);
            if (step < 0) ok = false;
            else {
              node = stepTarget(step);
              sum += existingPoints(grid, r * N + c);
            }
          }
          if (ok) extendRight(anchor, node, false, anchor, start, sum, 1, 0);
        } else {
          // Free squares before the anchor (not anchors themselves) can hold a left part.
          let limit = 0;
          while (
            limit < RACK_SIZE - 1 &&
            anchor - limit - 1 >= 0 &&
            !filled(anchor - limit - 1) &&
            !isAnchor(anchor - limit - 1)
          ) {
            limit++;
          }
          leftPart(dawg.root, [], [], limit, anchor);
        }
      }
    }
  }
  return moves;
}

/**
 * Cross-checks of row `r`: for each empty square, the letters allowed by the
 * vertical word it would join (`crossMask`, all letters if no vertical
 * neighbor), whether there is such a word (`hasCross`) and the points of the
 * tiles already in it (`crossScore`).
 */
function crossChecks(grid: Grid, r: number, dawg: Dawg) {
  const crossMask = new Int32Array(N);
  const crossScore = new Int32Array(N);
  const hasCross = new Uint8Array(N);

  for (let c = 0; c < N; c++) {
    if (grid.letters[r * N + c] !== EMPTY) continue;
    let top = r;
    while (top > 0 && grid.letters[(top - 1) * N + c] !== EMPTY) top--;
    let bottom = r;
    while (bottom < N - 1 && grid.letters[(bottom + 1) * N + c] !== EMPTY) bottom++;
    if (top === r && bottom === r) {
      crossMask[c] = ALL_LETTERS_MASK;
      continue;
    }
    hasCross[c] = 1;

    let score = 0;
    for (let rr = top; rr <= bottom; rr++) if (rr !== r) score += existingPoints(grid, rr * N + c);
    crossScore[c] = score;

    // Walk the letters above the square...
    let node = dawg.root;
    for (let rr = top; rr < r && node !== -1; rr++) {
      const step = dawg.step(node, grid.letters[rr * N + c]!);
      node = step < 0 ? -1 : stepTarget(step);
    }
    if (node === -1) continue; // nothing can go here (mask stays 0)

    // ...then, for each possible letter, check that the letters below complete a word.
    let mask = 0;
    dawg.forEachEdge(node, (letter, isFinal, target) => {
      let ok = isFinal;
      let n = target;
      for (let rr = r + 1; rr <= bottom; rr++) {
        const step = dawg.step(n, grid.letters[rr * N + c]!);
        if (step < 0) {
          ok = false;
          break;
        }
        n = stepTarget(step);
        ok = stepIsFinal(step);
      }
      if (ok) mask |= 1 << letter;
    });
    crossMask[c] = mask;
  }
  return { crossMask, crossScore, hasCross };
}

/** Convenience: the letters of a generated move, for logs and tests. */
export function describeMove(move: GeneratedMove): string {
  const first = move.placements[0]?.pos;
  return `${move.word} ${move.direction} @${first?.row},${first?.col} = ${move.score}`;
}
