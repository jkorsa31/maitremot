/**
 * Solo statistics: games played and won, best move, best game score.
 * Updated once per finished game (identified by its id) and saved on the device.
 */

import type { GameState } from '@maitremot/engine';
import { useSyncExternalStore } from 'react';
import { load, save } from '../storage/storage';

export interface SoloStats {
  readonly played: number;
  readonly won: number;
  /** Best single move, e.g. { word: 'ARTEMISE', score: 86 }. */
  readonly bestMove: { readonly word: string; readonly score: number } | null;
  readonly bestGameScore: number | null;
  /** Ids of the games already counted, so a game is never counted twice. */
  readonly countedGameIds: readonly string[];
}

const EMPTY: SoloStats = {
  played: 0,
  won: 0,
  bestMove: null,
  bestGameScore: null,
  countedGameIds: [],
};
const KEY = 'stats';
/** Only the last ids are needed: a game cannot finish twice long after. */
const MAX_IDS = 50;

let stats: SoloStats = EMPTY;
const listeners = new Set<() => void>();

/**
 * Pure function: the statistics after `game` (finished, id `gameId`) for the
 * human player `playerId`. Returns `current` unchanged if already counted.
 */
export function withFinishedGame(
  current: SoloStats,
  gameId: string,
  game: GameState,
  playerId: string,
): SoloStats {
  if (game.status !== 'finished' || current.countedGameIds.includes(gameId)) return current;
  const me = game.players.find((p) => p.id === playerId);
  if (!me) return current;

  const best = Math.max(...game.players.map((p) => p.score));
  let bestMove = current.bestMove;
  for (const turn of game.history) {
    if (turn.kind !== 'play' || turn.playerId !== playerId) continue;
    if (!bestMove || turn.score.total > bestMove.score) {
      bestMove = { word: turn.score.words[0]?.word ?? '', score: turn.score.total };
    }
  }
  return {
    played: current.played + 1,
    // A tie for first place counts as a win.
    won: current.won + (me.score === best ? 1 : 0),
    bestMove,
    bestGameScore: Math.max(current.bestGameScore ?? me.score, me.score),
    countedGameIds: [...current.countedGameIds, gameId].slice(-MAX_IDS),
  };
}

export async function loadStats(): Promise<void> {
  stats = (await load<SoloStats>(KEY)) ?? EMPTY;
  listeners.forEach((l) => l());
}

export function recordFinishedGame(gameId: string, game: GameState, playerId: string): void {
  const next = withFinishedGame(stats, gameId, game, playerId);
  if (next === stats) return;
  stats = next;
  save(KEY, stats);
  listeners.forEach((l) => l());
}

export function useStats(): SoloStats {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => stats,
  );
}
