// Protoplanet: DOM-freie, deterministische Physik. Kreise mit r = sqrt(m), fester Schritt, Ausstoss mit Impulserhaltung,
// Absorbieren (Masse fliesst vom kleineren zum groesseren, bis sie sich beruehren), elastische Kreis-Arena.
// Kapitel 1 kennt keine Gravitation; `kind` kennt 'attractor' schon (P2), die Physik behandelt ihn hier wie jeden Koerper.
import { T } from './tune.js';

export const radius = (m) => Math.sqrt(m);

/** Welt aus einer Koerperliste (ohne Spieler) bauen. Der Spieler bekommt id 1 (bei Gleichstand gilt die kleinere id als groesser). */
export function createWorld({ bodies, arenaR, player }) {
  const w = {
    t: 0,
    steps: 0,
    nextId: 1,
    arenaR,
    bodies: [],
    player: null,
    stats: { ejected: 0, ejects: 0, absorbed: 0, gained: 0 },
  };
  const p = addBody(w, { x: 0, y: 0, vx: 0, vy: 0, m: 1, kind: 'player', ...(player || {}) });
  w.player = p;
  for (const b of bodies) addBody(w, b);
  return w;
}

export function addBody(w, b) {
  const body = {
    id: b.id != null ? b.id : w.nextId++,
    x: b.x,
    y: b.y,
    vx: b.vx || 0,
    vy: b.vy || 0,
    m: b.m,
    kind: b.kind || 'mote',
    tag: b.tag || '',
    gu: b.gu || 0, // Schonfrist bis (Spielzeit) ...
    gf: b.gf || 0, //  ... fuer den Koerper mit dieser id
  };
  if (body.id >= w.nextId) w.nextId = body.id + 1;
  w.bodies.push(body);
  return body;
}

/** Ein Teilchen ausstossen. (dx,dy) = Richtung des Teilchens; der Spieler fliegt in die Gegenrichtung. Gibt das Teilchen zurueck oder null. */
export function eject(w, dx, dy, frac = T.ejectFrac, speed = T.ejectSpeed) {
  const p = w.player;
  if (!p) return null;
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-12)) return null;
  dx /= len;
  dy /= len;
  const dm = frac * p.m;
  const mAfter = p.m - dm;
  if (mAfter < T.minPlayerMass || dm < T.minMass) return null;
  const off = Math.sqrt(mAfter) + Math.sqrt(dm);
  const q = addBody(w, {
    x: p.x + dx * off,
    y: p.y + dy * off,
    vx: p.vx + speed * dx,
    vy: p.vy + speed * dy,
    m: dm,
    kind: 'mote',
    gu: w.t + T.ejectGrace,
    gf: p.id,
  });
  const k = (dm / mAfter) * speed;
  p.vx -= k * dx;
  p.vy -= k * dy;
  p.m = mAfter;
  w.stats.ejected += dm;
  w.stats.ejects++;
  return q;
}

/**
 * Zwei sich ueberlappende Koerper: Masse fliesst vom kleineren (S) zum groesseren (L), bis sie sich gerade beruehren.
 * Gibt true zurueck, wenn S ganz absorbiert wurde.
 */
export function absorb(w, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  const ra = Math.sqrt(a.m);
  const rb = Math.sqrt(b.m);
  if (d2 >= (ra + rb) * (ra + rb)) return false;
  let L = a;
  let S = b;
  const diff = b.m - a.m;
  if (Math.abs(diff) < 1e-9 ? b.id < a.id : diff > 0) {
    L = b;
    S = a;
  }
  const M = L.m + S.m;
  let dm;
  if (d2 <= M) dm = S.m;
  else {
    const d = Math.sqrt(d2);
    const rS = (d - Math.sqrt(Math.max(0, 2 * M - d2))) / 2;
    dm = S.m - rS * rS;
    if (S.m - dm < T.minMass) dm = S.m;
  }
  if (!(dm > 0)) return false;
  const full = dm >= S.m;
  if (globalThis.__abs) globalThis.__abs(w, L, S, dm);
  const mNew = L.m + dm;
  if (L.gf && S.gf !== L.gf && S.kind !== 'player') L.gf = 0; // ein Teilchen, das fremde Masse schluckt, gilt nicht mehr als Ausstoss des Spielers
  L.vx = (L.m * L.vx + dm * S.vx) / mNew;
  L.vy = (L.m * L.vy + dm * S.vy) / mNew;
  L.m = mNew;
  S.m = full ? 0 : S.m - dm;
  if (L.kind === 'player') {
    w.stats.gained += dm;
    if (full) w.stats.absorbed++;
  }
  return full;
}

