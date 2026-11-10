/**
 * Downloads Wiktionary pages.
 *
 * We use the MediaWiki API (api.php) because it is the only endpoint that
 * allows calls from a web page on another site (CORS, thanks to `origin=*`),
 * which the web version of the app needs. Several pages are fetched in ONE
 * request (`titles=a|b|c`), as Wikimedia asks API users to do.
 *
 * Wikimedia also asks every client to identify itself; browsers do not let us
 * change the User-Agent, so we send the `Api-User-Agent` header they read instead.
 */

const API_URL = 'https://fr.wiktionary.org/w/api.php';
const RAW_URL = 'https://fr.wiktionary.org/w/index.php';
export const CLIENT_ID = 'MaitreMot/0.1 (https://github.com/jkorsa31/maitremot)';

/** Link to the page on the Wiktionary website. */
export function wiktionaryUrl(title: string): string {
  return `https://fr.wiktionary.org/wiki/${encodeURIComponent(title)}`;
}

type Fetch = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

interface ApiResponse {
  query?: {
    normalized?: { from: string; to: string }[];
    pages?: {
      title: string;
      missing?: boolean;
      revisions?: { slots?: { main?: { content?: string } } }[];
    }[];
  };
}

export interface FetchOptions {
  /** Injected for tests; defaults to the global `fetch`. */
  readonly fetch?: Fetch;
  /**
   * When the API fails, retry each page through the raw-text endpoint. That
   * endpoint has no CORS headers, so only enable it outside the browser.
   */
  readonly rawFallback?: boolean;
}

/**
 * Fetches the wikitext of several pages. The result maps each requested title
 * to its wikitext, or to null when the page does not exist.
 * Throws on network errors, so callers can tell "offline" from "no page".
 */
export async function fetchWikitexts(
  titles: readonly string[],
  options: FetchOptions = {},
): Promise<Map<string, string | null>> {
  const doFetch = options.fetch ?? (globalThis.fetch as unknown as Fetch);
  const unique = [...new Set(titles)];
  const result = new Map<string, string | null>();
  if (unique.length === 0) return result;

  try {
    const params = new URLSearchParams({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      format: 'json',
      formatversion: '2',
      origin: '*',
      titles: unique.join('|'),
    });
    const response = await doFetch(`${API_URL}?${params}`, {
      headers: { 'Api-User-Agent': CLIENT_ID },
    });
    if (!response.ok) throw new Error(`Wiktionary API: HTTP ${response.status}`);
    const data = (await response.json()) as ApiResponse;

    // The API may normalize titles (e.g. first letter case); map them back.
    const normalized = new Map(data.query?.normalized?.map((n) => [n.to, n.from]));
    for (const page of data.query?.pages ?? []) {
      const requested = normalized.get(page.title) ?? page.title;
      const content = page.missing ? null : (page.revisions?.[0]?.slots?.main?.content ?? null);
      result.set(requested, content);
    }
    for (const title of unique) if (!result.has(title)) result.set(title, null);
    return result;
  } catch (error) {
    if (!options.rawFallback) throw error;
  }

  // Fallback: one raw request per page (native apps only, see above).
  for (const title of unique) {
    const params = new URLSearchParams({ title, action: 'raw' });
    const response = await doFetch(`${RAW_URL}?${params}`, {
      headers: { 'Api-User-Agent': CLIENT_ID },
    });
    if (response.status === 404) result.set(title, null);
    else if (!response.ok) throw new Error(`Wiktionary: HTTP ${response.status}`);
    else result.set(title, await response.text());
  }
  return result;
}
