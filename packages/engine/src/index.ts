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
 * - dawg.ts       compact word graph (dictionary storage, AI move generation)
 * - lexicon.ts    board word → real spellings and lemmas (for definitions)
 * - game.ts       full game state machine (2–4 players)
 * - movegen.ts    generation of every legal move (Appel & Jacobson)
 * - ai.ts         computer opponents (3 levels)
 */

export * from './tiles';
export * from './rng';
export * from './board';
export * from './move';
export * from './scoring';
export * from './dictionary';
export * from './dawg';
export * from './lexicon';
export * from './game';
export * from './movegen';
export * from './ai';
