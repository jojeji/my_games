// No mutation may make micro-runs optimal (docs/LESSONS.md, tools/runlength-replikator.mjs): the same checks as sim-replikator-runlength.test.mjs,
// with representative mutations in the genome (the effects come from the genome only, so snapshots of the normal sim can carry one).
// Measured for ALL 15 mutations one by one with the tool (tmp script, see LESSONS): the optimum never moved below 10 min (Replikation) / 20 min (Expansion, Singularität).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PHASES, takeSnapshots, measureLayer } from '../tools/runlength-replikator.mjs';

const ids = ['rep2', 'exp1', 'sing1'];
const snaps = takeSnapshots({ phases: PHASES.filter((p) => ids.includes(p.id)), dt: 2 });
const withGenome = (id, genome) => {
  const snap = snaps.find((s) => s.phase.id === id);
  const state = JSON.parse(JSON.stringify(snap.state));
  state.rep2 = { ...(state.rep2 || {}), mut: { ...((state.rep2 && state.rep2.mut) || {}), genome } };
  return { ...snap, state };
};
const pct = (r, L) => (r.rows.find((x) => x.L === L).rate / r.best.rate) * 100;

// the worst offenders for short runs: cost and bundle effects, production and gain multipliers, and everything at once
const SETS = {
  sparsam: ['sparsam'],
  buendelfieber: ['buendelfieber'],
  geduldig: ['geduldig'],
  glueckstreffer: ['glueckstreffer'],
  alles: ['sparsam', 'buendelfieber', 'glueckstreffer', 'ueberschuss', 'hyperaktiv', 'gigantismus'],
};

for (const [name, genome] of Object.entries(SETS)) {
  test(`Replikation with ${name}: micro-runs stay far behind, the fastest way to the Expansion is 2-8 min`, () => {
    const r = measureLayer(withGenome('rep2', genome), 'replication', [30, 60, 120, 300, 600], { dt: 2, window: 1800, limit: 3600 });
    assert.ok(r.best.L >= 300, 'Blaupausen/s optimum at ' + r.best.L + ' s');
    assert.ok(pct(r, 30) < 10, '30 s at ' + pct(r, 30).toFixed(1) + ' %');
    assert.ok(pct(r, 60) < 25, '1 min at ' + pct(r, 60).toFixed(1) + ' %');
    assert.ok(r.fast && r.fast.L >= 120 && r.fast.L <= 480, 'fastest to the Expansion: ' + (r.fast && r.fast.L));
  });
}

test('Expansion and Singularität with everything at once: Sternsysteme / Quantenkerne per second still peak at >= 10 min', () => {
  const e = measureLayer(withGenome('exp1', SETS.alles), 'expansion', [120, 300, 600, 1200, 2400], { dt: 2, window: 7200, limit: 7200 });
  assert.ok(e.best.L >= 600 && pct(e, 120) < 40, 'Expansion optimum ' + e.best.L + ', 2 min at ' + pct(e, 120).toFixed(1) + ' %');
  const s = measureLayer(withGenome('sing1', SETS.alles), 'singularity', [120, 600, 1800, 3600], { dt: 2, window: 7200, limit: 7200 });
  assert.ok(s.best.L >= 600 && pct(s, 120) < 40, 'Singularität optimum ' + s.best.L + ', 2 min at ' + pct(s, 120).toFixed(1) + ' %');
});
