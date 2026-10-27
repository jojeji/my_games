// Replikator Akt II, Paket 2: Galaxiekarte (games/replikator/map.js). Generation, fog, adjacency, cost, the Echo's occupation rule,
// Akt II entry, migration 2 -> 3 with the real end-of-v1 save, Auto-Erkundung and the map story entries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createReplikator } from '../games/replikator/logic.js';
import { globalParts, mapAutoClaim, repObjective } from '../games/replikator/def.js';
import { TUNE as T } from '../games/replikator/tune.js';
import { D } from '../engine/decimal.js';
import { advance, createRuntime } from '../engine/core.js';
import { createStorage, parse, stringify } from '../engine/save.js';
import { rngRoll, rngInt } from '../engine/kit/rng.js';
import {
  generateMap, hexDisc, hexDist, neighbors, isVisible, canClaim, claim, claimCost, claimable, costLog, claimedCount, occupiedCount, freeCount,
  echoChoice, echoSighted, gainMult, typeMult, sectorMult, sameNeighbors, act2Check, bonusRows, bestClaim, SECTOR, RUIN_VARIANTS,
} from '../games/replikator/map.js';

const FIXTURE_TEXT = readFileSync(new URL('./fixtures/replikator-end-v1.json', import.meta.url), 'utf8');
const FIXTURE_T = JSON.parse(FIXTURE_TEXT).t;
const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};

/** A fresh game that is in Akt II with a map from `seed` and plenty of Sternsysteme. */
function act2Game(seed = 1, { rich = true } = {}) {
  const g = createReplikator();
  g.state.rep2.rng.seed = seed;
  const r = g.state.rep2;
  r.act2 = true;
  r.act2At = 0;
  r.anchor = 5;
  r.map = generateMap(r.rng);
  if (rich) g.grant('systems', 1e60);
  g.refresh();
  return g;
}

/** v1 is finished: Ereignishorizont owned and all challenges done. */
function finishV1(g) {
  g.state.upg.z_horizont = 1;
  for (const c of g.def.challenges) g.state.challenge.done[c.id] = 1;
}

const typeCounts = (cells) => cells.reduce((m, c) => ((m[c.type] = (m[c.type] || 0) + 1), m), {});

/* ------------------------------------------------------------------ */
/* Generation                                                           */
/* ------------------------------------------------------------------ */

test('hex disc: 19 cells in axial coordinates, centre first, all within radius 2, neighbours symmetric', () => {
  const d = hexDisc(2);
  assert.equal(d.length, 19);
  assert.deepEqual(d[0], { q: 0, r: 0 });
  assert.equal(new Set(d.map((c) => c.q + ',' + c.r)).size, 19);
  assert.ok(d.every((c) => hexDist(c, d[0]) <= 2));
  assert.equal(d.filter((c) => hexDist(c, d[0]) === 1).length, 6);
  assert.equal(d.filter((c) => hexDist(c, d[0]) === 2).length, 12);
  const nb = neighbors(d);
  assert.equal(nb[0].length, 6);
  assert.equal(nb.reduce((n, l) => n + l.length, 0), 84, '42 neighbour pairs in a radius-2 disc');
  nb.forEach((list, i) => list.forEach((j) => assert.ok(nb[j].includes(i), 'symmetric')));
});

test('generateMap: 19 cells, Heimat claimed in the middle, exactly one Echo on the edge, the configured type mix, deterministic', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const m = generateMap({ seed });
    assert.equal(m.cells.length, 19, 'seed ' + seed);
    assert.equal(m.cells[0].type, 'home');
    assert.equal(m.cells[0].own, 1);
    const echoes = m.cells.filter((c) => c.echo);
    assert.equal(echoes.length, 1);
    assert.equal(hexDist(echoes[0], m.cells[0]), 2, 'the Echo starts at distance 2');
    assert.equal(echoes[0].type, 'echo');
    assert.equal(echoes[0].echo, 1);
    assert.equal(m.cells.filter((c) => c.own).length, 1);
    const counts = typeCounts(m.cells);
    assert.deepEqual({ ...counts, home: undefined, echo: undefined }, { ...T.mapMix, home: undefined, echo: undefined }, 'type mix, seed ' + seed);
    // every Ruine has its own story variant
    const ruins = m.cells.filter((c) => c.type === 'ruine');
    assert.equal(new Set(ruins.map((c) => c.v)).size, ruins.length);
    assert.ok(ruins.every((c) => c.v >= 0 && c.v < RUIN_VARIANTS));
    // same seed, same map
    assert.deepEqual(generateMap({ seed }), m);
  }
  // different seeds give different layouts
  const layouts = new Set();
  for (let seed = 1; seed <= 50; seed++) layouts.add(generateMap({ seed }).cells.map((c) => c.type).join());
  assert.ok(layouts.size > 40, 'layouts: ' + layouts.size);
  // the best of several shuffles: neighbour bonuses are possible on (nearly) every map
  let withPair = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const { cells } = generateMap({ seed });
    const nb = neighbors(cells);
    if (cells.some((c, i) => SECTOR[c.type].kind && nb[i].some((j) => cells[j].type === c.type))) withPair++;
  }
  assert.ok(withPair >= 99, 'maps with a same-type pair: ' + withPair);
});

