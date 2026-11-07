// Ziele (largest, last, absorb, mass), Fortschritt, Sterne. DOM-frei.
import { T } from './tune.js';

export const fmtMass = (m) => (Math.round(m * 100) / 100).toFixed(2).replace('.', ',');

export function goalText(goal) {
  if (goal.type === 'largest') return 'Werde der größte Körper';
  if (goal.type === 'last') return 'Werde der letzte Körper';
  if (goal.type === 'absorb') return 'Absorbiere den Zielkörper';
  if (goal.type === 'mass') return 'Erreiche die Masse ' + fmtMass(goal.value);
  return '';
}

/**
 * Ziel 'last': Koerper, die noch zaehlen = alle ausser dem Spieler mit Masse >= dustFrac x Spielermasse.
 * Staub (darunter) zaehlt nicht; auch der eigene Ausstoss des Spielers (`gf` = Spieler-id) zaehlt nie, sonst jagt man am Ende seine eigenen Teilchen.
 * @returns {{n:number, mass:number}}
 */
export function lastRemaining(world) {
  const p = world.player;
  let n = 0;
  let mass = 0;
  if (!p) return { n, mass };
  const lim = T.dustFrac * p.m;
  for (const b of world.bodies) {
    if (b === p || b.gf === p.id || b.m < lim) continue;
    n++;
    mass += b.m;
  }
  return { n, mass };
}

/** @returns {{done:boolean, frac:number, n?:number}} frac in [0,1]; bei 'last' ist n die Zahl der verbleibenden Koerper */
export function goalStatus(world, goal) {
  const p = world.player;
  if (!p) return { done: false, frac: 0 };
  if (goal.type === 'mass') return { done: p.m >= goal.value, frac: Math.min(1, p.m / goal.value) };
  if (goal.type === 'last') {
    const r = lastRemaining(world);
    if (r.n === 0) return { done: true, frac: 1, n: 0 };
    // Balken nach absorbierter Masse: bisher aufgenommen / (aufgenommen + noch verbleibender zaehlender Koerper)
    const got = world.stats.gained;
    return { done: false, frac: Math.min(0.99, got / (got + r.mass)), n: r.n };
  }
  if (goal.type === 'absorb') {
    const t = world.bodies.find((b) => b.tag === 'target');
    if (!t) return { done: true, frac: 1 };
    // erst Masse aufbauen (bis 50 %), dann dem Zielkoerper naeherkommen (bis 99 %)
    if (p.m <= t.m) return { done: false, frac: 0.5 * (p.m / t.m) };
    const d = Math.hypot(t.x - p.x, t.y - p.y);
    if (goal.d0 == null || d > goal.d0) goal.d0 = d;
    return { done: false, frac: 0.5 + 0.49 * (1 - Math.min(1, d / goal.d0)) };
  }
  // largest
  let mx = 0;
  for (const b of world.bodies) if (b !== p && b.m > mx) mx = b.m;
  if (mx <= 0) return { done: true, frac: 1 };
  return { done: p.m > mx, frac: Math.min(1, p.m / mx) };
}

/** Sterne eines Ergebnisses {time, ejected (Anteil der Startmasse), rewound}. */
export function starsFor(level, res) {
  const eff = !res.rewound && res.ejected <= level.targets.eject;
  const fast = res.time <= level.targets.time;
  return { count: 1 + (eff ? 1 : 0) + (fast ? 1 : 0), eff, fast };
}
