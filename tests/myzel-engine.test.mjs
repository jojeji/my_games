// Engine extensions that came with Myzel (game-agnostic, tested on a tiny definition): static layers, two layers in one row (fork),
// fork choice + respec, rate-based currencies, fixed offline cap, re-choosable exclusive upgrades, challenge goal functions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../engine/kit/game.js';
import { createRuntime } from '../engine/core.js';
import { D, ZERO } from '../engine/decimal.js';

const mini = (extra = {}) => ({
  id: 'mini',
  title: 'Mini',
  version: 1,
  currencies: [
    { id: 'n', name: 'N', layer: 0 },
    { id: 'h', name: 'H', layer: 1 },
    { id: 'a', name: 'A', layer: 2 },
    { id: 'b', name: 'B', layer: 2 },
    { id: 'c', name: 'C', layer: 3 },
  ],
  chains: [],
  income: [{ currency: 'n', rate: (g, dt) => D(10).mul(g.state.myx.boost ? 1 + g.state.myx.boost * (dt > 0 ? Math.min(g.state.myx.t, dt) / dt : 1) : 1) }],
  layers: [
    { id: 'h', name: 'H', layer: 1, currency: 'h', basis: 'n', formula: { threshold: 100, exp: 0.5 } },
    { id: 'a', name: 'A', layer: 2, currency: 'a', basis: 'n', static: { base: 100, grow: 10 }, available: (g) => g.forkIs('f', 'a') },
    { id: 'b', name: 'B', layer: 2, currency: 'b', basis: 'n', static: { base: 50, grow: 4, exp: 1.5 }, available: (g) => g.forkIs('f', 'b') },
    { id: 'c', name: 'C', layer: 3, currency: 'c', basis: 'h', basisFn: (g) => g.state.cur.h.total, formula: { threshold: 10, exp: 1 } },
  ],
  forks: [{
    id: 'f', row: 2, options: [{ id: 'a', layer: 'a' }, { id: 'b', layer: 'b' }],
    openWhen: (g) => g.state.cur.h.total.gte(5),
    secondWhen: (g) => g.state.myx.second,
    reset: { currencies: ['a', 'b'], nodes: ['a', 'b'] },
  }],
  rechoose: true,
  upgrades: [
    { id: 'u1', node: 'h', group: 'h', layer: 1, currency: 'h', cost: 2, excl: ['u2'] },
    { id: 'u2', node: 'h', group: 'h', layer: 1, currency: 'h', cost: 2, excl: ['u1'] },
    { id: 'ua', node: 'a', group: 'a', layer: 2, currency: 'a', cost: 1 },
  ],
  milestones: [{ id: 'ma', layer: 'a', cond: (g) => g.state.layers.a.units >= 1, name: 'a', desc: 'a' }],
  challenges: [{ id: 'ch', resetLayer: 3, goal: { currency: 'h', amount: 7, fn: (g) => g.state.cur.h.total.sub(g.state.myx.base) }, name: 'ch', desc: '', reward: '' }],
  autos: [],
  achievements: [],
  extraState: () => ({ myx: { boost: 0, t: 0, second: false, base: ZERO } }),
  hooks: { afterReset: (g, L) => { if (L >= 3) g.state.myx.base = g.state.cur.h.total; } },
  ...extra,
});

const give = (g, id, amt) => {
  g.add(id, D(amt));
  g.refresh();
  g.slowChecks(); // unlock checks of the layers (a layer opens in a slow check)
};

