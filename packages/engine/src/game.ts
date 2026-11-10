/**
 * Game state machine: players, racks, bag, turns and end of game.
 *
 * Design: every function is PURE. It takes a `GameState` and returns a new one
 * (or an error); nothing is mutated. Benefits:
 * - trivial undo / replay / persistence (a state is plain JSON-serializable data);
 * - the same code runs in the app (solo) and on the server (phase 2), where
 *   the server is the only one allowed to apply moves;
 * - easy unit testing.
 *
 * Supports 2 to 4 players; each player is a human or an AI (the AI itself
 * lives in step 4 and simply produces moves for this module).
 */

import { type Board, type Position, createEmptyBoard } from './board';
import type { WordList } from './dictionary';
import { type FormedWord, type PlacementError, type Result, analyzePlacement } from './move';
import { createRng, nextSeed, shuffle } from './rng';
import { type MoveScore, RACK_SIZE, scoreMove } from './scoring';
import { type Letter, type Tile, createTileSet, isBlank, tilePoints } from './tiles';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/**
 * The game ends when every player has passed / exchanged this many times in a
 * row (counted over the whole table: 2 rounds without anyone scoring).
 */
export const SCORELESS_ROUNDS_TO_END = 2;

export type PlayerKind = 'human' | 'ai';

/** Strength of a computer player (see ai.ts). */
export type AiLevel = 'easy' | 'medium' | 'expert';

export interface PlayerConfig {
  readonly id: string;
  readonly name: string;
  readonly kind: PlayerKind;
  /** Only for `kind: 'ai'`; defaults to 'medium'. */
  readonly aiLevel?: AiLevel;
}

export interface PlayerState extends PlayerConfig {
  readonly rack: readonly Tile[];
  readonly score: number;
}

/** What a player asks to play: one of their rack tiles on a square. */
export interface Placement {
  readonly tileId: number;
  readonly pos: Position;
  /** Required for a blank (the letter it stands for), must be omitted otherwise. */
  readonly letter?: Letter;
}

/** A completed turn, as stored in the game history. */
export type Turn =
  | {
      readonly kind: 'play';
      readonly playerId: string;
      readonly placements: readonly Placement[];
      readonly score: MoveScore;
    }
  | { readonly kind: 'exchange'; readonly playerId: string; readonly count: number }
  | { readonly kind: 'pass'; readonly playerId: string };

/** How a game ended: a player went out, everybody passed, or a player stopped it. */
export type EndReason = 'player_out' | 'all_passed' | 'stopped';

export interface FinalAdjustment {
  readonly playerId: string;
  /** Negative: value of tiles left on the rack. Positive: bonus for the player who went out. */
  readonly delta: number;
}

export interface GameState {
  readonly board: Board;
  /** Remaining tiles, drawn from the end of the array. */
  readonly bag: readonly Tile[];
  readonly players: readonly PlayerState[];
  readonly currentPlayerIndex: number;
  /** Consecutive turns without a word played (passes and exchanges). */
  readonly scorelessTurns: number;
  readonly history: readonly Turn[];
  /** Seed for the next random operation (re-shuffle after an exchange). */
  readonly seed: number;
  readonly status: 'playing' | 'finished';
  /** Set once the game is finished. */
  readonly end?: {
    readonly reason: EndReason;
    readonly adjustments: readonly FinalAdjustment[];
    /** For a stopped game: the player who stopped it. */
    readonly stoppedBy?: string;
  };
}

/** Errors a turn can produce, on top of the geometric `PlacementError`s. */
export type MoveError =
  | PlacementError
  | { readonly code: 'GAME_FINISHED' }
  | { readonly code: 'NOT_YOUR_TURN' }
  | { readonly code: 'TILE_NOT_IN_RACK'; readonly tileId: number }
  | { readonly code: 'BLANK_LETTER_MISSING'; readonly tileId: number }
  | { readonly code: 'LETTER_ON_NON_BLANK'; readonly tileId: number }
  | { readonly code: 'INVALID_WORDS'; readonly words: readonly string[] }
  | { readonly code: 'NOT_ENOUGH_TILES_IN_BAG' }
  | { readonly code: 'NOTHING_TO_EXCHANGE' };

export class GameSetupError extends Error {}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/**
 * Starts a new game: shuffles the bag with `seed` and deals 7 tiles to each
 * player, in order. Player 0 plays first (the caller chooses the order).
 */
