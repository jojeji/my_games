// Protoplanet Kapitel 3 "Protostern" (Paket B): Gravitation, Attraktor, offener Raum, Bahnvorschau, Anziehung unter den Koerpern, Schnappschuesse, Familie `orbit`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addBody, step, eject, snapshot, restore, circularSpeed } from '../games/protoplanet/physics.js';
import { orbitState, elements, predictOrbit, driftState } from '../games/protoplanet/orbit.js';
import { createPlay } from '../games/protoplanet/play.js';
import { createRewind } from '../games/protoplanet/rewind.js';
import { generate, buildLevel, checkRulesOrbit } from '../games/protoplanet/gen.js';
import { LEVELS, CHAPTERS, levelById, levelsOf } from '../games/protoplanet/levels.js';
import { goalStatus, lastRemaining } from '../games/protoplanet/goals.js';
import { autoHalf, createCamera, updateCamera, overviewHalf, introCamera, startPose } from '../games/protoplanet/camera.js';
import { dangerOf } from '../games/protoplanet/audio-score.js';
import { T } from '../games/protoplanet/tune.js';
import { createProgress } from '../games/protoplanet/state.js';
import { createSaveStore, createStorage } from '../engine/save.js';

const mem = () => {
  const d = new Map();
  return { getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => d.set(k, String(v)), removeItem: (k) => d.delete(k) };
};

const GM = T.orbit.gm;

/** Welt mit Stern (m = 12,25, r = 3,5) in der Mitte und dem Spieler auf einer Kreisbahn mit Radius r; extra = weitere Koerper. */
function orbitWorld({ r = 14, f = 1, grav = {}, extra = [], gm = GM } = {}) {
  const s = orbitState(gm, r, 0, { f });
  return createWorld({
    bodies: [{ x: 0, y: 0, m: 12.25, kind: 'attractor', gm }, ...extra],
    arenaR: 0,
    grav: { selfGrav: 0, warnR: 60, loseR: 85, ...grav },
    player: { x: s.x, y: s.y, vx: s.vx, vy: s.vy, m: 1 },
  });
}
const run = (w, seconds) => {
  for (let i = 0, n = Math.round(seconds / T.dt); i < n; i++) step(w);
};
const dist = (b) => Math.hypot(b.x, b.y);

test('Kreisbahn bleibt ueber 50 Umlaeufe stabil: Radius und Energie driften um weniger als 1 %', () => {
  for (const r of [8, 14, 30]) {
    const w = orbitWorld({ r });
    const p = w.player;
    const energy = () => 0.5 * (p.vx * p.vx + p.vy * p.vy) - GM / Math.sqrt(p.x * p.x + p.y * p.y + T.orbit.soft ** 2);
    const e0 = energy();
    const period = 2 * Math.PI * Math.sqrt(r ** 3 / GM);
    let rmin = Infinity;
    let rmax = 0;
    for (let i = 0, n = Math.round((50 * period) / T.dt); i < n; i++) {
      step(w);
      const d = dist(p);
      if (d < rmin) rmin = d;
      if (d > rmax) rmax = d;
    }
    assert.ok(rmin > r * 0.99 && rmax < r * 1.01, `r=${r}: Radius ${rmin.toFixed(3)}..${rmax.toFixed(3)}`);
    assert.ok(Math.abs((energy() - e0) / e0) < 0.01, `r=${r}: Energie ${energy()} vs ${e0}`);
  }
});

test('Ellipse: eine exzentrische Bahn bleibt gebunden und bewahrt Periapsis und Apoapsis (Drift < 1 %)', () => {
  const w = orbitWorld({ r: 16, f: 0.8 }); // Start im Apoapsis
  const el = elements(GM, w.player.x, w.player.y, w.player.vx, w.player.vy);
  assert.ok(el.bound && el.rp > 6 && el.ra > 15.5 && el.ra < 16.5, `rp ${el.rp} ra ${el.ra}`);
  let rmin = Infinity;
  for (let i = 0, n = Math.round((30 * el.period) / T.dt); i < n; i++) {
    step(w);
    rmin = Math.min(rmin, dist(w.player));
  }
  assert.ok(Math.abs(rmin - el.rp) / el.rp < 0.01, `Periapsis ${rmin.toFixed(3)} statt ${el.rp.toFixed(3)}`);
});

