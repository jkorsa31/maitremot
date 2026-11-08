/**
 * French dictionary for MaitreMot.
 *
 * The data is embedded as base64 strings (see src/generated/), which works the
 * same everywhere: in the app (Metro bundles it like any module), in Node for
 * tests and tools, and on the server in phase 2. Decoding is done once, on
 * first use, and cached.
 */

import { Dawg, Lexicon, type WordList } from '@maitremot/engine';
import { decodeBase64 } from './base64';
import { LEXICON_DAWG_BASE64 } from './generated/lexicon';
import { WORDS_DAWG_BASE64 } from './generated/words';

let words: Dawg | undefined;
let lexicon: Lexicon | undefined;

/**
 * Board words (uppercase A–Z): validates moves and drives the AI.
 * A `Dawg` is also a `WordList`, so it can be passed to `playMove` directly.
 */
export function getWords(): Dawg & WordList {
  words ??= Dawg.fromBytes(decodeBase64(WORDS_DAWG_BASE64));
  return words;
}

/** Real spellings and lemmas of a board word, to fetch its definition. */
export function getLexicon(): Lexicon {
  lexicon ??= new Lexicon(Dawg.fromBytes(decodeBase64(LEXICON_DAWG_BASE64)));
  return lexicon;
}

/** Credit line to show in the app (required by the data license). */
export const DICTIONARY_CREDITS =
  'Dictionnaire : Grammalecte (Olivier R. et contributeurs), licence MPL 2.0.';
