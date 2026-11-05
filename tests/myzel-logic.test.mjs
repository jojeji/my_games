// Myzel game logic (DOM-free): layers, upgrades, fork + respec, Regenschauer, challenges, fixed offline cap, save format.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMyzel, def } from '../games/myzel/logic.js';
import { TUNE as T } from '../games/myzel/tune.js';
import { rainCast, rainCharges, rainFactor, nRate, nParts, sMult, buyNode, ripeness, zRate } from '../games/myzel/def.js';
import { nodeInfo, hasBuyable } from '../games/myzel/nodes.js';
import { createRuntime, advance } from '../engine/core.js';
import { D } from '../engine/decimal.js';
import { parse, stringify } from '../engine/save.js';
import { offlineSettingVisible } from '../engine/ui/settings.js';

const fresh = () => createMyzel();
/** A game with `n` Nährstoffe in hand and all the unlock checks run. */
const rich = (n = 1e6) => {
  const g = fresh();
  g.add('n', D(n));
  g.slowChecks();
  return g;
};
const run = (g, secs, step = 1) => {
  for (let t = 0; t < secs; t += step) g.tick(step);
};
/** Gets a game to the point that the fork is on offer (Hyphen earned >= T.forkOpenH). */
const forkReady = () => {
  const g = fresh();
  g.state.cur.h.total = D(T.forkOpenH);
  g.slowChecks();
  return g;
};

test('fresh game: 1 Nährstoff per second, no Hyphen possible at first, first Hyphen after about two minutes of play', () => {
  const g = fresh();
  assert.equal(g.incomePerSec('n').toNumber(), T.nBase);
  assert.equal(g.canPrestige('h'), false);
  let t = 0;
  while (!g.canPrestige('h') && t < 600) {
    g.tick(1);
    t++;
  }
  assert.ok(t <= 150, 'first Hyphen after ' + t + ' s');
  assert.ok(t >= 40, 'not instantly: ' + t);
  assert.equal(g.prestigeGain('h').toNumber() >= 1, true);
});

test('Hyphen: reife (ripeness) makes the gain of short runs small, full gain from ripeSecs on', () => {
  const g = rich(1e6);
  g.state.layers.h.runTime = 5;
  const early = g.prestigeGain('h').toNumber();
  g.state.layers.h.runTime = T.ripeSecs;
  const full = g.prestigeGain('h').toNumber();
  assert.ok(early < 0.05 * full, `${early} vs ${full}`);
  assert.equal(ripeness(g), 1);
  g.state.layers.h.runTime = 10 * T.ripeSecs;
  assert.equal(g.prestigeGain('h').toNumber(), full); // no bonus for waiting longer than ripe
});

test('Hyphen prestige: gives Hyphen, resets Nährstoffe, keeps upgrades; formula upgrades show their value', () => {
  const g = rich(1e6);
  g.state.layers.h.runTime = T.ripeSecs;
  const gain = g.prestigeGain('h');
  assert.ok(g.prestige('h'));
  assert.equal(g.get('h').toString(), gain.toString());
  assert.equal(g.get('n').toNumber(), 0);
  g.grant('h', D(1e9));
  assert.ok(g.upgBuy('h11'));
  const base = nRate(g);
  g.grant('h', D(1e9));
  assert.ok(g.upgBuy('h21'));
  assert.ok(Math.abs(nRate(g) / base - 3) < 1e-9, 'h21 triples N');
  g.state.cur.h.run = D(99);
  assert.ok(Math.abs(g.upgEffect('h12') - 1) < 1e-12); // not bought: level 0 = neutral
  g.grant('h', D(1e9));
  g.upgBuy('h12');
  assert.ok(Math.abs(g.upgEffect('h12') - Math.pow(100, T.pH12)) < 1e-9);
});

test('exclusive upgrade pair in the Hyphen grid: one side locks the other, a prestige of the layer lets you choose again', () => {
  const g = rich(1e6);
  g.grant('h', D(1e6));
  for (const id of ['h11', 'h21']) assert.ok(g.upgBuy(id));
  assert.ok(g.upgBuy('h31a'));
  assert.equal(g.upgCanBuy('h31b'), false);
  assert.equal(g.upgCanRechoose('h31a'), false);
  g.state.layers.h.runTime = T.ripeSecs;
  g.state.cur.n.run = D(1e6);
  assert.ok(g.prestige('h'));
  assert.equal(g.upgCanRechoose('h31a'), true);
  assert.ok(g.upgRechoose('h31a'));
  assert.ok(g.upgBuy('h31b'));
});

