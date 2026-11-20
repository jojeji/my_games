// Bahnmechanik fuer Kapitel 3 "Protostern" (DOM-frei, rein): Bahnelemente, Startzustaende auf Bahnen und die BAHNVORSCHAU
// (vorhergesagte Bahn des Spielers unter der Sterngravitation, ohne andere Koerper). Die Vorschau rechnet mit Leapfrog und angepasster Schrittweite
// (gleiche Kraft wie physics.js inkl. Weichheit), ist also genauer als das semi-implizite Euler der Physik und weicht trotzdem weniger als 2 % nach einem Umlauf ab (Test).
import { T } from './tune.js';
import { circularSpeed, attractorAt } from './physics.js';

export const attractorsOf = (w) => w.bodies.filter((b) => b.kind === 'attractor' && b.gm > 0);
/** Der Stern (Attraktor ohne eigene Bahn); Planeten (`po`) sind weitere Attraktoren auf festen Kreisbahnen. */
export const starOf = (w) => w.bodies.find((b) => b.kind === 'attractor' && !b.po) || w.bodies.find((b) => b.kind === 'attractor') || null;
export const planetsOf = (w) => w.bodies.filter((b) => b.kind === 'attractor' && b.po);

/**
 * Startzustand auf einer Bahn um (0,0): Radius r, Winkel `ang` (Grad), Geschwindigkeit = f x Kreisgeschwindigkeit,
 * Richtung dir (+1 gegen den Uhrzeigersinn, -1 mit), phi (Grad) = Flugwinkel gegen die Tangente (nach aussen positiv).
 */
export function orbitState(gm, r, ang = 0, { f = 1, dir = 1, phi = 0 } = {}) {
  const a = (ang * Math.PI) / 180;
  const ph = (phi * Math.PI) / 180;
  const vc = circularSpeed(gm, r) * f;
  const tx = -Math.sin(a) * dir;
  const ty = Math.cos(a) * dir;
  const nx = Math.cos(a);
  const ny = Math.sin(a);
  return { x: r * nx, y: r * ny, vx: vc * (Math.cos(ph) * tx + Math.sin(ph) * nx), vy: vc * (Math.cos(ph) * ty + Math.sin(ph) * ny) };
}

/** Bahnelemente (Newton, ohne Kernweichheit) eines Zustands um einen Stern in (0,0) mit `gm`: { r, v, E, h, a, e, rp, ra, period, bound, dir }. */
export function elements(gm, x, y, vx, vy) {
  const r = Math.hypot(x, y);
  const v2 = vx * vx + vy * vy;
  const E = v2 / 2 - gm / r;
  const h = x * vy - y * vx;
  const e = Math.sqrt(Math.max(0, 1 + (2 * E * h * h) / (gm * gm)));
  const bound = E < 0;
  const a = bound ? -gm / (2 * E) : Infinity;
  const p = (h * h) / gm;
  return { r, v: Math.sqrt(v2), E, h, e, bound, a, rp: p / (1 + e), ra: bound ? a * (1 + e) : Infinity, period: bound ? 2 * Math.PI * Math.sqrt((a * a * a) / gm) : Infinity, dir: h >= 0 ? 1 : -1 };
}

/** Abdrift: 0 = innerhalb der Warnschwelle, 0..1 zwischen Warn- und Verlustschwelle (1 = verloren). Ohne offenen Raum immer 0. */
export function driftState(w) {
  const p = w.player;
  const g = w.grav;
  if (!p || !g || !(g.warnR > 0)) return 0;
  const d = Math.hypot(p.x, p.y);
  if (d <= g.warnR) return 0;
  return Math.min(1, (d - g.warnR) / Math.max(1e-6, g.loseR - g.warnR));
}

/**
 * Bahnvorschau des Spielers. Rueckgabe { pts: Float64Array [x0,y0,x1,y1,...] (Beginn = Spielerort), t: Float64Array (s ab jetzt), flag: Uint8Array
 * (0 normal, 1 Bahnpunkt im Stern, 2 jenseits der Warnschwelle), n, end: 'star' | 'drift' | null (Bahn endet hier), rmin, rmax, period (s, Unendlich bei Fluchtbahn), bound, steps }.
 * Null, wenn es keinen Spieler oder keinen Attraktor gibt.
 */
