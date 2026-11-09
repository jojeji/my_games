// Kapitel 4 "Dunkelwolke" (Paket D): begrenztes Sichtfeld. REINE DARSTELLUNG und DOM-frei: Sichtradius, Einblenden am Rand, Glimmen groesserer Koerper
// jenseits des Randes, Hinweise (Ziel, letzte Koerper). Die Physik und der Bot kennen den Nebel nicht (der Bot darf alles sehen: er prueft Loesbarkeit, nicht Fairness).
import { T } from './tune.js';

const F = T.fog;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

/** Hat dieses Level Nebel? (`level.fog` = true oder ein Objekt mit Ueberschreibungen.) */
export const fogOf = (level) => (level && level.fog ? { ...F, ...(level.fog === true ? {} : level.fog) } : null);

/** Sichtradius in Welteinheiten: waechst mit dem Spielerradius (wie die Kamera). */
export const fogRadius = (m, fog = F) => fog.r0 * Math.pow(Math.sqrt(Math.max(m, 1e-6)), fog.exp);

/** Sichtbarkeit (0..1) eines Koerpers im Abstand d (Mitte) mit Radius r: voll innerhalb (1 - softIn) x R, null, sobald auch seine Kante ausserhalb von R liegt. */
export function fogAlpha(d, r, R, fog = F) {
  const e = d - r; // Abstand der naechsten Kante
  const lo = R * (1 - fog.softIn);
  if (e <= lo) return 1;
  if (e >= R) return 0;
  const u = (R - e) / (R - lo);
  return u * u * (3 - 2 * u);
}

/**
 * Glimmen: groessere Koerper (ab 0,97 x Spielermasse), die noch NICHT sichtbar sind, verraten sich am Rand in ihrer Richtung.
 * Staerke k (0..1) = Naehe (je naeher am Rand, desto staerker) x Groesse (x1 schwach ... x4 stark) x Annaeherung (nahende voll, andere gut halb).
 * Gibt [{ id, ux, uy, k, d }] zurueck, hoechstens glimMax, staerkste zuerst.
 */
export function fogGlimmers(world, R, out = [], fog = F) {
  out.length = 0;
  const p = world.player;
  if (!p) return out;
  const reach = R * fog.glimRange;
  for (const b of world.bodies) {
    if (b === p || b.kind === 'attractor' || b.m < 0.97 * p.m || b.gf === p.id) continue;
    const rx = b.x - p.x;
    const ry = b.y - p.y;
    const d = Math.hypot(rx, ry);
    const rb = Math.sqrt(b.m);
    const gap = d - rb - R; // > 0: noch ausserhalb des Sichtkreises
    if (gap <= -R * fog.softIn * 0.5 || gap > reach) continue;
    const prox = 1 - clamp(gap, 0, reach) / reach;
    const q = b.m / p.m;
    const size = clamp(0.38 + 0.26 * Math.log2(Math.max(1, q)), 0.38, 1);
    const closing = ((b.vx - p.vx) * rx + (b.vy - p.vy) * ry) / Math.max(d, 1e-6) < -0.03;
    const k = clamp(Math.pow(prox, 1.15) * size * (closing ? 1 : 0.58), 0, 1);
    if (k < fog.glimMin) continue;
    out.push({ id: b.id, ux: rx / Math.max(d, 1e-6), uy: ry / Math.max(d, 1e-6), k, d });
  }
  out.sort((a, c) => c.k - a.k);
  if (out.length > fog.glimMax) out.length = fog.glimMax;
  return out;
}

/** Ids der Koerper, auf die schwache Zielpfeile zeigen: der Zielkoerper (`absorb`), bei `last` die letzten <= hintLast Koerper. */
export function fogHints(world, goal, fog = F) {
  const ids = new Set();
  const p = world.player;
  if (!p || !goal) return ids;
  if (goal.type === 'absorb') {
    const t = world.bodies.find((b) => b.tag === 'target');
    if (t) ids.add(t.id);
  } else if (goal.type === 'last') {
    const lim = T.dustFrac * p.m;
    const rest = world.bodies.filter((b) => b !== p && b.gf !== p.id && b.m >= lim && b.kind !== 'attractor');
    if (rest.length > 0 && rest.length <= fog.hintLast) for (const b of rest) ids.add(b.id);
  }
  return ids;
}

/** Sichtradius waehrend des Auftakts: waechst aus der Dunkelheit (k = 0 ... 1). */
export const fogIntro = (k, fog = F) => {
  const u = clamp(k, 0, 1);
  const e = u * u * (3 - 2 * u);
  return fog.introFrom + (1 - fog.introFrom) * e;
};