test('fork A: not before forkOpenH, then offered; choosing opens the branch layer, the other one stays closed; the choice sticks across saves', () => {
  const g = fresh();
  assert.equal(g.forkOffered('a'), false);
  assert.equal(nodeInfo(g, 's').kind, 'hidden');
  const f = forkReady();
  assert.equal(f.forkOffered('a'), true);
  assert.equal(nodeInfo(f, 's').kind, 'choose');
  assert.equal(nodeInfo(f, 'm').kind, 'choose');
  assert.ok(f.forkChoose('a', 'm'));
  assert.equal(nodeInfo(f, 'm').kind, 'open');
  assert.equal(nodeInfo(f, 's').kind, 'closed');
  assert.equal(f.canPrestige('s'), false);
  const g2 = fresh();
  g2.load(parse(stringify(f.state)));
  assert.equal(g2.forkChoice('a'), 'm');
});

test('Sporen: static layer in Nährstoffe (total since the last reset), multiplier (1 + a*S)^pow, the milestones keep Hyphen upgrades from the NEXT reset on', () => {
  const g = forkReady();
  g.forkChoose('a', 's');
  assert.equal(g.prestigeGain('s').toNumber(), 0);
  g.state.cur.n.total = D(T.sBase * 1.01);
  g.slowChecks();
  assert.equal(g.prestigeGain('s').toNumber(), 1);
  g.grant('h', D(1e9));
  assert.ok(g.upgBuy('h11'));
  assert.ok(g.prestige('s'));
  g.slowChecks();
  assert.equal(g.state.layers.s.units, 1);
  assert.equal(g.upgLevel('h11'), 0, 'the first reset wipes everything: the milestone is earned by it');
  assert.ok(g.hasMs('s_keep1'));
  assert.equal(g.get('h').toNumber(), 0); // Hyphen reset
  assert.equal(g.get('n').toNumber(), 0);
  assert.ok(Math.abs(sMult(g) - Math.pow(1 + T.sA, T.sPow)) < 1e-9);
  assert.ok(nParts(g).some(([l]) => l === 'Sporen'));
  // the cost basis restarted: the second Spore needs more than the first
  assert.ok(g.staticCost('s', 1).gt(g.staticCost('s', 0).mul(1.5)));
  assert.equal(g.prestigeGain('s').toNumber(), 0);
  // second Spore: row 1 of the Hyphen grid survives, row 2 does not
  g.grant('h', D(1e9));
  for (const id of ['h11', 'h12', 'h13', 'h21']) assert.ok(g.upgBuy(id), id);
  g.state.cur.n.total = g.state.cur.n.total.add(g.staticCost('s', 1).mul(1.01));
  g.slowChecks();
  assert.ok(g.prestige('s'));
  assert.equal(g.state.layers.s.units, 2);
  assert.equal(g.upgLevel('h11'), 1);
  assert.equal(g.upgLevel('h12'), 1);
  assert.equal(g.upgLevel('h13'), 1);
  assert.equal(g.upgLevel('h21'), 0, 'row 2 is wiped before s_keep2');
});

test('Mykorrhiza: units make Zucker over time (also offline), Zucker boosts N and is spent on its own upgrades; H resets do not touch it', () => {
  const g = forkReady();
  g.forkChoose('a', 'm');
  g.state.layers.m.units = 3;
  g.state.cur.m.amount = D(3);
  g.refresh();
  assert.ok(zRate(g) > 0);
  const n0 = nRate(g);
  run(g, 600, 5);
  const z = g.state.cur.z.amount.toNumber();
  assert.ok(z > 0, 'Zucker grows');
  assert.ok(nRate(g) > n0, 'Zucker raises N');
  // a Hyphen prestige leaves Zucker alone
  g.add('n', D(1e7));
  g.slowChecks();
  g.state.layers.h.runTime = T.ripeSecs;
  assert.ok(g.prestige('h'));
  assert.ok(g.state.cur.z.amount.toNumber() >= z * 0.99);
  // Zucker is the currency of the m upgrades
  g.grant('z', D(1e9));
  const zBefore = g.state.cur.z.amount;
  assert.ok(g.upgBuy('m11'));
  assert.ok(g.state.cur.z.amount.lt(zBefore));
  assert.equal(g.upgCanBuy('s11'), false); // the other branch's upgrade is not on offer
  // offline: Zucker keeps growing at full rate
  const rt = createRuntime(g, { now: () => 0 });
  const before = g.state.cur.z.amount.toNumber();
  rt.simulateOffline(3600);
  assert.ok(g.state.cur.z.amount.toNumber() > before);
});

