// Replikator - game definition (data + hooks). Pure, DOM-free: runs in Node for tests and simulation.
import { D, Decimal, ONE, ZERO } from '../../engine/decimal.js';
import { prestigeAuto } from '../../engine/kit/game.js';
import { formatNumber as fmt, formatMult, formatPercent } from '../../engine/format.js';
import { TUNE as T } from './tune.js';
import { STORY, CHAPTERS } from './story.js';
import { rep2State, migrateToRep2, productionParts, gainMult, autoClaim, claimedCount, act2Check, mapTick, holdSingularity } from './map.js';
import { mutParts, mutGain, mutTier, mutCostDiv, mutBundle, mutAutoSlow, mutExtra, mutTick, mutChoose as chooseMutation, mutAutoRun, mutUnlocked, migrateToMut } from './mutations.js';

/** Active level of an upgrade (0 while suppressed by a challenge). */
const lvl = (g, id) => (g.upgActive(id) ? g.upgLevel(id) : 0);
const act = (g, id) => g.upgActive(id);
const pow = (a, b) => Decimal.pow(a, b);

/* ------------------------------------------------------------------ */
/* Multiplier model (single source of truth for production and UI)    */
/* ------------------------------------------------------------------ */

export function bpBoostExp(g) {
  return T.bpBoostExp + 0.03 * lvl(g, 'katalog') + 0.03 * lvl(g, 'archive');
}

/** (1+x)^e, but beyond `cap` the exponent halves (soft cap keeps late loops from running away). */
export function boost(x, e, cap) {
  if (x.lte(cap)) return x.add(1).pow(e);
  return D(cap + 1).pow(e).mul(x.div(cap).pow(e / 2));
}

/** Labeled global production multipliers. Returned parts are multiplied for the total. */
export function globalParts(g) {
  const s = g.state;
  const parts = [];
  const bp = s.cur.blueprints.run;
  if (!g.rule('noBpBoost', false)) parts.push(['Blaupausen', boost(bp, bpBoostExp(g), T.bpCap)]);
  parts.push(['Sternsysteme', boost(s.cur.systems.run, T.sysBoostExp + 0.1 * lvl(g, 'sternkarten'), T.sysCap)]);
  parts.push(['Quantenkerne', boost(s.cur.cores.total, T.coreBoostExp, T.coreCap)]);
  parts.push(['Erfolge', D(1 + 0.02 * g.achCount())]);
  if (lvl(g, 'tick')) parts.push(['Tick-Beschleuniger', pow(1.15, lvl(g, 'tick'))]);
  if (act(g, 'resonanz')) parts.push(['Materie-Resonanz', D(1 + Math.max(0, s.cur.matter.run.log10()) / 5)]);
  if (lvl(g, 'generationen')) parts.push(['Generationen', pow(1.25, lvl(g, 'generationen'))]);
  if (act(g, 'kern')) parts.push(['Reaktor', D(5)]);
  if (act(g, 'a_dichte')) parts.push(['Verdichtete Materie', D(5)]);
  if (act(g, 'a_fluss')) parts.push(['Quantenfluss', s.cur.cores.total.add(1).pow(0.5).mul(3)]);
  if (act(g, 'a_schmiede')) parts.push(['Singularitätsschmiede', D(30)]);
  if (act(g, 'z_horizont')) parts.push(['Ereignishorizont', D(100)]);
  const ch = challengeGlobal(g);
  if (ch.gt(1)) parts.push(['Herausforderungen', ch]);
  parts.push(...productionParts(g)); // Akt II: Pulsare, Ruinen, Anomalien (map.js)
  parts.push(...mutParts(g)); // Akt II: Mutationen (mutations.js)
  return parts;
}

/** Persistent "strength" proxy (log10) used by Auto-Challenges to decide when a failed challenge is worth another try. */
export function chPower(g) {
  const s = g.state.cur;
  return s.systems.total.add(1).log10() + 1.5 * s.cores.total.add(1).log10() + 0.3 * g.chDoneCount();
}

export function challengeGlobal(g) {
  let m = ONE;
  if (g.chDone('c_hand')) m = m.mul(3);
  if (g.chDone('c_dunkel')) m = m.mul(5);
  if (g.chDone('c_gipfel')) m = m.mul(10);
  return act(g, 'd_pruef') ? m.pow(1.5) : m;
}

export function tierMult(g, i) {
  let m = ONE;
  if (i === 0 && act(g, 'bohrer')) m = m.mul(3);
  if (i === 1 && act(g, 'schmelzer')) m = m.mul(3);
  if ((i === 2 || i === 3) && act(g, 'fliess')) m = m.mul(2);
  if (i <= 3 && g.chDone('c_enge')) m = m.mul(1.5);
  if (i <= 3 && act(g, 'kolonien')) m = m.mul(2);
  if (i >= 4 && act(g, 'dysonnetz')) m = m.mul(2);
  return m.mul(mutTier(g, i));
}

export function startMatter(g) {
  let best = 10;
  for (const [id, v] of T.startMatter) if (g.hasMs(id)) best = Math.max(best, v);
  const b = lvl(g, 'bruecken');
  const fromUpg = b ? D(T.bruckenkopf[b - 1]) : D(0);
  return fromUpg.max(best);
}

function autoInterval(g) {
  let t = 1;
  t *= Math.pow(0.5, lvl(g, 'speed'));
  if (g.chDone('c_hand')) t *= 0.5;
  if (act(g, 'c_schnell')) t *= 0.25;
  return Math.max(0.05, t * mutAutoSlow(g));
}

/* ------------------------------------------------------------------ */
/* Upgrade autobuyer objective (shared by the in-game autos and the sim) */
/* ------------------------------------------------------------------ */

