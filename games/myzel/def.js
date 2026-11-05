// Myzel - das Netz unter dem Wald: game definition (data + hooks). Pure and DOM-free (runs in Node for tests/sim).
// Paket 1: layers n (Nährstoffe), h (Hyphen), s | m (Gabel A: Sporen | Mykorrhiza), f (Fruchtkörper + Challenges), Regenschauer.
import { D, ONE, ZERO } from '../../engine/decimal.js';
import { prestigeAuto } from '../../engine/kit/game.js';
import { formatNumber } from '../../engine/format.js';
import { TUNE as T } from './tune.js';

const has = (g, id) => g.upgLevel(id) > 0;
const fe = (v) => '×' + formatNumber(v);
const sq = Math.sqrt;
const c = (x) => String(x).replace('.', ','); // number for a German text

/* ------------------------------------------------------------------ */
/* small state readers                                                  */
/* ------------------------------------------------------------------ */

const Hr = (g) => g.state.cur.h.run.toNumber(); // Hyphen earned since the last reset of row 2 (spending does not lower it)
const Nrun = (g) => g.state.cur.n.run.toNumber();
const Ft = (g) => g.state.cur.f.total.toNumber(); // Fruchtkörper earned (never lowered by buying)
const units = (g, id) => g.state.layers[id].units;
const hCount = (g) => g.state.layers.h.count;
const branchOn = (g) => !g.rule('noFork', false); // Kahlschlag switches the fork layers off
const chDone = (g, id) => g.chDone(id);
const ms = (g, id) => g.hasMs(id);

/** Which fork-A branches act (the chosen one; later also the other). */
const spOn = (g) => branchOn(g) && g.forkIs('a', 's');
const myOn = (g) => branchOn(g) && g.forkIs('a', 'm');

/* ------------------------------------------------------------------ */
/* Regenschauer                                                         */
/* ------------------------------------------------------------------ */

export const rainMult = (g) => (ms(g, 'f_wolke') ? T.rainMult2 : T.rainMult);
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

const sPerUnit = (g) => (T.sPer + 0.4 * has(g, 's12') + 0.5 * has(g, 's22a')) * (has(g, 'f13') ? 1.15 : 1) * (chDone(g, 'kahl') ? 1.3 : 1);
const sCostFactor = (g) => (has(g, 's11') ? 1 / 1.5 : 1) * (has(g, 's22b') ? 1 / 1.4 : 1);
const zExpo = (g) => T.zExp + 0.05 * has(g, 'm12') + 0.05 * has(g, 'm22b');

/** Labeled multipliers of the N production (without Zucker, shower and the Dürre exponent), for the details dialog and the objective. */
export function nParts(g) {
  const hr = Hr(g);
  const p = [['Hyphen-Geflecht', Math.pow(1 + hr, T.hBoostExp)]];
  const add = (label, v) => v !== 1 && p.push([label, v]);
  for (const u of g.def.upgrades) if (u.fx === 'n' && g.upgLevel(u.id) > 0) add(u.name, g.upgEffect(u.id));
  if (ms(g, 'h_dicht')) add('Meilenstein Dichte Fäden', 1.5);
  if (spOn(g)) add('Sporen', Math.pow(sPerUnit(g), units(g, 's')));
  if (chDone(g, 'durre')) add('Dürre überstanden', 3);
  if (ms(g, 's_flut') && spOn(g)) add('Sporenflut', 2);
  return p;
}

