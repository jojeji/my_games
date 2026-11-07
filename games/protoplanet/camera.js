// Kamera (DOM-frei): folgt dem Spieler weich, Automatik-Zoom, Pinch-Zoom mit Rueckkehr zur Automatik.
// Zoom wird als sichtbare halbe Breite `half` in Welteinheiten gefuehrt (Pixel je Einheit = Breite / 2 / half).
import { T } from './tune.js';

export function createCamera() {
  return { x: 0, y: 0, half: T.camSpan, rz: 1, manualHalf: null, manualAt: -Infinity, pinchStartHalf: null, ready: false };
}

/**
 * Automatik-Zoom: camSpan x Bezugsradius, offen genug fuer groessere Koerper in der Naehe, begrenzt durch camMin/camMax und die Arena.
 * Der Bezugsradius `rz` ist der Spielerradius, dem die Kamera TRAEGE folgt (siehe updateCamera): schrumpft der Spieler, bleibt der Zoom
 * zunaechst stehen, der Koerper wird auf dem Bildschirm sichtbar kleiner. Ohne Angabe gilt der aktuelle Radius.
 */
export function autoHalf(world, rz = null) {
  const p = world.player;
  if (!p) return T.camSpan;
  const hi = Math.min(T.camMax, world.arenaR * 1.05);
  let half = T.camSpan * (rz == null ? Math.sqrt(p.m) : rz);
  for (const b of world.bodies) {
    if (b === p || b.m <= p.m) continue;
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d < T.camBigNear * half) half = Math.max(half, (d + Math.sqrt(b.m)) * 1.08);
  }
  return Math.min(hi, Math.max(T.camMin, half));
}

/** Pro Bild aufrufen. `now` in Sekunden (echte Zeit), `dt` echte Sekunden seit dem letzten Bild. */
export function updateCamera(cam, world, dt, now) {
  const p = world.player;
  if (!p) return cam;
  if (!cam.ready) {
    cam.x = p.x;
    cam.y = p.y;
    cam.rz = Math.sqrt(p.m);
    cam.half = autoHalf(world, cam.rz);
    cam.ready = true;
    return cam;
  }
  // Bezugsradius: waechst der Spieler, folgt der Zoom zuegig (der Koerper soll nicht aus dem Bild wachsen), schrumpft er, nur sehr traege
  const rNow = Math.sqrt(p.m);
  const tau = rNow > cam.rz ? T.camGrowTau : T.camShrinkTau;
  cam.rz += (rNow - cam.rz) * (1 - Math.exp(-dt / tau));
  const kf = 1 - Math.exp(-T.camFollow * dt);
  cam.x += (p.x - cam.x) * kf;
  cam.y += (p.y - cam.y) * kf;
  const manual = cam.manualHalf != null && (cam.pinchStartHalf != null || now - cam.manualAt < T.camManualHold);
  let target = manual ? cam.manualHalf : autoHalf(world, cam.rz);
  if (!manual) cam.manualHalf = null;
  target = Math.min(Math.min(T.camMax, world.arenaR * 1.05), Math.max(T.camMin * 0.6, target));
  const kz = 1 - Math.exp(-T.camZoomRate * dt);
  cam.half = Math.exp(Math.log(cam.half) + (Math.log(target) - Math.log(cam.half)) * kz);
  return cam;
}

/** Pinch: ratio = aktueller Fingerabstand / Abstand zu Beginn (> 1 = hineinzoomen). */
export function pinchStart(cam) {
  cam.pinchStartHalf = cam.half;
}
export function pinchMove(cam, ratio, now) {
  if (cam.pinchStartHalf == null) cam.pinchStartHalf = cam.half;
  cam.manualHalf = cam.pinchStartHalf / Math.max(0.2, Math.min(5, ratio));
  cam.manualAt = now;
}
export function pinchEnd(cam, now) {
  cam.pinchStartHalf = null;
  cam.manualAt = now;
}

/** Pixel je Welteinheit. */
export const scaleOf = (cam, viewW) => viewW / 2 / cam.half;
export const worldToScreen = (cam, viewW, viewH, x, y) => {
  const s = scaleOf(cam, viewW);
  return [viewW / 2 + (x - cam.x) * s, viewH / 2 + (y - cam.y) * s];
};
export const screenToWorld = (cam, viewW, viewH, sx, sy) => {
  const s = scaleOf(cam, viewW);
  return [cam.x + (sx - viewW / 2) / s, cam.y + (sy - viewH / 2) / s];
};
