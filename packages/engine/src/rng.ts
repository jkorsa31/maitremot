/**
 * Seeded pseudo-random number generator.
 *
 * Why not `Math.random()`? With a seed, a whole game is reproducible: the same
 * seed gives the same shuffled bag. That makes unit tests deterministic, lets us
 * replay a game from its move list, and (phase 2) lets the server own the seed
 * so clients cannot predict the bag.
 *
 * Algorithm: mulberry32 — tiny, fast, good enough statistical quality for
 * shuffling tiles (it is NOT cryptographically secure; the server will pick
 * seeds from a secure source).
 */

/** A function returning a float in [0, 1), like `Math.random`. */
export type Rng = () => number;

export function createRng(seed: number): Rng {
  // Keep the state as an unsigned 32-bit integer.
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The internal state of an `Rng` cannot be saved, so a game stores a seed and
 * re-derives a new seed every time it needs randomness. This returns a fresh
 * 32-bit seed from an rng.
 */
export function nextSeed(rng: Rng): number {
  return Math.floor(rng() * 4294967296) >>> 0;
}

/** Fisher–Yates shuffle. Returns a new array, the input is left untouched. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}
