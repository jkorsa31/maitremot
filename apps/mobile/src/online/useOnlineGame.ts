/**
 * An online game on this device.
 *
 * Loads the public state of the game and this player's rack, keeps them up to
 * date in real time, rebuilds a normal `GameState` from them (toPlayerView)
 * and plugs the shared game controller into the server: a move is sent to the
 * `game` function, which validates it and updates the database; every player's
 * screen then refreshes through Realtime.
 */

import { type GameState, type PublicGameState, type Tile, toPlayerView } from '@maitremot/engine';
import { getWords } from '@maitremot/lexicon-fr';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { type GameActions, useGameController } from '../game/useGameController';
import { type OnlineStatus, callGame } from './api';
import { supabase } from './supabase';

interface Loaded {
  readonly status: OnlineStatus;
  readonly publicState: PublicGameState | null;
  readonly rack: readonly Tile[];
}

export function useOnlineGame(gameId: string, userId: string) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    const [game, rack] = await Promise.all([
      supabase.from('games').select('status, public_state').eq('id', gameId).maybeSingle(),
      supabase.from('game_racks').select('rack').eq('game_id', gameId).maybeSingle(),
    ]);
    if (game.error || rack.error) {
      setOffline(true);
      return;
    }
    setOffline(false);
    if (!game.data) {
      setLoaded(null);
      return;
    }
    setLoaded({
      status: game.data.status as OnlineStatus,
      publicState: game.data.public_state as PublicGameState | null,
      rack: (rack.data?.rack as Tile[] | undefined) ?? [],
    });
  }, [gameId]);

  // Initial load, real-time refresh, and refresh when the app comes back.
  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`game-${gameId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        () => void load(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_racks', filter: `game_id=eq.${gameId}` },
        () => void load(),
      )
      .subscribe((status) => {
        // After a reconnection, catch up on what we missed.
        if (status === 'SUBSCRIBED') void load();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setOffline(true);
      });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => {
      void supabase.removeChannel(channel);
      appState.remove();
    };
  }, [gameId, load]);

  /** The game as this player sees it (other racks and the bag are hidden). */
  const game: GameState | null = useMemo(
    () => (loaded?.publicState ? toPlayerView(loaded.publicState, userId, loaded.rack) : null),
    [loaded, userId],
  );

  return { status: loaded?.status ?? null, game, offline, reload: load };
}

/** The game controller of an online game: moves are sent to the server. */
export function useOnlineController(
  gameId: string,
  userId: string,
  game: GameState,
  reload: () => Promise<void>,
) {
  const actions = useMemo<GameActions>(() => {
    const send = async (body: Parameters<typeof callGame>[0]) => {
      const result = await callGame(body);
      await reload(); // show the result right away, without waiting for Realtime
      return result.ok ? null : result.error;
    };
    return {
      play: (placements) => send({ action: 'play', gameId, placements }),
      exchange: (tileIds) => send({ action: 'exchange', gameId, tileIds }),
      pass: () => send({ action: 'pass', gameId }),
    };
  }, [gameId, reload]);

  return useGameController(game, { meId: userId, dictionary: getWords(), actions });
}
