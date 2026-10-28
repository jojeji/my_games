// Replikator Akt II - Galaxien (Paket 5): the six galaxy types with their rules, the Archiv (permanent bonus of the first completion of each type) and the state
// `g.state.rep2.gal` / `.archive`. Pure and DOM-free. No import of map.js (map.js imports this file for the default state); the transitions (jump, choice) are in jump.js.
//  - Rules (while you are in a galaxy of that type) act through galRule / galProdParts / galGainParts and the hooks in def.js, map.js and mutations.js.
//  - Archiv: a type counts as completed when 10 sectors are claimed in a galaxy of that type (the jump condition); the bonus is permanent. Two types add a Genom slot.
//  - Effects sit where progress is limited (docs/LESSONS.md): the Erschliessung time, the gains after the softcap (they ripen like all gain factors), the Genom; plain production
//    only matters in the first minutes of a new galaxy, which start from scratch.
import { D } from '../../engine/decimal.js';
import { newSeed, toSeed } from '../../engine/kit/rng.js';
import { TUNE as T } from './tune.js';
import { ripen } from './mutations.js';

/** Order of the six types in lists (Spirale = the first galaxy). */
export const GAL_ORDER = ['spirale', 'zwerg', 'elliptisch', 'kollision', 'leerraum', 'quasar'];

const n1 = (x) => String(+Number(x).toFixed(2)).replace('.', ',');
const pct = (x) => n1(Math.round(x * 100)) + ' %';

/**
 * Type table: name, colour, flavour, `rules(fx)` = bullet points shown on the galaxy card, `bonus(fx)` = the Archiv bonus text (fx from tune.js).
 * The numbers are all in tune.js (galFx = rules, galArchive = bonus), the texts are built from them.
 */
export const GALAXIES = {
  spirale: {
    id: 'spirale',
    name: 'Spirale',
    color: '#38d6f2',
    desc: 'Die Heimatgalaxie. Arme, Staub, Sterne in der üblichen Reihenfolge.',
    rules: () => ['Keine Besonderheiten. So hat alles angefangen.'],
    bonus: (a) => `Erschließungen dauern ${pct(1 - a.trip)} kürzer`,
  },
  zwerg: {
    id: 'zwerg',
    name: 'Zwerggalaxie',
    color: '#5ef2c0',
    desc: 'Klein, nah, schnell durchquert. Dafür wenig Material.',
    rules: (f) => [
      `Nur ${f.maxTier} Generatorstufen`,
      `Schwellen für Replikation, Expansion und Singularität ÷${n1(f.thrDiv)}`,
      `Sternsystem-Gewinn ×${n1(f.sys)}`,
      `Erschließungen dauern ×${n1(f.trip)} so lang`,
    ],
    bonus: (a) => `Generatorkosten ÷${n1(a.costDiv)} in jeder Galaxie`,
  },
  elliptisch: {
    id: 'elliptisch',
    name: 'Elliptische Galaxie',
    color: '#f2c14e',
    desc: 'Alte, träge Sterne in dichten Ballungen. Alles wächst langsam und trägt viel.',
    rules: (f) => [`Kostenwachstum der Generatoren ×${n1(f.growthPow)}`, `Sternsystem-Gewinn ×${n1(f.sys)}`],
    bonus: (a) => `Sternsystem-Gewinn ×${n1(a.sys)} in jeder Galaxie`,
  },
  kollision: {
    id: 'kollision',
    name: 'Kollisionszone',
    color: '#ff8a4c',
    desc: 'Zwei Galaxien durchdringen sich. Alles schwankt, und es schwankt nach Fahrplan.',
    rules: (f) => [`Die Produktion schwankt im ${n1(f.period / 60)}-Minuten-Takt zwischen ×${n1(f.lo)} und ×${n1(f.hi)}`, 'Der Verlauf steht fest, auch in deiner Abwesenheit'],
    bonus: (a) => `+1 Genom-Platz, Sondenbefehle laden ×${n1(a.cmd)} schneller`,
  },
  leerraum: {
    id: 'leerraum',
    name: 'Leerraum',
    color: '#9b8cff',
    desc: 'Eine Blase ohne viel drin. Sternsysteme tragen hier nichts bei, dafür ist Platz für Fehler.',
    rules: (f) => ['Kein Produktionsbonus aus Sternsystemen', `Mutationsangebote kommen ×${n1(f.offers)} so oft`],
    bonus: (a) => `+1 Genom-Platz, Mutationsangebote ×${n1(a.offers)} so oft`,
  },
  quasar: {
    id: 'quasar',
    name: 'Quasar',
    color: '#ff7eb6',
    desc: 'Ein Kern, der alles überstrahlt. Die Produktion ist absurd, die Automaten brauchen Anlauf.',
    rules: (f) => [`Produktion ×${n1(f.prod)}`, `Generator-Autokäufer erst ab ${f.autoExp} Expansionen in dieser Galaxie`],
    bonus: (a) => `Produktion ×${n1(a.prod)}, Quantenkern-Gewinn ×${n1(a.cores)} in jeder Galaxie`,
  },
};
export const galFx = (id) => T.galFx[id] || {};
export const galArchiveFx = (id) => T.galArchive[id] || {};
/** Rule lines and bonus line of a type as texts (UI). */
export const galRuleLines = (id) => GALAXIES[id].rules(galFx(id));
export const galBonusText = (id) => GALAXIES[id].bonus(galArchiveFx(id));

