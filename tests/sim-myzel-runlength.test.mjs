// Run length per layer (tools/runlength-myzel.mjs): the lesson of Merlin. No layer may have its best gain from very short runs.
//  - Hyphen: optimum 2-4 minutes (the lowest layer, the auto-Hyphen default is in that range), 10-30 s runs clearly worse
//  - the branch (Sporen / Mykorrhiza): no micro-run advantage: short runs do not give more power than waiting
//  - Fruchtkörper: optimum of hours
import test from 'node:test';
import assert from 'node:assert/strict';
import { takeSnapshots, measureLayer, HORIZON } from '../tools/runlength-myzel.mjs';
import { TUNE as T } from '../games/myzel/tune.js';

for (const fork of ['s', 'm']) {
  test(`run length, fork ${fork}: Hyphen peaks at 2-4 min, branch has no micro-run optimum, Fruchtkörper needs hours`, () => {
    const snaps = takeSnapshots({ fork });
    assert.ok(snaps.h && snaps.b && snaps.f, 'snapshots: ' + Object.keys(snaps));
    for (const phase of ['h', 'b']) {
      const r = measureLayer(snaps[phase], 'h', [10, 30, 60, 120, 180, 300, 600, 1200], { horizon: 3600, dt: 2 });
      const rate = (L) => r.rows.find((x) => x.L === L).rate;
      assert.ok(r.best.L >= 90 && r.best.L <= 300, `Hyphen (${phase}): best run length ${r.best.L} s`);
      assert.ok(rate(10) < 0.35 * r.best.rate, `Hyphen (${phase}): 10 s runs at ${((rate(10) / r.best.rate) * 100).toFixed(0)} %`);
      assert.ok(rate(30) < 0.5 * r.best.rate, `Hyphen (${phase}): 30 s runs at ${((rate(30) / r.best.rate) * 100).toFixed(0)} %`);
      assert.ok(rate(1200) < 0.5 * r.best.rate, `Hyphen (${phase}): 20 min runs at ${((rate(1200) / r.best.rate) * 100).toFixed(0)} %`);
    }
    // the autobuyer default sits at the measured optimum
    assert.ok(T.autoHTime >= 120 && T.autoHTime <= 240, 'auto-Hyphen default ' + T.autoHTime);
    // the branch: units per second do not depend on the run length for short runs and waiting does not buy more power than a 1-minute cycle
    // (no micro-run advantage: a short cycle never beats a long one by more than a rounding error)
    const b = measureLayer(snaps.b, 'b', [60, 180, 600, 2400, 9600], { horizon: HORIZON.b, dt: 5 });
    const powerOf = (L) => b.rows.find((x) => x.L === L).logN;
    assert.ok(powerOf(60) <= powerOf(2400) + 0.3, `branch: 1 min cycles reach ${powerOf(60).toFixed(1)}, 40 min cycles ${powerOf(2400).toFixed(1)} (log10 N/s)`);
    // Fruchtkörper: the optimum is hours, 15-30 min runs earn nothing (the gain is below 1: they have not ripened)
    const f = measureLayer(snaps.f, 'f', [900, 1800, 3600, 7200, 14400], { horizon: HORIZON.f, dt: 10 });
    const fr = (L) => f.rows.find((x) => x.L === L).rate;
    assert.ok(f.best.L >= 3600 && f.bestN.L >= 3600, `Fruchtkörper: best run ${f.best.L} s (end power: ${f.bestN.L} s)`);
    assert.ok(fr(900) <= 0.05 * f.best.rate, `Fruchtkörper: 15 min runs at ${((fr(900) / f.best.rate) * 100).toFixed(0)} %`);
    assert.ok(fr(1800) <= 0.1 * f.best.rate, `Fruchtkörper: 30 min runs at ${((fr(1800) / f.best.rate) * 100).toFixed(0)} %`);
  });
}
