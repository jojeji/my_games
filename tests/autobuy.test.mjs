// Autobuyer choice logic: value-based upgrade buying (engine/kit/upgrades.js upgBuyBest) and
// payback-with-saving Quellen buying (engine/kit/producers.js prodChoose / prodBuyAll) - constructed states where
// "cheapest first" / "best immediate payback among the affordable" is NOT the best choice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../engine/kit/game.js';
import { createMerlin } from '../games/merlin/logic.js';
import { buyMemUpgrades } from '../games/merlin/def.js';
import { D } from '../engine/decimal.js';

/* ---------------------------- upgrades (generic engine) ---------------------------- */

function miniGame(money) {
  const def = {
    id: 'mini', version: 1,
    currencies: [{ id: 'c', name: 'C', layer: 0, start: money }],
    chains: [], layers: [], challenges: [], achievements: [], milestones: [], autos: [], story: [],
    upgrades: [
      { id: 'cheap', group: 'g', layer: 0, currency: 'c', cost: 1, max: 1 }, // almost useless
      { id: 'good', group: 'g', layer: 0, currency: 'c', cost: 10, max: 1 }, // 10x the cost, 100x the effect
      { id: 'great', group: 'g', layer: 0, currency: 'c', cost: 100, max: 1 }, // the real prize
      { id: 'nothing', group: 'g', layer: 0, currency: 'c', cost: 2, max: 1 }, // no effect at all
    ],
  };
  return new Game(def);
}
const EFFECT = { cheap: 0.01, good: 1, great: 1e4, nothing: 0 };
const objective = (g) => Math.log(1 + Object.entries(EFFECT).reduce((a, [id, e]) => a + (g.upgLevel(id) ? e : 0), 0));
const owned = (g) => Object.keys(g.state.upg).filter((id) => g.upgLevel(id) > 0).sort();

test('upgBuyBest: buys the best value, not the cheapest', () => {
  const g = miniGame(11);
  // cheapest-first would take cheap (1) + nothing (2) and then could not afford good (10)
  const old = miniGame(11);
  old.upgBuyAll('g');
  assert.deepEqual(owned(old), ['cheap', 'nothing']);
  assert.ok(g.upgBuyBest('g', objective) >= 1);
  assert.deepEqual(owned(g), ['cheap', 'good'], 'good first (best value), then the leftover buys cheap; the useless one is skipped');
  assert.equal(g.get('c').toNumber(), 0);
});

test('upgBuyBest: does not let cheap upgrades starve an expensive good one that is within reach', () => {
  const g = miniGame(70); // great costs 100, 70 >= half of it: we are saving
  g.upgBuyBest('g', objective);
  assert.deepEqual(owned(g), [], 'nothing bought while saving for the best upgrade');
  assert.equal(g.get('c').toNumber(), 70);
  g.grant('c', 30);
  g.upgBuyBest('g', objective);
  assert.ok(g.upgLevel('great') === 1);
});

test('upgBuyBest: far from the goal, cheap useful upgrades are still bought; useless ones never', () => {
  const g = miniGame(30); // the goal (great, 100) is far: 30 < 50 % of its cost
  g.upgBuyBest('g', objective);
  assert.ok(g.upgLevel('good') === 1 && g.upgLevel('cheap') === 1, 'useful and <= 15 % of the goal cost');
  assert.ok(g.upgLevel('nothing') === 0, 'an upgrade without benefit is not a side purchase');
  assert.ok(g.upgLevel('great') === 0);
});

test('upgBuyBest: with nothing but useless upgrades left it still buys them, cheapest first', () => {
  const g = miniGame(5);
  g.state.upg.cheap = 1;
  g.state.upg.good = 1;
  g.state.upg.great = 1;
  g.upgBuyBest('g', objective);
  assert.equal(g.upgLevel('nothing'), 1);
});

test('Merlin auto_mem: Frühaufsteher/Magnet before the cheap but useless ones, and it saves for Sandmagnet', () => {
  const mk = (mem) => {
    const g = createMerlin();
    [12, 10, 8, 6, 4, 2, 0, 0].forEach((n, i) => (g.state.prod.quellen[i].n = n));
    g.state.cur.sand.total = D(1e4);
    g.state.cur.mem.amount = D(mem);
    g.refresh();
    return g;
  };
  const old = mk(80);
  old.upgBuyAll('mem');
  assert.ok(old.upgLevel('palast') > 0, 'cheapest-first wastes Erinnerungen on the Gedächtnispalast');
  const g = mk(80);
  buyMemUpgrades(g);
  assert.equal(g.upgLevel('fruehauf'), 1);
  assert.equal(g.upgLevel('palast'), 0);
  assert.ok(g.get('mem').toNumber() >= 40, 'keeps the rest for Sandmagnet (80)');
  g.grant('mem', 30);
  buyMemUpgrades(g);
  assert.ok(g.upgLevel('magnet') >= 1);
});

/* ---------------------------- Quellen ---------------------------- */

const mkQ = (own, sand) => {
  const g = createMerlin();
  own.forEach((n, i) => (g.state.prod.quellen[i].n = n));
  g.state.cur.sand.amount = D(sand);
  g.refresh();
  return g;
};

/** The old rule: among the affordable slots the best price / unit rate right now. */
function oldPick(g) {
  const p = g.producerById.quellen;
  let best = -1;
  let bs = null;
  for (let i = 0; i < p.slots.length; i++) {
    if (!g.prodVisible(p, i)) continue;
    const price = g.prodBulkCost(p, i, 1);
    if (price.gt(g.get('sand'))) continue;
    const sc = price.div(g.cache.prod.quellen.unit[i]).log10();
    if (bs === null || sc < bs) {
      best = i;
      bs = sc;
    }
  }
  return best;
}

