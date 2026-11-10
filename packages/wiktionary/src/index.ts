/**
 * French Wiktionary definitions for MaitreMot.
 *
 * - fetch.ts: downloads page wikitext (one request for several pages);
 * - parse.ts: extracts the French definitions as plain text.
 *
 * Content of the Wiktionary is under the CC BY-SA 4.0 license: the app must
 * credit it wherever definitions are shown (see WIKTIONARY_CREDITS).
 */

import { type FetchOptions, fetchWikitexts } from './fetch';
import { type WiktionaryEntry, parseWiktionaryPage } from './parse';

export * from './fetch';
export * from './parse';

export const WIKTIONARY_CREDITS = 'Source : Wiktionnaire, licence CC BY-SA 4.0';

/**
 * Fetches and parses several pages at once. Pages that do not exist or have
 * no French definition map to null.
 */
export async function getDefinitions(
  titles: readonly string[],
  options?: FetchOptions,
): Promise<Map<string, WiktionaryEntry | null>> {
  const texts = await fetchWikitexts(titles, options);
  return new Map(
    [...texts].map(([title, text]) => [title, text ? parseWiktionaryPage(title, text) : null]),
  );
}