/**
 * Matter income a few seconds from now (log10): tier 0's rate plus what the higher tiers will have added after `T.objHorizon` s
 * (Taylor series of the generator chain). Unlike the plain rate this sees multipliers on higher tiers (Fließband, Dyson-Netz)
 * before the tier-0 rate has caught up with them.
 */
function matterStrength(g) {
  const gs = g.state.gens.matter;
  const mult = g.cache.mult.matter;
  const n = g.cache.maxTier.matter;
  let sum = ZERO;
  let coef = ONE;
  for (let k = 0; k < n; k++) {
    coef = k === 0 ? mult[0] : coef.mul(mult[k]).mul(T.objHorizon / k);
    sum = sum.add(gs[k].amount.mul(coef));
  }
  return sum.m > 0 ? sum.log10() : -300;
}

/**
 * How strong is the current state (log10)? The autobuyer for BP / expansion upgrades (`upgBuyBest`) buys the upgrade whose rise of
 * this value per cost is best, so every effect only has to show up here once:
 *  - production (matter strength) incl. bundle, tier and global multipliers,
 *  - cost reductions (`T.objCostW` per decade of generator cost divisor) and the Brückenkopf start matter,
 *  - unlocked generator tiers beyond the first four, Autokauf-Upgrades and the autobuyer speed (they do not change income yet),
 *  - prestige gain multipliers, weighted by how much of that gain comes back as production through the boost chain
 *    (BP -> BP boost and Sternsysteme, Sternsysteme -> boost and Quantenkerne). The Quantenkern gain only counts once the layer is open.
 */
export function repObjective(g) {
  let v = matterStrength(g);
  const div = g.hooks.genCostDiv(g);
  v += T.objCostW * (div.m > 0 ? div.log10() : 0);
  v += T.objStartW * Math.max(0, startMatter(g).log10());
  v += T.objTierW * g.def.chains[0].tiers.filter((t, i) => i >= 4 && i < g.cache.maxTier.matter && (!t.unlock || t.unlock(g))).length;
  v += T.objAutoW * (['auto1', 'auto2', 'auto3', 'auto4'].filter((id) => g.upgLevel(id) > 0).length - Math.log2(autoInterval(g)) / 4);
  const wCore = T.coreBoostExp;
  const wSys = T.sysBoostExp + 0.1 * lvl(g, 'sternkarten') + (g.layerUnlocked('singularity') ? T.singExp * wCore : 0);
  const wBp = bpBoostExp(g) + T.expExp * wSys;
  const lg = (id) => {
    const m = g.prestigeMult(id);
    return m.m > 0 ? m.log10() : 0;
  };
  v += wBp * lg('replication') + wSys * lg('expansion');
  if (g.layerUnlocked('singularity')) v += wCore * lg('singularity');
  return v;
}

/** Blaupausen- / Expansions-Upgrades: used by the in-game autobuyers AND the sim (same logic, same result). */
export const buyRepUpgrades = (g, group) => g.upgBuyBest(group, repObjective);

/** Akt II: claim the best affordable sector (value = rise of repObjective). The Auto-Erkundung AND the sim's player call exactly this. */
export const mapAutoClaim = (g) => autoClaim(g, repObjective);
/**
 * Akt II: strength for valuing a mutation card = repObjective plus the effects it cannot see (offer rate, trip time, sector price, Nachtschwärmer's offline
 * share, see mutations.js mutExtra). The Auto-Genom AND the sim's player call mutChoose / mutAutoRun, which value every way to take a card with this.
 */
export const mutObjective = (g) => repObjective(g) + mutExtra(g);
export const mutChoose = (g) => chooseMutation(g, mutObjective);
export const mutAutoGenom = (g) => mutAutoRun(g, mutObjective);

/** Auto-Singularität and the sim's player both wait for the next sector (map.js holdSingularity). */
export const singularityHeld = (g) => holdSingularity(g);

/* ------------------------------------------------------------------ */
/* Definition                                                          */
/* ------------------------------------------------------------------ */

const bpUpg = (o) => ({ group: 'replication', layer: 1, currency: 'blueprints', ...o });
const exUpg = (o) => ({ group: 'expansion', layer: 2, currency: 'systems', keep: keepEx, ...o });
const rsUpg = (o) => ({ group: 'research', layer: 3, currency: 'cores', max: 1, ...o });

// BP upgrades that survive an Expansion with milestone ex1 (automation + tier unlocks)
const keepEx1 = (g, L) => L >= 2 && g.hasMs('ex1');
const keepAll = (g, L) => L >= 2 && g.hasMs('ex3');
const keepBp = keepAll;
const keepEx = (g, L) => L >= 3 && g.hasMs('s1');

const tierNames = ['Bohrdrohne', 'Schmelzer', 'Fabrik', 'Montagewerk', 'Werft', 'Orbitalwerft', 'Dyson-Segment', 'Sternschmiede'];
const tierDescs = [
  'Kratzt Erz von Asteroiden.',
  'Schmilzt Gestein zu Bohrdrohnen.',
  'Fertigt Schmelzer am Fließband.',
  'Setzt ganze Fabriken zusammen.',
  'Baut Montagewerke im Dutzend.',
  'Werften im freien Fall – baut Werften.',
  'Fängt Sternenlicht und fertigt Orbitalwerften.',
  'Schmiedet Dyson-Segmente aus Sternenstaub.',
];

