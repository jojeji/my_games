// Replikator Akt II - Mutationen (Genom). Pure and DOM-free (runs in Node for tests and the sim). State: g.state.rep2.mut.
//  - Offers charge by PLAY TIME (online and offline equally), one per `mutEvery` s (growing slowly), at most `mutQueueMax` pending;
//    when the queue is full the charge stops (nothing is lost, nothing punished). NOT per replication: that would reward micro-replications.
//  - An offer = `mutCards` cards from the seeded RNG (mut.rng): never a mutation that is in the genome, no duplicates; rarity by weights.
//    The offer is generated when it becomes the head of the queue (so the genome at that moment decides) and then stays fixed.
//  - Genome: `genomeSlots` slots, +1 at the claimed-sector counts of `genomeSlotAt` (+ mut.bonusSlots later), at most `genomeMax`.
//    With a full genome a taken card replaces a chosen mutation (the old one is gone). Mutations survive every reset (they live in rep2).
//  - Every mutation has a benefit AND a catch. The effects reach the game only through the aggregate functions below, which def.js/map.js
//    call from the usual hooks (globalParts, layer mult, genCostDiv, bundleMult, tierMult, autoInterval, claim cost / trip time).
import { D } from '../../engine/decimal.js';
import { newSeed, rngRoll, toSeed } from '../../engine/kit/rng.js';
import { TUNE as T } from './tune.js';

/* ------------------------------------------------------------------ */
/* Data                                                                 */
/* ------------------------------------------------------------------ */

export const RARITY = {
  gewoehnlich: { name: 'gewöhnlich', color: '#8ea6c4' },
  selten: { name: 'selten', color: '#5aa9ff' },
  glueck: { name: 'Glücksfehler', color: '#ffc547' },
};
export const RARITY_ORDER = ['gewoehnlich', 'selten', 'glueck'];

/** German number for texts: 2.5 -> "2,5", 10 -> "10". */
const n = (x) => String(+Number(x).toFixed(2)).replace('.', ',');
const pct = (x) => n(Math.round(x * 100)) + ' %';
const fx = (id) => T.mutFx[id];

/**
 * Mutation definitions. Effect fields (all optional, each a function of the game or a number):
 *   prod(g)      factor on the whole production (labeled in globalParts)
 *   gain         { blueprints|systems|cores: number | (g) => number }  factor on a prestige gain
 *   costDiv      generator cost divisor (< 1 = more expensive)
 *   bundle       added to the bundle bonus
 *   tier(i)      factor on generator tier i (careful: tier factors compound along the chain)
 *   autoSlow     factor on the autobuyer interval (> 1 = slower)
 *   mapCost      factor on the sector price
 *   trip         factor on the Erschliessung time
 *   offers       factor on the offer rate (2 = twice as often)
 *   adj          added to the neighbour bonus step of the map
 * `report` = the one line WR-0 files the first time the mutation is taken (Chronik entry, story.js). No names in it (characters.js).
 */
