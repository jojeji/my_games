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