test('Gravitation: Beschleunigung gm / (d^2 + soft^2) zum Stern, der Stern selbst steht still', () => {
  const w = createWorld({ bodies: [{ x: 0, y: 0, m: 12.25, kind: 'attractor', gm: GM }, { x: 10, y: 0, m: 0.3, kind: 'mote' }], arenaR: 0, grav: { selfGrav: 0 }, player: { x: -20, y: 5, m: 1 } });
  const b = w.bodies.find((x) => x.kind === 'mote');
  step(w);
  const a = (-b.vx) / T.dt;
  assert.ok(Math.abs(a - GM / (100 + T.orbit.soft ** 2)) < 1e-9, `a = ${a}`);
  const p = w.player;
  const dd = Math.hypot(20, 5);
  assert.ok(Math.abs(Math.hypot(p.vx, p.vy) / T.dt - GM / (dd * dd + T.orbit.soft ** 2)) < 1e-6);
  run(w, 5);
  const star = w.bodies.find((x) => x.kind === 'attractor');
  assert.equal(star.x, 0);
  assert.equal(star.vx, 0);
});

test('Ausstoss in der Gravitation: Impuls und Masse bleiben erhalten, Kursaenderung wie die Raketengleichung', () => {
  const w = orbitWorld();
  const p = w.player;
  const m0 = p.m;
  const v0 = Math.hypot(p.vx, p.vy);
  const q = eject(w, -p.vx, -p.vy, 0.05); // Teilchen nach hinten: der Spieler wird schneller (Bahn steigt)
  assert.ok(q);
  assert.ok(Math.abs(p.m + q.m - m0) < 1e-12);
  const px = p.m * p.vx + q.m * q.vx;
  assert.ok(Math.abs(px - m0 * orbitState(GM, 14, 0).vx) < 1e-9);
  assert.ok(Math.hypot(p.vx, p.vy) > v0, 'Schub in Flugrichtung beschleunigt');
  const el = elements(GM, p.x, p.y, p.vx, p.vy);
  assert.ok(el.ra > 14.2, `Apoapsis steigt: ${el.ra}`);
});

test('Der Stern absorbiert: wer ihn beruehrt ist verloren (lostTo = attractor), der Stern bleibt am Ort', () => {
  const w = orbitWorld({ r: 14 });
  const p = w.player;
  p.vx = 0; // fast ohne Seitengeschwindigkeit: faellt in den Stern
  p.vy = 0.05;
  run(w, 20);
  assert.equal(w.player, null);
  assert.equal(w.lostTo, 'attractor');
  const star = w.bodies.find((b) => b.kind === 'attractor');
  assert.ok(star && star.x === 0 && star.y === 0 && star.vx === 0 && star.vy === 0);
  assert.ok(star.m >= 12.25);
  assert.equal(star.gm, GM);
});

test('Play: Sturz in den Stern endet das Level als verloren', () => {
  const play = createPlay(levelById('3-1'));
  const p = play.world.player;
  p.vx = 0;
  p.vy = 0;
  play.advanceSteps(120 * 30);
  assert.equal(play.status, 'lost');
  assert.equal(play.world.lostTo, 'attractor');
});

test('Offener Raum: Warnschwelle, Abdrift (verloren) und Aufraeumen weit entfernter Koerper (Zielkoerper bleiben)', () => {
  const w = orbitWorld({ grav: { warnR: 40, loseR: 60 }, extra: [{ x: 200, y: 0, m: 0.2, vx: 0, vy: 0 }, { x: 0, y: 200, m: 0.2, vx: 0, vy: 0, tag: 'target' }] });
  const p = w.player;
  p.x = 30;
  p.y = 0;
  assert.equal(driftState(w), 0);
  p.x = 50;
  assert.ok(Math.abs(driftState(w) - 0.5) < 1e-9);
  step(w);
  assert.ok(w.bodies.length === 3, 'ein weit entfernter Koerper wurde entfernt, der Zielkoerper bleibt');
  assert.ok(w.bodies.some((b) => b.tag === 'target'));
  p.x = 61;
  p.vx = 0;
  p.vy = 0;
  step(w);
  assert.equal(w.player, null);
  assert.equal(w.lostTo, 'drift');
  // Kapitel 1 und 2: kein offener Raum, keine Abdrift
  const w1 = createWorld({ bodies: [], arenaR: 20 });
  assert.equal(driftState(w1), 0);
});

