// Paket 5: Galaxiensprung (layer 4): reset semantics, the galaxy choice (seeded, stored in the save), the six galaxy types, the Archiv, Saatkern-Upgrades, autos in the
// later galaxies, the migration 5 -> 6. Pacing is in sim-replikator-jump.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createReplikator } from '../games/replikator/logic.js';
import { act2Game } from './helpers/replikator-act2.mjs';
import { TUNE as T } from '../games/replikator/tune.js';
import { D } from '../engine/decimal.js';
import { parse, stringify } from '../engine/save.js';
import { jumpReady, galaxyCheck, galChoose, galPick, drawOffers } from '../games/replikator/jump.js';
import { GAL_ORDER, galTrip, galType, galRule, archiveDone, archiveCount, collisionFactor, galBonusText, galRuleLines, migrateToJump } from '../games/replikator/galaxy.js';
import { jumpPlay, buySeedPlan, globalParts } from '../games/replikator/def.js';
import { mutSlots } from '../games/replikator/mutations.js';
import { claim, arrive, claimable, canClaim, mapCells } from '../games/replikator/map.js';
import { advance } from '../engine/core.js';

const FIXTURE = new URL('./fixtures/replikator-end-v1.json', import.meta.url).pathname;

/** A game in galaxy 1 with `n` sectors claimed, cores earned, some upgrades and research, ready to jump (n >= 10). */
function ready(n = 10) {
  const g = act2Game(n);
  g.add('cores', 4000);
  g.state.upg.bohrer = 1;
  g.state.upg.logistik = 2;
  g.state.upg.kern = 1;
  g.state.ms.ex3 = true;
  for (const c of g.def.challenges) g.state.challenge.done[c.id] = 1; // version 1 is finished when Akt II runs: no challenge can block the jump
  g.state.ms.s1 = true;
  g.state.layers.expansion.count = 20;
  g.grant('matter', 1e30);
  // the Echo has to be seen
  for (const c of mapCells(g)) if (c.echo === 1) c.seen = 1;
  g.tick(1);
  return g;
}

test('the jump opens with 10 sectors and the Echo seen, not before', () => {
  const g = act2Game(9);
  g.add('cores', 4000);
  g.tick(1);
  assert.ok(!jumpReady(g) && !g.canPrestige('jump'));
  const g2 = ready(10);
  assert.ok(jumpReady(g2) && g2.canPrestige('jump'));
  const g3 = ready(10);
  for (const c of mapCells(g3)) c.echo = 0; // the silhouette has not been seen
  g3.state.rep2.map.occupied = 0;
  assert.ok(!jumpReady(g3) && !g3.canPrestige('jump'));
});

test('gain = floor((cores of the galaxy / threshold) ^ exp), no softcap; a long save and a fresh finish are close', () => {
  const g = ready();
  g.state.cur.cores.run = D(5e4);
  const long = g.prestigeGain('jump').toNumber();
  g.state.cur.cores.run = D(1e4);
  const fresh = g.prestigeGain('jump').toNumber();
  assert.equal(fresh, Math.floor(Math.pow(1e4 / T.jumpThreshold, T.jumpExp)));
  assert.ok(long / fresh <= 2, `${long} vs ${fresh}`);
  g.state.cur.cores.run = D(1e30);
  assert.equal(g.prestigeGain('jump').toNumber(), Math.floor(Math.pow(1e30 / T.jumpThreshold, T.jumpExp)), 'no softcap');
});

test('what the jump wipes and what survives', () => {
  const g = ready();
  g.state.challenge.done.c_hand = 1;
  g.state.rep2.mut.genome = ['hyperaktiv', 'sparsam'];
  const m0 = g.state.cur.cores.total.toString();
  const gain = g.prestigeGain('jump');
  assert.ok(gain.gte(1));
  assert.ok(g.prestige('jump'));
  const s = g.state;
  // wiped: currencies, generators, upgrades (the milestones no longer keep them through a jump), map
  assert.equal(s.upg.bohrer, undefined);
  assert.equal(s.upg.logistik, undefined);
  assert.equal(s.upg.kern, undefined);
  assert.ok(g.get('systems').lt(1e3) && g.get('blueprints').eq(0) && g.get('cores').eq(0));
  assert.equal(s.rep2.map.cells.length, 0);
  assert.equal(s.rep2.map.claimed, 0);
  assert.equal(s.cur.cores.run.toString(), '0');
  // survives: Saatkerne, Genom, Akt II, milestones, challenge completions, counts, lifetime totals, anchor-free state
  assert.ok(g.get('seeds').eq(gain));
  assert.deepEqual(s.rep2.mut.genome, ['hyperaktiv', 'sparsam']);
  assert.ok(s.rep2.act2 && g.hasMs('ex3') && g.chDone('c_hand') && s.layers.expansion.count === 20 && s.layers.jump.count === 1);
  assert.equal(s.cur.cores.total.toString(), m0);
  // the choice is pending, the galaxy has no type yet
  assert.equal(galType(g), null);
  assert.equal(s.rep2.gal.choice.opts.length, 2);
  assert.equal(s.rep2.gal.n, 2);
  assert.ok(!g.canPrestige('jump'));
});

