// Myzel - das Netz unter dem Wald: game definition (data + hooks). Pure and DOM-free (runs in Node for tests/sim).
// Paket 1: layers n (Nährstoffe), h (Hyphen), s | m (Gabel A: Sporen | Mykorrhiza), f (Fruchtkörper + Challenges), Regenschauer.
// Paket 2: Gabel B l (Flechte) | z (Fäulnis), w (Waldnetz), r (Hexenring, Ende + Nachspiel), zweite Äste beider Gabeln.
import { D, ONE, ZERO } from '../../engine/decimal.js';
import { prestigeAuto } from '../../engine/kit/game.js';
import { formatNumber, formatDuration } from '../../engine/format.js';
import { TUNE as T } from './tune.js';

const has = (g, id) => g.upgLevel(id) > 0;
const fe = (v) => '×' + formatNumber(v);
const sq = Math.sqrt;
const c = (x) => String(+Number(x).toFixed(4)).replace('.', ','); // number for a German text (no float noise)

/* ------------------------------------------------------------------ */
/* small state readers                                                  */
/* ------------------------------------------------------------------ */

const Hr = (g) => g.state.cur.h.run.toNumber(); // Hyphen earned since the last reset of row 2 (spending does not lower it)
const Nrun = (g) => g.state.cur.n.run.toNumber();
/** Fruchtkörper earned (never lowered by buying), as the upgrades see it: identical up to fEffAt (all of Paket 1), compressed above, so that the loop F -> N -> Hyphen -> F cannot explode. */
const Ft = (g) => {
  const t = g.state.cur.f.total.toNumber();
  return t <= T.fEffAt ? t : T.fEffAt * Math.pow(t / T.fEffAt, T.fEffPow);
};
const units = (g, id) => g.state.layers[id].units;
const hCount = (g) => g.state.layers.h.count;
const branchOn = (g) => !g.rule('noFork', false); // Kahlschlag switches the fork layers off
const chDone = (g, id) => g.chDone(id);
const ms = (g, id) => g.hasMs(id);

/** Which fork-A branches act (the chosen one; later also the other). */
const spOn = (g) => branchOn(g) && g.forkIs('a', 's');
const myOn = (g) => branchOn(g) && g.forkIs('a', 'm');
/** Fork B (row 4): Flechte | Fäulnis. */
const lOn = (g) => g.forkIs('b', 'l');
const zOn = (g) => g.forkIs('b', 'z');
const lv = (g, id) => g.upgLevel(id);
const cnt = (g, id) => g.state.layers[id].count;
const rings = (g) => g.state.layers.r.units;

/* ------------------------------------------------------------------ */
/* Regenschauer                                                         */
/* ------------------------------------------------------------------ */

export const RAIN_MS = [10, 25, 45, 70, 100]; // showers cast: each one makes every shower stronger (+1)
export const rainMult = (g) => (ms(g, 'f_wolke') ? T.rainMult2 : T.rainMult) + RAIN_MS.filter((n) => ms(g, 'rain_' + n)).length;
/** Share of the next `dt` seconds a shower is active (dt 0: momentary 0/1). Time-weighted for the large steps of the offline catch-up. */
export function rainFrac(g, dt) {
  const t = g.state.myz.rain.t;
  if (t <= 0) return 0;
  return dt > 0 ? Math.min(t, dt) / dt : 1;
}
export const rainFactor = (g, dt = 0) => 1 + (rainMult(g) - 1) * rainFrac(g, dt);
export const rainCharges = (g) => Math.floor(g.state.myz.rain.charges + 1e-9);
export function rainCast(g) {
  const r = g.state.myz.rain;
  if (r.charges < 1 - 1e-9) return false;
  r.charges = Math.max(0, r.charges - 1);
  r.t += T.rainSecs;
  r.n += 1;
  g.emit('rain', { n: r.n });
  return true;
}
/** Seconds until the next charge (0 when full). */
export function rainNextIn(g) {
  const r = g.state.myz.rain;
  if (r.charges >= T.rainMax) return 0;
  return (1 - (r.charges - Math.floor(r.charges))) * T.rainEvery;
}

/* ------------------------------------------------------------------ */
/* production                                                           */
/* ------------------------------------------------------------------ */

// o = level overrides for the "Dann ..." preview of an unbought upgrade
const sA = (g, o = {}) => (T.sA + 0.3 * (o.s12 ?? has(g, 's12')) + 0.4 * (o.s22a ?? has(g, 's22a'))) * (has(g, 'f13') ? 1.15 : 1) * (chDone(g, 'kahl') ? 1.3 : 1);
/** N multiplier of the Spores: (1 + a * Sporen) ^ sPow. Mild in the long run (no ^units explosion across resets), strong for the first ones. */
export const sMult = (g, o) => Math.pow(1 + sA(g, o) * units(g, 's'), T.sPow);
const sCostFactor = (g) => (has(g, 's11') ? 1 / 1.5 : 1) * (has(g, 's22b') ? 1 / 1.4 : 1);
const zExpo = (g, o = {}) => T.zExp + 0.05 * (o.m12 ?? has(g, 'm12')) + 0.05 * (o.m22b ?? has(g, 'm22b'));

/** Labeled multipliers of the N production that come from the Hyphen layer, the upgrades and the Fruchtkörper (the part Dürre takes the root of). */
export function coreParts(g) {
  const hr = Hr(g);
  const p = [['Hyphen-Geflecht', Math.pow(1 + hr, T.hBoostExp)]];
  const add = (label, v) => v !== 1 && p.push([label, v]);
  for (const u of g.def.upgrades) if (u.fx === 'n' && g.upgLevel(u.id) > 0) add(u.name, g.upgEffect(u.id));
  if (ms(g, 'h_dicht')) add('Meilenstein Dichte Fäden', 1.5);
  if (chDone(g, 'durre')) add('Dürre überstanden', 3);
  return p;
}

/** The multipliers of the chosen branch (Sporen, Zucker): they keep working in Dürre. */
export function branchParts(g, o = {}) {
  const p = [];
  if (spOn(g)) {
    p.push(['Sporen', sMult(g)]);
    if (ms(g, 's_flut')) p.push(['Sporenflut', 2]);
  }
  if (!o.noZ && myOn(g)) p.push(['Zucker', Math.pow(1 + g.state.cur.z.run.toNumber() + (o.zExtra || 0), zExpo(g))]);
  return p.filter(([, v]) => v !== 1);
}

/** All labeled N multipliers (the Dürre exponent applies to the core only). */
export const nParts = (g) => [...coreParts(g), ...branchParts(g)];

/** N per second as a plain number. o.noZ: without the sugar boost (base for the sugar production), o.zExtra: sugar added (objective). */
export function nRate(g, o = {}) {
  let core = T.nBase;
  for (const [, v] of coreParts(g)) core *= v;
  const pw = g.rule('nPow', 1);
  if (pw !== 1) core = Math.pow(core, pw);
  for (const [, v] of branchParts(g, o)) core *= v;
  return core;
}

/** Zucker per second (Mykorrhiza). */
export function zRate(g) {
  const u = myOn(g) ? units(g, 'm') : 0;
  if (!u) return 0;
  const base = nRate(g, { noZ: true });
  let m = T.zPer * u * Math.pow(Math.max(base, 1e-9), T.zRateExp);
  m *= (has(g, 'm11') ? 2 : 1) * (has(g, 'm21') ? Math.pow(1 + Hr(g), 0.1) : 1) * (has(g, 'm22a') ? 3 : 1) * (has(g, 'f13') ? 1.5 : 1) * (chDone(g, 'kahl') ? 1.5 : 1) * (ms(g, 'm_netz') ? 2 : 1);
  return m;
}

/** Hyphen gain multiplier (before the ripeness factor). */
export function hGainParts(g) {
  const p = [];
  const add = (label, v) => v !== 1 && p.push([label, v]);
  for (const u of g.def.upgrades) if (u.fx === 'h' && g.upgLevel(u.id) > 0) add(u.name, g.upgEffect(u.id));
  if (ms(g, 'h_flaeche')) add('Meilenstein Flächendeckend', 1.25);
  if (chDone(g, 'frost')) add('Frost überstanden', 2);
  return p;
}
export const hGainMult = (g) => hGainParts(g).reduce((a, [, v]) => a * v, 1);

/** 'Reife': the Hyphen of a run mature with its age; without it the best Hyphen per second would come from very short runs. */
export const ripeness = (g) => Math.max(0.01, Math.pow(Math.min(1, g.state.layers.h.runTime / T.ripeSecs), T.ripeExp));