test('generation uses only the seeded RNG: the seed advances, nothing else is random', () => {
  const a = { seed: 99 };
  const b = { seed: 99 };
  const m1 = generateMap(a);
  const m2 = generateMap(b);
  assert.deepEqual(m1, m2);
  assert.equal(a.seed, b.seed);
  assert.notEqual(a.seed, 99, 'the generator state moved on');
});

/* ------------------------------------------------------------------ */
/* Fog, claiming, cost                                                  */
/* ------------------------------------------------------------------ */

test('fog: a type is only visible next to own territory; only visible neighbours of own cells can be claimed', () => {
  const g = act2Game(5);
  const cells = g.state.rep2.map.cells;
  const dist = (i) => hexDist(cells[i], cells[0]);
  cells.forEach((c, i) => {
    if (i === 0) return;
    assert.equal(isVisible(cells, i), dist(i) === 1 || !!c.echo && c.echo === 2, 'visible ' + i);
  });
  // ring 2 cannot be claimed (fog), ring 1 can
  const ring2 = cells.map((c, i) => i).filter((i) => dist(i) === 2 && !cells[i].echo);
  for (const i of ring2) assert.deepEqual(canClaim(g, i), { ok: false, reason: 'fog' });
  const ring1 = cells.map((c, i) => i).filter((i) => dist(i) === 1);
  assert.deepEqual(claimable(g).sort(), ring1.sort());
  // claiming a ring-1 cell reveals its ring-2 neighbours and makes them claimable
  const first = ring1[0];
  assert.ok(claim(g, first));
  const nb = neighbors(cells);
  for (const j of nb[first]) assert.ok(isVisible(cells, j));
  const newly = nb[first].filter((j) => dist(j) === 2 && !cells[j].echo && !cells[j].own);
  for (const j of newly) assert.ok(canClaim(g, j).ok, 'cell ' + j + ' is claimable now');
  // Heimat and own cells cannot be claimed again
  assert.equal(canClaim(g, 0).reason, 'own');
  assert.equal(canClaim(g, first).reason, 'own');
});

test('Echo cells are not claimable, also not when they touch own territory', () => {
  const g = act2Game(3);
  const cells = g.state.rep2.map.cells;
  const echo = cells.findIndex((c) => c.echo === 1);
  const nb = neighbors(cells);
  // walk towards the Echo until it is revealed
  while (!isVisible(cells, echo)) {
    const cand = claimable(g).sort((a, b) => hexDist(cells[a], cells[echo]) - hexDist(cells[b], cells[echo]));
    assert.ok(claim(g, cand[0]));
  }
  assert.ok(nb[echo].some((j) => cells[j].own), 'the Echo cell touches own territory');
  assert.deepEqual(canClaim(g, echo), { ok: false, reason: 'echo' });
  assert.ok(!claimable(g).includes(echo));
  assert.ok(echoSighted(g));
});

