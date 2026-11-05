// Regenschauer: measurable, but only a bonus. The commuter without showers may be at most 15 % slower (spec) and must be slower at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPendler, hms } from '../tools/simulate-myzel.mjs';

test('Regenschauer: measurable (key moments of the commuter come later without them) and at most 15 % of the pacing', () => {
  const keys = (fork) => ['fork-chosen:a', 'prestige:' + fork, 'layer-unlocked:f', 'prestige:f', 'challenge-done:durre', 'challenge-done:frost', 'challenge-done:kahl'];
  const moments = [];
  const content = [];
  for (const fork of ['s', 'm']) {
    for (const seed of [1, 2, 3]) {
      const on = runPendler({ days: 6, seed, fork, rain: true });
      const off = runPendler({ days: 6, seed, fork, rain: false });
      assert.ok(on.contentAt && off.contentAt, `${fork}/${seed}: not finished`);
      content.push(off.contentAt / on.contentAt);
      for (const k of keys(fork)) {
        assert.ok(k in on.first && k in off.first, `${fork}/${seed}: ${k} missing`);
        moments.push(off.first[k] / on.first[k]);
      }
      // the whole run is never much faster without showers
      assert.ok(off.contentAt >= 0.93 * on.contentAt, `${fork}/${seed}: ${hms(off.contentAt)} without vs ${hms(on.contentAt)} with showers`);
    }
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(mean(moments) >= 1.03, 'showers are not measurable: key moments only ' + mean(moments).toFixed(3) + ' x later');
  assert.ok(mean(moments) <= 1.15, 'key moments ' + mean(moments).toFixed(3) + ' x later without showers');
  assert.ok(mean(content) <= 1.15 && mean(content) >= 1.0, 'content complete ' + mean(content).toFixed(3) + ' x later without showers');
});
