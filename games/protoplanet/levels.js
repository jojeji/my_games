// Kapitel 1 "Staubwolke": 3 Lehrlevels von Hand, 5 Levels aus Familien mit festen Seeds (1-6..1-8 seit P2 mit Brocken). Kapitel 2 "Jaeger" (P2): KI-Koerper.
// `rev` = Fassung eines Levels (fehlt = 1): ein gesicherter Spielstand eines Levels mit anderer Fassung wird verworfen (state.js). `targets` (Sterne) stammen aus tools/sim-protoplanet.mjs (Bot-Median x 1,3).
export const CHAPTERS = [
  { id: 1, name: 'Staubwolke' },
  { id: 2, name: 'Jäger' },
];

const mote = (x, y, m, vx = 0, vy = 0, extra = {}) => ({ x, y, m, vx, vy, ...extra });
// Gruppe der Familie `welt`: n Koerper, Masse lo..hi, Stroemung (rand | drift | swirl | bands | swarm) mit Geschwindigkeit v
const g = (n, lo, hi, flow, v, extra = {}) => ({ n, lo, hi, flow, v, ...extra });
const SW = 'swirl';
// Massenleiter: Staub 0,12-0,45, Kleine 0,5-0,9, Mittlere 1,1-1,9, wenige Grosse (top = [Zahl, von, bis]); k skaliert die Zahlen (k = 10: 36 / 16 / 9 Koerper)
const lad = (k, v, top = [3, 2.2, 3]) => [g(Math.round(3.6 * k), 0.12, 0.45, SW, v), g(Math.round(1.6 * k), 0.5, 0.9, SW, v), g(Math.round(0.9 * k), 1.1, 1.9, SW, v * 0.9), g(top[0], top[1], top[2], SW, v * 0.75)];
// zwei gegenlaeufige Ringe (innen links, aussen rechts herum) mit Massenleiter bis 1,9
const rings = (rSplit, k, v) => {
  const n = (x) => Math.round((x * k) / 10);
  return [
    g(n(24), 0.12, 0.45, SW, v, { rMax: rSplit }), g(n(24), 0.12, 0.45, SW, v, { rMin: rSplit, dir: -1 }),
    g(n(10), 0.5, 0.9, SW, v, { rMax: rSplit }), g(n(10), 0.5, 0.9, SW, v, { rMin: rSplit, dir: -1 }),
    g(n(5), 1.1, 1.9, SW, v * 0.9, { rMax: rSplit }), g(n(5), 1.1, 1.9, SW, v * 0.9, { rMin: rSplit, dir: -1 }),
  ];
};

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
  // 1-4..1-8 (rev 3, Paket A): lebendige Welten. Massenleiter (`lad`: Gruppen mit wachsender Masse), Koerper kreisen in Stroemungen (`swirl`: Tangenten, Zusammenstoesse selten),
  // grosse Koerper weit auseinander (`sep`), auch Brocken bewegen sich langsam. Zahlen kalibriert mit tools/sim-protoplanet.mjs (docs/protoplanet.md, "Paket A").
  {
    id: '1-4', chapter: 1, n: 4, rev: 3, title: 'Treibgut', family: 'welt', seed: 36,
    params: { R: 36, goalType: 'mass', mass: 14, slack: 1.6, groups: lad(10, 0.2) },
    goal: { type: 'mass' },
    targets: { eject: 9.55, time: 220 },
  },
  {
    id: '1-5', chapter: 1, n: 5, rev: 3, title: 'Wanderer', family: 'welt', seed: 17,
    params: {
      R: 34, goalType: 'absorb', slack: 1.4,
      groups: [
        g(1, 3.2, 3.6, 'rand', 0.3, { tag: 'target', rMin: 13, rMax: 24 }),
        g(30, 0.12, 0.45, SW, 0.3), g(14, 0.5, 0.9, SW, 0.3), g(8, 1.1, 1.9, SW, 0.25), g(3, 2.2, 2.8, SW, 0.2),
      ],
    },
    goal: { type: 'absorb' },
    targets: { eject: 9.2, time: 190 },
  },
  {
    id: '1-6', chapter: 1, n: 6, rev: 3, title: 'Gegenströme', family: 'welt', seed: 36,
    params: {
      R: 56, goalType: 'largest', slack: 1.4,
      groups: [
        ...rings(28, 13, 0.25),
        g(3, 2.4, 3.4, SW, 0.2, { rMin: 28, dir: -1 }),
        g(1, 6, 7, SW, 0.08, { tag: 'rock', rMin: 28, dir: -1 }),
      ],
    },
    goal: { type: 'largest' },
    targets: { eject: 3.65, time: 155 },
  },
  {
    id: '1-7', chapter: 1, n: 7, rev: 3, title: 'Wirbel', family: 'welt', seed: 10,
    params: {
      R: 44, goalType: 'largest', slack: 1.4,
      groups: [g(34, 0.12, 0.45, SW, 0.25), g(15, 0.5, 0.9, SW, 0.25), g(8, 1.1, 1.9, SW, 0.22), g(3, 2.2, 3, SW, 0.18), g(2, 0.3, 0.6, 'rand', 0.9, { vj: 0.2 }), g(1, 6, 7, SW, 0.1, { tag: 'rock', rMin: 18 })],
    },
    goal: { type: 'largest' },
    targets: { eject: 3.55, time: 175 },
  },
  {
    id: '1-8', chapter: 1, n: 8, rev: 3, title: 'Kometenschwarm', family: 'welt', seed: 10,
    params: { R: 50, goalType: 'mass', mass: 28, slack: 1.5, groups: [...lad(20, 0.2, [4, 2.4, 3.2]), g(3, 0.3, 0.6, 'rand', 1, { vj: 0.2 })] },
    goal: { type: 'mass' },
    targets: { eject: 17.4, time: 320 },
  },

  // Kapitel 2 "Jaeger" (P2, Paket A: lebendig): KI-Koerper (kind 'hunter'). Jaeger jagen Kleineres und fliehen vor Groesserem, auch vor dem Spieler. Stufen easy | normal | hard (tune.js T.hunter).
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
    id: '2-2', chapter: 2, n: 2, rev: 3, title: 'Verfolger', family: 'welt', seed: 34,
    params: { R: 32, goalType: 'mass', mass: 12, slack: 1.6, groups: lad(10, 0.2, [2, 2.2, 3]), hunters: [{ lo: 1.5, hi: 1.8, diff: 'easy', hMin: 10 }] },
    goal: { type: 'mass' },
    targets: { eject: 6.85, time: 170 },
  },
  {
    id: '2-3', chapter: 2, n: 3, rev: 3, title: 'Jagdzeit', family: 'welt', seed: 21,
    params: { R: 36, goalType: 'absorb', slack: 1.4, groups: lad(12, 0.2), hunters: [{ lo: 1.4, hi: 1.8, diff: 'normal', hMin: 12, target: true }] },
    goal: { type: 'absorb', label: 'Absorbiere den Jäger' },
    targets: { eject: 12.2, time: 215 },
  },
  {
    id: '2-4', chapter: 2, n: 4, rev: 3, title: 'Konkurrenz', family: 'welt', seed: 40,
    params: { R: 46, goalType: 'largest', slack: 1.4, groups: lad(15, 0.2), hunters: [{ lo: 8, hi: 9, diff: 'normal', hMin: 14 }] },
    goal: { type: 'largest' },
    targets: { eject: 4.95, time: 185 },
  },
  {
    id: '2-5', chapter: 2, n: 5, rev: 3, title: 'Rudel', family: 'welt', seed: 19,
    params: { R: 38, goalType: 'mass', mass: 14, slack: 1.6, groups: lad(13, 0.2), hunters: [{ lo: 1.2, hi: 1.6, diff: 'normal', hMin: 10 }, { lo: 1.2, hi: 1.6, diff: 'normal', hMin: 10 }] },
    goal: { type: 'mass' },
    targets: { eject: 7.25, time: 190 },
  },
  {
    id: '2-6', chapter: 2, n: 6, rev: 3, title: 'Aufräumen', family: 'welt', seed: 18,
    params: {
      R: 28, goalType: 'last',
      groups: [g(24, 0.12, 0.45, SW, 0.18), g(10, 0.5, 0.9, SW, 0.18), g(3, 1.1, 1.5, SW, 0.15)],
      hunters: [{ lo: 0.8, hi: 1.1, diff: 'normal', hMin: 8 }, { lo: 0.5, hi: 0.8, diff: 'easy', hMin: 8 }],
    },
    goal: { type: 'last' },
    targets: { eject: 24.1, time: 350 },
  },
  {
    id: '2-7', chapter: 2, n: 7, rev: 3, title: 'Revier', family: 'welt', seed: 24,
    params: { R: 54, goalType: 'largest', slack: 1.4, groups: lad(18, 0.2, [4, 2.4, 3.4]), hunters: [{ lo: 6, hi: 7, diff: 'normal', hMin: 15 }, { lo: 5.5, hi: 6.5, diff: 'hard', hMin: 15 }] },
    goal: { type: 'largest' },
    targets: { eject: 4.1, time: 165 },
  },
  {
    id: '2-8', chapter: 2, n: 8, rev: 3, title: 'Rudelführer', family: 'welt', seed: 32,
    params: { R: 42, goalType: 'mass', mass: 22, slack: 1.5, groups: lad(16, 0.2), hunters: [{ lo: 1.8, hi: 2.4, diff: 'hard', hMin: 12 }, { lo: 1.4, hi: 1.8, diff: 'normal', hMin: 12 }] },
    goal: { type: 'mass' },
    targets: { eject: 14.65, time: 245 },
  },
];

export const levelById = (id) => LEVELS.find((l) => l.id === id) || null;
export const levelsOf = (chapter) => LEVELS.filter((l) => l.chapter === chapter);
export const nextLevel = (id) => {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 && i + 1 < LEVELS.length ? LEVELS[i + 1] : null;
};