test('cost: 10^(anchor + offset + step * n) Sternsysteme, paid from the current amount, growing per sector', () => {
  const g = act2Game(2, { rich: false });
  g.state.rep2.anchor = 5.5;
  const expect = (n) => Math.pow(10, 5.5 + T.mapCostOffset + T.mapCostStep * n);
  for (const n of [0, 1, 2, 5, 9]) {
    assert.ok(Math.abs(costLog(g, n) - (5.5 + T.mapCostOffset + T.mapCostStep * n)) < 1e-12);
    const c = claimCost(g, n).toNumber();
    assert.ok(Math.abs(c / expect(n) - 1) < 1e-3 || Math.abs(c - expect(n)) < 1, `n=${n}: ${c} vs ${expect(n)}`);
  }
  // not affordable -> reason 'cost', nothing is spent
  const target = claimable(g)[0];
  assert.deepEqual(canClaim(g, target), { ok: false, reason: 'cost' });
  assert.equal(claim(g, target), false);
  assert.equal(claimedCount(g), 0);
  // affordable: exactly the price is paid, the next one is dearer
  const cost0 = claimCost(g);
  g.grant('systems', cost0.mul(1.5));
  const before = g.get('systems');
  assert.ok(claim(g, target));
  assert.ok(before.sub(g.get('systems')).sub(cost0).abs().lt(1e-6 * before.toNumber()), 'paid the price');
  assert.equal(claimedCount(g), 1);
  assert.ok(claimCost(g).gt(cost0.mul(1.5)));
  // the claim lowers the stock (spent), it does not touch the earned total
  assert.ok(g.state.cur.systems.total.lt(before.add(1)));
});

test('cost anchor: stored at Akt II start from systems.best (tune.js mapAnchorSlope), not a fixed number; a fixed anchor is possible for later galaxies', () => {
  const a = createReplikator();
  finishV1(a);
  a.state.cur.systems.best = D(1e4);
  assert.ok(act2Check(a));
  assert.ok(Math.abs(a.state.rep2.anchor - T.mapAnchorSlope * 4) < 1e-9);
  const b = createReplikator();
  finishV1(b);
  b.state.cur.systems.best = D(1e8);
  act2Check(b);
  assert.ok(b.state.rep2.anchor > a.state.rep2.anchor);
  // 10^4 times the stock moves the price level by far less than 10^4 times (the economy saturates: see docs/LESSONS.md)
  assert.ok(claimCost(b).div(claimCost(a)).lt(1e3));
  const old = T.mapAnchorFixed;
  try {
    T.mapAnchorFixed = 6;
    const c = createReplikator();
    finishV1(c);
    act2Check(c);
    assert.equal(c.state.rep2.anchor, 6);
  } finally {
    T.mapAnchorFixed = old;
  }
});

/* ------------------------------------------------------------------ */
/* Adjacency and effects                                                */
/* ------------------------------------------------------------------ */

test('adjacency: each claimed same-type neighbour adds +50 % to the effect exponent, at most 3', () => {
  const g = act2Game(1);
  const cells = g.state.rep2.map.cells;
  // lay out a clean test field: everything one type except the cells we set
  cells.forEach((c) => {
    if (c.type !== 'home' && !c.echo) c.type = 'nebel';
  });
  const nb = neighbors(cells);
  const own = (i) => (cells[i].own = 1);
  // pick a ring-1 cell with 3+ ring neighbours of the same type
  const centre = cells.map((c, i) => i).find((i) => cells[i].type === 'nebel' && nb[i].filter((j) => cells[j].type === 'nebel' && !cells[j].echo).length >= 3);
  own(centre);
  assert.equal(sameNeighbors(cells, centre), 0);
  assert.ok(Math.abs(sectorMult(cells, centre).toNumber() - T.mapBase.nebel) < 1e-9);
  const friends = nb[centre].filter((j) => cells[j].type === 'nebel' && !cells[j].echo);
  friends.slice(0, 3).forEach((j, k) => {
    own(j);
    assert.equal(sameNeighbors(cells, centre), k + 1);
    assert.ok(Math.abs(sectorMult(cells, centre).toNumber() - Math.pow(T.mapBase.nebel, 1 + T.mapAdjStep * (k + 1))) < 1e-9);
  });
  const more = friends.slice(3);
  if (more.length) {
    own(more[0]);
    assert.equal(sameNeighbors(cells, centre), 3, 'capped at 3');
  }
  // the gain multiplier uses the type's product; other kinds are untouched
  assert.ok(gainMult(g, 'blueprints').gt(T.mapBase.nebel));
  assert.ok(gainMult(g, 'systems').eq(1));
  assert.ok(g.prestigeMult('replication').eq(gainMult(g, 'blueprints')));
  assert.ok(typeMult(g, 'nebel').eq(gainMult(g, 'blueprints')));
});

