/**
 * Data access for online play: profile, friends, games list, and calls to the
 * `game` server function. Lists refresh themselves in real time (Supabase
 * Realtime notifies the app when a row it can read changes).
 */

import type { PublicGameState } from '@maitremot/engine';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type AppError } from '../game/messages';
import { supabase } from './supabase';

export interface Profile {
  readonly id: string;
  readonly display_name: string;
  readonly friend_code: string;
}

export type OnlineStatus = 'lobby' | 'playing' | 'finished' | 'cancelled';

export interface GameSummary {
  readonly id: string;
  readonly status: OnlineStatus;
  readonly createdBy: string;
  readonly updatedAt: string;
  readonly myStatus: 'invited' | 'joined' | 'declined';
  readonly players: readonly {
    readonly id: string;
    readonly name: string;
    readonly status: 'invited' | 'joined' | 'declined';
  }[];
  readonly publicState: PublicGameState | null;
}

// ---------------------------------------------------------------------------
// Server function
// ---------------------------------------------------------------------------

export type GameCall =
  | { action: 'create'; friendIds: string[] }
  | { action: 'respond'; gameId: string; accept: boolean }
  | { action: 'start' | 'cancel' | 'pass'; gameId: string }
  | { action: 'play'; gameId: string; placements: readonly unknown[] }
  | { action: 'exchange'; gameId: string; tileIds: readonly number[] };

/** Calls the server. Returns the game id, or the error to show. */
export async function callGame(
  body: GameCall,
): Promise<{ ok: true; gameId: string } | { ok: false; error: AppError }> {
  const { data, error } = await supabase.functions.invoke('game', { body });
  if (data && typeof data === 'object' && 'ok' in data) return data as never;
  return { ok: false, error: { code: error ? 'NETWORK' : 'SERVER_ERROR' } };
}

// ---------------------------------------------------------------------------
// Profile and friends
// ---------------------------------------------------------------------------

export async function saveProfile(name: string): Promise<Profile | null> {
  const { data, error } = await supabase.rpc('save_profile', { p_display_name: name });
  return error ? null : (data as Profile);
}

/** Adds a friend by code. Returns their profile, or an error message. */
export async function addFriend(code: string): Promise<Profile | string> {
  const { data, error } = await supabase.rpc('add_friend', { p_friend_code: code });
  if (!error) return data as Profile;
  if (/unknown friend code/.test(error.message)) return 'Aucun joueur avec ce code.';
  if (/yourself/.test(error.message)) return "C'est ton propre code !";
  return "Impossible d'ajouter cet ami. Réessaie.";
}

/** Re-runs `load` when the given tables change (debounced), and on mount. */
function useLiveQuery<T>(
  key: string,
  tables: string[],
  load: () => Promise<T>,
): {
  data: T | undefined;
  reload: () => void;
} {
  const [data, setData] = useState<T>();
  const loadRef = useRef(load);
  loadRef.current = load;
  const reload = useCallback(() => {
    void loadRef.current().then(setData, () => undefined);
  }, []);

  useEffect(() => {
    reload();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase.channel(`${key}-${Math.random().toString(36).slice(2)}`);
    for (const table of tables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        clearTimeout(timer);
        timer = setTimeout(reload, 300);
      });
    }
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
    // `tables` is a constant list for each caller.
  }, [key, reload]);

  return { data, reload };
}

export function useProfile(userId: string) {
  return useLiveQuery(`profile-${userId}`, [], async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, friend_code')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return (data as Profile | null) ?? null;
  });
}

export function useFriends(userId: string) {
  return useLiveQuery(`friends-${userId}`, ['friendships'], async () => {
    const { data, error } = await supabase
      .from('friendships')
      .select('friend_id, profiles!friendships_friend_id_fkey(id, display_name, friend_code)')
      .eq('user_id', userId);
    if (error) throw error;
    return (data as unknown as { profiles: Profile }[])
      .map((row) => row.profiles)
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  });
}

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

export function useMyGames(userId: string) {
  return useLiveQuery(`games-${userId}`, ['games', 'game_players'], async () => {
    const mine = await supabase
      .from('game_players')
      .select('status, games(id, status, created_by, updated_at, public_state)')
      .eq('user_id', userId);
    if (mine.error) throw mine.error;
    const rows = mine.data as unknown as {
      status: GameSummary['myStatus'];
      games: {
        id: string;
        status: OnlineStatus;
        created_by: string;
        updated_at: string;
        public_state: PublicGameState | null;
      };
    }[];
    const ids = rows.map((r) => r.games.id);
    if (ids.length === 0) return [];

    const all = await supabase
      .from('game_players')
      .select('game_id, user_id, status, profiles(display_name)')
      .in('game_id', ids);
    if (all.error) throw all.error;
    const players = all.data as unknown as {
      game_id: string;
      user_id: string;
      status: GameSummary['myStatus'];
      profiles: { display_name: string } | null;
    }[];

    return rows
      .map((r): GameSummary => ({
        id: r.games.id,
        status: r.games.status,
        createdBy: r.games.created_by,
        updatedAt: r.games.updated_at,
        myStatus: r.status,
        publicState: r.games.public_state,
        players: players
          .filter((p) => p.game_id === r.games.id)
          .map((p) => ({
            id: p.user_id,
            name: p.profiles?.display_name ?? '?',
            status: p.status,
          })),
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });
}
