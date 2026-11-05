// Run length per layer (tools/runlength-myzel.mjs): the lesson of Merlin. No layer may have its best gain from very short runs.
//  - Hyphen: optimum 2-4 minutes (the lowest layer, the auto-Hyphen default is in that range), 10-30 s runs clearly worse
//  - the branch (Sporen / Mykorrhiza): no micro-run advantage: short runs do not give more power than waiting
//  - Fruchtkörper: optimum of hours (the gate 6 h, ripe at 8 h)
//  - Flechte / Fäulnis and Waldnetz (Paket 2): a TIME GATE is the shortest possible run, so there is no micro-run optimum by construction; the
//    gate is also (nearly) the best run: waiting longer never pays more than a few percent
import test from 'node:test';
import assert from 'node:assert/strict';
import { takeSnapshots, measureLayer, measureDeep, HORIZON } from '../tools/runlength-myzel.mjs';
import { TUNE as T } from '../games/myzel/tune.js';

for (const fork of ['s', 'm']) {
  test(`run length, fork ${fork}: Hyphen peaks at 2-4 min, branch has no micro-run optimum, Fruchtkörper are gated to 6 h`, () => {
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
    // Fruchtkörper: the minimum run (fMinRun, 6 h) is the floor, the gain is ripe at ripeF (8 h): the best run is between the two (the economy is calm
    // now: the softcap of a run keeps waiting from paying), nothing shorter than 6 h exists, 12 h and longer runs are clearly worse
    const f = measureLayer(snaps.f, 'f', [21600, 28800, 43200, 86400], { horizon: HORIZON.f, dt: 10 });
    assert.ok(f.best.L >= T.fMinRun && f.best.L <= T.ripeF, `Fruchtkörper: best run ${f.best.L} s`);
    assert.ok(f.rows.find((x) => x.L === 21600).rate >= 0.8 * f.best.rate, 'the gate (6 h) is within 20 % of the best');
    assert.ok(f.rows.find((x) => x.L === 43200).rate < 0.7 * f.best.rate, 'a 12 h run is clearly worse');
    assert.ok(f.rows.find((x) => x.L === 86400).rate < 0.3 * f.best.rate, 'a 24 h run should be clearly worse');
  });
}

for (const [fork, forkB] of [['s', 'l'], ['m', 'z']]) {
  test(`run length of the deep layers, ${fork}${forkB}: the gate is the shortest run and (nearly) the best one for the fork-B layer and the Waldnetz`, () => {
    const snaps = takeSnapshots({ fork, forkB, deep: true });
    assert.ok(snaps.d && snaps.w, 'snapshots: ' + Object.keys(snaps));
    const d = [1, 1.5, 2, 3].map((m) => measureDeep(snaps.d, 'd', m, { horizon: 40 * 3600 }));
    const w = [1, 1.5, 2, 3].map((m) => measureDeep(snaps.w, 'w', m, { horizon: 60 * 3600 }));
    const best = (rows, k) => Math.max(...rows.map((r) => r[k]));
    // Flechte / Fäulnis: the own currency (lumps AND income) per hour: the gate is within 15 % of the best
    assert.ok(d[0].ownPerH >= 0.85 * best(d, 'ownPerH'), `fork-B layer: at the gate ${d[0].ownPerH.toFixed(1)}/h, best ${best(d, 'ownPerH').toFixed(1)}/h`);
    assert.ok(d[0].runs > d[3].runs, 'more runs at the gate than at 3x the gate');
    // Waldnetz: the Waldfäden per hour: the gate is the best (within 5 %), runs of 3 x the gate give a fraction
    assert.ok(w[0].wPerH >= 0.95 * best(w, 'wPerH'), `Waldnetz: at the gate ${w[0].wPerH.toFixed(2)}/h, best ${best(w, 'wPerH').toFixed(2)}/h`);
    assert.ok(w[3].wPerH < 0.5 * w[0].wPerH, 'Waldnetz: 3 x the gate gives less than half');
  });
}
