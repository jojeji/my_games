// Kamera (DOM-frei): folgt dem Spieler weich, Automatik-Zoom, Pinch-Zoom mit Rueckkehr zur Automatik.
// Zoom wird als sichtbare halbe Breite `half` in Welteinheiten gefuehrt (Pixel je Einheit = Breite / 2 / half).
import { T } from './tune.js';
import { elements } from './orbit.js';

export function createCamera() {
  return { x: 0, y: 0, half: T.camSpan, rz: 1, manualHalf: null, manualAt: -Infinity, pinchStartHalf: null, ready: false };
}

/**
 * Automatik-Zoom: camSpan x Bezugsradius, offen genug fuer groessere Koerper in der Naehe, begrenzt durch camMin/camMax und die Arena.
 * Der Bezugsradius `rz` ist der Spielerradius, dem die Kamera TRAEGE folgt (siehe updateCamera): schrumpft der Spieler, bleibt der Zoom
 * zunaechst stehen, der Koerper wird auf dem Bildschirm sichtbar kleiner. Ohne Angabe gilt der aktuelle Radius.
 */
const camHi = (world) => (world.arenaR > 0 ? Math.min(T.camMax, world.arenaR * 1.05) : T.camMax); // offener Raum (Kapitel 3): kein Rand, nur camMax

const starBody = (world) => world.bodies.find((b) => b.kind === 'attractor');

/** Kapitel 3: mittlerer Abstand des Spielers zum Stern (null ohne Attraktor). */
function starDist(world) {
  const p = world.player;
  for (const b of world.bodies) if (b.kind === 'attractor') return { d: Math.hypot(b.x - p.x, b.y - p.y), r: Math.sqrt(b.m), x: b.x, y: b.y };
  return null;
}

/** Uebersicht fuer den Auftakt: alles bis zur aeusseren Warnschwelle bzw. dem weitesten Koerper (Kapitel 3). */
export function overviewHalf(world) {
  let far = 0;
  for (const b of world.bodies) far = Math.max(far, Math.hypot(b.x, b.y));
  return Math.min(T.camMax, Math.max(T.camMin, far * 1.1));
}

export function autoHalf(world, rz = null) {
  const p = world.player;
  if (!p) return T.camSpan;
  const hi = camHi(world);
  let half = T.camSpan * (rz == null ? Math.sqrt(p.m) : rz);
  if (world.arenaR <= 0) {
    const s = starDist(world);
    if (s) {
      half = Math.max(half, T.orbit.camStar * s.d + s.r); // der Stern soll im Bild bleiben
      // die ganze Ellipse soll zu sehen sein (Apoapsis der gerade geflogenen Bahn), sonst sieht man nach einem Schub nur ein Stueck der Vorschau
      const st = starBody(world);
      const el = elements(st.gm, p.x - st.x, p.y - st.y, p.vx, p.vy);
      const extent = el.bound ? Math.max(el.ra, s.d) : s.d * 1.3;
      half = Math.max(half, T.orbit.camOrbit * extent + 0.5 * s.r);
    }
  }
  for (const b of world.bodies) {
    if (b === p || b.m <= p.m || b.kind === 'attractor') continue;
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d < (world.arenaR > 0 ? T.camBigNear : T.orbit.camBigNear) * half) half = Math.max(half, (d + Math.sqrt(b.m)) * 1.08);
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
    if (world.arenaR <= 0) {
      cam.half = overviewHalf(world); // Auftakt: erst das ganze System (Mitte = Stern), dann faehrt die Kamera auf den Spieler
      cam.x = 0;
      cam.y = 0;
      cam.intro = now + T.orbit.camIntro;
    }
    cam.ready = true;
    return cam;
  }
  // Bezugsradius: waechst der Spieler, folgt der Zoom zuegig (der Koerper soll nicht aus dem Bild wachsen), schrumpft er, nur sehr traege
  const rNow = Math.sqrt(p.m);
  const tau = rNow > cam.rz ? T.camGrowTau : T.camShrinkTau;
  cam.rz += (rNow - cam.rz) * (1 - Math.exp(-dt / tau));
  const kf = 1 - Math.exp(-T.camFollow * dt);
  const holdCenter = cam.intro && now < cam.intro; // Auftakt: Kamera bleibt auf der Systemmitte
  if (!holdCenter) {
    // Kapitel 3: die Kamera schaut ein Stueck zum Stern hin (Spieler und Stern bleiben im Bild, die Bahn ist besser zu lesen)
    let fx = p.x;
    let fy = p.y;
    if (world.arenaR <= 0) {
      const s = starDist(world);
      if (s) {
        fx += T.orbit.camBias * (s.x - p.x);
        fy += T.orbit.camBias * (s.y - p.y);
      }
    }
    cam.x += (fx - cam.x) * kf;
    cam.y += (fy - cam.y) * kf;
  }
  const manual = cam.manualHalf != null && (cam.pinchStartHalf != null || now - cam.manualAt < T.camManualHold);
  let target = manual ? cam.manualHalf : autoHalf(world, cam.rz);
  if (!manual) cam.manualHalf = null;
  target = Math.min(camHi(world), Math.max(T.camMin * 0.6, target));
  const intro = cam.intro && now < cam.intro; // Auftakt: die Uebersicht bleibt kurz stehen und faehrt dann langsam hinein
  const kz = 1 - Math.exp(-(intro ? 0 : T.camZoomRate * (cam.intro && now < cam.intro + 2 ? 0.45 : 1)) * dt);
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
