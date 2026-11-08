/**
 * AI tests with the real French dictionary: full games between computer
 * players, checking every move against the rules engine.
 */

import { describe, expect, it } from 'vitest';
import {
  type AiLevel,
  type GameState,
  type Letter,
  type Tile,
  chooseAiAction,
  createGame,
  currentPlayer,
  evaluateMove,
  generateMoves,
  playAiTurn,
  ranking,
} from '@maitremot/engine';
import { getWords } from '../src';

const words = getWords();

function aiGame(levels: AiLevel[], seed: number) {
  return createGame(
    levels.map((aiLevel, i) => ({ id: `ai${i}`, name: `IA ${i}`, kind: 'ai' as const, aiLevel })),
    seed,
  );
}

/** Plays a whole game, checking each AI move with the rules engine. */
function playOut(initial: GameState): { state: GameState; maxMoveMs: number } {
  let state = initial;
  let maxMoveMs = 0;
  for (let turn = 0; state.status === 'playing'; turn++) {
    expect(turn).toBeLessThan(200);
    const t0 = Date.now();
    const decision = chooseAiAction(state, words);
    maxMoveMs = Math.max(maxMoveMs, Date.now() - t0);

    if (decision.kind === 'play') {
      // The generator's score must match the official scoring, and every word must be valid.
      const evaluation = evaluateMove(state, currentPlayer(state).id, decision.placements, words);
      expect(evaluation.ok).toBe(true);
      if (evaluation.ok) {
        expect(evaluation.value.invalidWords).toEqual([]);
        expect(evaluation.value.score.total).toBe(decision.move.score);
      }
    }
    const next = playAiTurn(state, words);
    if (!next.ok) throw new Error(`AI move refused: ${next.error.code}`);
    state = next.value;
  }
  return { state, maxMoveMs };
}

describe('AI with the French dictionary', () => {
  it('plays complete games, with valid moves only (2 to 4 players)', () => {
    for (const [levels, seed] of [
      [['expert', 'expert'], 1],
      [['easy', 'medium', 'expert'], 2],
      [['medium', 'medium', 'easy', 'expert'], 3],
    ] as const) {
      const { state, maxMoveMs } = playOut(aiGame([...levels], seed));
      expect(state.status).toBe('finished');
      expect(state.history.some((t) => t.kind === 'play')).toBe(true);
      // Keep an eye on speed (the phone is slower than this machine).
      expect(maxMoveMs).toBeLessThan(2000);
    }
  }, 120_000);

  it('expert beats easy over several games', () => {
    let expertWins = 0;
    for (let seed = 10; seed < 16; seed++) {
      const { state } = playOut(aiGame(['easy', 'expert'], seed));
      if (ranking(state)[0]!.id === 'ai1') expertWins++;
    }
    expect(expertWins).toBeGreaterThanOrEqual(5);
  }, 120_000);

  it('finds a 7-tile word when there is one', () => {
    // "ARTISTE" uses the whole rack on an empty board.
    const state = aiGame(['expert', 'expert'], 1);
    const rack: Tile[] = [...'ARTISTE'].map((letter, id) => ({
      id: 1000 + id,
      letter: letter as Letter,
    }));
    const moves = generateMoves(state.board, rack, words);
    expect(moves.some((m) => m.placements.length === 7 && m.score > 50)).toBe(true);
  });
});
