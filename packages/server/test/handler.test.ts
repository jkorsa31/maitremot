import {
  type GameState,
  currentPlayer,
  generateMoves,
  toPlayerView,
  toPublicState,
} from '@maitremot/engine';
import { getWords } from '@maitremot/lexicon-fr';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type GameRow,
  type GameStatus,
  type PlayerStatus,
  type Store,
  GameHandler,
} from '../src/handler';
import { parseRequest } from '../src/edge';

/** In-memory Store behaving like the database (including the version lock). */
class MemoryStore implements Store {
  friends = new Map<string, string[]>();
  names = new Map<string, string>();
  games = new Map<string, GameRow>();
  gamePlayers = new Map<string, { userId: string; status: PlayerStatus }[]>();
  secrets = new Map<string, GameState>();
  next = 1;

  async friendIds(userId: string) {
    return this.friends.get(userId) ?? [];
  }
  async displayNames(ids: readonly string[]) {
    return new Map(ids.map((id) => [id, this.names.get(id) ?? id]));
  }
  async createGame(
    createdBy: string,
    players: readonly { userId: string; status: PlayerStatus }[],
  ) {
    const id = `g${this.next++}`;
    this.games.set(id, { id, createdBy, status: 'lobby', version: 0 });
    this.gamePlayers.set(
      id,
      players.map((p) => ({ ...p })),
    );
    return id;
  }
  async getGame(id: string) {
    return this.games.get(id) ?? null;
  }
  async players(id: string) {
    return (this.gamePlayers.get(id) ?? []).map((p) => ({ ...p }));
  }
  async setPlayerStatus(id: string, userId: string, status: PlayerStatus) {
    const p = this.gamePlayers.get(id)!.find((x) => x.userId === userId)!;
    p.status = status;
  }
  async setGameStatus(id: string, status: GameStatus) {
    const g = this.games.get(id)!;
    this.games.set(id, { ...g, status, version: g.version + 1 });
  }
  async secretState(id: string) {
    return this.secrets.get(id) ?? null;
  }
  async applyUpdate(id: string, expected: number, status: GameStatus, state: GameState) {
    const g = this.games.get(id)!;
    if (g.version !== expected) return false;
    this.games.set(id, { ...g, status, version: g.version + 1 });
    this.secrets.set(id, state);
    return true;
  }
}

const words = getWords();
let store: MemoryStore;
let handler: GameHandler;

beforeEach(() => {
  store = new MemoryStore();
  handler = new GameHandler(store, words);
  // alice is friends with bob and carol; dave is a stranger.
  store.friends.set('alice', ['bob', 'carol']);
  store.friends.set('bob', ['alice']);
  store.friends.set('carol', ['alice']);
  store.names.set('alice', 'Alice').set('bob', 'Bob').set('carol', 'Carol');
});

async function createdGame(friendIds: string[]) {
  const res = await handler.handle('alice', { action: 'create', friendIds });
  if (!res.ok) throw new Error(JSON.stringify(res.error));
  return res.gameId;
}

