// Replikator Akt II, Paket 3: Mutationen (games/replikator/mutations.js). Offers charge by play time, genome slots, replacing, effects,
// migration 3 -> 4 with the real end-of-v1 save, Auto-Genom = the sim's choice, and the story thread.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createReplikator } from '../games/replikator/logic.js';
import { globalParts, mutChoose, mutAutoGenom, mutObjective } from '../games/replikator/def.js';
import { TUNE as T } from '../games/replikator/tune.js';
import { advance, createRuntime } from '../engine/core.js';
import { createStorage, parse, stringify } from '../engine/save.js';
import { D } from '../engine/decimal.js';
import { generateMap, claim, arrive, claimable, canClaim } from '../games/replikator/map.js';
import {
  MUTATIONS, MUT_BY_ID, RARITY, drawCards, mutState, mutSlots, mutUnlocked, mutTick, mutTake, mutDiscard, mutNextIn, mutInterval, mutGain, mutCostDiv,
  mutBundle, mutMapCost, mutTrip, mutOfferRate, mutOptions, mutGainParts, mutAdj,
} from '../games/replikator/mutations.js';
import { claimCost, tripSecs, typeMult, sectorMult } from '../games/replikator/map.js';
import { loadSaveFile } from '../tools/simulate.mjs';

const FIXTURE = new URL('./fixtures/replikator-end-v1.json', import.meta.url).pathname;
const FIXTURE_TEXT = readFileSync(FIXTURE, 'utf8');
const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};

/** Akt II game with `n` sectors claimed (arrived at once), a seeded mutation stream, rich in Sternsysteme. */
function act2Game(n = 0, seed = 5) {
  const g = createReplikator();
  const r = g.state.rep2;
  r.rng.seed = seed;
  r.act2 = true;
  r.act2At = 0;
  r.anchor = 5;
  r.map = generateMap(r.rng);
  r.mut.rng.seed = seed * 7 + 1;
  g.grant('systems', 1e60);
  for (let k = 0; k < n; k++) {
    const i = claimable(g).find((x) => canClaim(g, x).ok);
    claim(g, i);
    arrive(g);
  }
  g.refresh();
  return g;
}
const mut = (g) => g.state.rep2.mut;
const ripe = (g) => {
  for (const l of ['replication', 'expansion', 'singularity']) g.state.layers[l].runTime = 1e5;
};
/** Run totals that the prestige gains are computed from. */
const setRun = (g, o) => {
  for (const [k, v] of Object.entries(o)) g.state.cur[k].run = D(v);
  for (const l of ['replication', 'expansion', 'singularity']) g.state.layers[l].runTime = 1e5; // gain factors are ripe
  g.refresh();
};
const give = (g, ...ids) => {
  mut(g).genome = ids;
  g.refresh();
};

test('nothing before 3 sectors; at the 3rd sector the first offer is there at once, with 3 different cards', () => {
  const g = act2Game(2);
  mutTick(g, 5000);
  assert.ok(!mutUnlocked(g));
  assert.equal(mut(g).queue, 0);
  assert.equal(mut(g).offer, null);
  const h = act2Game(3);
  assert.ok(mutUnlocked(h));
  mutTick(h, 0.1);
  assert.equal(mut(h).queue, 1);
  assert.equal(mut(h).offer.cards.length, T.mutCards);
  assert.equal(new Set(mut(h).offer.cards).size, T.mutCards);
  assert.ok(mut(h).offer.cards.every((id) => MUT_BY_ID[id]));
});

test('offers are deterministic in the seed and the genome: same seed, same cards; another seed, other cards', () => {
  const cards = (seed) => {
    const g = act2Game(3, seed);
    mutTick(g, 0.1);
    return mut(g).offer.cards.join(',');
  };
  assert.equal(cards(11), cards(11));
  const set = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(cards));
  assert.ok(set.size > 3, 'varied: ' + set.size);
  // the whole stream: the same decisions on a second game give the same genome
  const run = (seed) => {
    const g = act2Game(3, seed);
    for (let k = 0; k < 6; k++) {
      mutTick(g, T.mutEvery * 2);
      mutTake(g, 0, mut(g).genome.length >= mutSlots(g) ? 0 : -1);
    }
    return mut(g).genome.join(',');
  };
  assert.equal(run(3), run(3));
});

