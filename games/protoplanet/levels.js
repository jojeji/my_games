// Kapitel 1 "Staubwolke": 3 Lehrlevels von Hand, 5 Levels aus Familien mit festen Seeds (1-6..1-8 seit P2 mit Brocken). Kapitel 2 "Jaeger" (P2): KI-Koerper.
// `rev` = Fassung eines Levels (fehlt = 1): ein gesicherter Spielstand eines Levels mit anderer Fassung wird verworfen (state.js). `targets` (Sterne, Paket F: fuer Menschen) stammen aus tools/sim-protoplanet.mjs (Bot-Median der Varianten: Zeit x 2, Ausstoss x 1,8; Lehrlevels grosszuegig).
export const CHAPTERS = [
  { id: 1, name: 'Staubwolke' },
  { id: 2, name: 'Jäger' },
  { id: 3, name: 'Protostern' },
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

// Kapitel 3 "Protostern" (Paket B): Umlaufbahn-Modus. Gruppe der Familie `orbit`: n Koerper, Masse lo..hi, Bahnband rMin..rMax (innen schneller als aussen), dir -1 = gegenlaeufig
const og = (n, lo, hi, rMin, rMax, extra = {}) => ({ n, lo, hi, rMin, rMax, ...extra });
// Koerper auf einer Bahn (Lehrlevels): r, Winkel (Grad), Tempo-Verhaeltnis f, Richtung dir
const orb = (r, ang, m, extra = {}, spec = {}) => ({ orbit: { r, ang, ...spec }, m, ...extra });
// Massenleiter auf Bahnen: Staub, Kleine, Mittlere, wenige Grosse ueber das Band rMin..rMax (k = 10: 20 / 9 / 5 Koerper)
const olad = (k, rMin, rMax, top = [2, 2.2, 3], extra = {}) => [
  og(Math.round(2 * k), 0.12, 0.45, rMin, rMax, extra), og(Math.round(0.9 * k), 0.5, 0.9, rMin, rMax, extra), og(Math.round(0.5 * k), 1.1, 1.9, rMin, rMax, extra), og(top[0], top[1], top[2], rMin, rMax, extra),
];

export const LEVELS = [
  {
    id: '1-1', chapter: 1, n: 1, title: 'Bewegen', family: 'hand', seed: 0,
    layout: { arenaR: 11, bodies: [mote(4, 2.5, 0.4, 0, 0, { tag: 'target' })] },
    goal: { type: 'absorb' },
    hint: { text: 'Tippe neben dich: Dort stößt du Masse aus, du fliegst in die Gegenrichtung.', textAim: 'Tippe, wohin du fliegen willst.', until: 'eject' },
    targets: { eject: 0.3, time: 20 },
  },
  {
    id: '1-2', chapter: 1, n: 2, title: 'Gefahr', family: 'hand', seed: 0,
    layout: {
      arenaR: 13,
      bodies: [mote(4.5, -2.5, 0.35, 0.05, 0.1), mote(-3.5, 4.5, 0.3, 0.1, 0), mote(2.5, 6, 0.3, 0, -0.1), mote(-5.5, -3.5, 0.4, 0.1, 0.05), mote(6.5, 3.5, 0.3, -0.05, 0), mote(-1, -7, 0.3, 0.05, 0), mote(-8.5, 3.5, 1.4, 0.12, -0.04)],
    },
    goal: { type: 'last' },
    hint: { text: 'Warme Körper sind größer als du. Weich ihnen aus, wachse an den kleinen und schlucke sie am Ende.', until: 'absorb' },
    targets: { eject: 2.5, time: 290 },
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
    targets: { eject: 3.6, time: 200 },
  },
  // 1-4..1-8 (rev 3, Paket A): lebendige Welten. Massenleiter (`lad`: Gruppen mit wachsender Masse), Koerper kreisen in Stroemungen (`swirl`: Tangenten, Zusammenstoesse selten),
  // grosse Koerper weit auseinander (`sep`), auch Brocken bewegen sich langsam. Zahlen kalibriert mit tools/sim-protoplanet.mjs (docs/protoplanet.md, "Paket A").
  {
    id: '1-4', chapter: 1, n: 4, rev: 3, title: 'Treibgut', family: 'welt', seed: 36,
    params: { R: 36, goalType: 'mass', mass: 14, slack: 1.6, groups: lad(10, 0.2) },
    goal: { type: 'mass' },
    targets: { eject: 13.25, time: 340 },
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
    targets: { eject: 12.7, time: 295 },
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
    targets: { eject: 5.05, time: 235 },
  },
  {
    id: '1-7', chapter: 1, n: 7, rev: 3, title: 'Wirbel', family: 'welt', seed: 10,
    params: {
      R: 44, goalType: 'largest', slack: 1.4,
      groups: [g(34, 0.12, 0.45, SW, 0.25), g(15, 0.5, 0.9, SW, 0.25), g(8, 1.1, 1.9, SW, 0.22), g(3, 2.2, 3, SW, 0.18), g(2, 0.3, 0.6, 'rand', 0.9, { vj: 0.2 }), g(1, 6, 7, SW, 0.1, { tag: 'rock', rMin: 18 })],
    },
    goal: { type: 'largest' },
    targets: { eject: 4.9, time: 265 },
  },
  {
    id: '1-8', chapter: 1, n: 8, rev: 3, title: 'Kometenschwarm', family: 'welt', seed: 10,
    params: { R: 50, goalType: 'mass', mass: 28, slack: 1.5, groups: [...lad(20, 0.2, [4, 2.4, 3.2]), g(3, 0.3, 0.6, 'rand', 1, { vj: 0.2 })] },
    goal: { type: 'mass' },
    targets: { eject: 24.05, time: 495 },
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
    targets: { eject: 9.45, time: 265 },
  },
  {
    id: '2-3', chapter: 2, n: 3, rev: 3, title: 'Jagdzeit', family: 'welt', seed: 21,
    params: { R: 36, goalType: 'absorb', slack: 1.4, groups: lad(12, 0.2), hunters: [{ lo: 1.4, hi: 1.8, diff: 'normal', hMin: 12, target: true }] },
    goal: { type: 'absorb', label: 'Absorbiere den Jäger' },
    targets: { eject: 16.9, time: 315 },
  },
  {
    id: '2-4', chapter: 2, n: 4, rev: 3, title: 'Konkurrenz', family: 'welt', seed: 40,
    params: { R: 46, goalType: 'largest', slack: 1.4, groups: lad(15, 0.2), hunters: [{ lo: 8, hi: 9, diff: 'normal', hMin: 14 }] },
    goal: { type: 'largest' },
    targets: { eject: 6.85, time: 280 },
  },
  {
    id: '2-5', chapter: 2, n: 5, rev: 3, title: 'Rudel', family: 'welt', seed: 19,
    params: { R: 38, goalType: 'mass', mass: 14, slack: 1.6, groups: lad(13, 0.2), hunters: [{ lo: 1.2, hi: 1.6, diff: 'normal', hMin: 10 }, { lo: 1.2, hi: 1.6, diff: 'normal', hMin: 10 }] },
    goal: { type: 'mass' },
    targets: { eject: 10.05, time: 290 },
  },
  {
    id: '2-6', chapter: 2, n: 6, rev: 3, title: 'Aufräumen', family: 'welt', seed: 18,
    params: {
      R: 28, goalType: 'last',
      groups: [g(24, 0.12, 0.45, SW, 0.18), g(10, 0.5, 0.9, SW, 0.18), g(3, 1.1, 1.5, SW, 0.15)],
      hunters: [{ lo: 0.8, hi: 1.1, diff: 'normal', hMin: 8 }, { lo: 0.5, hi: 0.8, diff: 'easy', hMin: 8 }],
    },
    goal: { type: 'last' },
    targets: { eject: 33.35, time: 535 },
  },
  {
    id: '2-7', chapter: 2, n: 7, rev: 3, title: 'Revier', family: 'welt', seed: 24,
    params: { R: 54, goalType: 'largest', slack: 1.4, groups: lad(18, 0.2, [4, 2.4, 3.4]), hunters: [{ lo: 6, hi: 7, diff: 'normal', hMin: 15 }, { lo: 5.5, hi: 6.5, diff: 'hard', hMin: 15 }] },
    goal: { type: 'largest' },
    targets: { eject: 5.7, time: 255 },
  },
  {
    id: '2-8', chapter: 2, n: 8, rev: 3, title: 'Rudelführer', family: 'welt', seed: 32,
    params: { R: 42, goalType: 'mass', mass: 22, slack: 1.5, groups: lad(16, 0.2), hunters: [{ lo: 1.8, hi: 2.4, diff: 'hard', hMin: 12 }, { lo: 1.4, hi: 1.8, diff: 'normal', hMin: 12 }] },
    goal: { type: 'mass' },
    targets: { eject: 19.9, time: 375 },
  },

  // Kapitel 3 "Protostern" (Paket B): Umlaufbahn-Modus. Der Spieler kreist auf einer Kreisbahn (r 14) um den Protostern in der Mitte (Anziehung a = gm / (d^2 + soft^2), tune.js T.orbit),
  // Schub in Flugrichtung hebt die Bahn, Schub dagegen senkt sie, die Bahnvorschau zeigt die Ellipse. Offener Raum: Warnung ab warnR, Abdrift ab loseR. Zahlen kalibriert mit tools/sim-protoplanet.mjs.
  {
    id: '3-1', chapter: 3, n: 1, title: 'Umlaufbahn', family: 'hand', seed: 0,
    layout: {
      orbit: { rP: 14, rings: [8, 14, 20] },
      bodies: [orb(14, 55, 0.4), orb(11.5, 140, 0.35), orb(17, 230, 0.4), orb(14, 305, 0.3)],
      goal: { type: 'last' },
    },
    goal: { type: 'last' },
    hint: { text: 'Du kreist um den Protostern. Die gepunktete Linie zeigt deine Bahn.', until: 'eject' },
    targets: { eject: 0.6, time: 240 },
  },
  {
    id: '3-2', chapter: 3, n: 2, title: 'Höher', family: 'hand', seed: 0,
    layout: {
      orbit: { rP: 14, rings: [8, 14, 20, 26] },
      bodies: [orb(19, 70, 0.45), orb(22, 160, 0.4), orb(25, 250, 0.5), orb(19, 330, 0.4)],
      goal: { type: 'mass', value: 2.1 },
    },
    goal: { type: 'mass', value: 2.1 },
    hint: {
      text: 'Tippe hinter dich: Du wirst schneller und deine Bahn steigt. Tippe vor dich: Du bremst, die Bahn sinkt.',
      textAim: 'Tippe in Flugrichtung: Du wirst schneller und deine Bahn steigt. Tippe dagegen: Du bremst, die Bahn sinkt.',
      until: 'eject',
    },
    targets: { eject: 0.5, time: 360 },
  },
  {
    id: '3-3', chapter: 3, n: 3, title: 'Tiefer', family: 'hand', seed: 0,
    layout: {
      orbit: { rP: 14, rings: [8, 14, 20] },
      bodies: [orb(9.5, 40, 0.7, { tag: 'target' }), orb(11, 130, 0.35), orb(8.5, 220, 0.3), orb(12, 300, 0.4)],
      goal: { type: 'absorb', label: 'Absorbiere den Funken' },
    },
    goal: { type: 'absorb', label: 'Absorbiere den Funken' },
    hint: { text: 'Bremsen senkt die Bahn. Fällt sie in den Stern, wird die Vorschau rot.', textAim: 'Gegen die Flugrichtung tippen senkt die Bahn. Fällt sie in den Stern, wird die Vorschau rot.', until: 'eject' },
    targets: { eject: 0.6, time: 120 },
  },
  {
    id: '3-4', chapter: 3, n: 4, rev: 1, title: 'Staubgürtel', family: 'orbit', seed: 1,
    params: { rP: 14, loseR: 85, rings: [8, 14, 22, 30], goalType: 'mass', mass: 9, slack: 1.6, groups: olad(10, 7, 30) },
    goal: { type: 'mass' },
    targets: { eject: 1.25, time: 315 },
  },
  {
    id: '3-5', chapter: 3, n: 5, rev: 1, title: 'Kometen', family: 'orbit', seed: 5,
    params: {
      rP: 14, loseR: 90, rings: [8, 14, 22, 30], goalType: 'absorb', slack: 1.4,
      groups: [og(1, 2.2, 2.6, 18, 26, { tag: 'target', ecc: 0.06 }), ...olad(8, 7, 30, [2, 1.8, 2.6]), og(4, 0.3, 0.6, 26, 34, { f: 0.7, phi: 12 })],
    },
    goal: { type: 'absorb' },
    targets: { eject: 2.95, time: 290 },
  },
  {
    id: '3-6', chapter: 3, n: 6, rev: 1, title: 'Enges System', family: 'orbit', seed: 1,
    params: { rP: 14, loseR: 70, rings: [8, 14, 20], goalType: 'last', slack: 1.4, groups: olad(8, 8, 22, [1, 1.8, 2.2]) },
    goal: { type: 'last' },
    targets: { eject: 4.75, time: 545 },
  },
  {
    id: '3-7', chapter: 3, n: 7, rev: 1, title: 'Planet', family: 'orbit', seed: 30,
    params: {
      rP: 14, loseR: 80, rings: [8, 14, 22, 30], goalType: 'largest', slack: 1.4, selfGrav: 0.15,
      groups: [og(16, 0.12, 0.45, 8, 28), og(8, 0.5, 0.9, 8, 28), og(5, 1.1, 1.6, 8, 28), og(1, 2.6, 3, 19, 24, { tag: 'planet' })],
    },
    goal: { type: 'largest' },
    targets: { eject: 0.55, time: 220 },
  },
  {
    id: '3-8', chapter: 3, n: 8, rev: 1, title: 'Gegenläufer', family: 'orbit', seed: 6,
    params: {
      rP: 14, loseR: 100, rings: [8, 14, 22, 30, 38], goalType: 'mass', mass: 14, slack: 1.5,
      groups: [...olad(14, 7, 30, [3, 2.2, 3]), og(10, 0.12, 0.45, 33, 42, { dir: -1 }), og(4, 0.5, 0.9, 33, 42, { dir: -1 }), og(2, 1.1, 1.5, 33, 42, { dir: -1 })],
    },
    goal: { type: 'mass' },
    targets: { eject: 2.85, time: 350 },
  },
];

export const levelById = (id) => LEVELS.find((l) => l.id === id) || null;
export const levelsOf = (chapter) => LEVELS.filter((l) => l.chapter === chapter);
export const nextLevel = (id) => {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 && i + 1 < LEVELS.length ? LEVELS[i + 1] : null;
};
