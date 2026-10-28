// Replikator Akt II - Anomalien. Pure and DOM-free (runs in Node for tests and the sim). State: g.state.rep2.ano.
//  - Event cards that WAIT until the player starts them (at most one pending, nothing expires, nothing is punished for being away).
//  - Sources: every Anomalie sector creates one when the probe arrives, and one more every 60-90 min of play time (seeded RNG, charges only
//    while nothing is pending or running). The first Anomalie sector unlocks the system.
//  - Which one: a shuffled bag of all types (every type shows up once per round, nothing repeats at once); the very first is always the Gezeitenwelle.
//  - A started anomaly is either instant (Zeitriss, Kosmischer Strahl, Spiegelangebot, Signalfragment) or a short rule change (Gezeitenwelle, Umkehrfeld)
//    with an effect while it runs and a reward when it ends.
//  - The sim's player and a later auto call anoChoose(g) (def.js chooseAnomaly): it starts the pending anomaly when it is worth it.
// Effects act on what limits Akt II (docs/LESSONS.md): the Erschliessung time, the offer stream of the Genom, gains after the softcap, the Quantenkerne.
import { D } from '../../engine/decimal.js';
import { advance } from '../../engine/core.js';
import { formatNumber as fmt } from '../../engine/format.js';
import { newSeed, rngRoll, rngShuffle, toSeed } from '../../engine/kit/rng.js';
import { TUNE as T } from './tune.js';
import { act2Active, ownedOfType, tripOf, echoSighted, claimCost } from './map.js';
import { mutUnlocked, mutAddOffer, ripen } from './mutations.js';
import { galAnoRate } from './galaxy.js';

/* ------------------------------------------------------------------ */
/* State                                                                */
/* ------------------------------------------------------------------ */

/** Default state.rep2.ano (merged into rep2State by map.js; the RNG seed is derived from the map seed at the start of Akt II / by the migration). */
export function anoState() {
  return {
    on: false, // the first Anomalie sector has arrived
    rng: { seed: newSeed() },
    charge: 0, // seconds of play time towards the next timed anomaly
    wait: 0, // ... which comes after this many (drawn when the system starts)
    n: 0, // anomalies generated so far
    srcSeen: 0, // Anomalie sectors already counted as a source
    owed: 0, // sector sources waiting for their turn (only one anomaly can be pending)
    round: 0, // bags drawn so far
    bag: [], // types left in the current round
    pending: null, // { type, src: 'sektor'|'zeit', at: play time }
    active: null, // { type, left, dur } while a timed anomaly runs
    seen: {}, // type -> play time of the first start (story)
    started: 0, // anomalies started
    frags: [], // Signalfragment variants found, in order
    last: null, // { type, text } what the last one brought (UI)
  };
}

export const anoSeedFrom = (seed) => toSeed(Math.floor(toSeed(seed)) * 1597334677 + 2891336453);

/** Migration 4 -> 5: Sondenbefehle and Anomalien (state.rep2.cmd / .ano arrive through mergeDefaults; the anomaly stream gets a seed derived from the map seed). */
export function migrateToAno(data) {
  const r = data.rep2 || {};
  const seed = r.rng && Number.isFinite(r.rng.seed) ? r.rng.seed : 0;
  data.rep2 = { ...r, ano: { ...(r.ano || {}), rng: { seed: anoSeedFrom(seed) } } };
  data.v = 5;
  return data;
}

const AN = (g) => g.state.rep2.ano;
const played = (g) => g.state.time.played;

/** Start of Akt II (map.js act2Check): a fresh stream, derived from the map seed. */
export function anoReset(g) {
  Object.assign(AN(g), anoState(), { rng: { seed: anoSeedFrom(g.state.rep2.rng.seed) } });
}

/** Galaxiensprung (jump.js): the new map has no Anomalie sectors yet and a running rule change ends; a waiting anomaly stays (nothing is lost), the timer keeps its charge. */
export function anoJump(g) {
  const a = AN(g);
  a.srcSeen = 0;
  a.owed = 0;
  a.active = null;
}

/* ------------------------------------------------------------------ */
/* Definitions                                                          */
/* ------------------------------------------------------------------ */

const mm = (s) => (s % 60 === 0 ? `${s / 60} Min.` : `${s} s`);
const num = (x) => String(x).replace('.', ',');