/* ------------------------------------------------------------------ */
/* the deep layers (Paket 2): Fruchtkörper gain, Gabel B, Waldnetz, Hexenring */
/* ------------------------------------------------------------------ */

/** Jahresringe: the older the net, the more it yields (a slow, steady bonus for every deep gain, and a regular little event). */
export const jrMul = (g) => 1 + T.jrBonus * g.state.myz.jr;
const ringMul = (g) => 1 + (T.ringBonus + T.escheR * lv(g, 't_esche')) * rings(g);
export const humus = (g) => g.get('hu').toNumber();
const hu = (g, p) => Math.pow(1 + humus(g), p);
/** The second branch of fork A is open: Sporen and Mykorrhiza both work. */
const bothA = (g) => g.forkSecondOpen('a') && g.forkChoice('a') !== null;
const bothB = (g) => g.forkSecondOpen('b') && g.forkChoice('b') !== null;
const F_MS = [5, 6, 8, 10, 12, 14, 16, 18, 20];
const fMs = (g) => F_MS.filter((n) => ms(g, 'f_m' + n)).length;

/** Labeled factors of the Fruchtkörper gain (applied to the layer's `mult`; the softcap of a run is T.fCapAt). */
export function fGainParts(g) {
  const p = [];
  const add = (label, v) => v !== 1 && p.push([label, v]);
  add('Alge', 1 + T.algeF * lv(g, 'l_alge'));
  add('Flechten-Upgrades', fxProd(g, 'l', 'f'));
  add('Fäulnis-Upgrades', fxProd(g, 'z', 'f'));
  add('Humus', hu(g, T.humusF));
  add('Eiche', 1 + T.eicheF * lv(g, 't_eiche'));
  add('Waldnetz-Upgrades', wfx(g, 'f'));
  if (bothA(g)) add('Sporen + Mykorrhiza', 1 + T.synA * Math.min(units(g, 's'), units(g, 'm')));
  add('Pilzteppich', Math.pow(1.08, fMs(g)));
  add('Hexenringe', ringMul(g));
  add('Jahresringe', jrMul(g));
  return p;
}
export const fGainMult = (g) => fGainParts(g).reduce((a, [, v]) => a * v, 1);

/** Gain (lumps) of the fork-B layers and the Waldnetz, and the income of the fork-B currencies. */
const lindeMul = (g) => (1 + T.lindeI * lv(g, 't_linde')) * wfx(g, 'inc');
const bLump = (g) => ringMul(g) * (1 + T.bucheB * lv(g, 't_buche')) * wfx(g, 'lump');
const lichtMul = (g) => 1 + T.lichtL * lv(g, 'l_licht');
export const lGainMult = (g) => bLump(g) * lichtMul(g) * fxProd(g, 'l', 'lump') * (ms(g, 'l_m4') ? 1.25 : 1);
export const zGainMult = (g) => T.zScale * bLump(g) * hu(g, T.humusInc) * fxProd(g, 'z', 'lump') * (ms(g, 'z_m4') ? 1.25 : 1);
export const lRate = (g) => (lOn(g) ? T.algeRate * lv(g, 'l_alge') * lichtMul(g) * fxProd(g, 'l', 'inc') * bLump(g) * lindeMul(g) : 0);
export const faRate = (g) => (zOn(g) ? T.zScale * T.totRate * lv(g, 'z_tot') * hu(g, T.humusInc) * fxProd(g, 'z', 'inc') * bLump(g) * lindeMul(g) : 0);

export function wGainParts(g) {
  const p = [];
  const add = (label, v) => v !== 1 && p.push([label, v]);
  add('Flechten-Upgrades', fxProd(g, 'l', 'w'));
  add('Fäulnis-Upgrades', fxProd(g, 'z', 'w'));
  add('Birke', 1 + T.birkeW * lv(g, 't_birke'));
  add('Waldnetz-Upgrades', wfx(g, 'w'));
  if (bothB(g)) add('Flechte + Fäulnis', T.synB);
  if (ms(g, 'w_6')) add('Meilenstein Dichter Wald', 1.25);
  add('Hexenringe', ringMul(g));
  add('Jahresringe', jrMul(g));
  return p;
}
export const wGainMult = (g) => wGainParts(g).reduce((a, [, v]) => a * v, 1);

/** Time gates of the deep layers: the Kiefer shortens them (at most by kieferMax levels). */
export const gateMul = (g) => 1 - T.kieferGate * Math.min(T.kieferMax, lv(g, 't_kiefer'));
export const bFirst = (g) => cnt(g, 'l') + cnt(g, 'z') === 0;
export const bMinRun = (g) => (bFirst(g) ? T.lMin1 : T.lMin) * gateMul(g);
export const wMinRun = (g) => (cnt(g, 'w') === 0 ? T.wMin1 : T.wMin) * gateMul(g);
const bAvailable = (g, id) => g.state.layers[id].runTime >= bMinRun(g);
const wAvailable = (g) => g.state.layers.w.runTime >= wMinRun(g);
export const ringCostDiv = (g) => (1 + T.tanneR * lv(g, 't_tanne')) * wfx(g, 'ring');
export const ringCost = (k, g) => (T.rBase * Math.pow(T.rGrow, Math.pow(k, T.rExp))) / ringCostDiv(g);
const fBasis = (id) => (g) => g.state.cur.f.total.sub(g.state.myz.fAt[id]);
const wBasis = (g) => g.state.cur.l.run.add(g.state.cur.fa.run);

/** Zersetzen: the stock of Fruchtkörper, Sporen and Zucker rots into Humus (z-branch). Humus is not spent; it multiplies. */
export const substrate = (g) => g.get('f').toNumber() + T.humusSw * g.get('s').toNumber() + T.humusZw * Math.pow(Math.max(0, g.get('z').toNumber()), T.humusZexp);
export function humusGain(g) {
  if (!zOn(g)) return 0;
  const x = substrate(g);
  if (x < 1) return 0;
  return Math.floor(Math.pow(x, T.humusPow) * fxProd(g, 'z', 'hum'));
}
export function zersetzen(g) {
  const n = humusGain(g);
  if (n < 1) return 0;
  const before = humus(g);
  for (const c of ['f', 's', 'z']) g.state.cur[c].amount = ZERO;
  g.add('hu', D(n));
  g.state.myz.zers += 1;
  g.refresh();
  g.emit('zers', { id: 'zers', gain: D(n), big: n >= 0.1 * Math.max(1, before) });
  return n;
}

/** Value of the deep state for the autobuyers (ln of the strength of the gains that gate the progress, not of N). */
function deepScore(g) {
  let v = Math.log(fGainMult(g)) + Math.log(wGainMult(g)) + Math.log(ringCostDiv(g)) - T.gateW * Math.log(gateMul(g));
  if (lOn(g)) v += Math.log(lGainMult(g)) + Math.log(1 + (lRate(g) * T.bHorizon) / T.bScale);
  if (zOn(g)) v += Math.log(zGainMult(g)) + Math.log(1 + (faRate(g) * T.bHorizon) / T.bScale) + T.humW * Math.log(fxProd(g, 'z', 'hum'));
  return v;
}

/**
 * Value of the state for the autobuyers (and the sim, which calls the same functions): ln of the Hyphen gain of a run, plus
 * what the upgrades of the fork layers are worth (cheaper Spores, sugar that will have been made within an hour).
 */
/** 'Reife' of the Fruchtkörper: the gain of a run grows with its age (concave gain + cheap resets would make many short runs the best way to farm them). */
export const fRipeSecs = (g) => (g.state.layers.f.count === 0 ? T.ripeF1 : T.ripeF);
export const fRipeness = (g) => Math.max(0.02, Math.pow(Math.min(1, g.state.layers.f.runTime / fRipeSecs(g)), T.ripeFExp));

export function objective(g) {
  const zExtra = myOn(g) ? zRate(g) * T.zHorizon : 0;
  let v = T.hExp * Math.log(Math.max(nRate(g, { zExtra }), 1e-9)) + Math.log(hGainMult(g));
  if (spOn(g)) v += 0.7 * Math.log(1 / sCostFactor(g));
  if (g.forkIs('a', 'm')) v += 0; // sugar costs are paid in sugar; its worth is in zRate (above)
  return v + deepScore(g);
}

