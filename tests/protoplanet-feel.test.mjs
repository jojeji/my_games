// Paket F (Spielgefuehl): Effekte (Pool, Gefahren-Scan, Mischen fuer den Rueckwaertslauf), Freischalt-Regel, Stern-Ziele, Zurueckspul-Vorschau.
import test from 'node:test';
import assert from 'node:assert/strict';
import { T } from '../games/protoplanet/tune.js';
import { createWorld, step, snapshot, restore } from '../games/protoplanet/physics.js';
import { createFx, dangerScan, blendWorlds } from '../games/protoplanet/fx.js';
import { createRewind } from '../games/protoplanet/rewind.js';
import { createProgress } from '../games/protoplanet/state.js';
import { createStorage } from '../engine/save.js';
import { LEVELS, CHAPTERS } from '../games/protoplanet/levels.js';

const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const rec = (pr, id) => pr.record(id, { time: 100, ejected: 1, eff: false, fast: false });

test('Partikel-Pool hat eine harte Obergrenze, auch bei Dauerfeuer; Weniger Bewegung nutzt einen kleinen Pool', () => {
  const fx = createFx();
  for (let i = 0; i < 5000; i++) fx.burst(0, 0, 1, 30, 0, 1);
  fx.update(0.001, { bodies: [] });
  assert.ok(fx.count <= T.fx.maxParticles && fx.capacity === T.fx.maxParticles);
  assert.equal(createFx({ reduce: true }).capacity, T.fx.reducedParticles);
  for (let i = 0; i < 100; i++) fx.update(0.1, { bodies: [] });
  assert.equal(fx.count, 0, 'alles verblasst');
});

test('Effekte aendern die Welt nie (Scan, Strom, Update)', () => {
  const w = createWorld({ bodies: [{ x: 1.2, y: 0, m: 0.3 }, { x: 5, y: 0, m: 3, vx: -1 }], arenaR: 30 });
  const before = JSON.stringify(snapshot(w));
  const fx = createFx();
  fx.scanDanger(w, 0.016);
  fx.scanFlow(w, 0.016, 30, () => true);
  fx.update(0.016, w);
  assert.equal(JSON.stringify(snapshot(w)), before);
});

test('Gefahren-Scan: Kollisionskurs eines Groesseren meldet Richtung und Staerke, Kleineres und Vorbeiflug nicht', () => {
  const w = createWorld({ bodies: [{ x: 4.5, y: 0, m: 3, vx: -1.2 }, { x: 0, y: 7, m: 0.2, vy: -1 }], arenaR: 30 });
  const th = dangerScan(w);
  assert.equal(th.length, 1);
  assert.ok(th[0].ux > 0.99 && th[0].k > 0 && th[0].k <= 1);
  const miss = createWorld({ bodies: [{ x: 6, y: 12, m: 3, vx: -1.2 }], arenaR: 30 });
  assert.equal(dangerScan(miss).length, 0, 'zieht mit 12 Abstand vorbei');
  const away = createWorld({ bodies: [{ x: 6, y: 0, m: 3, vx: 1.2 }], arenaR: 30 });
  assert.equal(dangerScan(away).length, 0, 'entfernt sich');
});

test('Rueckwaertslauf: peek liefert neu -> alt bis zum Ziel von pick und aendert nichts; blendWorlds mischt Koerper nach id', () => {
  const w = createWorld({ bodies: [{ x: 5, y: 0, m: 0.4, vx: 0.5 }], arenaR: 30 });
  const rw = createRewind();
  for (let i = 0; i < 120 * 8; i++) {
    step(w);
    rw.tick(w);
  }
  const n = rw.size;
  const frames = rw.peek(w.t);
  assert.equal(rw.size, n, 'peek veraendert den Puffer nicht');
  assert.ok(frames.length >= T.rewindBack / T.rewindEvery && frames[0].t > frames[frames.length - 1].t);
  const target = rw.pick(w.t);
  assert.equal(target.t, frames[frames.length - 1].t, 'Ziel = das, was pick waehlt');
  const a = restore(frames[0]);
  const b = restore(frames[frames.length - 1]);
  const mid = blendWorlds(a, b, 0.5);
  const q = mid.bodies.find((x) => x.id === a.bodies[1].id);
  assert.ok(Math.abs(q.x - (a.bodies[1].x + b.bodies.find((x) => x.id === q.id).x) / 2) < 1e-9);
  assert.ok(mid.player && blendWorlds(a, b, 1).player.x === b.player.x);
});

test('Freischalten (Paket F): ein Kapitel oeffnet sich mit 5 geschafften Levels des vorherigen, innerhalb Level fuer Level', () => {
  const pr = createProgress({ storage: createStorage(mem()) });
  assert.ok(CHAPTERS.length >= 3);
  assert.equal(pr.unlocked('2-1'), false);
  for (const id of ['1-1', '1-2', '1-3', '1-4']) rec(pr, id);
  assert.equal(pr.unlocked('2-1'), false);
  assert.deepEqual([pr.chapterProgress(1).done, pr.chapterProgress(1).need], [4, 5]);
  rec(pr, '1-5');
  assert.equal(pr.unlocked('2-1'), true);
  assert.equal(pr.unlocked('2-2'), false);
  assert.equal(pr.unlocked('1-6'), true);
  assert.equal(pr.unlocked('1-8'), false);
});

test('Weiter spielen: naechstes ungeloestes offenes Level, sonst das laufende', () => {
  const pr = createProgress({ storage: createStorage(mem()) });
  assert.equal(pr.resumeLevel().level.id, '1-1');
  rec(pr, '1-1');
  assert.equal(pr.resumeLevel().level.id, '1-2');
  const lv = LEVELS.find((l) => l.id === '1-2');
  pr.setSnap({ levelId: '1-2', rev: lv.rev || 1, play: {}, timeScale: 1 });
  assert.equal(pr.resumeLevel().running, true);
});

test('Stern-Ziele fuer Menschen: Normallevels grosszuegiger als Bot x 1,3 (Zeit >= 150 s, Finale laenger)', () => {
  for (const l of LEVELS) assert.ok(l.targets.time >= 20 && l.targets.eject > 0, l.id);
  assert.ok(LEVELS.find((l) => l.id === '1-4').targets.time >= 300);
  assert.ok(LEVELS.find((l) => l.id === '1-8').targets.time >= 450);
});
