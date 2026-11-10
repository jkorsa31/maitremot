/**
 * Server-side game logic of online games (the `game` Edge Function).
 *
 * The server is the referee: it alone holds the full game state (bag, racks),
 * checks that the right player is playing, validates every move with the same
 * engine and dictionary as the app, then publishes the new public state.
 *
 * This file knows nothing about Supabase: storage goes through the `Store`
 * interface (implemented with Supabase in store-supabase.ts, and in memory in
 * the tests).
 *
 * Game life cycle:
 *   create (lobby) → friends accept / decline → start (playing) → … → finished
 *   (any player may also stop a game in progress: it ends with the current scores)
 *                  ↘ cancel (cancelled)
 * A game starts automatically when every invited friend has answered and at
 * least 2 players joined; the creator may also start it earlier.
 */

import {
  type GameState,
  type MoveError,
  type Placement,
  type PlayerConfig,
  type Result,
  MAX_PLAYERS,
  createGame,
  exchangeTiles,
  passTurn,
  playMove,
  stopGame,
  toPublicState,
} from '@maitremot/engine';
import type { WordList } from '@maitremot/engine';

export type GameStatus = 'lobby' | 'playing' | 'finished' | 'cancelled';
export type PlayerStatus = 'invited' | 'joined' | 'declined';

export interface GameRow {
  readonly id: string;
  readonly createdBy: string;
  readonly status: GameStatus;
  readonly version: number;
}

/** Storage used by the handler. Every method may throw on infrastructure errors. */
export interface Store {
  friendIds(userId: string): Promise<string[]>;
  /** Display names, by user id. */
  displayNames(userIds: readonly string[]): Promise<Map<string, string>>;
  createGame(
    createdBy: string,
    players: readonly { userId: string; status: PlayerStatus }[],
  ): Promise<string>;
  getGame(gameId: string): Promise<GameRow | null>;
  players(gameId: string): Promise<{ userId: string; status: PlayerStatus }[]>;
  setPlayerStatus(gameId: string, userId: string, status: PlayerStatus): Promise<void>;
  /** Changes the status of a game that has not started (lobby → cancelled). */
  setGameStatus(gameId: string, status: GameStatus): Promise<void>;
  secretState(gameId: string): Promise<GameState | null>;
  /**
   * Saves a new state atomically if the game is still at `expectedVersion`.
   * Returns false if someone changed it in between.
   */
  applyUpdate(
    gameId: string,
    expectedVersion: number,
    status: GameStatus,
    state: GameState,
  ): Promise<boolean>;
}

/** Requests sent by the app. */
export type GameRequest =
  | { readonly action: 'create'; readonly friendIds: readonly string[] }
  | { readonly action: 'respond'; readonly gameId: string; readonly accept: boolean }
  | { readonly action: 'start'; readonly gameId: string }
  | { readonly action: 'cancel'; readonly gameId: string }
  | { readonly action: 'play'; readonly gameId: string; readonly placements: readonly Placement[] }
  | { readonly action: 'exchange'; readonly gameId: string; readonly tileIds: readonly number[] }
  | { readonly action: 'pass'; readonly gameId: string }
  | { readonly action: 'stop'; readonly gameId: string }
  | { readonly action: 'callToken'; readonly gameId: string };

/** Errors that are not about the move itself. */
export type ServerError =
  | { readonly code: 'BAD_REQUEST'; readonly message: string }
  | { readonly code: 'NOT_FOUND' }
  | { readonly code: 'FORBIDDEN' }
  | { readonly code: 'NOT_FRIENDS' }
  | { readonly code: 'WRONG_STATUS' }
  | { readonly code: 'NOT_ENOUGH_PLAYERS' }
  | { readonly code: 'CONFLICT' }
  | { readonly code: 'CALLS_DISABLED' };

export type GameResponse =
  | { readonly ok: true; readonly gameId: string; readonly callToken?: string }
  | { readonly ok: false; readonly error: ServerError | MoveError };

const fail = (error: ServerError | MoveError): GameResponse => ({ ok: false, error });

/** Random seed from a cryptographic source: players cannot predict the bag. */
function secureSeed(): number {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return buffer[0]!;
}

