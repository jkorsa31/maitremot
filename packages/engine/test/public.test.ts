import { describe, expect, it } from 'vitest';
import { createGame, toPlayerView, toPublicState } from '../src';

const players = [
  { id: 'a', name: 'Alice', kind: 'human' as const },
  { id: 'b', name: 'Bob', kind: 'human' as const },
];

describe('public state', () => {
  const game = createGame(players, 4);
  const pub = toPublicState(game);

  it('hides the bag, the racks and the seed', () => {
    const json = JSON.stringify(pub);
    expect(json).not.toContain('"rack"');
    expect(json).not.toContain('"bag"');
    expect(json).not.toContain('"seed"');
    expect(pub.bagCount).toBe(game.bag.length);
    expect(pub.players.map((p) => p.rackCount)).toEqual([7, 7]);
  });

  it('rebuilds a playable view for one player', () => {
    const view = toPlayerView(pub, 'b', game.players[1]!.rack);
    expect(view.players[1]!.rack).toEqual(game.players[1]!.rack);
    expect(view.players[0]!.rack).toHaveLength(7);
    expect(view.players[0]!.rack.every((t) => t.letter === null && t.id < 0)).toBe(true);
    expect(view.bag).toHaveLength(game.bag.length);
    expect(view.board).toEqual(game.board);
    expect(view.currentPlayerIndex).toBe(game.currentPlayerIndex);
  });
});