test('Bahnvorschau stimmt mit der echten Bahn ueberein (ohne andere Koerper): Abweichung unter 2 % nach einem Umlauf', () => {
  for (const [r, f] of [[14, 1], [20, 0.85], [12, 1.15], [9, 0.9]]) {
    const w = orbitWorld({ r, f });
    const el = elements(GM, w.player.x, w.player.y, w.player.vx, w.player.vy);
    const pv = predictOrbit(w);
    assert.ok(pv && pv.n > 20 && !pv.end, `r=${r} f=${f}: Vorschau endet in ${pv && pv.end}`);
    assert.ok(Math.abs(pv.period - el.period) < 1e-6);
    // echte Bahn: an den Zeitpunkten der Vorschau vergleichen (bis 1,0 Umlauf)
    const real = [];
    const tMax = el.period;
    let t = 0;
    for (let i = 0; i < pv.n && pv.t[i] <= tMax; i++) {
      while (t < pv.t[i] - 1e-9) {
        step(w);
        t += T.dt;
      }
      real.push([w.player.x, w.player.y, pv.pts[2 * i], pv.pts[2 * i + 1]]);
    }
    const worst = Math.max(...real.map(([x, y, px, py]) => Math.hypot(x - px, y - py)));
    assert.ok(worst < 0.02 * Math.max(r, el.ra), `r=${r} f=${f}: groesste Abweichung ${worst.toFixed(3)}`);
  }
});

test('Bahnvorschau markiert Sturz in den Stern und Abdrift; sie kostet wenig Rechenzeit', () => {
  const w = orbitWorld({ r: 14 });
  w.player.vx = 0.4; // fast radialer Fall
  w.player.vy = 0.3;
  const pv = predictOrbit(w);
  assert.equal(pv.end, 'star');
  assert.equal(pv.flag[pv.n - 1], 1);
  const w2 = orbitWorld({ r: 14, f: 1.6, grav: { warnR: 40, loseR: 60 } });
  const pv2 = predictOrbit(w2);
  assert.equal(pv2.end, 'drift');
  assert.ok(Array.from(pv2.flag).some((x) => x === 2));
  // Kosten: Mittel ueber viele Bahnen
  const w3 = orbitWorld({ r: 14, f: 0.8 });
  const t0 = performance.now();
  for (let i = 0; i < 400; i++) predictOrbit(w3);
  const ms = (performance.now() - t0) / 400;
  assert.ok(ms < 1.5, `Vorschau ${ms.toFixed(3)} ms`);
  assert.equal(predictOrbit(createWorld({ bodies: [], arenaR: 20 })), null, 'ohne Attraktor keine Vorschau');
});

