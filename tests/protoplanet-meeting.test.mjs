// Protoplanet: TREFFPUNKT in der Bahnvorschau (orbit.js predictMeeting / predictTrack), Ziel `absorb` in Gravitationslevels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../games/protoplanet/physics.js';
import { orbitState, predictOrbit, predictMeeting, predictTrack } from '../games/protoplanet/orbit.js';
import { createPlay } from '../games/protoplanet/play.js';
import { levelById } from '../games/protoplanet/levels.js';
import { T } from '../games/protoplanet/tune.js';

const GM = T.orbit.gm;
const mk = ({ rp = 14, fp = 1, target, mt = 0.5 }) => {
  const s = orbitState(GM, rp, 0, { f: fp });
  const t = orbitState(GM, target.r, target.ang, target);
  return createWorld({
    bodies: [{ x: 0, y: 0, m: 12.25, kind: 'attractor', gm: GM }, { x: t.x, y: t.y, vx: t.vx, vy: t.vy, m: mt, kind: 'mote', tag: 'target' }],
    arenaR: 0,
    grav: { selfGrav: 0, warnR: 60, loseR: 85 },
    player: { x: s.x, y: s.y, vx: s.vx, vy: s.vy, m: 1 },
  });
};
const tgt = (w) => w.bodies.find((b) => b.tag === 'target');

test('Treffpunkt: Zeitpunkt und Orte stimmen mit der echten Simulation ueberein (ohne andere Koerper), Abweichung < 2 %', () => {
  for (const [rp, fp, target] of [[14, 1, { r: 18, ang: 70 }], [14, 0.9, { r: 20, ang: 150, f: 0.92 }], [16, 1.05, { r: 12, ang: 200 }]]) {
    const w = mk({ rp, fp, target });
    const pv = predictOrbit(w);
    const m = predictMeeting(w, pv, tgt(w));
    assert.ok(m, 'Treffpunkt gefunden');
    // echte Simulation an den Zeitpunkten der Vorschau bis kurz vor dem Treffpunkt (danach waere der Koerper absorbiert): Spieler UND Ziel liegen dort, wo die Vorhersage sie hinlegt
    const tr = predictTrack(w, tgt(w), pv.t);
    let t = 0;
    let worst = 0;
    let worstT = 0;
    for (let i = 0; i < pv.n && pv.t[i] <= m.t; i++) {
      while (t < pv.t[i] - 1e-9) {
        step(w);
        t += T.dt;
      }
      if (!tgt(w) || !w.player) break;
      worst = Math.max(worst, Math.hypot(w.player.x - pv.pts[2 * i], w.player.y - pv.pts[2 * i + 1]));
      worstT = Math.max(worstT, Math.hypot(tgt(w).x - tr[2 * i], tgt(w).y - tr[2 * i + 1]));
    }
    const tol = 0.02 * Math.max(rp, target.r);
    assert.ok(worst < tol, `Spieler: groesste Abweichung ${worst.toFixed(3)} > ${tol.toFixed(3)}`);
    assert.ok(worstT < tol, `Ziel: groesste Abweichung ${worstT.toFixed(3)} > ${tol.toFixed(3)}`);
    // Abstand und Zeitpunkt des Treffpunkts selbst: der echte kleinste Abstand (alle Schritte) liegt nahe dem vorhergesagten
    const w2 = mk({ rp, fp, target, mt: 0.02 });
    w2.bodies.find((b) => b.tag === 'target').m = 1e-9; // praktisch masselos: laeuft ohne Absorption durch
    let best = Infinity;
    let bestAt = 0;
    for (let i = 0, n = Math.round((pv.t[pv.n - 1] + 0.1) / T.dt); i < n; i++) {
      step(w2);
      const q = tgt(w2);
      if (!q) break;
      const d = Math.hypot(w2.player.x - q.x, w2.player.y - q.y);
      if (d < best) {
        best = d;
        bestAt = (i + 1) * T.dt;
      }
    }
    assert.ok(Math.abs(best - m.d) < 0.04 * Math.max(rp, target.r), `kleinster Abstand ${best.toFixed(2)} vs ${m.d.toFixed(2)}`);
    assert.ok(Math.abs(bestAt - m.t) < 0.06 * (pv.t[pv.n - 1] - 0) || Math.abs(best - m.d) < 0.5, `Zeitpunkt ${bestAt.toFixed(1)} vs ${m.t.toFixed(1)}`);
  }
});

