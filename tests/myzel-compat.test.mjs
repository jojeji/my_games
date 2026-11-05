// The live Paket-1 save (the owner is playing it): a save from the middle of day 2 must load under Paket 2, keep every bit of progress,
// and continue at least as fast as it would have under Paket 1 (baseline recorded with the Paket-1 code in tests/fixtures/myzel-p1-day2.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMyzel, def } from '../games/myzel/logic.js';
import { nRate, hGainMult, zRate } from '../games/myzel/def.js';
import { createRuntime } from '../engine/core.js';
import { createStorage, parse, stringify } from '../engine/save.js';
import { runSchedule, pendlerSchedule } from '../tools/simulate-myzel.mjs';

const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/myzel-p1-day2.json', import.meta.url), 'utf8'));
const KEEP = (st) => parse(JSON.stringify(st));

/** Loads through the real save path: a version-1 envelope in storage, migrated by the runtime. */
function loadV1(state) {
  const mem = new Map();
  const backend = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  mem.set('mg:myzel:save', stringify({ v: 1, t: 1000, data: KEEP(state) }));
  const g = createMyzel();
  const rt = createRuntime(g, { storage: createStorage(backend), now: () => 1000 });
  const off = rt.load();
  return { g, rt, off, mem };
}

for (const fork of ['s', 'm']) {
  test(`Paket-1 save (day 2, fork ${fork}): migrates 1 -> 2 and keeps all progress; Paket-1 production is unchanged`, () => {
    const st = KEEP(fx[fork].state);
    const { g } = loadV1(fx[fork].state);
    assert.equal(def.version, 2);
    assert.equal(g.forkChoice('a'), fork);
    assert.equal(g.forkChoice('b'), null, 'fork B starts closed');
    assert.equal(g.state.layers.f.count, st.layers.f.count);
    assert.equal(g.state.layers.h.count, st.layers.h.count);
    assert.equal(g.state.time.played, st.time.played);
    assert.deepEqual(g.state.upg, st.upg);
    assert.deepEqual(g.state.ms, st.ms);
    assert.deepEqual(g.state.challenge.done, st.challenge.done);
    assert.equal(g.state.cur.f.total.toString(), st.cur.f.total.toString());
    assert.equal(g.state.myz.hRef, st.myz.hRef);
    assert.equal(g.state.myz.rain.charges, st.myz.rain.charges);
    for (const k of Object.keys(st.auto)) assert.equal(g.state.auto[k].on, st.auto[k].on, 'auto ' + k);
    // the new layers exist, empty
    for (const id of ['l', 'z', 'w', 'r']) assert.equal(g.state.layers[id].count, 0);
    assert.equal(g.state.myz.jr, 0);
    assert.equal(M_ended(g), false);
    // what the player has is worth exactly what it was: production and gains are the Paket-1 numbers
    const b = fx[fork].baseline;
    assert.ok(Math.abs(nRate(g) / b.nRate - 1) < 1e-9, `N/s ${nRate(g)} vs ${b.nRate}`);
    assert.ok(Math.abs(hGainMult(g) / b.hGainMult - 1) < 1e-9);
    assert.ok(Math.abs(zRate(g) - b.zRate) <= 1e-9 * Math.max(1, b.zRate));
    assert.equal(g.prestigeGain('f').toNumber(), b.fGain, 'the Fruchtkörper gain of this run is the same');
  });

  for (const [label, strategy] of [['the way the Paket-1 bot plays', { fMinFrac: 0.3 }], ['the Paket-2 bot', {}]]) {
    test(`Paket-1 save (day 2, fork ${fork}) continues at least as fast as under Paket 1 (${label})`, () => {
      const { seed, idx, t0 } = fx[fork].schedule;
      const rest = pendlerSchedule({ days: 6, seed }).slice(idx + 1).map((v) => ({ at: v.at - t0, len: v.len }));
      const { g } = loadV1(fx[fork].state);
      const base = fx[fork].baseline;
      let doneAt = null;
      const ctx = runSchedule(rest, { fork, ...strategy }, {
        game: g,
        hook: (c) => {
          if (doneAt === null && c.g.hasMs('f_keepb') && c.g.def.challenges.every((x) => c.g.chDone(x.id))) doneAt = c.t;
          return doneAt === null;
        },
      });
      assert.ok(doneAt !== null, 'the content of Paket 1 is finished');
      assert.ok(doneAt <= base.contentAt + 1, `content done ${doneAt} vs ${base.contentAt} (Paket 1)`);
      const fs_ = ctx.events.filter((e) => e.type === 'prestige' && e.id === 'f').map((e) => e.t);
      base.fPrestiges.forEach((t, i) => assert.ok(fs_[i] <= t + 1, `Fruchtkörper #${i + 1} at ${fs_[i]} vs ${t} (Paket 1)`));
      for (const [c, t] of Object.entries(base.chDone)) if (t !== null) assert.ok(ctx.first['challenge-done:' + c] <= t + 1, `${c} at ${ctx.first['challenge-done:' + c]} vs ${t}`);
      // and nothing of what the owner had got lost on the way: the upgrades of the loaded save are still there
      for (const id of Object.keys(fx[fork].state.upg)) assert.ok(g.upgLevel(id) > 0 || g.def.upgrades.find((u) => u.id === id).excl, id);
    });
  }
}

const M_ended = (g) => g.state.myz.end > 0;

test('the loaded Paket-1 save is saved again as version 2 and loads again unchanged (no second migration surprises)', () => {
  const { g, rt, mem } = loadV1(fx.s.state);
  rt.save();
  const env = parse(mem.get('mg:myzel:save'));
  assert.equal(env.v, 2);
  const g2 = createMyzel();
  g2.load(env.data);
  assert.deepEqual(g2.state.upg, g.state.upg);
  assert.equal(g2.state.layers.f.count, g.state.layers.f.count);
});