/**
 * id, name, desc (the situation), effect(g) (what starting does, with numbers), risk?(g) (cost / catch), eligible(g), dur? (rule change in s),
 * ok?(g) (can it be started now: { ok, why }), start(g), end?(g) (reward when the rule change is over -> text), worth(g) (the sim's / auto's decision).
 */
export const ANOMALIES = [
  {
    id: 'gezeitenwelle',
    name: 'Gezeitenwelle',
    desc: 'Eine Gravitationswelle läuft durch den Sektor. Wer sich auf ihren Kamm legt, kommt schneller voran.',
    effect: () => `Erschließungen sind ${T.gezeitenwelle.trip}× so schnell, ${mm(T.gezeitenwelle.dur)} lang`,
    hint: 'Am meisten bringt sie, wenn gerade eine lange Erschließung läuft.',
    dur: T.gezeitenwelle.dur,
    eligible: () => true,
    worth: (g) => {
      const trip = tripOf(g);
      return !!trip && trip.left >= T.anoMinLeft;
    },
  },
  {
    id: 'zeitriss',
    name: 'Zeitriss',
    desc: 'Die Zeit reißt auf und schließt sich wieder. Dahinter sind ein paar Minuten vergangen, ohne dass jemand sie gelebt hat.',
    effect: () => `${mm(T.zeitriss.secs)} Spielzeit vergehen sofort: Produktion, Automaten, Erschließung und Angebote laufen so weit`,
    hint: 'Am meisten bringt er, wenn gerade eine lange Erschließung läuft.',
    eligible: () => true,
    worth: (g) => {
      const trip = tripOf(g);
      return !!trip && trip.left >= 0.8 * T.zeitriss.secs;
    },
    start: (g) => {
      // the clock jumps: ticks in small steps, exactly what an absence of that length would be (but online: Nachtschwärmer stays off)
      advance(g, T.zeitriss.secs, { maxStep: 0.5 });
      return `${mm(T.zeitriss.secs)} vergangen`;
    },
  },
  {
    id: 'strahl',
    name: 'Kosmischer Strahl',
    desc: 'Ein Strahl trifft die Kopien und schüttelt ihr Erbgut durch.',
    effect: () => 'Sofort ein zusätzliches Mutationsangebot, mindestens eine Karte „selten“',
    hint: 'Das Angebot wartet im Genom-Tab wie jedes andere.',
    eligible: (g) => mutUnlocked(g),
    worth: (g) => mutUnlocked(g),
    start: (g) => {
      mutAddOffer(g, 'selten');
      return 'Mutationsangebot (selten)';
    },
  },
  {
    id: 'spiegel',
    name: 'Spiegelangebot',
    desc: 'Im Nachbarsektor spiegelt sich dein eigenes Signal. Es bietet einen Tausch an, ohne zu sagen, wer da bietet.',
    effect: () => `Kostet ${Math.round(T.spiegel.cost * 100)} % deiner Sternsysteme. Dafür ein Mutationsangebot mit mindestens einem Glücksfehler`,
    risk: (g) => `Zahlst jetzt ${fmt(spiegelCost(g))} Sternsysteme`,
    eligible: (g) => echoSighted(g) && mutUnlocked(g),
    ok: (g) => (spiegelCost(g).gte(1) ? { ok: true } : { ok: false, why: 'Du hast keine Sternsysteme zum Tauschen.' }),
    // pays off when the stock is about to vanish anyway (Singularität) or the next sector stays affordable
    worth: (g) => spiegelCost(g).gte(1) && (g.canPrestige('singularity') || g.get('systems').sub(spiegelCost(g)).gte(nextClaimCost(g))),
    start: (g) => {
      const cost = spiegelCost(g);
      g.spend('systems', cost);
      mutAddOffer(g, 'glueck');
      return `${fmt(cost)} Sternsysteme gegen ein Mutationsangebot mit Glücksfehler`;
    },
  },
  {
    id: 'signal',
    name: 'Signalfragment',
    desc: 'Ein Fetzen Funkverkehr, alt und verzerrt. Die Wartungsroutine hat ihn aufgefangen und legt ihn ab.',
    effect: () => `Ein Eintrag in der Chronik, dauerhaft alle Gewinne ×${num(T.anoSignalGain)}`,
    eligible: (g) => AN(g).frags.length < FRAGMENTS,
    worth: () => true,
    start: (g) => {
      const a = AN(g);
      a.frags.push(a.frags.length);
      g.refresh();
      return `Fragment ${a.frags.length} von ${FRAGMENTS}`;
    },
  },
  {
    id: 'umkehr',
    name: 'Umkehrfeld',
    desc: 'Ein Feld, in dem die Fertigung rückwärts läuft: Oben wird gebaut, unten steht alles still. Danach läuft es weiter, mit mehr, als vorher da war.',
    effect: () => `${mm(T.umkehr.dur)} lang produzieren nur die Stufen 5 bis 8. Danach ${Math.round(T.umkehr.share * 100)} % der nächsten Singularität als Quantenkerne`,
    risk: () => 'Stufen 1 bis 4 stehen still, die Materie wächst in dieser Zeit nicht',
    dur: T.umkehr.dur,
    eligible: (g) => g.layerUnlocked('singularity'),
    // cheapest right after a Replikation, when there is little to lose
    worth: (g) => g.state.layers.replication.runTime < 30 && !g.chActive(),
    ok: (g) => (g.layerUnlocked('singularity') ? { ok: true } : { ok: false, why: 'Die Singularität ist noch nicht freigeschaltet.' }),
    end: (g) => {
      const amount = g.prestigeGain('singularity').mul(T.umkehr.share).floor();
      if (amount.gte(1)) g.add('cores', amount);
      return amount.gte(1) ? `+${fmt(amount)} Quantenkerne` : 'kein Bonus';
    },
  },
];
export const ANO_BY_ID = Object.fromEntries(ANOMALIES.map((a) => [a.id, a]));
export const FRAGMENTS = 4;