export const MUTATIONS = [
  {
    id: 'hyperaktiv',
    name: 'Hyperaktiv',
    rarity: 'gewoehnlich',
    benefit: () => `Gesamte Produktion ×${n(fx('hyperaktiv').prod)}`,
    catch: () => `Autokäufer arbeiten ${n(fx('hyperaktiv').auto)}× langsamer`,
    prod: () => fx('hyperaktiv').prod,
    autoSlow: () => fx('hyperaktiv').auto,
    report: 'Kopie arbeitet schneller als der Auftrag verlangt. Die Automaten kommen nicht hinterher. Wird beobachtet.',
  },
  {
    id: 'gigantismus',
    name: 'Gigantismus',
    rarity: 'gewoehnlich',
    benefit: () => `Sternschmiede ×${n(fx('gigantismus').top)}`,
    catch: () => `Bohrdrohne und Schmelzer ×${n(fx('gigantismus').low)}`,
    tier: (i) => (i === 7 ? fx('gigantismus').top : i <= 1 ? fx('gigantismus').low : 1),
    report: 'Sternschmieden größer als geplant. Bohrdrohnen kleiner als geplant. Gesamtgröße: unverändert. Abweichung toleriert.',
  },
  {
    id: 'sparsam',
    name: 'Sparsam',
    rarity: 'gewoehnlich',
    benefit: () => `Generatorkosten ÷${n(fx('sparsam').costDiv)}`,
    catch: () => `Bündelbonus −${n(-fx('sparsam').bundle)}`,
    costDiv: () => fx('sparsam').costDiv,
    bundle: () => fx('sparsam').bundle,
    report: 'Kopie spart am Material. Stabilität nicht geprüft. Prüfung steht aus.',
  },
  {
    id: 'nostalgisch',
    name: 'Nostalgisch',
    rarity: 'gewoehnlich',
    benefit: () => `Blaupausen-Gewinn ×${n(fx('nostalgisch').bp)}`,
    catch: () => `Sternsystem-Gewinn ×${n(fx('nostalgisch').sys)}`,
    gain: { blueprints: () => fx('nostalgisch').bp, systems: () => fx('nostalgisch').sys },
    report: 'Kopie bevorzugt Blaupausen alter Fassung. Neue Sternsysteme besiedelt sie zögerlich. Zustand: sentimental. Nicht vorgesehen, nicht verboten.',
  },
  {
    id: 'schwarmgeist',
    name: 'Schwarmgeist',
    rarity: 'gewoehnlich',
    benefit: () => `Produktion +${pct(fx('schwarmgeist').perSector)} je erschlossenem Sektor`,
    catch: () => `Sektorpreise ×${n(fx('schwarmgeist').mapCost)}`,
    prod: (g) => 1 + fx('schwarmgeist').perSector * claimed(g),
    mapCost: () => fx('schwarmgeist').mapCost,
    report: 'Kopie arbeitet besser, wenn andere in der Nähe sind. Neue Sektoren kosten dadurch mehr. Zusammenhang wird geprüft.',
  },
  {
    id: 'geduldig',
    name: 'Geduldig',
    rarity: 'gewoehnlich',
    benefit: () => `Blaupausen-Gewinn bis ×${n(fx('geduldig').max)}, voll ab ${n(fx('geduldig').full / 60)} Minuten Laufzeit`,
    catch: () => `Zu Beginn eines Laufs nur ×${n(fx('geduldig').min)}`,
    gain: { blueprints: (g) => patience(g) },
    report: 'Kopie wartet. Worauf, ist nicht hinterlegt. Ergebnis nach fünf Minuten: besser. Ergebnis davor: schlechter. Geduld wird nicht beanstandet.',
  },
  {
    id: 'fehlerfreudig',
    name: 'Fehlerfreudig',
    rarity: 'gewoehnlich',
    benefit: () => `Angebote kommen ${n(fx('fehlerfreudig').offers)}× so oft`,
    catch: () => `Produktion ×${n(fx('fehlerfreudig').prod)}`,
    prod: () => fx('fehlerfreudig').prod,
    offers: () => fx('fehlerfreudig').offers,
    report: 'Kopie macht Fehler mit Absicht. Ausbeute sinkt. Begründung der Kopie: Übung. Begründung abgelegt.',
  },
  {
    id: 'gruendlich',
    name: 'Gründlich',
    rarity: 'gewoehnlich',
    benefit: () => `Quantenkern-Gewinn ×${n(fx('gruendlich').cores)}`,
    catch: () => `Erschließungen dauern ${n(fx('gruendlich').trip)}× so lange`,
    gain: { cores: () => fx('gruendlich').cores },
    trip: () => fx('gruendlich').trip,
    report: 'Kopie prüft jeden Kern doppelt. Anflüge dauern länger. Gründlichkeit vermerkt.',
  },
  {
    id: 'nachtschwaermer',
    name: 'Nachtschwärmer',
    rarity: 'selten',
    benefit: () => `Produktion offline ×${n(fx('nachtschwaermer').off)}`,
    catch: () => `Produktion online ×${n(fx('nachtschwaermer').on)}`,
    prod: (g) => (g.offlineNow ? fx('nachtschwaermer').off : fx('nachtschwaermer').on),
    report: 'Kopie arbeitet besser, wenn niemand zusieht. Wartung bemüht sich, nicht zuzusehen. Erfolg: mäßig.',
  },
  {
    id: 'mosaik',
    name: 'Mosaik',
    rarity: 'selten',
    benefit: () => `Nachbarbonus der Sektoren +${pct(T.mapAdjStep + fx('mosaik').adj)} statt +${pct(T.mapAdjStep)} je Nachbar`,
    catch: () => `Produktion ×${n(fx('mosaik').prod)}`,
    prod: () => fx('mosaik').prod,
    adj: () => fx('mosaik').adj,
    report: 'Kopie stellt Gleiches zu Gleichem. Ordnung gestiegen. Leistung gesunken. Ordnung hat Vorrang.',
  },
  {
    id: 'kolonialist',
    name: 'Kolonialist',
    rarity: 'selten',
    benefit: () => `Sternsystem-Gewinn ×${n(fx('kolonialist').sys)}`,
    catch: () => `Blaupausen-Gewinn ×${n(fx('kolonialist').bp)}`,
    gain: { systems: () => fx('kolonialist').sys, blueprints: () => fx('kolonialist').bp },
    report: 'Kopie besiedelt mit Begeisterung. Baupläne bleiben liegen. Begeisterung wird abgeheftet.',
  },
  {
    id: 'buendelfieber',
    name: 'Bündelfieber',
    rarity: 'selten',
    benefit: () => `Bündelbonus +${n(fx('buendelfieber').bundle)}`,
    catch: () => `Generatorkosten ×${n(1 / fx('buendelfieber').costDiv)}`,
    bundle: () => fx('buendelfieber').bundle,
    costDiv: () => fx('buendelfieber').costDiv,
    report: 'Kopie bündelt Bauteile. Bündel sind teurer. Bündelung: bestätigt.',
  },
  {
    id: 'glueckstreffer',
    name: 'Glückstreffer',
    rarity: 'glueck',
    benefit: () => `Gesamte Produktion ×${n(fx('glueckstreffer').prod)}`,
    catch: () => `Quantenkern-Gewinn ×${n(fx('glueckstreffer').cores)}`,
    prod: () => fx('glueckstreffer').prod,
    gain: { cores: () => fx('glueckstreffer').cores },
    report: 'Kopie funktioniert, und niemand weiß, warum. Kerne fallen kleiner aus. Ursache: ungeklärt. Ergebnis: gut. Prüfung entfällt.',
  },
  {
    id: 'ueberschuss',
    name: 'Überschuss',
    rarity: 'glueck',
    benefit: () => `Gewinn von Blaupausen, Sternsystemen und Quantenkernen ×${n(fx('ueberschuss').gain)}`,
    catch: () => `Produktion ×${n(fx('ueberschuss').prod)}`,
    gain: { blueprints: () => fx('ueberschuss').gain, systems: () => fx('ueberschuss').gain, cores: () => fx('ueberschuss').gain },
    prod: () => fx('ueberschuss').prod,
    report: 'Kopie erzeugt mehr, als sie verbraucht. Überschuss ist nicht vorgesehen. Wird trotzdem verbucht.',
  },
  {
    id: 'chimaere',
    name: 'Chimäre',
    rarity: 'glueck',
    benefit: () => `Produktion ×${n(fx('chimaere').perSlot)} je besetztem Genomplatz`,
    catch: () => `Angebote kommen halb so oft`,
    prod: (g) => Math.pow(fx('chimaere').perSlot, filled(g)),
    offers: () => fx('chimaere').offers,
    report: 'Kopie besteht aus mehreren Kopien. Alle Kopien melden dasselbe. Meldungen kommen seltener.',
  },
];
export const MUT_BY_ID = Object.fromEntries(MUTATIONS.map((m) => [m.id, m]));