const autoGens = tierNames.map((n, i) => ({
  id: 'auto_gen' + i,
  name: 'Autokauf: ' + n,
  desc: 'Kauft ' + n + ' automatisch.',
  group: 'gen',
  kind: 'gen',
  tier: i,
  // owned, not "active": the autobuyers keep working in "Ohne Baupläne" (only Handarbeit switches automation off)
  unlock: (g) => g.upgLevel(['auto1', 'auto1', 'auto2', 'auto2', 'auto3', 'auto3', 'auto4', 'auto4'][i]) > 0,
  interval: autoInterval,
  run: (g) => {
    g.genBuy('matter', i, 'max');
  },
}));

export const def = {
  id: 'replikator',
  title: 'Replikator',
  version: 4,

  // v1 -> v2: the one-line story became a Chronik (chronicle.read / chronicle.shown). Entries a v1 save has already seen count as read AND shown,
  // so nobody gets old modals or bubbles again. `backfill` makes hooks.onLoad record the new entries whose condition is already true silently
  // (see Game.storyBackfill): no modal, no bubble, but unread in the Chronik.
  migrations: {
    1: (data) => {
      const seen = {};
      for (const [id, t] of Object.entries(data.story || {})) if (t !== undefined && t !== false) seen[id] = true;
      const c = data.chronicle && typeof data.chronicle === 'object' ? data.chronicle : {};
      data.chronicle = { ...c, read: { ...seen, ...(c.read || {}) }, shown: { ...seen, ...(c.shown || {}) }, backfill: true };
      data.v = 2;
      return data;
    },
    // v2 -> v3: Akt II (state.rep2: map, seed, anchor). A save that already finished version 1 starts Akt II at the next load (hooks.onLoad).
    2: migrateToRep2,
    // v3 -> v4: Mutationen (state.rep2.mut via mergeDefaults; the offer stream gets a seed derived from the map seed)
    3: migrateToMut,
  },

  extraState: rep2State,

  currencies: [
    { id: 'matter', name: 'Materie', layer: 0, start: 10 },
    { id: 'blueprints', name: 'Blaupausen', short: 'BP', layer: 1, start: 0 },
    { id: 'systems', name: 'Sternsysteme', short: 'Sys', layer: 2, start: 0 },
    { id: 'cores', name: 'Quantenkerne', short: 'QK', layer: 3, start: 0 },
  ],

  chains: [
    {
      id: 'matter',
      currency: 'matter',
      layer: 0,
      bundle: 10,
      bundleMult: 2,
      tiers: tierNames.map((name, i) => ({
        name,
        desc: tierDescs[i],
        baseCost: T.baseCost[i],
        costMult: T.costMult[i],
        unlock: i === 4 || i === 5 ? (g) => act(g, 'docks') : i >= 6 ? (g) => act(g, 'dyson') : null,
      })),
    },
  ],

  layers: [
    {
      id: 'replication',
      name: 'Replikation',
      plural: 'Replikationen',
      verb: 'Replizieren',
      layer: 1,
      currency: 'blueprints',
      basis: 'matter',
      formula: { threshold: T.repThreshold, exp: T.repExp, softcap: T.repSoftcap },
      mult: (g) => {
        let m = gainMult(g, 'blueprints').mul(mutGain(g, 'blueprints'));
        if (g.upgActive('logistik')) m = m.mul(pow(2, lvl(g, 'logistik')));
        if (g.chDone('c_ohne_bp')) m = m.mul(2);
        if (act(g, 'b_ernte')) m = m.mul(3);
        if (g.hasMs('ex20')) m = m.mul(2);
        return m;
      },
      blurb: 'Setze Materie und Generatoren zurück und erhalte Blaupausen.',
    },
    {
      id: 'expansion',
      name: 'Expansion',
      plural: 'Expansionen',
      verb: 'Expandieren',
      layer: 2,
      currency: 'systems',
      basis: 'blueprints',
      formula: { threshold: T.expThreshold, exp: (g) => T.expExp + (act(g, 'b_entropie') ? 0.05 : 0), softcap: T.expSoftcap },
      mult: (g) => {
        let m = gainMult(g, 'systems').mul(mutGain(g, 'systems'));
        if (g.chDone('c_zeitlupe')) m = m.mul(2);
        if (act(g, 'b_ernte')) m = m.mul(3);
        return m;
      },
      blurb: 'Setze Replikation zurück und besiedle neue Sternsysteme.',
    },
    {
      id: 'singularity',
      name: 'Singularität',
      plural: 'Singularitäten',
      verb: 'Kollabieren',
      layer: 3,
      currency: 'cores',
      basis: 'systems',
      unlockWhen: (g) => g.state.cur.systems.total.gte(T.singUnlock),
      formula: { threshold: T.singThreshold, exp: (g) => T.singExp + (act(g, 'b_entropie') ? 0.05 : 0), softcap: T.singSoftcap },
      mult: (g) => {
        let m = gainMult(g, 'cores').mul(mutGain(g, 'cores'));
        if (g.chDone('c_gipfel')) m = m.mul(2);
        m = m.mul(pow(2, lvl(g, 'kernbau')));
        m = m.mul(pow(T.kernverdichterMult, lvl(g, 'kernverdichter')));
        if (g.hasMs('s2')) m = m.mul(1 + T.singEcho * g.state.layers.singularity.count);
        if (g.hasMs('s5')) m = m.mul(1.5);
        return m;
      },
      blurb: 'Setze alles zurück und verdichte die Galaxie zu Quantenkernen. Ab der 2. Singularität wächst der Gewinn mit jeder bisherigen.',
    },
  ],

  /* ----------------------------- upgrades ----------------------------- */
  upgrades: [
    // --- Replikation (Blaupausen) ---
    bpUpg({ id: 'bohrer', name: 'Diamantbohrer', desc: 'Bohrdrohnen produzieren ×3.', cost: 1, keep: keepBp }),
    bpUpg({ id: 'schmelzer', name: 'Plasmaschmelzer', desc: 'Schmelzer produzieren ×3.', cost: 2, requires: ['bohrer'], keep: keepBp }),
    bpUpg({ id: 'auto1', name: 'Autokauf I', desc: 'Kauft Bohrdrohnen und Schmelzer automatisch.', cost: T.auto1, keep: keepEx1 }),
    bpUpg({ id: 'fliess', name: 'Fließbandfertigung', desc: 'Fabriken und Montagewerke produzieren ×2.', cost: 6, requires: ['schmelzer'], keep: keepBp }),
    bpUpg({
      id: 'kompress',
      name: 'Kostenkompression',
      desc: 'Basiskosten aller Generatoren ÷1,6 pro Stufe.',
      max: 5,
      cost: (l) => 12 * Math.pow(3.5, l),
      effect: (l) => pow(1.6, l),
      fmt: (e) => 'Kosten ÷' + fmt(e),
      keep: keepBp,
    }),
    bpUpg({ id: 'docks', name: 'Orbitale Docks', desc: 'Schaltet Werft und Orbitalwerft frei (Stufe 5–6).', cost: T.docks, keep: keepEx1 }),
    bpUpg({
      id: 'tick',
      name: 'Tick-Beschleuniger',
      desc: 'Gesamte Produktion ×1,15 pro Stufe.',
      max: 20,
      cost: (l) => T.tickBase * Math.pow(T.tickGrow, l),
      effect: (l) => pow(1.15, l),
      fmt: (e) => formatMult(e),
      keep: keepBp,
    }),
    bpUpg({ id: 'auto2', name: 'Autokauf II', desc: 'Kauft Fabriken und Montagewerke automatisch.', cost: T.auto2, requires: ['auto1'], keep: keepEx1 }),
    bpUpg({
      id: 'resonanz',
      name: 'Materie-Resonanz',
      desc: 'Produktion ×(1 + log10(Materie) ÷ 5).',
      cost: T.resonanz,
      effect: (l, g) => (l ? D(1 + Math.max(0, g.state.cur.matter.run.log10()) / 5) : D(1)),
      fmt: (e) => formatMult(e),
      keep: keepBp,
    }),
    bpUpg({
      id: 'katalog',
      name: 'Blaupausen-Katalog',
      desc: 'Der Blaupausen-Bonus wächst stärker (Exponent +0,03).',
      max: 5,
      cost: (l) => 30 * Math.pow(4, l),
      effect: (l, g) => bpBoostExp(g),
      fmt: (e) => 'Exponent ' + fmt(e, { sig: 3 }),
      keep: keepBp,
    }),
    bpUpg({ id: 'auto3', name: 'Autokauf III', desc: 'Kauft Werften und Orbitalwerften automatisch.', cost: T.auto3, requires: ['docks', 'auto2'], keep: keepEx1 }),
    bpUpg({
      id: 'buendel',
      name: 'Bündel-Optimierung',
      desc: 'Der Bonus pro 10er-Bündel steigt um 0,05.',
      max: 3,
      cost: (l) => T.buendel * Math.pow(6, l),
      effect: (l) => 2 + 0.05 * l,
      fmt: (e) => 'Bündelbonus ×' + fmt(e),
      keep: keepBp,
    }),
    bpUpg({ id: 'dyson', name: 'Dyson-Protokoll', desc: 'Schaltet Dyson-Segment und Sternschmiede frei (Stufe 7–8).', cost: T.dyson, requires: ['docks'], keep: keepEx1 }),
    bpUpg({ id: 'auto4', name: 'Autokauf IV', desc: 'Kauft Dyson-Segmente und Sternschmieden automatisch.', cost: T.auto4, requires: ['dyson', 'auto3'], keep: keepEx1 }),

    // --- Expansion (Sternsysteme) ---
    exUpg({
      id: 'logistik',
      name: 'Galaktische Logistik',
      desc: 'Blaupausen-Gewinn ×2 pro Stufe.',
      max: 4,
      cost: (l) => Math.pow(3, l),
      effect: (l) => pow(2, l),
      fmt: (e) => 'Gewinn ' + formatMult(e),
    }),
    exUpg({ id: 'kolonien', name: 'Kolonienetz', desc: 'Stufen 1–4 produzieren ×2.', cost: 2 }),
    exUpg({
      id: 'bruecken',
      name: 'Brückenkopf',
      desc: 'Jede Replikation startet mit viel Materie (1e5 / 1e8 / 1e11).',
      max: 3,
      cost: (l) => [3, 20, 120][l],
      effect: (l) => (l ? D(T.bruckenkopf[l - 1]) : D(0)),
      fmt: (e) => 'Start: ' + fmt(e),
    }),
    exUpg({ id: 'dysonnetz', name: 'Dyson-Netz', desc: 'Stufen 5–8 produzieren ×2.', cost: 8 }),
    exUpg({
      id: 'archive',
      name: 'Tiefe Archive',
      desc: 'Blaupausen-Bonus: Exponent +0,03 pro Stufe.',
      max: 4,
      cost: (l) => 4 * Math.pow(3.5, l),
      effect: (l, g) => bpBoostExp(g),
      fmt: (e) => 'Exponent ' + fmt(e, { sig: 3 }),
    }),
    exUpg({
      id: 'handel',
      name: 'Handelsrouten',
      desc: 'Basiskosten aller Generatoren ÷3 pro Stufe.',
      max: 4,
      cost: (l) => 6 * Math.pow(4, l),
      effect: (l) => pow(3, l),
      fmt: (e) => 'Kosten ÷' + fmt(e),
    }),
    exUpg({
      id: 'sternkarten',
      name: 'Sternenkarten',
      desc: 'Sternsystem-Bonus: Exponent +0,1 pro Stufe.',
      max: 3,
      cost: (l) => 10 * Math.pow(5, l),
      effect: (l) => T.sysBoostExp + 0.1 * l,
      fmt: (e) => 'Exponent ' + fmt(e, { sig: 3 }),
    }),
    exUpg({
      id: 'generationen',
      name: 'Generationen',
      desc: 'Gesamte Produktion ×1,25 pro Stufe.',
      max: 12,
      cost: (l) => 12 * Math.pow(2.2, l),
      effect: (l) => pow(1.25, l),
      fmt: (e) => formatMult(e),
    }),
    exUpg({
      id: 'buendel2',
      name: 'Bündel II',
      desc: 'Der Bonus pro 10er-Bündel steigt um 0,02 pro Stufe.',
      max: 4,
      cost: (l) => 40 * Math.pow(5, l),
      effect: (l) => 0.02 * l,
      fmt: (e) => '+' + fmt(e, { sig: 2 }),
    }),
    exUpg({
      id: 'speed',
      name: 'Schnellere Automaten',
      desc: 'Autokauf-Intervall halbiert sich pro Stufe.',
      max: 3,
      cost: (l) => 15 * Math.pow(5, l),
      effect: (l) => Math.pow(0.5, l),
      fmt: (e) => fmt(e, { sig: 3 }) + ' s',
    }),
    exUpg({
      id: 'kernbau',
      name: 'Kernfertigung',
      desc: 'Quantenkern-Gewinn ×2 pro Stufe.',
      max: 3,
      cost: (l) => 200 * Math.pow(10, l),
      effect: (l) => pow(2, l),
      fmt: (e) => 'Gewinn ' + formatMult(e),
    }),
    exUpg({
      id: 'kernverdichter',
      name: 'Kernverdichter',
      desc: 'Quantenkern-Gewinn ×1,5 pro Stufe.',
      max: 6,
      cost: (l) => T.kernverdichterCost * Math.pow(3.5, l),
      effect: (l) => pow(T.kernverdichterMult, l),
      fmt: (e) => 'Gewinn ' + formatMult(e),
    }),

    // --- Forschung (Quantenkerne) ---
    rsUpg({ id: 'kern', name: 'Quantenkern-Reaktor', desc: 'Produktion ×5. Öffnet die Forschungszweige.', cost: 2 }),
    // Zweig A: Masse
    rsUpg({ id: 'a_dichte', name: 'Verdichtete Materie', desc: 'Produktion ×5.', cost: 8, requires: ['kern'], branch: 'A' }),
    rsUpg({ id: 'a_fluss', name: 'Quantenfluss', desc: 'Produktion ×3 und wächst mit Quantenkernen.', cost: 40, requires: ['a_dichte'], branch: 'A' }),
    rsUpg({
      id: 'a_schmiede',
      name: 'Singularitätsschmiede',
      desc: 'Produktion ×30. Schließt „Entropie-Ernte“ aus.',
      cost: 300,
      requires: ['a_fluss'],
      excl: ['b_entropie'],
      branch: 'A',
    }),
    // Zweig B: Effizienz
    rsUpg({ id: 'b_ernte', name: 'Doppelte Ernte', desc: 'Gewinn von Blaupausen und Sternsystemen ×3.', cost: 8, requires: ['kern'], branch: 'B' }),
    rsUpg({ id: 'b_kosten', name: 'Billige Replikate', desc: 'Basiskosten aller Generatoren ÷30.', cost: 40, requires: ['b_ernte'], branch: 'B' }),
    rsUpg({
      id: 'b_entropie',
      name: 'Entropie-Ernte',
      desc: 'Gewinn-Exponenten von Expansion und Singularität +0,05. Schließt „Singularitätsschmiede“ aus.',
      cost: 300,
      requires: ['b_kosten'],
      excl: ['a_schmiede'],
      branch: 'B',
    }),
    // Zweig C: Automation
    rsUpg({ id: 'c_auto', name: 'Autopilot', desc: 'Schaltet die automatische Singularität frei.', cost: 10, requires: ['kern'], branch: 'C' }),
    rsUpg({ id: 'c_schnell', name: 'Schnelle Automaten', desc: 'Autokauf-Intervall ÷4.', cost: 60, requires: ['c_auto'], branch: 'C' }),
    rsUpg({ id: 'c_zeit', name: 'Zeitschleife', desc: 'Offline-Limit +48 Stunden.', cost: 400, requires: ['c_schnell'], branch: 'C' }),
    // Quer: Verstärker + Finale
    rsUpg({
      id: 'd_pruef',
      name: 'Prüfstand-Kalibrierung',
      desc: 'Globale Challenge-Belohnungen werden ^1,5 genommen.',
      cost: 100,
      requiresAny: ['a_fluss', 'b_kosten'],
      branch: 'D',
    }),
    rsUpg({
      id: 'z_horizont',
      name: 'Ereignishorizont',
      desc: 'Produktion ×100.',
      cost: 1500,
      requires: ['c_zeit', 'd_pruef'],
      requiresAny: ['a_schmiede', 'b_entropie'],
      branch: 'D',
    }),
  ],

  /* ----------------------------- milestones ----------------------------- */
  milestones: [
    { id: 'rep1', layer: 'replication', at: 1, name: '1 Replikation', desc: 'Jede Replikation startet mit 100 Materie.' },
    { id: 'rep5', layer: 'replication', at: 5, name: '5 Replikationen', desc: 'Start mit 10.000 Materie.' },
    { id: 'rep15', layer: 'replication', at: 15, name: '15 Replikationen', desc: 'Start mit 1 Mio Materie.' },
    { id: 'rep40', layer: 'replication', at: 40, name: '40 Replikationen', desc: 'Start mit 100 Mio Materie.' },
    { id: 'ex1', layer: 'expansion', at: 1, name: '1 Expansion', desc: 'Autokauf- und Freischalt-Upgrades bleiben erhalten. Schaltet Challenges und die automatische Replikation frei.' },
    { id: 'ex2', layer: 'expansion', at: 2, name: '2 Expansionen', desc: 'Start mit 1 Mrd Materie nach jeder Replikation. Kauft Blaupausen-Upgrades automatisch.' },
    { id: 'ex3', layer: 'expansion', at: 3, name: '3 Expansionen', desc: 'Alle Blaupausen-Upgrades bleiben bei Expansion und Singularität erhalten. Schaltet die automatische Expansion frei.' },
    { id: 'ex4', layer: 'expansion', at: 4, name: '4 Expansionen', desc: 'Schaltet die automatische Challenge-Wahl frei.' },
    { id: 'ex5', layer: 'expansion', at: 5, name: '5 Expansionen', desc: 'Kauft Expansions-Upgrades automatisch.' },
    { id: 'ex10', layer: 'expansion', at: 10, name: '10 Expansionen', desc: 'Start mit 1e12 Materie nach jeder Replikation.' },
    { id: 'ex20', layer: 'expansion', at: 20, name: '20 Expansionen', desc: 'Blaupausen-Gewinn ×2.' },
    { id: 's1', layer: 'singularity', at: 1, name: '1 Singularität', desc: 'Alle Expansions-Upgrades bleiben bei einer Singularität erhalten.' },
    { id: 's2', layer: 'singularity', at: 2, name: '2 Singularitäten', desc: 'Echo: Quantenkern-Gewinn +20 % pro bisheriger Singularität.' },
    { id: 's3', layer: 'singularity', at: 3, name: '3 Singularitäten', desc: 'Jede Singularität startet mit 5 Sternsystemen.' },
    { id: 's5', layer: 'singularity', at: 5, name: '5 Singularitäten', desc: 'Quantenkern-Gewinn ×1,5.' },
    { id: 's10', layer: 'singularity', at: 10, name: '10 Singularitäten', desc: 'Jede Singularität startet mit 50 Sternsystemen.' },
  ],

  /* ----------------------------- challenges ----------------------------- */
  challengesUnlocked: (g) => g.hasMs('ex1'),
  challenges: [
    {
      id: 'c_enge',
      name: 'Enge Rohre',
      desc: 'Nur die ersten 4 Generatorstufen sind verfügbar.',
      rules: { maxTier: 4 },
      goal: { currency: 'matter', amount: T.chGoal[0] },
      reward: 'Stufen 1–4 produzieren dauerhaft ×1,5.',
      resetLayer: 2,
    },
    {
      id: 'c_teuer',
      name: 'Teure Rohstoffe',
      desc: 'Die Kosten wachsen doppelt so schnell.',
      rules: { growthPow: 2 },
      goal: { currency: 'matter', amount: T.chGoal[1] },
      reward: 'Das Kostenwachstum aller Generatoren sinkt dauerhaft um 8 %.',
      resetLayer: 2,
    },
    {
      id: 'c_ohne_bp',
      name: 'Ohne Baupläne',
      desc: 'Blaupausen-Upgrades sind deaktiviert.',
      rules: { noBpUpgrades: true },
      goal: { currency: 'matter', amount: T.chGoal[2] },
      reward: 'Blaupausen-Gewinn dauerhaft ×2.',
      resetLayer: 2,
    },
    {
      id: 'c_buendel',
      name: 'Kein Bündelbonus',
      desc: 'Der Bonus pro 10er-Bündel entfällt.',
      rules: { noBundle: true },
      goal: { currency: 'matter', amount: T.chGoal[3] },
      reward: 'Bündelbonus dauerhaft +0,05.',
      resetLayer: 2,
    },
    {
      id: 'c_zeitlupe',
      name: 'Zeitlupe',
      desc: 'Die Materie-Produktion wird mit Exponent 0,5 gedämpft.',
      rules: { prodPow: 0.5 },
      goal: { currency: 'matter', amount: T.chGoal[4] },
      reward: 'Sternsystem-Gewinn dauerhaft ×2.',
      resetLayer: 2,
    },
    {
      id: 'c_hand',
      name: 'Handarbeit',
      desc: 'Keine Autokäufer und kein Blaupausen-Bonus.',
      rules: { noAuto: true, noBpBoost: true },
      goal: { currency: 'matter', amount: T.chGoal[5] },
      reward: 'Produktion dauerhaft ×3, Autokäufer doppelt so schnell.',
      unlock: (g) => g.state.layers.singularity.count >= 2,
      lockText: '2 Singularitäten nötig.',
      resetLayer: 2,
    },
    {
      id: 'c_dunkel',
      name: 'Dunkle Materie',
      desc: 'Nur 6 Stufen, und die Kosten wachsen 1,5-mal so schnell.',
      rules: { maxTier: 6, growthPow: 1.5 },
      goal: { currency: 'matter', amount: T.chGoal[6] },
      reward: 'Produktion dauerhaft ×5.',
      unlock: (g) => g.state.layers.singularity.count >= 4,
      lockText: '4 Singularitäten nötig.',
      resetLayer: 2,
    },
    {
      id: 'c_gipfel',
      name: 'Gipfelsturm',
      desc: 'Nur 4 Stufen, 1,5× Kostenwachstum, kein Bündelbonus, keine Blaupausen-Upgrades.',
      rules: { maxTier: 4, growthPow: 1.5, noBundle: true, noBpUpgrades: true },
      goal: { currency: 'matter', amount: T.chGoal[7] },
      reward: 'Produktion ×10 und Quantenkern-Gewinn ×2.',
      unlock: (g) => g.state.layers.singularity.count >= 7,
      lockText: '7 Singularitäten nötig.',
      resetLayer: 2,
    },
  ],

  /* ----------------------------- autobuyers ----------------------------- */
  autos: [
    // first in the list: runs before the prestige autos in the same tick, so the Sternsysteme are spent before a Singularität wipes them
    {
      id: 'auto_map',
      name: 'Auto-Erkundung',
      desc: 'Erschließt den besten bezahlbaren Sektor der Galaxiekarte, sobald du ihn dir leisten kannst.',
      group: 'map',
      where: 'Galaxie-Tab (und Generatoren-Tab, Automatisierung)', // hint toast on unlock; the switch is in both places
      kind: 'misc',
      defaults: { on: false },
      unlock: (g) => claimedCount(g) >= T.mapAutoAt,
      interval: () => 1,
      run: (g) => {
        mapAutoClaim(g);
      },
    },
    {
      id: 'auto_genom',
      name: 'Auto-Genom',
      desc: 'Prüft jedes Angebot: nimmt die Mutation mit dem größten Zuwachs (bei vollem Genom tauscht er die schwächste aus) oder verwirft das Angebot, wenn keine hilft.',
      group: 'genom',
      where: 'Genom-Tab (und Generatoren-Tab, Automatisierung)',
      kind: 'misc',
      defaults: { on: false },
      unlock: (g) => mutUnlocked(g) && (claimedCount(g) >= T.mutAutoAt || g.state.rep2.mut.taken >= T.mutAutoTaken),
      interval: () => 1,
      run: (g) => {
        mutAutoGenom(g);
      },
    },
    ...autoGens,
    prestigeAuto({
      id: 'auto_rep',
      layer: 'replication',
      name: 'Auto-Replikation',
      desc: 'Repliziert automatisch, sobald sich der Gewinn lohnt.',
      unlock: (g) => g.hasMs('ex1'),
      interval: () => 1,
      on: true,
      mode: 'mult',
      value: 1,
    }),
    prestigeAuto({
      id: 'auto_exp',
      layer: 'expansion',
      name: 'Auto-Expansion',
      desc: 'Expandiert automatisch, sobald sich der Gewinn lohnt.',
      unlock: (g) => g.hasMs('ex3'),
      interval: () => 1,
      on: true,
      mode: 'mult',
      value: 1,
      minGain: 2,
    }),
    prestigeAuto({
      id: 'auto_sing',
      layer: 'singularity',
      name: 'Auto-Singularität',
      desc: 'Kollabiert automatisch, sobald sich der Gewinn lohnt.',
      unlock: (g) => act(g, 'c_auto'),
      interval: () => 1,
      on: true,
      mode: 'mult',
      value: 0.25,
      minGain: 8,
      hold: singularityHeld,
      holdText: 'Wartet auf den nächsten Sektor der Galaxiekarte (Sternsysteme sammeln).',
    }),
    {
      id: 'auto_bpupg',
      name: 'Auto-Blaupausen-Upgrades',
      desc: 'Kauft Blaupausen-Upgrades automatisch.',
      group: 'upg',
      kind: 'upg',
      unlock: (g) => g.hasMs('ex2'),
      interval: () => 1,
      run: (g) => {
        buyRepUpgrades(g, 'replication');
      },
    },
    {
      id: 'auto_exupg',
      name: 'Auto-Expansions-Upgrades',
      desc: 'Kauft Expansions-Upgrades automatisch.',
      group: 'upg',
      kind: 'upg',
      unlock: (g) => g.hasMs('ex5'),
      interval: () => 1,
      run: (g) => {
        buyRepUpgrades(g, 'expansion');
      },
    },
    {
      id: 'auto_chal',
      name: 'Auto-Challenges',
      desc: 'Startet nach jeder Expansion die nächste offene Challenge und gibt sie nach 10 Minuten auf. Neuer Versuch erst, wenn die Produktion deutlich gewachsen ist.',
      group: 'chal',
      kind: 'misc',
      defaults: () => ({ fail: {} }),
      unlock: (g) => g.hasMs('ex4'),
      interval: () => 1,
      run: (g, st) => {
        if (g.chActive() || !g.chUnlocked() || g.state.layers.expansion.runTime > T.chFreshSeconds) return;
        const now = chPower(g);
        const next = g.def.challenges.find((c) => g.chAvailable(c.id) && !(c.id in st.fail && now < st.fail[c.id] + T.chRetryPower));
        if (next) g.chEnter(next.id);
      },
    },
  ],

  /* ----------------------------- achievements ----------------------------- */
  achievements: buildAchievements(),

  // Chronik (games/replikator/story.js): characters, bubbles and modals, shown by the standard UI via options.chronicle
  chronicle: true,
  chapters: CHAPTERS,
  story: STORY,

  settingsDefaults: {},

  /* ----------------------------- hooks ----------------------------- */
  hooks: {
    genMaxTier: (g) => g.rule('maxTier', 8),
    genGrowthPow: (g) => {
      let p = g.rule('growthPow', 1);
      if (g.chDone('c_teuer')) p *= 0.92;
      return p;
    },
    genCostDiv: (g) => {
      let d = ONE;
      if (act(g, 'kompress')) d = d.mul(g.upgEffect('kompress'));
      if (act(g, 'handel')) d = d.mul(g.upgEffect('handel'));
      if (act(g, 'b_kosten')) d = d.mul(30);
      return d.mul(mutCostDiv(g));
    },
    bundleMult: (g) => {
      if (g.rule('noBundle', false)) return 1;
      let b = 2 + 0.05 * lvl(g, 'buendel') + 0.02 * lvl(g, 'buendel2');
      if (g.chDone('c_buendel')) b += 0.05;
      return Math.max(1, b + mutBundle(g));
    },
    genGlobalMult: (g) => globalParts(g).reduce((acc, [, v]) => acc.mul(v), ONE),
    genTierMult: (g, chain, i) => tierMult(g, i),
    genRate0: (g, chain, rate) => {
      const p = g.rule('prodPow', 1);
      return p === 1 || rate.lt(1) ? rate : rate.pow(p);
    },
    upgradeDisabled: (g, u) => u.group === 'replication' && g.rule('noBpUpgrades', false),
    // Auto-Challenges: give up a stuck challenge (works even inside "Handarbeit", which disables autobuyers)
    onLoad: (g) => {
      const c = g.state.chronicle;
      if (c && c.backfill) {
        delete c.backfill;
        g.storyBackfill();
      }
      act2Check(g); // after the backfill: the Akt II entries are real news for an old save
    },
    onTick: (g, dt) => {
      act2Check(g);
      mapTick(g, dt);
      mutTick(g, dt);
      const c = g.chActive();
      const st = g.state.auto.auto_chal;
      if (c && st.on && g.autoUnlocked('auto_chal') && g.chRunTime() > T.chTimeout) {
        st.fail[c.id] = chPower(g);
        g.chExit();
      }
    },
    offlineCapBonusHours: (g) => (act(g, 'c_zeit') ? 48 : 0),
    afterReset: (g, L) => {
      const start = startMatter(g);
      const have = g.get('matter');
      if (have.lt(start)) g.grant('matter', start.sub(have));
      if (L >= 3) {
        if (g.hasMs('s10')) g.add('systems', 50);
        else if (g.hasMs('s3')) g.add('systems', 5);
      }
    },
  },
};

