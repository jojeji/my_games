// Kapitel 1 "Staubwolke": 3 Lehrlevels von Hand, 5 Levels aus Familien mit festen Seeds. `targets` (Sterne) stammen aus tools/sim-protoplanet.mjs (Bot-Median x 1,3).
export const CHAPTERS = [{ id: 1, name: 'Staubwolke' }];

const mote = (x, y, m, vx = 0, vy = 0, extra = {}) => ({ x, y, m, vx, vy, ...extra });

export const LEVELS = [
  {
    id: '1-1', chapter: 1, n: 1, title: 'Bewegen', family: 'hand', seed: 0,
    layout: { arenaR: 11, bodies: [mote(4, 2.5, 0.4, 0, 0, { tag: 'target' })] },
    goal: { type: 'absorb' },
    hint: { text: 'Tippe, wohin du fliegen willst.', until: 'eject' },
    targets: { eject: 0.25, time: 20 },
  },
  {
    id: '1-2', chapter: 1, n: 2, title: 'Gefahr', family: 'hand', seed: 0,
    layout: {
      arenaR: 14,
      bodies: [mote(5, -2.5, 0.35, 0.05, 0.1), mote(-4, 5, 0.3, 0.1, 0), mote(2.5, 6.5, 0.25, 0, -0.1), mote(-6, -4, 0.4, 0.1, 0.05), mote(7.5, 3.5, 0.2, -0.05, 0), mote(-9.5, 4, 2.2, 0.12, -0.04)],
    },
    goal: { type: 'mass', value: 1.7 },
    hint: { text: 'Warme Körper sind größer als du. Weich ihnen aus.', until: 'absorb' },
    targets: { eject: 0.2, time: 60 },
  },
  {
    id: '1-3', chapter: 1, n: 3, title: 'Strahl und Zeit', family: 'hand', seed: 0,
    layout: {
      arenaR: 17,
      bodies: [
        mote(8, 1.5, 0.25, 0, 0.05), mote(-7, 6, 0.3, 0.05, 0), mote(3, -9, 0.25, 0, 0.1), mote(-10, -5, 0.35, 0.05, 0.05), mote(11, -5, 0.25, -0.05, 0),
        mote(-3, 12, 0.25, 0, -0.05), mote(6, 10, 0.3, 0.05, 0), mote(-4, -11, 0.3, 0, 0.05), mote(13, 6, 0.2, 0.05, 0),
        mote(-13, 0, 1.5, 0, 0),
      ],
    },
    goal: { type: 'largest' },
    hint: { text: 'Halte gedrückt für einen Strahl. Unten rechts läuft die Zeit schneller.', until: 'beam' },
    targets: { eject: 0.2, time: 60 },
  },
  {
    id: '1-4', chapter: 1, n: 4, title: 'Wolke', family: 'wolke', seed: 9,
    params: { R: 44, nSmall: 38, sLo: 0.1, sHi: 1.0, sSkew: 2, vSmall: 0.05, keepOut: 6, nBig: 1, bLo: 3.8, bHi: 4.2, vBig: 0.02 },
    goal: { type: 'largest' },
    targets: { eject: 0.55, time: 125 },
  },
  {
    id: '1-5', chapter: 1, n: 5, title: 'Beute', family: 'ziel', seed: 2,
    params: { R: 40, nSmall: 34, sLo: 0.1, sHi: 1.0, sSkew: 2, vSmall: 0.05, keepOut: 6, tLo: 2.2, tHi: 2.6, tDistLo: 18, tDistHi: 28, vT: 0.02, slack: 2 },
    goal: { type: 'absorb' },
    targets: { eject: 1.15, time: 105 },
  },
  {
    id: '1-6', chapter: 1, n: 6, title: 'Strom', family: 'strom', seed: 36,
    params: { R: 40, rho0: 8, rho1: 34, nSmall: 34, sLo: 0.1, sHi: 1.0, sSkew: 2, vS: 0.5, nBig: 1, bLo: 1.6, bHi: 2.0, vBig: 0.3, mFrac: 0.4 },
    goal: { type: 'mass' },
    targets: { eject: 1.1, time: 135 },
  },
  {
    id: '1-7', chapter: 1, n: 7, title: 'Dichte Wolke', family: 'wolke', seed: 9,
    params: { R: 48, nSmall: 46, sLo: 0.1, sHi: 1.0, sSkew: 2, vSmall: 0.05, keepOut: 6, nBig: 2, bLo: 3.8, bHi: 4.4, vBig: 0.02 },
    goal: { type: 'largest' },
    targets: { eject: 0.55, time: 120 },
  },
  {
    id: '1-8', chapter: 1, n: 8, title: 'Enge', family: 'enge', seed: 7,
    params: { R: 38, nBig: 6, bLo: 3.0, bHi: 4.2, vBig: 0, bGap: 5, keepOut: 3, nSmall: 44, sLo: 0.2, sHi: 1.0, sSkew: 1.5, vSmall: 0.1 },
    goal: { type: 'largest' },
    targets: { eject: 0.7, time: 90 },
  },
];

export const levelById = (id) => LEVELS.find((l) => l.id === id) || null;
export const levelsOf = (chapter) => LEVELS.filter((l) => l.chapter === chapter);
export const nextLevel = (id) => {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 && i + 1 < LEVELS.length ? LEVELS[i + 1] : null;
};
