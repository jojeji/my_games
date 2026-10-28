// Replikator Akt II, Paket 4: Sondenbefehle (games/replikator/commands.js), their auto, Pulsar charging, the mutation Sonnenhunger
// and the sector bonuses of the map after the softcap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createReplikator } from '../games/replikator/logic.js';
import { act2Game, startTrip } from './helpers/replikator-act2.mjs';
import { TUNE as T } from '../games/replikator/tune.js';
import { D } from '../engine/decimal.js';
import { advance } from '../engine/core.js';
import { claim, arrive, claimable, canClaim, tripOf, isVisible, mapCells, gainMult, mapGain, ownedOfType } from '../games/replikator/map.js';
import { cmdRate, cmdUnlocked, cmdTick, cmdGain, pulsarRate, sonnenwindAmount, scanCut, COMMANDS } from '../games/replikator/commands.js';
import { MUTATIONS, mutCmdRate, mutExtra } from '../games/replikator/mutations.js';
import { mapObjective, repObjective, postGain } from '../games/replikator/def.js';

const ripe = (g) => {
  for (const l of ['replication', 'expansion', 'singularity']) g.state.layers[l].runTime = 1e5;
};
const setRun = (g, o) => {
  for (const [k, v] of Object.entries(o)) g.state.cur[k].run = D(v);
  ripe(g);
  g.refresh();
};
const cast = (g, id) => g.spellCast(id);

test('three commands exist as engine spells with duration / cooldown from tune.js, and the count of mutations is 16 with Sonnenhunger', () => {
  const g = createReplikator();
  assert.deepEqual(g.def.spells.map((s) => s.id), ['uebertakten', 'sonnenwind', 'tiefenscan']);
  assert.equal(g.spellById.uebertakten.duration(g), T.uebertakten.dur);
  assert.equal(g.spellById.sonnenwind.duration(g), 0);
  assert.equal(MUTATIONS.length, 16);
  assert.ok(MUTATIONS.some((m) => m.id === 'sonnenhunger' && m.rarity === 'selten' && m.report.length > 20));
  for (const s of COMMANDS) assert.ok(s.name && s.desc && s.lockText && s.info(act2Game(2)), s.id);
});

test('unlock: the first Pulsar sector OR 6 claimed sectors; once unlocked it stays (a later map reset does not take it away)', () => {
  const g = act2Game(0, { type: 'haufen' });
  g.tick(0.1);
  assert.ok(!cmdUnlocked(g) && !g.spellUnlocked('uebertakten'));
  for (let k = 0; k < T.cmdUnlockAt - 1; k++) {
    const i = claimable(g).find((x) => canClaim(g, x).ok);
    claim(g, i);
    arrive(g);
  }
  g.tick(0.1);
  assert.ok(!cmdUnlocked(g), 'five sectors, no Pulsar');
  const i = claimable(g).find((x) => canClaim(g, x).ok);
  claim(g, i);
  arrive(g);
  g.tick(0.1);
  assert.ok(cmdUnlocked(g) && g.spellUnlocked('tiefenscan') && g.state.rep2.cmd.on);
  // Pulsar path
  const p = act2Game(0, { type: 'haufen' });
  const cell = p.state.rep2.map.cells.find((c) => c.type === 'haufen');
  cell.type = 'pulsar';
  claim(p, p.state.rep2.map.cells.indexOf(cell));
  arrive(p);
  assert.equal(ownedOfType(p, 'pulsar'), 1);
  p.tick(0.1);
  assert.ok(cmdUnlocked(p), 'one Pulsar is enough');
  // stays
  cell.own = 0;
  p.state.rep2.map.claimed = 0;
  p.refresh();
  assert.ok(cmdUnlocked(p) && p.spellUnlocked('sonnenwind'));
  // an old save without Akt II has no commands
  assert.ok(!cmdUnlocked(createReplikator()));
});