test('Anziehung unter den Koerpern: selfGrav wirkt (schwere Koerper ziehen an) und ist deterministisch; der Spieler zieht nicht', () => {
  const mk = (sg) => {
    const s = orbitState(GM, 20, 0);
    const near = orbitState(GM, 23, 6);
    return createWorld({
      bodies: [
        { x: 0, y: 0, m: 12.25, kind: 'attractor', gm: GM },
        { x: s.x, y: s.y, vx: s.vx, vy: s.vy, m: 3, kind: 'mote' }, // Planet
        { x: near.x, y: near.y, vx: near.vx, vy: near.vy, m: 0.2, kind: 'mote' }, // kleiner Koerper in der Naehe
      ],
      arenaR: 0,
      grav: { selfGrav: sg, warnR: 60, loseR: 90 },
      player: { x: -14, y: 0, vx: 0, vy: -circularSpeed(GM, 14), m: 1 },
    });
  };
  const a = mk(0);
  const b = mk(1);
  step(a);
  step(b);
  const small = (w) => w.bodies.find((x) => x.m === 0.2);
  const planet = (w) => w.bodies.find((x) => x.m === 3);
  const dir = (w) => {
    const pl = planet(w);
    const sm = small(w);
    const dx = pl.x - sm.x;
    const dy = pl.y - sm.y;
    return (dx * (sm.vx - small(a).vx) + dy * (sm.vy - small(a).vy)) / Math.hypot(dx, dy);
  };
  assert.ok(dir(b) > 1e-4, 'mit selfGrav zieht der Planet den kleinen Koerper zu sich');
  const a2 = mk(0);
  step(a2);
  assert.equal(small(a).vx, small(a2).vx, 'selfGrav 0 ist deterministisch');
  // der Spieler (m >= selfMin) zieht nicht
  const w = mk(1);
  w.player.m = 5;
  const sm0 = { vx: small(w).vx, vy: small(w).vy };
  const w0 = mk(1);
  step(w);
  step(w0);
  assert.equal(small(w).vx, small(w0).vx, 'der Spieler ist die Sonde: er zieht nicht');
  assert.ok(sm0);
  // Determinismus
  const s1 = mk(0.7);
  const s2 = mk(0.7);
  run(s1, 30);
  run(s2, 30);
  assert.equal(JSON.stringify(snapshot(s1)), JSON.stringify(snapshot(s2)));
});

test('Schnappschuss und Zurueckspulen mit Attraktor: Rundreise ueber JSON, Welt laeuft identisch weiter', () => {
  const w = orbitWorld({ extra: [{ x: 20, y: 0, vx: 0, vy: 2, m: 0.5, kind: 'mote' }], grav: { selfGrav: 0.5, rings: [8, 14] } });
  run(w, 3);
  const snap = JSON.parse(JSON.stringify(snapshot(w)));
  const r = restore(snap);
  assert.deepEqual(r.grav, w.grav);
  assert.equal(r.bodies.find((b) => b.kind === 'attractor').gm, GM);
  assert.equal(JSON.stringify(snapshot(r)), JSON.stringify(snapshot(w)));
  run(w, 5);
  run(r, 5);
  assert.equal(JSON.stringify(snapshot(r)), JSON.stringify(snapshot(w)));
  // Rewind-Puffer
  const rw = createRewind();
  const w2 = orbitWorld();
  for (let i = 0; i < 12; i++) {
    run(w2, 0.5);
    rw.tick(w2);
  }
  const pick = rw.pick(w2.t);
  assert.ok(pick.g && pick.b.some((b) => b[6] === 'attractor' && b[11] === GM));
});

test('Play im Kapitel 3: serialize/restore setzt den Level fort, Ausstoss-Zaehler und Zeit bleiben', () => {
  const lv = levelById('3-4');
  const a = createPlay(lv);
  a.advanceSteps(300);
  a.ejectAt(5, 5);
  a.advanceSteps(300);
  const saved = JSON.parse(JSON.stringify(a.serialize()));
  const b = createPlay(lv, saved);
  assert.equal(JSON.stringify(snapshot(a.world)), JSON.stringify(snapshot(b.world)));
  a.advanceSteps(600);
  b.advanceSteps(600);
  assert.equal(JSON.stringify(snapshot(a.world)), JSON.stringify(snapshot(b.world)));
});

test('Schnappschuesse der Kapitel 1 und 2 bleiben unveraendert und alte Schnappschuesse laden weiter', () => {
  const w = createWorld({ bodies: [{ x: 5, y: 0, m: 0.3 }], arenaR: 12 });
  const s = snapshot(w);
  assert.ok(!('g' in s), 'kein g-Schluessel ohne Gravitation');
  assert.ok(s.b.every((b) => b.length === 11), 'Koerper-Eintraege wie vorher (11 Felder)');
  const old = JSON.parse(JSON.stringify(s));
  old.b = old.b.map((b) => b.slice(0, 10)); // Schnappschuss aus P1 (ohne ai)
  const r = restore(old);
  assert.equal(r.grav, null);
  assert.equal(r.bodies.length, 2);
  assert.ok(r.bodies.every((b) => b.gm === 0));
  step(r);
});