/** The value-based autobuyer for the upgrades of one tree node ('h' | 's' | 'm' | 'f'): the same function the autos and the sim call. */
export const buyNode = (g, node) => g.upgBuyBest(node, objective);

/* ------------------------------------------------------------------ */
/* upgrades                                                             */
/* ------------------------------------------------------------------ */

const up = (node, o) => ({ node, group: node, layer: { h: 1, s: 2, m: 2, f: 3, l: 4, z: 4, w: 5 }[node], currency: { h: 'h', s: 's', m: 'z', f: 'f', l: 'l', z: 'fa', w: 'w' }[node], ...o });
const cs = (node) => ({ h: T.costScaleH, s: T.costScaleS, m: T.costScaleM, f: T.costScaleF })[node] ?? 1;
const cost = (node, c) => () => Math.ceil(c * cs(node));

// which H upgrades survive a reset of the rows above: all of them survive a reset of row 3 (Fruchtkörper, challenges: the Hyphen net stays),
// those of a reset of row 2 depend on the milestones of the chosen branch (s_*/m_*)
const rowOf = (id) => Number(id[1]);
const keepH = (id) => (g, L) => {
  if (L >= 3) return true;
  if (L !== 2) return false;
  const r = rowOf(id);
  const b = g.forkChoice('a');
  if (!b) return false;
  return (r === 1 && ms(g, b + '_keep1')) || (r === 2 && ms(g, b + '_keep2')) || ms(g, b + '_keep3');
};

const hUp = (o) => up('h', { keep: keepH(o.id), cost: cost('h', o.cost), ...o });
const hUpgrades = [
  hUp({ id: 'h11', fx: 'n', name: 'Feine Fäden', desc: 'Nährstoffe ×2.', cost: 1, effect: (l) => (l ? 2 : 1), fmt: fe }),
  hUp({ id: 'h12', fx: 'n', name: 'Wurzelkontakt', desc: `Nährstoffe ×(1 + Hyphen)^${c(T.pH12)}.`, cost: 3, requires: ['h11'], effect: (l, g) => (l ? Math.pow(1 + Hr(g), T.pH12) : 1), fmt: fe }),
  hUp({ id: 'h13', fx: 'h', name: 'Tauperlen', desc: 'Hyphen-Gewinn ×(1 + lg Nährstoffe ÷ 4).', cost: 8, requires: ['h12'], effect: (l, g) => (l ? 1 + Math.log10(1 + Nrun(g)) / 4 : 1), fmt: fe }),
  hUp({ id: 'h21', fx: 'n', name: 'Dichtes Geflecht', desc: 'Nährstoffe ×3.', cost: 20, requires: ['h11'], effect: (l) => (l ? 3 : 1), fmt: fe }),
  hUp({ id: 'h22', fx: 'n', name: 'Nachtfeuchte', desc: 'Nährstoffe ×(1 + 0,4 · √Ausbreitungen).', cost: 50, requires: ['h12'], effect: (l, g) => (l ? 1 + 0.4 * sq(hCount(g)) : 1), fmt: fe }),
  hUp({ id: 'h23', fx: 'h', name: 'Pilzringe', desc: 'Hyphen-Gewinn ×2.', cost: 130, requires: ['h13'], effect: (l) => (l ? 2 : 1), fmt: fe }),
  hUp({ id: 'h31a', fx: 'n', name: 'Tiefe Wurzeln', desc: `Nährstoffe ×(1 + Hyphen)^${c(T.pH31a)}. Schließt „Breite Netze“ aus.`, cost: 400, requires: ['h21'], excl: ['h31b'], effect: (l, g) => (l ? Math.pow(1 + Hr(g), T.pH31a) : 1), fmt: fe }),
  hUp({ id: 'h31b', fx: 'h', name: 'Breite Netze', desc: `Hyphen-Gewinn ×(1 + Hyphen)^${c(T.pH31b)}. Schließt „Tiefe Wurzeln“ aus.`, cost: 400, requires: ['h21'], excl: ['h31a'], effect: (l, g) => (l ? Math.pow(1 + Hr(g), T.pH31b) : 1), fmt: fe }),
  hUp({ id: 'h32', fx: 'n', name: 'Alter Boden', desc: 'Nährstoffe ×5.', cost: 1200, requires: ['h22'], effect: (l) => (l ? 5 : 1), fmt: fe }),
  hUp({ id: 'h33', fx: 'h', name: 'Hyphen-Dichte', desc: 'Hyphen-Gewinn ×2,5.', cost: 4000, requires: ['h23'], effect: (l) => (l ? 2.5 : 1), fmt: fe }),
];

const keepBranch = (g, L) => L >= 3 && ms(g, 'f_keepb'); // the branch upgrades survive a Fruchtkörper from 4 on
const sUp = (o) => up('s', { cost: cost('s', o.cost), keep: keepBranch, ...o });
const sUpgrades = [
  sUp({ id: 's11', name: 'Keimruhe', desc: 'Sporen kosten ÷1,5.', cost: 1, effect: (l) => (l ? 1 / 1.5 : 1), fmt: (e) => '÷' + formatNumber(1 / e) }),
  sUp({ id: 's12', name: 'Sporenfahne', desc: 'Jede Spore wirkt stärker (+0,3).', cost: 2, requires: ['s11'], effect: (l, g) => sMult(g, { s12: l }), fmt: (e) => 'Sporen ×' + formatNumber(e) }),
  sUp({ id: 's13', fx: 'n', name: 'Windbestäubung', desc: 'Nährstoffe ×(1 + Sporen)^0,5.', cost: 3, requires: ['s12'], effect: (l, g) => (l ? Math.pow(1 + units(g, 's'), 0.5) : 1), fmt: fe }),
  sUp({ id: 's21', fx: 'h', name: 'Dichter Flor', desc: 'Hyphen-Gewinn ×(1 + Sporen)^0,5.', cost: 4, requires: ['s11'], effect: (l, g) => (l ? Math.pow(1 + units(g, 's'), 0.5) : 1), fmt: fe }),
  sUp({ id: 's22a', name: 'Sprengkraft', desc: 'Jede Spore wirkt stärker (+0,4). Schließt „Streuung“ aus.', cost: 6, requires: ['s21'], excl: ['s22b'], effect: (l, g) => sMult(g, { s22a: l }), fmt: (e) => 'Sporen ×' + formatNumber(e) }),
  sUp({ id: 's22b', name: 'Streuung', desc: 'Sporen kosten ÷1,4. Schließt „Sprengkraft“ aus.', cost: 6, requires: ['s21'], excl: ['s22a'], effect: (l) => (l ? 1 / 1.4 : 1), fmt: (e) => '÷' + formatNumber(1 / e) }),
];

const mUp = (o) => up('m', { cost: cost('m', o.cost), keep: keepBranch, ...o });
const mUpgrades = [
  mUp({ id: 'm11', name: 'Zuckerrohr', desc: 'Zucker-Erzeugung ×2.', cost: 200, effect: (l) => (l ? 2 : 1), fmt: fe }),
  mUp({ id: 'm12', name: 'Wurzelkuss', desc: 'Zucker verstärkt Nährstoffe stärker (Exponent +0,05).', cost: 800, requires: ['m11'], effect: (l, g) => zExpo(g, { m12: l }), fmt: (e) => 'Exponent ' + formatNumber(e) }),
  mUp({ id: 'm13', fx: 'n', name: 'Leitbündel', desc: 'Nährstoffe ×(1 + Mykorrhiza)^0,4.', cost: 3000, requires: ['m12'], effect: (l, g) => (l ? Math.pow(1 + units(g, 'm'), 0.4) : 1), fmt: fe }),
  mUp({ id: 'm21', name: 'Symbiose', desc: 'Zucker-Erzeugung ×(1 + Hyphen)^0,1.', cost: 1500, requires: ['m11'], effect: (l, g) => (l ? Math.pow(1 + Hr(g), T.pH31b) : 1), fmt: fe }),
  mUp({ id: 'm22a', name: 'Tiefenwurzeln', desc: 'Zucker-Erzeugung ×3. Schließt „Feinwurzeln“ aus.', cost: 8000, requires: ['m21'], excl: ['m22b'], effect: (l) => (l ? 3 : 1), fmt: fe }),
  mUp({ id: 'm22b', name: 'Feinwurzeln', desc: 'Zucker verstärkt Nährstoffe stärker (Exponent +0,05). Schließt „Tiefenwurzeln“ aus.', cost: 8000, requires: ['m21'], excl: ['m22a'], effect: (l, g) => zExpo(g, { m22b: l }), fmt: (e) => 'Exponent ' + formatNumber(e) }),
];

