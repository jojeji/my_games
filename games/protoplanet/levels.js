// Kapitel 1 "Staubwolke": 3 Lehrlevels von Hand, 5 Levels aus Familien mit festen Seeds (1-6..1-8 seit P2 mit Brocken). Kapitel 2 "Jaeger" (P2): KI-Koerper.
// `rev` = Fassung eines Levels (fehlt = 1): ein gesicherter Spielstand eines Levels mit anderer Fassung wird verworfen (state.js). `targets` (Sterne) stammen aus tools/sim-protoplanet.mjs (Bot-Median x 1,3).
export const CHAPTERS = [
  { id: 1, name: 'Staubwolke' },
  { id: 2, name: 'Jäger' },
];

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
  // 1-6..1-8 (rev 2, P2): Brocken (3-6 Startmassen, ruhend) statt grosser Hindernisse; Ziele gemischt (unangreifbar / Masse). Fuettern der Brocken vermeiden: sie liegen weit weg (rockKeep).
  {
    id: '1-6', chapter: 1, n: 6, rev: 2, title: 'Brocken', family: 'brocken', seed: 59,
    params: { R: 17, nSmall: 20, sLo: 0.1, sHi: 0.85, sSkew: 1.5, vSmall: 0.03, keepOut: 3, nRock: 1, rLo: 3.6, rHi: 4.2, rMin: 9, rockKeep: 8, vRock: 0.01, nMid: 4, mLo: 1.1, mHi: 1.9, vMid: 0.01 },
    goal: { type: 'largest' },
    hint: { text: 'Der Brocken ist riesig. Du musst ihn nicht fressen: Werde unangreifbar, bis kein Körper mehr größer ist als du.', until: 'absorb' },
    targets: { eject: 0.55, time: 105 },
  },
  {
    id: '1-7', chapter: 1, n: 7, rev: 2, title: 'Ernte', family: 'brocken', seed: 6,
    params: { R: 18, nSmall: 20, sLo: 0.1, sHi: 0.85, sSkew: 1.5, vSmall: 0.03, keepOut: 3, nRock: 2, rLo: 4.5, rHi: 6, rMin: 9, rockKeep: 8, vRock: 0.01, nMid: 2, mLo: 1.1, mHi: 1.6, vMid: 0.01, mFrac: 0.4 },
    goal: { type: 'mass' },
    targets: { eject: 0.7, time: 95 },
  },
  {
    id: '1-8', chapter: 1, n: 8, rev: 2, title: 'Überholen', family: 'brocken', seed: 47,
    params: { R: 20, nSmall: 24, sLo: 0.1, sHi: 0.85, sSkew: 1.5, vSmall: 0.03, keepOut: 3, nRock: 2, rLo: 3.3, rHi: 4, rMin: 9, rockKeep: 8, vRock: 0.01, nMid: 4, mLo: 1.1, mHi: 2.2, vMid: 0.01 },
    goal: { type: 'largest' },
    targets: { eject: 0.65, time: 90 },
  },

  // Kapitel 2 "Jaeger" (P2): KI-Koerper (kind 'hunter'). Jaeger jagen Kleineres und fliehen vor Groesserem, auch vor dem Spieler. Stufen easy | normal | hard (tune.js T.hunter).
  {
    id: '2-1', chapter: 2, n: 1, title: 'Der Jäger', family: 'hand', seed: 0,
    layout: {
      arenaR: 13,
      bodies: [
        mote(6, 4.5, 0.55, 0, 0, { kind: 'hunter', tag: 'target', hunter: { diff: 'easy', seed: 11 } }),
        mote(-4, 3.5, 0.3, 0.05, 0), mote(3, -5, 0.35, 0, 0.05), mote(-6, -3, 0.3, 0.05, 0.05), mote(0.5, 7.5, 0.3, 0, -0.05), mote(-1.5, -8, 0.35, 0.05, 0), mote(8, -3, 0.3, -0.05, 0),
      ],
    },
    goal: { type: 'absorb', label: 'Absorbiere den Jäger' },
    hint: { text: 'Jäger stoßen selbst aus. Sie jagen Kleinere und fliehen vor Größeren.', until: 'absorb' },
    targets: { eject: 1, time: 60 },
  },
  {
    id: '2-2', chapter: 2, n: 2, title: 'Verfolger', family: 'jaeger', seed: 24,
    params: { R: 16, nSmall: 18, sLo: 0.1, sHi: 0.85, sSkew: 1.5, vSmall: 0.03, keepOut: 2.5, nHunter: 1, hLo: 1.5, hHi: 1.8, hMin: 8, diff: 'easy', mFrac: 0.25 },
    goal: { type: 'mass' },
    targets: { eject: 0.45, time: 80 },
  },
  {
    id: '2-3', chapter: 2, n: 3, title: 'Jagdzeit', family: 'jaeger', seed: 36,
    params: { R: 20, nSmall: 26, sLo: 0.1, sHi: 0.85, sSkew: 1.5, vSmall: 0.03, keepOut: 2.5, nHunter: 1, hLo: 1.1, hHi: 1.4, hMin: 14, diff: 'easy', target: 1, slack: 1.3 },
    goal: { type: 'absorb', label: 'Absorbiere den Jäger' },
    targets: { eject: 1.15, time: 75 },
  },
  {
    id: '2-4', chapter: 2, n: 4, title: 'Konkurrenz', family: 'jaeger', seed: 7,
    params: { R: 19, nSmall: 26, sLo: 0.15, sHi: 0.85, sSkew: 1.5, vSmall: 0.03, keepOut: 2.5, nHunter: 1, hLo: 2.6, hHi: 3.2, hMin: 8, diff: 'easy' },
    goal: { type: 'largest' },
    targets: { eject: 0.4, time: 95 },
  },
  {
    id: '2-5', chapter: 2, n: 5, title: 'Rudel', family: 'jaeger', seed: 16,
    params: { R: 17, nSmall: 20, sLo: 0.15, sHi: 0.85, sSkew: 1.5, vSmall: 0.03, keepOut: 2.5, nHunter: 2, hLo: 1.2, hHi: 1.6, hMin: 8, hDiffs: ['easy', 'easy'], mFrac: 0.22 },
    goal: { type: 'mass' },
    targets: { eject: 0.6, time: 80 },
  },
  {
    id: '2-6', chapter: 2, n: 6, title: 'Aufräumen', family: 'jaeger', seed: 18,
    params: { R: 13, nSmall: 13, sLo: 0.2, sHi: 0.85, sSkew: 1.5, vSmall: 0.03, keepOut: 2.5, nHunter: 1, hLo: 0.4, hHi: 0.6, hMin: 8, diff: 'easy' },
    goal: { type: 'last' },
    targets: { eject: 4.5, time: 175 },
  },
  {
    id: '2-7', chapter: 2, n: 7, title: 'Revier', family: 'jaeger', seed: 6,
    params: { R: 23, nSmall: 34, sLo: 0.15, sHi: 0.85, sSkew: 1.5, vSmall: 0.03, keepOut: 2.5, nHunter: 2, hLo: 2.4, hHi: 3.0, hMin: 12, hDiffs: ['easy', 'easy'] },
    goal: { type: 'largest' },
    targets: { eject: 0.5, time: 80 },
  },
  {
    id: '2-8', chapter: 2, n: 8, title: 'Rudelführer', family: 'jaeger', seed: 51,
    params: { R: 22, nSmall: 28, sLo: 0.15, sHi: 0.85, sSkew: 1.5, vSmall: 0.03, keepOut: 2.5, nHunter: 2, hLo: 1.3, hHi: 1.7, hMin: 8, hDiffs: ['easy', 'easy'], nRock: 1, rLo: 5, rHi: 6, rMin: 12, rockKeep: 10, vRock: 0.01, nMid: 2, mLo: 1.1, mHi: 1.6, vMid: 0.01, mFrac: 0.28 },
    goal: { type: 'mass' },
    targets: { eject: 1.25, time: 110 },
  },
];

export const levelById = (id) => LEVELS.find((l) => l.id === id) || null;
export const levelsOf = (chapter) => LEVELS.filter((l) => l.chapter === chapter);
export const nextLevel = (id) => {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 && i + 1 < LEVELS.length ? LEVELS[i + 1] : null;
};
