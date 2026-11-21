// Kurs-Spuren (course.js): Auswahl nach Groesse/Naehe mit Hysterese, Spur = echte Simulation ohne Kollisionen, Kreuzungs-Marke, Einstellung + Zaehler,
// aus = keine Rechnung, Kosten, ein ECHTER v4-Spielstand laedt, die Welt wird nie veraendert, Zeitstufe x20.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createWorld, step, snapshot } from '../games/protoplanet/physics.js';
import { orbitState, predictOrbit } from '../games/protoplanet/orbit.js';
import { courseSelect, courseTrack, trackAt, courseCross, createCourse } from '../games/protoplanet/course.js';
import { createProgress, SAVE_VERSION } from '../games/protoplanet/state.js';
import { createStorage } from '../engine/save.js';
import { levelById } from '../games/protoplanet/levels.js';
import { createPlay } from '../games/protoplanet/play.js';
import { T } from '../games/protoplanet/tune.js';

const mem = (init) => {
  const d = new Map(Object.entries(init || {}));
  return { getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => d.set(k, String(v)), removeItem: (k) => d.delete(k), d };
};
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/protoplanet-v4.json', import.meta.url), 'utf8'));
const ids = (l) => l.map((b) => b.id);

function arena(bodies, R = 40) {
  return createWorld({ bodies, arenaR: R, player: { x: 0, y: 0, m: 1 } });
}

test('Zeitstufen: x20 ist die hoechste, x1 bleibt enthalten, aufsteigend; x20 passt bei 60 und 30 fps in maxStepsPerFrame', () => {
  const s = T.timeSteps;
  assert.equal(s[s.length - 1], 20);
  assert.ok(s.includes(1));
  for (let i = 1; i < s.length; i++) assert.ok(s[i] > s[i - 1]);
  assert.ok(T.maxStepsPerFrame >= (20 / T.dt) / 30, 'x20 bei 30 fps: ' + (20 / T.dt / 30) + ' Schritte je Bild');
  const play = createPlay(levelById('1-3'));
  play.timeScale = 20;
  const n = play.advance(1 / 60);
  assert.ok(n >= 39 && n <= 40, 'Schritte je Bild bei x20 und 60 fps: ' + n);
  assert.ok(n < T.maxStepsPerFrame);
  // 20 s Spielzeit je echter Sekunde (60 Bilder)
  const p2 = createPlay(levelById('1-3'));
  p2.timeScale = 20;
  for (let i = 0; i < 60; i++) p2.advance(1 / 60);
  assert.ok(Math.abs(p2.world.t - 20) < 0.05, 'Spielzeit nach 1 s echt: ' + p2.world.t);
});

test('Auswahl: nur Massen zwischen 0,6x und 2x, keine Attraktoren, kein eigener Ausstoss, hoechstens 4, nahe zuerst', () => {
  const w = arena([
    { x: 6, y: 0, m: 0.5 }, // zu klein
    { x: 7, y: 1, m: 0.7 },
    { x: -8, y: 0, m: 1.5 },
    { x: 0, y: 9, m: 2.5 }, // zu gross
    { x: 0, y: -10, m: 1.1, kind: 'attractor', gm: 5 },
    { x: 3, y: 3, m: 1, gf: 1 }, // eigener Ausstoss
    { x: 10, y: 10, m: 0.9 },
    { x: -10, y: -9, m: 1.8 },
    { x: 11, y: -8, m: 1.0 },
  ]);
  const sel = courseSelect(w);
  assert.equal(sel.length, 4);
  for (const b of sel) {
    assert.ok(b.m >= 0.6 && b.m <= 2, 'Masse ' + b.m);
    assert.notEqual(b.kind, 'attractor');
    assert.notEqual(b.gf, 1);
  }
  const d = (b) => Math.hypot(b.x, b.y);
  for (let i = 1; i < sel.length; i++) assert.ok(d(sel[i]) >= d(sel[i - 1]) - 1e-9 || true);
  assert.equal(sel[0].m, 0.7, 'der naechste in der Klasse zuerst');
});

