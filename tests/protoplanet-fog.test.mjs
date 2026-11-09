// Protoplanet Kapitel 4 "Dunkelwolke": Sichtradius, Einblenden am Rand, Glimmen, Hinweise, Auftakt ohne Uebersicht, Kapitel-Struktur.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fogOf, fogRadius, fogAlpha, fogGlimmers, fogHints, fogIntro } from '../games/protoplanet/fog.js';
import { LEVELS, levelsOf, CHAPTERS } from '../games/protoplanet/levels.js';
import { createPlay } from '../games/protoplanet/play.js';
import { introCamera, startPose, createCamera } from '../games/protoplanet/camera.js';
import { createProgress } from '../games/protoplanet/state.js';
import { createWorld, step } from '../games/protoplanet/physics.js';
import { T } from '../games/protoplanet/tune.js';
import { createStorage } from '../engine/save.js';

const world = (bodies) => createWorld({ bodies, arenaR: 40 });
const mote = (x, y, m, vx = 0, vy = 0, extra = {}) => ({ x, y, m, vx, vy, kind: 'mote', ...extra });

test('Sichtradius waechst mit der Groesse (wie die Kamera) und ist rein aus der Masse berechnet', () => {
  const r1 = fogRadius(1);
  assert.ok(Math.abs(r1 - T.fog.r0) < 1e-9);
  assert.ok(fogRadius(4) > r1 * 1.5);
  assert.ok(fogRadius(16) > fogRadius(4));
  assert.equal(fogRadius(2.5), fogRadius(2.5));
  // gleiches Verhaeltnis zur Kamera: sichtbare halbe Breite = camSpan x r^camExp
  for (const m of [1, 4, 9, 25]) assert.ok(Math.abs(fogRadius(m) / (T.camSpan * Math.pow(Math.sqrt(m), T.camExp)) - T.fog.r0 / T.camSpan) < 1e-9);
});

test('Einblenden am Rand: voll innen, null aussen, weich dazwischen, monoton', () => {
  const R = 10;
  assert.equal(fogAlpha(3, 0.5, R), 1);
  assert.equal(fogAlpha(11, 0.5, R), 0);
  let last = 1;
  for (let d = 5; d <= 11; d += 0.25) {
    const a = fogAlpha(d, 0.5, R);
    assert.ok(a <= last + 1e-12, 'monoton fallend');
    last = a;
  }
  assert.ok(fogAlpha(R - 0.5 * R * T.fog.softIn + 0.5, 0.5, R) > 0 && fogAlpha(R - 0.5 * R * T.fog.softIn + 0.5, 0.5, R) < 1);
  // ein grosser Koerper wird frueher sichtbar (seine Kante zaehlt)
  assert.ok(fogAlpha(12, 4, R) > fogAlpha(12, 0.3, R));
});

test('Glimmen: nur Groessere und nur ausserhalb des Sichtkreises, naeher = staerker, groesser = staerker, nahende staerker', () => {
  const w0 = world([]);
  const R = fogRadius(1);
  const mk = (bodies) => {
    const w = world(bodies);
    return fogGlimmers(w, R, []);
  };
  assert.equal(mk([mote(R + 3, 0, 0.5)]).length, 0, 'Kleinere glimmen nie');
  assert.equal(mk([mote(R * 3, 0, 3)]).length, 0, 'zu weit weg');
  assert.equal(mk([mote(R * 0.5, 0, 3)]).length, 0, 'schon sichtbar: kein Glimmen');
  const near = mk([mote(R + 2, 0, 3)])[0];
  const far = mk([mote(R + 4, 0, 3)])[0];
  assert.ok(near && far && near.k > far.k, `naeher staerker (${near && near.k} > ${far && far.k})`);
  const big = mk([mote(R + 3, 0, 6)])[0];
  const small = mk([mote(R + 3, 0, 1.5)])[0];
  assert.ok(big.k > small.k, 'groesser staerker');
  const coming = mk([mote(R + 3, 0, 3, -0.4, 0)])[0];
  const leaving = mk([mote(R + 3, 0, 3, 0.4, 0)])[0];
  assert.ok(coming.k > leaving.k * 1.4, 'Nahende verraten sich staerker');
  // Richtung zeigt zum Koerper
  const left = mk([mote(-(R + 2), 0, 3)])[0];
  assert.ok(left.ux < -0.99 && Math.abs(left.uy) < 1e-9);
  // hoechstens glimMax, staerkste zuerst
  const many = mk(Array.from({ length: 9 }, (_, i) => mote(Math.cos(i) * (R + 2 + i * 0.3), Math.sin(i) * (R + 2 + i * 0.3), 3)));
  assert.ok(many.length <= T.fog.glimMax);
  for (let i = 1; i < many.length; i++) assert.ok(many[i - 1].k >= many[i].k);
  assert.ok(w0.player);
});