function bounds(w) {
  const R = w.arenaR;
  if (!(R > 0)) return;
  for (const b of w.bodies) {
    const lim = R - Math.sqrt(b.m);
    if (lim <= 0) continue;
    const d2 = b.x * b.x + b.y * b.y;
    if (d2 > lim * lim) {
      const d = Math.sqrt(d2);
      const nx = b.x / d;
      const ny = b.y / d;
      const vn = b.vx * nx + b.vy * ny;
      if (vn > 0) {
        b.vx -= 2 * vn * nx;
        b.vy -= 2 * vn * ny;
      }
      b.x = nx * lim;
      b.y = ny * lim;
    }
  }
}

const graceBlocks = (w, a, b) => (a.gf === b.id && w.t < a.gu) || (b.gf === a.id && w.t < b.gu);

let pairBuf = [];

function findPairs(w) {
  const bs = w.bodies;
  const n = bs.length;
  const pairs = pairBuf;
  pairs.length = 0;
  if (n < T.gridMinBodies) {
    for (let i = 0; i < n; i++) {
      const a = bs[i];
      const ra = Math.sqrt(a.m);
      for (let j = i + 1; j < n; j++) {
        const b = bs[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rr = ra + Math.sqrt(b.m);
        if (dx * dx + dy * dy < rr * rr) pairs.push(i, j);
      }
    }
    return pairs;
  }
  // gleichmaessiges Raster, Zellgroesse = 2 x groesster Radius; Paare danach in fester Reihenfolge (i, j)
  let rmax = 0;
  for (const b of bs) rmax = Math.max(rmax, Math.sqrt(b.m));
  const cell = Math.max(2 * rmax, 0.5);
  const grid = new Map();
  const key = (cx, cy) => (cx + 4096) * 8192 + (cy + 4096);
  for (let i = 0; i < n; i++) {
    const b = bs[i];
    const k = key(Math.floor(b.x / cell), Math.floor(b.y / cell));
    const c = grid.get(k);
    if (c) c.push(i);
    else grid.set(k, [i]);
  }
  const found = [];
  for (let i = 0; i < n; i++) {
    const a = bs[i];
    const ra = Math.sqrt(a.m);
    const cx = Math.floor(a.x / cell);
    const cy = Math.floor(a.y / cell);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const c = grid.get(key(cx + ox, cy + oy));
        if (!c) continue;
        for (const j of c) {
          if (j <= i) continue;
          const b = bs[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const rr = ra + Math.sqrt(b.m);
          if (dx * dx + dy * dy < rr * rr) found.push(i * 65536 + j);
        }
      }
    }
  }
  found.sort((x, y) => x - y);
  for (const f of found) pairs.push(Math.floor(f / 65536), f % 65536);
  return pairs;
}

function collide(w) {
  const pairs = findPairs(w);
  if (!pairs.length) return;
  const bs = w.bodies;
  let dead = false;
  for (let k = 0; k < pairs.length; k += 2) {
    const a = bs[pairs[k]];
    const b = bs[pairs[k + 1]];
    if (a.m <= 0 || b.m <= 0) continue;
    if (graceBlocks(w, a, b)) continue;
    if (absorb(w, a, b)) dead = true;
  }
  if (dead) {
    w.bodies = bs.filter((b) => b.m > 0);
    if (w.player && w.player.m <= 0) w.player = null;
  }
}

/** Ein fester Physikschritt. */
export function step(w) {
  const dt = T.dt;
  w.t += dt;
  w.steps++;
  // (P2: hier wirkt die Gravitation der Attraktoren auf die Geschwindigkeit, semi-implizit: erst v, dann x)
  for (const b of w.bodies) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  bounds(w);
  collide(w);
}

/* ---------- Schnappschuss ---------- */

export function snapshot(w) {
  return {
    t: w.t,
    steps: w.steps,
    nextId: w.nextId,
    arenaR: w.arenaR,
    stats: { ...w.stats },
    b: w.bodies.map((b) => [b.id, b.x, b.y, b.vx, b.vy, b.m, b.kind, b.tag, b.gu, b.gf]),
  };
}

export function restore(s) {
  const w = {
    t: s.t,
    steps: s.steps,
    nextId: s.nextId,
    arenaR: s.arenaR,
    stats: { ...s.stats },
    bodies: s.b.map(([id, x, y, vx, vy, m, kind, tag, gu, gf]) => ({ id, x, y, vx, vy, m, kind, tag, gu, gf })),
    player: null,
  };
  w.player = w.bodies.find((b) => b.kind === 'player') || null;
  return w;
}

export const totalMass = (w) => w.bodies.reduce((s, b) => s + b.m, 0);