test('rarity weights: 70 / 25 / 5 per card over many offers; never a mutation of the genome, never a duplicate in an offer', () => {
  const m = mutState();
  m.rng.seed = 1234;
  const count = { gewoehnlich: 0, selten: 0, glueck: 0 };
  let cards = 0;
  for (let k = 0; k < 4000; k++) {
    const offer = drawCards(m, []);
    assert.equal(new Set(offer).size, offer.length);
    for (const id of offer) {
      count[MUT_BY_ID[id].rarity]++;
      cards++;
    }
  }
  const w = T.mutRarity;
  const sum = w.gewoehnlich + w.selten + w.glueck;
  for (const r of Object.keys(count)) {
    const share = count[r] / cards;
    // rarities run out inside one offer (3 Glücksfehler exist, 3 are in an offer at most): allow a small bias
    assert.ok(Math.abs(share - w[r] / sum) < 0.04, `${r}: ${share.toFixed(3)} vs ${(w[r] / sum).toFixed(3)}`);
  }
  const genome = ['hyperaktiv', 'sparsam', 'mosaik'];
  for (let k = 0; k < 500; k++) for (const id of drawCards(m, genome)) assert.ok(!genome.includes(id));
  // with only a few mutations left an offer shrinks instead of repeating
  const almost = MUTATIONS.slice(0, MUTATIONS.length - 2).map((x) => x.id);
  assert.equal(drawCards(m, almost).length, 2);
  assert.ok(MUTATIONS.length >= 14 && MUTATIONS.every((x) => x.benefit() && x.catch() && x.report && RARITY[x.rarity]));
});

test('charging by play time: one offer per mutEvery s (growing slowly), at most 3 pending, the charge stops when full, nothing is lost', () => {
  const g = act2Game(3);
  mutTick(g, 0.1);
  assert.equal(mut(g).queue, 1);
  mutTick(g, T.mutEvery * T.mutGrow - 1);
  assert.equal(mut(g).queue, 1, 'not yet');
  assert.ok(mutNextIn(g) > 0 && mutNextIn(g) <= 2);
  mutTick(g, 2);
  assert.equal(mut(g).queue, 2);
  mutTick(g, 1e6);
  assert.equal(mut(g).queue, T.mutQueueMax);
  assert.equal(mut(g).charge, 0, 'the charge stops while the queue is full');
  assert.equal(mutNextIn(g), null);
  const head = mut(g).offer.cards.join(',');
  mutTick(g, 1e6);
  assert.equal(mut(g).offer.cards.join(','), head, 'the offer on the table does not change');
  // deciding one starts the charge again from zero
  mutDiscard(g);
  assert.equal(mut(g).queue, 2);
  assert.equal(mutNextIn(g), mutInterval(g));
  assert.ok(mutInterval(g) > T.mutEvery, 'the interval grows with the offers so far');
});

test('replications do not charge anything (play time only), offline catch-up charges like online play', () => {
  const g = act2Game(3);
  mutTick(g, 0.1);
  const before = mut(g).charge;
  g.state.layers.replication.count += 50; // lots of replications, no time
  mutTick(g, 0);
  assert.equal(mut(g).charge, before);
  // 1 h of play: online in small steps vs one big offline chunk through the runtime's advance(): same number of offers
  const a = act2Game(3);
  const b = act2Game(3);
  for (let k = 0; k < 3600; k++) mutTick(a, 1);
  advance(b, 3600); // advance() is what runtime.simulateOffline uses; it calls tick, which includes mutTick
  mutTick(b, 0);
  assert.equal(mut(b).queue, mut(a).queue);
  assert.equal(mut(a).queue, 3);
  // a long absence through the real runtime: capped at the queue size, no flood of anything
  const c = act2Game(3);
  const rt = createRuntime(c, { storage: createStorage(mem()), now: () => 0 });
  rt.simulateOffline(24 * 3600);
  assert.equal(mut(c).queue, T.mutQueueMax);
  assert.equal(c.offlineNow, false, 'the offline flag is off again afterwards');
});