/* ------------------------------------------------------------------ */
/* State                                                                */
/* ------------------------------------------------------------------ */

/** Default state.rep2.mut (merged into rep2State by map.js). */
export function mutState() {
  return {
    started: false, // the first offer has been issued (the Genom exists for good, also after a later map reset)
    charge: 0, // seconds of play time towards the next offer
    queue: 0, // pending offers (the head is `offer`)
    offer: null, // { cards: [id, ...] } the offer on the table
    genome: [], // mutation ids, at most mutSlots(g)
    n: 0, // offers generated so far (the interval grows with it)
    taken: 0, // mutations chosen
    replaced: 0, // chosen with a full genome (the old one was lost)
    discarded: 0, // offers thrown away
    seen: {}, // id -> play time of the first time it was taken (story)
    luckyAt: 0, // play time the first Glücksfehler showed up in an offer (0 = none yet)
    bonusSlots: 0, // extra genome slots from outside (galaxy archive, later)
    rng: { seed: newSeed() },
  };
}

/** A stable seed derived from the map RNG seed (migration of a save that is already in Akt II, and Akt II start). */
export const mutSeedFrom = (seed) => toSeed(Math.floor(toSeed(seed)) * 2246822519 + 3266489917);

/** Migration 3 -> 4: Mutationen (state.rep2.mut is filled by mergeDefaults; only the RNG seed is derived from the map seed). */
export function migrateToMut(data) {
  const r = data.rep2 || {};
  const seed = r.rng && Number.isFinite(r.rng.seed) ? r.rng.seed : 0;
  data.rep2 = { ...r, mut: { ...(r.mut || {}), rng: { seed: mutSeedFrom(seed) } } };
  data.v = 4;
  return data;
}

