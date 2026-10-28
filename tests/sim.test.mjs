// Pacing tests. Deterministic (pure game logic, fixed time step, no wall clock or randomness) and fast (a few seconds).
// They block deployment on purpose: a balance change that breaks the intended pacing has to be a conscious decision.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runSim } from '../tools/simulate.mjs';

const h = (s) => s / 3600;

test('pacing (active play): replication 3-6 min, expansion 30-60 min, singularity 3-5 h, end of content 10-20 h', () => {
  const r = runSim({ hours: 22, quiet: true });
  const { replication: rep, expansion: exp, singularity: sing } = r.firsts;
  assert.ok(rep.t >= 180 && rep.t <= 360, 'rep ' + rep.t);
  assert.ok(exp.t >= 1800 && exp.t <= 3600, 'exp ' + exp.t);
  assert.ok(h(sing.t) >= 3 && h(sing.t) <= 5, 'sing ' + h(sing.t));
  assert.ok(r.endTime && h(r.endTime) >= 10 && h(r.endTime) <= 20, 'end ' + (r.endTime && h(r.endTime)));
  // the value-based upgrade autobuyer (def.js repObjective) must not starve anything: every BP / expansion upgrade is maxed by the end
  const g = r.game;
  const left = g.def.upgrades.filter((u) => u.group !== 'research' && u.group !== 'seed' && !g.upgMaxed(u.id)).map((u) => u.id);
  assert.deepEqual(left, [], 'upgrades never maxed: ' + left);
  // no dead wall: the last two challenges are not separated by many hours
  const t = r.game.def.challenges.map((c) => r.firsts['ch_' + c.id].t).sort((a, b) => a - b);
  assert.ok(h(t[7] - t[6]) < 5, 'gap between the last two challenges: ' + h(t[7] - t[6]));
});

