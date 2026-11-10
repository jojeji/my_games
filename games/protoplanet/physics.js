// Protoplanet: DOM-freie, deterministische Physik. Kreise mit r = sqrt(m), fester Schritt, Ausstoss mit Impulserhaltung,
// Absorbieren (Masse fliesst vom kleineren zum groesseren, bis sie sich beruehren), elastische Kreis-Arena.
// Kapitel 1 und 2 kennen keine Gravitation; `kind` kennt 'hunter' (P2, Gehirn in hunter.js) und 'attractor' (Kapitel 3 "Protostern", Paket B).
// Attraktor: steht still, zieht alle anderen Koerper mit a = gm / (d^2 + soft^2) an (`gm` = G x Masse, getrennt von `m`, das nur Groesse und Absorption bestimmt), absorbiert was ihn beruehrt.
// Offener Raum (`w.grav`, arenaR = 0): kein Rand; ausserhalb `warnR` Warnung, ausserhalb `loseR` ist der Spieler verloren (Abdrift), weit dahinter verschwinden Koerper.
// Anziehung unter den Koerpern (`w.grav.selfGrav` 0..1): die `selfK` schwersten Koerper ab `selfMin` Masse ziehen weich an. Alles semi-implizites Euler (Kick, dann Drift), eine Auswertung je Schritt.
import { T } from './tune.js';

export const radius = (m) => Math.sqrt(m);

