// Ziele (largest, absorb, mass), Fortschritt, Sterne. DOM-frei.

export const fmtMass = (m) => (Math.round(m * 100) / 100).toFixed(2).replace('.', ',');

export function goalText(goal) {
  if (goal.type === 'largest') return 'Werde der größte Körper';
  if (goal.type === 'absorb') return 'Absorbiere den markierten Körper';
  if (goal.type === 'mass') return 'Erreiche die Masse ' + fmtMass(goal.value);
  return '';
}

/** @returns {{done:boolean, frac:number}} frac in [0,1] */
export function goalStatus(world, goal) {
  const p = world.player;
  if (!p) return { done: false, frac: 0 };
  if (goal.type === 'mass') return { done: p.m >= goal.value, frac: Math.min(1, p.m / goal.value) };
  if (goal.type === 'absorb') {
    const t = world.bodies.find((b) => b.tag === 'target');
    if (!t) return { done: true, frac: 1 };
    return { done: false, frac: Math.min(0.99, p.m / t.m) };
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
