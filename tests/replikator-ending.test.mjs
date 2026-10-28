// Paket 6: the end of Akt II (ending.js): when it opens, the two endings, the second one after 3 jumps, what they do to the maps and the bonuses, save migration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { act2Game } from './helpers/replikator-act2.mjs';
import { TUNE as T } from '../games/replikator/tune.js';
import { GAL_ORDER } from '../games/replikator/galaxy.js';
import {
  endAvailable, endPending, endChoose, endOptions, endSecond, endJumpsLeft, endHas, endCount, endTrip, endGain, endPlay, endState, migrateToEnd,
} from '../games/replikator/ending.js';
import { claim, arrive, claimable, canClaim, mapCells, tripSecs, claimCost, paidCount, claimedCount, applyEnding, echoSighted, occupiedCount } from '../games/replikator/map.js';
import { generateMap } from '../games/replikator/map.js';
import { galChoose } from '../games/replikator/jump.js';
import { jumpReady } from '../games/replikator/jump.js';
import { postGain } from '../games/replikator/def.js';
import { advance } from '../engine/core.js';

const finishArchive = (g, n = GAL_ORDER.length) => GAL_ORDER.slice(0, n).forEach((t, k) => (g.state.rep2.archive[t] = 100 + k));
const claimAll = (g, n) => {
  for (let k = 0; k < n; k++) {
    const i = claimable(g).find((x) => canClaim(g, x).ok);
    if (i === undefined) break;
    claim(g, i);
    arrive(g);
  }
};
/** A fresh galaxy after a jump: pick the offered type and let the map be built with the endings that are in effect. */
function newGalaxy(g, type = 'zwerg') {
  const gal = g.state.rep2.gal;
  gal.choice = { opts: [type, 'quasar'], at: 0 };
  gal.type = null;
  assert.ok(galChoose(g, type));
}

test('the end is open when all six galaxy types are in the Archiv, not before', () => {
  const g = act2Game(2);
  assert.ok(!endAvailable(g) && !endPending(g) && endOptions(g).length === 0);
  finishArchive(g, 5);
  assert.ok(!endAvailable(g) && !endPending(g));
  finishArchive(g);
  assert.ok(endAvailable(g) && endPending(g));
  assert.deepEqual(endOptions(g), ['merge', 'split']);
  assert.ok(!endChoose(g, 'nonsense'));
});

test('the first choice: either ending, only once; the other one waits for 3 further jumps and then opens', () => {
  const g = act2Game(2);
  finishArchive(g);
  assert.ok(endChoose(g, 'merge'));
  assert.ok(endHas(g, 'merge') && !endHas(g, 'split') && endCount(g) === 1);
  assert.ok(!endPending(g) && !endChoose(g, 'merge') && !endChoose(g, 'split'), 'not yet');
  assert.equal(endJumpsLeft(g), T.endSecondJumps);
  g.state.layers.jump.count += 2;
  assert.equal(endJumpsLeft(g), T.endSecondJumps - 2);
  assert.equal(endSecond(g), null);
  g.state.layers.jump.count += 1;
  assert.equal(endJumpsLeft(g), 0);
  assert.equal(endSecond(g), 'split');
  assert.deepEqual(endOptions(g), ['split']);
  assert.ok(!endChoose(g, 'merge'));
  assert.ok(endChoose(g, 'split'));
  assert.equal(endCount(g), 2);
  assert.deepEqual(g.state.rep2.end.order, ['merge', 'split']);
  assert.deepEqual(endOptions(g), []);
  // the other way round
  const h = act2Game(2);
  finishArchive(h);
  endChoose(h, 'split');
  h.state.layers.jump.count += 3;
  assert.equal(endSecond(h), 'merge');
});

test('the sim player takes the first ending at once and the other as soon as it opens', () => {
  const g = act2Game(2);
  finishArchive(g);
  assert.equal(endPlay(g, ['split', 'merge']), 'split');
  assert.equal(endPlay(g, ['split', 'merge']), null);
  g.state.layers.jump.count += 3;
  assert.equal(endPlay(g, ['split', 'merge']), 'merge');
});