/** N per second as a plain number. o.noZ: without the sugar boost (base for the sugar production), o.zExtra: sugar added (objective). */
export function nRate(g, o = {}) {
  let r = T.nBase;
  for (const [, v] of nParts(g)) r *= v;
  if (!o.noZ && myOn(g)) r *= Math.pow(1 + g.state.cur.z.run.toNumber() + (o.zExtra || 0), zExpo(g));
  const pw = g.rule('nPow', 1);
  if (pw !== 1) r = Math.pow(r, pw);
  return r;
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

/**
 * Value of the state for the autobuyers (and the sim, which calls the same functions): ln of the Hyphen gain of a run, plus
 * what the upgrades of the fork layers are worth (cheaper Spores, sugar that will have been made within an hour).
 */
export function objective(g) {
  const zExtra = myOn(g) ? zRate(g) * T.zHorizon : 0;
  let v = T.hExp * Math.log(Math.max(nRate(g, { zExtra }), 1e-9)) + Math.log(hGainMult(g));
  if (spOn(g)) v += 0.7 * Math.log(1 / sCostFactor(g));
  if (g.forkIs('a', 'm')) v += 0; // sugar costs are paid in sugar; its worth is in zRate (above)
  return v;
}

/** The value-based autobuyer for the upgrades of one tree node ('h' | 's' | 'm' | 'f'): the same function the autos and the sim call. */
export const buyNode = (g, node) => g.upgBuyBest(node, objective);

/* ------------------------------------------------------------------ */
/* upgrades                                                             */
/* ------------------------------------------------------------------ */

const up = (node, o) => ({ node, group: node, layer: { h: 1, s: 2, m: 2, f: 3 }[node], currency: { h: 'h', s: 's', m: 'z', f: 'f' }[node], ...o });
const cs = (node) => ({ h: T.costScaleH, s: T.costScaleS, m: T.costScaleM, f: T.costScaleF })[node];
const cost = (node, c) => () => Math.ceil(c * cs(node));

// which H upgrades survive a reset of the rows above: the milestones of the chosen branch (s_*/m_*) and of the Fruchtkörper
const rowOf = (id) => Number(id[1]);
const keepH = (id) => (g, L) => {
  if (L >= 3) return ms(g, 'f_keep');
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

const sUp = (o) => up('s', { cost: cost('s', o.cost), ...o });
const sUpgrades = [
  sUp({ id: 's11', name: 'Keimruhe', desc: 'Sporen kosten ÷1,5.', cost: 1, effect: (l) => (l ? 1 / 1.5 : 1), fmt: (e) => '÷' + formatNumber(1 / e) }),
  sUp({ id: 's12', name: 'Sporenfahne', desc: 'Jede Spore wirkt stärker: Basis +0,4.', cost: 2, requires: ['s11'], effect: (l, g) => (l ? sPerUnit(g) : T.sPer), fmt: (e) => 'Basis ' + formatNumber(e) }),
  sUp({ id: 's13', fx: 'n', name: 'Windbestäubung', desc: 'Nährstoffe ×(1 + Sporen)^0,5.', cost: 3, requires: ['s12'], effect: (l, g) => (l ? Math.pow(1 + units(g, 's'), 0.5) : 1), fmt: fe }),
  sUp({ id: 's21', fx: 'h', name: 'Dichter Flor', desc: 'Hyphen-Gewinn ×(1 + Sporen)^0,5.', cost: 4, requires: ['s11'], effect: (l, g) => (l ? Math.pow(1 + units(g, 's'), 0.5) : 1), fmt: fe }),
  sUp({ id: 's22a', name: 'Sprengkraft', desc: 'Jede Spore wirkt stärker: Basis +0,5. Schließt „Streuung“ aus.', cost: 6, requires: ['s21'], excl: ['s22b'], effect: (l, g) => (l ? sPerUnit(g) : T.sPer), fmt: (e) => 'Basis ' + formatNumber(e) }),
  sUp({ id: 's22b', name: 'Streuung', desc: 'Sporen kosten ÷1,4. Schließt „Sprengkraft“ aus.', cost: 6, requires: ['s21'], excl: ['s22a'], effect: (l) => (l ? 1 / 1.4 : 1), fmt: (e) => '÷' + formatNumber(1 / e) }),
];

const mUp = (o) => up('m', { cost: cost('m', o.cost), ...o });
const mUpgrades = [
  mUp({ id: 'm11', name: 'Zuckerrohr', desc: 'Zucker-Erzeugung ×2.', cost: 200, effect: (l) => (l ? 2 : 1), fmt: fe }),
  mUp({ id: 'm12', name: 'Wurzelkuss', desc: 'Zucker verstärkt Nährstoffe stärker (Exponent +0,05).', cost: 800, requires: ['m11'], effect: (l, g) => (l ? zExpo(g) : T.zExp), fmt: (e) => '^' + formatNumber(e) }),
  mUp({ id: 'm13', fx: 'n', name: 'Leitbündel', desc: 'Nährstoffe ×(1 + Mykorrhiza)^0,4.', cost: 3000, requires: ['m12'], effect: (l, g) => (l ? Math.pow(1 + units(g, 'm'), 0.4) : 1), fmt: fe }),
  mUp({ id: 'm21', name: 'Symbiose', desc: 'Zucker-Erzeugung ×(1 + Hyphen)^0,1.', cost: 1500, requires: ['m11'], effect: (l, g) => (l ? Math.pow(1 + Hr(g), T.pH31b) : 1), fmt: fe }),
  mUp({ id: 'm22a', name: 'Tiefenwurzeln', desc: 'Zucker-Erzeugung ×3. Schließt „Feinwurzeln“ aus.', cost: 8000, requires: ['m21'], excl: ['m22b'], effect: (l) => (l ? 3 : 1), fmt: fe }),
  mUp({ id: 'm22b', name: 'Feinwurzeln', desc: 'Zucker verstärkt Nährstoffe stärker (Exponent +0,05). Schließt „Tiefenwurzeln“ aus.', cost: 8000, requires: ['m21'], excl: ['m22a'], effect: (l, g) => (l ? zExpo(g) : T.zExp), fmt: (e) => '^' + formatNumber(e) }),
];

const fUp = (o) => up('f', { cost: cost('f', o.cost), ...o });
const fUpgrades = [
  fUp({ id: 'f11', fx: 'n', name: 'Hutbildung', desc: `Nährstoffe ×(1 + Fruchtkörper)^${c(T.pF11)}.`, cost: 1, effect: (l, g) => (l ? Math.pow(1 + Ft(g), T.pF11) : 1), fmt: fe }),
  fUp({ id: 'f12', fx: 'h', name: 'Fruchtfleisch', desc: `Hyphen-Gewinn ×(1 + Fruchtkörper)^${c(T.pF12)}.`, cost: 2, requires: ['f11'], effect: (l, g) => (l ? Math.pow(1 + Ft(g), T.pF12) : 1), fmt: fe }),
  fUp({ id: 'f13', name: 'Sporenträger', desc: 'Sporen wirken ×1,15 stärker, Zucker-Erzeugung ×1,5.', cost: 4, requires: ['f11'], effect: (l) => (l ? 1.15 : 1), fmt: (e) => (e === 1 ? '×1' : 'Sporen ×1,15, Zucker ×1,5') }),
  fUp({ id: 'f21', fx: 'n', name: 'Lamellen', desc: 'Nährstoffe ×6.', cost: 8, requires: ['f12'], effect: (l) => (l ? 6 : 1), fmt: fe }),
  fUp({ id: 'f22a', fx: 'n', name: 'Dicker Stiel', desc: `Nährstoffe ×(1 + Fruchtkörper)^${c(T.pF22a)}. Schließt „Breiter Hut“ aus.`, cost: 15, requires: ['f21'], excl: ['f22b'], effect: (l, g) => (l ? Math.pow(1 + Ft(g), T.pF22a) : 1), fmt: fe }),
  fUp({ id: 'f22b', fx: 'h', name: 'Breiter Hut', desc: `Hyphen-Gewinn ×(1 + Fruchtkörper)^${c(T.pF22b)}. Schließt „Dicker Stiel“ aus.`, cost: 15, requires: ['f21'], excl: ['f22a'], effect: (l, g) => (l ? Math.pow(1 + Ft(g), T.pF22b) : 1), fmt: fe }),
];

const upgrades = [...hUpgrades, ...sUpgrades, ...mUpgrades, ...fUpgrades];

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
  mile('s_keep1', 's', uc('s', 1), '1 Spore', 'Die erste Reihe der Hyphen-Upgrades bleibt bei einer Sporenwolke erhalten.'),
  mile('s_keep2', 's', uc('s', 3), '3 Sporen', 'Auch die zweite Reihe bleibt erhalten.'),
  mile('s_keep3', 's', uc('s', 5), '5 Sporen', 'Alle Hyphen-Upgrades bleiben erhalten.'),
  mile('s_flut', 's', uc('s', 7), '7 Sporen', 'Sporenflut: Nährstoffe ×2.'),
  mile('m_keep1', 'm', uc('m', 1), '1 Mykorrhiza', 'Die erste Reihe der Hyphen-Upgrades bleibt bei einem Schub erhalten.'),
  mile('m_keep2', 'm', uc('m', 3), '3 Mykorrhiza', 'Auch die zweite Reihe bleibt erhalten.'),
  mile('m_keep3', 'm', uc('m', 5), '5 Mykorrhiza', 'Alle Hyphen-Upgrades bleiben erhalten.'),
  mile('m_netz', 'm', uc('m', 7), '7 Mykorrhiza', 'Myzelnetz: Zucker-Erzeugung ×2.'),
  mile('f_keep', 'f', lc('f', 1), '1 Fruchtkörper', 'Hyphen-Upgrades bleiben beim Bilden von Fruchtkörpern erhalten. Die Challenges sind offen.'),
  mile('f_buy', 'f', lc('f', 2), '2 Fruchtkörper', 'Hyphen-Upgrades können automatisch gekauft werden.'),
  mile('f_auto', 'f', lc('f', 3), '3 Fruchtkörper', 'Die Ausbreitung kann automatisch laufen.'),
  mile('f_wolke', 'f', lc('f', 4), '4 Fruchtkörper', `Wolkenbruch: Regenschauer wirken ×${T.rainMult2} statt ×${T.rainMult}.`),
];

/* ------------------------------------------------------------------ */
/* challenges                                                           */
/* ------------------------------------------------------------------ */

const hf = (g) => g.state.cur.h.total.sub(g.state.myz.hAtF);
const fOpen = (g) => g.state.layers.f.count >= 1;
const challenges = [
  {
    id: 'durre', name: 'Dürre', resetLayer: 3, rules: { nPow: T.chDurrePow },
    desc: 'Die Nährstoff-Produktion wird zur Wurzel (^0,5).', goal: { currency: 'h', amount: T.chK[0] * T.fReq, fn: hf },
    reward: 'Nährstoffe dauerhaft ×3.', unlock: fOpen, lockText: '1 Fruchtkörper',
  },
  {
    id: 'frost', name: 'Frost', resetLayer: 3, rules: { noH: true },
    desc: 'Die Hyphen-Upgrades sind eingefroren.', goal: { currency: 'h', amount: T.chK[1] * T.fReq, fn: hf },
    reward: 'Hyphen-Gewinn dauerhaft ×2.', unlock: (g) => g.chDone('durre'), lockText: 'Dürre überstanden',
  },
  {
    id: 'kahl', name: 'Kahlschlag', resetLayer: 3, rules: { noFork: true },
    desc: 'Sporen und Mykorrhiza ruhen: keine Wirkung, keine neuen.', goal: { currency: 'h', amount: T.chK[2] * T.fReq, fn: hf },
    reward: 'Sporen und Zucker dauerhaft stärker (Sporen ×1,3, Zucker ×1,5).', unlock: (g) => g.chDone('frost'), lockText: 'Frost überstanden',
  },
];

/* ------------------------------------------------------------------ */
/* autos                                                                */
/* ------------------------------------------------------------------ */

const autos = [
  { id: 'auto_hbuy', name: 'Hyphen-Upgrades automatisch kaufen', desc: 'Kauft das Upgrade mit dem besten Nutzen.', kind: 'upg', group: 'h', where: 'Hyphen-Ebene', unlock: (g) => ms(g, 'f_buy'), interval: () => 2, run: (g) => buyNode(g, 'h') },
  prestigeAuto({ id: 'auto_h', layer: 'h', name: 'Automatisch ausbreiten', desc: 'Breitet sich aus, sobald die Bedingung erfüllt ist.', where: 'Hyphen-Ebene', unlock: (g) => ms(g, 'f_auto'), interval: () => 1, mode: 'time', value: T.autoHTime, minGain: 1, modes: ['time', 'amount', 'mult'] }),
];

/* ------------------------------------------------------------------ */
/* definition                                                           */
/* ------------------------------------------------------------------ */

const sUnitsOk = (g) => units(g, 's') >= T.fUnitsS;
const mUnitsOk = (g) => units(g, 'm') >= T.fUnitsM;
export const fAvailable = (g) => (g.forkIs('a', 's') && sUnitsOk(g)) || (g.forkIs('a', 'm') && mUnitsOk(g));

export const def = {
  id: 'myzel',
  title: 'Myzel – Das Netz unter dem Wald',
  version: 1,
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
  ],
  chains: [],
  income: [
    { currency: 'n', rate: (g, dt) => D(nRate(g) * rainFactor(g, dt)) },
    { currency: 'z', rate: (g, dt) => D(zRate(g) * rainFactor(g, dt)) },
  ],
  forks: [
    {
      id: 'a', row: 2,
      options: [
        { id: 's', layer: 's', name: 'Sporen', blurb: 'Aktiv: starker Multiplikator je Spore, billiger Reset. Du schaust rein und lässt die Sporen fliegen.' },
        { id: 'm', layer: 'm', name: 'Mykorrhiza', blurb: 'Ruhig: jede Einheit erzeugt Zucker, auch wenn du nicht da bist (bis zur Grenze von 3 Stunden).' },
      ],
      openWhen: (g) => g.state.cur.h.total.gte(T.forkOpenH),
      reset: { currencies: ['s', 'm', 'z'], nodes: ['s', 'm'] },
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
      formula: { threshold: T.fReq, exp: T.fExp }, mult: () => 1,
      available: fAvailable,
      unlockWhen: fAvailable,
      unavailableText: `Verlangt ${T.fUnitsS} Sporen oder ${T.fUnitsM} Mykorrhiza.`,
      blurb: 'Setzt alles darunter zurück (Hyphen, Sporen, Mykorrhiza, Zucker). Die Meilensteine behältst du.',
    },
  ],
  upgrades,
  milestones,
  challenges,
  challengesUnlocked: fOpen,
  achievements: [],
  autos,
  extraState: () => ({ myz: { rain: { charges: T.rainStart, t: 0, n: 0 }, nAt: ZERO, hAtF: ZERO } }),
  settingsDefaults: { confirm: { h: false, s: true, m: true, f: true } },
  hooks: {
    upgradeDisabled: (g, u) => (u.node === 'h' && g.rule('noH', false)) || ((u.node === 's' || u.node === 'm') && !branchOn(g)),
    onTick: (g, dt) => {
      const r = g.state.myz.rain;
      if (r.t > 0) r.t = Math.max(0, r.t - dt);
      if (r.charges < T.rainMax) r.charges = Math.min(T.rainMax, r.charges + dt / T.rainEvery);
    },
    afterReset: (g, L) => {
      const m = g.state.myz;
      if (L >= 2) m.nAt = g.state.cur.n.total;
      if (L >= 3) m.hAtF = g.state.cur.h.total;
    },
  },
};