test('Übertakten: the Erschliessung flies faster for its duration (time weighted, also with the huge offline steps), then normal again', () => {
  const g = act2Game(6);
  startTrip(g, 1000);
  g.tick(10);
  assert.ok(Math.abs(tripOf(g).left - 990) < 1e-6, 'normal speed without the command');
  assert.ok(cast(g, 'uebertakten'));
  assert.equal(g.state.spells.uebertakten.t, T.uebertakten.dur);
  g.tick(10);
  assert.ok(Math.abs(tripOf(g).left - (990 - 10 * T.uebertakten.trip)) < 1e-6, 'x3 while it runs');
  // one huge step (offline): 35 s of the window left, dt = 100 s -> 35 s at x3 + 65 s at x1
  g.state.spells.uebertakten.t = 35;
  const before = tripOf(g).left;
  g.tick(100);
  assert.ok(Math.abs(before - tripOf(g).left - (35 * T.uebertakten.trip + 65)) < 1e-6, 'time weighted: ' + (before - tripOf(g).left));
  assert.equal(g.state.spells.uebertakten.t, 0);
  const left = tripOf(g).left;
  g.tick(10);
  assert.ok(Math.abs(left - tripOf(g).left - 10) < 1e-6, 'normal again');
});

test('Übertakten: the prestige gains are higher while it runs (after the softcap, ripening with the run time like every gain factor)', () => {
  const g = act2Game(6);
  setRun(g, { matter: 1e60, blueprints: 1e12, systems: 1e12 });
  const base = { bp: g.prestigeGain('replication'), sys: g.prestigeGain('expansion'), qk: g.prestigeGain('singularity') };
  assert.ok(cmdGain(g, 'systems').eq(1), 'no effect while it is not active');
  assert.ok(cast(g, 'uebertakten'));
  g.refresh();
  for (const [k, id] of [['bp', 'replication'], ['sys', 'expansion'], ['qk', 'singularity']]) {
    const r = g.prestigeGain(id).div(base[k]).toNumber();
    assert.ok(Math.abs(r - T.uebertakten.gain) < 0.01, `${id}: x${r}`);
  }
  // a fresh run does not get it in full (Sternsysteme ripen over 5 min, Quantenkerne over 30)
  g.state.layers.expansion.runTime = 0;
  g.state.layers.singularity.runTime = 0;
  g.refresh();
  assert.ok(cmdGain(g, 'systems').eq(1) && cmdGain(g, 'cores').eq(1), 'unripe: no bonus at the start of a run');
  assert.ok(cmdGain(g, 'blueprints').gt(1), 'Blaupausen have no ripening (their run length is healthy, runlength tests)');
  // the effect ends with the window
  g.state.spells.uebertakten.t = 0;
  g.refresh();
  assert.ok(cmdGain(g, 'blueprints').eq(1));
});

test('Sonnenwind-Ernte: instantly `share` times the Sternsysteme of the next Expansion; the auto only casts when that is worth something', () => {
  const g = act2Game(6);
  const sp = g.spellById.sonnenwind;
  g.state.cur.blueprints.run = D(0);
  g.refresh();
  assert.ok(!sp.autoWhen(g), 'nothing to harvest');
  setRun(g, { blueprints: 1e12 });
  const gain = g.prestigeGain('expansion');
  assert.ok(gain.gte(1) && sp.autoWhen(g));
  g.state.cur.systems.amount = D(7); // a small stock (the test game is rich: 1e60 would swallow the harvest)
  const have = g.get('systems');
  const runBefore = g.state.cur.systems.run;
  assert.ok(sonnenwindAmount(g).eq(gain.mul(T.sonnenwind.share).floor()));
  assert.ok(cast(g, 'sonnenwind'));
  assert.ok(g.get('systems').sub(have).eq(gain.mul(T.sonnenwind.share).floor()), 'Sternsysteme arrive at once');
  assert.ok(g.state.cur.systems.run.sub(runBefore).eq(gain.mul(T.sonnenwind.share).floor()), 'they count as earned (the Singularität basis)');
  assert.ok(g.state.spells.sonnenwind.cd > 0 && !g.spellReady('sonnenwind'));
});

test('Tiefenscan: reveals the fogged cells nearest to the territory and cuts the running Erschliessung by a share of its duration', () => {
  const g = act2Game(1);
  g.state.rep2.cmd.on = true; // unlocked (one sector is not enough by itself)
  const cells = mapCells(g);
  const fog = () => cells.map((c, i) => i).filter((i) => !cells[i].own && !isVisible(cells, i));
  const before = fog().length;
  assert.ok(before >= T.tiefenscan.reveal);
  startTrip(g, 800);
  const trip = tripOf(g);
  trip.dur = 1000;
  assert.equal(scanCut(g), T.tiefenscan.cut * 1000);
  assert.ok(cast(g, 'tiefenscan'));
  assert.equal(fog().length, before - T.tiefenscan.reveal, 'five cells less in the fog');
  assert.ok(Math.abs(tripOf(g).left - (800 - T.tiefenscan.cut * 1000)) < 1e-9, 'trip shortened: ' + tripOf(g).left);
  assert.equal(cells.filter((c) => c.seen).length, T.tiefenscan.reveal, 'the `seen` flag');
  // the cut never exceeds what is left
  const h = act2Game(1);
  h.state.rep2.cmd.on = true;
  startTrip(h, 50);
  tripOf(h).dur = 1000;
  cast(h, 'tiefenscan');
  assert.ok(tripOf(h).left >= 0 && tripOf(h).left < 1e-9);
  // without a trip it only reveals
  const k = act2Game(1);
  k.state.rep2.cmd.on = true;
  assert.equal(scanCut(k), 0);
  assert.ok(cast(k, 'tiefenscan'));
  assert.ok(!tripOf(k));
});

