// Idle pacing (separate file so node:test runs it in parallel with sim.test.mjs). Deterministic, no wall clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runSim } from '../tools/simulate.mjs';

test('pacing (idle play, check in every 2 min for 20 s): finishes within 24 h (~2x the active time)', () => {
  // dt = 2 s keeps the test fast; the autobuyers' 1 s intervals are then rounded up, which only makes this stricter
  const r = runSim({ hours: 24, dt: 2, act: 120, session: 20, quiet: true });
  assert.ok(r.endTime, 'idle player did not finish within 24 h');
  assert.ok(r.firsts.expansion.t <= 4500, 'first expansion ' + r.firsts.expansion.t);
});
