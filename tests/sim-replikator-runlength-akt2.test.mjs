// Run length in Akt II (docs/LESSONS.md #1): with the per-run softcaps of the far advanced states, many short Singularitäten beat one long one
// (2-min runs were the optimum, measured from the real end-of-v1 save and a fresh finish). The Singularität's ripeness factor (def.js singRipeness, tune.js singRipe)
// puts the optimum at 10-30+ min. Snapshots after 0 / 10 sectors of the real save and 5 sectors of a fresh finish, the sim player casts commands as in play;
// Singularität with the wait for the next sector ON (the game as played) and OFF (the run length alone). tools/runlength-replikator.mjs prints the full tables.
import test from 'node:test';
import assert from 'node:assert/strict';
import { measureLayer, takeAct2Snapshots } from '../tools/runlength-replikator.mjs';
import { TUNE as T } from '../games/replikator/tune.js';

const fixture = takeAct2Snapshots('fixture', [0, 10]);
const fresh = takeAct2Snapshots('fresh', [5]);
const snaps = [...fixture, ...fresh];
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

for (const [name, hold] of [['hold on (as played)', 20], ['hold off', 0]]) {
  test(`Singularität in Akt II, ${name}: Quantenkerne/s peak at 10 min or longer, 2-min runs stay far behind`, () => {
    for (const s of snaps) {
      const r = withHold(hold, () => measureLayer(s, 'singularity', [120, 600, 1800], { dt: 2, act2: true, window: 7200, limit: 7200 }));
      assert.ok(r.best.L >= 600, `${s.phase.label}: optimum ${r.best.L} s`);
      assert.ok(pct(r, 120) < 55, `${s.phase.label}: 2 min at ${pct(r, 120).toFixed(0)} %`);
    }
  });
}

test('Expansion in Akt II: Sternsysteme/s peak at 10 min or longer, 2-min runs stay far behind (Karte, Befehle und Mutationen eingerechnet)', () => {
  for (const s of snaps) {
    const r = withHold(20, () => measureLayer(s, 'expansion', [120, 600, 1800], { dt: 2, act2: true, window: 7200, limit: 7200 }));
    assert.ok(r.best.L >= 600, `${s.phase.label}: optimum ${r.best.L} s`);
    assert.ok(pct(r, 120) < 40, `${s.phase.label}: 2 min at ${pct(r, 120).toFixed(0)} %`);
  }
});