test('Treffpunkt: zwei Koerper auf sich kreuzenden Bahnen treffen sich -> hit, sonst nicht', () => {
  // Rueckwaerts gerechnet: das Ziel wird in t* an den Ort des Spielers gesetzt (Geschwindigkeit anders), dann Zeit umgekehrt
  const tStar = 20;
  const w0 = mk({ target: { r: 18, ang: 0 } });
  const w1 = mk({ target: { r: 18, ang: 0 } });
  for (let i = 0, n = Math.round(tStar / T.dt); i < n; i++) step(w1);
  const s = w1.player;
  const sp = Math.hypot(s.vx, s.vy);
  const a = 0.6; // anderer Flugwinkel
  const vx = -(Math.cos(a) * s.vx - Math.sin(a) * s.vy) * 0.95;
  const vy = -(Math.sin(a) * s.vx + Math.cos(a) * s.vy) * 0.95;
  assert.ok(sp > 0);
  const back = createWorld({ bodies: [{ x: 0, y: 0, m: 12.25, kind: 'attractor', gm: GM }, { x: s.x + 0.2, y: s.y - 0.1, vx, vy, m: 0.5, kind: 'mote', tag: 'target' }], arenaR: 0, grav: { selfGrav: 0, warnR: 400, loseR: 900 }, player: { x: 200, y: 0, vx: 0, vy: 0, m: 1 } });
  for (let i = 0, n = Math.round(tStar / T.dt); i < n; i++) step(back);
  const b = tgt(back);
  const w = createWorld({ bodies: [{ x: 0, y: 0, m: 12.25, kind: 'attractor', gm: GM }, { x: b.x, y: b.y, vx: -b.vx, vy: -b.vy, m: 0.5, kind: 'mote', tag: 'target' }], arenaR: 0, grav: { selfGrav: 0, warnR: 60, loseR: 85 }, player: { x: w0.player.x, y: w0.player.y, vx: w0.player.vx, vy: w0.player.vy, m: 1 } });
  const m = predictMeeting(w, predictOrbit(w), tgt(w));
  assert.ok(m.hit, `Treffer erwartet, Abstand ${m.d.toFixed(2)} (Radiensumme ${m.rsum.toFixed(2)})`);
  assert.ok(Math.abs(m.t - tStar) < 1.5, `Zeitpunkt ${m.t.toFixed(1)} s statt ~${tStar}`);
  // und die echte Simulation bestaetigt es: sie beruehren sich in der Naehe von t*
  let best = Infinity;
  for (let i = 0, n = Math.round((tStar + 3) / T.dt); i < n; i++) {
    step(w);
    if (!w.player || !tgt(w)) break;
    best = Math.min(best, Math.hypot(w.player.x - tgt(w).x, w.player.y - tgt(w).y));
  }
  assert.ok(best < 1.5 || !w.player || w.bodies.every((x) => x.tag !== 'target'), `echter kleinster Abstand ${best.toFixed(2)}`);
  // Kontrolle: Ziel auf einer fernen Kreisbahn trifft nie -> kein hit, Abstand sichtbar
  const far = mk({ target: { r: 30, ang: 100 } });
  const mf = predictMeeting(far, predictOrbit(far), tgt(far));
  assert.ok(mf && !mf.hit && mf.d > 10);
});

test('Treffpunkt: "bigger" und Ruhe (kein Springen) bei kleinen Aenderungen der Bahn, Kosten unter 0,3 ms', () => {
  const w = mk({ target: { r: 18, ang: 60 }, mt: 1.5 });
  const pv = predictOrbit(w);
  assert.equal(predictMeeting(w, pv, tgt(w)).bigger, false, 'Ziel schwerer als der Spieler');
  w.player.m = 2;
  assert.equal(predictMeeting(w, pv, tgt(w)).bigger, true);
  // Neuberechnung nach jedem Bild ohne Schub: der Treffpunkt wandert nur mit der Zeit (Weltzeit konstant +-0,3 s)
  let prev = null;
  let jump = 0;
  for (let k = 0; k < 40; k++) {
    for (let i = 0; i < 12; i++) step(w);
    const m = predictMeeting(w, predictOrbit(w), tgt(w), { prefer: prev });
    const abs = w.t + m.t;
    if (prev != null) jump = Math.max(jump, Math.abs(abs - prev));
    prev = abs;
  }
  assert.ok(jump < 1.5, `Zeitpunkt springt um ${jump.toFixed(2)} s`);
  const pv2 = predictOrbit(w);
  const t0 = performance.now();
  for (let i = 0; i < 300; i++) predictMeeting(w, pv2, tgt(w));
  const ms = (performance.now() - t0) / 300;
  assert.ok(ms < 0.3, `Treffpunkt ${ms.toFixed(3)} ms`);
  assert.equal(predictMeeting(w, pv2, null), null);
  assert.equal(predictTrack(w, tgt(w), [0, 1, 2]).length, 6);
});

