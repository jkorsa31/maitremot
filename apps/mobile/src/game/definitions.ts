/**
 * Definitions of the words played, from the French Wiktionary.
 *
 * A board word has no accents and may stand for several real words (ETE →
 * été, êtes…), each with one or more lemmas (été → été, être). We use the
 * lexicon to find them, then fetch all the needed pages in ONE request and
 * keep them in memory, so reopening a definition is instant.
 */

import { getLexicon } from '@maitremot/lexicon-fr';
import { type WiktionaryEntry, getDefinitions } from '@maitremot/wiktionary';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/** What we show for one spelling of the board word. */
export interface DefinitionBlock {
  /** The real spelling, e.g. "mangeaient". */
  readonly form: string;
  /** Its own page (often "Troisième personne… de manger" for an inflected form). */
  readonly entry: WiktionaryEntry | null;
  /** Pages of the lemmas other than the form itself, e.g. "manger". */
  readonly lemmas: readonly { readonly lemma: string; readonly entry: WiktionaryEntry | null }[];
}

export type DefinitionsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'done'; readonly blocks: readonly DefinitionBlock[] };

/** Cache: page title → parsed page (a failed download is not cached). */
const cache = new Map<string, Promise<WiktionaryEntry | null>>();

async function loadPages(titles: readonly string[]): Promise<Map<string, WiktionaryEntry | null>> {
  const missing = [...new Set(titles)].filter((t) => !cache.has(t));
  if (missing.length > 0) {
    // The raw-page fallback has no CORS headers: only usable in the native app.
    const batch = getDefinitions(missing, { rawFallback: Platform.OS !== 'web' });
    batch.catch(() => missing.forEach((t) => cache.delete(t)));
    for (const title of missing)
      cache.set(
        title,
        batch.then((pages) => pages.get(title) ?? null),
      );
  }
  const pages = await Promise.all(titles.map(async (t) => [t, await cache.get(t)!] as const));
  return new Map(pages);
}

/** Spellings and lemmas of a board word (a word added by the player is its own lemma). */
function spellingsOf(boardWord: string) {
  const entries = getLexicon().lookup(boardWord);
  if (entries.length > 0) return entries;
  const form = boardWord.toLowerCase();
  return [{ form, lemmas: [form] }];
}

/** Loads the definitions of a board word (uppercase, no accents). */
export async function loadDefinitions(boardWord: string): Promise<DefinitionBlock[]> {
  const spellings = spellingsOf(boardWord);
  const pages = await loadPages(spellings.flatMap((s) => [s.form, ...s.lemmas]));
  return spellings.map(({ form, lemmas }) => ({
    form,
    entry: pages.get(form) ?? null,
    lemmas: lemmas
      .filter((lemma) => lemma !== form)
      .map((lemma) => ({ lemma, entry: pages.get(lemma) ?? null })),
  }));
}

/** React hook around `loadDefinitions`. */
export function useDefinitions(boardWord: string | null): DefinitionsState {
  const [state, setState] = useState<DefinitionsState>({ status: 'loading' });
  useEffect(() => {
    if (!boardWord) return;
    let cancelled = false;
    setState({ status: 'loading' });
    loadDefinitions(boardWord).then(
      (blocks) => !cancelled && setState({ status: 'done', blocks }),
      () => !cancelled && setState({ status: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [boardWord]);
  return state;
}