test('static layer: cost = base * grow^(k^exp), gain = units affordable at once, units are kept in the layer state', () => {
  const g = new Game(mini());
  g.state.fork.f = 'a';
  assert.equal(g.staticCost('a', 0).toNumber(), 100);
  assert.equal(g.staticCost('a', 2).toNumber(), 10000);
  assert.equal(g.staticGain('a').toNumber(), 0);
  give(g, 'n', 99);
  assert.equal(g.canPrestige('a'), false);
  give(g, 'n', 1);
  assert.equal(g.prestigeGain('a').toNumber(), 1);
  give(g, 'n', 9900); // 1e4: units 0,1,2 cost 100, 1e3, 1e4
  assert.equal(g.prestigeGain('a').toNumber(), 3);
  assert.equal(g.prestigeBasisFor('a', 1).toNumber(), 100);
  assert.equal(g.prestigeBasisFor('a', 4).toNumber(), 1e5);
  assert.ok(g.prestige('a'));
  assert.equal(g.state.layers.a.units, 3);
  assert.equal(g.get('a').toNumber(), 3);
  assert.equal(g.get('n').toNumber(), 0); // lower row reset
  assert.equal(g.staticCost('a', 3).toNumber(), 1e5); // next unit
  // a reset of a higher row takes the units
  g.state.layers.c.unlocked = true;
  give(g, 'h', 50);
  assert.ok(g.prestige('c'));
  assert.equal(g.state.layers.a.units, 0);
  // exponent > 1: steeper
  const k = g.staticCost('b', 4).toNumber();
  assert.equal(k, 50 * Math.pow(4, Math.pow(4, 1.5)));
  g.state.fork.f = 'b';
  g.state.cur.n.run = D(50 * Math.pow(4, Math.pow(2, 1.5)) * 1.0001);
  assert.equal(g.staticGain('b').toNumber(), 3); // indices 0, 1, 2 affordable
});

test('static layer: the basis can be a game-computed value (basisFn) and the layer can be switched off (available)', () => {
  const g = new Game(mini());
  g.state.cur.n.run = D(1e9);
  g.refresh();
  assert.equal(g.canPrestige('a'), false); // fork not chosen
  assert.equal(g.canPrestige('b'), false);
  g.state.cur.h.total = D(55);
  assert.equal(g.prestigeBasis('c').toNumber(), 55);
  assert.equal(g.prestigeGain('c').toNumber(), 5);
});

test('fork: offered when open, chosen once, the other branch stays closed until the game opens it, respec wipes the branch', () => {
  const g = new Game(mini());
  assert.equal(g.forkOffered('f'), false);
  assert.equal(g.forkChoose('f', 'a'), false); // not open yet
  g.state.cur.h.total = D(6);
  assert.equal(g.forkOffered('f'), true);
  assert.equal(g.forkChoose('f', 'zzz'), false);
  assert.equal(g.forkChoose('f', 'b'), true);
  assert.equal(g.forkChoice('f'), 'b');
  assert.equal(g.forkChoose('f', 'a'), false); // already chosen
  assert.equal(g.forkIs('f', 'b'), true);
  assert.equal(g.forkIs('f', 'a'), false);
  g.state.myx.second = true;
  assert.equal(g.forkIs('f', 'a'), true); // second branch open
  g.state.myx.second = false;
  // play the branch, then respec
  g.state.fork.f = 'a';
  give(g, 'n', 1000);
  g.prestige('a');
  g.upgBuy('ua');
  give(g, 'n', 500);
  g.state.cur.h.amount = D(9);
  assert.ok(g.hasMs('ma') || (g.slowChecks(), g.hasMs('ma')));
  const events = [];
  g.out = (t) => events.push(t);
  assert.ok(g.forkRespec('f'));
  assert.equal(g.forkChoice('f'), null);
  assert.equal(g.state.layers.a.units, 0);
  assert.equal(g.upgLevel('ua'), 0);
  assert.equal(g.get('a').toNumber(), 0);
  assert.equal(g.hasMs('ma'), false); // branch milestones are earned again
  assert.equal(g.get('n').toNumber(), 0); // the row above is reset too (no reward)
  assert.equal(g.get('h').toNumber(), 0);
  assert.ok(events.includes('fork-respec'));
  assert.equal(g.forkOffered('f'), true); // offered again
});

