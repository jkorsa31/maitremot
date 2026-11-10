/**
 * Hidden information in online games.
 *
 * The server keeps the full `GameState`. Players must not see the bag nor the
 * other racks, so the server publishes a `PublicGameState` (racks and bag
 * replaced by their sizes) and sends each player their own rack separately.
 *
 * On the device, `toPlayerView` rebuilds a `GameState` from these two pieces,
 * with placeholder tiles where the content is unknown, so the whole app (score
 * preview, rendering…) works exactly as in solo games.
 */

import type { GameState, PlayerState } from './game';
import type { Tile } from './tiles';

export interface PublicPlayer extends Omit<PlayerState, 'rack'> {
  readonly rackCount: number;
}

export interface PublicGameState extends Omit<GameState, 'bag' | 'players' | 'seed'> {
  readonly bagCount: number;
  readonly players: readonly PublicPlayer[];
}

/** What every player may see. */
export function toPublicState(state: GameState): PublicGameState {
  const { bag, players, seed: _seed, ...rest } = state;
  return {
    ...rest,
    bagCount: bag.length,
    players: players.map(({ rack, ...player }) => ({ ...player, rackCount: rack.length })),
  };
}

/** Placeholder tiles for unknown content (negative ids never clash with real tiles). */
function hidden(count: number, offset: number): Tile[] {
  return Array.from({ length: count }, (_, i) => ({ id: -1 - offset - i, letter: null }));
}

/** The game as seen by `playerId`, who holds `rack`. */
export function toPlayerView(
  state: PublicGameState,
  playerId: string,
  rack: readonly Tile[],
): GameState {
  const { bagCount, players, ...rest } = state;
  return {
    ...rest,
    seed: 0,
    bag: hidden(bagCount, 0),
    players: players.map(({ rackCount, ...player }, i) => ({
      ...player,
      rack: player.id === playerId ? rack : hidden(rackCount, 1000 * (i + 1)),
    })),
  };
}
