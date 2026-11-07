import test from 'node:test';
import assert from 'node:assert/strict';
import { T } from '../games/protoplanet/tune.js';
import { createWorld } from '../games/protoplanet/physics.js';
import { createCamera, updateCamera, autoHalf, pinchStart, pinchMove, pinchEnd, worldToScreen, screenToWorld, scaleOf } from '../games/protoplanet/camera.js';

const run = (cam, w, seconds, t0 = 0) => {
  for (let i = 0; i < seconds * 60; i++) updateCamera(cam, w, 1 / 60, t0 + i / 60);
  return t0 + seconds;
};

test('Kamera folgt dem Spieler weich und zoomt automatisch auf camSpan x Radius', () => {
  const w = createWorld({ bodies: [], arenaR: 60, player: { m: 4 } });
  const cam = createCamera();
  updateCamera(cam, w, 0, 0);
  assert.ok(Math.abs(cam.half - T.camSpan * 2) < 1e-9);
  w.player.x = 10;
  updateCamera(cam, w, 1 / 60, 0);
  assert.ok(cam.x > 0 && cam.x < 10, 'zieht nach, springt nicht');
  run(cam, w, 3);
  assert.ok(Math.abs(cam.x - 10) < 0.01);
});

test('Zoom bleibt in camMin/camMax und in der Arena', () => {
  const w = createWorld({ bodies: [], arenaR: 100, player: { m: 0.01 } });
  assert.equal(autoHalf(w), T.camMin);
  w.player.m = 100;
  assert.equal(autoHalf(w), T.camMax);
  const small = createWorld({ bodies: [], arenaR: 8 });
  assert.ok(autoHalf(small) <= 8 * 1.05 + 1e-9);
});

test('ein groesserer Koerper in der Naehe haelt den Zoom offen, bis er im Bild ist', () => {
  const w = createWorld({ bodies: [{ x: 15, y: 0, m: 9 }], arenaR: 60 });
  const half = autoHalf(w);
  assert.ok(half >= 15 + 3, 'Koerper samt Radius sichtbar: ' + half);
  const far = createWorld({ bodies: [{ x: 55, y: 0, m: 9 }], arenaR: 60 });
  assert.equal(autoHalf(far), T.camSpan, 'weit entfernt: keine Wirkung');
});

test('Pinch uebersteuert die Automatik, nach camManualHold kehrt sie zurueck', () => {
  const w = createWorld({ bodies: [], arenaR: 60 });
  const cam = createCamera();
  updateCamera(cam, w, 0, 0);
  const auto = cam.half;
  pinchStart(cam);
  pinchMove(cam, 2, 1); // Finger auseinander = hineinzoomen
  let now = run(cam, w, 2, 1);
  assert.ok(cam.half < auto * 0.6, 'hineingezoomt: ' + cam.half);
  pinchEnd(cam, now);
  now = run(cam, w, T.camManualHold - 1, now);
  assert.ok(cam.half < auto * 0.7, 'haelt noch');
  now = run(cam, w, 6, now);
  assert.ok(Math.abs(cam.half - auto) < 0.2, 'zurueck bei der Automatik: ' + cam.half);
});

test('Weltkoordinaten und Bildschirmkoordinaten sind zueinander invers', () => {
  const cam = createCamera();
  cam.x = 3;
  cam.y = -2;
  cam.half = 10;
  const [sx, sy] = worldToScreen(cam, 390, 844, 5, 1);
  const [wx, wy] = screenToWorld(cam, 390, 844, sx, sy);
  assert.ok(Math.abs(wx - 5) < 1e-9 && Math.abs(wy - 1) < 1e-9);
  assert.deepEqual(worldToScreen(cam, 390, 844, 3, -2), [195, 422]);
});

test('Schrumpfen durch Ausstoss ist sichtbar: der Zoom folgt dem kleiner werdenden Spieler nur traege', () => {
  const w = createWorld({ bodies: [], arenaR: 60, player: { m: 4 } });
  const cam = createCamera();
  updateCamera(cam, w, 0, 0);
  let now = run(cam, w, 3);
  const screenR = () => Math.sqrt(w.player.m) * scaleOf(cam, 390);
  const before = screenR();
  assert.ok(Math.abs(before - 390 / 2 / T.camSpan) < 0.5, 'im Gleichgewicht: Radius = Breite/2/camSpan Pixel');
  w.player.m = 2.8; // grosser Ausstoss (30 % der Masse)
  now = run(cam, w, 1, now);
  assert.ok(screenR() < before * 0.9, `nach 1 s sichtbar kleiner: ${screenR().toFixed(1)} gegen ${before.toFixed(1)}`);
  now = run(cam, w, 3, now);
  assert.ok(screenR() < before * 0.93, 'auch nach 4 s noch kleiner');
  run(cam, w, 40, now);
  assert.ok(Math.abs(screenR() - before) < before * 0.1, 'langfristig gleicht der Zoom sich an');
});

test('Wachsen holt der Zoom zuegig nach, damit der Koerper nicht aus dem Bild waechst', () => {
  const w = createWorld({ bodies: [], arenaR: 100, player: { m: 1 } });
  const cam = createCamera();
  updateCamera(cam, w, 0, 0);
  let now = run(cam, w, 2);
  const before = Math.sqrt(w.player.m) * scaleOf(cam, 390);
  w.player.m = 6;
  now = run(cam, w, 3, now);
  const after = Math.sqrt(w.player.m) * scaleOf(cam, 390);
  assert.ok(after < before * 1.25, `3 s nach dem Wachsen: ${after.toFixed(1)} px gegen ${before.toFixed(1)} px`);
});
