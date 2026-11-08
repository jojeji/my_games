// Ziele (last, largest = "Werde unangreifbar", absorb, mass), Fortschritt, Sterne. DOM-frei.
import { T } from './tune.js';

export const fmtMass = (m) => (Math.round(m * 100) / 100).toFixed(2).replace('.', ',');

export function goalText(goal) {
  if (goal.type === 'largest') return 'Werde unangreifbar';
  if (goal.type === 'last') return 'Werde der letzte Körper';
  if (goal.type === 'absorb') return goal.label || 'Absorbiere den Zielkörper';
  if (goal.type === 'mass') return 'Erreiche die Masse ' + fmtMass(goal.value);
  return '';
}

/** Eine Zeile, die das Ziel erklaert (Pausenmenue, Hilfen). */
export function goalExplain(goal) {
  if (goal.type === 'largest') return 'Kein anderer Körper ist größer als du, auch kein Jäger. Du musst die Brocken nicht fressen, nur überholen.';
  if (goal.type === 'last') return 'Es bleibt kein Körper übrig, der noch zählt. Staub und dein eigener Ausstoß zählen nicht.';
  if (goal.type === 'absorb') return 'Der markierte Körper muss absorbiert werden.';
  if (goal.type === 'mass') return 'Wachse an den Kleinen, ohne dich absorbieren zu lassen.';
  return '';
}

/** Zeile rechts neben dem Fortschrittsbalken ("Noch 2 Körper" / "Noch 1 größerer" / Prozent). */
export function goalCounter(goal, status) {
  if (goal.type === 'last') return `Noch ${status.n == null ? '–' : status.n} Körper`;
  if (goal.type === 'largest') return status.n == null ? '–' : status.n === 1 ? 'Noch 1 größerer' : `Noch ${status.n} größere`;
  return Math.floor(status.frac * 100) + ' %';
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
  // largest ("Werde unangreifbar"): im Moment ist kein anderer Koerper (auch Jaeger, Attraktoren, eigene Teilchen) groesser als der Spieler.
  // Anzeige: Zahl der groesseren Koerper (n, "Noch 2 groessere"); der Balken zeigt eigene Masse / Masse des groessten anderen Koerpers.
  let mx = 0;
  let n = 0;
  for (const b of world.bodies) {
    if (b === p) continue;
    if (b.m > mx) mx = b.m;
    if (b.m >= p.m) n++;
  }
  if (mx <= 0 || n === 0) return { done: true, frac: 1, n: 0 };
  return { done: false, frac: Math.min(0.99, p.m / mx), n };
}

/** Sterne eines Ergebnisses {time, ejected (Anteil der Startmasse), rewound}. */
export function starsFor(level, res) {
  const eff = !res.rewound && res.ejected <= level.targets.eject;
  const fast = res.time <= level.targets.time;
  return { count: 1 + (eff ? 1 : 0) + (fast ? 1 : 0), eff, fast };
}