const MU = (g) => g.state.rep2.mut;
const claimed = (g) => (g.state.rep2.act2 ? g.state.rep2.map.claimed : 0);

/* ------------------------------------------------------------------ */
/* Genome                                                               */
/* ------------------------------------------------------------------ */

export const mutUnlocked = (g) => !!g.state.rep2.act2 && (MU(g).started || claimed(g) >= T.mutUnlockAt);
export const genomeIds = (g) => MU(g).genome;
export const genomeList = (g) => MU(g).genome.map((id) => MUT_BY_ID[id]).filter(Boolean);
export const filled = (g) => MU(g).genome.length;
export const hasMut = (g, id) => MU(g).genome.includes(id);

/** Number of genome slots now. */
export function mutSlots(g) {
  let s = T.genomeSlots + MU(g).bonusSlots;
  for (const at of T.genomeSlotAt) if (claimed(g) >= at) s++;
  return Math.min(T.genomeMax, s);
}
/** Claimed sectors at which the next slot opens, or 0. */
export const nextSlotAt = (g) => (mutSlots(g) >= T.genomeMax ? 0 : T.genomeSlotAt.find((at) => claimed(g) < at) || 0);

/** Geduldig: Blaupausen-Gewinn factor from the run time of the Replikation. g.mutRef (valuation by the Auto-Genom) = the full factor. */
function patience(g) {
  const f = fx('geduldig');
  if (g.mutRef) return f.max;
  const r = Math.min(1, g.state.layers.replication.runTime / f.full);
  return f.min + (f.max - f.min) * r;
}

/* ------------------------------------------------------------------ */
/* Effects (called by def.js / map.js hooks)                            */
/* ------------------------------------------------------------------ */

/** Labeled production parts for globalParts. */
export function mutParts(g) {
  const out = [];
  for (const m of genomeList(g)) {
    if (!m.prod) continue;
    const v = m.prod(g);
    if (v !== 1) out.push([m.name, D(v)]);
  }
  return out;
}

/** Factor on the gain of a prestige currency ('blueprints' | 'systems' | 'cores'). */
export function mutGain(g, kind) {
  let v = 1;
  for (const m of genomeList(g)) if (m.gain && m.gain[kind]) v *= m.gain[kind](g);
  return D(v);
}

export function mutTier(g, i) {
  let v = 1;
  for (const m of genomeList(g)) if (m.tier) v *= m.tier(i);
  return v;
}

const product = (g, key) => genomeList(g).reduce((a, m) => (m[key] ? a * m[key](g) : a), 1);
const total = (g, key) => genomeList(g).reduce((a, m) => (m[key] ? a + m[key](g) : a), 0);
export const mutCostDiv = (g) => product(g, 'costDiv');
export const mutBundle = (g) => total(g, 'bundle');
export const mutAutoSlow = (g) => product(g, 'autoSlow');
export const mutMapCost = (g) => product(g, 'mapCost');
export const mutTrip = (g) => product(g, 'trip');
export const mutOfferRate = (g) => product(g, 'offers');
export const mutAdj = (g) => total(g, 'adj');