const fUp = (o) => up('f', { cost: cost('f', o.cost), keep: (g, L) => L >= 4, ...o }); // the fruit net survives the deep resets
const fUpgrades = [
  fUp({ id: 'f11', fx: 'n', name: 'Hutbildung', desc: `Nährstoffe ×(1 + Fruchtkörper)^${c(T.pF11)}.`, cost: 1, effect: (l, g) => (l ? Math.pow(1 + Ft(g), T.pF11) : 1), fmt: fe }),
  fUp({ id: 'f12', fx: 'h', name: 'Fruchtfleisch', desc: `Hyphen-Gewinn ×(1 + Fruchtkörper)^${c(T.pF12)}.`, cost: 2, requires: ['f11'], effect: (l, g) => (l ? Math.pow(1 + Ft(g), T.pF12) : 1), fmt: fe }),
  fUp({ id: 'f13', name: 'Sporenträger', desc: 'Sporen wirken ×1,15 stärker, Zucker-Erzeugung ×1,5.', cost: 4, requires: ['f11'], effect: (l) => (l ? 1.15 : 1), fmt: (e) => (e === 1 ? '×1' : 'Sporen ×1,15, Zucker ×1,5') }),
  fUp({ id: 'f21', fx: 'n', name: 'Lamellen', desc: 'Nährstoffe ×6.', cost: 8, requires: ['f12'], effect: (l) => (l ? 6 : 1), fmt: fe }),
  fUp({ id: 'f22a', fx: 'n', name: 'Dicker Stiel', desc: `Nährstoffe ×(1 + Fruchtkörper)^${c(T.pF22a)}. Schließt „Breiter Hut“ aus.`, cost: 15, requires: ['f21'], excl: ['f22b'], effect: (l, g) => (l ? Math.pow(1 + Ft(g), T.pF22a) : 1), fmt: fe }),
  fUp({ id: 'f22b', fx: 'h', name: 'Breiter Hut', desc: `Hyphen-Gewinn ×(1 + Fruchtkörper)^${c(T.pF22b)}. Schließt „Dicker Stiel“ aus.`, cost: 15, requires: ['f21'], excl: ['f22a'], effect: (l, g) => (l ? Math.pow(1 + Ft(g), T.pF22b) : 1), fmt: fe }),
];


/* ---- Gabel B: Flechte (node l, paid in Flechten) and Fäulnis (node z, paid in Fäulnis); both keep their upgrades through a Waldnetz ---- */
const keepDeep = (g, L) => L >= 5;
const bUp = (node, o) => up(node, { cost: cost(node, o.cost), keep: keepDeep, ...o });
/** A buyable: unlimited levels, cost base * grow^level. */
const buyable = (node, o) => up(node, { max: 9999, keep: keepDeep, cost: (l) => Math.ceil(o.base * Math.pow(o.grow, l)), ...o });
/** The upgrade ladders of Flechte (l) and Fäulnis (z): [id, name, kind, factor, cost, requires, excl]. kind: f = Fruchtkörper gain, w = Waldfäden gain, inc = income of the layer, lump = gain per run, hum = Humus per Zersetzen. */
const LADDER = {
  l: [
    ['l11', 'Krustenflechte', 'f', 2, 8, []],
    ['l21', 'Wüstenflechte', 'w', 1.3, 25, ['l11']],
    ['l12', 'Blattflechte', 'inc', 2, 40, ['l11']],
    ['l13', 'Strauchflechte', 'lump', 2, 90, ['l12']],
    ['l22a', 'Symbiont', 'inc', 3, 180, ['l21'], ['l22b']],
    ['l22b', 'Pionier', 'w', 2, 180, ['l21'], ['l22a']],
    ['l14', 'Rentierflechte', 'f', 1.5, 320, ['l13']],
    ['l23', 'Bartflechte', 'w', 1.5, 520, null, null, ['l22a', 'l22b']],
    ['l31', 'Lungenflechte', 'inc', 2, 800, ['l14']],
    ['l32', 'Schwefelflechte', 'lump', 1.5, 1200, ['l23']],
    ['l33', 'Mannaflechte', 'f', 2, 1800, ['l31', 'l32']],
    ['l34', 'Weltflechte', 'w', 2, 2600, ['l33']],
  ],
  z: [
    ['z11', 'Morsches Holz', 'hum', 2, 8, []],
    ['z21', 'Totholzkäfer', 'w', 1.3, 25, ['z11']],
    ['z12', 'Schimmel', 'f', 2, 40, ['z11']],
    ['z13', 'Moder', 'lump', 2, 90, ['z12']],
    ['z22a', 'Fäulnisgas', 'inc', 3, 180, ['z21'], ['z22b']],
    ['z22b', 'Kompost', 'w', 2, 180, ['z21'], ['z22a']],
    ['z14', 'Humusschicht', 'hum', 1.5, 320, ['z13']],
    ['z23', 'Pilzbrut', 'w', 1.5, 520, null, null, ['z22a', 'z22b']],
    ['z31', 'Myzelfäule', 'inc', 2, 800, ['z14']],
    ['z32', 'Zunderschwamm', 'lump', 1.5, 1200, ['z23']],
    ['z33', 'Weißfäule', 'f', 2, 1800, ['z31', 'z32']],
    ['z34', 'Urwaldmoder', 'w', 2, 2600, ['z33']],
  ],
};
const KIND_TEXT = {
  f: () => 'Fruchtkörper-Gewinn',
  w: () => 'Waldfäden-Gewinn',
  inc: (n) => (n === 'l' ? 'Flechten-Erzeugung' : 'Fäulnis-Erzeugung'),
  lump: (n) => (n === 'l' ? 'Flechten-Gewinn je Durchlauf' : 'Fäulnis-Gewinn je Durchlauf'),
  hum: () => 'Humus pro Zersetzen',
};
const FX = {}; // upgrade id -> [kind, factor]
// [runs of the layer (count), hours of the current run]: the ladder unfolds over the days AND inside a run, so that something new turns up between two prestiges
const TIER_AT = { 11: [0, 3], 21: [0, 7], 12: [1, 1.5], 13: [2, 3], 22: [3, 4.5], 14: [3, 1.5], 23: [4, 3], 31: [5, 4.5], 32: [6, 2], 33: [7, 3.5], 34: [8, 1] };
const ladderUps = (node) =>
  LADDER[node].map(([id, name, kind, factor, cst, req, excl, any]) => {
    FX[id] = [kind, factor];
    const exclNames = excl ? ` Schließt „${LADDER[node].find((r) => r[0] === excl[0])[1]}“ aus.` : '';
    return bUp(node, {
      id, name, cost: cst,
      desc: `${KIND_TEXT[kind](node)} ×${c(factor)}.${exclNames}`,
      requires: req,
      requiresAny: any,
      require: (g) => { const [n, hrs] = TIER_AT[id.slice(1, 3)]; return cnt(g, node) >= n && g.state.layers[node].runTime >= hrs * 3600; },
      reqText: (g) => { const [n, hrs] = TIER_AT[id.slice(1, 3)]; return cnt(g, node) < n ? `Erscheint nach ${n} ${n === 1 ? 'Durchlauf' : 'Durchläufen'}.` : `Erscheint im Lauf, noch ${formatDuration(Math.max(0, hrs * 3600 - g.state.layers[node].runTime))}.`; },
      excl,
      effect: (l) => (l ? factor : 1),
      fmt: fe,
    });
  });
