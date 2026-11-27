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

// Störfestigkeit gegen Sprache im Raum (Fassung 4, siehe docs/inselmelodie.md „Hintergrundgeräusche“):
//  - Tonhöhe muss stillstehen: alle Fenster eines Kandidaten innerhalb `jitterCents` (Sprache gleitet, Klavier nicht).
//  - Mit Kontext (Spiel): nur Töne im Tastenbereich der Aufgabe, nur Töne nah an der kalibrierten Stimmung (`tuneCents`),
//    und eine FALSCHE Note braucht mehr Beweise als die gesuchte (Anschlag + `strictFrames` + `strictClarity`).
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
  jitterCents: 15, // so weit darf die Tonhöhe innerhalb eines Kandidaten wandern
  tuneCents: 30, // mit Kontext: so weit darf ein Ton von der kalibrierten Note abweichen
  strictFrames: 6, // mit Kontext: so viele stabile Fenster (~100 ms) braucht eine falsche Note (4: Kinderstimmen 7,9 Fehlgriffe/min, 6: 0,8)
  strictClarity: 0.9, // mit Kontext: Mindest-Klarheit (in allen Fenstern) für eine falsche Note
  rangePad: 2, // mit Kontext: Halbtöne Spielraum um den Tastenbereich
  strictJitter: 10, // mit Kontext: so ruhig muss die Tonhöhe einer falschen Note sein (Cent)
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
    ctx: null, // {want, lo, hi} aus dem Spiel, sonst null (Probe, Kalibrierung)
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
    const ctx = st.ctx;
    if (ctx) {
      if (midi < ctx.lo - o.rangePad || midi > ctx.hi + o.rangePad) return reject();
      // Stimmungsfilter nur für FALSCHE Noten: ein einzelner schief gestimmter Ton des Klaviers darf das Spiel nie blockieren
      if (midi !== ctx.want && Math.abs(cents) > o.tuneCents) return reject();
    }

    if (st.cand && st.cand.midi === midi && Math.abs(cents - st.cand.c0) <= o.jitterCents) {
      st.cand.n++;
      st.cand.cents.push(cents);
      st.cand.minClar = Math.min(st.cand.minClar, f.clarity);
      st.cand.lo = Math.min(st.cand.lo, cents);
      st.cand.hi = Math.max(st.cand.hi, cents);
    } else st.cand = { midi, n: 1, cents: [cents], c0: cents, lo: cents, hi: cents, minClar: f.clarity };
    if (st.cand.hi - st.cand.lo > o.jitterCents) { st.cand = null; return null; } // Tonhöhe gleitet: Sprache

    const armed = st.armedAt >= 0;
    const wanted = !ctx || ctx.want == null || midi === ctx.want;
    let need = armed ? o.stableFrames : o.stableFrames + 1;
    if (!wanted) {
      // falsche Note: nur mit deutlichem Anschlag, länger stabil und sehr klar (sonst zählt Gerede als Fehlgriff)
      if (!armed && midi !== st.active) need = Infinity;
      need = Math.max(need, o.strictFrames);
      if (st.cand.minClar < o.strictClarity) need = Infinity;
      if (st.cand.hi - st.cand.lo > o.strictJitter) need = Infinity;
    }
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

  function reject() {
    st.cand = null;
    return null;
  }

  return {
    push,
    /** Kontext aus dem Spiel: gesuchte Note und Tastenbereich (null = ohne Kontext, wie die Probe). */
    setContext(c) { st.ctx = c ? { want: c.want ?? null, lo: c.lo ?? o.minMidi, hi: c.hi ?? o.maxMidi } : null; },
    setOffset(c) { st.offset = c; },
    get offset() { return st.offset; },
    get floor() { return st.floor; },
    get gate() { return gate(); },
    get active() { return st.active; },
    options: o,
  };
}
