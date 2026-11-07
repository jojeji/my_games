// Kapitel 1 "Staubwolke": 3 Lehrlevels von Hand, 5 Levels aus Familien mit festen Seeds. `targets` (Sterne) stammen aus tools/sim-protoplanet.mjs (Bot-Median x 1,3).
export const CHAPTERS = [{ id: 1, name: 'Staubwolke' }];

const mote = (x, y, m, vx = 0, vy = 0, extra = {}) => ({ x, y, m, vx, vy, ...extra });

export const LEVELS = [
  {
    id: '1-1', chapter: 1, n: 1, title: 'Bewegen', family: 'hand', seed: 0,
    layout: { arenaR: 11, bodies: [mote(4, 2.5, 0.4, 0, 0, { tag: 'target' })] },
    goal: { type: 'absorb' },
    hint: { text: 'Tippe neben dich: Dort stößt du Masse aus, du fliegst in die Gegenrichtung.', textAim: 'Tippe, wohin du fliegen willst.', until: 'eject' },
    targets: { eject: 0.25, time: 20 },
  },
  {
    id: '1-2', chapter: 1, n: 2, title: 'Gefahr', family: 'hand', seed: 0,
    layout: {
      arenaR: 13,
      bodies: [mote(4.5, -2.5, 0.35, 0.05, 0.1), mote(-3.5, 4.5, 0.3, 0.1, 0), mote(2.5, 6, 0.3, 0, -0.1), mote(-5.5, -3.5, 0.4, 0.1, 0.05), mote(6.5, 3.5, 0.3, -0.05, 0), mote(-1, -7, 0.3, 0.05, 0), mote(-8.5, 3.5, 1.4, 0.12, -0.04)],
    },
    goal: { type: 'last' },
    hint: { text: 'Warme Körper sind größer als du. Weich ihnen aus, wachse an den kleinen und schlucke sie am Ende.', until: 'absorb' },
    targets: { eject: 2.5, time: 150 },
  },
  {
    id: '1-3', chapter: 1, n: 3, title: 'Strahl und Zeit', family: 'hand', seed: 0,
    layout: {
      arenaR: 13,
      bodies: [
        mote(5.5, 1.5, 0.35, 0, 0.05), mote(-4.5, 4.5, 0.4, 0.05, 0), mote(2.5, -6.5, 0.35, 0, 0.05), mote(-7, -3, 0.45, 0.05, 0.05), mote(7, -4, 0.3, -0.05, 0),
        mote(-1.5, 8, 0.4, 0, -0.05), mote(4, 7, 0.3, 0.05, 0),
        mote(-9, 0.5, 1.2, 0, 0),
      ],
    },
    goal: { type: 'last' },
    hint: { text: 'Halte gedrückt für einen Strahl. Unten rechts läuft die Zeit schneller.', until: 'beam' },
    targets: { eject: 2.5, time: 180 },
  },
  {
    id: '1-4', chapter: 1, n: 4, title: 'Wolke', family: 'wolke', seed: 9,
    params: { R: 13, nSmall: 13, sLo: 0.1, sHi: 0.85, sSkew: 1.5, vSmall: 0.05, keepOut: 2.5, nBig: 1, bLo: 1.1, bHi: 1.2, vBig: 0 },
    goal: { type: 'last' },
    targets: { eject: 4.0, time: 160 },
  },
  {
    id: '1-5', chapter: 1, n: 5, title: 'Beute', family: 'ziel', seed: 24,
    params: { R: 20, nSmall: 19, sLo: 0.1, sHi: 0.85, sSkew: 1.5, vSmall: 0.03, keepOut: 3, tLo: 1.5, tHi: 1.7, tDistLo: 15, tDistHi: 17, vT: 0, slack: 2 },
    goal: { type: 'absorb' },
    targets: { eject: 1.05, time: 95 },
  },
  {
    id: '1-6', chapter: 1, n: 6, title: 'Strom', family: 'strom', seed: 4,
    params: { R: 14, rho0: 4, rho1: 12, nSmall: 12, sLo: 0.1, sHi: 0.85, sSkew: 1.5, vS: 0.1, vN: 0.02, nBig: 0 },
    goal: { type: 'last' },
    targets: { eject: 4.0, time: 180 },
  },
  {
    id: '1-7', chapter: 1, n: 7, title: 'Dichte Wolke', family: 'wolke', seed: 17,
    params: { R: 14, nSmall: 14, sLo: 0.1, sHi: 0.85, sSkew: 1.5, vSmall: 0.05, keepOut: 2.5, nBig: 2, bLo: 1.1, bHi: 1.3, vBig: 0 },
    goal: { type: 'last' },
    targets: { eject: 4.5, time: 190 },
  },
  {
    id: '1-8', chapter: 1, n: 8, title: 'Enge', family: 'enge', seed: 5,
    params: { R: 15, nBig: 3, bLo: 1.1, bHi: 1.3, vBig: 0, bGap: 3, keepOut: 2, nSmall: 16, sLo: 0.15, sHi: 0.85, sSkew: 1.5, vSmall: 0.05 },
    goal: { type: 'last' },
    targets: { eject: 6.75, time: 210 },
  },
];

export const levelById = (id) => LEVELS.find((l) => l.id === id) || null;
export const levelsOf = (chapter) => LEVELS.filter((l) => l.chapter === chapter);
export const nextLevel = (id) => {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 && i + 1 < LEVELS.length ? LEVELS[i + 1] : null;
};
