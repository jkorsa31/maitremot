/**
 * Computer opponents: picks a move for an AI player.
 *
 * All levels start from the complete list of legal moves (movegen.ts) and
 * differ only in how they choose:
 *
 * - **expert**: best "equity" = score + value of the tiles kept on the rack
 *   (the "leave"). Keeping a blank or an S and a balanced mix of vowels and
 *   consonants makes the next turns better, so a slightly lower score with a
 *   good leave can be preferable.
 * - **medium**: a random move scoring between 55% and 85% of the best one.
 * - **easy**: a random short move (≤ 4 tiles) scoring 20–50% of the best one.
 *
 * Randomness comes from a seeded generator, so a game stays reproducible.
 * When no word can be played, the AI exchanges its worst tiles (or passes when
 * the bag is too small to exchange).
 */

import type { Dawg } from './dawg';
import {
  type AiLevel,
  type GameState,
  type MoveError,
  type Placement,
  currentPlayer,
  exchangeTiles,
  passTurn,
  playMove,
} from './game';
import type { Result } from './move';
import { type GeneratedMove, generateMoves } from './movegen';
import { type Rng, createRng } from './rng';
import { RACK_SIZE } from './scoring';
import { type Letter, type Tile, tilePoints } from './tiles';

export type AiDecision =
  | {
      readonly kind: 'play';
      readonly placements: readonly Placement[];
      readonly move: GeneratedMove;
    }
  | { readonly kind: 'exchange'; readonly tileIds: readonly number[] }
  | { readonly kind: 'pass' };

/**
 * How useful a tile is to keep, in points (rough values tuned for French).
 * Blanks and S make many words and 7-tile moves possible; heavy letters
 * that are hard to place (Q, K, W) are a burden.
 */
const KEEP_VALUE: Record<Letter, number> & { blank: number } = {
  blank: 25,
  S: 8,
  E: 4,
  N: 2,
  R: 2,
  X: 2,
  A: 1,
  L: 1,
  T: 1,
  Z: 1,
  C: 0,
  D: 0,
  I: 0,
  M: 0,
  O: -1,
  P: -1,
  U: -1,
  B: -2,
  F: -2,
  G: -2,
  H: -2,
  Y: -2,
  J: -3,
  V: -4,
  K: -5,
  Q: -6,
  W: -6,
};
const VOWELS = new Set(['A', 'E', 'I', 'O', 'U', 'Y']);

/** Heuristic value of the tiles kept on the rack after a move. */
export function leaveValue(leave: readonly Tile[]): number {
  let value = 0;
  let vowels = 0;
  const seen = new Map<Letter, number>();
  for (const tile of leave) {
    if (tile.letter === null) {
      value += KEEP_VALUE.blank;
      continue;
    }
    value += KEEP_VALUE[tile.letter];
    if (VOWELS.has(tile.letter)) vowels++;
    // Duplicates reduce the number of different words available.
    const copies = (seen.get(tile.letter) ?? 0) + 1;
    seen.set(tile.letter, copies);
    if (copies > 1) value -= 4;
  }
  // Ideal leave: roughly 45% vowels (blanks are neutral).
  const letters = leave.filter((t) => t.letter !== null).length;
  value -= 3 * Math.abs(vowels - Math.round(letters * 0.45));
  return value;
}

/** Expert evaluation of a move in the current state. */
function equity(move: GeneratedMove, state: GameState): number {
  if (state.bag.length > 0) return move.score + leaveValue(move.leave);
  // Endgame: no more tiles to draw. Going out is worth twice the opponents'
  // leftovers (they lose them, we gain them); otherwise our leftovers cost us.
  const mine = move.leave.reduce((sum, t) => sum + tilePoints(t), 0);
  if (mine > 0) return move.score - 2 * mine;
  const others = state.players
    .filter((_, i) => i !== state.currentPlayerIndex)
    .reduce((sum, p) => sum + p.rack.reduce((s, t) => s + tilePoints(t), 0), 0);
  return move.score + 2 * others;
}

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)]!;
}

/** Chooses a move among `moves` according to the level. `moves` must not be empty. */
function selectMove(
  moves: readonly GeneratedMove[],
  state: GameState,
  level: AiLevel,
  rng: Rng,
): GeneratedMove {
  if (level === 'expert') {
    let best = moves[0]!;
    let bestEquity = equity(best, state);
    for (const move of moves) {
      const e = equity(move, state);
      if (e > bestEquity) [best, bestEquity] = [move, e];
    }
    return best;
  }

  const bestScore = moves.reduce((max, m) => Math.max(max, m.score), 0);
  const band = (low: number, high: number, maxTiles = RACK_SIZE) =>
    moves.filter(
      (m) =>
        m.score >= bestScore * low &&
        m.score <= bestScore * high &&
        m.placements.length <= maxTiles,
    );

  const candidates = level === 'medium' ? band(0.55, 0.85) : band(0.2, 0.5, 4);
  if (candidates.length > 0) return pick(candidates, rng);
  // Few moves available: medium takes the best, easy the weakest.
  const sorted = [...moves].sort((a, b) => a.score - b.score);
  return level === 'medium' ? sorted[sorted.length - 1]! : sorted[0]!;
}

/** Tiles to throw back when exchanging: everything except the most useful tiles. */
function tilesToExchange(rack: readonly Tile[]): number[] {
  const keep = new Set<number>();
  const blank = rack.find((t) => t.letter === null);
  const s = rack.find((t) => t.letter === 'S');
  const e = rack.find((t) => t.letter === 'E');
  for (const tile of [blank, s, e]) if (tile) keep.add(tile.id);
  const thrown = rack.filter((t) => !keep.has(t.id)).map((t) => t.id);
  // Always exchange at least one tile.
  return thrown.length > 0 ? thrown : [rack[rack.length - 1]!.id];
}

/**
 * Decides what the current player (an AI) does.
 * @param rng optional; by default derived from the game seed and turn number.
 */
export function chooseAiAction(state: GameState, dawg: Dawg, rng?: Rng): AiDecision {
  const player = currentPlayer(state);
  const level = player.aiLevel ?? 'medium';
  const random = rng ?? createRng(state.seed + state.history.length * 7919);

  const moves = generateMoves(state.board, player.rack, dawg);
  if (moves.length > 0) {
    const move = selectMove(moves, state, level, random);
    return { kind: 'play', placements: move.placements, move };
  }
  if (state.bag.length >= RACK_SIZE) {
    return { kind: 'exchange', tileIds: tilesToExchange(player.rack) };
  }
  return { kind: 'pass' };
}

/** Lets the current AI player play its turn and returns the new state. */
export function playAiTurn(state: GameState, dawg: Dawg, rng?: Rng): Result<GameState, MoveError> {
  const id = currentPlayer(state).id;
  const decision = chooseAiAction(state, dawg, rng);
  switch (decision.kind) {
    case 'play':
      return playMove(state, id, decision.placements, dawg);
    case 'exchange':
      return exchangeTiles(state, id, decision.tileIds);
    case 'pass':
      return passTurn(state, id);
  }
}