const fxProd = (g, node, kind) => {
  let v = 1;
  for (const [id, [k, f]] of Object.entries(FX)) if (k === kind && id.startsWith(node) && g.upgLevel(id) > 0) v *= f;
  return v;
};
const lUpgrades = [
  buyable('l', { id: 'l_alge', name: 'Alge', base: T.algeBase, grow: T.algeGrow, desc: `Erzeugt Flechten (${c(T.algeRate * 3600)} pro Stunde und Stufe) und Fruchtkörper-Gewinn +${Math.round(T.algeF * 100)} % je Stufe.`, effect: (l) => 1 + T.algeF * l, fmt: (e, l) => `Stufe ${l} · Fruchtkörper ×${formatNumber(e)}` }),
  buyable('l', { id: 'l_licht', name: 'Licht', base: T.lichtBase, grow: T.lichtGrow, desc: `Flechten-Erzeugung und -Gewinn +${Math.round(T.lichtL * 100)} % je Stufe.`, effect: (l) => 1 + T.lichtL * l, fmt: (e, l) => `Stufe ${l} · Flechten ×${formatNumber(e)}` }),
  ...ladderUps('l'),
];
const zUpgrades = [
  buyable('z', { id: 'z_tot', name: 'Totholz', base: T.totBase, grow: T.totGrow, desc: `Erzeugt Fäulnis (${c(T.totRate * 3600)} pro Stunde und Stufe), verstärkt von Humus.`, effect: (l) => l, fmt: (e, l) => `Stufe ${l}` }),
  ...ladderUps('z'),
];
/* ---- Waldnetz: the trees (buyables with one effect each; the Waldfäden are never reset by a higher layer) ---- */
const tree = (id, name, base, grow, desc, effect, fmtf, extra = {}) => up('w', { id, name, max: 9999, cost: (l) => Math.ceil(base * Math.pow(grow, l)), desc, effect, fmt: fmtf, ...extra });
/** Single upgrades of the Waldnetz (paid in Waldfäden): [id, name, kind, factor, cost, requires]. kind: w = Waldfäden gain, f = Fruchtkörper gain, inc = income of Flechte/Fäulnis, lump = gain of Flechte/Fäulnis, ring = ring cost divisor. */
const WLADDER = [
  ['w11', 'Wurzelbrücke', 'w', 1.3, 10, [], 0, 0],
  ['w12', 'Pilzpfad', 'inc', 1.5, 20, ['w11'], 1, 1.5],
  ['w21', 'Moosteppich', 'f', 1.5, 30, ['w11'], 1, 4],
  ['w13', 'Hexenpfad', 'ring', 1.3, 40, ['w12'], 2, 2.5],
  ['w22', 'Farnwald', 'lump', 1.3, 80, ['w21'], 2, 5],
  ['w23', 'Lichtung', 'w', 1.5, 150, ['w13', 'w22'], 3, 3, ['w24']],
  ['w24', 'Eichenhain', 'f', 1.5, 150, ['w13', 'w22'], 3, 3, ['w23']],
  ['w31', 'Urwald', 'ring', 1.5, 300, [], 4, 2, null, ['w23', 'w24']],
];
const WKIND = { w: 'Waldfäden-Gewinn', f: 'Fruchtkörper-Gewinn', inc: 'Flechten- und Fäulnis-Erzeugung', lump: 'Flechten- und Fäulnis-Gewinn', ring: 'Ringkosten ÷' };
const WFX = {};
const wLadder = WLADDER.map(([id, name, kind, factor, cst, req, atCount, atHours, excl, any]) => {
  WFX[id] = [kind, factor];
  const exclText = excl ? ` Schließt „${WLADDER.find((r) => r[0] === excl[0])[1]}“ aus.` : '';
  return up('w', { id, name, cost: () => cst, desc: (kind === 'ring' ? `Ringkosten ÷${c(factor)}.` : `${WKIND[kind]} ×${c(factor)}.`) + exclText, requires: req, requiresAny: any, excl, require: (g) => cnt(g, 'w') >= atCount && g.state.layers.w.runTime >= atHours * 3600,
    reqText: (g) => (cnt(g, 'w') < atCount ? `Erscheint nach ${atCount} ${atCount === 1 ? 'Waldnetz' : 'Waldnetzen'}.` : `Erscheint im Lauf, noch ${formatDuration(Math.max(0, atHours * 3600 - g.state.layers.w.runTime))}.`),
    effect: (l) => (l ? factor : 1), fmt: fe });
});
const wfx = (g, kind) => {
  let v = 1;
  for (const [id, [k, f]] of Object.entries(WFX)) if (k === kind && g.upgLevel(id) > 0) v *= f;
  return v;
};
const wUpgrades = [
  tree('t_eiche', 'Eiche', T.eicheBase, T.eicheGrow, `Fruchtkörper-Gewinn +${Math.round(T.eicheF * 100)} % je Stufe.`, (l) => 1 + T.eicheF * l, (e, l) => `Stufe ${l} · Fruchtkörper ×${formatNumber(e)}`),
  tree('t_buche', 'Buche', T.bucheBase, T.bucheGrow, `Gewinn und Erzeugung von Flechten und Fäulnis +${Math.round(T.bucheB * 100)} % je Stufe.`, (l) => 1 + T.bucheB * l, (e, l) => `Stufe ${l} · Flechte/Fäulnis ×${formatNumber(e)}`),
  tree('t_birke', 'Birke', T.birkeBase, T.birkeGrow, `Waldfäden-Gewinn +${Math.round(T.birkeW * 100)} % je Stufe.`, (l) => 1 + T.birkeW * l, (e, l) => `Stufe ${l} · Waldfäden ×${formatNumber(e)}`),
  tree('t_kiefer', 'Kiefer', T.kieferBase, T.kieferGrow, `Flechte, Fäulnis und Waldnetz reifen ${c(T.kieferGate * 100)} % schneller je Stufe (höchstens ${T.kieferMax} Stufen).`, (l) => 1 - T.kieferGate * Math.min(T.kieferMax, l), (e, l) => `Stufe ${l} · Reifezeit ×${formatNumber(e)}`, { max: T.kieferMax }),
  tree('t_esche', 'Esche', T.escheBase, T.escheGrow, `Jeder Ring wirkt stärker (+${c(T.escheR * 100)} Prozentpunkte je Stufe).`, (l) => T.ringBonus + T.escheR * l, (e, l) => `Stufe ${l} · ${formatNumber(e * 100)} % je Ring`, { require: (g) => cnt(g, 'w') >= 2, reqText: () => 'Erscheint mit dem 2. Waldnetz.' }),
  tree('t_linde', 'Linde', T.lindeBase, T.lindeGrow, `Flechten- und Fäulnis-Erzeugung +${Math.round(T.lindeI * 100)} % je Stufe.`, (l) => 1 + T.lindeI * l, (e, l) => `Stufe ${l} · Erzeugung ×${formatNumber(e)}`, { require: (g) => cnt(g, 'w') >= 4, reqText: () => 'Erscheint mit dem 4. Waldnetz.' }),
  tree('t_tanne', 'Tanne', T.tanneBase, T.tanneGrow, `Hexenringe kosten ${Math.round(T.tanneR * 100)} % weniger Waldfäden je Stufe (Teiler).`, (l) => 1 + T.tanneR * l, (e, l) => `Stufe ${l} · Ringkosten ÷${formatNumber(e)}`),
];

const upgrades = [...hUpgrades, ...sUpgrades, ...mUpgrades, ...fUpgrades, ...lUpgrades, ...zUpgrades, ...wUpgrades, ...wLadder];

/* ------------------------------------------------------------------ */
/* milestones                                                           */
/* ------------------------------------------------------------------ */

