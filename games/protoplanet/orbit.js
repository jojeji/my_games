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
