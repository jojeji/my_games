// Myzel Paket 2: Fruchtkörper taming, fork B (Flechte | Fäulnis), Waldnetz, second branches, Hexenring + ending, Jahresringe, autos, respec.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMyzel } from '../games/myzel/logic.js';
import { TUNE as T } from '../games/myzel/tune.js';
import * as M from '../games/myzel/def.js';
import { nodeInfo } from '../games/myzel/nodes.js';
import { createRuntime } from '../engine/core.js';
import { D } from '../engine/decimal.js';
import { parse, stringify } from '../engine/save.js';

const H = 3600;
/** A game with fork A chosen and the first 4 Fruchtkörper behind it (fork B on offer). */
function atForkB(fa = 's') {
  const g = createMyzel();
  g.state.cur.h.total = D(T.forkOpenH);
  g.slowChecks();
  g.forkChoose('a', fa);
  g.state.layers[fa].units = 6;
  g.state.layers.f.count = T.forkBAt;
  g.state.cur.f.total = D(30);
  g.refresh();
  g.slowChecks();
  return g;
}
const withB = (fb = 'l', fa = 's') => {
  const g = atForkB(fa);
  assert.ok(g.forkChoose('b', fb));
  return g;
};
/** The branch layer has run long enough and the F earned since is `f`. */
const ripen = (g, id, f) => {
  g.state.layers[id].runTime = 100 * H;
  g.state.cur.f.total = g.state.myz.fAt[id].add(f);
  g.slowChecks();
};

test('Fruchtkörper gain: softcapped per run above fCapAt (Paket 1 values below it are unchanged), upgrades see compressed F above fEffAt', () => {
  const g = createMyzel();
  g.state.layers.f.runTime = 100 * H;
  g.state.layers.f.count = 3; // ripeF reached
  const gain = (raw) => {
    g.state.cur.h.total = D(raw * raw * T.fReq); // raw = sqrt(basis / fReq)
    return g.prestigeGain('f').toNumber();
  };
  assert.equal(gain(40), 40, 'a Paket-1 run is untouched');
  assert.equal(gain(T.fCapAt - 1), T.fCapAt - 1);
  const big = gain(T.fCapAt * 1000);
  const want = Math.floor(T.fCapAt * Math.pow(1000, T.fCapPow));
  assert.ok(Math.abs(big - want) <= 1, `${big} vs ${want}`);
  assert.ok(big < 0.1 * T.fCapAt * 1000);
  // the F upgrades: identical up to fEffAt, compressed above
  g.state.upg.f11 = 1;
  g.state.cur.f.total = D(T.fEffAt);
  g.refresh();
  assert.ok(Math.abs(g.upgEffect('f11') - Math.pow(1 + T.fEffAt, T.pF11)) < 1e-6);
  g.state.cur.f.total = D(T.fEffAt * 1e6);
  assert.ok(g.upgEffect('f11') < Math.pow(1 + T.fEffAt * 1e6, T.pF11) / 1e3, 'compressed');
});

test('fork B: offered from forkBAt Fruchtkörper, both branches in the tree, choice sticks, the other branch is closed until the Waldnetz opens it', () => {
  const g = createMyzel();
  assert.equal(g.forkOffered('b'), false);
  assert.equal(nodeInfo(g, 'l').kind, 'hidden');
  const f = atForkB();
  assert.equal(f.forkOffered('b'), true);
  assert.equal(nodeInfo(f, 'l').kind, 'choose');
  assert.equal(nodeInfo(f, 'z').kind, 'choose');
  assert.ok(f.forkChoose('b', 'z'));
  assert.equal(nodeInfo(f, 'z').kind, 'open');
  assert.equal(nodeInfo(f, 'l').kind, 'closed');
  assert.equal(f.canPrestige('l'), false);
  assert.ok(f.get('fa').toNumber() >= T.bStart, 'a seed for the first buyable');
  const g2 = createMyzel();
  g2.load(parse(stringify(f.state)));
  assert.equal(g2.forkChoice('b'), 'z');
});