test('Respec of fork A: branch layer, upgrades, milestones, Zucker and the rows above are wiped, the choice is offered again', () => {
  const g = forkReady();
  g.forkChoose('a', 's');
  g.state.layers.s.units = 4;
  g.state.cur.s.amount = D(4);
  g.slowChecks();
  g.upgBuy('s11');
  g.grant('h', D(500));
  g.add('n', D(1234));
  assert.ok(g.hasMs('s_keep2'));
  assert.ok(g.forkRespec('a'));
  assert.equal(g.forkChoice('a'), null);
  assert.equal(g.state.layers.s.units, 0);
  assert.equal(g.get('s').toNumber(), 0);
  assert.equal(g.hasMs('s_keep2'), false);
  assert.equal(g.upgLevel('s11'), 0);
  assert.equal(g.get('n').toNumber(), 0);
  assert.equal(g.get('h').toNumber(), 0);
  assert.equal(g.forkOffered('a'), true);
  assert.ok(g.forkChoose('a', 'm')); // the other one can be taken now
});

test('Fruchtkörper: needs units of the chosen branch, resets the branch but keeps the Hyphen upgrades, opens the challenges; the branch upgrades stay from 4 on', () => {
  const g = forkReady();
  g.forkChoose('a', 's');
  g.state.cur.h.total = D(T.fReq * 50);
  g.slowChecks();
  assert.equal(g.canPrestige('f'), false, 'needs ' + T.fUnitsS + ' Sporen');
  assert.equal(nodeInfo(g, 'f').kind, 'hidden');
  g.state.layers.s.units = T.fUnitsS;
  g.state.cur.s.amount = D(T.fUnitsS);
  g.state.layers.f.runTime = T.ripeF1; // ripe
  g.slowChecks();
  assert.equal(g.canPrestige('f'), true);
  assert.equal(g.chAvailable('durre'), false); // challenges open with the first Fruchtkörper
  g.grant('h', D(1e9));
  g.upgBuy('h11');
  g.upgBuy('h21');
  g.grant('s', D(10));
  g.upgBuy('s11');
  assert.equal(g.upgLevel('s11'), 1);
  assert.ok(g.prestige('f'));
  g.slowChecks();
  assert.equal(g.state.layers.s.units, 0);
  assert.equal(g.get('h').toNumber(), 0);
  assert.equal(g.upgLevel('s11'), 0, 'branch upgrades are wiped at first');
  assert.equal(g.upgLevel('h11'), 1, 'the Hyphen upgrades stay');
  assert.equal(g.upgLevel('h21'), 1);
  assert.ok(g.hasMs('f_buy'));
  assert.ok(g.chAvailable('durre'));
  assert.equal(g.chAvailable('frost'), false, 'Frost needs Dürre');
  assert.equal(g.prestigeGain('f').toNumber(), 0); // the Fruchtkörper basis restarted
  // from the 4th Fruchtkörper on the branch upgrades survive
  g.state.layers.f.count = 4;
  g.slowChecks();
  assert.ok(g.hasMs('f_keepb'));
  g.state.layers.s.units = T.fUnitsS;
  g.state.cur.h.total = g.state.cur.h.total.add(T.fReq * 5000);
  g.state.layers.f.runTime = T.ripeF;
  g.grant('s', D(10));
  g.upgBuy('s11');
  g.slowChecks();
  assert.ok(g.prestige('f'));
  assert.equal(g.upgLevel('s11'), 1);
});