function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = secureSeed() % (i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/** Signs a call token for a player (see livekit.ts); absent when calls are not configured. */
export type CallTokenSigner = (identity: string, name: string, room: string) => Promise<string>;

export class GameHandler {
  constructor(
    private readonly store: Store,
    private readonly dictionary: WordList,
    private readonly signCallToken?: CallTokenSigner,
  ) {}

  async handle(userId: string, request: GameRequest): Promise<GameResponse> {
    switch (request.action) {
      case 'create':
        return this.create(userId, request.friendIds);
      case 'respond':
        return this.respond(userId, request.gameId, request.accept);
      case 'start':
        return this.startByCreator(userId, request.gameId);
      case 'cancel':
        return this.cancel(userId, request.gameId);
      case 'play':
        return this.move(userId, request.gameId, (s) =>
          playMove(s, userId, request.placements, this.dictionary),
        );
      case 'exchange':
        return this.move(userId, request.gameId, (s) => exchangeTiles(s, userId, request.tileIds));
      case 'pass':
        return this.move(userId, request.gameId, (s) => passTurn(s, userId));
      case 'stop':
        return this.move(userId, request.gameId, (s) => stopGame(s, userId));
      case 'callToken':
        return this.callToken(userId, request.gameId);
      default:
        return fail({ code: 'BAD_REQUEST', message: 'unknown action' });
    }
  }

  private async create(userId: string, friendIds: readonly string[]): Promise<GameResponse> {
    const invited = [...new Set(friendIds)];
    if (invited.length < 1 || invited.length > MAX_PLAYERS - 1 || invited.includes(userId)) {
      return fail({ code: 'BAD_REQUEST', message: 'invite 1 to 3 friends' });
    }
    const friends = new Set(await this.store.friendIds(userId));
    if (!invited.every((id) => friends.has(id))) return fail({ code: 'NOT_FRIENDS' });
    const gameId = await this.store.createGame(userId, [
      { userId, status: 'joined' },
      ...invited.map((id) => ({ userId: id, status: 'invited' as const })),
    ]);
    return { ok: true, gameId };
  }

  private async respond(userId: string, gameId: string, accept: boolean): Promise<GameResponse> {
    const game = await this.store.getGame(gameId);
    if (!game) return fail({ code: 'NOT_FOUND' });
    if (game.status !== 'lobby') return fail({ code: 'WRONG_STATUS' });
    const players = await this.store.players(gameId);
    const me = players.find((p) => p.userId === userId);
    if (!me) return fail({ code: 'FORBIDDEN' });
    if (me.status !== 'invited') return fail({ code: 'WRONG_STATUS' });
    await this.store.setPlayerStatus(gameId, userId, accept ? 'joined' : 'declined');

    // Everybody answered: start, or cancel if nobody else joined.
    const updated = players.map((p) =>
      p.userId === userId
        ? { ...p, status: accept ? ('joined' as const) : ('declined' as const) }
        : p,
    );
    if (updated.some((p) => p.status === 'invited')) return { ok: true, gameId };
    const joined = updated.filter((p) => p.status === 'joined');
    if (joined.length < 2) {
      await this.store.setGameStatus(gameId, 'cancelled');
      return { ok: true, gameId };
    }
    return this.start(
      game,
      joined.map((p) => p.userId),
    );
  }

  private async startByCreator(userId: string, gameId: string): Promise<GameResponse> {
    const game = await this.store.getGame(gameId);
    if (!game) return fail({ code: 'NOT_FOUND' });
    if (game.createdBy !== userId) return fail({ code: 'FORBIDDEN' });
    if (game.status !== 'lobby') return fail({ code: 'WRONG_STATUS' });
    const players = await this.store.players(gameId);
    const joined = players.filter((p) => p.status === 'joined').map((p) => p.userId);
    if (joined.length < 2) return fail({ code: 'NOT_ENOUGH_PLAYERS' });
    // Friends who did not answer in time are left out.
    for (const p of players) {
      if (p.status === 'invited') await this.store.setPlayerStatus(gameId, p.userId, 'declined');
    }
    return this.start(game, joined);
  }

  private async start(game: GameRow, userIds: readonly string[]): Promise<GameResponse> {
    const names = await this.store.displayNames(userIds);
    const configs: PlayerConfig[] = shuffled(userIds).map((id) => ({
      id,
      name: names.get(id) ?? 'Joueur',
      kind: 'human',
    }));
    const state = createGame(configs, secureSeed());
    const saved = await this.store.applyUpdate(game.id, game.version, 'playing', state);
    return saved ? { ok: true, gameId: game.id } : fail({ code: 'CONFLICT' });
  }

  private async cancel(userId: string, gameId: string): Promise<GameResponse> {
    const game = await this.store.getGame(gameId);
    if (!game) return fail({ code: 'NOT_FOUND' });
    if (game.createdBy !== userId) return fail({ code: 'FORBIDDEN' });
    if (game.status !== 'lobby') return fail({ code: 'WRONG_STATUS' });
    await this.store.setGameStatus(gameId, 'cancelled');
    return { ok: true, gameId };
  }

  /** A token to join the audio / video call of a game (its players only). */
  private async callToken(userId: string, gameId: string): Promise<GameResponse> {
    if (!this.signCallToken) return fail({ code: 'CALLS_DISABLED' });
    const game = await this.store.getGame(gameId);
    if (!game) return fail({ code: 'NOT_FOUND' });
    if (game.status !== 'playing' && game.status !== 'finished') {
      return fail({ code: 'WRONG_STATUS' });
    }
    const players = await this.store.players(gameId);
    if (!players.some((p) => p.userId === userId && p.status === 'joined')) {
      return fail({ code: 'FORBIDDEN' });
    }
    const names = await this.store.displayNames([userId]);
    const callToken = await this.signCallToken(userId, names.get(userId) ?? 'Joueur', gameId);
    return { ok: true, gameId, callToken };
  }

  /** Applies a move with the engine and saves the result. */
  private async move(
    userId: string,
    gameId: string,
    apply: (state: GameState) => Result<GameState, MoveError>,
  ): Promise<GameResponse> {
    const game = await this.store.getGame(gameId);
    if (!game) return fail({ code: 'NOT_FOUND' });
    if (game.status !== 'playing') return fail({ code: 'WRONG_STATUS' });
    const state = await this.store.secretState(gameId);
    if (!state) return fail({ code: 'NOT_FOUND' });
    if (!state.players.some((p) => p.id === userId)) return fail({ code: 'FORBIDDEN' });

    const result = apply(state);
    if (!result.ok) return fail(result.error);
    const status = result.value.status === 'finished' ? 'finished' : 'playing';
    const saved = await this.store.applyUpdate(gameId, game.version, status, result.value);
    return saved ? { ok: true, gameId } : fail({ code: 'CONFLICT' });
  }
}

/** Splits a full state into what is stored: public part and one rack per player. */
export function splitState(state: GameState) {
  return {
    publicState: toPublicState(state),
    racks: Object.fromEntries(state.players.map((p) => [p.id, p.rack])),
  };
}