test('Ziele zaehlen den Protostern nicht: unangreifbar und letzter Koerper', () => {
  const w = orbitWorld({ extra: [{ x: 20, y: 0, m: 0.3, vx: 0, vy: 0 }] });
  const g = goalStatus(w, { type: 'largest' });
  assert.equal(g.done, true, 'der Stern (12,25) zaehlt nicht als groesserer Koerper');
  assert.equal(lastRemaining(w).n, 1, 'nur der kleine Koerper zaehlt, nicht der Stern');
  w.bodies = w.bodies.filter((b) => b.m !== 0.3);
  assert.equal(goalStatus(w, { type: 'last' }).done, true);
});

test('Klang: der Protostern ist keine Gefahr fuer die Musik, Kapitel 3 hat eine Stimmung', () => {
  const w = orbitWorld({ r: 5 });
  assert.equal(dangerOf(w), 0);
  assert.ok(T.audio.moods[3]);
  assert.ok(CHAPTERS.some((c) => c.id === 3));
});

test('Kamera im offenen Raum: Auftakt zeigt das System, danach folgt sie dem Spieler und der Stern bleibt im Bild', () => {
  const play = createPlay(levelById('3-4'));
  const w = play.world;
  const cam = createCamera();
  introCamera(cam, w, 0); // Paket F: der Auftakt (Uebersicht -> Spieler) laeuft ueber introCamera, die Physik steht
  assert.equal(cam.x, 0);
  assert.ok(cam.half >= overviewHalf(w) - 1e-9 && Number.isFinite(cam.half));
  introCamera(cam, w, 1);
  const sp = startPose(w);
  assert.ok(Math.abs(cam.x - sp.x) < 1e-9 && Math.abs(cam.half - sp.half) < 1e-9, 'Ende des Auftakts = Startpose');
  for (let i = 0; i < 60 * 12; i++) updateCamera(cam, w, 1 / 60, i / 60);
  const p = w.player;
  const s = Math.hypot(p.x, p.y);
  assert.ok(cam.half >= T.orbit.camStar * s, `halbe Breite ${cam.half} bei Sternabstand ${s}`);
  assert.ok(autoHalf(w) <= T.camMax);
  assert.ok(Number.isFinite(autoHalf(w)) && autoHalf(w) > 0, 'kein NaN bei arenaR = 0');
});

test('Levels Kapitel 3: acht Levels, eindeutige Namen, gemischte Ziele, Kapitel oeffnet mit 2-8, Stern-Ziele vorhanden', () => {
  const ls = levelsOf(3);
  assert.equal(ls.length, 8);
  assert.deepEqual(ls.map((l) => l.n), [1, 2, 3, 4, 5, 6, 7, 8]);
  const names = LEVELS.map((l) => l.title);
  assert.equal(new Set(names).size, names.length, 'Namen eindeutig');
  assert.ok(new Set(ls.map((l) => l.goal.type)).size >= 4, 'mindestens vier verschiedene Zieltypen');
  for (const l of ls) {
    assert.ok(l.targets.eject > 0 && l.targets.time > 0);
    const built = buildLevel(l);
    assert.equal(built.arenaR, 0);
    assert.ok(built.bodies[0].kind === 'attractor' && built.bodies[0].gm > 0);
    assert.ok(built.grav.loseR > built.grav.warnR && built.grav.warnR > 0);
  }
  assert.ok(ls[0].hint.text.includes('gepunktete Linie'));
  assert.ok(ls[1].hint.text && ls[1].hint.textAim, '3-2 hat Hilfen fuer beide Steuerungen');
  // Freischalten (Paket F): 3-1 oeffnet sich, sobald in Kapitel 2 fuenf Levels geschafft sind (nicht erst mit dem Finale)
  const storage = createStorage(mem());
  const pr = createProgress({ storage });
  assert.equal(pr.unlocked('3-1'), false);
  for (const id of ['2-1', '2-2', '2-3', '2-4']) pr.record(id, { time: 100, ejected: 1, eff: false, fast: false });
  assert.equal(pr.unlocked('3-1'), false, 'vier von fuenf');
  pr.record('2-5', { time: 100, ejected: 1, eff: false, fast: false });
  assert.equal(pr.unlocked('3-1'), true);
  assert.equal(pr.unlocked('3-2'), false, 'innerhalb des Kapitels Level fuer Level');
  const pr2 = createProgress({ storage: createStorage(mem()) });
  pr2.record('2-8', { time: 100, ejected: 1, eff: false, fast: false });
  assert.equal(pr2.unlocked('3-1'), true, 'wer das Finale geschafft hat (alter Spielstand), hat das Kapitel offen');
});

