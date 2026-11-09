// Protoplanet: Klang-Logik (DOM-frei, laeuft in Node). Tonleitern, Akkordwahl, Zeitplanung, Drosselung und die Abbildung Spielzustand -> Musikparameter.
// Die WebAudio-Knoten stehen in audio.js. Der Zufall hier ist ein EIGENER Strom (engine/kit/rng.js), nie der der Physik; die Physik liest nichts von hier.
import { T } from './tune.js';
import { rngNext, toSeed } from '../../engine/kit/rng.js';

const A = T.audio;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

/** Stimmung zu einer Kapitel-ID ('select' oder Zahl). Unbekannte Kapitel klingen wie Kapitel 1. */
export const moodFor = (id) => A.moods[id] || A.moods[1];
export const scaleOf = (mood) => A.scales[mood.scale];

/** Kleiner Zufallsstrom auf Basis von rngNext (Zustand = eine Zahl). */
export function makeRng(seed) {
  const r = { seed: toSeed(seed) };
  const next = () => {
    const [v, s] = rngNext(r.seed);
    r.seed = s;
    return v;
  };
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    get seed() {
      return r.seed;
    },
  };
}

/** MIDI-Note der Skalenstufe idx (beliebig, auch negativ; Stufe 0 = Grundton). */
export function scaleMidi(mood, idx) {
  const sc = scaleOf(mood);
  const n = sc.length;
  const oct = Math.floor(idx / n);
  const deg = ((idx % n) + n) % n;
  return mood.root + 12 * oct + sc[deg];
}

/** Liegt die MIDI-Note in der Tonleiter der Stimmung? */
export const inScale = (mood, midi) => scaleOf(mood).includes((((midi - mood.root) % 12) + 12) % 12);

/** Akkord auf der Skalenstufe r: Terzschichtung innerhalb der Tonleiter (r, r+2, r+4, r+6, r+n), alles garantiert in der Tonleiter. */
export function chordNotes(mood, r, count) {
  const n = scaleOf(mood).length;
  const steps = [0, 2, 4, 6, n].slice(0, clamp(Math.round(count), 3, 5));
  return steps.map((s) => scaleMidi(mood, n + r + s)); // ab Oktave 1 ueber dem Grundton
}

/* ---------- Spielzustand -> Parameter ---------- */

/** Gefahr 0..1: der naechste Koerper, der dich absorbieren koennte (Masse >= 0,97 x deine), je naeher desto hoeher. */
export function dangerOf(w) {
  const p = w && w.player;
  if (!p) return 0;
  const rp = Math.sqrt(p.m);
  const lim = p.m * A.danger.ratio;
  const range = A.danger.range + rp * A.danger.rangeR;
  let d = 0;
  for (const b of w.bodies) {
    if (b === p || b.m < lim || b.kind === 'attractor') continue; // der Protostern ist keine Beute-Gefahr: ihn meldet die Bahnwarnung
    const gap = Math.hypot(b.x - p.x, b.y - p.y) - rp - Math.sqrt(b.m);
    const v = 1 - gap / range;
    if (v > d) d = v;
  }
  d = clamp(d, 0, 1);
  return d * d;
}

/** Spielergroesse 0..1 (logarithmisch ueber der Startmasse 1). */
export const sizeOf = (m) => clamp(Math.log10(Math.max(m, 1e-6)) / A.sizeLog, 0, 1);

const tsLog = (ts) => clamp(Math.log(Math.max(ts, 0.01)) / Math.log(10), -0.6, 1); // x1/4 -> -0,6, x1 -> 0, x4 -> 0,6, x10 -> 1

/**
 * Weiche Zielwerte der Musik. inp = { danger 0..1, size 0..1, timeScale, lift -1..1 (Sieg + / Verlust -) }.
 * Jeder Wert wird auf T.audio.limits geklemmt; audio.js gleitet mit Zeitkonstanten dorthin (nie abrupt).
 */