test('Saatkern-Upgrades keep what they say (Bauplan-Archiv, Sternenarchiv, Forschungsspeicher)', () => {
  const g = ready();
  g.state.upg.sk_plan = 1;
  g.state.upg.sk_karten = 1;
  g.state.upg.sk_labor = 1;
  g.prestige('jump');
  assert.equal(g.state.upg.bohrer, 1);
  assert.equal(g.state.upg.logistik, 2);
  assert.equal(g.state.upg.kern, 1);
});

test('Kernsaat / Sternensaat: a grant at once and at the start of every galaxy (the lifetime totals stay)', () => {
  const g = ready();
  g.grant('seeds', 100);
  const t0 = g.state.cur.cores.total.toString();
  assert.ok(g.upgBuy('sk_kerne'));
  assert.ok(g.get('cores').gte(T.seedFx.kerne[0]));
  assert.equal(g.state.cur.cores.total.toString(), t0, 'a grant, not earned');
  g.prestige('jump');
  assert.ok(g.get('cores').gte(T.seedFx.kerne[0]), 'again at the jump');
  assert.ok(g.upgBuy('sk_sterne'));
  assert.ok(g.get('systems').gte(T.seedFx.sterne[0]));
});

test('the choice: two types, never the one you left, new types first, deterministic, stored in the save', () => {
  const rng = { seed: 123 };
  const none = {};
  const a = drawOffers({ ...rng }, none, 'spirale');
  assert.equal(a.length, 2);
  assert.ok(!a.includes('spirale'));
  assert.deepEqual(a, drawOffers({ ...rng }, none, 'spirale'), 'same seed, same offer');
  // completed types only fill up
  const arch = { zwerg: 1, elliptisch: 1, kollision: 1, leerraum: 1 };
  const b = drawOffers({ seed: 5 }, arch, 'spirale');
  assert.ok(b.includes('quasar') && b.length === 2);
  const c = drawOffers({ seed: 5 }, { ...arch, quasar: 1 }, 'zwerg');
  assert.ok(c.length === 2 && !c.includes('zwerg'));
  for (let seed = 0; seed < 200; seed++) for (const cur of GAL_ORDER) assert.ok(!drawOffers({ seed }, none, cur).includes(cur));
  // persistence: the pending choice survives save and load, the same options come back
  const g = ready();
  g.prestige('jump');
  const opts = g.state.rep2.gal.choice.opts.slice();
  const g2 = createReplikator();
  g2.load(parse(stringify(g.state)));
  assert.deepEqual(g2.state.rep2.gal.choice.opts, opts);
  assert.ok(!galChoose(g2, GAL_ORDER.find((t) => !opts.includes(t))), 'a type that is not on offer is refused');
  assert.ok(galChoose(g2, opts[1]));
  assert.equal(galType(g2), opts[1]);
  assert.equal(g2.state.rep2.gal.choice, null);
  assert.equal(g2.state.rep2.map.cells.length, 19, 'the new map has the Echo again');
  assert.equal(g2.state.rep2.map.cells.filter((c) => c.echo === 1).length, 1);
  assert.equal(g2.state.rep2.anchor, T.galAnchor);
});

test('galPick prefers a type you have not completed, then the fixed order', () => {
  const g = ready();
  g.prestige('jump');
  const [x, y] = ['kollision', 'zwerg'];
  assert.equal(galPick(g, [x, y]), 'zwerg');
  g.state.rep2.archive.zwerg = 1;
  assert.equal(galPick(g, [x, y]), 'kollision');
});

test('the Archiv: the first completion of a type gives its bonus once; two types add a Genom slot (never more than 6)', () => {
  const g = act2Game(10);
  g.add('cores', 4000);
  assert.ok(!archiveDone(g, 'spirale'));
  const t0 = galTrip(g);
  assert.ok(galaxyCheck(g));
  assert.ok(archiveDone(g, 'spirale') && archiveCount(g) === 1);
  assert.ok(Math.abs(galTrip(g) / t0 - T.galArchive.spirale.trip) < 1e-9);
  assert.ok(!galaxyCheck(g), 'once');
  const s0 = mutSlots(g);
  g.state.rep2.archive.kollision = 1;
  assert.equal(mutSlots(g), Math.min(T.genomeMax, s0 + 1));
  g.state.rep2.archive.leerraum = 1;
  assert.ok(mutSlots(g) <= T.genomeMax);
  for (const t of GAL_ORDER) assert.ok(galBonusText(t).length > 5 && galRuleLines(t).length >= 1);
});