test('challenges: Dürre roots the core production but not the branch, Frost freezes H upgrades, Kahlschlag switches the fork layers off', () => {
  const g = forkReady();
  g.forkChoose('a', 's');
  g.state.layers.f.count = 1;
  g.slowChecks();
  g.state.layers.s.units = 3;
  g.grant('h', D(1e9));
  g.upgBuy('h11');
  g.upgBuy('h21');
  g.state.cur.h.run = D(1e6);
  g.refresh();
  const normal = nRate(g);
  assert.ok(g.chEnter('durre'));
  g.state.layers.s.units = 3;
  g.state.cur.h.run = D(1e6);
  g.upgBuy('h11') || (g.state.upg.h11 = 1);
  g.upgBuy('h21') || (g.state.upg.h21 = 1);
  g.refresh();
  const dry = nRate(g);
  assert.ok(dry < normal, 'Dürre slows the core');
  assert.ok(nParts(g).some(([l]) => l === 'Sporen'), 'the Spores keep working');
  g.chExit();
  g.state.challenge.done.durre = 1;
  assert.ok(g.chEnter('frost'));
  g.state.upg.h11 = 1;
  g.refresh();
  assert.equal(g.upgEffect('h11'), 1, 'frozen upgrade acts like level 0');
  g.chExit();
  g.state.challenge.done.frost = 1;
  assert.ok(g.chEnter('kahl'));
  g.state.layers.s.units = 3;
  g.refresh();
  assert.equal(g.canPrestige('s'), false);
  assert.ok(!nParts(g).some(([l]) => l === 'Sporen'), 'Spores rest');
  g.chExit();
});

test('challenge goal: Hyphen earned since the start of the challenge run; reward stays, challenge ends', () => {
  const g = forkReady();
  g.forkChoose('a', 's');
  g.state.layers.f.count = 1;
  assert.ok(g.chEnter('durre'));
  const goal = g.chGoal(g.chDef('durre'));
  assert.equal(g.chValue(g.chDef('durre')).toNumber(), 0);
  g.state.cur.h.total = g.state.cur.h.total.add(goal.sub(1));
  assert.equal(g.chCheckGoal(), false);
  g.state.cur.h.total = g.state.cur.h.total.add(2);
  assert.equal(g.chCheckGoal(), true);
  assert.equal(g.chDone('durre'), true);
  assert.equal(g.chActive(), null);
  assert.ok(nParts(g).some(([l]) => /Dürre/.test(l)), 'reward counts');
});

test('Regenschauer: starts with a charge, +1 per 45 min of play (online and offline), at most 3, a tap adds 3 min of x boost, never automatic', () => {
  const g = fresh();
  assert.equal(rainCharges(g), T.rainStart);
  assert.equal(rainCast(g), true);
  assert.equal(rainCharges(g), T.rainStart - 1);
  assert.equal(g.state.myz.rain.t, T.rainSecs);
  assert.ok(rainFactor(g, 0) === T.rainMult);
  assert.equal(rainCast(g), false, 'no charge left');
  run(g, T.rainEvery - 5, 5);
  assert.equal(rainCharges(g), 0);
  run(g, 10, 5);
  assert.equal(rainCharges(g), 1);
  const rt = createRuntime(g, { now: () => 0 });
  rt.simulateOffline(3 * 3600);
  assert.equal(rainCharges(g), T.rainMax, 'caps at ' + T.rainMax);
  // a second cast while it rains adds the time
  assert.ok(rainCast(g));
  g.state.myz.rain.t = 100;
  assert.ok(rainCast(g));
  assert.equal(g.state.myz.rain.t, 100 + T.rainSecs);
  // no auto-cast: nothing in the autos casts it
  assert.ok(!def.autos.some((a) => /rain|regen/i.test(a.id)));
});

test('Regenschauer: the boost counts time-weighted, one big offline step == many small steps; N and Zucker both grow faster', () => {
  const make = () => {
    const g = fresh();
    g.state.cur.h.run = D(1000);
    g.refresh();
    return g;
  };
  const a = make();
  const b = make();
  const c = make();
  rainCast(a);
  rainCast(b);
  run(a, 600, 0.5);
  run(b, 600, 150); // 150 s steps
  run(c, 600, 0.5);
  const base = c.get('n').toNumber();
  const ex = base + (T.rainMult - 1) * T.rainSecs * c.incomePerSec('n').toNumber();
  assert.ok(Math.abs(a.get('n').toNumber() - ex) / ex < 0.01, `small steps ${a.get('n')} vs ${ex}`);
  assert.ok(Math.abs(b.get('n').toNumber() - ex) / ex < 0.02, `big steps ${b.get('n')} vs ${ex}`);
  assert.ok(a.get('n').toNumber() > base * 1.05);
});