/** Welt aus einer Koerperliste (ohne Spieler) bauen. Der Spieler bekommt id 1 (bei Gleichstand gilt die kleinere id als groesser). */
export function createWorld({ bodies, arenaR, player, grav }) {
  const w = {
    t: 0,
    steps: 0,
    nextId: 1,
    arenaR,
    grav: grav ? { ...grav } : null, // Offener Raum / Gravitation: { selfGrav, warnR, loseR } (null in Kapitel 1 und 2)
    lostTo: null, // Verlustursache: 'attractor' (in den Stern gestuerzt), 'body' (absorbiert), 'drift' (abgetrieben)
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
    gm: b.gm || 0, // nur kind 'attractor': G x Masse (Anziehung), unabhaengig von `m`
    po: b.po ? { r: b.po.r, a0: b.po.a0, w: b.po.w } : null, // nur Planeten (Kapitel 5): feste Kreisbahn um (0,0): Ort = r x (cos, sin)(a0 + w x t), exakt vorhersagbar
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
  if (L.po) {
    // Planet (Kapitel 5): verschluckt alles, was ihn beruehrt, ganz, und behaelt seine Masse (sonst wuerde er zum Riesen und die Welt waere nach 60 s leer gefressen)
    if (S.kind === 'player') w.lostTo = 'planet';
    S.m = 0;
    return true;
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
  if (full && S.kind === 'player') w.lostTo = L.kind === 'attractor' ? (L.po ? 'planet' : 'attractor') : 'body';
  const mNew = L.m + dm;
  if (L.gf && S.gf !== L.gf && S.kind !== 'player') L.gf = 0; // ein Teilchen, das fremde Masse schluckt, gilt nicht mehr als Ausstoss des Spielers
  if (L.kind !== 'attractor') {
    L.vx = (L.m * L.vx + dm * S.vx) / mNew; // ein Attraktor behaelt seinen Platz
    L.vy = (L.m * L.vy + dm * S.vy) / mNew;
  }
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

/* ---------- Gravitation (Kapitel 3) ---------- */

/** Beschleunigung durch die Attraktoren an der Stelle (x, y): [ax, ay]. */
export function pullAt(atts, x, y, out = [0, 0]) {
  const s2 = T.orbit.soft * T.orbit.soft;
  let ax = 0;
  let ay = 0;
  for (const a of atts) {
    const dx = a.x - x;
    const dy = a.y - y;
    const d2 = dx * dx + dy * dy;
    const f = a.gm / ((d2 + s2) * Math.sqrt(d2 + 1e-12));
    ax += f * dx;
    ay += f * dy;
  }
  out[0] = ax;
  out[1] = ay;
  return out;
}

/** Geschwindigkeit einer Kreisbahn mit Radius r um einen Attraktor mit `gm` (mit der Weichheit des Kerns). */
export const circularSpeed = (gm, r) => Math.sqrt((gm * r * r) / ((r * r + T.orbit.soft * T.orbit.soft) * Math.sqrt(r * r + 1e-12)));

let srcBuf = [];

/** Kick: Attraktoren und die schwersten Koerper aendern die Geschwindigkeit aller (nicht-Attraktor-)Koerper. */
function gravity(w, dt) {
  const bs = w.bodies;
  let atts = null;
  for (const b of bs) if (b.kind === 'attractor' && b.gm > 0) (atts || (atts = [])).push(b);
  if (!atts) return;
  const O = T.orbit;
  const s2 = O.soft * O.soft;
  // Quellen der Anziehung unter den Koerpern: die selfK schwersten ab selfMin (Gleichstand: kleinere id zuerst), Staerke selfGrav x O.selfG
  const G = w.grav && w.grav.selfGrav > 0 ? w.grav.selfGrav * O.selfG : 0;
  const src = srcBuf;
  src.length = 0;
  if (G > 0) {
    for (const b of bs) {
      if (b.kind === 'attractor' || b.kind === 'player' || b.m < O.selfMin) continue; // der Spieler zieht nicht (er ist die Sonde, die Welt zieht)
      let i = src.length;
      src.push(b);
      while (i > 0 && (src[i - 1].m < b.m || (src[i - 1].m === b.m && src[i - 1].id > b.id))) {
        src[i] = src[i - 1];
        i--;
      }
      src[i] = b;
      if (src.length > O.selfK) src.length = O.selfK;
    }
  }
  for (const b of bs) {
    if (b.kind === 'attractor') continue;
    let ax = 0;
    let ay = 0;
    for (const a of atts) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d2 = dx * dx + dy * dy;
      const f = a.gm / ((d2 + s2) * Math.sqrt(d2 + 1e-12));
      ax += f * dx;
      ay += f * dy;
    }
    for (let k = 0; k < src.length; k++) {
      const s = src[k];
      if (s === b) continue;
      const dx = s.x - b.x;
      const dy = s.y - b.y;
      const d2 = dx * dx + dy * dy;
      const rr = Math.sqrt(s.m) + Math.sqrt(b.m);
      const f = (G * s.m) / ((d2 + O.selfSoft * O.selfSoft + rr * rr) * Math.sqrt(d2 + 1e-12));
      ax += f * dx;
      ay += f * dy;
    }
    b.vx += ax * dt;
    b.vy += ay * dt;
  }
}

/** Offener Raum: Spieler jenseits von loseR ist abgetrieben (verloren), Koerper weit dahinter verschwinden (ausser Zielkoerper und Brocken). */
function openSpace(w) {
  const g = w.grav;
  if (!g || !(g.loseR > 0)) return;
  const p = w.player;
  if (p && p.x * p.x + p.y * p.y > g.loseR * g.loseR) {
    w.lostTo = 'drift';
    p.m = 0;
  }
  const cull = g.loseR * T.orbit.cullFrac;
  const c2 = cull * cull;
  let dead = false;
  for (const b of w.bodies) {
    if (b.kind === 'attractor' || b === p || b.tag) continue;
    if (b.x * b.x + b.y * b.y > c2) {
      b.m = 0;
      dead = true;
    }
  }
  if (dead || (p && p.m <= 0)) {
    w.bodies = w.bodies.filter((b) => b.m > 0);
    if (p && p.m <= 0) w.player = null;
  }
}

/** Ein fester Physikschritt. */
export function step(w) {
  const dt = T.dt;
  w.t += dt;
  w.steps++;
  if (w.grav) gravity(w, dt); // erst v (Kick), dann x: semi-implizites Euler
  for (const b of w.bodies) {
    if (b.kind === 'attractor') continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  for (const b of w.bodies) {
    if (!b.po) continue; // Planeten laufen auf ihrer festen Bahn (nichts wirkt auf sie), Geschwindigkeit = Tangente (fuer Annaeherungs-Rechnungen und Impuls beim Absorbieren)
    const a = b.po.a0 + b.po.w * w.t;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    b.x = b.po.r * c;
    b.y = b.po.r * sn;
    b.vx = -b.po.r * b.po.w * sn;
    b.vy = b.po.r * b.po.w * c;
  }
  bounds(w);
  collide(w);
  if (w.grav) openSpace(w);
}

/** Ort eines Attraktors zur Zeit t (Spielzeit): Planeten laufen auf ihrer Kreisbahn, der Stern steht. */
export function attractorAt(b, t, out = [0, 0]) {
  if (b.po) {
    const a = b.po.a0 + b.po.w * t;
    out[0] = b.po.r * Math.cos(a);
    out[1] = b.po.r * Math.sin(a);
  } else {
    out[0] = b.x;
    out[1] = b.y;
  }
  return out;
}

/* ---------- Schnappschuss ---------- */

export function snapshot(w) {
  return {
    t: w.t,
    steps: w.steps,
    nextId: w.nextId,
    arenaR: w.arenaR,
    ...(w.grav ? { g: { ...w.grav } } : {}), // nur Kapitel 3: Schnappschuesse der Kapitel 1 und 2 bleiben Byte fuer Byte wie vorher
    stats: { ...w.stats },
    b: w.bodies.map((b) => [b.id, b.x, b.y, b.vx, b.vy, b.m, b.kind, b.tag, b.gu, b.gf, b.ai ? { ...b.ai, plan: b.ai.plan ? { ...b.ai.plan } : null } : null, ...(b.gm || b.po ? [b.gm || 0, ...(b.po ? [[b.po.r, b.po.a0, b.po.w]] : [])] : [])]),
  };
}

export function restore(s) {
  const w = {
    t: s.t,
    steps: s.steps,
    nextId: s.nextId,
    arenaR: s.arenaR,
    grav: s.g ? { ...s.g } : null,
    lostTo: null,
    stats: { ...s.stats },
    bodies: s.b.map(([id, x, y, vx, vy, m, kind, tag, gu, gf, ai, gm, po]) => ({ id, x, y, vx, vy, m, kind, tag, gu, gf, ai: ai ? { ...ai, plan: ai.plan ? { ...ai.plan } : null } : null, gm: gm || 0, po: po ? { r: po[0], a0: po[1], w: po[2] } : null })), // Schnappschuesse aus P1 haben 10 Eintraege (ai fehlt = null), Kapitel 3 haengt `gm` an
    player: null,
  };
  w.player = w.bodies.find((b) => b.kind === 'player') || null;
  return w;
}

export const totalMass = (w) => w.bodies.reduce((s, b) => s + b.m, 0);