const spiegelCost = (g) => g.get('systems').mul(T.spiegel.cost).floor();
const nextClaimCost = (g) => claimCost(g);

/* ------------------------------------------------------------------ */
/* Lifecycle                                                            */
/* ------------------------------------------------------------------ */

export const anoUnlocked = (g) => act2Active(g) && AN(g).on;
export const anoPending = (g) => (anoUnlocked(g) ? AN(g).pending : null);
export const anoRunning = (g) => (anoUnlocked(g) ? AN(g).active : null);
export const anoIs = (g, id) => !!(anoUnlocked(g) && AN(g).active && AN(g).active.type === id && AN(g).active.left > 0);

/** A new round: the first one is fixed up to the third card (Gezeitenwelle, Signalfragment, Zeitriss: simple first, the story beat early), then shuffled. */
function newBag(a) {
  const ids = ANOMALIES.map((x) => x.id);
  const first = a.round === 0 ? ['gezeitenwelle', 'signal', 'zeitriss'] : [];
  a.round += 1;
  return [...first, ...rngShuffle(a.rng, ids.filter((id) => !first.includes(id)))];
}

/** The next type: the first eligible one of the bag (every type once per round, nothing repeats at once). T.anoForce = a type id: dev/measurement only. */
function drawType(g) {
  const a = AN(g);
  if (T.anoForce && ANO_BY_ID[T.anoForce]) return T.anoForce;
  if (!a.bag.length) a.bag = newBag(a);
  let i = a.bag.findIndex((id) => ANO_BY_ID[id].eligible(g));
  if (i < 0) {
    a.bag = newBag(a);
    i = a.bag.findIndex((id) => ANO_BY_ID[id].eligible(g));
    if (i < 0) return 'gezeitenwelle';
  }
  return a.bag.splice(i, 1)[0];
}

const nextWait = (g) => (T.anoEvery + rngRoll(AN(g).rng) * T.anoSpread) / galAnoRate(g);

function create(g, src) {
  const a = AN(g);
  a.n += 1;
  a.pending = { type: drawType(g), src, at: Math.max(0.001, played(g)) };
  g.plog('ano', `Anomalie ${a.n}: ${a.pending.type} (${src})`);
  g.emit('anomaly', { type: a.pending.type, src, n: a.n });
}

