import { describe, expect, it } from 'vitest';
import {
  type GameState,
  type PlayerConfig,
  GameSetupError,
  createGame,
  createSetWordList,
  currentPlayer,
  evaluateMove,
  exchangeTiles,
  passTurn,
  playMove,
  ranking,
  tilePoints,
} from '../src';
import { placementsFor, withRack } from './helpers';

const dictionary = createSetWordList(['MOT', 'MOTS', 'ZERO', 'ZEROS', 'ARTISTE']);
const alice: PlayerConfig = { id: 'alice', name: 'Alice', kind: 'human' };
const bot: PlayerConfig = { id: 'bot', name: 'Ordinateur', kind: 'ai' };

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`Unexpected error ${result.error.code}`);
  return result.value;
}

describe('game creation', () => {
  it('deals 7 tiles to each player', () => {
    const state = createGame([alice, bot], 1);
    expect(state.players.map((p) => p.rack.length)).toEqual([7, 7]);
    expect(state.bag).toHaveLength(102 - 14);
    expect(currentPlayer(state).id).toBe('alice');
  });

  it('is reproducible from its seed', () => {
    expect(createGame([alice, bot], 7)).toEqual(createGame([alice, bot], 7));
  });

  it('accepts 2 to 4 players only', () => {
    expect(() => createGame([alice], 1)).toThrow(GameSetupError);
    const five = Array.from({ length: 5 }, (_, i) => ({ ...bot, id: `bot${i}` }));
    expect(() => createGame(five, 1)).toThrow(GameSetupError);
  });
});

describe('playing words', () => {
  function start(rackLetters = 'MOTSABC'): {
    state: GameState;
    rack: ReturnType<typeof withRack>['rack'];
  } {
    return withRack(createGame([alice, bot], 1), 0, rackLetters);
  }

  it('scores, refills the rack and passes the turn', () => {
    const { state, rack } = start();
    const next = unwrap(
      playMove(
        state,
        'alice',
        placementsFor(rack, { row: 7, col: 6 }, 'horizontal', 'MOT'),
        dictionary,
      ),
    );
    expect(next.players[0]!.score).toBe(4);
    expect(next.players[0]!.rack).toHaveLength(7);
    expect(next.bag).toHaveLength(state.bag.length - 3);
    expect(currentPlayer(next).id).toBe('bot');
    expect(next.history).toHaveLength(1);
  });

  it('refuses a word missing from the dictionary', () => {
    const { state, rack } = start();
    const result = playMove(
      state,
      'alice',
      placementsFor(rack, { row: 7, col: 6 }, 'horizontal', 'TOM'),
      dictionary,
    );
    expect(result).toEqual({ ok: false, error: { code: 'INVALID_WORDS', words: ['TOM'] } });
  });

  it('previews the score and the invalid words without changing the state', () => {
    const { state, rack } = start();
    const evaluation = unwrap(
      evaluateMove(
        state,
        'alice',
        placementsFor(rack, { row: 7, col: 6 }, 'horizontal', 'TOM'),
        dictionary,
      ),
    );
    expect(evaluation.score.total).toBe(4);
    expect(evaluation.invalidWords).toEqual(['TOM']);
  });

  it('refuses to play out of turn', () => {
    const { state, rack } = start();
    const result = playMove(
      state,
      'bot',
      placementsFor(rack, { row: 7, col: 6 }, 'horizontal', 'MOT'),
      dictionary,
    );
    expect(!result.ok && result.error.code).toBe('NOT_YOUR_TURN');
  });

  it('refuses tiles that are not in the rack', () => {
    const { state } = start();
    const result = playMove(
      state,
      'alice',
      [{ tileId: 999_999, pos: { row: 7, col: 7 } }],
      dictionary,
    );
    expect(!result.ok && result.error.code).toBe('TILE_NOT_IN_RACK');
  });

  it('requires a letter for a blank', () => {
    const { state, rack } = start('?OTABCD');
    const placements = placementsFor(rack, { row: 7, col: 6 }, 'horizontal', 'mOT');
    const withoutLetter = placements.map(({ tileId, pos }) => ({ tileId, pos }));
    const result = playMove(state, 'alice', withoutLetter, dictionary);
    expect(!result.ok && result.error.code).toBe('BLANK_LETTER_MISSING');

    // With the letter, the blank plays M but scores 0: O(1) + T(1).
    const next = unwrap(playMove(state, 'alice', placements, dictionary));
    expect(next.players[0]!.score).toBe(2);
  });

  it('gives the 50 points bonus for using all 7 tiles', () => {
    const { state, rack } = start('ARTISTE');
    const next = unwrap(
      playMove(
        state,
        'alice',
        placementsFor(rack, { row: 7, col: 4 }, 'horizontal', 'ARTISTE'),
        dictionary,
      ),
    );
    const turn = next.history[0]!;
    expect(turn.kind === 'play' && turn.score.bonus).toBe(50);
  });
});

describe('exchange and pass', () => {
  it('exchanges tiles, keeping the bag size', () => {
    const state = createGame([alice, bot], 3);
    const ids = state.players[0]!.rack.slice(0, 3).map((t) => t.id);
    const next = unwrap(exchangeTiles(state, 'alice', ids));
    expect(next.bag).toHaveLength(state.bag.length);
    expect(next.players[0]!.rack).toHaveLength(7);
    expect(next.players[0]!.rack.some((t) => ids.includes(t.id))).toBe(false);
    expect(currentPlayer(next).id).toBe('bot');
  });

  it('refuses an exchange when fewer than 7 tiles remain', () => {
    const state = { ...createGame([alice, bot], 3), bag: [] };
    const result = exchangeTiles(state, 'alice', [state.players[0]!.rack[0]!.id]);
    expect(!result.ok && result.error.code).toBe('NOT_ENOUGH_TILES_IN_BAG');
  });

  it('ends the game after two scoreless rounds and deducts the racks', () => {
    let state = createGame([alice, bot], 5);
    const before = state.players.map((p) => p.rack);
    for (let i = 0; i < 4; i++) state = unwrap(passTurn(state, currentPlayer(state).id));
    expect(state.status).toBe('finished');
    expect(state.end?.reason).toBe('all_passed');
    // Nobody scored: each final score is minus the value of the tiles left.
    state.players.forEach((p, i) => {
      expect(p.score).toBe(-before[i]!.reduce((sum, t) => sum + tilePoints(t), 0));
    });
    expect(passTurn(state, currentPlayer(state).id)).toEqual({
      ok: false,
      error: { code: 'GAME_FINISHED' },
    });
  });
});

describe('end of game', () => {
  it('gives the leftovers of the others to the player who goes out', () => {
    // Empty bag, Alice can play her last 3 tiles; the bot keeps "ZE" (10 + 1).
    const initial: GameState = { ...createGame([alice, bot], 9), bag: [] };
    const { state: aliceReady, rack } = withRack(initial, 0, 'MOT');
    const { state } = withRack(aliceReady, 1, 'ZE');

    const next = unwrap(
      playMove(
        state,
        'alice',
        placementsFor(rack, { row: 7, col: 6 }, 'horizontal', 'MOT'),
        dictionary,
      ),
    );
    expect(next.status).toBe('finished');
    expect(next.end?.reason).toBe('player_out');
    expect(next.players.map((p) => p.score)).toEqual([4 + 11, -11]);
    expect(ranking(next)[0]!.id).toBe('alice');
  });
});