test('effects feed the multiplier model: Sternhaufen -> Sternsysteme, Nebel -> Blaupausen, Schwarzes Loch -> Quantenkerne, Pulsar/Ruine/Anomalie -> labeled production parts', () => {
  const g = act2Game(4);
  const cells = g.state.rep2.map.cells;
  const base = { rep: g.prestigeMult('replication'), exp: g.prestigeMult('expansion'), sing: g.prestigeMult('singularity') };
  const label = (g) => globalParts(g).map(([l]) => l);
  assert.ok(!label(g).some((l) => ['Pulsare', 'Ruinen', 'Anomalien'].includes(l)), 'no map parts without sectors');
  cells.forEach((c, i) => {
    if (c.type !== 'home' && !c.echo) c.own = 1; // everything claimed, whatever the geometry
  });
  g.refresh();
  assert.ok(g.prestigeMult('expansion').gt(base.exp));
  assert.ok(g.prestigeMult('replication').gt(base.rep));
  assert.ok(g.prestigeMult('singularity').gt(base.sing));
  assert.ok(['Pulsare', 'Ruinen', 'Anomalien'].every((l) => label(g).includes(l)));
  const total = globalParts(g).reduce((a, [, v]) => a.mul(v), D(1));
  assert.ok(g.cache.global.matter.eq(total), 'the global multiplier is the product of the labeled parts');
  const rows = bonusRows(g);
  assert.deepEqual(rows.map((r) => r.type).sort(), Object.keys(T.mapMix).sort());
  assert.ok(rows.every((r) => r.mult.gt(1) && r.count === T.mapMix[r.type]));
});

/* ------------------------------------------------------------------ */
/* The Echo                                                             */
/* ------------------------------------------------------------------ */

test('Echo rule: one free cell per 2 claimed sectors, adjacent to Echo territory, never time based', () => {
  const g = act2Game(8);
  const cells = g.state.rep2.map.cells;
  const nb = neighbors(cells);
  const echoCount = () => cells.filter((c) => c.echo).length;
  assert.equal(echoCount(), 1);
  claim(g, claimable(g)[0]);
  assert.equal(occupiedCount(g), 0, 'after 1 claim');
  // time does nothing, offline neither
  advance(g, 3600);
  g.tick(1e5);
  assert.equal(occupiedCount(g), 0, 'time does not move the Echo');
  assert.equal(echoCount(), 1);
  const before = cells.map((c, i) => i).filter((i) => cells[i].echo);
  claim(g, claimable(g)[0]);
  assert.equal(occupiedCount(g), 1, 'after 2 claims');
  assert.equal(echoCount(), 2);
  const taken = cells.map((c, i) => i).find((i) => cells[i].echo === 2);
  assert.ok(nb[taken].some((j) => before.includes(j)), 'next to the Echo territory');
  assert.ok(!cells[taken].own);
  claim(g, claimable(g)[0]);
  assert.equal(occupiedCount(g), 1, 'after 3 claims');
  claim(g, claimable(g)[0]);
  assert.equal(occupiedCount(g), 2, 'after 4 claims');
  assert.equal(occupiedCount(g), Math.floor(claimedCount(g) / T.mapEchoEvery));
});

test('Echo choice is a pure function of the map (seed + count), independent of the main RNG', () => {
  const g = act2Game(21);
  const m = g.state.rep2.map;
  const first = echoChoice(m);
  for (let i = 0; i < 5; i++) rngRoll(g.state.rep2.rng); // other systems drawing random numbers
  assert.equal(echoChoice(m), first);
  assert.deepEqual(echoChoice(generateMap({ seed: 21 })), echoChoice(generateMap({ seed: 21 })));
});

