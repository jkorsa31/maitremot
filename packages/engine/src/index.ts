/**
 * Public API of the MaitreMot game engine.
 *
 * Module overview:
 * - tiles.ts      letters, point values, tile set
 * - rng.ts        seeded random generator (reproducible games)
 * - board.ts      15×15 grid and bonus squares
 * - move.ts       placement rules and formed words
 * - scoring.ts    score of a move
 * - dictionary.ts word list abstraction
 * - game.ts       full game state machine (2–4 players)
 */

export * from './tiles';
export * from './rng';
export * from './board';
export * from './move';
export * from './scoring';
export * from './dictionary';
export * from './game';