test('Verschmelzen: in the next map the Echo cells are yours: free, counted as sectors; every second paid claim brings one more', () => {
  const g = act2Game(0);
  finishArchive(g);
  endChoose(g, 'merge');
  newGalaxy(g);
  const m = g.state.rep2.map;
  assert.equal(m.noEcho, 1);
  assert.ok(!mapCells(g).some((c) => c.echo === 1), 'no silhouette');
  const start = mapCells(g).filter((c) => c.merged);
  assert.equal(start.length, 1);
  assert.ok(start[0].own && T.endFx.merge.startTypes.includes(start[0].type));
  assert.equal(claimedCount(g), 1);
  assert.equal(m.free, 1);
  assert.ok(echoSighted(g), 'no silhouette to look for');
  claimAll(g, 1);
  assert.equal(claimedCount(g), 2);
  assert.equal(m.grants || 0, 0);
  claimAll(g, 1); // the 2nd paid claim brings the first granted cell
  assert.equal(claimedCount(g), 4, 'start cell + 2 paid + 1 granted');
  assert.equal(m.grants, 1);
  assert.equal(m.occupied, 0, 'the Echo takes nothing');
  claimAll(g, 4);
  assert.equal(m.grants, 3);
  assert.equal(claimedCount(g), 10, '1 + 6 + 3: ten sectors after six paid claims');
  assert.ok(mapCells(g).filter((c) => c.merged).length === 4);
  assert.ok(jumpReady(g));
  // price and travel time follow the sector count (freeIndex 1), a free cell costs nothing
  assert.equal(paidCount(g), 10 - (1 - T.endFx.merge.freeIndex) * m.free);
});

test('Verschmelzen is cheaper in time than the plain map: ten sectors need fewer and shorter Erschließungen', () => {
  const plain = act2Game(0);
  const time = (g) => {
    let t = 0;
    while (claimedCount(g) < 10) {
      t += tripSecs(g);
      claimAll(g, 1);
    }
    return t;
  };
  const base = time(plain);
  const g = act2Game(0);
  finishArchive(g);
  endChoose(g, 'merge');
  newGalaxy(g, 'spirale');
  g.state.rep2.gal.n = 1; // same price and trip level as the plain map: no galaxy distance factor
  const merged = time(g);
  assert.ok(merged < base * 0.75, `merged ${merged} s against plain ${base} s`);
});

test('Abgrenzen: the Echo leaves the maps (no silhouette, no occupation, 18 free cells) and the bonus works: faster trips, bigger gains', () => {
  const g = act2Game(0);
  finishArchive(g);
  const trip0 = tripSecs(g);
  g.state.layers.expansion.runTime = 1e6; // ripe
  g.refresh();
  const gain0 = postGain(g, 'systems').toNumber();
  endChoose(g, 'split');
  assert.equal(tripSecs(g), Math.round(trip0 * T.endFx.split.trip));
  assert.equal(endTrip(g), T.endFx.split.trip);
  assert.ok(Math.abs(endGain(g, 'systems').toNumber() - T.endFx.split.gain) < 1e-9);
  assert.ok(Math.abs(postGain(g, 'systems').toNumber() / gain0 - T.endFx.split.gain) < 1e-9);
  assert.ok(Math.abs(endGain(g, 'blueprints').toNumber() - T.endFx.split.gain) < 1e-9);
  newGalaxy(g);
  const m = g.state.rep2.map;
  assert.equal(m.noEcho, 1);
  assert.ok(!m.merge);
  assert.ok(!mapCells(g).some((c) => c.echo));
  assert.equal(claimable(g).length, 6, 'around the home cell');
  assert.equal(claimedCount(g), 0);
  claimAll(g, 14);
  assert.equal(occupiedCount(g), 0);
  assert.ok(claimedCount(g) >= 14, 'nothing is taken: every cell is reachable');
  assert.ok(jumpReady(g), 'ten sectors are enough, the silhouette does not matter');
});

test('both endings: the bonuses stack, the Echo is gone and its cells are still yours', () => {
  const g = act2Game(0);
  finishArchive(g);
  endChoose(g, 'merge');
  g.state.layers.jump.count += 3;
  endChoose(g, 'split');
  newGalaxy(g);
  const m = g.state.rep2.map;
  assert.equal(m.merge, 1);
  assert.equal(claimedCount(g), 1);
  assert.equal(endTrip(g), T.endFx.split.trip);
  claimAll(g, 4);
  assert.equal(m.grants, 2);
});

test('a map made before an ending keeps its Echo; only the next map changes', () => {
  const g = act2Game(4);
  const occ = occupiedCount(g);
  finishArchive(g);
  endChoose(g, 'merge');
  assert.ok(!g.state.rep2.map.noEcho);
  claimAll(g, 2);
  assert.ok(occupiedCount(g) > occ);
});

