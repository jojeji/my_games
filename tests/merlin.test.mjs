import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createMerlin } from '../games/merlin/logic.js';
import { ERAS, IDEAS } from '../games/merlin/eras.js';
import { CAST, portrait } from '../games/merlin/characters.js';
import { createRuntime, advance } from '../engine/core.js';
import { createStorage } from '../engine/save.js';
import { D } from '../engine/decimal.js';

const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};

test('producers: bulk cost, ROI buy-all and synergies', () => {
  const g = createMerlin();
  const p = g.producerById.quellen;
  g.grant('sand', 1e6);
  const bulk = g.prodBulkCost(p, 0, 7);
  const before = g.get('sand');
  assert.equal(g.prodBuy('quellen', 0, 7), 7);
  assert.ok(before.sub(g.get('sand')).sub(bulk).abs().div(bulk).lt(1e-9));
  assert.equal(g.prodBuy('quellen', 3, 1), 0); // slot 3 not visible yet
  const rate0 = g.cache.prod.quellen.rate[0];
  g.state.prod.quellen[1].n = 50; // +1 % per owned slot-1 on slot 0
  g.refresh();
  assert.ok(g.cache.prod.quellen.rate[0].gt(rate0.mul(1.4)));
  g.grant('sand', 1e9);
  assert.ok(g.prodBuyAll('quellen') > 0);
  assert.ok(g.prodMaxAffordable(p, 0) >= 0);
});

test('tap: charges are consumed, regenerate and scale with production', () => {
  const g = createMerlin();
  const max = g.tapMax();
  assert.equal(g.tapCharges(), max);
  for (let i = 0; i < max; i++) assert.ok(g.tapDo());
  assert.equal(g.tapDo(), null);
  advance(g, g.tapRegenSec() * 2.5);
  assert.equal(g.tapCharges(), 2);
  const first = g.tapGain();
  g.grant('sand', 1e5);
  g.prodBuyAll('quellen');
  assert.ok(g.tapGain().gt(first));
  assert.ok(g.state.tap.n >= max);
});

test('spells: cast, duration, cooldown, instant effect, large-step time weighting', () => {
  const g = createMerlin();
  g.state.cur.sand.total = D(1000);
  assert.ok(g.spellUnlocked('zeit'));
  g.grant('sand', 1e4);
  g.prodBuyAll('quellen');
  const base = g.prodIncome('sand');
  assert.ok(g.spellCast('zeit'));
  assert.equal(g.spellCast('zeit'), false); // cooldown
  assert.ok(g.prodIncome('sand').gt(base.mul(4)));
  assert.equal(g.spellFrac('zeit', 100) < 1, true);
  advance(g, 31);
  assert.equal(g.spellActive('zeit'), false);
  assert.ok(g.spellCooldownLeft('zeit') > 80);
  // instant spell
  assert.equal(g.spellCast('rueck'), false); // locked
  g.state.ms.v1 = true;
  const s = g.get('sand');
  assert.ok(g.spellCast('rueck'));
  assert.ok(g.get('sand').gt(s));
  // auto-cast only happens when the switch is on and the spell is ready
  g.state.spells.zeit.cd = 0;
  g.state.spells.zeit.auto = true;
  assert.ok(g.spellAutoRun() >= 1);
});

test('story: triggers once, chronological, modal queue and unread badge', () => {
  const g = createMerlin();
  g.slowChecks();
  assert.ok(g.state.story.e0_start !== undefined);
  assert.deepEqual(g.storyPendingModals().map((e) => e.id), ['e0_start']);
  assert.ok(g.storyUnread() >= 1);
  g.storyModalShown('e0_start');
  assert.equal(g.storyPendingModals().length, 0);
  g.storyMarkRead();
  assert.equal(g.storyUnread(), 0);
  g.state.cur.sand.total = D(100);
  g.slowChecks();
  assert.equal(g.storyList().at(-1).def.id, 'e0_sand');
  assert.ok(g.storyUnread() === 1);
});

