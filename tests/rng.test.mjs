import test from 'node:test';
import assert from 'node:assert/strict';
import { toSeed, newSeed, rngNext, rngRoll, rngInt, rngPick, rngShuffle } from '../engine/kit/rng.js';
import { parse, stringify } from '../engine/save.js';

const take = (seed, n) => {
  const rng = { seed };
  return Array.from({ length: n }, () => rngRoll(rng));
};

test('deterministic: same seed, same sequence; different seed, different sequence', () => {
  assert.deepEqual(take(42, 20), take(42, 20));
  assert.notDeepEqual(take(42, 20), take(43, 20));
  // known values (checked against the reference mulberry32): guards against accidental changes, which would change every saved map / offer
  assert.deepEqual(take(1, 3).map((v) => Math.round(v * 1e6)), [627074, 2736, 527447]);
});

test('pure step does not touch its input and matches the in-place helper', () => {
  const [v, next] = rngNext(7);
  assert.ok(v >= 0 && v < 1);
  assert.equal(rngNext(7)[0], v);
  const rng = { seed: 7 };
  assert.equal(rngRoll(rng), v);
  assert.equal(rng.seed, next);
});

test('distribution sanity: mean ~0.5, ten buckets roughly even, always in [0, 1)', () => {
  const xs = take(123456, 100000);
  assert.ok(xs.every((v) => v >= 0 && v < 1));
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(Math.abs(mean - 0.5) < 0.01, 'mean ' + mean);
  const buckets = new Array(10).fill(0);
  for (const v of xs) buckets[Math.floor(v * 10)]++;
  for (const b of buckets) assert.ok(b > 9500 && b < 10500, 'bucket ' + b);
});

test('the state is a plain number: survives JSON and the save format, sequence continues', () => {
  const state = { rng: { seed: newSeed() } };
  for (let i = 0; i < 5; i++) rngRoll(state.rng);
  assert.equal(typeof state.rng.seed, 'number');
  assert.ok(Number.isInteger(state.rng.seed) && state.rng.seed >= 0 && state.rng.seed < 2 ** 32);
  for (const copy of [JSON.parse(JSON.stringify(state)), parse(stringify(state))]) {
    assert.deepEqual(copy, state);
    const a = { ...state.rng };
    const b = { ...copy.rng };
    assert.deepEqual([rngRoll(a), rngRoll(a)], [rngRoll(b), rngRoll(b)]);
  }
});

test('toSeed normalises odd input', () => {
  assert.equal(toSeed(-1), 4294967295);
  assert.equal(toSeed(2 ** 32 + 5), 5);
  assert.equal(toSeed(3.9), 3);
  assert.equal(toSeed(NaN), 0);
  assert.equal(toSeed(undefined), 0);
});

test('rngInt covers the closed range, rngPick / rngShuffle are deterministic and keep the elements', () => {
  const rng = { seed: 99 };
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(rngInt(rng, 3, 6));
  assert.deepEqual([...seen].sort(), [3, 4, 5, 6]);
  const arr = [1, 2, 3, 4, 5, 6, 7, 8];
  const s1 = rngShuffle({ seed: 5 }, arr);
  assert.deepEqual(s1, rngShuffle({ seed: 5 }, arr));
  assert.deepEqual([...s1].sort(), arr);
  assert.deepEqual(arr, [1, 2, 3, 4, 5, 6, 7, 8], 'input untouched');
  assert.ok(arr.includes(rngPick({ seed: 5 }, arr)));
});