test('genome slots: 3 at the start, +1 at 6 and at 10 sectors, at most 6; taking with a full genome needs a mutation to replace', () => {
  const g = act2Game(3);
  assert.equal(mutSlots(g), 3);
  for (const [n, slots] of [[5, 3], [6, 4], [9, 4], [10, 5]]) {
    const h = act2Game(0);
    h.state.rep2.map.claimed = n;
    assert.equal(mutSlots(h), slots, n + ' sectors');
  }
  mut(g).bonusSlots = 5;
  assert.equal(mutSlots(g), T.genomeMax, 'capped');
  mut(g).bonusSlots = 0;
  mutTick(g, 0.1);
  for (let k = 0; k < 3; k++) {
    assert.ok(mutTake(g, 0, -1), 'free slot ' + k);
    mutTick(g, 1e6);
  }
  assert.equal(mut(g).genome.length, 3);
  const first = mut(g).genome[0];
  const card = mut(g).offer.cards[1];
  assert.equal(mutTake(g, 1, -1), false, 'full genome without a replacement');
  assert.equal(mutTake(g, 1, 7), false, 'bad index');
  assert.equal(mut(g).genome.length, 3);
  const q = mut(g).queue;
  const res = mutTake(g, 1, 0);
  assert.equal(res.replaced, first);
  assert.equal(mut(g).genome[0], card);
  assert.ok(!mut(g).genome.includes(first), 'the old one is lost');
  assert.equal(mut(g).replaced, 1);
  assert.equal(mut(g).queue, q - 1);
});

test('effects: every mutation changes the model; production is labeled in globalParts, gain factors in mutGainParts', () => {
  const g = act2Game(4);
  ripe(g);
  const base = globalParts(g).length;
  const f = (id) => T.mutFx[id];
  give(g, 'hyperaktiv');
  assert.ok(globalParts(g).some(([name, v]) => name === 'Hyperaktiv' && v.eq(f('hyperaktiv').prod)));
  assert.equal(mutTrip(g), f('hyperaktiv').trip);
  assert.ok(mutGainParts(g, 'cores').some(([name, v]) => name === 'Hyperaktiv' && v.eq(f('hyperaktiv').gain)));
  give(g, 'sparsam');
  assert.equal(mutCostDiv(g), f('sparsam').costDiv);
  assert.equal(mutBundle(g), f('sparsam').bundle);
  assert.equal(mutMapCost(g), f('sparsam').mapCost);
  assert.equal(g.hooks.bundleMult(g, g.def.chains[0]), 2 + f('sparsam').bundle);
  assert.ok(mutGain(g, 'blueprints').eq(f('sparsam').bp) && mutGain(g, 'systems').eq(1));
  give(g, 'nostalgisch');
  assert.ok(mutGain(g, 'blueprints').eq(f('nostalgisch').bp) && mutGain(g, 'systems').eq(f('nostalgisch').sys) && mutGain(g, 'cores').eq(1));
  give(g, 'ueberschuss');
  for (const k of ['blueprints', 'systems', 'cores']) assert.ok(mutGain(g, k).eq(f('ueberschuss').gain));
  assert.ok(globalParts(g).some(([name, v]) => name === 'Überschuss' && v.eq(f('ueberschuss').prod)));
  give(g, 'schwarmgeist');
  assert.ok(globalParts(g).some(([name, v]) => name === 'Schwarmgeist' && v.eq(1 + f('schwarmgeist').perSector * 4)));
  assert.ok(mutGain(g, 'systems').eq(1 + f('schwarmgeist').perSector * 4));
  assert.equal(mutMapCost(g), f('schwarmgeist').mapCost);
  const costOff = claimCost(g);
  give(g);
  assert.ok(claimCost(g).lt(costOff), 'Sektorpreise');
  give(g, 'gruendlich');
  assert.ok(mutGain(g, 'cores').eq(f('gruendlich').cores));
  assert.equal(mutTrip(g), f('gruendlich').trip);
  assert.equal(tripSecs(g), Math.round(T.mapTripBase * Math.pow(T.mapTripGrow, 4) * f('gruendlich').trip));
  give(g, 'fehlerfreudig');
  assert.equal(mutOfferRate(g), f('fehlerfreudig').offers);
  assert.equal(mutInterval(g), (T.mutEvery * Math.pow(T.mutGrow, mut(g).n)) / f('fehlerfreudig').offers);
  assert.ok(mutGain(g, 'cores').eq(f('fehlerfreudig').cores));
  give(g, 'chimaere', 'glueckstreffer');
  assert.ok(globalParts(g).some(([name, v]) => name === 'Chimäre' && Math.abs(v.toNumber() - f('chimaere').perSlot ** 2) < 1e-9), 'per occupied slot');
  assert.ok(mutGainParts(g, 'systems').some(([name, v]) => name === 'Chimäre' && Math.abs(v.toNumber() - f('chimaere').gainSlot ** 2) < 1e-9));
  assert.ok(globalParts(g).some(([name]) => name === 'Glückstreffer'));
  assert.equal(mutOfferRate(g), f('chimaere').offers);
  give(g, 'gigantismus');
  assert.equal(g.hooks.genTierMult(g, null, 7).toNumber(), f('gigantismus').top);
  assert.equal(g.hooks.genTierMult(g, null, 0).toNumber(), f('gigantismus').low);
  assert.ok(mutGain(g, 'systems').eq(f('gigantismus').sys));
  give(g, 'mosaik');
  const cells = g.state.rep2.map.cells;
  const i = cells.findIndex((c) => c.own && c.type !== 'home');
  assert.ok(sectorMult(cells, i, 0.5 + f('mosaik').adj).gte(sectorMult(cells, i)));
  assert.equal(mutTrip(g), f('mosaik').trip);
  give(g, 'kolonialist');
  assert.ok(mutGain(g, 'systems').eq(f('kolonialist').sys) && mutGain(g, 'blueprints').eq(f('kolonialist').bp));
  give(g, 'buendelfieber');
  assert.equal(mutBundle(g), f('buendelfieber').bundle);
  assert.equal(mutTrip(g), f('buendelfieber').trip);
  assert.equal(mutCostDiv(g), f('buendelfieber').costDiv);
  assert.ok(mutGain(g, 'systems').eq(f('buendelfieber').sys));
  give(g, ...MUTATIONS.map((m) => m.id));
  assert.ok(globalParts(g).length > base + 2);
  give(g);
  assert.equal(globalParts(g).length, base);
  for (const k of ['blueprints', 'systems', 'cores']) assert.equal(mutGainParts(g, k).length, 0);
});