test('income: a rate-based currency grows with the time-weighted rate (one big step == many small steps)', () => {
  const a = new Game(mini());
  const b = new Game(mini());
  for (const g of [a, b]) {
    g.state.myx.boost = 4; // x5 while the timer runs
    g.state.myx.t = 100;
  }
  // the game decrements its own timer in a hook; emulate: timer runs 100 s
  const tickWithTimer = (g, dt) => {
    g.tick(dt);
    g.state.myx.t = Math.max(0, g.state.myx.t - dt);
  };
  for (let i = 0; i < 1000; i++) tickWithTimer(a, 0.3);
  tickWithTimer(b, 300);
  // 100 s at x5 (rate 50) + 200 s at x1 (rate 10) = 5000 + 2000
  assert.ok(Math.abs(a.get('n').toNumber() - 7000) < 60, 'small steps ' + a.get('n'));
  assert.ok(Math.abs(b.get('n').toNumber() - 7000) < 1, 'one step ' + b.get('n'));
  assert.equal(a.incomePerSec('n').toNumber() > 0, true);
});

test('fixed offline cap: def.offlineCapSeconds ignores the setting and bonus hooks', () => {
  const g = new Game(mini({ offlineCapSeconds: 3 * 3600, hooks: { offlineCapBonusHours: () => 99 } }));
  assert.equal(g.offlineCapSeconds(), 10800);
  g.state.settings.offlineCapHours = 72;
  assert.equal(g.offlineCapSeconds(), 10800);
  const rt = createRuntime(g, { now: () => 0 });
  const sum = rt.simulateOffline(10 * 3600);
  assert.equal(sum.seconds, 10800);
  assert.equal(sum.realSeconds, 36000);
  assert.equal(sum.capped, true);
  assert.ok(Math.abs(g.get('n').toNumber() - 108000) < 1);
  // a game without it keeps the setting
  const g2 = new Game(mini());
  assert.equal(g2.offlineCapSeconds(), 24 * 3600);
});

test('exclusive upgrades can be re-chosen after the next prestige of their layer (refund), not before', () => {
  const g = new Game(mini());
  give(g, 'h', 10);
  assert.ok(g.upgBuy('u1'));
  assert.equal(g.upgBuy('u2'), false); // excluded
  assert.equal(g.upgCanRechoose('u1'), false); // no prestige of the layer since
  assert.equal(g.upgRechoose('u1'), false);
  give(g, 'n', 400);
  g.state.layers.h.unlocked = true;
  assert.ok(g.prestige('h'));
  assert.equal(g.upgLevel('u1'), 1); // layer 1 upgrades survive a prestige of layer 1
  assert.equal(g.upgCanRechoose('u1'), true);
  const hBefore = g.get('h');
  assert.ok(g.upgRechoose('u1'));
  assert.equal(g.upgLevel('u1'), 0);
  assert.equal(g.get('h').sub(hBefore).toNumber(), 2); // full refund
  assert.ok(g.upgBuy('u2')); // the other side is free now
});

test('challenge goal can be a game-computed value (goal.fn)', () => {
  const g = new Game(mini());
  g.state.cur.h.total = D(20);
  g.state.layers.c.unlocked = true;
  assert.ok(g.chEnter('ch'));
  assert.equal(g.state.myx.base.toNumber(), 20); // afterReset(3) ran
  assert.equal(g.chValue(g.chDef('ch')).toNumber(), 0);
  g.state.cur.h.total = D(26);
  assert.equal(g.chCheckGoal(), false);
  g.state.cur.h.total = D(27);
  assert.equal(g.chCheckGoal(), true);
  assert.equal(g.chDone('ch'), true);
});

test('old games are unchanged: no fork/upgAt/units keys without the new features', () => {
  const g = new Game({ id: 'x', title: 'x', version: 1, currencies: [{ id: 'c', name: 'c', layer: 0 }], chains: [], layers: [{ id: 'p', name: 'p', layer: 1, currency: 'c', basis: 'c', formula: { threshold: 1, exp: 1 } }], upgrades: [], milestones: [], challenges: [], autos: [], achievements: [] });
  assert.equal('fork' in g.state, false);
  assert.equal('upgAt' in g.state, false);
  assert.equal('units' in g.state.layers.p, false);
});