/* ------------------------------------------------------------------ */
/* State                                                                */
/* ------------------------------------------------------------------ */

/** Default `state.rep2.gal` (merged into rep2State by map.js). */
export function galState() {
  return {
    n: 1, // galaxy number (1 = the first)
    type: 'spirale', // the type you are in; null while a choice is pending after a jump
    at: 0, // play time the galaxy began
    exp0: 0, // Expansion count when it began (Quasar's autobuyers count from there)
    choice: null, // { opts: [type, type], at } the two galaxies on offer after a jump; the game waits for the pick
    rng: { seed: newSeed() }, // draws the offers
    best: 0, // the most sectors claimed in one galaxy (genome slots and the autos that unlock by sector count stay unlocked)
    hist: [], // [{ n, type, sectors, secs }] finished galaxies
  };
}
/** `state.rep2.archive`: type -> play time of its first completion. */
export const archiveState = () => ({});

export const galSeedFrom = (seed) => toSeed(Math.floor(toSeed(seed)) * 3266489917 + 668265263);

/** Migration 5 -> 6: Galaxiensprung (state.rep2.gal / .archive come through mergeDefaults; the offer stream gets a seed derived from the map seed, the sector record is carried over). */
export function migrateToJump(data) {
  const r = data.rep2 || {};
  const seed = r.rng && Number.isFinite(r.rng.seed) ? r.rng.seed : 0;
  const claimed = r.map && Number.isFinite(r.map.claimed) ? r.map.claimed : 0;
  data.rep2 = { ...r, gal: { ...(r.gal || {}), rng: { seed: galSeedFrom(seed) }, best: claimed, at: r.act2At || 0 } };
  data.v = 6;
  return data;
}

const G = (g) => g.state.rep2.gal;
const act2 = (g) => !!g.state.rep2.act2;

/** The type you are in, or null (before Akt II, or while the choice after a jump is pending). */
export const galType = (g) => (act2(g) ? G(g).type : null);
export const galNumber = (g) => (act2(g) ? G(g).n : 0);
export const galPending = (g) => (act2(g) ? G(g).choice : null);
/** Rule value of the current galaxy (fallback when there is none). */
export function galRule(g, key, fallback) {
  const t = galType(g);
  const f = t && T.galFx[t];
  return f && key in f ? f[key] : fallback;
}
const isType = (g, t) => galType(g) === t;

/* ------------------------------------------------------------------ */
/* Archiv                                                               */
/* ------------------------------------------------------------------ */

export const archiveDone = (g, type) => !!(g.state.rep2.archive && g.state.rep2.archive[type]);
export const archiveCount = (g) => GAL_ORDER.filter((t) => archiveDone(g, t)).length;
/** Product of an Archiv bonus key over the completed types. */
const archiveProd = (g, key) => GAL_ORDER.reduce((a, t) => (archiveDone(g, t) && T.galArchive[t][key] ? a * T.galArchive[t][key] : a), 1);
export const archiveSlots = (g) => GAL_ORDER.reduce((a, t) => (archiveDone(g, t) ? a + (T.galArchive[t].slot || 0) : a), 0);

/* ------------------------------------------------------------------ */
/* Saatkern-Upgrades (levels), shared by the effects below             */
/* ------------------------------------------------------------------ */

const seedLvl = (g, id) => g.upgLevel(id);

/* ------------------------------------------------------------------ */
/* Effects                                                              */
/* ------------------------------------------------------------------ */

