// The best Verjüngung interval must not be a few seconds: from snapshots in the middle of several eras (active sim), play fixed run
// lengths with the normal buying / tapping / spells (tools/runlength-merlin.mjs) and check where Erinnerungen per second peak.
import test from 'node:test';
import assert from 'node:assert/strict';
import { takeSnapshots, measureEra } from '../tools/runlength-merlin.mjs';

test('optimal run length per era: >= 60 s (2-4 min), 12 s runs clearly worse, all 8 Quellen owned', () => {
  const eras = [0, 3, 5];
  const snaps = takeSnapshots({ eras, dt: 2 });
  assert.equal(snaps.length, eras.length);
  for (const s of snaps) {
    const r = measureEra(s, [12, 30, 60, 120, 180, 300, 600, 960], { horizon: 600, dt: 2 });
    const rate = (L) => r.rows.find((x) => x.L === L).rate;
    assert.ok(r.best.L >= 120 && r.best.L <= 300, `era ${s.era}: best run length ${r.best.L} s`);
    assert.ok(rate(12) < 0.35 * r.best.rate, `era ${s.era}: 12 s runs at ${((rate(12) / r.best.rate) * 100).toFixed(0)} % of the optimum`);
    assert.ok(rate(60) < 0.8 * r.best.rate, `era ${s.era}: 1 min runs at ${((rate(60) / r.best.rate) * 100).toFixed(0)} %`);
    assert.ok(rate(960) < 0.6 * r.best.rate, `era ${s.era}: 16 min runs at ${((rate(960) / r.best.rate) * 100).toFixed(0)} %`);
    const best = r.rows.find((x) => x.L === r.best.L);
    assert.ok(best.slots >= 7.99, `era ${s.era}: only ${best.slots} Quellen owned at the end of a ${best.L} s run`);
  }
});
