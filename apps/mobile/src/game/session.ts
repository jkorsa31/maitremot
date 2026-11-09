/**
 * The current solo game, kept in memory outside React so it survives screen
 * changes (step 6 will also save it to the phone's storage).
 *
 * This is a tiny "store": a value, a setter, and a hook built on React's
 * `useSyncExternalStore` that re-renders subscribers when the value changes.
 */

import {
  type AiLevel,
  type GameState,
  type PlayerConfig,
  MAX_PLAYERS,
  createGame,
} from '@maitremot/engine';
import { getWords } from '@maitremot/lexicon-fr';
import { useSyncExternalStore } from 'react';

/** Id of the human player in a solo game. */
export const HUMAN_ID = 'me';

/** Names given to the computer opponents. */
const AI_NAMES = ['Ordi 1', 'Ordi 2', 'Ordi 3'];

export const LEVEL_LABELS: Record<AiLevel, string> = {
  easy: 'Facile',
  medium: 'Moyen',
  expert: 'Expert',
};

let current: GameState | null = null;
const listeners = new Set<() => void>();

// End-to-end tests only (web build made with EXPO_PUBLIC_E2E=1): lets the test
// script read and set the game. Not present in normal builds.
if (process.env.EXPO_PUBLIC_E2E === '1') {
  (globalThis as Record<string, unknown>).__MAITREMOT__ = {
    getSoloGame: () => current,
    setSoloGame: (game: GameState) => setSoloGame(game),
  };
}

export function setSoloGame(game: GameState | null): void {
  current = game;
  listeners.forEach((listener) => listener());
}

export function getSoloGame(): GameState | null {
  return current;
}

/** React hook: the current solo game, or null when none is started. */
export function useSoloGameState(): GameState | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

export interface SoloGameOptions {
  readonly playerName: string;
  /** One entry per computer opponent (1 to 3). */
  readonly opponents: readonly AiLevel[];
}

/** Creates a new solo game. Who starts is drawn at random. */
export function startSoloGame({ playerName, opponents }: SoloGameOptions): void {
  if (opponents.length < 1 || opponents.length > MAX_PLAYERS - 1) {
    throw new Error('A solo game needs 1 to 3 opponents');
  }
  const players: PlayerConfig[] = [
    { id: HUMAN_ID, name: playerName.trim() || 'Moi', kind: 'human' },
    ...opponents.map((aiLevel, i) => ({
      id: `ai${i + 1}`,
      name: opponents.length === 1 ? 'Ordi' : AI_NAMES[i]!,
      kind: 'ai' as const,
      aiLevel,
    })),
  ];
  // Random seat order: rotate the list by a random amount.
  const shift = Math.floor(Math.random() * players.length);
  const seated = [...players.slice(shift), ...players.slice(0, shift)];

  getWords(); // decode the dictionary now rather than during the first move
  setSoloGame(createGame(seated, Math.floor(Math.random() * 2 ** 32)));
}
