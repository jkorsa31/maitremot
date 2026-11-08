/**
 * Scoring of a move.
 *
 * For each formed word:
 *   word score = (sum of letter values, each multiplied by its letter bonus)
 *                × (product of the word bonuses under the word)
 * Bonuses (DL, TL, DW, TW) only count for tiles placed during this move.
 * Blanks are worth 0 points, even on a letter bonus (but still trigger word bonuses).
 *
 * Move score = sum of all word scores, + 50 if the player used all 7 rack tiles.
 */

import { premiumAt } from './board';
import type { FormedWord } from './move';
import { letterPoints } from './tiles';

/** Number of tiles on a rack; playing all of them earns the bonus below. */
export const RACK_SIZE = 7;
export const ALL_TILES_BONUS = 50;

export interface WordScore {
  readonly word: string;
  readonly score: number;
}

export interface MoveScore {
  readonly words: readonly WordScore[];
  /** 50 when all 7 tiles were played, 0 otherwise. */
  readonly bonus: number;
  readonly total: number;
}

export function scoreWord(word: FormedWord): number {
  let letters = 0;
  let wordMultiplier = 1;
  for (const cell of word.cells) {
    const base = cell.isBlank ? 0 : letterPoints(cell.letter);
    const premium = cell.isNew ? premiumAt(cell.pos) : null;
    switch (premium) {
      case 'DL':
        letters += base * 2;
        break;
      case 'TL':
        letters += base * 3;
        break;
      case 'DW':
        letters += base;
        wordMultiplier *= 2;
        break;
      case 'TW':
        letters += base;
        wordMultiplier *= 3;
        break;
      default:
        letters += base;
    }
  }
  return letters * wordMultiplier;
}

/** Scores a whole move. `tilesPlayed` is the number of tiles taken from the rack. */
export function scoreMove(words: readonly FormedWord[], tilesPlayed: number): MoveScore {
  const scored = words.map((w) => ({ word: w.word, score: scoreWord(w) }));
  const bonus = tilesPlayed === RACK_SIZE ? ALL_TILES_BONUS : 0;
  const total = scored.reduce((sum, w) => sum + w.score, bonus);
  return { words: scored, bonus, total };
}
