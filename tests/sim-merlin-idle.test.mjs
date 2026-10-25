// Idle pacing for Merlin (separate file: node:test runs it in parallel with sim-merlin.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { runSim } from '../tools/simulate-merlin.mjs';

test('pacing (idle: check in every 2 min for 20 s): finishes cycle 1 within 2x the active time (measured ~9.7 h)', () => {
  // dt = 2 s keeps the test fast
  const r = runSim({ hours: 24, dt: 2, act: 120, session: 20, quiet: true });
  assert.ok(r.finished.length >= 1, 'idle player did not finish within 24 h');
  assert.ok(r.finished[0] <= 14 * 3600, 'idle end ' + r.finished[0] / 3600);
  assert.ok(r.rejuvFirst <= 600, 'first Verjüngung ' + r.rejuvFirst);
  assert.ok(r.eras[0].t >= 25 * 60 && r.eras[0].t <= 60 * 60, 'first Epochensprung ' + r.eras[0].t);
});
