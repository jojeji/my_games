// Paket 3: decisions matter at the end. The time gates of the deep layers (Fruchtkörper, Flechte/Fäulnis, Waldnetz) are shortened by the Kiefer (8 levels x 2 %)
// and the third way of the Waldnetz ("Frühlicht" x0,9, excludes Lichtung and Eichenhain): together up to -24 %. The pendler ending stays on day 5-7,
// and a player who buys them (the autobuyer values them) ends earlier than one who ignores them (gateW = 0 makes the value of a shorter gate 0).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMyzel } from '../games/myzel/logic.js';
import { TUNE as T } from '../games/myzel/tune.js';
import * as M from '../games/myzel/def.js';
import { runPendler, hms } from '../tools/simulate-myzel.mjs';
import { D } from '../engine/decimal.js';

const H = 3600;
const DAY = 86400;
function withWald() {
  const g = createMyzel();
  g.state.fork = { a: 's', b: 'l' };
  g.state.layers.w.count = 3;
  g.state.layers.f.count = 4;
  g.state.layers.l.count = 2;
  g.grant('w', D(1e6));
  g.refresh();
  return g;
}

test('Kiefer: 8 levels x 2 % shorten the gates of the Fruchtkörper, Flechte, Fäulnis and Waldnetz alike (not the very first run); the first levels are cheap', () => {
  const g = withWald();
  const gates = () => [M.fMinRun(g), M.bMinRun(g), M.wMinRun(g)];
  const before = gates();
  assert.equal(M.gateMul(g), 1);
  assert.ok(T.kieferBase <= 3 && T.kieferGrow <= 1.5, 'the first levels cost a handful of Waldfäden (a Waldnetz gives 9)');
  for (let i = 0; i < T.kieferMax; i++) assert.ok(g.upgBuy('t_kiefer'), 'level ' + (i + 1));
  assert.equal(g.upgCanBuy('t_kiefer'), false, 'maximum');
  const m = 1 - T.kieferGate * T.kieferMax;
  assert.ok(Math.abs(M.gateMul(g) - m) < 1e-12);
  gates().forEach((v, i) => assert.ok(Math.abs(v / before[i] - m) < 1e-9, `gate ${i}: ${v / before[i]}`));
  // the order of the time ladder stays F < l/z < w (a higher layer resets the run time of the lower ones)
  const [f, b, w] = gates();
  assert.ok(f < b && b < w);
  // the ripeness of the Fruchtkörper follows the gate (the same share of the gain at the gate)
  g.state.layers.f.runTime = M.fMinRun(g);
  const r1 = M.fRipeness(g);
  const g0 = withWald();
  g0.state.layers.f.runTime = M.fMinRun(g0);
  assert.ok(Math.abs(r1 / M.fRipeness(g0) - 1) < 1e-9);
});

test('Frühlicht: the third way of the Waldnetz (x0,9 on every gate), exclusive with Lichtung and Eichenhain; with the Kiefer up to about -24 %', () => {
  const g = withWald();
  g.state.layers.w.runTime = 100 * H;
  g.state.layers.w.count = 3;
  assert.ok(g.upgCanBuy('w25'), 'cheap and open from the first Waldnetz on');
  assert.ok(g.upgById.w25.excl.includes('w23') && g.upgById.w25.excl.includes('w24'));
  assert.ok(g.upgById.w23.excl.includes('w25') && g.upgById.w24.excl.includes('w25'));
  assert.ok(g.upgById.w31.requiresAny.includes('w25'), 'Urwald opens after any of the three');
  const gate = M.wMinRun(g);
  assert.ok(g.upgBuy('w25'));
  assert.ok(Math.abs(M.wMinRun(g) / gate - T.fruehGate) < 1e-9);
  for (let i = 0; i < T.kieferMax; i++) g.upgBuy('t_kiefer');
  const m = M.gateMul(g);
  assert.ok(m >= 0.74 && m <= 0.78, 'about -24 %: ' + m);
  assert.match(g.upgById.w25.desc, /Schließt „Lichtung“ und „Eichenhain“ aus/);
  // a live save that already owns Lichtung just cannot take the third way
  const h = withWald();
  h.state.upg.w23 = 1;
  assert.equal(h.upgExcluded(h.upgById.w25), true);
});

test('the deep autos count their time value in gates: a stored 6 h means "when the gate is open", also after the Kiefer', () => {
  const g = withWald();
  g.state.fork = { a: 's', b: 'l' };
  for (const id of ['auto_f', 'auto_l', 'auto_w']) {
    const a = g.def.autos.find((x) => x.id === id);
    assert.equal(a.defaults.mode, 'time');
  }
  // auto_f: the stored value is the repeat gate T.fMinRun; after 8 Kiefer levels the run is ripe at 84 % of it
  g.state.layers.f.count = 5;
  g.state.layers.h.count = 5;
  g.state.cur.h.total = D(1e9);
  g.state.layers.s.units = 9;
  g.state.cur.f.total = D(100);
  for (let i = 0; i < T.kieferMax; i++) g.upgBuy('t_kiefer');
  g.state.auto.auto_f.on = true;
  g.state.ms.l_m1 = true;
  g.state.layers.f.runTime = T.fMinRun * M.gateMul(g) + 1;
  g.state.myz.hAtF = D(0);
  g.refresh();
  const auto = g.def.autos.find((x) => x.id === 'auto_f');
  assert.equal(g.canPrestige('f'), true);
  const n = g.state.layers.f.count;
  auto.run(g, g.state.auto.auto_f);
  assert.equal(g.state.layers.f.count, n + 1, 'the auto prestiges at the shortened gate');
});

test('decisions matter at the end: a player who buys Kiefer and Frühlicht ends earlier than one who ignores them, both on day 5-7', () => {
  const ends = { good: [], careless: [] };
  for (const seed of [1, 2, 3]) {
    ends.good.push(runPendler({ days: 8, seed, fork: 's', forkB: 'l' }).contentAt);
    const keep = T.gateW;
    T.gateW = 0; // the autobuyer no longer values a shorter gate: Kiefer and Frühlicht stay on the shelf
    try {
      const c = runPendler({ days: 9, seed, fork: 's', forkB: 'l' });
      ends.careless.push(c.contentAt);
      assert.equal(c.g.upgLevel('t_kiefer') + c.g.upgLevel('w25'), 0, 'careless: nothing bought');
    } finally {
      T.gateW = keep;
    }
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  for (const e of [...ends.good, ...ends.careless]) assert.ok(e >= 5 * DAY && e <= 7 * DAY, 'ending on day 5-7: ' + hms(e));
  const gain = 1 - mean(ends.good) / mean(ends.careless);
  assert.ok(gain >= 0.04, `good play shortens the game by ${(gain * 100).toFixed(1)} % (${hms(mean(ends.good))} vs ${hms(mean(ends.careless))})`);
  assert.ok(gain <= 0.2, 'moderately: ' + gain);
});
