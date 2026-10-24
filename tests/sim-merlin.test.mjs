// Pacing tests for Merlin (active play). Deterministic: pure game logic, fixed time step, scripted player (tools/simulate-merlin.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { runSim } from '../tools/simulate-merlin.mjs';

const h = (s) => s / 3600;

test('pacing (active): Verjüngung 3-6 min, Epochensprung 25-45 min, eras 30-110 min, end of cycle 1 at 8-14 h, cycle 2 <= 40 %', () => {
  const r = runSim({ hours: 30, cycles: 2, quiet: true });
  assert.ok(r.rejuvFirst >= 180 && r.rejuvFirst <= 360, 'first Verjüngung ' + r.rejuvFirst);
  const jumps = r.eras.filter((e) => e.cycle === 0).map((e) => e.t);
  assert.equal(jumps.length, 7);
  assert.ok(jumps[0] >= 25 * 60 && jumps[0] <= 45 * 60, 'first Epochensprung ' + jumps[0]);
  const end1 = r.finished[0];
  const marks = [0, ...jumps, end1];
  for (let i = 1; i < marks.length; i++) {
    const m = (marks[i] - marks[i - 1]) / 60;
    assert.ok(m >= 30 && m <= 110, `era ${i - 1} took ${m.toFixed(0)} min`);
  }
  assert.ok(h(end1) >= 8 && h(end1) <= 14, 'end of cycle 1 at ' + h(end1));
  assert.ok(r.finished.length >= 2, 'cycle 2 not finished');
  const cycle2 = r.finished[1] - r.cycleStart[1];
  assert.ok(cycle2 <= 0.4 * end1, 'cycle 2 took ' + ((cycle2 / end1) * 100).toFixed(0) + ' % of cycle 1');
  assert.ok(r.gaps[0].len <= 600, 'longest pause without a decision: ' + r.gaps[0].len);
});