function buildAchievements() {
  const A = [];
  const add = (id, name, desc, cond) => A.push({ id, name, desc, cond });
  add('first', 'Erster Funke', 'Kaufe eine Bohrdrohne.', (g) => g.state.gens.matter[0].bought >= 1);
  for (let i = 1; i < 8; i++) {
    add('tier' + (i + 1), tierNames[i] + ' online', 'Kaufe einen ' + tierNames[i] + '.', (g) => g.state.gens.matter[i].bought >= 1);
  }
  const matterSteps = [
    [3, 'Kleinvieh', '1.000 Materie'],
    [6, 'Millionär', '1 Mio Materie'],
    [9, 'Milliardär', '1 Mrd Materie'],
    [12, 'Billionär', '1 Bio Materie'],
    [18, 'Trillionär', '1e18 Materie'],
    [30, 'Astronomisch', '1e30 Materie'],
    [50, 'Jenseits der Zahlen', '1e50 Materie'],
    [80, 'Weltraumschrott', '1e80 Materie (so viele Atome hat das Universum)'],
    [120, 'Unvorstellbar', '1e120 Materie'],
  ];
  for (const [e, name, desc] of matterSteps) {
    add('m' + e, name, 'Erreiche ' + desc + '.', (g) => g.state.cur.matter.best.gte(Decimal.pow(10, e)));
  }
  for (const [n, name] of [[1, 'Es lebt!'], [10, 'Fließband'], [50, 'Kopierwahn'], [250, 'Massenproduktion']]) {
    add('rep' + n, name, 'Repliziere ' + n + '×.', (g) => g.state.layers.replication.count >= n);
  }
  for (const [n, name] of [[1, 'Neue Heimat'], [5, 'Kolonisator'], [25, 'Galaktischer Herrscher']]) {
    add('exp' + n, name, 'Expandiere ' + n + '×.', (g) => g.state.layers.expansion.count >= n);
  }
  for (const [n, name] of [[1, 'Punktlandung'], [5, 'Schwarzes Loch'], [25, 'Ereignishorizont']]) {
    add('sing' + n, name, 'Kollabiere ' + n + '×.', (g) => g.state.layers.singularity.count >= n);
  }
  for (const [n, name] of [[1, 'Prüfling'], [4, 'Prüfstandsprofi'], [8, 'Meister der Auflagen']]) {
    add('ch' + n, name, 'Schließe ' + n + ' Challenge' + (n > 1 ? 's' : '') + ' ab.', (g) => g.chDoneCount() >= n);
  }
  add('bpall', 'Alles geplant', 'Kaufe alle Blaupausen-Upgrades auf Maximalstufe.', (g) =>
    g.def.upgrades.filter((u) => u.group === 'replication').every((u) => g.upgMaxed(u.id)),
  );
  add('exall', 'Sternenkartograf', 'Kaufe alle Expansions-Upgrades auf Maximalstufe.', (g) =>
    g.def.upgrades.filter((u) => u.group === 'expansion').every((u) => g.upgMaxed(u.id)),
  );
  add('res6', 'Forscherdrang', 'Besitze 6 Forschungsknoten gleichzeitig.', (g) =>
    g.def.upgrades.filter((u) => u.group === 'research' && g.upgLevel(u.id) > 0).length >= 6,
  );
  add('time1', 'Dranbleiber', 'Spiele insgesamt 1 Stunde.', (g) => g.state.time.played >= 3600);
  add('time10', 'Langstrecke', 'Spiele insgesamt 10 Stunden.', (g) => g.state.time.played >= 36000);
  add('lazy', 'Faulpelz', 'Schalte alle Generator-Autokäufer frei.', (g) => g.def.autos.filter((a) => a.kind === 'gen').every((a) => g.autoUnlocked(a.id)));
  return A;
}

export { formatPercent };
