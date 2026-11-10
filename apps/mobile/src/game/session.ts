/**
 * The current solo game, kept in memory outside React so it survives screen
 * changes, and saved on the device after every change so it survives closing
 * the app. Also remembers the last setup (name, opponents) and feeds the stats.
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
import { load, save } from '../storage/storage';
import { recordFinishedGame } from './stats';

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
/** Identifies the current game (for the stats: count each game once). */
let currentId = '';
const listeners = new Set<() => void>();

const GAME_KEY = 'solo-game';
const SETTINGS_KEY = 'settings';

interface SavedGame {
  readonly id: string;
  readonly state: GameState;
}

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
  save<SavedGame>(GAME_KEY, game ? { id: currentId, state: game } : null);
  if (game?.status === 'finished') recordFinishedGame(currentId, game, HUMAN_ID);
  listeners.forEach((listener) => listener());
}

/** Restores the game saved on the device (called once at startup). */
export async function loadSoloGame(): Promise<void> {
  const saved = await load<SavedGame>(GAME_KEY);
  if (!saved) return;
  currentId = saved.id;
  current = saved.state;
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

/** The last setup used, to prefill the home screen. */
export function loadLastOptions(): Promise<SoloGameOptions | null> {
  return load<SoloGameOptions>(SETTINGS_KEY);
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
  save<SoloGameOptions>(SETTINGS_KEY, { playerName, opponents });
  currentId = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  setSoloGame(createGame(seated, Math.floor(Math.random() * 2 ** 32)));
}
