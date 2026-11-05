// The progress metric of the spec for the commuter: a visit counts as "with progress" when something new happens (upgrade, milestone,
// new layer, challenge, fork choice, new auto) or a prestige brings >= 10 % more of the layer's stock.
//  - >= 90 % of the visits with progress
//  - never 3 visits in a row without something NEW
//  - the first visit after the night has progress
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPendler, progressMetric, hms } from '../tools/simulate-myzel.mjs';

for (const fork of ['s', 'm']) {
  for (const seed of [1, 2, 3]) {
    test(`progress metric, fork ${fork}, seed ${seed}`, () => {
      const ctx = runPendler({ days: 6, seed, fork });
      const m = progressMetric(ctx);
      assert.ok(m.visits >= 12, 'visits: ' + m.visits);
      assert.ok(m.ratio >= 0.9, `only ${m.withProgress} of ${m.visits} visits with progress`);
      assert.ok(m.worstNewGap <= 2, `${m.worstNewGap} visits in a row without something new`);
      assert.ok(m.morning.length >= 1);
      for (const v of m.morning) assert.ok(v.progress, `first visit after the night (${hms(v.at)}) without progress`);
    });
  }
}
