import test from 'node:test';
import assert from 'node:assert/strict';
import { T } from '../games/protoplanet/tune.js';
import { createWorld } from '../games/protoplanet/physics.js';
import { createCamera, updateCamera, autoHalf, introCamera, startPose, overviewHalf, pinchStart, pinchMove, pinchEnd, worldToScreen, screenToWorld, scaleOf } from '../games/protoplanet/camera.js';

const run = (cam, w, seconds, t0 = 0) => {
  for (let i = 0; i < seconds * 60; i++) updateCamera(cam, w, 1 / 60, t0 + i / 60);
  return t0 + seconds;
};

test('Kamera folgt dem Spieler weich und zoomt automatisch auf camSpan x Radius', () => {
  const w = createWorld({ bodies: [], arenaR: 60, player: { m: 4 } });
  const cam = createCamera();
  updateCamera(cam, w, 0, 0);
  assert.ok(Math.abs(cam.half - T.camSpan * Math.pow(2, T.camExp)) < 1e-9);
  w.player.x = 10;
  updateCamera(cam, w, 1 / 60, 0);
  assert.ok(cam.x > 0 && cam.x < 10, 'zieht nach, springt nicht');
  run(cam, w, 3);
  assert.ok(Math.abs(cam.x - 10) < 0.01);
});

test('Zoom bleibt in camMin/camMax und in der Arena', () => {
  const w = createWorld({ bodies: [], arenaR: 100, player: { m: 0.01 } });
  assert.equal(autoHalf(w), T.camMin);
  w.player.m = 1e5;
  assert.equal(autoHalf(w), T.camMax);
  const small = createWorld({ bodies: [], arenaR: 8 });
  assert.ok(autoHalf(small) <= 8 * 1.05 + 1e-9);
});

test('Paket F: in den Arena-Kapiteln zoomt ein groesserer Koerper die Kamera NICHT heraus (Randpfeile statt Herauszoomen)', () => {
  const w = createWorld({ bodies: [{ x: 15, y: 0, m: 9 }], arenaR: 60 });
  assert.equal(autoHalf(w), T.camSpan, 'Zoom unveraendert, obwohl ein Riese in der Naehe ist');
  const near = createWorld({ bodies: [{ x: 4, y: 0, m: 30 }], arenaR: 60 });
  assert.equal(autoHalf(near), T.camSpan);
});

test('Paket F: Nahbereich am Anfang, die Verwandlung bleibt sichtbar (Koerper waechst auf dem Bildschirm, die Welt wird kleiner)', () => {
  const w = createWorld({ bodies: [], arenaR: 60 });
  const cam = createCamera();
  updateCamera(cam, w, 0, 0);
  const px = () => Math.sqrt(w.player.m) * scaleOf(cam, 390);
  assert.ok((2 * px()) / 390 >= 0.14, `Spieler fuellt am Anfang >= 14 % der Breite: ${((2 * px()) / 390).toFixed(3)}`);
  const half0 = cam.half;
  const r0 = px();
  w.player.m = 20;
  run(cam, w, 12);
  assert.ok(px() > r0 * 1.25, `auf dem Bildschirm groesser geworden: ${px().toFixed(1)} gegen ${r0.toFixed(1)} px`);
  assert.ok(cam.half > half0 * 2.2, 'die Kamera ist sichtbar herausgefahren: ' + cam.half);
  assert.ok((2 * px()) / 390 < 0.5, 'ohne aus dem Bild zu wachsen');
});

test('Paket F: Auftakt-Kamera: Uebersicht zeigt die ganze Arena, die Fahrt endet in der Startpose', () => {
  const w = createWorld({ bodies: [{ x: 30, y: 10, m: 2 }], arenaR: 44 });
  w.player.x = -20;
  w.player.y = 5;
  const cam = createCamera();
  introCamera(cam, w, 0);
  assert.equal(cam.x, 0);
  assert.ok(cam.half >= 44, 'ganze Arena sichtbar: ' + cam.half);
  assert.ok(overviewHalf(w) >= 44);
  const mid = introCamera(createCamera(), w, 0.5);
  assert.ok(mid.half < cam.half && mid.half > startPose(w).half && mid.x < 0 && mid.x > -20, 'dazwischen');
  introCamera(cam, w, 1);
  const sp = startPose(w);
  assert.ok(Math.abs(cam.x - sp.x) < 1e-9 && Math.abs(cam.y - sp.y) < 1e-9 && Math.abs(cam.half - sp.half) < 1e-9);
  assert.ok(cam.ready, 'danach uebernimmt updateCamera ohne Sprung');
  const before = { x: cam.x, half: cam.half };
  updateCamera(cam, w, 1 / 60, 0);
  assert.ok(Math.abs(cam.x - before.x) < 1e-6 && Math.abs(cam.half - before.half) < 0.05);
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
  assert.ok(Math.abs(before - (2 * 390 / 2) / (T.camSpan * Math.pow(2, T.camExp))) < 0.5, 'im Gleichgewicht: Radius = r x Breite/2/(camSpan x r^camExp) Pixel');
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
  assert.ok(after > before, 'der Koerper waechst auf dem Bildschirm (Verwandlung sichtbar)');
  assert.ok(after < before * 1.6 && 2 * after < 390 * 0.4, `3 s nach dem Wachsen nicht aus dem Bild: ${after.toFixed(1)} px gegen ${before.toFixed(1)} px`);
});