export function musicParams(inp, mood) {
  const danger = clamp(Number(inp.danger) || 0, 0, 1);
  const size = clamp(Number(inp.size) || 0, 0, 1);
  const lift = clamp(Number(inp.lift) || 0, -1, 1);
  const ts = tsLog(Number(inp.timeScale) || 1);
  const bright = clamp(mood.bright + 0.25 * size + 0.14 * ts - 0.3 * danger + 0.3 * lift, 0, 1);
  const raw = {
    droneCut: lerp(mood.cutLo, mood.cutHi, bright) * (ts < 0 ? 0.75 : 1),
    droneGain: 0.22 * mood.drone * (1 + 0.45 * danger) * (1 - 0.25 * Math.max(0, -lift)),
    beatGain: 0.2 * mood.beat * danger,
    upperGain: 0.16 * size * (0.6 + 0.4 * bright),
    chordCut: lerp(500, 3200, bright),
    chordGain: 0.2 * mood.chord * (1 - 0.55 * danger) * (0.75 + 0.25 * size) * (1 + 0.25 * Math.max(0, lift)),
    starRate: (1 + 1.1 * size + 0.5 * Math.max(0, ts) - 0.75 * danger + 0.5 * Math.max(0, lift)) * (ts < 0 ? 0.7 : 1),
    tempo: 1 + 0.2 * ts,
    lfoRate: 1 + 0.4 * ts,
    wet: 0.42 + 0.1 * size - 0.15 * danger,
    noteCount: 3 + (size > 0.35 ? 1 : 0) + (size > 0.7 ? 1 : 0),
  };
  return clampParams(raw);
}

export function clampParams(p) {
  const out = {};
  for (const [k, [lo, hi]] of Object.entries(A.limits)) out[k] = clamp(Number.isFinite(p[k]) ? p[k] : lo, lo, hi);
  return out;
}

/** Lautstaerke-Regler (0-100 %) -> Verstaerkung 0..1. */
export const volumeGain = (pct) => Math.pow(clamp((Number(pct) || 0) / 100, 0, 1), A.curve);

/* ---------- Musik-Planer ---------- */

/**
 * Plant Akkorde und "Sterne" (Einzeltoene) zeitlich im Voraus. Gleicher Seed + gleiche Aufrufe = gleicher Plan.
 * plan(from, to, { vol, noteCount, starRate, tempo }) gibt Ereignisse mit Zeit t in [from, to) zurueck; vol <= 0.001 plant nichts (und setzt den Faden zurueck).
 */
export function createScore(seed, moodId = 'select') {
  const r = makeRng(seed); // Akkorde
  const rs = makeRng((toSeed(seed) ^ 0x85ebca6b) >>> 0); // Sterne (eigener Strom: der Plan haengt nicht von der Fenstergroesse ab)
  const s = { moodId, mood: moodFor(moodId), nextChord: null, nextStar: null, lastRoot: -1, lastStar: -99 };

  s.setMood = (id, now = 0) => {
    if (id === s.moodId) return;
    s.moodId = id;
    s.mood = moodFor(id);
    s.lastRoot = -1;
    if (s.nextChord != null) s.nextChord = Math.min(s.nextChord, now + 1.5); // ein Wechsel der Stimmung ist gleich zu hoeren
  };

  s.plan = (from, to, p = {}) => {
    const out = [];
    const vol = p.vol == null ? 1 : p.vol;
    if (!(vol > 0.001)) {
      s.nextChord = null;
      s.nextStar = null;
      return out;
    }
    const mood = s.mood;
    const tempo = clamp(p.tempo || 1, A.limits.tempo[0], A.limits.tempo[1]);
    const rate = clamp(p.starRate || 1, A.limits.starRate[0], A.limits.starRate[1]);
    if (s.nextChord == null) {
      s.nextChord = from + 0.3;
      s.nextStar = from + rs.range(2.5, 5);
    }
    if (s.nextChord < from) s.nextChord = from;
    if (s.nextStar < from) s.nextStar = from;
    const nScale = scaleOf(mood).length;
    while (s.nextChord < to) {
      const every = r.range(mood.chordEvery[0], mood.chordEvery[1]) / tempo;
      let root = r.pick(mood.roots);
      if (root === s.lastRoot) root = r.pick(mood.roots); // seltener zweimal derselbe Akkord
      s.lastRoot = root;
      const notes = chordNotes(mood, root, p.noteCount || 3);
      const dur = every * 1.4;
      out.push({ type: 'chord', t: s.nextChord, dur, attack: dur * 0.38, notes, hz: notes.map(midiToHz), mood: s.moodId });
      s.nextChord += every;
    }
    while (s.nextStar < to) {
      const lo = nScale * 2;
      const span = nScale + 2; // gut eine Oktave ueber dem Akkordbereich
      let idx = rs.int(lo, lo + span);
      if (idx === s.lastStar) idx = lo + ((idx - lo + 2) % (span + 1));
      s.lastStar = idx;
      const midi = scaleMidi(mood, idx);
      out.push({ type: 'star', t: s.nextStar, midi, hz: midiToHz(midi), pan: rs.range(-0.8, 0.8), vel: rs.range(0.35, 1), decay: rs.range(5, 9) });
      s.nextStar += rs.range(mood.starEvery[0], mood.starEvery[1]) / rate;
    }
    return out.sort((a, b) => a.t - b.t);
  };
  return s;
}