test('fixed offline cap: always 3 h, no setting or upgrade changes it; the summary says how long away and how long grown', () => {
  const g = fresh();
  assert.equal(def.offlineCapSeconds, 10800);
  assert.equal(g.offlineCapSeconds(), 10800);
  g.state.settings.offlineCapHours = 72;
  assert.equal(g.offlineCapSeconds(), 10800);
  assert.equal(offlineSettingVisible(g), false);
  const rt = createRuntime(g, { now: () => 0 });
  const sum = rt.simulateOffline(7 * 3600);
  assert.equal(sum.realSeconds, 7 * 3600);
  assert.equal(sum.seconds, 3 * 3600);
  assert.equal(sum.capped, true);
  assert.ok(Math.abs(g.state.time.offline - 10800) < 1e-6);
  const short = rt.simulateOffline(1800);
  assert.equal(short.capped, false);
  assert.ok(!def.upgrades.some((u) => /offline/i.test(u.name + u.desc)), 'no upgrade raises the cap');
});

test('autos: start off, announced when the milestone opens them, auto-buy and auto-Hyphen do what the player does by hand', () => {
  const g = fresh();
  const seen = [];
  g.out = (t, p) => t === 'auto-unlocked' && seen.push(p.id);
  assert.equal(g.autoUnlocked('auto_hbuy'), false);
  g.state.layers.f.count = 3;
  g.slowChecks();
  assert.deepEqual(seen.sort(), ['auto_h', 'auto_hbuy']);
  assert.equal(g.state.auto.auto_h.on, false);
  assert.equal(g.state.auto.auto_hbuy.on, false);
  assert.equal(g.autoActive('auto_h'), false);
  // switched on: Hyphen are claimed on a timer and spent on upgrades
  g.state.auto.auto_h.on = true;
  g.state.auto.auto_hbuy.on = true;
  g.state.settings.autosave = 0;
  g.add('n', D(1e5));
  run(g, T.autoHTime * 3, 1);
  assert.ok(g.state.layers.h.count >= 2, 'auto-Hyphen ran');
  assert.ok(g.upgLevel('h11') === 1, 'auto-buy bought the first upgrade');
});

test('save: version 1, export/import roundtrip, short export, missing keys are filled (migration-ready)', () => {
  const g = rich(1e6);
  g.state.layers.h.runTime = T.ripeSecs;
  g.prestige('h');
  g.upgBuy('h11');
  assert.equal(def.version, 1);
  assert.equal(g.version, 1);
  const rt = createRuntime(g, { now: () => 1000 });
  rt.save();
  const text = rt.exportString();
  const short = rt.exportString({ short: true });
  assert.ok(short.length < text.length, 'the short export omits the play-test log');
  for (const s of [text, short]) {
    const g2 = createMyzel();
    const rt2 = createRuntime(g2, { now: () => 1000 });
    rt2.importString(s);
    assert.equal(g2.upgLevel('h11'), 1);
    assert.equal(g2.state.layers.h.count, 1);
    assert.equal(g2.state.myz.rain.charges >= 0, true);
  }
  // a save from "before" a key existed: the defaults come in
  const old = parse(stringify(g.state));
  delete old.myz.rain;
  delete old.fork;
  const g3 = createMyzel();
  g3.load(old);
  assert.equal(g3.state.myz.rain.charges, T.rainStart);
  assert.equal(g3.forkChoice('a'), null);
  assert.equal(g3.upgLevel('h11'), 1);
});

test('tree view model: nodes open one after another, dot = something buyable, glow = prestige possible, teasers stay silhouettes', () => {
  const g = fresh();
  assert.equal(nodeInfo(g, 'n').kind, 'open');
  assert.equal(nodeInfo(g, 'h').kind, 'hidden');
  for (const id of ['l', 'z', 'w', 'r']) assert.equal(nodeInfo(g, id).kind, 'teaser');
  g.add('n', D(1e4));
  g.slowChecks();
  assert.equal(nodeInfo(g, 'h').kind, 'open');
  g.state.layers.h.runTime = T.ripeSecs;
  assert.equal(nodeInfo(g, 'h').glow, true);
  g.grant('h', D(5));
  assert.equal(hasBuyable(g, 'h'), true);
  assert.equal(nodeInfo(g, 'h').dot, true);
  assert.equal(nodeInfo(g, 'f').kind, 'hidden');
});

test('the in-game buy function is the one the sim calls (buyNode = upgBuyBest with the shared objective)', () => {
  const g = rich(1e6);
  g.grant('h', D(30));
  const n = buyNode(g, 'h');
  assert.ok(n >= 1);
  assert.equal(g.upgLevel('h11'), 1);
  advance(g, 1);
});