export function predictOrbit(w, opt = {}) {
  const p = w.player;
  const atts = attractorsOf(w);
  if (!p || !atts.length) return null;
  const P = { ...T.orbit.preview, ...opt };
  const soft2 = T.orbit.soft * T.orbit.soft;
  const g = w.grav || {};
  const rp = Math.sqrt(p.m);
  const A = starOf(w);
  const pls = atts.filter((a) => a.po);
  const t0 = w.t;
  let x = p.x;
  let y = p.y;
  let vx = p.vx;
  let vy = p.vy;
  const el = elements(A.gm, x - A.x, y - A.y, vx, vy);
  const horizon = el.bound ? Math.min(P.maxT, P.revs * el.period) : P.maxT;
  const hitR = Math.sqrt(A.m) + rp + P.starGap;
  const warnR = g.warnR > 0 ? g.warnR : Infinity;
  const loseR = g.loseR > 0 ? g.loseR : Infinity;
  const cap = 4000;
  const ptsA = [];
  const tA = [];
  const fA = [];
  const pp = [0, 0];
  const acc = (px, py, tt) => {
    let ax = 0;
    let ay = 0;
    for (const a of atts) {
      const q = a.po ? attractorAt(a, t0 + tt, pp) : null; // Planeten stehen zur Zeit tt dort, wo ihre Bahn sie hinfuehrt (exakt)
      const dx = (q ? q[0] : a.x) - px;
      const dy = (q ? q[1] : a.y) - py;
      const d2 = dx * dx + dy * dy;
      const f = a.gm / ((d2 + soft2) * Math.sqrt(d2 + 1e-12));
      ax += f * dx;
      ay += f * dy;
    }
    return [ax, ay];
  };
  let t = 0;
  let end = null;
  let rmin = Infinity;
  let rmax = 0;
  const push = (r, flag) => {
    ptsA.push(x, y);
    tA.push(t);
    fA.push(flag);
    if (r < rmin) rmin = r;
    if (r > rmax) rmax = r;
  };
  let r0 = Math.hypot(x - A.x, y - A.y);
  push(r0, 0);
  let steps = 0;
  while (t < horizon && steps < cap) {
    const r = Math.hypot(x - A.x, y - A.y);
    let dt = Math.min(P.dtMax, Math.max(P.dtMin, P.stepFrac * Math.sqrt((r * r * r) / A.gm)));
    if (t + dt > horizon) dt = horizon - t;
    let [ax, ay] = acc(x, y, t);
    vx += ax * dt * 0.5;
    vy += ay * dt * 0.5;
    x += vx * dt;
    y += vy * dt;
    [ax, ay] = acc(x, y, t + dt);
    vx += ax * dt * 0.5;
    vy += ay * dt * 0.5;
    t += dt;
    steps++;
    const rr = Math.hypot(x - A.x, y - A.y);
    const d0 = Math.hypot(x, y);
    if (rr < hitR) {
      push(rr, 1);
      end = 'star';
      break;
    }
    let hitPl = false;
    for (const a of pls) {
      const q = attractorAt(a, t0 + t, pp);
      if (Math.hypot(x - q[0], y - q[1]) < Math.sqrt(a.m) + rp + P.starGap) hitPl = true;
    }
    if (hitPl) {
      push(rr, 1);
      end = 'planet';
      break;
    }
    if (d0 > loseR) {
      push(rr, 2);
      end = 'drift';
      break;
    }
    push(rr, d0 > warnR ? 2 : 0);
  }
  // ausduennen
  const nAll = tA.length;
  const stride = Math.max(1, Math.ceil(nAll / P.maxPoints));
  const keep = [];
  for (let i = 0; i < nAll; i += stride) keep.push(i);
  if (keep[keep.length - 1] !== nAll - 1) keep.push(nAll - 1);
  const pts = new Float64Array(keep.length * 2);
  const tt = new Float64Array(keep.length);
  const flag = new Uint8Array(keep.length);
  keep.forEach((i, k) => {
    pts[2 * k] = ptsA[2 * i];
    pts[2 * k + 1] = ptsA[2 * i + 1];
    tt[k] = tA[i];
    flag[k] = fA[i];
  });
  return { pts, t: tt, flag, n: keep.length, end, rmin, rmax, period: el.period, bound: el.bound, steps, el };
}

/**
 * Vorhergesagter Weg eines KOERPERS (Zielkoerper) zu den Zeitpunkten `times` (s ab jetzt, aufsteigend): nur Stern + Planeten auf ihren Bahnen,
 * keine anderen Koerper (wie die Spielervorschau). Leapfrog mit eigener Schrittweite (angepasst an den Sternabstand des Koerpers), genau auf die Zeitpunkte gesetzt.
 * Rueckgabe Float64Array [x0,y0,x1,y1,...] (zwei Werte je Zeitpunkt).
 */