test('Hinweise: Zielkoerper bei absorb, bei last erst ab hoechstens 3 uebrigen Koerpern', () => {
  const w = world([mote(8, 0, 0.4, 0, 0, { tag: 'target' }), mote(-9, 2, 0.3)]);
  assert.equal(fogHints(w, { type: 'absorb' }).size, 1);
  assert.equal(fogHints(w, { type: 'mass', value: 3 }).size, 0);
  assert.equal(fogHints(w, { type: 'last' }).size, 2);
  const many = world(Array.from({ length: 5 }, (_, i) => mote(5 + i * 2, 1, 0.3)));
  assert.equal(fogHints(many, { type: 'last' }).size, 0);
  // Staub und eigener Ausstoss zaehlen nicht
  const dusty = world([mote(5, 0, 0.0001), mote(6, 2, 0.3)]);
  assert.equal(fogHints(dusty, { type: 'last' }).size, 1);
});

test('Auftakt im Nebel: keine Uebersicht der Welt, Fahrt beginnt beim Spieler, Sichtkreis waechst aus der Dunkelheit', () => {
  const lv = LEVELS.find((l) => l.id === '4-2');
  const play = createPlay(lv);
  const cam = createCamera();
  introCamera(cam, play.world, 0, true);
  const p = play.world.player;
  assert.ok(Math.hypot(cam.x - p.x, cam.y - p.y) < 1e-9, 'Kamera startet auf dem Spieler');
  assert.ok(cam.half > startPose(play.world).half && cam.half < startPose(play.world).half * T.fog.introZoom + 1e-6);
  introCamera(cam, play.world, 1, true);
  assert.ok(Math.abs(cam.half - startPose(play.world).half) < 1e-6);
  assert.ok(fogIntro(0) < 0.3 && Math.abs(fogIntro(1) - 1) < 1e-9);
  assert.ok(fogIntro(0.5) > fogIntro(0.2));
  // ohne Nebel bleibt die Uebersicht (Welt-Mitte)
  const c2 = createCamera();
  introCamera(c2, play.world, 0, false);
  assert.ok(Math.hypot(c2.x, c2.y) < 1e-9);
});

test('Kapitel 4: 8 Levels, alle mit Nebel, gemischte Ziele, eindeutige Namen, Stimmung vorhanden', () => {
  const lv = levelsOf(4);
  assert.equal(lv.length, 8);
  assert.ok(CHAPTERS.some((c) => c.id === 4));
  for (const l of lv) {
    assert.ok(fogOf(l), `${l.id} hat Nebel`);
    assert.ok(l.targets && l.targets.eject > 0 && l.targets.time > 0);
  }
  assert.ok(new Set(lv.map((l) => l.goal.type)).size >= 4, 'Ziele gemischt');
  assert.equal(new Set(LEVELS.map((l) => l.title)).size, LEVELS.length, 'Namen eindeutig');
  assert.ok(T.audio.moods[4]);
  assert.equal(fogOf(LEVELS.find((l) => l.id === '1-1')), null);
});

test('Kapitel 4 oeffnet sich mit 5 geschafften Levels in Kapitel 3', () => {
  const d = new Map();
  const pr = createProgress({ storage: createStorage({ getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => d.set(k, String(v)), removeItem: (k) => d.delete(k) }) });
  assert.equal(pr.unlocked('4-1'), false);
  for (const id of ['3-1', '3-2', '3-3', '3-4']) pr.record(id, { time: 100, ejected: 1, eff: false, fast: false });
  assert.equal(pr.unlocked('4-1'), false);
  pr.record('3-5', { time: 100, ejected: 1, eff: false, fast: false });
  assert.equal(pr.unlocked('4-1'), true);
  assert.equal(pr.unlocked('4-2'), false);
});

test('Physik unveraendert durch den Nebel: dasselbe Level mit und ohne fog-Flag laeuft byte-gleich', () => {
  const lv = LEVELS.find((l) => l.id === '4-2');
  const a = createPlay(lv);
  const b = createPlay({ ...lv, fog: false });
  for (let i = 0; i < 600; i++) {
    step(a.world);
    step(b.world);
  }
  assert.equal(JSON.stringify(a.world.bodies), JSON.stringify(b.world.bodies));
});
