// Levelfamilien: family(params, rng) -> { bodies, arenaR, goal? }. Nur Seed-Zufall (engine/kit/rng.js), kein anderer Zufall.
// Grundregeln (checkRules), die jede Familie sicherstellt: Spieler (m = 1) in der Mitte, kleinere Koerper in Reichweite, nichts ueberlappt,
// kein groesserer Koerper kommt bei geradliniger Vorhersage in den ersten 5 s naeher als 3 Spielerradien, die Masse der kleineren Koerper reicht fuers Ziel.
import { rngRoll, toSeed } from '../../engine/kit/rng.js';
import { makeAi } from './hunter.js';

export const RULES = { reach: 11, clearance: 3, lookahead: 5, gap: 0.05, maxAttempts: 40 };

const uni = (rng, a, b) => a + (b - a) * rngRoll(rng);
const pickMass = (rng, lo, hi, skew) => lo + (hi - lo) * Math.pow(rngRoll(rng), skew);

function velocity(rng, vmax, vmin = 0) {
  const a = uni(rng, 0, Math.PI * 2);
  const s = uni(rng, vmin, vmax);
  return [Math.cos(a) * s, Math.sin(a) * s];
}

/** Freien Platz im Ring [rMin, rMax] (flaechengleichverteilt) suchen. */
function place(rng, bodies, m, rMin, rMax, gap = 0.5, keepOut = 0, rockKeep = 0) {
  const r = Math.sqrt(m);
  for (let i = 0; i < 300; i++) {
    const a = uni(rng, 0, Math.PI * 2);
    const d = Math.sqrt(uni(rng, rMin * rMin, rMax * rMax));
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    let ok = Math.hypot(x, y) >= 1 + r + gap;
    for (let j = 0; ok && j < bodies.length; j++) {
      const o = bodies[j];
      if (Math.hypot(x - o.x, y - o.y) < r + Math.sqrt(o.m) + gap + (o.tag === 'rock' ? Math.max(keepOut, rockKeep) : o.m >= 1 ? keepOut : 0)) ok = false; // um grosse Koerper bleibt ein Streifen frei, um Brocken ein breiterer (`rockKeep`)
    }
    if (ok) return [x, y];
  }
  return null;
}

/** Beste Annaeherung (Mitte-zu-Mitte) von Koerper b an den ruhenden Spieler im Fenster [0, T]. */
function closest(b, T) {
  const v2 = b.vx * b.vx + b.vy * b.vy;
  const t = v2 > 1e-12 ? Math.min(T, Math.max(0, -(b.x * b.vx + b.y * b.vy) / v2)) : 0;
  return Math.hypot(b.x + b.vx * t, b.y + b.vy * t);
}

/** Verstoesse gegen die Grundregeln (leere Liste = in Ordnung). */
export function checkRules({ bodies, arenaR, goal }) {
  const bad = [];
  for (const b of bodies) {
    const r = Math.sqrt(b.m);
    if (Math.hypot(b.x, b.y) + r > arenaR + 1e-9) bad.push('ausserhalb der Arena');
    if (Math.hypot(b.x, b.y) < 1 + r + RULES.gap) bad.push('ueberlappt den Spieler');
  }
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < Math.sqrt(a.m) + Math.sqrt(b.m) + RULES.gap) bad.push('ueberlappen sich');
    }
  }
  const smalls = bodies.filter((b) => b.m < 0.9);
  if (!smalls.some((b) => Math.hypot(b.x, b.y) <= RULES.reach)) bad.push('kein kleinerer Koerper in Reichweite');
  for (const b of bodies) {
    if (b.m >= 0.9 && closest(b, RULES.lookahead) - Math.sqrt(b.m) - 1 < RULES.clearance) bad.push('groesserer Koerper zu nah');
  }
  // Masse reicht: alles ausser dem Hindernis (groesster Koerper bzw. Zielkoerper) steht dem Spieler als Vorrat zur Verfuegung
  const total = bodies.reduce((s, b) => s + b.m, 0);
  const maxM = bodies.reduce((m, b) => Math.max(m, b.m), 0);
  const slack = goal.slack || 1.4;
  if (goal.type === 'largest' || goal.type === 'last') {
    if (goal.type === 'largest' && maxM < 1) bad.push('largest ohne groesseren Koerper');
    if (1 + total - maxM < slack * maxM) bad.push('Masse reicht nicht (' + goal.type + ')');
  } else if (goal.type === 'absorb') {
    const t = bodies.find((b) => b.tag === 'target');
    if (!t) bad.push('kein Zielkoerper');
    else if (1 + total - t.m < slack * t.m) bad.push('Masse reicht nicht (absorb)');
  } else if (goal.type === 'mass') {
    if (1 + total < slack * goal.value) bad.push('Masse reicht nicht (mass)');
  }
  return bad;
}

