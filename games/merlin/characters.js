// Cast of Merlin. Display names and portrait images live ONLY here - story texts reference names through this config.
// img: relative to the game page (games/merlin/). sm = 160 px variant for lists. If an image fails to load the UI shows an initial.
const stage = (n) => ({ img: `img/merlin-${n}.webp`, sm: `img/merlin-${n}-sm.webp` });

export const CAST = {
  merlin: {
    id: 'merlin', name: 'Merlin', role: 'Zeitreisender',
    // age stage per era (0 = Ende der Zeit ... 7 = Anbeginn): he gets younger monotonically
    stages: [stage(75), stage(75), stage(55), stage(55), stage(40), stage(40), stage(25), stage(25)],
  },
  chronist: { id: 'chronist', name: 'Jonas', role: 'der Chronist', img: 'img/chronist.webp', sm: 'img/chronist-sm.webp' },
  waechter: { id: 'waechter', name: 'Leo', role: 'der Zeitwächter', img: 'img/waechter.webp', sm: 'img/waechter-sm.webp' },
};
export const J = CAST.chronist.name;
export const L = CAST.waechter.name;

/** Era index (0..7) a story entry belongs to; the ending counts as the youngest, a new cycle as the oldest stage. */
export function entryEra(entry) {
  const c = entry && entry.chapter;
  if (c === 'ende') return 7;
  if (c === 'zyklus') return 0;
  const m = /^e(\d)$/.exec(c || '');
  return m ? Number(m[1]) : 0;
}

/** { name, img, sm } of a speaker; for Merlin the image depends on the era (age). */
export function portrait(who, era = 0, entry = null, lineIndex = 0) {
  const c = CAST[who] || CAST.merlin;
  if (who === 'merlin' || !CAST[who]) {
    let e = era;
    // the very last line of the ending: his hands turn old again
    if (entry && entry.chapter === 'ende' && lineIndex >= entry.lines.length - 1) e = 0;
    const s = c.stages[Math.max(0, Math.min(c.stages.length - 1, e))];
    return { name: c.name, img: s.img, sm: s.sm };
  }
  return { name: c.name, img: c.img, sm: c.sm };
}
