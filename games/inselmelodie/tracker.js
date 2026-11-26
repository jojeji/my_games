// Notenverfolger (DOM-frei): macht aus einer Folge von Messfenstern ("Frames": Pegel, Frequenz, Klarheit)
// Anschlag-Ereignisse. Ein Ereignis = "eine Taste wurde angeschlagen", genau einmal pro Anschlag, auch wenn
// dieselbe Taste zweimal hintereinander gespielt wird (G-G in "Hänschen klein").
//
// Erkennung eines Anschlags:
//  (a) Pegelsprung: der Pegel steigt um `onsetRatio` über das Minimum der letzten Frames (ein Klavierton klingt
//      nur ab, ein neuer Anschlag ist ein Sprung nach oben). Danach muss die Tonhöhe `stableFrames` Frames lang
//      gleich sein, dann wird gemeldet.
//  (b) Tonwechsel ohne deutlichen Sprung (gebunden gespielt, leise): andere Note, `stableFrames + 1` Frames stabil.
// Ein Ton gilt als beendet, wenn der Pegel unter das Tor fällt oder die Klarheit länger fehlt.

import { nearest } from './notes.js';

export const TRACKER_DEFAULTS = {
  minClarity: 0.8, // Fenster mit geringerer Klarheit zählen nicht als Ton
  onsetRatio: 1.6, // Pegelsprung für einen neuen Anschlag
  onsetLookback: 5, // Frames, über die das Minimum für den Pegelsprung gesucht wird
  stableFrames: 2, // gleiche Note in so vielen Fenstern, bevor gemeldet wird
  armMs: 260, // so lange nach einem Pegelsprung auf eine stabile Tonhöhe warten
  gateAbs: 0.002, // absolutes Mindest-Pegel (RMS)
  gateFloor: 3, // Tor = gateFloor × Grundrauschen
  releaseMs: 180, // so lange ohne Ton, dann gilt die Taste als losgelassen
  minMidi: 36,
  maxMidi: 96,
};

export function createTracker(opt = {}) {
  const o = { ...TRACKER_DEFAULTS, ...opt };
  const st = {
    floor: 0.001, // Grundrauschen (RMS), folgt langsam
    hist: [], // letzte Pegel
    armedAt: -1,
    cand: null, // {midi, n, cents[]}
    active: null, // Note, die gerade klingt (gemeldet)
    lastGood: -1,
    offset: opt.offsetCents ?? 0,
  };

  function gate() {
    return Math.max(o.gateAbs, st.floor * o.gateFloor);
  }

  /**
   * @param {{t:number, rms:number, freq:number, clarity:number}} f t in ms
   * @returns {null | {midi:number, cents:number, t:number, rms:number, clarity:number, onset:boolean}}
   */
  function push(f) {
    const minRecent = st.hist.length ? Math.min(...st.hist) : f.rms;
    st.hist.push(f.rms);
    if (st.hist.length > o.onsetLookback) st.hist.shift();

    const voiced = f.freq > 0 && f.clarity >= o.minClarity && f.rms >= gate();
    // Grundrauschen nur aus Fenstern ohne Ton schätzen: schnell nach unten, langsam nach oben
    if (!voiced) st.floor = f.rms < st.floor ? st.floor * 0.7 + f.rms * 0.3 : st.floor * 0.995 + f.rms * 0.005;

    if (f.rms >= gate() && f.rms > minRecent * o.onsetRatio) {
      st.armedAt = f.t;
      st.cand = null;
      return null; // das Fenster des Anschlags selbst enthält oft noch den alten Ton
    }
    if (st.armedAt >= 0 && f.t - st.armedAt > o.armMs) st.armedAt = -1;

    if (!voiced) {
      if (st.active !== null && f.t - st.lastGood > o.releaseMs) st.active = null;
      if (st.armedAt < 0) st.cand = null;
      return null;
    }
    st.lastGood = f.t;
    const { midi, cents } = nearest(f.freq, st.offset);
    if (midi < o.minMidi || midi > o.maxMidi) return null;

    if (st.cand && st.cand.midi === midi) {
      st.cand.n++;
      st.cand.cents.push(cents);
    } else st.cand = { midi, n: 1, cents: [cents] };

    const armed = st.armedAt >= 0;
    const need = armed ? o.stableFrames : o.stableFrames + 1;
    if (st.cand.n >= need && (armed || midi !== st.active)) {
      const cs = st.cand.cents.slice().sort((a, b) => a - b);
      const ev = { midi, cents: cs[cs.length >> 1], t: f.t, rms: f.rms, clarity: f.clarity, onset: armed };
      st.active = midi;
      st.armedAt = -1;
      st.cand = null;
      return ev;
    }
    return null;
  }

  return {
    push,
    setOffset(c) { st.offset = c; },
    get offset() { return st.offset; },
    get floor() { return st.floor; },
    get gate() { return gate(); },
    get active() { return st.active; },
    options: o,
  };
}