test('the player can always claim at least 12 sectors: random claim orders on 400 seeds (all free cells stay reachable)', () => {
  for (let seed = 1; seed <= 400; seed++) {
    const g = act2Game(seed);
    const pick = { seed: seed * 7919 };
    const cells = g.state.rep2.map.cells;
    let guard = 0;
    for (;;) {
      const options = claimable(g);
      if (!options.length) break;
      // invariant: while there are free cells, one of them is claimable (no free cell is cut off)
      assert.ok(options.length >= 1);
      assert.ok(claim(g, options[rngInt(pick, 0, options.length - 1)]), 'claim, seed ' + seed);
      assert.ok(++guard < 40);
    }
    assert.equal(freeCount(g), 0, `seed ${seed}: free cells left that cannot be reached`);
    assert.ok(claimedCount(g) >= 12, `seed ${seed}: only ${claimedCount(g)} sectors`);
    assert.equal(cells.length, 1 + claimedCount(g) + 1 + occupiedCount(g), 'every cell is accounted for');
  }
});

test('claiming the best-valued sector first or the worst first: both orders still reach 12 sectors', () => {
  for (const flip of [1, -1]) {
    for (let seed = 1; seed <= 40; seed++) {
      const g = act2Game(seed);
      let n = 0;
      while (claimable(g).length && n++ < 40) {
        const c = claimable(g).sort((a, b) => flip * (g.state.rep2.map.cells[a].type < g.state.rep2.map.cells[b].type ? -1 : 1));
        claim(g, c[0]);
      }
      assert.ok(claimedCount(g) >= 12, `seed ${seed} flip ${flip}: ${claimedCount(g)}`);
    }
  }
});

/* ------------------------------------------------------------------ */
/* Akt II entry, migration, save                                        */
/* ------------------------------------------------------------------ */

test('Akt II starts exactly when v1 is finished (Ereignishorizont + 8 challenges), once, with a map and a time stamp', () => {
  const g = createReplikator();
  const events = [];
  g.out = (t) => events.push(t);
  g.state.rep2.rng.seed = 42;
  g.tick(1);
  assert.equal(g.state.rep2.act2, false);
  g.state.upg.z_horizont = 1;
  g.tick(1);
  assert.equal(g.state.rep2.act2, false, 'the research alone is not the end');
  for (const c of g.def.challenges.slice(0, 7)) g.state.challenge.done[c.id] = 1;
  g.tick(1);
  assert.equal(g.state.rep2.act2, false, '7 of 8 challenges');
  g.state.challenge.done[g.def.challenges[7].id] = 1;
  g.tick(1);
  assert.equal(g.state.rep2.act2, true);
  assert.equal(g.state.rep2.act2At, g.state.time.played);
  assert.equal(g.state.rep2.map.cells.length, 19);
  assert.equal(events.filter((e) => e === 'act2').length, 1);
  const map = JSON.stringify(g.state.rep2.map);
  g.tick(10);
  assert.equal(JSON.stringify(g.state.rep2.map), map, 'the map is generated once');
  assert.equal(events.filter((e) => e === 'act2').length, 1);
  // the same seed gives the same map
  const h2 = createReplikator();
  h2.state.rep2.rng.seed = 42;
  finishV1(h2);
  h2.tick(1);
  assert.deepEqual(h2.state.rep2.map, g.state.rep2.map);
});

function loadFixture({ awaySeconds = 0, storage } = {}) {
  const backend = storage || mem();
  if (!storage) backend.setItem('mg:replikator:save', FIXTURE_TEXT);
  const g = createReplikator();
  const rt = createRuntime(g, { storage: createStorage(backend), now: () => FIXTURE_T + awaySeconds * 1000 });
  const off = rt.load();
  return { g, rt, off, backend };
}

test('migration 2 -> 3 with the real end-of-v1 save: it starts Akt II with a map, a stable seed and an anchor from the banked stock', () => {
  const { g } = loadFixture();
  assert.equal(g.version, 3);
  assert.equal(g.state.v, 3);
  const r = g.state.rep2;
  assert.equal(r.act2, true, 'Akt II starts on load');
  assert.equal(r.map.cells.length, 19);
  assert.equal(r.map.claimed, 0);
  const best = g.state.cur.systems.best.log10();
  assert.ok(Math.abs(r.anchor - T.mapAnchorSlope * best) < 1e-9, 'anchor ' + r.anchor);
  assert.ok(Math.abs(best - Math.log10(93493687)) < 1e-6, 'the save banked 9.3e7 Sternsysteme at its best');
  // the seed comes from the save (creation time), so loading twice gives the same map
  const again = loadFixture().g;
  assert.deepEqual(again.state.rep2.map, r.map);
  assert.deepEqual(again.state.rep2.rng, r.rng);
  // the old v1 state is intact
  assert.equal(g.chDoneCount(), 8);
  assert.ok(g.upgActive('z_horizont'));
  assert.equal(g.state.layers.singularity.count, 16);
  // the 12-hour offline catch-up does not break anything and does not claim anything
  const off = loadFixture({ awaySeconds: 12 * 3600 });
  assert.ok(off.off && off.off.seconds > 3600);
  assert.equal(off.g.state.rep2.map.claimed, 0);
});