test('Ein alter Spielstand (Version 3, ohne Kapitel 3) laedt unveraendert, ein Schnappschuss von 3-4 wird gueltig gespeichert', () => {
  const storage = createStorage(mem());
  const store = createSaveStore({ id: 'protoplanet', version: 3, storage });
  store.save({ progress: { '1-1': { done: true, eff: true, fast: false, bestTime: 10, bestEject: 0.1 }, '2-8': { done: true, eff: false, fast: false, bestTime: 200, bestEject: 3 } }, settings: { aim: true, vibrate: true, reduceMotion: null, music: 70, sfx: 80, mute: false }, snap: null });
  const pr = createProgress({ storage });
  assert.equal(pr.done('2-8'), true);
  assert.equal(pr.state.settings.aim, true);
  assert.equal(pr.unlocked('3-1'), true);
  // Schnappschuss eines Kapitel-3-Levels ueberlebt Speichern und Laden
  const lv = levelById('3-4');
  const play = createPlay(lv);
  play.advanceSteps(240);
  pr.setSnap({ levelId: lv.id, rev: lv.rev || 1, play: play.serialize(), timeScale: 1 });
  pr.save();
  const pr2 = createProgress({ storage });
  assert.ok(pr2.state.snap && pr2.state.snap.levelId === '3-4');
  const again = createPlay(lv, pr2.state.snap.play);
  assert.equal(JSON.stringify(snapshot(again.world)), JSON.stringify(snapshot(play.world)));
});

test('Familie orbit: Grundregeln ueber viele Seeds (Spieler auf stabiler Kreisbahn, nichts ueberlappt, Futter auf Nachbarbahnen, kein Koerper auf Fluchtbahn)', () => {
  for (const id of ['3-4', '3-5', '3-6', '3-7', '3-8']) {
    const lv = levelById(id);
    for (let seed = 1; seed <= 25; seed++) {
      const g = generate(lv.family, lv.params, seed, lv.goal);
      assert.deepEqual(checkRulesOrbit(g), [], `${id} Seed ${seed}`);
      const p = g.player;
      const el = elements(g.bodies[0].gm, p.x, p.y, p.vx, p.vy);
      assert.ok(el.bound && Math.abs(el.rp - el.ra) / el.ra < 0.01, `${id}: Spieler auf Kreisbahn`);
      for (const b of g.bodies.slice(1)) assert.ok(Math.hypot(b.vx, b.vy) > 0.3, 'Koerper kreisen (nichts steht)');
    }
  }
});

test('Bahnspuren: Koerper in derselben Spur und Richtung treffen sich nie, die Welt bleibt ohne Spieler ruhig (keine Lawinen)', () => {
  const lv = levelById('3-8');
  const g = generate(lv.family, lv.params, 7, lv.goal);
  const w = createWorld({ ...g, bodies: g.bodies });
  // Spieler aus dem Weg: weit draussen am Rand der Spur (Abdrift ausgeschaltet), nur die Welt wird beobachtet
  w.grav.loseR = 1e6;
  const n0 = w.bodies.length;
  run(w, 60);
  assert.ok(w.bodies.length >= n0 - 3, `${n0} -> ${w.bodies.length} Koerper (nur wenige Zusammenstoesse)`);
});