export function createGame(players: readonly PlayerConfig[], seed: number): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new GameSetupError(`A game needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players`);
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) {
    throw new GameSetupError('Player ids must be unique');
  }

  const rng = createRng(seed);
  let bag: Tile[] = shuffle(createTileSet(), rng);
  const states: PlayerState[] = players.map((config) => {
    const { drawn, rest } = draw(bag, RACK_SIZE);
    bag = rest;
    return { ...config, rack: drawn, score: 0 };
  });

  return {
    board: createEmptyBoard(),
    bag,
    players: states,
    currentPlayerIndex: 0,
    scorelessTurns: 0,
    history: [],
    seed: nextSeed(rng),
    status: 'playing',
  };
}

/** Takes up to `count` tiles from the end of the bag. */
function draw(bag: readonly Tile[], count: number): { drawn: Tile[]; rest: Tile[] } {
  const n = Math.min(count, bag.length);
  return { drawn: bag.slice(bag.length - n), rest: bag.slice(0, bag.length - n) };
}

export function currentPlayer(state: GameState): PlayerState {
  return state.players[state.currentPlayerIndex]!;
}

// ---------------------------------------------------------------------------
// Playing a word
// ---------------------------------------------------------------------------

/** Result of evaluating a move without applying it (used for the live score preview). */
export interface MoveEvaluation {
  readonly words: readonly FormedWord[];
  readonly score: MoveScore;
  /** Formed words missing from the dictionary (empty = move is valid). */
  readonly invalidWords: readonly string[];
  readonly board: Board;
}

/**
 * Checks a move for the current player and computes its score, without
 * changing the state. Geometry and rack errors are returned as errors;
 * unknown words are reported in `invalidWords` so the UI can still show them.
 */
export function evaluateMove(
  state: GameState,
  playerId: string,
  placements: readonly Placement[],
  dictionary: WordList,
): Result<MoveEvaluation, MoveError> {
  const turnCheck = checkTurn(state, playerId);
  if (turnCheck) return { ok: false, error: turnCheck };

  // Match each placement with a tile of the player's rack.
  const rack = currentPlayer(state).rack;
  const used = new Set<number>();
  const tiles = [];
  for (const p of placements) {
    const tile = rack.find((t) => t.id === p.tileId);
    if (!tile || used.has(tile.id)) {
      return { ok: false, error: { code: 'TILE_NOT_IN_RACK', tileId: p.tileId } };
    }
    used.add(tile.id);
    let letter: Letter;
    if (isBlank(tile)) {
      if (!p.letter) return { ok: false, error: { code: 'BLANK_LETTER_MISSING', tileId: tile.id } };
      letter = p.letter;
    } else {
      if (p.letter !== undefined) {
        return { ok: false, error: { code: 'LETTER_ON_NON_BLANK', tileId: tile.id } };
      }
      letter = tile.letter!;
    }
    tiles.push({ pos: p.pos, cell: { letter, isBlank: isBlank(tile), tileId: tile.id } });
  }

  const analysis = analyzePlacement(state.board, tiles);
  if (!analysis.ok) return analysis;

  const { words, board } = analysis.value;
  return {
    ok: true,
    value: {
      words,
      board,
      score: scoreMove(words, tiles.length),
      invalidWords: words.map((w) => w.word).filter((w) => !dictionary.has(w)),
    },
  };
}

/**
 * Plays a word for `playerId`. The move is refused immediately if any formed
 * word is not in the dictionary (`INVALID_WORDS`), as decided for MaitreMot.
 */
export function playMove(
  state: GameState,
  playerId: string,
  placements: readonly Placement[],
  dictionary: WordList,
): Result<GameState, MoveError> {
  const evaluation = evaluateMove(state, playerId, placements, dictionary);
  if (!evaluation.ok) return evaluation;
  const { invalidWords, board, score } = evaluation.value;
  if (invalidWords.length > 0) {
    return { ok: false, error: { code: 'INVALID_WORDS', words: invalidWords } };
  }

  // Remove the played tiles from the rack and refill it from the bag.
  const player = currentPlayer(state);
  const playedIds = new Set(placements.map((p) => p.tileId));
  const { drawn, rest } = draw(state.bag, playedIds.size);
  const updated: PlayerState = {
    ...player,
    rack: [...player.rack.filter((t) => !playedIds.has(t.id)), ...drawn],
    score: player.score + score.total,
  };

  const next: GameState = {
    ...state,
    board,
    bag: rest,
    players: replacePlayer(state.players, state.currentPlayerIndex, updated),
    scorelessTurns: 0,
    history: [...state.history, { kind: 'play', playerId, placements, score }],
  };

  // Empty rack with an empty bag: the game is over.
  if (updated.rack.length === 0) return { ok: true, value: finishGame(next, 'player_out') };
  return { ok: true, value: advanceTurn(next) };
}

// ---------------------------------------------------------------------------
// Exchanging and passing
// ---------------------------------------------------------------------------

/**
 * Puts the chosen rack tiles back in the bag and draws as many new ones.
 * Only allowed while the bag holds at least 7 tiles.
 */