/* ---------- Familien ---------- */

function addSmalls(rng, bodies, p, rMin, rMax) {
  for (let i = 0; i < p.nSmall; i++) {
    const m = pickMass(rng, p.sLo, p.sHi, p.sSkew || 1.5);
    const pos = place(rng, bodies, m, rMin, rMax, 0.5, p.keepOut || 0, p.rockKeep || 0);
    if (!pos) continue;
    const [vx, vy] = velocity(rng, p.vSmall || 0);
    bodies.push({ x: pos[0], y: pos[1], vx, vy, m, kind: 'mote' });
  }
}

function addBigs(rng, bodies, p, rMin, rMax) {
  for (let i = 0; i < (p.nBig || 0); i++) {
    const m = uni(rng, p.bLo, p.bHi);
    const pos = place(rng, bodies, m, rMin, rMax, p.bGap || 0.5);
    if (!pos) continue;
    const [vx, vy] = velocity(rng, p.vBig || 0);
    bodies.push({ x: pos[0], y: pos[1], vx, vy, m, kind: 'mote' });
  }
}

/** Zufaellige Wolke: viele kleine, wenige grosse. Ziel: groesster Koerper. */
function wolke(p, rng) {
  const bodies = [];
  addBigs(rng, bodies, p, 9, p.R - 3);
  addSmalls(rng, bodies, p, 2.6, p.R - 1.5);
  return { bodies, arenaR: p.R, goal: { type: 'largest', slack: p.slack || 1.6 } };
}

/** Ein markierter, etwas groesserer Koerper. Ziel: absorbiere ihn. */
function ziel(p, rng) {
  const bodies = [];
  const m = uni(rng, p.tLo, p.tHi);
  const a = uni(rng, 0, Math.PI * 2);
  const d = uni(rng, p.tDistLo, p.tDistHi);
  const [vx, vy] = velocity(rng, p.vT || 0);
  bodies.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, vx, vy, m, kind: 'mote', tag: 'target' });
  addBigs(rng, bodies, p, 9, p.R - 3);
  addSmalls(rng, bodies, p, 2.6, p.R - 1.5);
  return { bodies, arenaR: p.R, goal: { type: 'absorb', slack: p.slack || 1.5 } };
}

/** Koerper in einem kreisenden Band (alle in dieselbe Richtung). Ziel: Masse M (aus der Summe der kleinen). */
function strom(p, rng) {
  const bodies = [];
  const band = (m, speed) => {
    const pos = place(rng, bodies, m, p.rho0, p.rho1);
    if (!pos) return;
    const d = Math.hypot(pos[0], pos[1]);
    const s = speed * uni(rng, 0.7, 1.3);
    const tx = -pos[1] / d;
    const ty = pos[0] / d;
    const vn = p.vN == null ? 0.1 : p.vN; // Streuung der Geschwindigkeit um die Tangente
    bodies.push({ x: pos[0], y: pos[1], vx: tx * s + uni(rng, -vn, vn), vy: ty * s + uni(rng, -vn, vn), m, kind: 'mote' });
  };
  for (let i = 0; i < (p.nBig || 0); i++) band(uni(rng, p.bLo, p.bHi), p.vBig || p.vS);
  for (let i = 0; i < p.nSmall; i++) band(pickMass(rng, p.sLo, p.sHi, p.sSkew || 1.5), p.vS);
  const sum = bodies.filter((b) => b.m < p.bLo).reduce((s, b) => s + b.m, 0);
  const value = Math.round((1 + p.mFrac * sum) * 100) / 100;
  return { bodies, arenaR: p.R, goal: { type: 'mass', value, slack: p.slack || 1.4 } };
}

/** Enge Arena: viele etwas groessere Koerper, wenige kleine. Ziel: groesster Koerper. */
function enge(p, rng) {
  const bodies = [];
  addBigs(rng, bodies, p, 7, p.R - 2);
  addSmalls(rng, bodies, p, 2.6, p.R - 1.2);
  return { bodies, arenaR: p.R, goal: { type: 'largest', slack: p.slack || 1.35 } };
}

/** Brocken (und Mittelgrosse als Nahrungskette): ruhend oder sehr langsam. Spec: 3-6 Startmassen. */
function addRocks(rng, bodies, p) {
  for (let i = 0; i < (p.nRock || 0); i++) {
    const m = uni(rng, p.rLo, p.rHi);
    const pos = place(rng, bodies, m, p.rMin || 6, p.R - 2.5, p.rGap || 1.5, p.keepOut || 0);
    if (!pos) continue;
    const [vx, vy] = velocity(rng, p.vRock || 0);
    bodies.push({ x: pos[0], y: pos[1], vx, vy, m, kind: 'mote', tag: 'rock' });
  }
  for (let i = 0; i < (p.nMid || 0); i++) {
    const m = uni(rng, p.mLo, p.mHi);
    const pos = place(rng, bodies, m, 4, p.R - 1.5, 0.8, p.keepOut || 0, p.rockKeep || 0);
    if (!pos) continue;
    const [vx, vy] = velocity(rng, p.vMid || 0);
    bodies.push({ x: pos[0], y: pos[1], vx, vy, m, kind: 'mote' });
  }
}