test('cooldown = base / recharge speed: Pulsar sectors speed it up, the mutation Sonnenhunger doubles it', () => {
  const g = act2Game(6, { type: 'haufen' });
  assert.equal(pulsarRate(g), 1);
  assert.equal(g.spellCooldown('uebertakten'), T.uebertakten.cd);
  // three Pulsar sectors in a row: more than one exponent unit each (neighbour bonus)
  const cells = mapCells(g);
  let n = 0;
  for (const c of cells) if (c.own && c.type !== 'home' && n < 3) (c.type = 'pulsar'), n++;
  g.refresh();
  const r = pulsarRate(g);
  assert.ok(r > 1 + T.cmdPulsar * 2.99, 'rate ' + r);
  assert.ok(Math.abs(g.spellCooldown('sonnenwind') - T.sonnenwind.cd / r) < 1e-9);
  assert.ok(g.spellCooldown('tiefenscan') < T.tiefenscan.cd);
  // Sonnenhunger
  g.state.rep2.mut.genome = ['sonnenhunger'];
  g.refresh();
  assert.equal(mutCmdRate(g), T.mutFx.sonnenhunger.cmd);
  assert.ok(Math.abs(cmdRate(g) - r * T.mutFx.sonnenhunger.cmd) < 1e-9);
  assert.ok(Math.abs(g.spellCooldown('uebertakten') - T.uebertakten.cd / (r * 2)) < 1e-9);
  // the cooldown counts down in game time
  assert.ok(cast(g, 'uebertakten'));
  const cd = g.state.spells.uebertakten.cd;
  g.tick(10);
  assert.ok(Math.abs(g.state.spells.uebertakten.cd - (cd - 10)) < 1e-9);
});

test('Sonnenhunger: benefit (recharge x2) and catch (Blaupausen-Gewinn x0,5) both act; the Auto-Genom valuation sees the recharge', () => {
  const g = act2Game(6);
  setRun(g, { matter: 1e60, blueprints: 1e12, systems: 1e12 });
  const bp = g.prestigeGain('replication');
  const rate = cmdRate(g);
  const extra = mutExtra(g);
  g.state.rep2.mut.genome = ['sonnenhunger'];
  g.refresh();
  assert.ok(cmdRate(g) / rate === T.mutFx.sonnenhunger.cmd);
  assert.ok(Math.abs(g.prestigeGain('replication').div(bp).toNumber() - T.mutFx.sonnenhunger.bp) < 0.01);
  assert.ok(mutExtra(g) > extra, 'the valuation counts the recharge');
  const m = MUTATIONS.find((x) => x.id === 'sonnenhunger');
  assert.ok(m.benefit().includes('Sondenbefehle') && m.catch().includes('Blaupausen'));
});

test('Auto-Befehl: off by default, unlocks with 9 sectors, casts only what pays (autoWhen), per-spell switches count; manual casts are never blocked', () => {
  const g = act2Game(8);
  const auto = g.def.autos.find((a) => a.id === 'auto_befehl');
  assert.equal(auto.kind, 'misc');
  assert.equal(g.state.auto.auto_befehl.on, false);
  assert.ok(!g.autoUnlocked('auto_befehl'), 'not with 8 sectors');
  const i = claimable(g).find((x) => canClaim(g, x).ok);
  claim(g, i);
  arrive(g);
  g.tick(0.1);
  assert.ok(g.autoUnlocked('auto_befehl'));
  // nothing to speed up (no trip), nothing to harvest: nothing is cast
  g.state.cur.blueprints.run = D(0);
  g.refresh();
  assert.equal(g.spellAutoRun(), 0);
  // a long trip: Übertakten and Tiefenscan are worth it, Sonnenwind needs a gain
  startTrip(g, 3000);
  tripOf(g).dur = 3000;
  assert.equal(g.spellAutoRun(), 2);
  assert.ok(g.state.spells.uebertakten.n === 1 && g.state.spells.tiefenscan.n === 1 && g.state.spells.sonnenwind.n === 0);
  // per-spell switch
  const h = act2Game(9);
  startTrip(h, 3000);
  tripOf(h).dur = 3000;
  h.state.spells.uebertakten.auto = false;
  assert.equal(h.spellAutoRun(), 1);
  assert.equal(h.state.spells.uebertakten.n, 0);
  // a manual cast ignores autoWhen
  const k = act2Game(6);
  assert.ok(!k.spellById.tiefenscan.autoWhen(k));
  assert.ok(cast(k, 'tiefenscan'));
});

