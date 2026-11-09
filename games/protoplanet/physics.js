// Protoplanet: DOM-freie, deterministische Physik. Kreise mit r = sqrt(m), fester Schritt, Ausstoss mit Impulserhaltung,
// Absorbieren (Masse fliesst vom kleineren zum groesseren, bis sie sich beruehren), elastische Kreis-Arena.
// Kapitel 1 und 2 kennen keine Gravitation; `kind` kennt 'hunter' (P2, Gehirn in hunter.js) und 'attractor' (P3), die Physik behandelt sie wie jeden Koerper.
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
    ai: b.ai || null, // nur kind 'hunter': Gehirn-Zustand { seed, diff, react, next, plan } (hunter.js), Teil des Schnappschusses
  };
  if (body.id >= w.nextId) w.nextId = body.id + 1;
  w.bodies.push(body);
  return body;
}

/**
 * Ein Teilchen aus Koerper `p` ausstossen (Spieler oder Jaeger, gleiche Physik). (dx,dy) = Richtung des Teilchens; `p` fliegt in die Gegenrichtung.
 * Das Teilchen ist ein normaler Koerper (`gf` = id des Ausstossenden, bis es fremde Masse schluckt). Gibt das Teilchen zurueck oder null.
 */
export function ejectFrom(w, p, dx, dy, frac = T.ejectFrac, speed = T.ejectSpeed) {
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
  if (p === w.player) {
    w.stats.ejected += dm;
    w.stats.ejects++;
  }
  return q;
}

/** Ein Teilchen des Spielers ausstossen (siehe ejectFrom). */
export function eject(w, dx, dy, frac = T.ejectFrac, speed = T.ejectSpeed) {
  return ejectFrom(w, w.player, dx, dy, frac, speed);
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
let ord = []; // Reihenfolge der Koerper nach x (Sweep), bleibt zwischen Schritten erhalten

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
  // Sweep entlang x: Koerper nach x geordnet (Einfuegesortierung auf der Reihenfolge des letzten Schritts: fast sortiert, also ~O(n)), jeder Koerper
  // wird nur mit den Nachbarn verglichen, deren x-Abstand kleiner ist als die Summe aus seinem Radius und dem groessten Radius. Die Paare werden danach
  // in fester Reihenfolge (i, j) sortiert, das Ergebnis haengt also nicht von der Sortierreihenfolge ab (deterministisch, identisch zum Paarvergleich).
  if (ord.length !== n) {
    ord = new Array(n);
    for (let i = 0; i < n; i++) ord[i] = i;
  }
  let rmax = 0;
  for (let i = 0; i < n; i++) {
    const m = bs[i].m;
    if (m > rmax) rmax = m;
  }
  rmax = Math.sqrt(rmax);
  for (let k = 1; k < n; k++) {
    const idx = ord[k];
    const x = bs[idx].x;
    let h = k - 1;
    while (h >= 0 && bs[ord[h]].x > x) {
      ord[h + 1] = ord[h];
      h--;
    }
    ord[h + 1] = idx;
  }
  const found = [];
  for (let k = 0; k < n; k++) {
    const i = ord[k];
    const a = bs[i];
    const ra = Math.sqrt(a.m);
    const reach = ra + rmax;
    for (let h = k + 1; h < n; h++) {
      const j = ord[h];
      const b = bs[j];
      const dx = b.x - a.x;
      if (dx >= reach) break;
      const dy = b.y - a.y;
      const rr = ra + Math.sqrt(b.m);
      if (dx * dx + dy * dy < rr * rr) found.push(i < j ? i * 65536 + j : j * 65536 + i);
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
    b: w.bodies.map((b) => [b.id, b.x, b.y, b.vx, b.vy, b.m, b.kind, b.tag, b.gu, b.gf, b.ai ? { ...b.ai, plan: b.ai.plan ? { ...b.ai.plan } : null } : null]),
  };
}

export function restore(s) {
  const w = {
    t: s.t,
    steps: s.steps,
    nextId: s.nextId,
    arenaR: s.arenaR,
    stats: { ...s.stats },
    bodies: s.b.map(([id, x, y, vx, vy, m, kind, tag, gu, gf, ai]) => ({ id, x, y, vx, vy, m, kind, tag, gu, gf, ai: ai ? { ...ai, plan: ai.plan ? { ...ai.plan } : null } : null })), // Schnappschuesse aus P1 haben 10 Eintraege (ai fehlt = null)
    player: null,
  };
  w.player = w.bodies.find((b) => b.kind === 'player') || null;
  return w;
}

export const totalMass = (w) => w.bodies.reduce((s, b) => s + b.m, 0);