test('Flechte: a time gate (the first run longer), gain from the Fruchtkörper earned since the choice, resets the rows below but keeps every upgrade', () => {
  const g = withB('l');
  g.state.upg.h11 = 1;
  g.state.upg.f11 = 1;
  g.state.cur.f.total = g.state.cur.f.total.add(5000);
  g.slowChecks();
  assert.equal(g.canPrestige('l'), false, 'the gate is closed');
  g.state.layers.l.runTime = T.lMin1 - 10;
  assert.equal(g.canPrestige('l'), false);
  g.state.layers.l.runTime = T.lMin1;
  assert.ok(g.canPrestige('l'));
  const gain = g.prestigeGain('l').toNumber();
  assert.equal(gain, Math.floor(Math.pow(5000 / T.lReq, T.lExp) * M.lGainMult(g)));
  g.grant('n', D(123));
  assert.ok(g.prestige('l'));
  assert.equal(g.get('n').toNumber(), 0);
  assert.equal(g.upgLevel('h11'), 1, 'Hyphen upgrades stay');
  assert.equal(g.upgLevel('f11'), 1, 'Fruchtkörper upgrades stay');
  assert.ok(g.get('l').toNumber() >= gain);
  assert.equal(g.state.layers.l.runTime, 0);
  // the next run is shorter (lMin) and counts only what was earned after this prestige
  assert.equal(M.bMinRun(g), T.lMin);
  assert.equal(g.prestigeGain('l').toNumber(), 0);
  g.slowChecks();
  assert.ok(g.state.layers.w.runTime === 0 && g.layerUnlocked('w'), 'the Waldnetz opens with the first run');
});

test('Alge and Licht: buyables with growing cost; Alge makes Flechten over time (also offline), the income feeds the gain of the Waldnetz', () => {
  const g = withB('l');
  g.grant('l', D(1e6));
  assert.equal(g.upgMax(g.upgById.l_alge) > 100, true);
  const c0 = g.upgCost('l_alge').toNumber();
  assert.ok(g.upgBuy('l_alge'));
  assert.ok(g.upgCost('l_alge').toNumber() > c0);
  for (let i = 0; i < 9; i++) g.upgBuy('l_alge');
  assert.equal(g.upgLevel('l_alge'), 10);
  const rate = M.lRate(g);
  assert.ok(Math.abs(rate - T.algeRate * 10) < 1e-12);
  g.upgBuy('l_licht');
  assert.ok(M.lRate(g) > rate);
  const l0 = g.get('l').toNumber();
  const rt = createRuntime(g, { now: () => 0 });
  rt.simulateOffline(2 * H);
  assert.ok(g.get('l').toNumber() - l0 > 0.9 * M.lRate(g) * 2 * H, 'full rate offline');
  assert.ok(g.state.cur.l.run.gt(0), 'income counts as earned (basis of the Waldnetz)');
  g.state.cur.l.run = D(0);
  assert.equal(g.prestigeBasis('w').toNumber(), g.state.cur.fa.run.toNumber());
});

test('Fäulnis: Zersetzen turns the stock into Humus (not spent, multiplies), the stock is gone, only with the z branch', () => {
  const g = withB('l');
  g.grant('f', D(500));
  assert.equal(M.humusGain(g), 0, 'not the z branch');
  const z = withB('z');
  z.grant('f', D(400));
  z.grant('s', D(100));
  const gain = M.humusGain(z);
  assert.equal(gain, Math.floor(Math.pow(400 + T.humusSw * 100, T.humusPow)));
  assert.equal(M.zersetzen(z), gain);
  assert.equal(z.get('f').toNumber(), 0);
  assert.equal(z.get('s').toNumber(), 0);
  assert.equal(z.get('hu').toNumber(), gain);
  assert.equal(M.zersetzen(z), 0);
  // Humus multiplies the Fruchtkörper gain and the Fäulnis lumps and is kept by a prestige of fork B
  assert.ok(M.fGainParts(z).some(([l, v]) => l === 'Humus' && v > 1));
  z.grant('hu', D(1e6));
  const zg = M.zGainMult(z);
  assert.ok(zg > 1);
  z.state.layers.z.runTime = 100 * H;
  z.state.cur.f.total = z.state.myz.fAt.z.add(9000);
  z.slowChecks();
  const h0 = z.get('hu');
  assert.ok(z.prestige('z'));
  assert.ok(z.get('hu').gte(h0), 'Humus stays through a row-4 prestige');
  // Totholz makes Fäulnis over time
  z.grant('fa', D(1e5));
  z.upgBuy('z_tot');
  assert.ok(M.faRate(z) > 0);
});