test('prodIncomeGain predicts the real income change (units, bundle thresholds, synergies)', () => {
  const cases = [
    [[4, 3, 0, 0, 0, 0, 0, 0], 0, 1], // crosses the bundle at 5
    [[4, 3, 0, 0, 0, 0, 0, 0], 0, 7], // crosses 5 and 10
    [[30, 20, 50, 5, 0, 0, 0, 0], 3, 4], // slot 3 feeds slot 2 (+1 % each) and crosses 5/10
    [[30, 20, 50, 5, 0, 0, 0, 0], 0, 3], // slot 0 feeds slot 2 (+0.3 % each) and slot 7
    [[10, 9, 9, 9, 9, 9, 9, 9], 7, 2],
  ];
  for (const [own, i, k] of cases) {
    const g = mkQ(own, 0);
    const p = g.producerById.quellen;
    const scale = g.hooks.prodSynergyScale(g);
    const before = g.cache.prod.quellen.total;
    const predicted = g.prodIncomeGain(p, i, k, scale);
    g.state.prod.quellen[i].n += k;
    g.refresh();
    const actual = g.cache.prod.quellen.total.sub(before);
    assert.ok(predicted.sub(actual).abs().div(actual).lt(1e-9), `slot ${i} +${k}: predicted ${predicted} actual ${actual}`);
  }
});

test('prodBuyAll: a unit that completes a bundle threshold beats a "better looking" first unit of the next slot', () => {
  const g = mkQ([4, 0, 0, 0, 0, 0, 0, 0], 200); // slot 1's first unit costs 150, slot 0's 5th unit 50.6 (and doubles slot 0)
  g.state.prod.quellen[1].n = 0;
  g.state.prod.quellen[0].n = 4;
  g.refresh();
  assert.equal(oldPick(g), 1, 'the old rule goes for the first unit of slot 1');
  assert.equal(g.prodChoose('quellen').i, 0);
  g.prodBuyAll('quellen');
  assert.equal(g.state.prod.quellen[0].n >= 5, true);
  assert.equal(g.state.prod.quellen[1].n, 0, 'and the money for slot 1 is not there anymore');
});

test('prodBuyAll: saves for a much better purchase instead of feeding the low slots', () => {
  // 40000 for the first unit of slot 3 is out of reach (3000 in hand, 564/s) but clearly the best investment
  const g = mkQ([14, 10, 6, 0, 0, 0, 0, 0], 3000);
  assert.equal(oldPick(g), 0, 'the old rule would buy yet another unit of slot 0');
  const plan = g.prodChoose('quellen');
  assert.equal(plan.i, 3);
  assert.equal(plan.affordable, false);
  assert.equal(g.prodBuyAll('quellen'), 0);
  assert.equal(g.get('sand').toNumber(), 3000);
  // ... and when the money is there, it buys it
  g.grant('sand', 40000);
  assert.ok(g.prodBuyAll('quellen') >= 1);
  assert.ok(g.state.prod.quellen[3].n >= 1);
});

test('prodSpendAll (the "Alles kaufen" button) spends where the autobuyer would save', () => {
  const g = mkQ([14, 10, 6, 0, 0, 0, 0, 0], 3000);
  assert.equal(g.prodBuyAll('quellen'), 0);
  assert.ok(g.prodSpendAll('quellen') >= 1);
  const left = g.get('sand');
  const cheapest = g.def.producers[0].slots.map((_, i) => g.prodCostStart(g.def.producers[0], i)
    .mul(g.prodRatio(g.def.producers[0], i).pow(g.state.prod.quellen[i].n)))
    .filter((_, i) => g.prodVisible(g.def.producers[0], i))
    .reduce((a, b) => (b.lt(a) ? b : a));
  assert.ok(left.lt(cheapest), 'nothing affordable is left over');
});

test('prodBuyAll: with huge money everything is bought, every slot gets units, and it stays cheap in iterations', () => {
  const g = mkQ([0, 0, 0, 0, 0, 0, 0, 0], 1e30);
  g.prodBuyAll('quellen');
  g.prodBuyAll('quellen');
  const n = g.state.prod.quellen.map((q) => q.n);
  assert.ok(n.every((x) => x > 0), 'all 8 Quellen owned: ' + n.join(','));
});

test('prodBuyAll: from the start (25 Sand, no income) buys the first units and does not stall', () => {
  const g = createMerlin();
  g.grant('sand', 25 - g.get('sand').toNumber());
  assert.ok(g.prodBuyAll('quellen') >= 2);
});

test('upgBuyBest: an earlier "nothing to buy" does not stick when the state moves on (production grew)', () => {
  const g = miniGame(12);
  let grown = false; // production has built up: now 'good' is worth something and the objective is higher
  const obj = (gg) => Math.log(1 + (gg.upgLevel('cheap') ? 0.01 : 0) + (grown && gg.upgLevel('good') ? 1 : 0) + (gg.upgLevel('great') ? 1e4 : 0)) + (grown ? 5 : 0);
  g.upgBuyBest('g', obj);
  assert.deepEqual(owned(g), ['cheap']); // good had no benefit yet
  g.upgBuyBest('g', obj); // identical state: skipped, still nothing new
  assert.deepEqual(owned(g), ['cheap']);
  grown = true;
  g.upgBuyBest('g', obj);
  assert.equal(g.upgLevel('good'), 1);
});