/* ---------- Effekt-Drosselung und Tonwahl ---------- */

/**
 * Drosselung der Effekte: allow(kind, t) -> { ok, chain }. `ok` false = zu dicht (Mindestabstand oder Anzahl je Sekunde).
 * `chain` zaehlt Aufnahmen kurz hintereinander (auch verworfene), daraus wird ein aufsteigendes Arpeggio statt Laerm.
 */
export function createGate(rules = A.sfx.gates, chainWin = A.sfx.chainWin) {
  const hist = {};
  let lastAbs = -Infinity;
  let chain = 0;
  return {
    allow(kind, t) {
      const rule = rules[kind];
      if (kind === 'absorb') {
        chain = t - lastAbs <= chainWin ? chain + 1 : 1;
        lastAbs = t;
      }
      if (!rule) return { ok: true, chain };
      const h = hist[kind] || (hist[kind] = []);
      while (h.length && t - h[0] >= 1) h.shift();
      const last = h.length ? h[h.length - 1] : -Infinity;
      if (t - last < rule.gap || h.length >= rule.max) return { ok: false, chain };
      h.push(t);
      return { ok: true, chain };
    },
  };
}

/**
 * Ton fuer eine Aufnahme: ratio = Masse des Happens / Spielermasse. Grosser Happen = tiefer, laenger, voller; chain = Position im Arpeggio.
 */
export function absorbPitch(mood, ratio, chain = 1) {
  const c = A.sfx;
  const u = clamp((Math.log10(Math.max(ratio, 1e-6)) + 3) / 3, 0, 1); // 0 = winzig, 1 = so gross wie du
  const base = Math.round(lerp(c.absorbHiIdx, c.absorbLoIdx, u));
  const step = [0, 1, 2, 4, 3, 5][clamp(chain - 1, 0, c.chainMax)]; // Zickzack nach oben, bleibt in der Tonleiter
  const n = scaleOf(mood).length;
  const midi = scaleMidi(mood, n + base + step);
  return { midi, hz: midiToHz(midi), gain: lerp(0.45, 1, u), dur: lerp(0.28, 0.7, u), body: u };
}

/** Sieg-Figur: aufsteigende Stufen der Tonleiter (relativ zur Skala, Zeit in s). */
export function winFigure(mood) {
  const n = scaleOf(mood).length;
  const idx = n >= 7 ? [0, 2, 4, 6, 7] : [0, 1, 2, 3, 5];
  return idx.map((i, k) => ({ dt: k * 0.15, midi: scaleMidi(mood, n + i) }));
}