test('migration 2 -> 3: a v2 save keeps everything, gets rep2 with a seed derived from the creation time and does not start Akt II early', () => {
  const g = createReplikator();
  const data = { v: 2, time: { played: 1000, created: 1700000000000 }, cur: {} };
  const out = g.migrations[2](JSON.parse(JSON.stringify(data)));
  assert.equal(out.v, 3);
  assert.ok(Number.isInteger(out.rep2.rng.seed) && out.rep2.rng.seed >= 0);
  const again = g.migrations[2](JSON.parse(JSON.stringify(data)));
  assert.equal(again.rep2.rng.seed, out.rep2.rng.seed, 'stable');
  const other = g.migrations[2]({ time: { created: 1700000001000 } });
  assert.notEqual(other.rep2.rng.seed, out.rep2.rng.seed);
  assert.doesNotThrow(() => g.migrations[2]({}), 'a save without time data survives');
  // through the runtime (which runs the migrations): an unfinished v2 save does not start Akt II
  const backend = mem();
  backend.setItem('mg:replikator:save', stringify({ v: 2, t: 1000, data: { v: 2, time: { played: 500, offline: 0, created: 5 } } }));
  const fresh = createReplikator();
  createRuntime(fresh, { storage: createStorage(backend), now: () => 1000 }).load();
  assert.equal(fresh.state.rep2.act2, false);
  assert.equal(fresh.state.v, 3);
  assert.equal(fresh.state.rep2.rng.seed, g.migrations[2]({ time: { created: 5 } }).rep2.rng.seed);
});

test('the Akt II opening arrives as the one new modal for the fixture; later entries wait for the map', () => {
  const { g } = loadFixture();
  assert.deepEqual(g.storyPendingModals().map((e) => e.id), [], 'nothing right at load');
  advance(g, 10);
  assert.deepEqual(g.storyPendingModals().map((e) => e.id), ['a2_start']);
  assert.ok(g.state.story.a2_start);
  const ids = g.def.story.filter((s) => s.chapter === 'a2').map((s) => s.id);
  for (const id of ids.filter((x) => x !== 'a2_start')) assert.equal(g.state.story[id], undefined, id);
});

test('save round trip: the map, ruins and counters survive stringify/parse', () => {
  const g = act2Game(9);
  for (let i = 0; i < 5; i++) claim(g, claimable(g)[0]);
  const text = stringify(g.serialize());
  const h2 = createReplikator();
  h2.load(parse(text));
  assert.deepEqual(h2.state.rep2.map, g.state.rep2.map);
  assert.deepEqual(h2.state.rep2.ruins, g.state.rep2.ruins);
  assert.equal(h2.state.rep2.anchor, g.state.rep2.anchor);
  assert.ok(claimCost(h2).eq(claimCost(g)));
});

/* ------------------------------------------------------------------ */
/* Auto-Erkundung                                                       */
/* ------------------------------------------------------------------ */