const lc = (id, n) => (g) => g.state.layers[id].count >= n;
const uc = (id, n) => (g) => g.state.layers[id].units >= n;
const mile = (id, layer, cond, name, desc) => ({ id, layer, cond, name, desc });
const milestones = [
  mile('h_dicht', 'h', lc('h', 3), '3 Ausbreitungen', 'Dichte Fäden: Nährstoffe ×1,5.'),
  mile('h_flaeche', 'h', lc('h', 10), '10 Ausbreitungen', 'Flächendeckend: Hyphen-Gewinn ×1,25.'),
  // Sporen: the first ones keep Hyphen upgrades through the cheap reset
  mile('s_keep1', 's', uc('s', 1), '1 Spore', 'Ab der nächsten Sporenwolke bleibt die erste Reihe der Hyphen-Upgrades erhalten.'),
  mile('s_keep2', 's', uc('s', 3), '3 Sporen', 'Auch die zweite Reihe bleibt erhalten (ab dem nächsten Mal).'),
  mile('s_keep3', 's', uc('s', 5), '5 Sporen', 'Alle Hyphen-Upgrades bleiben erhalten (ab dem nächsten Mal).'),
  mile('s_flut', 's', uc('s', T.sFlutAt), `${T.sFlutAt} Sporen`, 'Sporenflut: Nährstoffe ×2.'),
  mile('m_keep1', 'm', uc('m', 1), '1 Mykorrhiza', 'Ab dem nächsten Verdichten bleibt die erste Reihe der Hyphen-Upgrades erhalten.'),
  mile('m_keep2', 'm', uc('m', 3), '3 Mykorrhiza', 'Auch die zweite Reihe bleibt erhalten (ab dem nächsten Mal).'),
  mile('m_keep3', 'm', uc('m', 5), '5 Mykorrhiza', 'Alle Hyphen-Upgrades bleiben erhalten (ab dem nächsten Mal).'),
  mile('m_netz', 'm', uc('m', T.mNetzAt), `${T.mNetzAt} Mykorrhiza`, 'Myzelnetz: Zucker-Erzeugung ×2.'),
  ...RAIN_MS.map((n) => mile('rain_' + n, 'n', (g) => g.state.myz.rain.n >= n, `${n} Schauer`, 'Regenzeit: Jeder Schauer wirkt um ×1 stärker.')),
  mile('f_buy', 'f', lc('f', 1), '1 Fruchtkörper', 'Die Challenges sind offen. Hyphen-Upgrades können automatisch gekauft werden.'),
  mile('f_auto', 'f', lc('f', 2), '2 Fruchtkörper', 'Die Ausbreitung kann automatisch laufen.'),
  mile('f_wolke', 'f', lc('f', 3), '3 Fruchtkörper', `Wolkenbruch: Regenschauer wirken ×${c(T.rainMult2)} statt ×${c(T.rainMult)}.`),
  mile('f_keepb', 'f', lc('f', 4), '4 Fruchtkörper', 'Die Upgrades von Sporen und Mykorrhiza bleiben beim Bilden von Fruchtkörpern erhalten.'),
  ...F_MS.map((n) => mile('f_m' + n, 'f', lc('f', n), `${n} Fruchtkörper`, 'Pilzteppich: Fruchtkörper-Gewinn ×1,08.')),
  // Flechte / Fäulnis: the first prestiges open the autos of the deep layers (switches start off)
  mile('l_m1', 'l', lc('l', 1), '1 Flechten-Durchlauf', 'Fruchtkörper können automatisch gebildet werden.'),
  mile('l_m2', 'l', lc('l', 2), '2 Flechten-Durchläufe', 'Die Flechte kann automatisch wachsen.'),
  mile('l_m3', 'l', lc('l', 3), '3 Flechten-Durchläufe', 'Upgrades von Flechte und Fäulnis können automatisch gekauft werden.'),
  mile('l_m4', 'l', lc('l', 5), '5 Flechten-Durchläufe', 'Flechten-Gewinn ×1,25.'),
  mile('z_m1', 'z', lc('z', 1), '1 Fäulnis-Durchlauf', 'Fruchtkörper können automatisch gebildet werden.'),
  mile('z_m2', 'z', lc('z', 2), '2 Fäulnis-Durchläufe', 'Die Fäulnis kann automatisch wachsen.'),
  mile('z_m3', 'z', lc('z', 3), '3 Fäulnis-Durchläufe', 'Upgrades von Flechte und Fäulnis können automatisch gekauft werden, Zersetzen läuft auf Wunsch von allein.'),
  mile('z_m4', 'z', lc('z', 5), '5 Fäulnis-Durchläufe', 'Fäulnis-Gewinn ×1,25.'),
  // Waldnetz
  mile('w_1', 'w', lc('w', 1), '1 Waldnetz', 'Die Bäume sind verbunden: Baum-Upgrades können automatisch gekauft werden.'),
  mile('w_a2', 'w', lc('w', T.wA2), `${T.wA2} Waldnetze`, 'Der Wald öffnet den zweiten Ast der ersten Gabel: Sporen UND Mykorrhiza wirken, und sie verstärken sich.'),
  mile('w_auto', 'w', lc('w', 3), '3 Waldnetze', 'Das Waldnetz kann automatisch wachsen.'),
  mile('w_b2', 'w', lc('w', T.wB2), `${T.wB2} Waldnetze`, 'Der Wald öffnet den zweiten Ast der zweiten Gabel: Flechte UND Fäulnis wirken.'),
  mile('w_6', 'w', lc('w', 6), '6 Waldnetze', 'Dichter Wald: Waldfäden-Gewinn ×1,25.'),
  // Hexenring
  mile('r_1', 'r', uc('r', 1), '1 Ring', 'Der erste Ring: alle tiefen Gewinne +15 % je Ring.'),
  mile('r_2', 'r', uc('r', 2), '2 Ringe', 'Zwei Ringe.'),
  mile('r_3', 'r', uc('r', 3), '3 Ringe', 'Drei Ringe.'),
  mile('r_4', 'r', uc('r', 4), '4 Ringe', 'Vier Ringe. Es fehlt einer.'),
  mile('r_5', 'r', uc('r', T.rings), `${T.rings} Ringe`, 'Der Ring schließt sich.'),
];

/* ------------------------------------------------------------------ */
/* challenges                                                           */
/* ------------------------------------------------------------------ */

/** Hyphen of one ripe Ausbreitung at the current strength (what the player would earn per 2 minutes without a restriction). */
export const hRipeGain = (g) => hGainMult(g) * Math.pow((nRate(g) * T.ripeSecs) / T.hReq, T.hExp);
const hf = (g) => g.state.cur.h.total.sub(g.state.myz.hAtF);
const fOpen = (g) => g.state.layers.f.count >= 1;
/**
 * A challenge is a timed detour with a sanity goal: hold out `chTime` seconds under the restriction AND earn a share of the Hyphen the player
 * made per ripe Ausbreitung when the last Fruchtkörper was formed. The time makes the duration predictable (the power of the player changes by
 * orders of magnitude between two Fruchtkörper, a pure Hyphen goal was a wall for the weak and a free pass for the strong), the Hyphen goal keeps it honest.
 */
export const chHyphenGoal = (i) => (g) => T.chS[i] * Math.max(T.fReq / 1000, g.state.myz.hRef);
const chFrac = (i) => (g) => Math.min(1, hf(g).toNumber() / chHyphenGoal(i)(g), g.chRunTime() / T.chTime[i]);
const chGoalDef = (i) => ({
  currency: 'h',
  amount: 1,
  fn: chFrac(i),
  progress: chFrac(i),
  text: (g) => `Hyphen ${formatNumber(hf(g))} / ${formatNumber(chHyphenGoal(i)(g))} · Zeit ${formatDuration(g.chRunTime())} / ${formatDuration(T.chTime[i])}`,
  line: (g) => `Ziel: ${formatDuration(T.chTime[i])} durchhalten und ${formatNumber(chHyphenGoal(i)(g))} Hyphen sammeln`,
});
const challenges = [
  {
    id: 'durre', name: 'Dürre', resetLayer: 3, rules: { nPow: T.chDurrePow },
    desc: `Die Nährstoff-Produktion wird gestaucht (Exponent ${c(T.chDurrePow)}). Sporen und Zucker wirken weiter.`, goal: chGoalDef(0),
    reward: 'Nährstoffe dauerhaft ×3.', unlock: fOpen, lockText: '1 Fruchtkörper',
  },
  {
    id: 'frost', name: 'Frost', resetLayer: 3, rules: { noH: true },
    desc: 'Die Hyphen-Upgrades sind eingefroren.', goal: chGoalDef(1),
    reward: 'Hyphen-Gewinn dauerhaft ×2.', unlock: (g) => g.chDone('durre'), lockText: 'Dürre überstanden',
  },
  {
    id: 'kahl', name: 'Kahlschlag', resetLayer: 3, rules: { noFork: true },
    desc: 'Sporen und Mykorrhiza ruhen: keine Wirkung, keine neuen.', goal: chGoalDef(2),
    reward: 'Sporen und Zucker dauerhaft stärker (Sporen ×1,3, Zucker ×1,5).', unlock: (g) => g.chDone('frost'), lockText: 'Frost überstanden',
  },
];

/* ------------------------------------------------------------------ */
/* autos                                                                */
/* ------------------------------------------------------------------ */

const autos = [
  { id: 'auto_hbuy', name: 'Hyphen-Upgrades automatisch kaufen', desc: 'Kauft das Upgrade mit dem besten Nutzen.', kind: 'upg', group: 'h', where: 'Hyphen-Knoten', unlock: (g) => ms(g, 'f_buy'), interval: () => 2, run: (g) => buyNode(g, 'h') },
  prestigeAuto({ id: 'auto_h', layer: 'h', name: 'Automatisch ausbreiten', desc: 'Breitet sich aus, sobald die Bedingung erfüllt ist.', where: 'Hyphen-Knoten', unlock: (g) => ms(g, 'f_auto'), interval: () => 1, mode: 'time', value: T.autoHTime, minGain: 1, modes: ['time', 'amount', 'mult'] }),
];


