// Regenschauer: measurable, but only a bonus. Without showers the commuter may be at most 15 % slower on the ending (spec) and the early key
// moments (fork A, first unit, Fruchtkörper, challenges: where the shower still matters) come measurably later.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPendler, hms } from '../tools/simulate-myzel.mjs';

test('Regenschauer: measurable on the early key moments, and at most 15 % of the pacing of the whole game (ending)', () => {
  const keys = (fork) => ['fork-chosen:a', 'prestige:' + fork, 'layer-unlocked:f', 'prestige:f', 'challenge-done:durre', 'challenge-done:frost', 'challenge-done:kahl'];
  const moments = [];
  const ending = [];
  for (const [fork, forkB] of [['s', 'l'], ['m', 'z']]) {
    for (const seed of [1, 2, 3]) {
      const on = runPendler({ days: 10, seed, fork, forkB, rain: true });
      const off = runPendler({ days: 10, seed, fork, forkB, rain: false });
      assert.ok(on.contentAt && off.contentAt, `${fork}${forkB}/${seed}: not finished`);
      ending.push(off.contentAt / on.contentAt);
      for (const k of keys(fork)) {
        assert.ok(k in on.first && k in off.first, `${fork}/${seed}: ${k} missing`);
        moments.push(off.first[k] / on.first[k]);
      }
      assert.ok(off.contentAt <= 1.15 * on.contentAt, `${fork}${forkB}/${seed}: ${hms(off.contentAt)} without vs ${hms(on.contentAt)} with showers`);
      assert.ok(off.contentAt >= 0.93 * on.contentAt, `${fork}${forkB}/${seed}: faster without showers?`);
    }
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(mean(moments) >= 1.03, 'showers are not measurable: key moments only ' + mean(moments).toFixed(3) + ' x later');
  assert.ok(mean(moments) <= 1.15, 'key moments ' + mean(moments).toFixed(3) + ' x later without showers');
  assert.ok(mean(ending) <= 1.15 && mean(ending) >= 0.97, 'ending ' + mean(ending).toFixed(3) + ' x later without showers');
});