/** Factor on the Erschliessung time: Zwerggalaxie, Archiv (Spirale), Saatkern-Upgrade Antriebsarchiv. */
export const galTrip = (g) => galRule(g, 'trip', 1) * archiveProd(g, 'trip') * Math.pow(T.seedFx.flug, seedLvl(g, 'sk_flug'));
/** Factor on the recharge speed of the Sondenbefehle (Archiv Kollisionszone, Saatkern-Upgrade Befehlsspeicher). */
export const galCmdRate = (g) => archiveProd(g, 'cmd') * Math.pow(T.seedFx.befehl, seedLvl(g, 'sk_befehl'));
/** Factor on the Mutationsangebote per time (Leerraum, Archiv Leerraum). */
export const galOfferRate = (g) => galRule(g, 'offers', 1) * archiveProd(g, 'offers');
/** Factor on how often a timed anomaly comes (Saatkern-Upgrade Anomalie-Sog). */
export const galAnoRate = (g) => Math.pow(T.seedFx.anomalie, seedLvl(g, 'sk_anomalie'));
/** Divisor of the generator costs (Archiv Zwerggalaxie). */
export const galCostDiv = (g) => archiveProd(g, 'costDiv');
/** Divisor of the prestige thresholds (Zwerggalaxie). */
export const galThrDiv = (g) => galRule(g, 'thrDiv', 1);
/** Largest generator tier count (Zwerggalaxie). */
export const galMaxTier = (g) => galRule(g, 'maxTier', 8);
/** Exponent of the cost growth (Elliptisch). */
export const galGrowthPow = (g) => galRule(g, 'growthPow', 1);
/** No Sternsystem boost on production (Leerraum). */
export const galNoSysBoost = (g) => isType(g, 'leerraum');
/** Quasar: do the generator autobuyers work yet? */
export function galAutosOk(g) {
  const need = galRule(g, 'autoExp', 0);
  return !need || g.state.layers.expansion.count - G(g).exp0 >= need;
}

/**
 * Kollisionszone: production factor lo..hi, a 10-minute cycle that starts at the low point when the galaxy begins. Deterministic in the play time; the value is the
 * AVERAGE over the tick in progress (game.tickDt), so the large steps of the offline catch-up count exactly as many small ones would. Between ticks (display) the value now.
 */
export function collisionFactor(g, dt = g.tickDt) {
  const f = T.galFx.kollision;
  const now = g.state.time.played - G(g).at;
  const at = (t) => {
    const s = (1 - Math.cos((2 * Math.PI * t) / f.period)) / 2;
    return f.lo + (f.hi - f.lo) * s * s;
  };
  if (!(dt > 0)) return at(now);
  const n = Math.min(64, Math.max(1, Math.ceil(dt / 15)));
  let sum = 0;
  for (let i = 0; i < n; i++) sum += at(now - dt + ((i + 0.5) * dt) / n);
  return sum / n;
}

/** Labeled production parts for globalParts: Quasar, Kollisionszone, Archiv of the Quasar. */
export function galProdParts(g) {
  if (!act2(g)) return [];
  const parts = [];
  const q = galRule(g, 'prod', 1);
  if (q !== 1) parts.push(['Quasar', D(q)]);
  if (isType(g, 'kollision')) parts.push(['Kollisionszone', D(collisionFactor(g))]);
  const a = archiveProd(g, 'prod');
  if (a !== 1) parts.push(['Quasar-Archiv', D(a)]);
  return parts;
}

/**
 * Labeled factors on a prestige gain ('blueprints' | 'systems' | 'cores') from galaxy rules, Archiv and Saatkern-Upgrades; applied after the softcap (def.js postGain).
 * Factors above 1 ripen with the run time like every gain factor (mutations.js ripen), factors below 1 apply at once.
 */
export function galGainParts(g, kind) {
  if (!act2(g)) return [];
  const out = [];
  const add = (label, v) => {
    const r = ripen(g, kind, v);
    if (r !== 1) out.push([label, D(r)]);
  };
  if (kind === 'systems') {
    add(GALAXIES[galType(g)]?.name || 'Galaxie', galRule(g, 'sys', 1));
    add('Archiv', archiveProd(g, 'sys'));
  }
  if (kind === 'cores') add('Archiv', archiveProd(g, 'cores'));
  const lv = seedLvl(g, 'sk_gewinn');
  if (lv) add('Fruchtbare Saat', Math.pow(T.seedFx.gewinn, lv));
  return out;
}
export const galGain = (g, kind) => galGainParts(g, kind).reduce((a, [, v]) => a.mul(v), D(1));
