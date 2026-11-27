// Ablauf einer Aufgabe im Wartemodus und Fortschritt (DOM-frei).
import { rngNext } from '../../engine/kit/rng.js';
import { ISLANDS, findTask } from './world.js';

/**
 * Sterne nach Fehlgriffen. Gezählt werden NOTEN mit mindestens einem Fehlgriff (wer dreimal dieselbe falsche Taste drückt,
 * verliert nicht dreimal). Stück: 0 -> 3, bis 25 % (mind. 1) -> 2, sonst 1. Notenspiel (lenient): bis 1 -> 3, bis 30 % -> 2.
 */
export function starsFor(misses, n, lenient = false) {
  if (lenient) return misses <= 1 ? 3 : misses <= Math.max(3, Math.round(n * 0.3)) ? 2 : 1;
  if (misses === 0) return 3;
  if (misses <= Math.max(1, Math.round(n * 0.25))) return 2;
  return 1;
}

/**
 * Wartemodus: die Noten warten, bis der richtige Ton kommt. Ein falscher Ton ist ein Fehlgriff (zählt nur für die Sterne).
 * @param {{midi:number, beats:number}[]} notes
 */
export function createRun(notes, { lenient = false } = {}) {
  const st = { i: 0, presses: 0, missAt: new Set() };
  return {
    notes,
    get index() { return st.i; },
    /** Noten mit mindestens einem Fehlgriff */
    get misses() { return st.missAt.size; },
    /** alle falschen Tastendrücke */
    get wrongPresses() { return st.presses; },
    get done() { return st.i >= notes.length; },
    get want() { return st.i < notes.length ? notes[st.i].midi : null; },
    missedAt: (i) => st.missAt.has(i),
    /** @returns {{result:'hit'|'miss'|'done', index:number, want:number|null}} */
    input(midi) {
      if (st.i >= notes.length) return { result: 'done', index: st.i, want: null };
      const want = notes[st.i].midi;
      if (midi === want) return { result: 'hit', index: st.i++, want };
      st.presses++;
      st.missAt.add(st.i);
      return { result: 'miss', index: st.i, want };
    },
    stars: () => starsFor(st.missAt.size, notes.length, lenient),
  };
}

/** Noten für das Notenspiel: jede Note des Vorrats kommt vor, nie zweimal dieselbe hintereinander, fester Seed. */
export function noteGameNotes(pool, count, seed) {
  let s = seed >>> 0;
  const rnd = () => {
    const [v, n] = rngNext(s);
    s = n;
    return v;
  };
  const out = [];
  const bag = [];
  while (out.length < count) {
    if (!bag.length) bag.push(...pool);
    let k = Math.floor(rnd() * bag.length);
    if (out.length && bag[k] === out[out.length - 1].midi && bag.length > 1) k = (k + 1) % bag.length;
    out.push({ midi: bag.splice(k, 1)[0], beats: 1, bar: false });
  }
  return out;
}

// ---- Fortschritt ----------------------------------------------------------

export const COLLECT = { i0: 'muschel', i1: 'seestern', i2: 'schneckenhaus', i3: 'truhe' };

export function defaultProgress() {
  return {
    birdName: '',
    tasks: {}, // id -> {stars, plays}
    collect: [],
    settings: {
      input: 'touch', // 'touch' | 'mic'
      sound: true,
      allOpen: false, // Vorschau-Schalter: alle Inseln offen
      haptics: true, // Vibration bei Treffern (Android)
      help: { colors: true, names: true, fingers: true, keys: true },
    },
    calib: { offset: 0, done: false },
    boat: 'i0', // hier liegt das Boot
    finale: false, // Abschluss aller Inseln schon gefeiert
    revealed: ['i0'], // Inseln, deren Freischaltung schon gezeigt wurde
  };
}

export const taskDone = (p, id) => !!p.tasks[id];
export const islandDone = (p, isl) => isl.tasks.length > 0 && isl.tasks.every((t) => taskDone(p, t.id));

export function islandOpen(p, idx) {
  const isl = ISLANDS[idx];
  if (!isl || isl.soon) return false;
  if (idx === 0 || p.settings.allOpen) return true;
  return islandDone(p, ISLANDS[idx - 1]);
}

/** Nächste sinnvolle Aufgabe ("Weiter üben"): die erste offene, noch nicht geschaffte, in Reihenfolge. */
export function nextTask(p) {
  for (let i = 0; i < ISLANDS.length; i++) {
    if (!islandOpen(p, i) && !(i === 0)) continue;
    for (const t of ISLANDS[i].tasks) if (!taskDone(p, t.id)) return { island: ISLANDS[i], task: t };
  }
  return null;
}

/** Ergebnis eintragen. Liefert, was neu ist: {first, better, islandDone, collect}. */
export function record(p, taskId, stars) {
  const prev = p.tasks[taskId];
  const first = !prev;
  const better = !!prev && stars > prev.stars;
  p.tasks[taskId] = { stars: Math.max(stars, prev ? prev.stars : 0), plays: (prev ? prev.plays : 0) + 1 };
  const { island } = findTask(taskId);
  let collect = null;
  const done = islandDone(p, island);
  if (done && COLLECT[island.id] && !p.collect.includes(COLLECT[island.id])) {
    collect = COLLECT[island.id];
    p.collect.push(collect);
  }
  const idx = ISLANDS.indexOf(island);
  const next = done && collect ? ISLANDS[idx + 1] : null;
  return { first, better, islandDone: done && !!collect, collect, next: next && !next.soon ? next.id : null };
}

/** Insel offen UND ihre Freischaltung schon gezeigt (oder Vorschau-Schalter). */
export const islandShown = (p, idx) => islandOpen(p, idx) && (p.settings.allOpen || p.revealed.includes(ISLANDS[idx].id));

/** Die nächste Insel, die geöffnet, aber noch nicht feierlich freigeschaltet wurde (Bootsfahrt auf der Karte). */
export function pendingReveal(p) {
  if (p.settings.allOpen) return null;
  for (let i = 1; i < ISLANDS.length; i++) if (islandOpen(p, i) && !p.revealed.includes(ISLANDS[i].id)) return ISLANDS[i];
  return null;
}

/** Aufgabe mit den wenigsten Sternen (zum Nachspielen, wenn alles geschafft ist). */
export function weakestTask(p) {
  let best = null;
  for (const isl of ISLANDS) for (const t of isl.tasks) {
    if (t.kind !== 'song' && t.kind !== 'game') continue;
    const s = p.tasks[t.id]?.stars ?? 0;
    if (s < 3 && (!best || s < best.s)) best = { island: isl, task: t, s };
  }
  return best;
}
export const allDone = (p) => ISLANDS.every((isl) => isl.soon || islandDone(p, isl));

export const starsTotal = (p) => Object.values(p.tasks).reduce((s, t) => s + (t.stars || 0), 0);