test('Auto-Erkundung: starts off, unlocks with 6 claimed sectors, claims the best affordable sector with the function the sim uses', () => {
  const g = act2Game(6, { rich: false });
  const auto = g.def.autos.find((a) => a.id === 'auto_map');
  assert.equal(auto.kind, 'misc');
  assert.equal(g.state.auto.auto_map.on, false, 'new autos start off');
  assert.ok(!g.autoUnlocked('auto_map'));
  g.grant('systems', 1e60);
  for (let i = 0; i < T.mapAutoAt - 1; i++) claim(g, claimable(g)[0]);
  assert.ok(!g.autoUnlocked('auto_map'));
  claim(g, claimable(g)[0]);
  assert.equal(claimedCount(g), T.mapAutoAt);
  assert.ok(g.autoUnlocked('auto_map'));
  // off: nothing happens by itself
  advance(g, 30);
  assert.equal(claimedCount(g), T.mapAutoAt);
  // on: one sector per run, the best by the objective
  g.state.auto.auto_map.on = true;
  const best = bestClaim(g, repObjective);
  assert.ok(best >= 0);
  const type = g.state.rep2.map.cells[best].type;
  auto.run(g, g.state.auto.auto_map);
  assert.equal(claimedCount(g), T.mapAutoAt + 1);
  assert.ok(g.state.rep2.map.cells[best].own, 'claimed ' + type);
  // not affordable: no claim
  g.state.cur.systems.amount = g.state.cur.systems.amount.mul(0);
  assert.equal(mapAutoClaim(g), false);
  // the sim's player calls the very same function
  const sim = readFileSync(new URL('../tools/simulate.mjs', import.meta.url), 'utf8');
  assert.match(sim, /mapAutoClaim\(g\)/);
  assert.match(sim, /import \{[^}]*mapAutoClaim[^}]*\} from '\.\.\/games\/replikator\/def\.js'/);
});

test('the best sector is the one with the largest rise of the objective (same-type neighbours beat a lone sector)', () => {
  const g = act2Game(11);
  const cells = g.state.rep2.map.cells;
  const nb = neighbors(cells);
  cells.forEach((c) => {
    if (c.type !== 'home' && !c.echo) c.type = 'ruine';
  });
  const ring1 = nb[0];
  cells[ring1[0]].type = 'haufen';
  const own = ring1[1];
  cells[own].type = 'haufen';
  cells[own].own = 1; // an own Sternhaufen: the neighbouring Sternhaufen is worth more than a fresh pair
  g.refresh();
  const best = bestClaim(g, repObjective);
  assert.ok(best >= 0);
  assert.equal(cells[best].type === 'haufen' || cells[best].type === 'ruine', true);
  if (nb[own].includes(ring1[0])) assert.equal(best, ring1[0], 'the Sternhaufen next to the own one wins');
});

/* ------------------------------------------------------------------ */
/* Story                                                                */
/* ------------------------------------------------------------------ */

test('map story entries: first sector, each Ruine its own entry, Echo sighting, Echo takes a sector', () => {
  const g = act2Game(13);
  const cells = g.state.rep2.map.cells;
  g.state.rep2.act2At = -100;
  g.tick(0.3);
  g.slowChecks();
  assert.ok(g.state.story.a2_start, 'opening');
  assert.equal(g.state.story.a2_first, undefined);
  claim(g, claimable(g)[0]);
  g.slowChecks();
  assert.ok(g.state.story.a2_first);
  // claim everything: all Ruinen the player can get produce their own entries, distinct per variant
  const ruinCells = cells.filter((c) => c.type === 'ruine');
  let guard = 0;
  while (claimable(g).length && guard++ < 30) {
    claim(g, claimable(g)[0]);
    g.slowChecks();
  }
  const claimedRuins = cells.filter((c) => c.type === 'ruine' && c.own);
  assert.ok(ruinCells.length === 3);
  for (const c of claimedRuins) assert.ok(g.state.story['a2_ruin' + c.v], 'entry for variant ' + c.v);
  assert.equal(Object.keys(g.state.story).filter((k) => k.startsWith('a2_ruin')).length, claimedRuins.length);
  // the sighting came before the first occupation, which waits half a minute
  assert.ok(g.state.story.a2_echo !== undefined);
  g.state.time.played += 40;
  g.slowChecks();
  assert.ok(g.state.story.a2_echo_take >= g.state.story.a2_echo + 30);
  // four Ruinen variants exist as entries
  assert.equal(g.def.story.filter((s) => /^a2_ruin\d$/.test(s.id)).length, RUIN_VARIANTS);
  // the Echo is introduced (shown in the figure list) only by the sighting entry
  assert.equal(g.def.story.find((s) => s.id === 'a2_echo').lines.every((l) => l.who !== 'echo'), true, 'the Echo does not speak yet');
});

test('no Akt II entry is stamped before Akt II starts', () => {
  const g = createReplikator();
  g.tick(5);
  assert.deepEqual(g.def.story.filter((s) => s.chapter === 'a2' && g.state.story[s.id] !== undefined).map((s) => s.id), []);
});
