/**
 * HTTP layer of the `game` Edge Function: CORS (the web version calls it from
 * another domain), authentication of the player, request parsing.
 *
 * The Deno entry point (supabase/functions/game/index.ts) only passes in the
 * supabase-js `createClient` and the environment, so this file stays testable
 * with plain Node.
 */

import { getWords } from '@maitremot/lexicon-fr';
import { type GameRequest, GameHandler } from './handler';
import { type LiveKitConfig, createCallToken } from './livekit';
import { type SupabaseLike, supabaseStore } from './store-supabase';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface AdminClient extends SupabaseLike {
  auth: {
    getUser(jwt: string): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
}

export interface EdgeEnv {
  readonly url: string;
  readonly serviceKey: string;
  /** LiveKit credentials, when audio / video calls are set up. */
  readonly livekit?: LiveKitConfig;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

/** Checks the shape of a request (the engine validates the move itself). */
export function parseRequest(body: unknown): GameRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const r = body as Record<string, unknown>;
  const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 64;
  switch (r.action) {
    case 'create':
      return Array.isArray(r.friendIds) && r.friendIds.every(isId)
        ? { action: 'create', friendIds: r.friendIds }
        : null;
    case 'respond':
      return isId(r.gameId) && typeof r.accept === 'boolean'
        ? { action: 'respond', gameId: r.gameId, accept: r.accept }
        : null;
    case 'start':
    case 'cancel':
    case 'pass':
    case 'stop':
    case 'callToken':
      return isId(r.gameId) ? { action: r.action, gameId: r.gameId } : null;
    case 'play':
      return isId(r.gameId) && Array.isArray(r.placements) && r.placements.length <= 7
        ? { action: 'play', gameId: r.gameId, placements: r.placements }
        : null;
    case 'exchange':
      return isId(r.gameId) &&
        Array.isArray(r.tileIds) &&
        r.tileIds.every((t) => Number.isInteger(t))
        ? { action: 'exchange', gameId: r.gameId, tileIds: r.tileIds }
        : null;
    default:
      return null;
  }
}

export function createRequestHandler(
  createClient: (url: string, key: string, options: object) => AdminClient,
  env: EdgeEnv,
): (request: Request) => Promise<Response> {
  const admin = createClient(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { livekit } = env;
  const signCallToken = livekit
    ? (identity: string, name: string, room: string) =>
        createCallToken(livekit, { identity, name, room })
    : undefined;
  const handler = new GameHandler(supabaseStore(admin), getWords(), signCallToken);

  return async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    if (request.method !== 'POST') return json(405, { ok: false, error: { code: 'BAD_REQUEST' } });

    // Who is calling? The app sends the player's session token.
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    const { data } = await admin.auth.getUser(token);
    if (!data.user) return json(401, { ok: false, error: { code: 'UNAUTHORIZED' } });

    let parsed: GameRequest | null;
    try {
      parsed = parseRequest(await request.json());
    } catch {
      parsed = null;
    }
    if (!parsed) return json(400, { ok: false, error: { code: 'BAD_REQUEST' } });

    try {
      return json(200, await handler.handle(data.user.id, parsed));
    } catch (error) {
      console.error(error);
      return json(500, { ok: false, error: { code: 'SERVER_ERROR' } });
    }
  };
}
