// Seeded, deterministic random numbers (mulberry32) for game logic that must be reproducible: map layouts, mutation offers, sims.
// The whole generator state is ONE 32-bit integer, so it lives in the save as a plain number (`state.rng = { seed }`, JSON-safe, no Decimal).
// Never use Math.random() in game logic; DOM-free, runs in Node.
//
// Two ways to use it:
//   pure:      const [v, next] = rngNext(seed);            // v in [0, 1), next = new seed; the input is untouched
//   in place:  const v = rngRoll(state.rng);               // mutates { seed } and returns v; also rngInt, rngPick, rngShuffle
// A fresh game picks a seed once (`newSeed()`, the only non-deterministic function) and stores it; same seed -> same sequence.

/** Normalise any number to an unsigned 32-bit integer seed. */
export const toSeed = (n) => (Number.isFinite(n) ? Math.floor(n) >>> 0 : 0);

/** A random seed for a new game (the only place that is not deterministic). */
export const newSeed = () => toSeed(Math.random() * 4294967296);

/** Pure step: seed -> [value in [0,1), next seed]. */
export function rngNext(seed) {
  const next = (toSeed(seed) + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/** In place: advance `rng` ({ seed }) and return a value in [0, 1). */
export function rngRoll(rng) {
  const [v, next] = rngNext(rng.seed);
  rng.seed = next;
  return v;
}

/** Integer in [min, max] (both inclusive). */
export const rngInt = (rng, min, max) => min + Math.floor(rngRoll(rng) * (max - min + 1));

/** One element of a non-empty array. */
export const rngPick = (rng, arr) => arr[Math.floor(rngRoll(rng) * arr.length)];

/** Shuffled copy (Fisher-Yates). */
export function rngShuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rngRoll(rng) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
