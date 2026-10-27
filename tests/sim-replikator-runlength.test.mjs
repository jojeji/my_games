// Run lengths must not collapse to micro-runs (the Merlin lesson, see docs/LESSONS.md). From snapshots of the active sim, play fixed run
// lengths of one layer (tools/runlength-replikator.mjs) and check
//  - replication: micro-runs (15-30 s) are far behind in Blaupausen per second, and the run length that reaches the next layer fastest is 2-8 min,
//  - expansion: Sternsysteme per second peak at >= 10 min,
//  - singularity: Quantenkerne per second peak at >= 10 min.
// dt = 2 keeps it fast (the tool itself runs with dt = 1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PHASES, takeSnapshots, measureLayer } from '../tools/runlength-replikator.mjs';

const ids = ['rep2', 'exp1', 'sing1'];
const snaps = takeSnapshots({ phases: PHASES.filter((p) => ids.includes(p.id)), dt: 2 });
const snap = (id) => snaps.find((s) => s.phase.id === id);
const pct = (r, L) => (r.rows.find((x) => x.L === L).rate / r.best.rate) * 100;

test('snapshots of all phases exist', () => assert.equal(snaps.length, ids.length));

test('replication: micro-runs are never optimal, 2-8 min reaches the Expansion fastest', () => {
  const r = measureLayer(snap('rep2'), 'replication', [30, 60, 120, 300, 600], { dt: 2, window: 1800, limit: 3600 });
  assert.ok(r.best.L >= 60, 'Blaupausen/s optimum at ' + r.best.L + ' s');
  assert.ok(pct(r, 30) < 10, '30 s runs at ' + pct(r, 30).toFixed(1) + ' % of the optimum');
  assert.ok(pct(r, 60) < 25, '1 min runs at ' + pct(r, 60).toFixed(1) + ' %');
  assert.ok(r.fast && r.fast.L >= 120 && r.fast.L <= 480, 'fastest to the Expansion: ' + (r.fast && r.fast.L) + ' s');
  const slow = r.rows.find((x) => x.L === 30);
  assert.ok(slow.tNext === null || slow.tNext > 2 * r.fast.tNext, '30 s runs need ' + slow.tNext + ' s vs ' + r.fast.tNext);
});

test('expansion: Sternsysteme per second peak at >= 10 min, 2 min runs clearly worse', () => {
  const r = measureLayer(snap('exp1'), 'expansion', [120, 300, 600, 1200, 2400], { dt: 2, window: 7200, limit: 7200 });
  assert.ok(r.best.L >= 600, 'optimum at ' + r.best.L + ' s');
  assert.ok(pct(r, 120) < 40, '2 min runs at ' + pct(r, 120).toFixed(1) + ' %');
});

test('singularity: Quantenkerne per second peak at >= 10 min, 2 min runs clearly worse', () => {
  const r = measureLayer(snap('sing1'), 'singularity', [120, 600, 1800, 3600], { dt: 2, window: 7200, limit: 7200 });
  assert.ok(r.best.L >= 600, 'optimum at ' + r.best.L + ' s');
  assert.ok(pct(r, 120) < 40, '2 min runs at ' + pct(r, 120).toFixed(1) + ' %');
});
