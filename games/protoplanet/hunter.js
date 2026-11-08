// Jaeger (kind 'hunter'): KI-Koerper mit derselben Physik wie der Spieler (Ausstoss kostet Masse, ihre Teilchen sind normale, fressbare Koerper).
// Gehirn = brain.js (wie der Bot), aber begrenzt: Reaktionszeit, Winkelrauschen, Zoegern, Tempolimit (T.hunter). Entscheidungen fallen nur im Takt
// der Reaktionszeit (nicht in jedem Physikschritt). Deterministisch: Zufall nur aus dem Seed des Jaegers (engine/kit/rng.js), der Zustand liegt im Koerper (`ai`)
// und damit im Schnappschuss (Zurueckspulen, Speichern).
import { T } from './tune.js';
import { think, pushFrac } from './brain.js';
import { ejectFrom } from './physics.js';
import { rngRoll, toSeed } from '../../engine/kit/rng.js';

const cache = {};
/** Parameter des Gehirns fuer eine Stufe (T.bot + T.hunter.bot + Stufe). */
export function brainParams(diff) {
  if (!cache[diff]) cache[diff] = { ...T.bot, ...T.hunter.bot, ...T.hunter.levels[diff].bot };
  return cache[diff];
}

/** Gehirn-Zustand eines neuen Jaegers: { seed, diff, react, next, plan }. */
export function makeAi({ seed, diff = 'normal' }) {
  const D = T.hunter.levels[diff];
  if (!D) throw new Error('Unbekannte Jaeger-Stufe: ' + diff);
  const r = { seed: toSeed(seed) };
  const react = D.react[0] + (D.react[1] - D.react[0]) * rngRoll(r);
  const next = react * rngRoll(r); // erste Entscheidung irgendwann in den ersten Sekunden, damit mehrere Jaeger nicht im Gleichschritt handeln
  return { seed: r.seed, diff, react, next, plan: null };
}

/** Eine Entscheidung des Jaegers `b` (aufgerufen, wenn seine Zeit gekommen ist). */
export function hunterAct(w, b) {
  const ai = b.ai;
  const D = T.hunter.levels[ai.diff];
  const r = { seed: ai.seed };
  const jitter = 0.85 + 0.3 * rngRoll(r);
  ai.next = w.t + ai.react * jitter;
  const hesitate = rngRoll(r) < D.hesitate;
  const noiseA = rngRoll(r) + rngRoll(r) + rngRoll(r) - 1.5; // ungefaehr Normalverteilung, Sigma 0,5
  const noiseM = rngRoll(r) * 2 - 1;
  if (!hesitate) {
    const a = think(w, b, { B: brainParams(ai.diff), goal: null }, ai);
    if (a) {
      const mag = Math.hypot(a.dx, a.dy) * (1 + D.magNoise * noiseM);
      const ang = Math.atan2(a.dy, a.dx) + 2 * D.aimNoise * noiseA;
      const dvx = Math.cos(ang) * mag;
      const dvy = Math.sin(ang) * mag;
      const B = brainParams(ai.diff);
      if (mag > 1e-9) ejectFrom(w, b, -dvx, -dvy, pushFrac(mag, B), B.ejectSpeed);
    }
  }
  ai.seed = r.seed;
}

/** Alle Jaeger, deren Zeit gekommen ist, entscheiden (feste Reihenfolge der Koerperliste). */
export function runHunters(w) {
  const n = w.bodies.length; // beim Ausstossen kommen Koerper hinten dazu
  for (let i = 0; i < n; i++) {
    const b = w.bodies[i];
    if (b.kind === 'hunter' && b.ai && b.m > 0 && w.t >= b.ai.next) hunterAct(w, b);
  }
}