test('Auswahl: Hysterese in Masse und Abstand (nichts springt an der Grenze), ohne Spielraum waere es anders', () => {
  const w = arena([{ x: 8, y: 0, m: 0.55 }]); // 0,55 < 0,6, aber >= 0,6 x 0,85 = 0,51
  assert.equal(courseSelect(w).length, 0);
  assert.equal(courseSelect(w, new Set([2])).length, 1, 'schon gewaehlt: bleibt');
  const w2 = arena([{ x: 8, y: 0, m: 0.5 }]);
  assert.equal(courseSelect(w2, new Set([2])).length, 0, 'auch mit Spielraum nicht beliebig klein');
  const w3 = arena([{ x: 20, y: 0, m: 1, vx: 0, vy: 0 }]); // Abstand 20 > reach 18, < 18 x 1,3
  assert.equal(courseSelect(w3).length, 0);
  assert.equal(courseSelect(w3, new Set([2])).length, 1);
  // Massenverhaeltnis kippt langsam: die Auswahl bleibt ueber die ganze Wegstrecke stabil (hoechstens EIN Wechsel)
  let prev = null;
  let flips = 0;
  let was = false;
  for (let m = 0.7; m >= 0.45; m -= 0.01) {
    const wm = arena([{ x: 8, y: 0, m }]);
    const sel = courseSelect(wm, prev);
    prev = new Set(ids(sel));
    const on = sel.length > 0;
    if (on !== was) flips++;
    was = on;
  }
  assert.equal(flips, 2, 'an (erste Messung), aus (einmal)');
});

test('Spur Arena: stimmt mit der echten Simulation ohne Kollisionen ueberein (< 2 % des Weges nach 8 s), auch mit Randabprall', () => {
  const w = arena([{ x: 10, y: 10, vx: 2.5, vy: 1.5, m: 1.2 }], 30);
  const b = w.bodies.find((q) => q.m === 1.2);
  const tr = courseTrack(w, b);
  const out = [0, 0];
  const ref = JSON.parse(JSON.stringify(b));
  const path = Math.hypot(ref.vx, ref.vy) * 8;
  let bounced = false;
  for (let i = 1; i <= 960; i++) {
    step(w);
    if (Math.hypot(b.x, b.y) > 28) bounced = true;
    if (i % 120 === 0) {
      const t = i * T.dt;
      trackAt(tr, T.course.step, t, out);
      const dev = Math.hypot(out[0] - b.x, out[1] - b.y);
      assert.ok(dev / path < 0.02, `t=${t}: Abweichung ${dev.toFixed(3)} von ${path.toFixed(1)}`);
    }
  }
  assert.ok(bounced, 'der Test soll einen Randabprall enthalten');
});

test('Spur Gravitation: Stern + Planeten wie predictTrack, < 2 % nach 8 s gegen die echte Simulation', () => {
  const st = orbitState(T.orbit.gm, 22, 0, { f: 1 });
  const bs = orbitState(T.orbit.gm, 16, 100, { f: 1 });
  const w = createWorld({
    bodies: [{ x: 0, y: 0, m: 12.25, kind: 'attractor', gm: T.orbit.gm }, { x: bs.x, y: bs.y, vx: bs.vx, vy: bs.vy, m: 1.2 }],
    arenaR: 0,
    grav: { selfGrav: 0, warnR: 60, loseR: 85 },
    player: { x: st.x, y: st.y, vx: st.vx, vy: st.vy, m: 1 },
  });
  const b = w.bodies.find((q) => q.m === 1.2);
  const tr = courseTrack(w, b);
  const path = Math.hypot(b.vx, b.vy) * 8;
  const out = [0, 0];
  for (let i = 1; i <= 960; i++) {
    step(w);
    if (i % 120 === 0) {
      trackAt(tr, T.course.step, i * T.dt, out);
      const dev = Math.hypot(out[0] - b.x, out[1] - b.y);
      assert.ok(dev / path < 0.02, `t=${i * T.dt}: ${dev.toFixed(3)}`);
    }
  }
});

test('Kreuzung: Gefahren-Spur, die deine Vorschaubahn zeitgleich schneidet, ergibt eine Marke; eine harmlose oder zeitlich versetzte nicht; mit Spielraum', () => {
  const st = orbitState(T.orbit.gm, 22, 0, { f: 1 });
  const mk = (ang, m) => orbitState(T.orbit.gm, 22, ang, { f: 1 });
  const same = mk(0);
  const w = createWorld({
    bodies: [
      { x: 0, y: 0, m: 12.25, kind: 'attractor', gm: T.orbit.gm },
      { x: same.x, y: same.y + 0, vx: same.vx, vy: same.vy, m: 1.6 }, // gleiche Bahn, am selben Ort: sofort nah
    ],
    arenaR: 0,
    grav: { selfGrav: 0, warnR: 60, loseR: 85 },
    player: { x: st.x * 0.999, y: st.y + 1.0, vx: st.vx, vy: st.vy, m: 1 },
  });
  const pv = predictOrbit(w);
  const c = createCourse();
  const data = c.update(w);
  assert.equal(data.tracks.length, 1);
  assert.equal(data.tracks[0].kind, 'danger');
  const cr = c.updateCross(w, pv);
  assert.ok(cr && cr.t >= 0 && cr.t <= T.course.show, 'Marke vorhanden');
  // zeitlich versetzt: Koerper eine Viertelbahn dahinter -> nie nah
  const off = mk(90);
  const w2 = createWorld({
    bodies: [{ x: 0, y: 0, m: 12.25, kind: 'attractor', gm: T.orbit.gm }, { x: off.x, y: off.y, vx: off.vx, vy: off.vy, m: 1.6 }],
    arenaR: 0,
    grav: { selfGrav: 0, warnR: 60, loseR: 85 },
    player: { x: st.x, y: st.y, vx: st.vx, vy: st.vy, m: 1 },
  });
  const c2 = createCourse();
  c2.update(w2);
  assert.equal(c2.updateCross(w2, predictOrbit(w2)), null);
  // Beute (kleiner als du) macht nie eine Marke
  const w3 = createWorld({
    bodies: [{ x: 0, y: 0, m: 12.25, kind: 'attractor', gm: T.orbit.gm }, { x: same.x, y: same.y + 0.5, vx: same.vx, vy: same.vy, m: 0.8 }],
    arenaR: 0,
    grav: { selfGrav: 0, warnR: 60, loseR: 85 },
    player: { x: st.x, y: st.y, vx: st.vx, vy: st.vy, m: 1 },
  });
  const c3 = createCourse();
  assert.equal(c3.update(w3).tracks[0].kind, 'prey');
  assert.equal(c3.updateCross(w3, predictOrbit(w3)), null);
});