/** hooks.onTick, after mapTick (the speed effects read the time left BEFORE it is counted down here). */
export function anoTick(g, dt) {
  if (!act2Active(g) || T.anoForce === 'none') return;
  const a = AN(g);
  const sectors = ownedOfType(g, 'anomalie');
  if (sectors > a.srcSeen) {
    a.owed += sectors - a.srcSeen;
    a.srcSeen = sectors;
    if (!a.on) {
      a.on = true;
      a.wait = nextWait(g);
    }
  }
  if (!a.on) return;
  if (a.active) {
    a.active.left -= dt;
    if (a.active.left <= 0) finish(g);
  }
  if (!a.pending) {
    if (a.owed > 0) {
      a.owed -= 1;
      create(g, 'sektor');
    } else if (!a.active) {
      a.charge += dt;
      if (a.charge >= a.wait) {
        a.charge = 0;
        a.wait = nextWait(g);
        create(g, 'zeit');
      }
    }
  }
}

/** Can the pending anomaly be started now? { ok, why }. */
export function anoCanStart(g) {
  const p = anoPending(g);
  if (!p) return { ok: false, why: 'Keine Anomalie wartet.' };
  const def = ANO_BY_ID[p.type];
  if (def.dur && AN(g).active) return { ok: false, why: 'Eine andere Anomalie läuft noch.' };
  if (def.ok) {
    const r = def.ok(g);
    if (!r.ok) return r;
  }
  return { ok: true };
}

/** Start the pending anomaly. Returns false when there is none or it cannot start. */
export function anoStart(g) {
  if (!anoCanStart(g).ok) return false;
  const a = AN(g);
  const type = a.pending.type;
  const def = ANO_BY_ID[type];
  a.pending = null;
  a.started += 1;
  if (!(type in a.seen)) a.seen[type] = Math.max(0.001, played(g));
  let text = '';
  if (def.dur) a.active = { type, left: def.dur, dur: def.dur };
  if (def.start) text = def.start(g) || '';
  a.last = { type, text };
  g.plog('ano', `Start: ${type}${text ? ' (' + text + ')' : ''}`);
  g.refresh();
  g.emit('anomaly-start', { type, text });
  return true;
}

function finish(g) {
  const a = AN(g);
  const type = a.active.type;
  a.active = null;
  const text = ANO_BY_ID[type].end ? ANO_BY_ID[type].end(g) : '';
  a.last = { type, text, done: true };
  g.plog('ano', `Ende: ${type}${text ? ' (' + text + ')' : ''}`);
  g.refresh();
  g.emit('anomaly-end', { type, text });
}

/* ------------------------------------------------------------------ */
/* Effects (called by def.js hooks)                                     */
/* ------------------------------------------------------------------ */

/** Speed factor of the running Erschliessung for the next dt seconds (Gezeitenwelle), time weighted like the commands. */
export function anoTripSpeed(g, dt) {
  if (!anoIs(g, 'gezeitenwelle')) return 1;
  const left = AN(g).active.left;
  const f = dt > 0 ? Math.min(left, dt) / dt : 1;
  return 1 + (T.gezeitenwelle.trip - 1) * f;
}

/** Umkehrfeld: tiers 1-4 produce nothing (tier index < 4). */
export const anoTierMult = (g, i) => (i < 4 && anoIs(g, 'umkehr') ? 0 : 1);

/** Labeled factors on a prestige gain: the Signalfragmente (permanent, small). */
export function anoGainParts(g, kind) {
  if (!act2Active(g)) return [];
  const n = AN(g).frags.length;
  if (!n) return [];
  const v = ripen(g, kind, Math.pow(T.anoSignalGain, n));
  return v === 1 ? [] : [['Signalfragmente', D(v)]];
}
export const anoGain = (g, kind) => anoGainParts(g, kind).reduce((a, [, v]) => a.mul(v), D(1));

/* ------------------------------------------------------------------ */
/* The decision of the sim's player (and of a later auto)               */
/* ------------------------------------------------------------------ */

/** Is it a good moment to start the pending anomaly? After `anoPatience` s of waiting any startable one is taken. */
export function anoWorth(g) {
  const p = anoPending(g);
  if (!p || !anoCanStart(g).ok) return false;
  const def = ANO_BY_ID[p.type];
  return def.worth(g) || played(g) - p.at >= T.anoPatience;
}
/** Start the pending anomaly when it is worth it. Returns true if one was started. */
export function anoChoose(g) {
  return anoWorth(g) ? anoStart(g) : false;
}