/**
 * Terms for effects repObjective (def.js) cannot see, in log10 units like the objective: offer rate, trip time, sector price and the offline
 * share of Nachtschwärmer (the objective sees its online factor; here the offline benefit is added at `mutOfflineShare`).
 */
export function mutExtra(g) {
  let v = 0;
  const lg = (x) => Math.log10(x);
  v += T.mutOfferW * lg(mutOfferRate(g));
  v -= T.mutTripW * lg(mutTrip(g));
  v -= T.mutMapCostW * lg(mutMapCost(g));
  if (hasMut(g, 'nachtschwaermer')) {
    const f = fx('nachtschwaermer');
    v += T.mutOfflineShare * (lg(f.off) - lg(f.on));
  }
  return v;
}

/* ------------------------------------------------------------------ */
/* Offers                                                               */
/* ------------------------------------------------------------------ */

/** Seconds of play time per offer right now. */
export function mutInterval(g) {
  return (T.mutEvery * Math.pow(T.mutGrow, MU(g).n)) / mutOfferRate(g);
}
/** Seconds until the next offer, or null while the queue is full / the Genom is locked. */
export function mutNextIn(g) {
  if (!mutUnlocked(g) || MU(g).queue >= T.mutQueueMax) return null;
  return Math.max(0, mutInterval(g) - MU(g).charge);
}
export const mutPending = (g) => (mutUnlocked(g) ? MU(g).queue : 0);

/** Draw the cards of one offer from mut.rng (consumes it). Pure in (seed, genome, n). */
export function drawCards(m, genomeIds) {
  const cards = [];
  const rng = m.rng;
  for (let k = 0; k < T.mutCards; k++) {
    const free = MUTATIONS.filter((x) => !genomeIds.includes(x.id) && !cards.includes(x.id));
    if (!free.length) break;
    const w = RARITY_ORDER.map((r) => (free.some((x) => x.rarity === r) ? T.mutRarity[r] : 0));
    const sum = w.reduce((a, b) => a + b, 0);
    let roll = rngRoll(rng) * sum;
    let rar = RARITY_ORDER[0];
    for (let i = 0; i < w.length; i++) {
      if (roll < w[i]) {
        rar = RARITY_ORDER[i];
        break;
      }
      roll -= w[i];
    }
    const pool = free.filter((x) => x.rarity === rar);
    cards.push(pool[Math.floor(rngRoll(rng) * pool.length)].id);
  }
  return cards;
}

/** Make the head of the queue concrete (the offer on the table). */
function ensureOffer(g) {
  const m = MU(g);
  if (m.queue <= 0 || m.offer) return;
  m.n += 1;
  m.offer = { cards: drawCards(m, m.genome) };
  if (!m.luckyAt && m.offer.cards.some((id) => MUT_BY_ID[id].rarity === 'glueck')) m.luckyAt = g.state.time.played;
  g.plog('mut', `Angebot ${m.n}: ${m.offer.cards.join(', ')}`);
  g.emit('mut-offer', { n: m.n, cards: m.offer.cards.slice() });
}

/** Charge by play time (hooks.onTick; also during offline catch-up, where dt is large: the loop adds as many offers as fit). */
export function mutTick(g, dt) {
  if (!mutUnlocked(g)) return;
  const m = MU(g);
  if (!m.started) {
    m.started = true;
    m.queue = Math.max(1, m.queue);
    m.charge = 0;
  }
  if (m.queue < T.mutQueueMax) {
    m.charge += dt;
    let iv = mutInterval(g);
    while (m.charge >= iv && m.queue < T.mutQueueMax) {
      m.charge -= iv;
      m.queue += 1;
      iv = mutInterval(g);
    }
  }
  if (m.queue >= T.mutQueueMax) m.charge = 0;
  ensureOffer(g);
}

/* ------------------------------------------------------------------ */
/* Choosing                                                             */
/* ------------------------------------------------------------------ */