const bMs = (g, n) => ms(g, 'l_m' + n) || ms(g, 'z_m' + n);
const buyDeep = (g) => {
  buyNode(g, 'l');
  buyNode(g, 'z');
};
autos.push(
  prestigeAuto({ id: 'auto_f', layer: 'f', name: 'Fruchtkörper automatisch bilden', desc: 'Bildet Fruchtkörper, sobald der Pilz reif ist.', where: 'Fruchtkörper-Knoten', unlock: (g) => bMs(g, 1), interval: () => 5, mode: 'time', value: T.fMinRun, minGain: 1, modes: ['time', 'amount', 'mult'] }),
  prestigeAuto({ id: 'auto_l', layer: 'l', name: 'Flechte automatisch wachsen lassen', desc: 'Sobald die Flechte reif ist.', where: 'Flechten-Knoten', unlock: (g) => ms(g, 'l_m2'), interval: () => 5, mode: 'time', value: T.lMin, minGain: 1, modes: ['time', 'amount', 'mult'] }),
  prestigeAuto({ id: 'auto_z', layer: 'z', name: 'Fäulnis automatisch wachsen lassen', desc: 'Sobald die Fäulnis reif ist.', where: 'Fäulnis-Knoten', unlock: (g) => ms(g, 'z_m2'), interval: () => 5, mode: 'time', value: T.lMin, minGain: 1, modes: ['time', 'amount', 'mult'] }),
  { id: 'auto_bbuy', name: 'Flechten-/Fäulnis-Upgrades automatisch kaufen', desc: 'Kauft, was am meisten bringt.', kind: 'upg', group: 'l', where: 'Flechten- bzw. Fäulnis-Knoten', unlock: (g) => bMs(g, 3), interval: () => 3, run: buyDeep },
  { id: 'auto_zers', name: 'Automatisch zersetzen', desc: 'Zersetzt Vorrat, sobald ein Humus-Zuwachs von 10 % da wäre.', kind: 'misc', where: 'Fäulnis-Knoten', unlock: (g) => ms(g, 'z_m3'), interval: () => 20, run: (g) => humusGain(g) >= 0.1 * Math.max(1, humus(g)) && zersetzen(g) },
  { id: 'auto_wbuy', name: 'Baum-Upgrades automatisch kaufen', desc: 'Kauft den nützlichsten Baum.', kind: 'upg', group: 'w', where: 'Waldnetz-Knoten', unlock: (g) => ms(g, 'w_1'), interval: () => 3, run: (g) => buyNode(g, 'w') },
  prestigeAuto({ id: 'auto_w', layer: 'w', name: 'Waldnetz automatisch wachsen lassen', desc: 'Sobald das Netz reif ist.', where: 'Waldnetz-Knoten', unlock: (g) => ms(g, 'w_auto'), interval: () => 5, mode: 'time', value: T.wMin, minGain: 1, modes: ['time', 'amount', 'mult'] }),
);

/* ------------------------------------------------------------------ */
/* definition                                                           */
/* ------------------------------------------------------------------ */

const sUnitsOk = (g) => units(g, 's') >= T.fUnitsS;
const mUnitsOk = (g) => units(g, 'm') >= T.fUnitsM;
export const fUnitsReached = (g) => (g.forkIs('a', 's') && sUnitsOk(g)) || (g.forkIs('a', 'm') && mUnitsOk(g));
/** The Fruchtkörper take time: a run must be at least this old (the very first one a day). Makes the cadence independent of how often the player visits. */
export const fMinRun = (g) => (g.state.layers.f.count === 0 ? T.fMinRun1 : T.fMinRun);
export const fAvailable = (g) => fUnitsReached(g) && g.state.layers.f.runTime >= fMinRun(g);