test('exclusive pairs of Flechte and Fäulnis: re-choosable after the next prestige of the layer; the ladder unfolds over runs and inside a run', () => {
  const g = withB('l');
  g.state.layers.l.count = 3;
  g.state.layers.l.runTime = 8 * H;
  g.grant('l', D(1e6));
  for (const id of ['l11', 'l21']) assert.ok(g.upgBuy(id), id);
  assert.equal(g.upgCanBuy('l22a'), true);
  assert.ok(g.upgBuy('l22a'));
  assert.equal(g.upgCanBuy('l22b'), false, 'the other side is locked');
  assert.equal(g.upgCanRechoose('l22a'), false);
  g.state.layers.l.count = 4;
  assert.equal(g.upgCanRechoose('l22a'), true);
  assert.ok(g.upgRechoose('l22a'));
  assert.ok(g.upgBuy('l22b'));
  // an upgrade that belongs to a later run is not buyable yet, and says why
  const late = withB('l');
  late.grant('l', D(1e6));
  late.upgBuy('l11');
  assert.equal(late.upgCanBuy('l13'), false);
  assert.match(late.upgById.l13.reqText(late), /Durchl/);
  assert.equal(late.upgCanBuy('l12'), false, 'inside the run: after 1,5 hours of the first run it needs one finished run');
});

test('Waldnetz: opens with the first Flechte/Fäulnis, own time gate, gain from what the fork-B layers earned, trees are buyables with their own effect', () => {
  const g = withB('l');
  ripen(g, 'l', 9000);
  assert.ok(g.prestige('l'));
  g.slowChecks();
  assert.equal(g.layerUnlocked('w'), true);
  assert.equal(nodeInfo(g, 'w').kind, 'open');
  assert.equal(g.canPrestige('w'), false, 'time gate');
  g.state.cur.l.run = D(2000);
  g.state.layers.w.runTime = T.wMin1 - 1;
  assert.equal(g.canPrestige('w'), false);
  g.state.layers.w.runTime = T.wMin1;
  assert.ok(g.canPrestige('w'));
  const gain = g.prestigeGain('w').toNumber();
  assert.equal(gain, Math.floor(Math.pow(2000 / T.wReq, T.wExp) * M.wGainMult(g)));
  g.grant('l', D(500));
  g.upgrades = null;
  assert.ok(g.prestige('w'));
  assert.equal(g.get('l').toNumber(), 0, 'the layers below are reset');
  assert.ok(g.get('w').toNumber() >= gain);
  // trees: each one does something different
  g.grant('w', D(1e6));
  const f0 = M.fGainMult(g);
  assert.ok(g.upgBuy('t_eiche'));
  assert.ok(M.fGainMult(g) > f0, 'Eiche: Fruchtkörper');
  const gate = M.wMinRun(g);
  for (let i = 0; i < 4; i++) g.upgBuy('t_kiefer');
  assert.ok(M.wMinRun(g) < gate, 'Kiefer: shorter gates');
  const w0 = M.wGainMult(g);
  assert.ok(g.upgBuy('t_birke'));
  assert.ok(M.wGainMult(g) > w0, 'Birke: Waldfäden');
  assert.ok(g.upgBuy('t_buche'));
  assert.ok(M.lGainMult(g) > 1.1, 'Buche: Flechten');
  assert.equal(g.upgCanBuy('t_esche'), false, 'Esche appears with the 2nd Waldnetz');
  assert.ok(g.upgMax(g.upgById.t_kiefer) === T.kieferMax);
});