describe('lobby', () => {
  it('only invites friends', async () => {
    expect(await handler.handle('alice', { action: 'create', friendIds: ['dave'] })).toEqual({
      ok: false,
      error: { code: 'NOT_FRIENDS' },
    });
    expect((await handler.handle('alice', { action: 'create', friendIds: [] })).ok).toBe(false);
  });

  it('starts automatically when the invited friend accepts', async () => {
    const id = await createdGame(['bob']);
    expect(store.games.get(id)!.status).toBe('lobby');
    expect(await handler.handle('bob', { action: 'respond', gameId: id, accept: true })).toEqual({
      ok: true,
      gameId: id,
    });
    expect(store.games.get(id)!.status).toBe('playing');
    const state = store.secrets.get(id)!;
    expect(state.players.map((p) => p.id).sort()).toEqual(['alice', 'bob']);
    expect(state.players.find((p) => p.id === 'bob')!.name).toBe('Bob');
    expect(state.players.every((p) => p.rack.length === 7)).toBe(true);
  });

  it('starts with those who accepted, or cancels if nobody did', async () => {
    const id = await createdGame(['bob', 'carol']);
    await handler.handle('bob', { action: 'respond', gameId: id, accept: true });
    expect(store.games.get(id)!.status).toBe('lobby'); // carol has not answered yet
    await handler.handle('carol', { action: 'respond', gameId: id, accept: false });
    expect(store.games.get(id)!.status).toBe('playing');
    expect(store.secrets.get(id)!.players).toHaveLength(2);

    const other = await createdGame(['bob']);
    await handler.handle('bob', { action: 'respond', gameId: other, accept: false });
    expect(store.games.get(other)!.status).toBe('cancelled');
  });

  it('lets only the creator start early or cancel', async () => {
    const id = await createdGame(['bob', 'carol']);
    expect((await handler.handle('alice', { action: 'start', gameId: id })) as unknown).toEqual({
      ok: false,
      error: { code: 'NOT_ENOUGH_PLAYERS' },
    });
    await handler.handle('bob', { action: 'respond', gameId: id, accept: true });
    expect(await handler.handle('bob', { action: 'start', gameId: id })).toEqual({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    expect((await handler.handle('alice', { action: 'start', gameId: id })).ok).toBe(true);
    expect(store.gamePlayers.get(id)!.find((p) => p.userId === 'carol')!.status).toBe('declined');
    expect(store.secrets.get(id)!.players).toHaveLength(2);
    expect((await handler.handle('alice', { action: 'cancel', gameId: id })).ok).toBe(false);
  });

  it('refuses answers from people not invited', async () => {
    const id = await createdGame(['bob']);
    expect(await handler.handle('carol', { action: 'respond', gameId: id, accept: true })).toEqual({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
  });
});

describe('moves', () => {
  async function playingGame() {
    const id = await createdGame(['bob']);
    await handler.handle('bob', { action: 'respond', gameId: id, accept: true });
    return id;
  }

  it('plays a valid move for the current player only', async () => {
    const id = await playingGame();
    const state = store.secrets.get(id)!;
    const current = currentPlayer(state);
    const other = state.players.find((p) => p.id !== current.id)!;
    const move = generateMoves(state.board, current.rack, words)[0];
    if (!move) return; // extremely unlikely: no word possible with this rack

    expect(
      await handler.handle(other.id, { action: 'play', gameId: id, placements: move.placements }),
    ).toEqual({ ok: false, error: { code: 'NOT_YOUR_TURN' } });

    const version = store.games.get(id)!.version;
    expect(
      await handler.handle(current.id, { action: 'play', gameId: id, placements: move.placements }),
    ).toEqual({ ok: true, gameId: id });
    const next = store.secrets.get(id)!;
    expect(next.players.find((p) => p.id === current.id)!.score).toBe(move.score);
    expect(currentPlayer(next).id).toBe(other.id);
    expect(store.games.get(id)!.version).toBe(version + 1);
  });

  it('rejects words missing from the dictionary', async () => {
    const id = await playingGame();
    const state = store.secrets.get(id)!;
    const current = currentPlayer(state);
    const [a, b] = current.rack.filter((t) => t.letter !== null);
    if (!a || !b) return;
    // Two rack letters on the star rarely make a word; skip if they do.
    const word = `${a.letter}${b.letter}`;
    if (words.has(word)) return;
    const res = await handler.handle(current.id, {
      action: 'play',
      gameId: id,
      placements: [
        { tileId: a.id, pos: { row: 7, col: 7 } },
        { tileId: b.id, pos: { row: 7, col: 8 } },
      ],
    });
    expect(res).toEqual({ ok: false, error: { code: 'INVALID_WORDS', words: [word] } });
  });

  it('passes and exchanges', async () => {
    const id = await playingGame();
    const first = currentPlayer(store.secrets.get(id)!);
    expect((await handler.handle(first.id, { action: 'pass', gameId: id })).ok).toBe(true);
    const second = currentPlayer(store.secrets.get(id)!);
    const tileIds = second.rack.slice(0, 2).map((t) => t.id);
    expect((await handler.handle(second.id, { action: 'exchange', gameId: id, tileIds })).ok).toBe(
      true,
    );
    const rack = store.secrets.get(id)!.players.find((p) => p.id === second.id)!.rack;
    expect(rack.some((t) => tileIds.includes(t.id))).toBe(false);
  });

  it('lets any player stop the game, with the current scores', async () => {
    const id = await playingGame();
    expect((await handler.handle('carol', { action: 'stop', gameId: id })).ok).toBe(false);
    expect(await handler.handle('bob', { action: 'stop', gameId: id })).toEqual({
      ok: true,
      gameId: id,
    });
    expect(store.games.get(id)!.status).toBe('finished');
    expect(store.secrets.get(id)!.end?.stoppedBy).toBe('bob');
    expect((await handler.handle('alice', { action: 'pass', gameId: id })).ok).toBe(false);
  });

  it('reports a conflict when the game changed meanwhile', async () => {
    const id = await playingGame();
    const first = currentPlayer(store.secrets.get(id)!);
    const real = store.applyUpdate.bind(store);
    // Someone else updates the game between our read and our write.
    store.applyUpdate = async (...args) => {
      const g = store.games.get(id)!;
      store.games.set(id, { ...g, version: g.version + 1 });
      return real(...args);
    };
    expect(await handler.handle(first.id, { action: 'pass', gameId: id })).toEqual({
      ok: false,
      error: { code: 'CONFLICT' },
    });
  });

  it('players only see their own rack', async () => {
    const id = await playingGame();
    const state = store.secrets.get(id)!;
    const pub = toPublicState(state);
    const bob = state.players.find((p) => p.id === 'bob')!;
    const view = toPlayerView(pub, 'bob', bob.rack);
    const alice = view.players.find((p) => p.id === 'alice')!;
    expect(alice.rack.every((t) => t.letter === null)).toBe(true);
    expect(JSON.stringify(pub)).not.toContain('"rack"');
  });
});

describe('request parsing', () => {
  it.each([
    [{ action: 'create', friendIds: ['a'] }, true],
    [{ action: 'create', friendIds: 'a' }, false],
    [{ action: 'respond', gameId: 'g', accept: true }, true],
    [{ action: 'respond', gameId: 'g' }, false],
    [{ action: 'play', gameId: 'g', placements: [] }, true],
    [{ action: 'exchange', gameId: 'g', tileIds: [1, 2] }, true],
    [{ action: 'exchange', gameId: 'g', tileIds: ['x'] }, false],
    [{ action: 'stop', gameId: 'g' }, true],
    [{ action: 'hack' }, false],
    [null, false],
  ])('%j → valid: %s', (body, valid) => {
    expect(parseRequest(body) !== null).toBe(valid);
  });
});

describe('call tokens', () => {
  it('are given to the players of the game only, when calls are configured', async () => {
    const signed: string[] = [];
    const withCalls = new GameHandler(store, words, async (identity, name, room) => {
      signed.push(`${identity}/${name}/${room}`);
      return 'token';
    });
    const id = (await withCalls.handle('alice', { action: 'create', friendIds: ['bob'] })) as {
      gameId: string;
    };
    expect(await withCalls.handle('alice', { action: 'callToken', gameId: id.gameId })).toEqual({
      ok: false,
      error: { code: 'WRONG_STATUS' },
    });
    await withCalls.handle('bob', { action: 'respond', gameId: id.gameId, accept: true });
    expect(await withCalls.handle('bob', { action: 'callToken', gameId: id.gameId })).toEqual({
      ok: true,
      gameId: id.gameId,
      callToken: 'token',
    });
    expect(signed).toEqual([`bob/Bob/${id.gameId}`]);
    expect((await withCalls.handle('carol', { action: 'callToken', gameId: id.gameId })).ok).toBe(
      false,
    );
    expect(await handler.handle('bob', { action: 'callToken', gameId: id.gameId })).toEqual({
      ok: false,
      error: { code: 'CALLS_DISABLED' },
    });
  });
});