test('every mutation alone changes something that moves progress (production, a prestige gain, trip time, sector price, offers, cost, bundle, map bonus), benefit AND catch', () => {
  const g = act2Game(4);
  setRun(g, { matter: 1e60, blueprints: 1e12, systems: 1e12 });
  const probe = () => ({
    prod: g.hooks.genGlobalMult(g).toNumber(),
    bp: g.prestigeGain('replication').toNumber(),
    sys: g.prestigeGain('expansion').toNumber(),
    cores: g.prestigeGain('singularity').toNumber(),
    trip: tripSecs(g),
    price: claimCost(g).toNumber(),
    offers: mutOfferRate(g),
    costDiv: mutCostDiv(g),
    bundle: mutBundle(g),
    t0: g.hooks.genTierMult(g, null, 0).toNumber(),
    t7: g.hooks.genTierMult(g, null, 7).toNumber(),
    adj: mutAdj(g),
  });
  give(g);
  const none = probe();
  assert.ok(none.bp > 0 && none.sys > 0, 'the probe state has gains');
  const better = { prod: 1, bp: 1, sys: 1, cores: 1, trip: -1, price: -1, offers: 1, costDiv: 1, bundle: 1, t0: 1, t7: 1, adj: 1 };
  for (const m of MUTATIONS) {
    give(g, m.id);
    const p = probe();
    const keys = Object.keys(p).filter((k) => Math.abs(p[k] - none[k]) > 1e-9 * Math.max(1, Math.abs(none[k])));
    const good = keys.filter((k) => (p[k] - none[k]) * better[k] > 0);
    const bad = keys.filter((k) => (p[k] - none[k]) * better[k] < 0);
    assert.ok(keys.length > 0, `${m.id}: changes nothing`);
    // Geduldig (start of a run = the catch), Nachtschwärmer (online = the catch), Chimäre (one filled slot) show only one side in this snapshot
    if (!['geduldig', 'nachtschwaermer', 'chimaere'].includes(m.id)) assert.ok(good.length > 0 && bad.length > 0, `${m.id}: benefit ${good} catch ${bad}`);
  }
  give(g);
});