test('the Genom slots that sector counts opened stay after the jump (no genome above its slots)', () => {
  const g = ready();
  const before = mutSlots(g);
  assert.ok(before >= 5);
  g.prestige('jump');
  galChoose(g, g.state.rep2.gal.choice.opts[0]);
  assert.equal(mutSlots(g), before);
});

/** Put a game into galaxy n of the given type directly. */
function inGalaxy(type) {
  const g = ready();
  g.state.upg = {};
  g.prestige('jump');
  g.state.rep2.gal.choice.opts[0] = type;
  assert.ok(galChoose(g, type));
  return g;
}

test('Zwerggalaxie: 6 tiers, thresholds ÷100, Sternsystem gain ×0.5, short trips', () => {
  const g = inGalaxy('zwerg');
  assert.equal(g.cache.maxTier.matter, 6);
  assert.equal(g.prestigeThreshold('replication').toNumber(), T.repThreshold / 100);
  assert.equal(g.prestigeThreshold('expansion').toNumber(), T.expThreshold / 100);
  assert.equal(g.prestigeThreshold('singularity').toNumber(), T.singThreshold / 100);
  const sp = inGalaxy('spirale');
  assert.equal(sp.prestigeThreshold('replication').toNumber(), T.repThreshold);
  assert.equal(sp.cache.maxTier.matter, 8);
  assert.ok(galTrip(g) < galTrip(sp));
  g.state.cur.blueprints.run = D(1e9);
  sp.state.cur.blueprints.run = D(1e9);
  assert.ok(g.prestigeGain('expansion').lt(sp.prestigeGain('expansion').mul(0.6)) || g.prestigeThreshold('expansion').lt(sp.prestigeThreshold('expansion')));
});

test('Elliptisch: cost growth ×1.5 and Sternsystem gain ×3 (ripening with the run time)', () => {
  const g = inGalaxy('elliptisch');
  const sp = inGalaxy('spirale');
  assert.ok(g.genRatio(g.chain('matter'), 0).gt(sp.genRatio(sp.chain('matter'), 0)));
  g.state.layers.expansion.runTime = 400;
  sp.state.layers.expansion.runTime = 400;
  g.state.cur.blueprints.run = D(1e9);
  sp.state.cur.blueprints.run = D(1e9);
  const r = g.prestigeGain('expansion').toNumber() / sp.prestigeGain('expansion').toNumber();
  assert.ok(r > 2.5 && r < 3.5, 'ratio ' + r);
  g.state.layers.expansion.runTime = 0;
  assert.ok(g.prestigeGain('expansion').lt(sp.prestigeGain('expansion').mul(1.2)), 'the bonus ripens: nothing at the start of a run');
});

test('Kollisionszone: deterministic 10-minute cycle 0.5..4, the average over a large offline step equals many small steps', () => {
  const g = inGalaxy('kollision');
  const f = (t) => { g.state.time.played = g.state.rep2.gal.at + t; return collisionFactor(g, 0); };
  assert.ok(Math.abs(f(0) - 0.5) < 1e-9 && Math.abs(f(300) - 4) < 1e-9 && Math.abs(f(600) - 0.5) < 1e-9);
  assert.ok(Math.abs(f(123) - f(123 + 600)) < 1e-9);
  const at0 = g.state.rep2.gal.at;
  g.state.time.played = at0 + 1000;
  const big = collisionFactor(g, 58);
  let sum = 0;
  for (let i = 0; i < 580; i++) { g.state.time.played = at0 + 1000 - 58 + (i + 1) * 0.1; sum += collisionFactor(g, 0); }
  assert.ok(Math.abs(big - sum / 580) < 0.02, `${big} vs ${sum / 580}`);
  const parts = globalParts(g).find(([l]) => l === 'Kollisionszone');
  assert.ok(parts);
});

test('Leerraum: no Sternsystem production bonus, mutation offers twice as often', () => {
  const g = inGalaxy('leerraum');
  g.state.cur.systems.run = D(1e6);
  assert.ok(!globalParts(g).some(([l]) => l === 'Sternsysteme'));
  const sp = inGalaxy('spirale');
  sp.state.cur.systems.run = D(1e6);
  assert.ok(globalParts(sp).some(([l]) => l === 'Sternsysteme'));
  assert.equal(galRule(g, 'offers', 1), 2);
});