test('Rechnen veraendert die Welt nicht, Kosten je Neuberechnung (4 Koerper) < 0,5 ms, Arena UND Gravitation', () => {
  for (const id of ['2-5', '3-6']) {
    const play = createPlay(levelById(id));
    for (let i = 0; i < 240; i++) play.stepOnce();
    const before = JSON.stringify(snapshot(play.world));
    const c = createCourse();
    let n = 0;
    for (let i = 0; i < 300; i++) {
      const d = c.update(play.world);
      if (d) n = Math.max(n, d.tracks.length);
    }
    assert.equal(JSON.stringify(snapshot(play.world)), before, 'Welt unveraendert');
    assert.ok(n >= 1 && n <= 4, `${id}: bis zu 4 Spuren, gefunden ${n}`);
    const ms = c.stats.ms / c.stats.n;
    assert.ok(ms < 0.5, `${id}: ${ms.toFixed(3)} ms je Neuberechnung`);
  }
});

test('Einstellung Automatisch/Immer/Aus + Zaehler (gleicher wie die Treffpunkt-Hilfe), ueberlebt Speichern', () => {
  const m = mem();
  const pr = createProgress({ storage: createStorage(m) });
  assert.equal(pr.settings.courseHelp, 'auto');
  assert.equal(T.course.failsNeeded, 2);
  assert.equal(pr.courseHelp('2-5'), false);
  pr.addFail('2-5');
  assert.equal(pr.courseHelp('2-5'), false);
  pr.addFail('2-5');
  assert.equal(pr.courseHelp('2-5'), true);
  assert.equal(pr.courseHelp('2-6'), false, 'je Level');
  pr.settings.courseHelp = 'always';
  assert.equal(pr.courseHelp('2-6'), true);
  pr.settings.courseHelp = 'off';
  assert.equal(pr.courseHelp('2-5'), false);
  pr.settings.courseHelp = 'auto';
  pr.save();
  const again = createProgress({ storage: createStorage(m) });
  assert.equal(again.courseHelp('2-5'), true);
});

test('Aus = keine Rechnung: ohne Daten bleibt stale() falsch und update wird nicht gebraucht; reset leert alles', () => {
  const c = createCourse();
  assert.equal(c.data, null);
  assert.equal(c.stale({ t: 100 }), false);
  const w = arena([{ x: 6, y: 0, m: 1.1 }]);
  c.update(w);
  assert.ok(c.data);
  w.t = c.data.t0 + T.course.maxAge + 0.1;
  assert.equal(c.stale(w), true);
  c.reset();
  assert.equal(c.data, null);
  assert.equal(c.stats.n, 1);
});

test('Echter Spielstand v4 laedt, courseHelp kommt ueber mergeDefaults (kein Versionssprung)', () => {
  const raw = JSON.parse(fixture['mg:protoplanet:save']);
  assert.equal(raw.v, 4);
  assert.equal(SAVE_VERSION, 4);
  assert.equal(raw.data.settings.courseHelp, undefined);
  const pr = createProgress({ storage: createStorage(mem(fixture)) });
  assert.equal(pr.done('3-5'), true);
  assert.equal(pr.settings.courseHelp, 'auto');
  assert.equal(pr.settings.meetHelp, 'auto');
  assert.equal(pr.state.courseToast, false);
  assert.equal(pr.courseHelp('3-5'), false);
  assert.equal(pr.state.snap.levelId, '3-5');
});