export function exchangeTiles(
  state: GameState,
  playerId: string,
  tileIds: readonly number[],
): Result<GameState, MoveError> {
  const turnCheck = checkTurn(state, playerId);
  if (turnCheck) return { ok: false, error: turnCheck };
  if (state.bag.length < RACK_SIZE)
    return { ok: false, error: { code: 'NOT_ENOUGH_TILES_IN_BAG' } };

  const ids = new Set(tileIds);
  if (ids.size === 0) return { ok: false, error: { code: 'NOTHING_TO_EXCHANGE' } };
  const player = currentPlayer(state);
  for (const id of ids) {
    if (!player.rack.some((t) => t.id === id)) {
      return { ok: false, error: { code: 'TILE_NOT_IN_RACK', tileId: id } };
    }
  }

  // Draw first, THEN put the old tiles back, so a player never gets the same
  // tiles back; finally re-shuffle the bag with the game's seed.
  const { drawn, rest } = draw(state.bag, ids.size);
  const returned = player.rack.filter((t) => ids.has(t.id));
  const rng = createRng(state.seed);
  const bag = shuffle([...rest, ...returned], rng);

  const updated: PlayerState = {
    ...player,
    rack: [...player.rack.filter((t) => !ids.has(t.id)), ...drawn],
  };
  return {
    ok: true,
    value: scorelessTurn({
      ...state,
      bag,
      seed: nextSeed(rng),
      players: replacePlayer(state.players, state.currentPlayerIndex, updated),
      history: [...state.history, { kind: 'exchange', playerId, count: ids.size }],
    }),
  };
}

export function passTurn(state: GameState, playerId: string): Result<GameState, MoveError> {
  const turnCheck = checkTurn(state, playerId);
  if (turnCheck) return { ok: false, error: turnCheck };
  return {
    ok: true,
    value: scorelessTurn({ ...state, history: [...state.history, { kind: 'pass', playerId }] }),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function checkTurn(state: GameState, playerId: string): MoveError | null {
  if (state.status === 'finished') return { code: 'GAME_FINISHED' };
  if (currentPlayer(state).id !== playerId) return { code: 'NOT_YOUR_TURN' };
  return null;
}

function replacePlayer(
  players: readonly PlayerState[],
  index: number,
  player: PlayerState,
): PlayerState[] {
  return players.map((p, i) => (i === index ? player : p));
}

function advanceTurn(state: GameState): GameState {
  return { ...state, currentPlayerIndex: (state.currentPlayerIndex + 1) % state.players.length };
}

/** Counts a pass / exchange and ends the game after too many in a row. */
function scorelessTurn(state: GameState): GameState {
  const scorelessTurns = state.scorelessTurns + 1;
  const next = { ...state, scorelessTurns };
  if (scorelessTurns >= SCORELESS_ROUNDS_TO_END * state.players.length) {
    return finishGame(next, 'all_passed');
  }
  return advanceTurn(next);
}

/**
 * End-of-game scoring: every player loses the value of the tiles left on their
 * rack. If someone went out, they also gain the sum of everyone else's leftovers.
 */
function finishGame(state: GameState, reason: EndReason): GameState {
  const leftovers = state.players.map((p) => p.rack.reduce((sum, t) => sum + tilePoints(t), 0));
  const totalLeft = leftovers.reduce((a, b) => a + b, 0);

  const adjustments: FinalAdjustment[] = state.players.map((p, i) => ({
    playerId: p.id,
    delta: reason === 'player_out' && i === state.currentPlayerIndex ? totalLeft : -leftovers[i]!,
  }));

  return {
    ...state,
    status: 'finished',
    players: state.players.map((p, i) => ({ ...p, score: p.score + adjustments[i]!.delta })),
    end: { reason, adjustments },
  };
}

/**
 * Stops the game at once, at any player's request (online games between
 * friends): the scores stay as they are, no end-of-game adjustment.
 */
export function stopGame(state: GameState, playerId: string): Result<GameState, MoveError> {
  if (state.status === 'finished') return { ok: false, error: { code: 'GAME_FINISHED' } };
  if (!state.players.some((p) => p.id === playerId)) {
    return { ok: false, error: { code: 'NOT_YOUR_TURN' } };
  }
  return {
    ok: true,
    value: {
      ...state,
      status: 'finished',
      end: {
        reason: 'stopped',
        stoppedBy: playerId,
        adjustments: state.players.map((p) => ({ playerId: p.id, delta: 0 })),
      },
    },
  };
}

/** Players sorted by final score, best first (ties keep play order). */
export function ranking(state: GameState): PlayerState[] {
  return [...state.players].sort((a, b) => b.score - a.score);
}