test('Quasar: production ×1000; generator autobuyers wait for 3 Expansions (or 20 minutes)', () => {
  const g = inGalaxy('quasar');
  assert.ok(globalParts(g).some(([l, v]) => l === 'Quasar' && v.eq(1000)));
  g.state.upg.auto1 = 1;
  assert.ok(!g.autoUnlocked('auto_gen0'));
  g.state.layers.expansion.count += 3;
  assert.ok(g.autoUnlocked('auto_gen0'));
  g.state.layers.expansion.count -= 3;
  g.state.time.played += 1300;
  assert.ok(g.autoUnlocked('auto_gen0'), 'the time fallback: an absent player is not stuck');
});

test('autos from galaxy 1 stay unlocked in the later galaxies (they count the best sector record)', () => {
  const g = ready();
  g.state.rep2.cmd.on = true;
  g.state.rep2.mut.started = true;
  g.tick(1);
  for (const id of ['auto_map', 'auto_befehl', 'auto_genom']) assert.ok(g.autoUnlocked(id), id);
  g.prestige('jump');
  galChoose(g, g.state.rep2.gal.choice.opts[0]);
  g.tick(1);
  assert.equal(g.state.rep2.map.claimed, 0);
  for (const id of ['auto_map', 'auto_befehl', 'auto_genom']) assert.ok(g.autoUnlocked(id), id + ' after the jump');
});

test('Auto-Sprung: unlocks after 3 completed types, starts off, jumps and picks the next galaxy', () => {
  const g = ready();
  assert.ok(!g.autoUnlocked('auto_jump'));
  assert.equal(g.def.autos.find((a) => a.id === 'auto_jump').defaults.on, false);
  Object.assign(g.state.rep2.archive, { zwerg: 1, elliptisch: 1, spirale: 1 });
  assert.ok(g.autoUnlocked('auto_jump'));
  g.state.auto.auto_jump.on = true;
  g.tick(2);
  assert.equal(g.state.layers.jump.count, 1);
  assert.ok(galType(g), 'picked: ' + galType(g));
  assert.ok(!archiveDone(g, galType(g)) || galType(g) !== 'zwerg');
});

test('jumpPlay and the plan: the sim player does what the auto does and buys Saatkern-Upgrades in order', () => {
  const g = ready();
  assert.ok(jumpPlay(g));
  assert.ok(galType(g));
  g.grant('seeds', 200);
  const n = buySeedPlan(g);
  assert.ok(n >= 5);
  assert.equal(g.upgLevel('sk_plan'), 1);
  assert.ok(g.upgLevel('sk_flug') >= 1);
});

test('Saatkern-Upgrades: trip, commands, anomalies and gains act where they say', () => {
  const g = act2Game(2);
  const t0 = galTrip(g);
  g.state.upg.sk_flug = 2;
  assert.ok(Math.abs(galTrip(g) / t0 - Math.pow(T.seedFx.flug, 2)) < 1e-9);
  g.state.layers.expansion.runTime = 9999;
  const before = g.prestigeGain('expansion');
  g.state.upg.sk_gewinn = 2;
  g.refresh();
  assert.ok(g.prestigeGain('expansion').toNumber() >= before.toNumber() * 1.5);
  assert.equal(g.def.upgrades.filter((u) => u.group === 'seed').length, 9);
});

test('migration 5 -> 6: a v5 save gets the galaxy state, the sector record and a stable offer seed; the real save loads cleanly', () => {
  const g = createReplikator();
  const data = JSON.parse(stringify(act2Game(7).state));
  delete data.rep2.gal;
  delete data.rep2.archive;
  data.v = 5;
  const out = migrateToJump(JSON.parse(JSON.stringify(data)));
  assert.equal(out.v, 6);
  assert.equal(out.rep2.gal.best, 7);
  assert.equal(out.rep2.gal.rng.seed, migrateToJump(JSON.parse(JSON.stringify(data))).rep2.gal.rng.seed);
  assert.equal(g.migrations[5].length, 1);
});

test('the real end-of-v1 save loads into version 7: galaxy 1, Spirale, no choice, jump layer closed', async () => {
  const { loadSaveFile } = await import('../tools/simulate.mjs');
  const g = loadSaveFile(FIXTURE);
  assert.equal(g.state.v, 7);
  assert.equal(g.state.rep2.gal.n, 1);
  assert.equal(galType(g), 'spirale');
  assert.equal(g.state.rep2.gal.choice, null);
  assert.ok(!g.canPrestige('jump'));
  assert.equal(g.state.settings.confirm.jump, true);
  advance(g, 5);
  assert.equal(g.state.layers.jump.count, 0);
});
