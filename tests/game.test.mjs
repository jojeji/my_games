import test from 'node:test';
import assert from 'node:assert/strict';
import { createReplikator } from '../games/replikator/logic.js';
import { createRuntime, advance } from '../engine/core.js';
import { createStorage } from '../engine/save.js';
import { D } from '../engine/decimal.js';

const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};

test('buying generators costs matter and produces', () => {
  const g = createReplikator();
  assert.equal(g.genBuy('matter', 0, 1), 1);
  assert.ok(g.get('matter').lt(10));
  advance(g, 10);
  assert.ok(g.get('matter').gt(1));
  assert.equal(g.genBuy('matter', 1, 1), 0); // tier 2 needs affordable + visible
});

test('bulk cost matches repeated single purchases', () => {
  const g = createReplikator();
  g.grant('matter', 1e6);
  const chain = g.chainById.matter;
  const bulk = g.genBulkCost(chain, 0, 7);
  const before = g.get('matter');
  g.genBuy('matter', 0, 7);
  assert.ok(before.sub(g.get('matter')).sub(bulk).abs().div(bulk).lt(1e-9));
});

test('prestige resets lower layers and awards currency', () => {
  const g = createReplikator();
  g.add('matter', D(1e9));
  g.slowChecks();
  const gain = g.prestigeGain('replication');
  assert.ok(gain.gte(1));
  assert.ok(g.prestige('replication'));
  assert.equal(g.get('blueprints').toString(), gain.toString());
  assert.ok(g.get('matter').lte(10));
  assert.equal(g.state.layers.replication.count, 1);
  assert.equal(g.prestige('replication'), false);
});

test('challenge rules apply and completion rewards', () => {
  const g = createReplikator();
  g.state.ms.ex1 = true;
  assert.ok(g.chEnter('c_enge'));
  assert.equal(g.cache.maxTier.matter, 4);
  g.state.cur.matter.run = D(1e17);
  g.chCheckGoal();
  assert.ok(g.chDone('c_enge'));
  assert.equal(g.chActive(), null);
  assert.equal(g.cache.maxTier.matter, 8);
});

test('research exclusivity and respec', () => {
  const g = createReplikator();
  g.grant('cores', 5000);
  for (const id of ['kern', 'a_dichte', 'a_fluss', 'a_schmiede']) assert.ok(g.upgBuy(id), id);
  g.grant('cores', 5000);
  assert.equal(g.upgBuy('b_ernte'), true);
  assert.equal(g.upgBuy('b_kosten'), true);
  assert.equal(g.upgBuy('b_entropie'), false); // excluded by a_schmiede
  const before = g.get('cores');
  g.upgRespec('research', 3);
  assert.ok(g.get('cores').gt(before));
  assert.equal(g.upgLevel('kern'), 0);
});

test('serialize roundtrip through runtime storage', () => {
  const storage = createStorage(mem());
  const g = createReplikator();
  const rt = createRuntime(g, { storage });
  rt.load();
  g.grant('matter', 1e12);
  g.genBuy('matter', 0, 5);
  rt.save();
  const g2 = createReplikator();
  const rt2 = createRuntime(g2, { storage });
  rt2.load();
  assert.equal(g2.state.gens.matter[0].bought, 5);
  assert.equal(g2.get('matter').toString(), g.get('matter').toString());
  assert.ok(rt2.exportString().startsWith('MGSAVE1.replikator.'));
  rt2.importString(rt.exportString());
});

test('offline progress is capped and roughly matches fine-grained ticking', () => {
  let t = 1_000_000;
  const storage = createStorage(mem());
  const g = createReplikator();
  const rt = createRuntime(g, { storage, now: () => t });
  rt.load();
  g.grant('matter', 1e5);
  for (let i = 0; i < 4; i++) g.genBuy('matter', i, 3);
  rt.save();
  // fine-grained reference
  const ref = createReplikator();
  ref.load(g.serialize());
  advance(ref, 600, { maxStep: 0.05, maxSteps: 1e5 });
  t += 600_000;
  const g2 = createReplikator();
  const rt2 = createRuntime(g2, { storage, now: () => t });
  const summary = rt2.load();
  assert.equal(Math.round(summary.seconds), 600);
  const ratio = g2.state.cur.matter.total.div(ref.state.cur.matter.total).toNumber();
  assert.ok(ratio > 0.8 && ratio < 1.25, 'ratio ' + ratio);
  // cap
  t += 100 * 3600 * 1000;
  rt2.save();
  t += 100 * 3600 * 1000;
  const g3 = createReplikator();
  const s3 = createRuntime(g3, { storage, now: () => t }).load();
  assert.equal(s3.seconds, 24 * 3600);
  assert.ok(s3.capped);
});

test('definition sanity: unique ids, references exist', () => {
  const g = createReplikator();
  const d = g.def;
  for (const list of [d.upgrades, d.milestones, d.achievements, d.challenges, d.autos, d.currencies]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
  }
  for (const u of d.upgrades) for (const r of [...(u.requires || []), ...(u.requiresAny || []), ...(u.excl || [])]) assert.ok(g.upgById[r], r);
  assert.ok(d.achievements.length >= 30);
});