export const def = {
  id: 'myzel',
  title: 'Myzel – Das Netz unter dem Wald',
  version: 2,
  migrations: { 1: (d) => d }, // Paket 1 -> 2: the new keys (fork b, layers l z w r, myz.fAt ...) are filled by mergeDefaults
  autosStartOff: true,
  offlineCapSeconds: T.offlineCap, // fixed, spec: 3 h (engine: Game.offlineCapSeconds; the settings panel hides its offline control)
  rechoose: true,
  currencies: [
    { id: 'n', name: 'Nährstoffe', short: 'N', layer: 0, start: 0 },
    { id: 'h', name: 'Hyphen', short: 'H', layer: 1, start: 0 },
    { id: 's', name: 'Sporen', short: 'S', layer: 2, start: 0 },
    { id: 'm', name: 'Mykorrhiza', short: 'M', layer: 2, start: 0 },
    { id: 'z', name: 'Zucker', short: 'Z', layer: 2, start: 0 },
    { id: 'f', name: 'Fruchtkörper', short: 'F', layer: 3, start: 0 },
    { id: 'l', name: 'Flechten', short: 'L', layer: 4, start: 0 },
    { id: 'fa', name: 'Fäulnis', short: 'Fä', layer: 4, start: 0 },
    { id: 'hu', name: 'Humus', short: 'Hu', layer: 4, start: 0 },
    { id: 'w', name: 'Waldfäden', short: 'W', layer: 5, start: 0 },
    { id: 'r', name: 'Ringe', short: 'R', layer: 6, start: 0 },
  ],
  chains: [],
  income: [
    { currency: 'n', rate: (g, dt) => D(nRate(g) * rainFactor(g, dt)) },
    { currency: 'z', rate: (g, dt) => D(zRate(g) * rainFactor(g, dt)) },
    { currency: 'l', rate: (g) => D(lRate(g)) },
    { currency: 'fa', rate: (g) => D(faRate(g)) },
  ],
  forks: [
    {
      id: 'a', row: 2,
      options: [
        { id: 's', layer: 's', name: 'Sporen', blurb: 'Aktiv: starker Multiplikator je Spore, billiger Reset. Du schaust rein und lässt die Sporen fliegen.' },
        { id: 'm', layer: 'm', name: 'Mykorrhiza', blurb: 'Ruhig: jede Einheit erzeugt Zucker, auch wenn du nicht da bist (bis zur Grenze von 3 Stunden).' },
      ],
      openWhen: (g) => g.state.cur.h.total.gte(T.forkOpenH),
      secondWhen: (g) => ms(g, 'w_a2'),
      reset: { currencies: ['s', 'm', 'z'], nodes: ['s', 'm'] },
    },
    {
      id: 'b', row: 4,
      options: [
        { id: 'l', layer: 'l', name: 'Flechte', blurb: 'Alge und Licht: Du baust ein kleines Räderwerk, das auch ohne dich Flechten erzeugt.' },
        { id: 'z', layer: 'z', name: 'Fäulnis', blurb: 'Totholz und Zersetzen: Was reif ist, fault zu Humus und macht alles danach fruchtbarer.' },
      ],
      openWhen: (g) => cnt(g, 'f') >= T.forkBAt,
      secondWhen: (g) => ms(g, 'w_b2'),
      reset: { currencies: ['l', 'fa', 'hu'], nodes: ['l', 'z'] },
    },
  ],
  layers: [
    {
      id: 'h', name: 'Hyphen', plural: 'Hyphen', verb: 'Ausbreiten', layer: 1, currency: 'h', basis: 'n',
      formula: { threshold: T.hReq, exp: T.hExp }, mult: hGainMult, postMult: ripeness,
      unlockWhen: (g) => g.state.cur.n.total.gte(T.hReq * 0.5),
      blurb: `Das Geflecht breitet sich aus. Nährstoffe werden zurückgesetzt, die Hyphen bleiben. Sie reifen: nach ${Math.round(T.ripeSecs / 60)} Minuten Laufzeit ist der volle Gewinn erreicht.`,
    },
    {
      id: 's', name: 'Sporen', plural: 'Sporen', verb: 'Sporen freisetzen', layer: 2, currency: 's', basis: 'n',
      basisFn: (g) => g.state.cur.n.total.sub(g.state.myz.nAt),
      static: { base: (g) => T.sBase * sCostFactor(g), grow: T.sGrow, exp: T.sExp },
      available: (g) => spOn(g),
      unlockWhen: (g) => g.forkIs('a', 's'),
      blurb: 'Setzt Nährstoffe und Hyphen zurück. Jede Spore verstärkt die Nährstoffe.',
    },
    {
      id: 'm', name: 'Mykorrhiza', plural: 'Mykorrhiza', verb: 'Netz verdichten', layer: 2, currency: 'm', basis: 'n',
      basisFn: (g) => g.state.cur.n.total.sub(g.state.myz.nAt),
      static: { base: T.mBase, grow: T.mGrow, exp: T.mExp },
      available: (g) => myOn(g),
      unlockWhen: (g) => g.forkIs('a', 'm'),
      blurb: 'Setzt Nährstoffe und Hyphen zurück. Jede Einheit erzeugt Zucker, auch wenn du nicht da bist.',
    },
    {
      id: 'f', name: 'Fruchtkörper', plural: 'Fruchtkörper', verb: 'Fruchtkörper bilden', layer: 3, currency: 'f', basis: 'h',
      basisFn: hf,
      formula: { threshold: T.fReq, exp: T.fExp, softcap: { at: T.fCapAt, pow: T.fCapPow } }, mult: fGainMult, postMult: fRipeness,
      available: fAvailable,
      unlockWhen: fUnitsReached,
      unavailableText: (g) => (fUnitsReached(g) ? `Der Pilz muss reifen: noch ${formatDuration(fMinRun(g) - g.state.layers.f.runTime)}.` : `Verlangt ${T.fUnitsS} Sporen oder ${T.fUnitsM} Mykorrhiza.`),
      blurb: `Setzt Nährstoffe, Hyphen, Sporen, Mykorrhiza und Zucker zurück. Die Hyphen-Upgrades und Meilensteine bleiben. Fruchtkörper reifen: nach ${Math.round(T.ripeF / 3600)} Stunden Laufzeit ist der volle Gewinn erreicht (beim ersten Mal dauert es länger).`,
    },
    {
      id: 'l', name: 'Flechte', plural: 'Flechten', verb: 'Flechte wachsen lassen', layer: 4, currency: 'l', basis: 'f', basisFn: fBasis('l'),
      formula: { threshold: T.lReq, exp: T.lExp }, mult: lGainMult,
      available: (g) => lOn(g) && bAvailable(g, 'l'),
      unlockWhen: lOn,
      unavailableText: (g) => `Die Flechte muss reifen: noch ${formatDuration(bMinRun(g) - g.state.layers.l.runTime)}.`,
      blurb: 'Setzt Nährstoffe, Hyphen, Sporen, Mykorrhiza, Zucker und Fruchtkörper zurück. Alle Upgrades bleiben. Algen und Licht arbeiten weiter.',
    },
    {
      id: 'z', name: 'Fäulnis', plural: 'Fäulnis', verb: 'Faulen lassen', layer: 4, currency: 'fa', basis: 'f', basisFn: fBasis('z'),
      formula: { threshold: T.lReq, exp: T.lExp }, mult: zGainMult,
      available: (g) => zOn(g) && bAvailable(g, 'z'),
      unlockWhen: zOn,
      unavailableText: (g) => `Die Fäulnis muss reifen: noch ${formatDuration(bMinRun(g) - g.state.layers.z.runTime)}.`,
      blurb: 'Setzt Nährstoffe, Hyphen, Sporen, Mykorrhiza, Zucker und Fruchtkörper zurück. Alle Upgrades und der Humus bleiben.',
    },
    {
      id: 'w', name: 'Waldnetz', plural: 'Waldfäden', verb: 'Bäume verbinden', layer: 5, currency: 'w', basis: 'l', basisFn: wBasis,
      formula: { threshold: T.wReq, exp: T.wExp }, mult: wGainMult,
      available: wAvailable,
      unlockWhen: (g) => cnt(g, 'l') + cnt(g, 'z') >= 1,
      unavailableText: (g) => `Das Netz muss reifen: noch ${formatDuration(wMinRun(g) - g.state.layers.w.runTime)}.`,
      blurb: 'Setzt alles bis zur Flechte bzw. Fäulnis zurück (Upgrades bleiben). Die Waldfäden bezahlen die Bäume.',
    },
    {
      id: 'r', name: 'Hexenring', plural: 'Ringe', verb: 'Ring schließen', layer: 6, currency: 'r', basis: 'w', basisFn: (g) => g.state.cur.w.total,
      static: { cost: ringCost, maxGain: () => 1 }, noReset: true,
      available: (g) => cnt(g, 'w') >= rings(g) + T.ringW,
      unavailableText: (g) => `Der nächste Ring braucht ${rings(g) + T.ringW} Waldnetze (jetzt ${cnt(g, 'w')}).`,
      unlockWhen: (g) => cnt(g, 'w') >= 1,
      blurb: 'Ein Ring kostet Waldfäden (insgesamt) und setzt nichts zurück. Fünf Ringe schließen den Kreis.',
    },
  ],
  upgrades,
  milestones,
  challenges,
  challengesUnlocked: fOpen,
  achievements: [],
  autos,
  extraState: () => ({
    myz: {
      rain: { charges: T.rainStart, t: 0, n: 0 },
      nAt: ZERO, hAtF: ZERO, hRef: 0,
      fAt: { l: ZERO, z: ZERO }, // Fruchtkörper earned (total) at the last reset of the fork-B layer: its gain counts from there
      zers: 0, // number of Zersetzen
      jr: 0, // Jahresringe (the net grows older: one ring every jrEvery seconds of play time once the Waldnetz is open)
      jrAt: 0, // play time of the next Jahresring (0 = not started)
      end: 0, // play time of the ending (0 = not reached yet)
      endShown: false, // the ending screen was shown
    },
  }),
  settingsDefaults: { confirm: { h: false, s: true, m: true, f: true, l: true, z: true, w: true, r: true } },
  hooks: {
    upgradeDisabled: (g, u) => (u.node === 'h' && g.rule('noH', false)) || ((u.node === 's' || u.node === 'm') && !branchOn(g)),
    onTick: (g, dt) => {
      const r = g.state.myz.rain;
      if (r.t > 0) r.t = Math.max(0, r.t - dt);
      if (r.charges < T.rainMax) r.charges = Math.min(T.rainMax, r.charges + dt / T.rainEvery);
      const m = g.state.myz;
      if (m.jrAt > 0 && g.state.time.played >= m.jrAt) {
        const before = m.jr;
        while (g.state.time.played >= m.jrAt) {
          m.jr += 1;
          m.jrAt += T.jrEvery;
        }
        g.emit('jahresring', { id: 'jr', n: m.jr, gained: m.jr - before });
      }
    },
    onFork: (g, id, opt) => {
      if (!opt) return;
      if (id === 'a') g.state.myz.nAt = g.state.cur.n.total; // the Nährstoffe earned before the choice do not count towards the first unit (no windfall)
      if (id === 'b') {
        g.state.myz.fAt[opt] = g.state.cur.f.total;
        g.grant(opt === 'l' ? 'l' : 'fa', D(T.bStart)); // a seed to start the first buyable (the first run takes half a day) // the Fruchtkörper of the past do not count either; the first run starts now
        g.state.layers[opt].runTime = 0;
        if (!g.state.myz.jrAt) g.state.myz.jrAt = g.state.time.played + T.jrEvery; // from here on the net counts its Jahresringe
      }
    },
    beforePrestige: (g, id) => {
      if (id === 'f') g.state.myz.hRef = hRipeGain(g);
    },
    afterReset: (g, L) => {
      const m = g.state.myz;
      if (L >= 2) m.nAt = g.state.cur.n.total;
      if (L >= 3) m.hAtF = g.state.cur.h.total;
      if (L >= 5) m.fAt = { l: g.state.cur.f.total, z: g.state.cur.f.total };
    },
    onPrestige: (g, id) => {
      const m = g.state.myz;
      if (id === 'l' || id === 'z') {
        m.fAt[id] = g.state.cur.f.total;
        if (cnt(g, 'l') + cnt(g, 'z') === 1) {
          g.state.layers.w.runTime = 0; // the Waldnetz opens with the first lichen / rot: its first run starts now
        }
      }
      if (id === 'r') checkEnding(g);
    },
    onLoad: (g) => {
      checkEnding(g);
    },
  },
};

/** The ring closes: the ending is reached once (the screen is shown by the UI); rings go on afterwards (Nachspiel). */
export const ended = (g) => g.state.myz.end > 0;
export function checkEnding(g) {
  if (!ended(g) && rings(g) >= T.rings) {
    g.state.myz.end = Math.max(1, g.state.time.played);
    g.emit('ending', { id: 'ending' });
  }
}