/** Jaeger: weit weg vom Spieler, je Jaeger Stufe (`hDiffs[i]` oder `diff`) und Seed aus dem Seed-Zufall. Der erste ist Zielkoerper, wenn p.target gesetzt ist. */
function addHunters(rng, bodies, p) {
  for (let i = 0; i < (p.nHunter || 0); i++) {
    const m = uni(rng, p.hLo, p.hHi);
    const pos = place(rng, bodies, m, p.hMin || 8, p.R - 2, 0.8, p.keepOut || 0, p.rockKeep || 0);
    if (!pos) continue;
    const seed = Math.floor(rngRoll(rng) * 4294967296);
    const diff = (p.hDiffs && p.hDiffs[i]) || p.diff || 'normal';
    bodies.push({ x: pos[0], y: pos[1], vx: 0, vy: 0, m, kind: 'hunter', hunter: { seed, diff }, tag: p.target && i === 0 ? 'target' : '' });
  }
}

/** Ziel `mass`: Wert aus der Summe der kleinen Koerper (wie bei `strom`). */
function massValue(p, bodies) {
  const sum = bodies.filter((b) => b.m < 0.9 && b.kind === 'mote').reduce((s, b) => s + b.m, 0);
  return Math.round((1 + (p.mFrac || 0.3) * sum) * 100) / 100;
}

/** Brocken: wenige sehr grosse Koerper (3-6 Startmassen, ruhend), dazu Nahrungskette aus Mittelgrossen und viele kleine. Ziel: unangreifbar (`largest`) oder Masse M. */
function brocken(p, rng) {
  const bodies = [];
  addRocks(rng, bodies, p);
  addSmalls(rng, bodies, p, 2.6, p.R - 1.5);
  return { bodies, arenaR: p.R, goal: { type: 'largest', value: massValue(p, bodies), slack: p.slack || 1.3 } };
}

/** Jaeger (KI-Koerper) in einer Wolke, optional mit Brocken. Ziele: letzter Koerper, unangreifbar, Masse M, absorbiere den Jaeger (`target`). */
function jaeger(p, rng) {
  const bodies = [];
  addRocks(rng, bodies, p);
  addHunters(rng, bodies, p);
  addSmalls(rng, bodies, p, 2.6, p.R - 1.5);
  return { bodies, arenaR: p.R, goal: { type: p.target ? 'absorb' : 'last', value: massValue(p, bodies), slack: p.slack || 1.3 } };
}

export const FAMILIES = { wolke, ziel, strom, enge, brocken, jaeger };

/** Level aus Familie + Parametern + Seed erzeugen. Wiederholt mit abgeleiteten Seeds, bis alle Grundregeln erfuellt sind. */
export function generate(family, params, seed, goal = null) {
  const fn = FAMILIES[family];
  if (!fn) throw new Error('Unbekannte Levelfamilie: ' + family);
  for (let attempt = 0; attempt < RULES.maxAttempts; attempt++) {
    const rng = { seed: toSeed(seed * 7919 + attempt * 104729 + 12345) };
    const res = fn(params, rng);
    if (goal) res.goal = { ...res.goal, ...goal }; // der Zieltyp kommt vom Level, Parameter (value, slack) von der Familie
    if (!checkRules(res).length) return { ...res, attempts: attempt + 1 };
  }
  throw new Error(`Familie ${family}, Seed ${seed}: keine gueltige Anordnung gefunden`);
}

/** Jaeger-Beschreibung ({ seed, diff }) eines Koerpers in sein Gehirn (`ai`) umsetzen. */
const withAi = (bodies) =>
  bodies.map((b) => {
    if (!b.hunter) return b;
    const { hunter, ...rest } = b;
    return { ...rest, ai: makeAi(hunter) };
  });

/** Welt-Beschreibung eines Levels (feste Seeds; Lehrlevels haben ihr Layout als Daten). */
export function buildLevel(level) {
  if (level.family === 'hand') {
    const l = level.layout;
    return { arenaR: l.arenaR, bodies: withAi(l.bodies.map((b) => ({ kind: 'mote', ...b }))), goal: l.goal || null };
  }
  const g = generate(level.family, level.params, level.seed, level.goal);
  return { ...g, bodies: withAi(g.bodies) };
}