test('layer flow: Verjüngung -> Epochensprung (ideas persist) -> ending -> Zyklus', () => {
  const g = createMerlin();
  g.add('sand', D(1e9));
  assert.equal(g.prestigeGain('rejuv').toNumber(), 0); // the Erinnerungen have not matured yet (run time 0)
  g.state.layers.rejuv.runTime = 200; // ... after ripeGainSecs they have
  g.slowChecks();
  assert.ok(g.prestige('rejuv'));
  assert.ok(g.get('mem').gte(1));
  assert.equal(g.get('sand').gt(0), true); // start sand
  // plant an idea of this era, exclusive partner is blocked
  g.grant('mem', 1e6);
  assert.ok(g.upgBuy('i0a'));
  assert.equal(g.upgBuy('i0b'), false);
  g.state.cur.mem.run = D(1e7);
  g.slowChecks();
  assert.equal(g.upgBuy('i1a'), false); // wrong era
  assert.ok(g.prestige('jump'));
  assert.equal(g.state.mer.era, 1);
  assert.ok(g.state.mer.eraDone[0]);
  assert.equal(g.upgLevel('i0a'), 1); // layer-2 ideas survive the jump
  assert.equal(g.get('mem').lt(10), true); // Erinnerungen were reset
  assert.equal(g.upgBuy('i0b'), false); // era 0 is over
  // exclusion can be lifted by Ewigkeit upgrade
  g.state.upg.e_zwei = 1;
  g.state.mer.era = 0;
  g.grant('mem', 1e6);
  assert.ok(g.upgBuy('i0b'));
  g.state.upg.e_zwei = 0;
  // final era
  g.state.mer.era = 7;
  assert.equal(g.canPrestige('jump'), false);
  g.state.cur.mem.run = D(1e9);
  g.tick(0.1);
  assert.ok(g.state.mer.finished);
  g.slowChecks();
  assert.ok(g.state.story.finale !== undefined);
  g.state.cur.shards.run = D(60);
  g.refresh();
  const gain = g.prestigeGain('cycle');
  assert.ok(gain.gte(1));
  assert.ok(g.prestige('cycle'));
  assert.equal(g.state.mer.era, 0);
  assert.equal(g.state.mer.finished, false);
  assert.equal(g.upgLevel('i0a'), 0); // ideas are wiped by the cycle ...
  assert.ok(g.get('eternity').gte(gain));
  assert.ok(g.state.story.finale !== undefined); // ... story is kept
});

test('save roundtrip with new subsystems, export/import and offline progress (auto-tap/auto-cast run, manual actions do not)', () => {
  let t = 1_000_000;
  const storage = createStorage(mem());
  const g = createMerlin();
  const rt = createRuntime(g, { storage, now: () => t });
  rt.load();
  g.grant('sand', 1e6);
  g.prodBuyAll('quellen');
  g.state.mer.era = 3;
  g.state.ms.v4 = g.state.ms.v8 = true; // auto-tap + auto-cast unlocked
  g.state.auto.auto_tap.on = g.state.auto.auto_spells.on = true; // autos start off in Merlin: the player switches them on
  g.state.cur.sand.total = D(1e4);
  rt.save();
  const g2 = createMerlin();
  const rt2 = createRuntime(g2, { storage, now: () => t + 600_000 });
  const sum = rt2.load();
  assert.equal(g2.state.mer.era, 3);
  assert.deepEqual(g2.state.prod.quellen.map((x) => x.n), g.state.prod.quellen.map((x) => x.n));
  assert.ok(sum && Math.round(sum.seconds) === 600);
  assert.ok(g2.state.tap.n > 0, 'auto-tap ran offline');
  assert.ok(g2.state.spells.zeit.n > 0, 'auto-cast ran offline');
  assert.ok(rt2.exportString().startsWith('MGSAVE1.merlin.'));
  rt2.importString(rt.exportString());
});

test('definition sanity: unique ids, references exist, ideas/eras/story consistent, names only via cast config', () => {
  const g = createMerlin();
  const d = g.def;
  for (const list of [d.upgrades, d.milestones, d.achievements, d.autos, d.currencies, d.story, d.spells, d.chapters]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
  }
  for (const u of d.upgrades) for (const r of [...(u.requires || []), ...(u.requiresAny || []), ...(u.excl || [])]) assert.ok(g.upgById[r], r);
  assert.equal(ERAS.length, 8);
  for (const e of ERAS) assert.equal(e.slots.length, d.producers[0].slots.length);
  for (const i of IDEAS) {
    assert.ok(g.upgById[i.id]);
    if (i.excl) assert.equal(IDEAS.find((x) => x.id === i.excl).excl, i.id);
    assert.ok(i.text.length > 20 && i.desc);
  }
  const chapters = new Set(d.chapters.map((c) => c.id));
  for (const s of d.story) {
    assert.ok(chapters.has(s.chapter), s.id);
    assert.ok(s.lines.length && s.lines.every((l) => l.t && ['merlin', 'chronist', 'waechter'].includes(l.who)), s.id);
  }
  assert.ok(d.story.filter((s) => s.modal).length >= 10);
  assert.ok(d.achievements.length >= 30);
  // companions must be referenced via characters.js (template strings), never hard-coded
  const src = readFileSync(new URL('../games/merlin/story.js', import.meta.url), 'utf8');
  for (const c of [CAST.chronist, CAST.waechter]) assert.ok(!src.includes(c.name), 'hard-coded name ' + c.name);
});

