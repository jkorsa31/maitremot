/**
 * Lexicon: from a word as played on the board (uppercase, no accents) back to
 * its real French spellings and their lemmas, to fetch definitions.
 *
 *   "ETE"        → été (lemma: été, être), êtes (lemma: être)...
 *   "MANGEAIENT" → mangeaient (lemma: manger)
 *
 * Storage: a second DAWG whose entries are `<form>=<rule>`, where `form` is the
 * accented lowercase spelling and `rule` rebuilds the lemma from the form:
 * `<n><suffix>` = "remove the last n characters, then append suffix".
 *
 *   mangeaient → manger   is stored as   "mangeaient=5r"
 *   été        → être     is stored as   "été=3être"
 *
 * Rules are short and extremely repetitive ("=5r" ends thousands of entries),
 * so the DAWG merges them and the whole lexicon stays compact.
 */

import { Dawg, type DawgNode } from './dawg';
import { normalizeWord } from './dictionary';

/** Lowercase characters allowed in a spelling (before folding to A–Z). */
export const SPELLING_CHARS = 'abcdefghijklmnopqrstuvwxyzàâäçéèêëîïôöùûüÿœæ';
const SEPARATOR = '=';
/** Alphabet of the lexicon DAWG: spellings, separator and rule digits. */
export const LEXICON_ALPHABET = SPELLING_CHARS + SEPARATOR + '0123456789';

/** What each spelling character becomes on the board: "é" → "E", "œ" → "OE". */
const FOLD = new Map([...SPELLING_CHARS].map((ch) => [ch, normalizeWord(ch)] as const));

export interface LexiconEntry {
  /** Real spelling, e.g. "été". */
  readonly form: string;
  /** Dictionary headwords this form belongs to, e.g. ["été", "être"]. */
  readonly lemmas: readonly string[];
}

/** Builds the `<form>=<rule>` string stored in the lexicon DAWG (used by the build tool). */
export function encodeLexiconEntry(form: string, lemma: string): string {
  let common = 0;
  while (common < form.length && common < lemma.length && form[common] === lemma[common]) common++;
  return `${form}${SEPARATOR}${form.length - common}${lemma.slice(common)}`;
}

/** Applies a rule ("5r") to a form ("mangeaient") → "manger". */
function applyRule(form: string, rule: string): string {
  const digits = /^\d+/.exec(rule)?.[0] ?? '0';
  return form.slice(0, form.length - Number(digits)) + rule.slice(digits.length);
}

export class Lexicon {
  constructor(private readonly dawg: Dawg) {}

  /** All spellings (with their lemmas) that are written `boardWord` on the board. */
  lookup(boardWord: string): LexiconEntry[] {
    const entries: LexiconEntry[] = [];
    // Depth-first search: at each step, try every spelling character whose
    // folded form matches the next letter(s) of the board word.
    const visit = (node: DawgNode, position: number, form: string) => {
      if (position === boardWord.length) {
        const separator = this.dawg.follow(node, SEPARATOR);
        if (separator) {
          const lemmas = [...this.dawg.words(separator.target)].map((rule) =>
            applyRule(form, rule),
          );
          entries.push({ form, lemmas });
        }
        return;
      }
      for (const edge of this.dawg.edgesOf(node)) {
        const folded = FOLD.get(edge.symbol);
        if (folded && boardWord.startsWith(folded, position)) {
          visit(edge.target, position + folded.length, form + edge.symbol);
        }
      }
    };
    visit(this.dawg.root, 0, '');
    return entries;
  }
}
