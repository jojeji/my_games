import test from 'node:test';
import assert from 'node:assert/strict';
import { runSim } from '../tools/simulate.mjs';

test('pacing: first replication within 3-6 min, first expansion within 30-60 min (active play)', () => {
  const r = runSim({ hours: 1.2, quiet: true, stopAtEnd: false });
  const rep = r.firsts.replication.t;
  const exp = r.firsts.expansion.t;
  assert.ok(rep >= 180 && rep <= 360, 'rep ' + rep);
  assert.ok(exp >= 1800 && exp <= 3600, 'exp ' + exp);
});