test('portraits: every referenced image exists and Merlin gets younger with every stage', () => {
  const img = (rel) => new URL('../games/merlin/' + rel, import.meta.url);
  for (const c of Object.values(CAST)) {
    const files = c.stages ? c.stages.flatMap((s) => [s.img, s.sm]) : [c.img, c.sm];
    for (const f of files) assert.ok(existsSync(img(f)), f);
  }
  const ages = CAST.merlin.stages.map((s) => Number(/merlin-(\d+)/.exec(s.img)[1]));
  for (let i = 1; i < ages.length; i++) assert.ok(ages[i] <= ages[i - 1]);
  assert.equal(portrait('merlin', 7).img, CAST.merlin.stages[7].img);
});

test('manifest: unique explicit id, start_url/scope of its own folder, maskable icon', () => {
  const read = (p) => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
  const games = read('games.json');
  const ids = games.map((x) => read(x.path + 'manifest.webmanifest').id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
  const m = read('games/merlin/manifest.webmanifest');
  assert.ok(m.id && m.id !== './');
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  for (const i of m.icons) assert.ok(existsSync(new URL('../games/merlin/' + i.src, import.meta.url)), i.src);
});

test('autos: Merlin starts them off, announces the unlock once (event, seen flag, playlog)', () => {
  const g = createMerlin();
  assert.ok(Object.values(g.state.auto).every((a) => a.on === false && a.seen === false));
  const seen = [];
  g.out = (type, p) => type === 'auto-unlocked' && seen.push(p.id);
  g.slowChecks();
  assert.deepEqual(seen, []);
  g.state.ms.v12 = true;
  g.slowChecks();
  g.slowChecks();
  assert.deepEqual(seen, ['auto_mem']);
  assert.equal(g.state.auto.auto_mem.seen, true);
  assert.equal(g.state.auto.auto_mem.on, false);
  g.grant('mem', 1e9);
  g.upgBuyAll('mem'); // manual buying still works; the auto does not run while off
  g.runAutos(100);
  assert.equal(g.autoActive('auto_mem'), false);
  assert.ok(g.state.plog.head.some((e) => e[1] === 'unlock' && /Automatik/.test(e[2])));
  assert.ok(Object.values(g.def.autos).every((a) => a.where), 'every auto names the tab of its switch');
});

test('autos: old Merlin save keeps unlocked autos as they were (no re-announce), locks the rest off', () => {
  const g0 = createMerlin();
  const old = JSON.parse(JSON.stringify(g0.state));
  for (const k of Object.keys(old.auto)) { old.auto[k].on = true; delete old.auto[k].seen; } // pre-update: everything on, no seen flag
  old.ms = { v12: true }; // auto_mem unlocked
  old.auto.auto_buy.on = false; // locked, so it must end up off anyway
  const g = createMerlin();
  g.load(old);
  assert.equal(g.state.auto.auto_mem.on, true);
  assert.equal(g.state.auto.auto_mem.seen, true);
  for (const id of ['auto_buy', 'auto_tap', 'auto_spells']) {
    assert.equal(g.state.auto[id].on, false, id);
    assert.equal(g.state.auto[id].seen, false, id);
  }
  const ev = [];
  g.out = (t) => ev.push(t);
  g.slowChecks();
  assert.ok(!ev.includes('auto-unlocked'));
});

test('autos: Replikator keeps its defaults (on, no flag change)', async () => {
  const { createReplikator } = await import('../games/replikator/logic.js');
  const g = createReplikator();
  assert.ok(!g.def.autosStartOff);
  assert.ok(g.def.autos.filter((a) => a.kind !== 'prestige' && a.id !== 'auto_map').every((a) => g.state.auto[a.id].on === true));
  assert.equal(g.state.auto.auto_map.on, false, 'the Akt II Auto-Erkundung starts off');
});