test('gain factors of mutations act AFTER the softcap: above it a x2.5 factor gives x2.5 (not x1.6), and the Auto-Genom valuation sees it in full', () => {
  const g = act2Game(4);
  setRun(g, { matter: 1e80 });
  give(g);
  const sc = g.prestigeSoftcap('replication');
  const a = g.prestigeGain('replication');
  assert.ok(a.gt(sc.at), 'above the softcap');
  const obj0 = mutObjective(g);
  give(g, 'ueberschuss');
  const ratio = g.prestigeGain('replication').div(a).toNumber();
  assert.ok(Math.abs(ratio / T.mutFx.ueberschuss.gain - 1) < 1e-6, 'ratio ' + ratio);
  assert.ok(mutObjective(g) > obj0, 'the valuation sees the full factor');
  give(g);
});

test('gain factors > 1 on Sternsysteme / Quantenkerne ripen with the run time (short runs never profit), catches (< 1) apply at once', () => {
  const g = act2Game(4);
  give(g, 'gruendlich', 'fehlerfreudig', 'kolonialist');
  const f = (t) => {
    g.state.layers.singularity.runTime = t;
    g.state.layers.expansion.runTime = t;
    return [mutGain(g, 'cores').toNumber(), mutGain(g, 'systems').toNumber()];
  };
  const full = T.mutFx.gruendlich.cores * T.mutFx.fehlerfreudig.cores;
  assert.ok(Math.abs(f(1e5)[0] - full) < 1e-9);
  assert.ok(f(0)[0] < 1 && Math.abs(f(0)[0] - T.mutFx.fehlerfreudig.cores) < 1e-9, 'start: only the catch');
  assert.ok(f(600)[0] > f(0)[0] && f(600)[0] < full);
  g.mutRef = true;
  assert.ok(Math.abs(f(0)[0] - full) < 1e-9, 'valuation = full');
  g.mutRef = false;
  give(g);
});

test('Nachtschwärmer: gains x1.5 only while the runtime catches up an absence, x0.85 online', () => {
  const g = act2Game(3);
  ripe(g);
  give(g, 'nachtschwaermer');
  const part = () => mutGain(g, 'cores').toNumber();
  assert.ok(Math.abs(part() - T.mutFx.nachtschwaermer.on) < 1e-12);
  let seen = null;
  const tick = g.tick;
  g.tick = function (dt) {
    seen = seen === null ? part() : seen;
    return tick.call(this, dt);
  };
  const rt = createRuntime(g, { storage: createStorage(mem()), now: () => 0 });
  rt.simulateOffline(600);
  assert.equal(seen, T.mutFx.nachtschwaermer.off);
  assert.ok(Math.abs(part() - T.mutFx.nachtschwaermer.on) < 1e-12);
});

test('Geduldig never rewards short runs: the Blaupausen gain at the start of a run is the lowest, it is full only from 5 minutes', () => {
  const g = act2Game(3);
  give(g, 'geduldig');
  const f = (t) => {
    g.state.layers.replication.runTime = t;
    return mutGain(g, 'blueprints').toNumber();
  };
  assert.equal(f(0), T.mutFx.geduldig.min);
  assert.ok(f(0) < 1 && f(30) < f(120) && f(120) < f(299));
  assert.equal(f(300), T.mutFx.geduldig.max);
  assert.equal(f(3000), T.mutFx.geduldig.max);
});

test('Auto-Genom: starts off, unlocks at 10 sectors or the 5th chosen mutation; its decision is the very function the sim calls', () => {
  const g = act2Game(3);
  mutTick(g, 0.1);
  assert.equal(g.state.auto.auto_genom.on, false);
  assert.ok(!g.autoUnlocked('auto_genom'));
  g.state.rep2.map.claimed = 10;
  assert.ok(g.autoUnlocked('auto_genom'));
  g.state.rep2.map.claimed = 3;
  mut(g).taken = T.mutAutoTaken;
  assert.ok(g.autoUnlocked('auto_genom'));
  mut(g).taken = 0;
  // same decision: the in-game auto and a direct call on a copy of the game
  const mk = () => {
    const x = act2Game(10, 9);
    mutTick(x, 0.1);
    return x;
  };
  const a = mk();
  const b = mk();
  const d = mutChoose(a);
  assert.ok(d && (d.discard || d.take >= 0));
  a.state.auto.auto_genom.on = true;
  a.state.auto.auto_genom.t = 5; // the auto is due
  a.runAutos(0.1);
  mutAutoGenom(b);
  assert.deepEqual(mut(a).genome, mut(b).genome);
  assert.equal(mut(a).queue, mut(b).queue);
  assert.equal(mut(a).discarded, mut(b).discarded);
  // no offer: nothing to decide
  assert.equal(mutChoose(act2Game(1)), null);
});

