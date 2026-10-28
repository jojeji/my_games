// Run length in galaxy 2 (after a Galaxiensprung, the v1 layers start over): no layer may have its optimum at micro-runs (docs/LESSONS.md #1).
// Snapshots of the active sim right after the pick and after 5 sectors of galaxy 2; tools/runlength-replikator.mjs prints the full tables.
import test from 'node:test';
import assert from 'node:assert/strict';
import { measureLayer, takeGalaxySnapshots } from '../tools/runlength-replikator.mjs';
import { TUNE as T } from '../games/replikator/tune.js';

const snaps = takeGalaxySnapshots('fresh', [0, 5]);
const pct = (r, L) => (r.rows.find((x) => x.L === L).rate / r.best.rate) * 100;
const withHold = (hold, fn) => {
  const keep = T.mapHoldReach;
  T.mapHoldReach = hold;
  try {
    return fn();
  } finally {
    T.mapHoldReach = keep;
  }
};

test('two snapshots in galaxy 2 exist', () => {
  assert.equal(snaps.length, 2);
  assert.ok(snaps.every((s) => s.state.rep2.gal.n === 2 && s.state.rep2.gal.type));
});

test('Replikation in galaxy 2: Blaupausen/s peak at 5 min or longer, 30-s runs stay far behind', () => {
  for (const s of snaps) {
    const r = measureLayer(s, 'replication', [30, 120, 300, 600], { dt: 2, act2: true, window: 3600, limit: 3600 });
    assert.ok(r.best.L >= 300, `${s.phase.label}: optimum ${r.best.L} s`);
    assert.ok(pct(r, 30) < 20, `${s.phase.label}: 30 s at ${pct(r, 30).toFixed(0)} %`);
  }
});

test('Expansion in galaxy 2: Sternsysteme/s peak at 10 min or longer, 2-min runs stay far behind', () => {
  for (const s of snaps) {
    const r = measureLayer(s, 'expansion', [120, 600, 1200, 2400], { dt: 2, act2: true, window: 7200, limit: 7200 });
    assert.ok(r.best.L >= 600, `${s.phase.label}: optimum ${r.best.L} s`);
    assert.ok(pct(r, 120) < 40, `${s.phase.label}: 2 min at ${pct(r, 120).toFixed(0)} %`);
  }
});

for (const [name, hold] of [['hold on (as played)', 20], ['hold off', 0]]) {
  test(`Singularität in galaxy 2, ${name}: Quantenkerne/s peak at 10 min or longer`, () => {
    for (const s of snaps) {
      const r = withHold(hold, () => measureLayer(s, 'singularity', [120, 600, 1200, 1800], { dt: 2, act2: true, window: 10800, limit: 10800 }));
      assert.ok(r.best.L >= 600, `${s.phase.label}: optimum ${r.best.L} s`);
      if (!hold) assert.ok(pct(r, 120) < 40, `${s.phase.label}: 2 min at ${pct(r, 120).toFixed(0)} %`);
    }
  });
}