test('the new map draws the same random numbers as before (old seeds give the same layouts)', () => {
  const a = { seed: 99 };
  const b = { seed: 99 };
  const m1 = generateMap(a);
  const m2 = generateMap(b);
  assert.deepEqual(m1.cells.map((c) => c.type), m2.cells.map((c) => c.type));
  const g = act2Game(0);
  finishArchive(g);
  endChoose(g, 'split');
  const m3 = generateMap({ seed: 99 });
  const types = m3.cells.map((c) => c.type);
  applyEnding(g, m3);
  const after = m3.cells.map((c) => c.type);
  const diff = after.map((t, i) => (t !== types[i] ? i : -1)).filter((i) => i >= 0);
  assert.equal(diff.length, 1, 'only the silhouette cell changes');
  assert.equal(types[diff[0]], 'echo');
});

test('the Auto-Sprung waits for the decision at the end of Akt II and goes on afterwards', () => {
  const g = act2Game(10);
  finishArchive(g);
  for (const c of mapCells(g)) if (c.echo === 1) c.seen = 1;
  for (const c of g.def.challenges) g.state.challenge.done[c.id] = 1;
  g.add('cores', 4000);
  g.state.auto.auto_jump.on = true;
  g.tick(1);
  assert.ok(g.canPrestige('jump'), 'the galaxy is complete');
  assert.ok(g.autoUnlocked('auto_jump'));
  const a = g.autoById.auto_jump;
  assert.match(a.status(g), /Entscheidung/);
  advance(g, 5);
  assert.equal(g.state.layers.jump.count, 0, 'held while the choice is open');
  endChoose(g, 'merge');
  assert.equal(a.status(g), '');
  advance(g, 5);
  assert.equal(g.state.layers.jump.count, 1, 'goes on afterwards');
});

test('save: version 7, the migration 6 -> 7 changes nothing but the number; the state is plain data', () => {
  const out = migrateToEnd({ v: 6, x: 1 });
  assert.deepEqual(out, { v: 7, x: 1 });
  const e = endState();
  assert.deepEqual(e.picked, { merge: 0, split: 0 });
  const g = act2Game(1);
  assert.deepEqual(JSON.parse(JSON.stringify(g.state.rep2.end)), g.state.rep2.end);
  assert.equal(g.version, 7);
  assert.equal(typeof g.migrations[6], 'function');
});

/* ---------------- Echo-Resonanz ---------------- */
import { MUT_BY_ID, mutTick, mutGainParts, mutTrip, ECHO_SPEAKS, echoSpoke, mutAddOffer } from '../games/replikator/mutations.js';

test('Echo-Resonanz: a rare mutation that is only offered after the Echo has spoken; gains of Blaupausen and Sternsysteme up, trips slower', () => {
  const m = MUT_BY_ID.echoresonanz;
  assert.ok(m && m.rarity === 'selten' && m.report.length > 30 && m.benefit() && m.catch());
  const draws = (g, n) => {
    const seen = new Set();
    for (let k = 0; k < n; k++) {
      g.state.rep2.mut.offer = null;
      g.state.rep2.mut.queue = 1;
      g.state.rep2.mut.genome = [];
      mutTick(g, 0);
      for (const id of g.state.rep2.mut.offer.cards) seen.add(id);
    }
    return seen;
  };
  const g = act2Game(3);
  assert.ok(!echoSpoke(g));
  assert.ok(!draws(g, 400).has('echoresonanz'), 'never before the Echo has spoken');
  g.state.story[ECHO_SPEAKS] = 1234;
  assert.ok(echoSpoke(g));
  assert.ok(draws(g, 400).has('echoresonanz'), 'offered afterwards');
  // effect: both gains x gain (ripe), travel time x trip
  g.state.rep2.mut.genome = ['echoresonanz'];
  g.state.layers.expansion.runTime = 1e6;
  g.mutRef = true;
  g.refresh();
  const parts = mutGainParts(g, 'systems');
  assert.equal(parts.length, 1);
  assert.equal(parts[0][1].toNumber(), T.mutFx.echoresonanz.gain);
  assert.equal(mutGainParts(g, 'blueprints')[0][1].toNumber(), T.mutFx.echoresonanz.gain);
  assert.equal(mutGainParts(g, 'cores').length, 0);
  assert.equal(mutTrip(g), T.mutFx.echoresonanz.trip);
});

test('an extra offer (Kosmischer Strahl, Spiegel) also respects the availability of Echo-Resonanz', () => {
  const g = act2Game(3);
  for (let k = 0; k < 60; k++) {
    g.state.rep2.mut.offer = null;
    g.state.rep2.mut.queue = 0;
    g.state.rep2.mut.genome = [];
    mutAddOffer(g, 'selten');
    assert.ok(!g.state.rep2.mut.offer.cards.includes('echoresonanz'));
  }
});
