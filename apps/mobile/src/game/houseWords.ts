/**
 * Words added from the game ("Ajouter au dictionnaire"), on top of the built-in
 * dictionary (Grammalecte + packages/lexicon-fr/house-words.txt).
 *
 * They are saved on the device; in phase 2 they will be shared between friends.
 *
 * Note: the computer players only use the built-in dictionary.
 */

import type { WordList } from '@maitremot/engine';
import { getWords } from '@maitremot/lexicon-fr';
import { useSyncExternalStore } from 'react';
import { load, save } from '../storage/storage';

const KEY = 'house-words';

const added = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

/** Built-in dictionary + words added during play. Pass this to the engine for human moves. */
export const playerWords: WordList = {
  has: (word) => added.has(word) || getWords().has(word),
};

/** Adds a board word (uppercase A–Z) to the accepted words. */
export function addHouseWord(word: string): void {
  if (!/^[A-Z]{2,15}$/.test(word) || added.has(word)) return;
  added.add(word);
  save(KEY, [...added]);
  version++;
  listeners.forEach((listener) => listener());
}

/** Restores the words added in previous sessions (called once at startup). */
export async function loadHouseWords(): Promise<void> {
  for (const word of (await load<string[]>(KEY)) ?? []) added.add(word);
  version++;
  listeners.forEach((listener) => listener());
}

/** Changes whenever a word is added, so React recomputes what depends on the dictionary. */
export function useHouseWordsVersion(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
}
