// Regenschauer: measurable, but only a bonus. The commuter without showers may be at most 15 % slower (spec) and must be slower at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPendler, hms } from '../tools/simulate-myzel.mjs';

test('Regenschauer: the commuter with showers is faster, without them at most 15 % slower (mean over seeds and both forks)', () => {
  const ratios = [];
  for (const fork of ['s', 'm']) {
    for (const seed of [1, 2, 3]) {
      const on = runPendler({ days: 6, seed, fork, rain: true });
      const off = runPendler({ days: 6, seed, fork, rain: false });
      assert.ok(on.contentAt && off.contentAt, `${fork}/${seed}: not finished`);
      ratios.push(off.contentAt / on.contentAt);
      // every single key moment is later or equal without showers
      for (const k of ['prestige:f', 'challenge-done:kahl']) assert.ok(off.first[k] >= on.first[k] - 1, `${fork}/${seed} ${k}: ${hms(off.first[k])} vs ${hms(on.first[k])}`);
    }
  }
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  assert.ok(mean >= 1.02, 'showers are not measurable: ' + mean.toFixed(3));
  assert.ok(mean <= 1.15, 'without showers ' + mean.toFixed(3) + ' x slower');
  assert.ok(Math.max(...ratios) <= 1.2, 'worst case ' + Math.max(...ratios).toFixed(3));
});