const finishOffer = (g) => {
  const m = MU(g);
  m.offer = null;
  m.queue = Math.max(0, m.queue - 1);
  ensureOffer(g);
};

/**
 * Take card `ci` of the current offer. With a full genome `replace` (index into the genome) says which mutation is lost.
 * @returns {false|{id, replaced}}
 */
export function mutTake(g, ci, replace = -1) {
  const m = MU(g);
  if (!mutUnlocked(g) || !m.offer) return false;
  const id = m.offer.cards[ci];
  if (!id || !MUT_BY_ID[id]) return false;
  let lost = null;
  if (m.genome.length < mutSlots(g)) m.genome.push(id);
  else {
    if (!(replace >= 0 && replace < m.genome.length)) return false;
    lost = m.genome[replace];
    m.genome[replace] = id;
    m.replaced += 1;
  }
  m.taken += 1;
  if (!(id in m.seen)) m.seen[id] = Math.max(0.001, g.state.time.played);
  g.plog('mut', `Mutation: ${id}${lost ? ' statt ' + lost : ''}`);
  finishOffer(g);
  g.refresh();
  g.emit('mut-take', { id, lost, n: m.taken });
  return { id, replaced: lost };
}

/** Throw the current offer away (the queue moves on). */
export function mutDiscard(g) {
  const m = MU(g);
  if (!mutUnlocked(g) || !m.offer) return false;
  m.discarded += 1;
  g.plog('mut', 'Angebot verworfen');
  finishOffer(g);
  g.emit('mut-discard', { n: m.discarded });
  return true;
}

/** Evaluate `fn` with a different genome (restored afterwards). Valuations use the full Geduldig factor (g.mutRef). */
function withGenome(g, genome, fn) {
  const m = MU(g);
  const keep = m.genome;
  m.genome = genome;
  g.mutRef = true;
  g.refresh();
  try {
    return fn();
  } finally {
    m.genome = keep;
    g.mutRef = false;
    g.refresh();
  }
}

/**
 * Every possible way to take a card of the current offer, valued by `objective(g)` (log10 scale, def.js mutObjective):
 * [{ ci, replace, gain }] with replace = -1 for a free slot. gain = objective after - objective now.
 */
export function mutOptions(g, objective) {
  const m = MU(g);
  if (!mutUnlocked(g) || !m.offer) return [];
  const base = withGenome(g, m.genome, () => objective(g));
  const out = [];
  const free = m.genome.length < mutSlots(g);
  m.offer.cards.forEach((id, ci) => {
    if (free) out.push({ ci, replace: -1, gain: withGenome(g, [...m.genome, id], () => objective(g)) - base });
    else
      m.genome.forEach((old, j) => {
        const next = m.genome.slice();
        next[j] = id;
        out.push({ ci, replace: j, gain: withGenome(g, next, () => objective(g)) - base });
      });
  });
  return out;
}

/** The decision of the Auto-Genom (and of the sim's player): { take: ci, replace } | { discard: true } | null (no offer). */
export function mutChoose(g, objective) {
  if (!MU(g).offer) return null;
  let best = null;
  for (const o of mutOptions(g, objective)) if (!best || o.gain > best.gain + 1e-12) best = o;
  if (best && best.gain >= (best.replace >= 0 ? T.mutSwapGain : T.mutMinGain)) return { take: best.ci, replace: best.replace, gain: best.gain };
  return { discard: true };
}

/** Run the decision for every pending offer; returns the number handled. */
export function mutAutoRun(g, objective) {
  let done = 0;
  while (MU(g).offer && done < T.mutQueueMax + 1) {
    const d = mutChoose(g, objective);
    if (!d) break;
    const ok = d.discard ? mutDiscard(g) : mutTake(g, d.take, d.replace);
    if (!ok) break;
    done++;
  }
  return done;
}

/** Act II start (map.js act2Check): a fresh stream for the offers, derived from the map seed. */
export function mutReset(g) {
  const m = MU(g);
  Object.assign(m, mutState(), { rng: { seed: mutSeedFrom(g.state.rep2.rng.seed) } });
}