test('Waldnetz milestones open the SECOND branch of both forks: both branches work, Sporen and Mykorrhiza strengthen each other', () => {
  const g = withB('l', 's');
  assert.equal(nodeInfo(g, 'm').kind, 'closed');
  assert.equal(g.forkSecondOpen('a'), false);
  g.state.layers.w.count = T.wA2;
  g.slowChecks();
  assert.ok(g.hasMs('w_a2'));
  assert.equal(g.forkSecondOpen('a'), true);
  assert.equal(nodeInfo(g, 'm').kind, 'open');
  g.state.layers.m.unlocked = true;
  g.state.layers.m.units = 4;
  g.state.layers.s.units = 4;
  g.state.cur.z.run = D(1000);
  g.refresh();
  assert.ok(M.fGainParts(g).some(([l]) => l === 'Sporen + Mykorrhiza'));
  assert.ok(M.nParts(g).some(([l]) => l === 'Sporen') && M.nParts(g).some(([l]) => l === 'Zucker'), 'both branches act');
  // fork B
  assert.equal(nodeInfo(g, 'z').kind, 'closed');
  g.state.layers.w.count = T.wB2;
  g.slowChecks();
  assert.equal(g.forkSecondOpen('b'), true);
  assert.equal(nodeInfo(g, 'z').kind, 'open');
  g.state.layers.z.runTime = 100 * H;
  g.state.cur.f.total = g.state.cur.f.total.add(8000);
  g.grant('f', D(300));
  assert.ok(M.humusGain(g) >= 1, 'Zersetzen works once the z branch is open');
  g.state.cur.l.run = D(1000);
  g.state.cur.fa.run = D(1000);
  const both = M.wGainParts(g).find(([l]) => l === 'Flechte + Fäulnis');
  assert.ok(both && both[1] === T.synB);
});

test('Hexenring: static, needs Waldfäden AND n + ringW Waldnetze, does not reset anything, the 5th ring ends the game once, rings go on (Nachspiel)', () => {
  const g = withB('l');
  g.state.layers.w.unlocked = true;
  g.state.layers.w.count = 1;
  g.slowChecks();
  assert.equal(g.layerUnlocked('r'), true);
  g.grant('w', D(1e9));
  g.state.cur.w.total = D(1e9);
  assert.equal(g.canPrestige('r'), false, 'not enough Waldnetze');
  let ends = 0;
  g.out = (type) => type === 'ending' && ends++;
  const keep = g.get('w');
  const nBefore = (g.add('n', D(777)), g.get('n'));
  for (let k = 0; k < T.rings + 2; k++) {
    g.state.layers.w.count = k + T.ringW;
    assert.ok(g.canPrestige('r'), 'ring ' + (k + 1));
    assert.equal(g.prestigeGain('r').toNumber(), 1, 'one ring per press');
    assert.ok(g.prestige('r'));
    if (k < T.rings - 1) assert.equal(M.ended(g), false);
  }
  assert.equal(g.state.layers.r.units, T.rings + 2);
  assert.equal(M.ended(g), true);
  assert.equal(ends, 1, 'the ending is reached once');
  assert.equal(g.get('w').toString(), keep.toString(), 'the Waldfäden are not spent');
  assert.equal(g.get('n').toString(), nBefore.toString(), 'nothing below was reset');
  // cost grows, Tanne and the ring bonus work
  const c3 = M.ringCost(3, g);
  g.grant('w', D(1e9));
  g.upgBuy('t_tanne');
  assert.ok(M.ringCost(3, g) < c3);
  assert.ok(M.fGainParts(g).some(([l]) => l === 'Hexenringe'));
  // the ending survives a save
  const g2 = createMyzel();
  g2.load(parse(stringify(g.state)));
  assert.equal(M.ended(g2), true);
});

test('Jahresringe: one every jrEvery of play time after fork B, offline or online alike, each worth a little', () => {
  const a = withB('l');
  const b = withB('l');
  assert.ok(a.state.myz.jrAt > 0);
  let events = 0;
  a.out = (t) => t === 'jahresring' && events++;
  for (let t = 0; t < 10 * H; t += 5) a.tick(5);
  const rt = createRuntime(b, { now: () => 0 });
  rt.simulateOffline(3 * H);
  rt.simulateOffline(3 * H);
  rt.simulateOffline(3 * H);
  rt.simulateOffline(1 * H);
  assert.equal(a.state.myz.jr, 4);
  assert.equal(b.state.myz.jr, 4);
  assert.equal(events, 4);
  assert.ok(M.jrMul(a) > 1.03);
  assert.ok(M.fGainParts(a).some(([l]) => l === 'Jahresringe'));
});

