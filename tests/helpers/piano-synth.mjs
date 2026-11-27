// Künstliche Klaviertöne für die Tests der Tonerkennung (kein echtes Klavier, aber die schwierigen Eigenschaften:
// schwacher Grundton, starker 2. Teilton, leicht gespreizte Obertöne (Inharmonizität), Abklingen, Rauschen).
import { rngNext } from '../../engine/kit/rng.js';

export const SR = 48000;

/** notes: [{midi, at (s), dur (s), vel?, detune? (Cent)}] -> Float32Array */
export function render(notes, { seconds, noise = 0.002, seed = 1, weakFundamental = 0.25, B = 0.0004, sr = SR } = {}) {
  const len = Math.ceil(seconds * sr);
  const out = new Float32Array(len);
  for (const n of notes) {
    const f0 = 440 * 2 ** ((n.midi - 69 + (n.detune ?? 0) / 100) / 12);
    const amps = [weakFundamental, 1, 0.6, 0.35, 0.25, 0.15, 0.1, 0.06];
    const start = Math.floor(n.at * sr);
    const end = Math.min(len, Math.floor((n.at + n.dur) * sr));
    const vel = n.vel ?? 0.2;
    for (let h = 0; h < amps.length; h++) {
      const k = h + 1;
      const fk = k * f0 * Math.sqrt(1 + B * k * k);
      if (fk > sr / 2.2) break;
      const w = (2 * Math.PI * fk) / sr;
      const decay = 1.2 + 0.4 * k; // höhere Teiltöne klingen schneller ab
      for (let i = start; i < end; i++) {
        const t = (i - start) / sr;
        const env = Math.min(1, t / 0.004) * Math.exp(-decay * t) * (i > end - 480 ? (end - i) / 480 : 1);
        out[i] += vel * amps[h] * env * Math.sin(w * (i - start));
      }
    }
  }
  let s = seed >>> 0;
  for (let i = 0; i < len; i++) {
    const [v, next] = rngNext(s);
    s = next;
    out[i] += noise * (v * 2 - 1);
  }
  return out;
}

/**
 * Künstliche Sprache im Hintergrund (für Tests der Störfestigkeit): stimmhafte Silben mit gleitender Tonhöhe
 * (Satzmelodie), Vokal-Formanten, Silbenrhythmus ~4-6 Hz, stimmlose Zischlaute dazwischen.
 * f0 in Hz (Männer ~85-180, Frauen ~165-260, Kinder ~250-400).
 */
export function speech({ seconds, seed = 7, f0 = [110, 220], level = 0.05, sr = SR } = {}) {
  const len = Math.ceil(seconds * sr);
  const out = new Float32Array(len);
  let s = seed >>> 0;
  const rnd = () => { const [v, n] = rngNext(s); s = n; return v; };
  const VOWELS = [[730, 1090], [270, 2290], [530, 1840], [300, 870], [570, 840]]; // a i e u o
  let t = 0.05;
  let phase = 0;
  while (t < seconds - 0.1) {
    const dur = 0.09 + rnd() * 0.2; // stimmhafte Silbe
    const fStart = f0[0] + rnd() * (f0[1] - f0[0]);
    const fEnd = fStart * (0.8 + rnd() * 0.45); // Tonhöhe gleitet
    const [F1, F2] = VOWELS[Math.floor(rnd() * VOWELS.length)];
    const a = Math.floor(t * sr), b = Math.min(len, Math.floor((t + dur) * sr));
    for (let i = a; i < b; i++) {
      const u = (i - a) / (b - a);
      const f = fStart + (fEnd - fStart) * u + 3 * Math.sin(2 * Math.PI * 5.5 * (i / sr));
      phase += (2 * Math.PI * f) / sr;
      const env = Math.sin(Math.PI * u) ** 0.6;
      let v = 0;
      for (let k = 1; k <= 18; k++) {
        const fk = k * f;
        if (fk > 4000) break;
        const w = 1 / (1 + ((fk - F1) / 120) ** 2) + 0.7 / (1 + ((fk - F2) / 160) ** 2) + 0.08 / k;
        v += w * Math.sin(k * phase);
      }
      out[i] += level * env * v * 0.5;
    }
    t += dur;
    const gap = 0.03 + rnd() * 0.12; // Pause oder Zischlaut
    if (rnd() < 0.5) {
      const ga = Math.floor(t * sr), gb = Math.min(len, Math.floor((t + gap) * sr));
      for (let i = ga; i < gb; i++) out[i] += level * 0.4 * (rnd() * 2 - 1);
    }
    t += gap + (rnd() < 0.15 ? 0.25 + rnd() * 0.4 : 0); // ab und zu eine Atempause
  }
  return out;
}

/** Signale mischen (gleiche Länge vorausgesetzt, sonst kürzere wird aufgefüllt). */
export function mix(...sigs) {
  const len = Math.max(...sigs.map((x) => x.length));
  const out = new Float32Array(len);
  for (const x of sigs) for (let i = 0; i < x.length; i++) out[i] += x[i];
  return out;
}
