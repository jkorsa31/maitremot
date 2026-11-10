/**
 * `Store` implementation on Supabase (Postgres through the REST API), used by
 * the Edge Function with the service key, which bypasses Row Level Security.
 *
 * The Supabase client is passed in (typed structurally below) so this file has
 * no runtime dependency on a particular supabase-js build.
 */

import type { GameState } from '@maitremot/engine';
import {
  type GameRow,
  type GameStatus,
  type PlayerStatus,
  type Store,
  splitState,
} from './handler';

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

/** The subset of the supabase-js client API used here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any;
export interface SupabaseLike {
  from(table: string): Query;
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<QueryResult<unknown>>;
}

function check<T>(result: QueryResult<T>): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export function supabaseStore(db: SupabaseLike): Store {
  return {
    async friendIds(userId) {
      const rows: { friend_id: string }[] = check(
        await db.from('friendships').select('friend_id').eq('user_id', userId),
      );
      return rows.map((r) => r.friend_id);
    },

    async displayNames(userIds) {
      const rows: { id: string; display_name: string }[] = check(
        await db.from('profiles').select('id, display_name').in('id', userIds),
      );
      return new Map(rows.map((r) => [r.id, r.display_name]));
    },

    async createGame(createdBy, players) {
      const game: { id: string } = check(
        await db.from('games').insert({ created_by: createdBy }).select('id').single(),
      );
      check(
        await db
          .from('game_players')
          .insert(players.map((p) => ({ game_id: game.id, user_id: p.userId, status: p.status }))),
      );
      return game.id;
    },

    async getGame(gameId): Promise<GameRow | null> {
      const row: { id: string; created_by: string; status: GameStatus; version: number } | null =
        check(
          await db
            .from('games')
            .select('id, created_by, status, version')
            .eq('id', gameId)
            .maybeSingle(),
        );
      return (
        row && { id: row.id, createdBy: row.created_by, status: row.status, version: row.version }
      );
    },

    async players(gameId) {
      const rows: { user_id: string; status: PlayerStatus }[] = check(
        await db.from('game_players').select('user_id, status').eq('game_id', gameId),
      );
      return rows.map((r) => ({ userId: r.user_id, status: r.status }));
    },

    async setPlayerStatus(gameId, userId, status) {
      check(
        await db
          .from('game_players')
          .update({ status })
          .eq('game_id', gameId)
          .eq('user_id', userId),
      );
    },

    async setGameStatus(gameId, status) {
      // Bump the version too, so a concurrent update fails cleanly.
      const game = await this.getGame(gameId);
      check(
        await db
          .from('games')
          .update({
            status,
            version: (game?.version ?? 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', gameId),
      );
    },

    async secretState(gameId) {
      const row: { state: GameState } | null = check(
        await db.from('game_secrets').select('state').eq('game_id', gameId).maybeSingle(),
      );
      return row?.state ?? null;
    },

    async applyUpdate(gameId, expectedVersion, status, state) {
      const { publicState, racks } = splitState(state);
      return check(
        await db.rpc('apply_game_update', {
          p_game_id: gameId,
          p_expected_version: expectedVersion,
          p_status: status,
          p_public_state: publicState,
          p_state: state,
          p_racks: racks,
        }),
      ) as boolean;
    },
  };
}