test('valuing a card: mutOptions lists every way (free slot: one per card, full genome: card x slot) and restores the genome', () => {
  const g = act2Game(3);
  mutTick(g, 0.1);
  const keep = mut(g).genome.slice();
  const o = mutOptions(g, mutObjective);
  assert.equal(o.length, T.mutCards);
  assert.deepEqual(mut(g).genome, keep);
  assert.ok(o.every((x) => Number.isFinite(x.gain) && x.replace === -1));
  give(g, 'hyperaktiv', 'sparsam', 'mosaik');
  const full = mutOptions(g, mutObjective);
  assert.equal(full.length, T.mutCards * 3);
  assert.deepEqual(mut(g).genome, ['hyperaktiv', 'sparsam', 'mosaik']);
  assert.equal(g.mutRef, false);
});

test('save: migration 3 -> 4 keeps a save that is already in Akt II (map, claimed sectors) and adds a stable offer stream', () => {
  const g = act2Game(4);
  const data = JSON.parse(stringify(g.state));
  delete data.rep2.mut;
  data.v = 3;
  const out = g.migrations[3](JSON.parse(JSON.stringify(data)));
  assert.equal(out.v, 4);
  assert.ok(Number.isInteger(out.rep2.mut.rng.seed));
  assert.equal(out.rep2.mut.rng.seed, g.migrations[3](JSON.parse(JSON.stringify(data))).rep2.mut.rng.seed, 'stable');
  const h = createReplikator();
  h.load(parse(stringify(out)));
  assert.equal(h.state.rep2.map.claimed, 4);
  assert.deepEqual(h.state.rep2.mut.genome, []);
  assert.equal(h.state.rep2.mut.queue, 0);
  h.tick(1);
  assert.equal(h.state.rep2.mut.queue, 1, 'the first offer at the next tick (4 sectors are claimed)');
  assert.doesNotThrow(() => g.migrations[3]({}), 'a save without rep2 survives');
  // round trip
  const r = createReplikator();
  r.load(parse(stringify(h.state)));
  assert.deepEqual(r.state.rep2.mut, h.state.rep2.mut);
});

test('the real end-of-v1 save loads into the new version: Akt II starts, no offer yet, the offer stream comes from the map seed', () => {
  const backend = mem();
  backend.setItem('mg:replikator:save', FIXTURE_TEXT);
  const g = createReplikator();
  createRuntime(g, { storage: createStorage(backend), now: () => JSON.parse(FIXTURE_TEXT).t + 5000 }).load();
  assert.equal(g.state.v, 4);
  assert.ok(g.state.rep2.act2);
  assert.equal(g.state.rep2.mut.queue, 0);
  assert.ok(!mutUnlocked(g));
  assert.deepEqual(g.state.rep2.mut.genome, []);
  const again = loadSaveFile(FIXTURE, { seed: null });
  assert.deepEqual(again.state.rep2.mut.rng, g.state.rep2.mut.rng, 'same file, same stream');
  assert.notDeepEqual(loadSaveFile(FIXTURE, { seed: 99 }).state.rep2.mut.rng, g.state.rep2.mut.rng, 'a different map seed gives another stream');
});

test('catalogue: names unique, texts without names of the cast, every mutation has a benefit and a catch with numbers from tune.js', () => {
  assert.equal(new Set(MUTATIONS.map((m) => m.id)).size, MUTATIONS.length);
  assert.equal(new Set(MUTATIONS.map((m) => m.name)).size, MUTATIONS.length);
  for (const m of MUTATIONS) {
    assert.ok(!/R-1|WR-0|Echo|Missionsleitung/.test(m.report), m.id);
    assert.ok(T.mutFx[m.id], 'tune.js has ' + m.id);
    assert.ok(m.benefit().length > 5 && m.catch().length > 5);
  }
  assert.deepEqual(['gewoehnlich', 'selten', 'glueck'].map((r) => MUTATIONS.some((m) => m.rarity === r)), [true, true, true]);
});