test('autos of the deep layers: unlocked by the milestones, start off, announced once, and do what the player does by hand', () => {
  const g = withB('l');
  const ids = ['auto_f', 'auto_l', 'auto_bbuy', 'auto_wbuy', 'auto_w'];
  for (const id of ids) assert.equal(g.autoUnlocked(id), false);
  ripen(g, 'l', 9000);
  g.prestige('l');
  g.slowChecks();
  assert.equal(g.autoUnlocked('auto_f'), true);
  assert.equal(g.state.auto.auto_f.on, false, 'start off');
  const seen = [];
  g.state.auto.auto_f.seen = false;
  g.out = (t, p) => t === 'auto-unlocked' && seen.push(p.id);
  g.slowChecks();
  assert.deepEqual(seen, ['auto_f']);
  g.slowChecks();
  assert.equal(seen.length, 1, 'announced once');
  // auto Flechte prestiges at the gate
  g.state.layers.l.count = 2;
  g.slowChecks();
  assert.equal(g.autoUnlocked('auto_l'), true);
  g.state.auto.auto_l.on = true;
  g.state.layers.l.runTime = 100 * H;
  g.state.cur.f.total = g.state.myz.fAt.l.add(9000);
  g.tick(6);
  assert.equal(g.state.layers.l.count, 3);
  // auto Zersetzen
  const z = withB('z');
  z.state.layers.z.count = 3;
  z.slowChecks();
  assert.equal(z.autoUnlocked('auto_zers'), true);
  z.state.auto.auto_zers.on = true;
  z.grant('f', D(900));
  z.tick(25);
  assert.ok(z.get('hu').toNumber() >= 1);
});

test('respec of fork B: the branch layer, its upgrades and buyables, Humus and the rows above are wiped, fork B is offered again, fork A stays', () => {
  const g = withB('z');
  g.grant('fa', D(1e5));
  g.upgBuy('z_tot');
  g.upgBuy('z11');
  g.grant('f', D(400));
  M.zersetzen(g);
  g.state.layers.z.count = 3;
  g.slowChecks();
  assert.ok(g.hasMs('z_m3'));
  assert.ok(g.forkRespec('b'));
  assert.equal(g.forkChoice('b'), null);
  assert.equal(g.forkChoice('a'), 's');
  assert.equal(g.upgLevel('z_tot'), 0);
  assert.equal(g.upgLevel('z11'), 0);
  assert.equal(g.get('hu').toNumber(), 0);
  assert.equal(g.get('fa').toNumber(), 0);
  assert.equal(g.hasMs('z_m3'), false);
  assert.equal(g.state.layers.z.count, 0);
  assert.equal(g.forkOffered('b'), true);
  assert.ok(g.forkChoose('b', 'l'));
});

test('the autobuyer sees every effect of the deep layers: no upgrade has the benefit 0 (it would only be bought last)', () => {
  const g = withB('z');
  g.state.layers.z.count = 9;
  g.state.layers.w.count = 6;
  g.state.layers.w.unlocked = true;
  g.state.myz.jr = 3;
  g.state.layers.m.units = 3;
  g.state.upg.z_tot = 3; // an effect on the income needs an income
  g.state.layers.r.units = 2; // an effect on the rings needs rings
  g.refresh();
  const dead = [];
  for (const id of Object.keys(g.upgById).filter((i) => /^(l|z|w|t)/.test(i))) {
    const u = g.upgById[id];
    if (u.node === 'l' && !g.forkIs('b', 'l')) continue; // the other branch of fork B is closed
    if (!(g.upgBenefit(id, M.objective) > 0)) dead.push(id);
  }
  assert.deepEqual(dead, []);
  // and with the l branch
  const l = withB('l');
  l.state.upg.l_alge = 3;
  l.state.layers.l.count = 9;
  l.refresh();
  const dead2 = [];
  for (const id of ['l_alge', 'l_licht', 'l11', 'l12', 'l13', 'l14', 'l21', 'l22a', 'l22b', 'l23', 'l31', 'l32', 'l33', 'l34']) if (!(l.upgBenefit(id, M.objective) > 0)) dead2.push(id);
  assert.deepEqual(dead2, []);
  // buyNode really buys: the cheap useful ones first, many levels with plenty of currency
  g.grant('fa', D(1e9));
  g.state.layers.z.runTime = 100 * H;
  assert.ok(M.buyNode(g, 'z') > 20);
});
