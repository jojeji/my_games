// Cast of Merlin. Display names and portrait images live ONLY here - story texts reference names through this config.
// img: relative to the game page (games/merlin/). sm = 160 px variant for lists. If an image fails to load the UI shows an initial.
const stage = (n) => ({ img: `img/merlin-${n}.webp`, sm: `img/merlin-${n}-sm.webp` });

export const CAST = {
  merlin: {
    id: 'merlin', name: 'Merlin', role: 'Zeitreisender', color: '#f5c542', side: 'left', // gold / amber
    // age stage per era (0 = Ende der Zeit ... 7 = Anbeginn): he gets younger monotonically
    stages: [stage(75), stage(75), stage(55), stage(55), stage(40), stage(40), stage(25), stage(25)],
  },
  chronist: { id: 'chronist', name: 'Joey', role: 'der Chronist', color: '#6d9bff', side: 'right', // cool ink blue
    img: 'img/chronist.webp', sm: 'img/chronist-sm.webp' },
  waechter: { id: 'waechter', name: 'Rick', role: 'der Zeitwächter', color: '#d4683a', side: 'right', // warm bronze / brass
    img: 'img/waechter.webp', sm: 'img/waechter-sm.webp' },
};
/** Widmung (Mehr-Tab). Hier bearbeiten. */
export const DEDICATION = 'Für Merlin – zum 31. Geburtstag.';
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
    // a line can show him old again (the very last page of the ending: his hands turn old)
    if (entry && entry.lines && entry.lines[lineIndex] && entry.lines[lineIndex].old) e = 0;
    const s = c.stages[Math.max(0, Math.min(c.stages.length - 1, e))];
    return { name: c.name, img: s.img, sm: s.sm };
  }
  return { name: c.name, img: c.img, sm: c.sm };
}

/** Line text; may be a function of the game (e.g. the finale lists the ideas the player actually planted). */
export const lineText = (g, line) => (typeof line.t === 'function' ? line.t(g) : line.t);
