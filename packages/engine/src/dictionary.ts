/**
 * Dictionary abstraction.
 *
 * The rules engine only needs to ask "is this word valid?". Hiding the storage
 * behind this interface lets us use a simple `Set` in tests today and swap in
 * the compact DAWG structure built from the Grammalecte word list (step 3)
 * without touching the game logic.
 */

export interface WordList {
  /** `word` is given in uppercase A–Z, without accents. */
  has(word: string): boolean;
}

/**
 * Normalizes a French word to the form used on the board: accents removed,
 * uppercase. "Écrêté" → "ECRETE", "cœur" → "COEUR".
 */
export function normalizeWord(word: string): string {
  return word
    .normalize('NFD') // splits "é" into "e" + combining accent...
    .replace(/[̀-ͯ]/g, '') // ...so the accent can be dropped
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .toUpperCase();
}

/** In-memory word list backed by a `Set`. Fine for tests and small lists. */
export function createSetWordList(words: Iterable<string>): WordList {
  const set = new Set<string>();
  for (const word of words) set.add(normalizeWord(word));
  return { has: (word) => set.has(word) };
}