test('Treffpunkt im Spiel: 3-3 (Funke) und 5-5 haben einen Treffpunkt, Levels mit anderen Zielen brauchen ihn nicht', () => {
  for (const id of ['3-3', '5-5']) {
    const lv = levelById(id);
    const play = createPlay(lv);
    assert.equal(play.goal.type, 'absorb');
    const w = play.world;
    const tg = w.bodies.find((b) => b.tag === 'target');
    assert.ok(tg, id + ' hat ein Ziel');
    const pv = predictOrbit(w);
    const m = predictMeeting(w, pv, tg);
    assert.ok(m && m.d >= 0 && m.t >= 0, id);
  }
});

test('3-5 Kometen (rev 2): Ziel auf der Nachbarspur r 20 (Kreisbahn, leichter), hoechstens ein Koerper schwerer als das Ziel und weit draussen, Kometen nie schwerer als der Spieler', async () => {
  const { buildLevel } = await import('../games/protoplanet/gen.js');
  const { elements } = await import('../games/protoplanet/orbit.js');
  const lv = levelById('3-5');
  assert.equal(lv.rev, 2);
  assert.ok(lv.hint && lv.hint.text && lv.hint.textAim, 'Bedienhilfe fuer beide Steuerungen');
  for (let seed = 1000; seed < 1030; seed++) {
    const b = buildLevel({ ...lv, seed });
    const tg = b.bodies.find((x) => x.tag === 'target');
    const el = elements(GM, tg.x, tg.y, tg.vx, tg.vy);
    assert.ok(tg.m >= 1.5 && tg.m <= 1.8, `Ziel ${tg.m}`);
    assert.ok(el.e < 0.01 && Math.abs(el.a - 20) < 1.2, `Ziel kreist nicht auf Spur 20 (e ${el.e.toFixed(3)}, a ${el.a.toFixed(1)})`);
    const ang = ((Math.atan2(tg.y, tg.x) * 180) / Math.PI + 360) % 360;
    assert.ok(ang >= 59 && ang <= 131, `Ziel liegt ein Stueck VOR dem Spieler (${ang.toFixed(0)} Grad)`);
    const heavier = b.bodies.filter((x) => x.kind !== 'attractor' && x !== tg && x.m > tg.m);
    assert.ok(heavier.length <= 1, `${heavier.length} schwerere Koerper`);
    for (const x of heavier) assert.ok(Math.hypot(x.x, x.y) >= 24, 'der Schwere liegt weit draussen');
    assert.ok(b.bodies.filter((x) => x.kind !== 'attractor' && x !== tg && x.m > 1.0).length <= 1, 'ausser dem Schweren ist nichts groesser als der Spieler beim Start');
    for (const c of b.bodies.filter((x) => x.comet)) assert.ok(c.m <= 1, `Komet ${c.m} schwerer als der Spieler beim Start`);
  }
});

test('3-5 Kometen (rev 2): das Ziel wird ohne Zutun fast nie weggefressen (300 s, 40 Seeds)', () => {
  const lv = levelById('3-5');
  let gone = 0;
  for (let seed = 7000; seed < 7040; seed++) {
    const play = createPlay({ ...lv, seed });
    const w = play.world;
    const t0 = w.bodies.find((b) => b.tag === 'target');
    for (let s = 0, n = Math.round(300 / T.dt); s < n; s++) {
      step(w);
      if (!w.player) break;
      if (t0.m <= 0) {
        gone++;
        break;
      }
    }
  }
  assert.ok(gone <= 1, `${gone} von 40 Zielen wurden gefressen`);
});