test('the auto runs through the in-game autobuyer loop and only when on; an auto-cast keeps its full duration (cast after the countdown of the tick)', () => {
  const g = act2Game(9);
  startTrip(g, 3000);
  tripOf(g).dur = 3000;
  g.state.cur.blueprints.run = D(0);
  g.tick(1);
  assert.equal(g.state.spells.uebertakten.n, 0, 'off: nothing happens by itself');
  g.state.auto.auto_befehl.on = true;
  g.tick(1);
  assert.equal(g.state.spells.uebertakten.n, 1);
  assert.equal(g.state.spells.uebertakten.t, T.uebertakten.dur, 'the full window, not counted down in the cast tick');
});

test('offline: only the auto casts; manual casts never run while away; the effects are counted over the whole absence', () => {
  const run = (autoOn) => {
    const g = act2Game(9);
    startTrip(g, 6000);
    tripOf(g).dur = 6000;
    g.state.cur.blueprints.run = D(0);
    g.state.auto.auto_befehl.on = autoOn;
    g.state.spells.uebertakten.cd = 0;
    g.offlineNow = true;
    advance(g, 1800);
    g.offlineNow = false;
    return g;
  };
  const off = run(false);
  const on = run(true);
  assert.equal(off.state.spells.uebertakten.n + off.state.spells.tiefenscan.n, 0, 'nobody casts while away without the auto');
  assert.ok(on.state.spells.uebertakten.n >= 3, 'the auto casts again and again: ' + on.state.spells.uebertakten.n);
  assert.ok(on.state.spells.tiefenscan.n >= 1);
  const tripLeft = (g) => (tripOf(g) ? tripOf(g).left : 0);
  assert.ok(tripLeft(on) < tripLeft(off) - 600, 'a clearly shorter trip: ' + tripLeft(on) + ' vs ' + tripLeft(off));
});

test('map sector bonuses act AFTER the softcap: above it the full factor, ripening with the run time, labeled like the mutations', () => {
  const g = act2Game(0, { type: 'haufen' });
  setRun(g, { matter: 1e60, blueprints: 1e13, systems: 1e14 }); // far above the softcaps
  const none = g.prestigeGain('expansion');
  for (let k = 0; k < 4; k++) {
    const i = claimable(g).find((x) => canClaim(g, x).ok);
    claim(g, i);
    arrive(g);
  }
  ripe(g);
  g.mutRef = false;
  g.refresh();
  const factor = gainMult(g, 'systems');
  assert.ok(factor.gt(8), 'four Sternhaufen: ' + factor);
  const ratio = g.prestigeGain('expansion').div(none).toNumber();
  assert.ok(Math.abs(ratio / factor.toNumber() - 1) < 0.001, `full factor ${factor.toNumber()}, gain ratio ${ratio}`);
  assert.ok(g.prestigeMult('expansion').eq(1), 'not inside the formula before the softcap');
  assert.ok(postGain(g, 'systems').gte(factor.mul(0.999)));
  // ripening: a young run gets only part of it
  g.state.layers.expansion.runTime = T.mutRipe.systems / 2;
  g.refresh();
  assert.ok(Math.abs(mapGain(g, 'systems').toNumber() - (1 + (factor.toNumber() - 1) * 0.5)) < 1e-9);
  g.state.layers.expansion.runTime = 0;
  assert.ok(mapGain(g, 'systems').eq(1));
  // the valuation (Auto-Erkundung, Auto-Genom) sees the full factor
  assert.ok(Number.isFinite(repObjective(g)) && Number.isFinite(mapObjective(g)));
  const keep = g.mutRef;
  assert.equal(keep, false, 'the valuation restored the flag');
});