export function predictTrack(w, body, times) {
  const atts = attractorsOf(w);
  const out = new Float64Array(times.length * 2);
  if (!atts.length || !body) return out;
  const P = T.orbit.preview;
  const soft2 = T.orbit.soft * T.orbit.soft;
  const A = starOf(w);
  const t0 = w.t;
  const pp = [0, 0];
  let x = body.x;
  let y = body.y;
  let vx = body.vx;
  let vy = body.vy;
  const A2 = [0, 0]; // Rueckgabe von acc ohne neue Felder je Aufruf (GC)
  const acc = (px, py, tt) => {
    let ax = 0;
    let ay = 0;
    for (const a of atts) {
      const q = a.po ? attractorAt(a, t0 + tt, pp) : null;
      const dx = (q ? q[0] : a.x) - px;
      const dy = (q ? q[1] : a.y) - py;
      const d2 = dx * dx + dy * dy;
      const f = a.gm / ((d2 + soft2) * Math.sqrt(d2 + 1e-12));
      ax += f * dx;
      ay += f * dy;
    }
    A2[0] = ax;
    A2[1] = ay;
    return A2;
  };
  let t = 0;
  for (let i = 0; i < times.length; i++) {
    const goal = times[i];
    while (t < goal - 1e-9) {
      const r = Math.max(1, Math.hypot(x - A.x, y - A.y));
      const dt = Math.min(goal - t, Math.min(P.dtMax, Math.max(P.dtMin, P.stepFrac * Math.sqrt((r * r * r) / A.gm))));
      let q = acc(x, y, t);
      vx += q[0] * dt * 0.5;
      vy += q[1] * dt * 0.5;
      x += vx * dt;
      y += vy * dt;
      q = acc(x, y, t + dt);
      vx += q[0] * dt * 0.5;
      vy += q[1] * dt * 0.5;
      t += dt;
    }
    out[2 * i] = x;
    out[2 * i + 1] = y;
  }
  return out;
}

/**
 * TREFFPUNKT: wo kommt die Spielerbahn (Vorschau `pv`) dem Zielkoerper am naechsten, wenn beide ihren Bahnen folgen (ohne andere Koerper)?
 * Gesucht wird der kleinste Abstand ueber dieselben Zeitpunkte wie die Vorschau, die Lage zwischen den Punkten verfeinert eine Parabel durch die drei Nachbarn.
 * Rueckgabe { i (naechster Vorschaupunkt), t (s ab jetzt), px, py (Spieler dort), tx, ty (Geisterort des Ziels), d (Abstand der Mittelpunkte), rsum (Radiensumme jetzt),
 * hit (d < rsum), bigger (Spieler jetzt schwerer als das Ziel) } oder null. opt.prefer = Weltzeit des letzten Treffpunkts: ein lokales Minimum in dessen Naehe
 * wird bevorzugt, solange es kaum schlechter ist (ruhige Anzeige, kein Springen zwischen zwei Begegnungen).
 */
export function predictMeeting(w, pv, target, opt = {}) {
  const p = w.player;
  if (!p || !pv || pv.n < 2 || !target || !(target.m > 0)) return null;
  const n = pv.n;
  const tr = predictTrack(w, target, pv.t);
  const dist = new Float64Array(n);
  for (let i = 0; i < n; i++) dist[i] = Math.hypot(pv.pts[2 * i] - tr[2 * i], pv.pts[2 * i + 1] - tr[2 * i + 1]);
  let best = -1;
  const mins = [];
  for (let i = 0; i < n; i++) {
    const l = i > 0 ? dist[i - 1] : Infinity;
    const r = i < n - 1 ? dist[i + 1] : Infinity;
    if (dist[i] <= l && dist[i] <= r) {
      mins.push(i);
      if (best < 0 || dist[i] < dist[best]) best = i;
    }
  }
  if (best < 0) return null;
  if (opt.prefer != null && mins.length > 1) {
    let alt = -1;
    for (const i of mins) if (Math.abs(w.t + pv.t[i] - opt.prefer) <= 4 && dist[i] <= dist[best] * 1.25 + 0.3 && (alt < 0 || dist[i] < dist[alt])) alt = i;
    if (alt >= 0) best = alt;
  }
  let f = 0; // Lage des Minimums zwischen den Punkten, -0,5..0,5 Punktabstaende
  if (best > 0 && best < n - 1) {
    const a = dist[best - 1] * dist[best - 1];
    const b = dist[best] * dist[best];
    const c = dist[best + 1] * dist[best + 1];
    const den = a - 2 * b + c;
    const t1 = pv.t[best] - pv.t[best - 1];
    const t2 = pv.t[best + 1] - pv.t[best];
    if (den > 1e-12 && Math.abs(t1 - t2) < 0.35 * Math.max(t1, t2)) f = Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den));
  }
  const j0 = f < 0 ? best - 1 : best;
  const u = f < 0 ? 1 + f : f;
  const j1 = Math.min(n - 1, j0 + 1);
  const lerp = (arr, o) => arr[2 * j0 + o] + (arr[2 * j1 + o] - arr[2 * j0 + o]) * u;
  const px = lerp(pv.pts, 0);
  const py = lerp(pv.pts, 1);
  const tx = lerp(tr, 0);
  const ty = lerp(tr, 1);
  const d = Math.hypot(px - tx, py - ty);
  const rsum = Math.sqrt(p.m) + Math.sqrt(target.m);
  return { i: best, t: pv.t[j0] + (pv.t[j1] - pv.t[j0]) * u, px, py, tx, ty, d, rsum, hit: d < rsum, bigger: p.m > target.m };
}
