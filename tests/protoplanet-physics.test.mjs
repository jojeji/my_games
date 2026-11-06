import test from 'node:test';
import assert from 'node:assert/strict';
import { T } from '../games/protoplanet/tune.js';
import { createWorld, addBody, eject, absorb, step, snapshot, restore, totalMass, radius } from '../games/protoplanet/physics.js';
import { createRewind } from '../games/protoplanet/rewind.js';
import { createPlay } from '../games/protoplanet/play.js';
import { goalStatus, starsFor } from '../games/protoplanet/goals.js';
import { LEVELS, levelById } from '../games/protoplanet/levels.js';
import { createProgress } from '../games/protoplanet/state.js';
import { createStorage } from '../engine/save.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const momentum = (w) => w.bodies.reduce((s, b) => [s[0] + b.m * b.vx, s[1] + b.m * b.vy], [0, 0]);
const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};

test('Radius ist die Wurzel der Masse, der Spieler startet mit Masse 1', () => {
  assert.equal(radius(4), 2);
  const w = createWorld({ bodies: [], arenaR: 20 });
  assert.equal(w.player.m, 1);
  assert.equal(w.player.kind, 'player');
});

test('Ausstoss: Masse und Impuls bleiben exakt erhalten', () => {
  const w = createWorld({ bodies: [], arenaR: 50, player: { vx: 0.7, vy: -0.3 } });
  const m0 = totalMass(w);
  const p0 = momentum(w);
  const p = w.player;
  const q = eject(w, 1, 0, 0.02);
  assert.ok(q);
  close(totalMass(w), m0);
  const p1 = momentum(w);
  close(p1[0], p0[0]);
  close(p1[1], p0[1]);
  close(p.m, 0.98);
  close(q.m, 0.02);
  // das Teilchen entsteht am Rand des Spielers in Ausstossrichtung
  close(Math.hypot(q.x - p.x, q.y - p.y), radius(p.m) + radius(q.m));
  assert.ok(q.x > p.x);
  // der Spieler wird in die Gegenrichtung schneller
  assert.ok(p.vx < 0.7);
  close(q.vx - 0.7, T.ejectSpeed);
  assert.equal(w.stats.ejects, 1);
  close(w.stats.ejected, 0.02);
});

test('Ausstoss in beliebige Richtung: Richtung wird normiert, Nullrichtung ignoriert', () => {
  const w = createWorld({ bodies: [], arenaR: 50 });
  assert.equal(eject(w, 0, 0), null);
  const q = eject(w, 3, 4, 0.05);
  close(Math.hypot(q.vx, q.vy), T.ejectSpeed);
  close(q.vx / T.ejectSpeed, 0.6);
});

test('Ausstoss nur, solange die Mindestmasse des Spielers bleibt', () => {
  const w = createWorld({ bodies: [], arenaR: 50, player: { m: T.minPlayerMass * 1.005 } });
  assert.equal(eject(w, 1, 0, 0.02), null);
  assert.equal(w.bodies.length, 1);
});

test('Absorbieren: danach beruehren sich die Koerper genau, Masse und Impuls bleiben erhalten', () => {
  const w = createWorld({ bodies: [], arenaR: 100, player: { m: 4, x: 0, y: 0, vx: 1, vy: 0 } });
  const s = addBody(w, { x: 2.5, y: 0, vx: -0.5, vy: 0.4, m: 1, kind: 'mote' });
  const m0 = totalMass(w);
  const p0 = momentum(w);
  const full = absorb(w, w.player, s);
  assert.equal(full, false);
  close(totalMass(w), m0);
  const p1 = momentum(w);
  close(p1[0], p0[0]);
  close(p1[1], p0[1]);
  close(Math.hypot(s.x - w.player.x, s.y - w.player.y), radius(w.player.m) + radius(s.m), 1e-9);
  assert.ok(s.m < 1 && w.player.m > 4);
  // nur die uebertragene Masse bringt ihren Impuls mit; S behaelt seine Geschwindigkeit
  assert.equal(s.vx, -0.5);
});

test('Absorbieren: Formel rS\' = (d - sqrt(2M - d^2)) / 2', () => {
  const w = createWorld({ bodies: [], arenaR: 100, player: { m: 9 } });
  const s = addBody(w, { x: 3.2, y: 0, m: 1, kind: 'mote' });
  const d = 3.2;
  const M = 9 + 1;
  const expected = (d - Math.sqrt(2 * M - d * d)) / 2;
  absorb(w, w.player, s);
  close(radius(s.m), expected, 1e-12);
});

test('Absorbieren: liegt der Mittelpunkt tief genug, wird der kleinere ganz absorbiert', () => {
  const w = createWorld({ bodies: [], arenaR: 100, player: { m: 4 } });
  const s = addBody(w, { x: 1, y: 0, m: 0.5, kind: 'mote' });
  assert.equal(absorb(w, w.player, s), true);
  assert.equal(s.m, 0);
  close(w.player.m, 4.5);
  assert.equal(w.stats.absorbed, 1);
});

test('Absorbieren: der Spieler kann auch der kleinere sein (verliert Masse, wird irgendwann ganz absorbiert)', () => {
  const w = createWorld({ bodies: [], arenaR: 100 });
  const big = addBody(w, { x: 1.2, y: 0, m: 9, kind: 'mote' });
  const m0 = totalMass(w);
  absorb(w, w.player, big);
  assert.ok(w.player.m < 1 && big.m > 9);
  close(totalMass(w), m0);
});

test('Absorbieren: bei gleicher Masse gilt die kleinere id als groesser', () => {
  const w = createWorld({ bodies: [], arenaR: 100, player: { m: 2 } });
  const o = addBody(w, { x: 0.5, y: 0, m: 2, kind: 'mote' });
  absorb(w, w.player, o);
  assert.ok(w.player.m > 2 && o.m === 0);
});

test('Schonfrist: der Spieler schluckt sein eigenes Teilchen erst nach ejectGrace', () => {
  const w = createWorld({ bodies: [], arenaR: 100 });
  const q = addBody(w, { x: 0.3, y: 0, m: 0.05, kind: 'mote', gu: T.ejectGrace, gf: w.player.id });
  for (let i = 0; i < 20; i++) step(w);
  assert.ok(w.bodies.includes(q), 'noch in der Schonfrist');
  for (let i = 0; i < Math.ceil(T.ejectGrace / T.dt); i++) step(w);
  assert.ok(!w.bodies.includes(q), 'danach absorbiert');
});

test('Rand: elastische Spiegelung, Betrag der Geschwindigkeit bleibt, Koerper bleibt in der Arena', () => {
  const w = createWorld({ bodies: [{ x: 8, y: 0, vx: 3, vy: 1, m: 0.25 }], arenaR: 10 });
  const b = w.bodies[1];
  const v0 = Math.hypot(b.vx, b.vy);
  let bounced = false;
  for (let i = 0; i < 400; i++) {
    step(w);
    assert.ok(Math.hypot(b.x, b.y) + radius(b.m) <= 10 + 1e-9);
    if (b.vx < 0) bounced = true;
  }
  assert.ok(bounced);
  close(Math.hypot(b.vx, b.vy), v0, 1e-9);
});

test('Fester Zeitschritt dt = 1/120', () => {
  assert.equal(T.dt, 1 / 120);
  const w = createWorld({ bodies: [{ x: 5, y: 0, vx: 1.2, vy: 0, m: 0.1 }], arenaR: 50 });
  for (let i = 0; i < 120; i++) step(w);
  close(w.t, 1, 1e-9);
  close(w.bodies[1].x, 5 + 1.2, 1e-9);
});

function busyWorld() {
  const bodies = [];
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 4 + rnd() * 20;
    bodies.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, vx: (rnd() - 0.5) * 3, vy: (rnd() - 0.5) * 3, m: 0.05 + rnd() * 0.9 });
  }
  return createWorld({ bodies, arenaR: 28 });
}

test('Determinismus: gleiche Welt + gleiche Eingaben = gleicher Zustand', () => {
  const run = () => {
    const w = busyWorld();
    for (let i = 0; i < 1500; i++) {
      if (i % 40 === 0) eject(w, Math.cos(i), Math.sin(i), 0.01);
      step(w);
    }
    return JSON.stringify(snapshot(w));
  };
  assert.equal(run(), run());
});

test('Raster-Kollisionssuche und Paarvergleich liefern dasselbe Ergebnis', () => {
  const run = (gridMin) => {
    const old = T.gridMinBodies;
    T.gridMinBodies = gridMin;
    try {
      const w = busyWorld();
      for (let i = 0; i < 1200; i++) step(w);
      return JSON.stringify(snapshot(w));
    } finally {
      T.gridMinBodies = old;
    }
  };
  assert.equal(run(0), run(1e9));
});

test('Masse bleibt ueber viele Schritte erhalten (nichts geht verloren)', () => {
  const w = busyWorld();
  const m0 = totalMass(w);
  for (let i = 0; i < 2000; i++) step(w);
  close(totalMass(w), m0, 1e-9);
});

test('Schnappschuss: Wiederherstellen und Weiterrechnen ergibt denselben Verlauf', () => {
  const a = busyWorld();
  for (let i = 0; i < 300; i++) step(a);
  const snap = JSON.parse(JSON.stringify(snapshot(a))); // wie im Spielstand
  const b = restore(snap);
  for (let i = 0; i < 500; i++) {
    step(a);
    step(b);
  }
  assert.equal(JSON.stringify(snapshot(a)), JSON.stringify(snapshot(b)));
  assert.equal(b.player.kind, 'player');
});

test('Zurueckspulen: Puffer haelt 10 s, pick liefert den Schnappschuss >= 3 s davor', () => {
  const w = busyWorld();
  const rw = createRewind();
  for (let i = 0; i < 120 * 30; i++) {
    step(w);
    rw.tick(w);
  }
  assert.ok(rw.size <= T.rewindKeep / T.rewindEvery + 2, 'Ringpuffer ist begrenzt: ' + rw.size);
  const s = rw.pick(w.t);
  assert.ok(s.t <= w.t - T.rewindBack + 1e-9);
  assert.ok(s.t > w.t - T.rewindBack - T.rewindEvery - 1e-9);
});

test('Level zurueckspulen: 3 Mal, danach nicht mehr; Ausstoss-Stern ist dann weg', () => {
  const lv = levelById('1-2');
  const play = createPlay(lv);
  // Verlust erzwingen: Spieler fliegt in den grossen Koerper
  const big = play.world.bodies.find((b) => b.m > 2);
  for (let k = 0; k < 3; k++) {
    play.world.player.x = big.x - 0.2;
    play.world.player.y = big.y;
    play.advanceSteps(600);
    assert.equal(play.status, 'lost', 'Versuch ' + k);
    assert.equal(play.rewindsLeft, 3 - k);
    assert.ok(play.doRewind());
    assert.equal(play.status, 'running');
    assert.equal(play.rewound, true);
  }
  assert.equal(play.rewindsLeft, 0);
  play.world.player.x = big.x - 0.2;
  play.world.player.y = big.y;
  play.advanceSteps(600);
  assert.equal(play.status, 'lost');
  assert.equal(play.doRewind(), false);
  assert.equal(starsFor(lv, { time: 1, ejected: 0, rewound: true }).eff, false);
});

test('Ziele: largest, absorb, mass und Sterne', () => {
  const w = createWorld({ bodies: [{ x: 5, y: 0, m: 2, tag: 'target' }], arenaR: 30 });
  assert.deepEqual(goalStatus(w, { type: 'largest' }), { done: false, frac: 0.5 });
  assert.deepEqual(goalStatus(w, { type: 'mass', value: 4 }), { done: false, frac: 0.25 });
  assert.equal(goalStatus(w, { type: 'absorb' }).done, false);
  w.player.m = 3;
  assert.equal(goalStatus(w, { type: 'largest' }).done, true);
  assert.equal(goalStatus(w, { type: 'mass', value: 3 }).done, true);
  w.bodies = w.bodies.filter((b) => b.tag !== 'target');
  assert.equal(goalStatus(w, { type: 'absorb' }).done, true);
  const lv = { targets: { eject: 0.5, time: 60 } };
  assert.equal(starsFor(lv, { time: 30, ejected: 0.3, rewound: false }).count, 3);
  assert.equal(starsFor(lv, { time: 90, ejected: 0.3, rewound: false }).count, 2);
  assert.equal(starsFor(lv, { time: 30, ejected: 0.6, rewound: false }).count, 2);
  assert.equal(starsFor(lv, { time: 90, ejected: 0.6, rewound: false }).count, 1);
});

test('Play: Strahl stoesst mit streamHz aus, Zeitstufe aendert nur die Schrittzahl', () => {
  const play = createPlay(levelById('1-3'));
  play.setBeam({ x: 10, y: 0 });
  for (let i = 0; i < 60; i++) play.advance(1 / 60);
  const n1 = play.world.stats.ejects;
  assert.ok(n1 >= T.streamHz - 1 && n1 <= T.streamHz + 1, 'Ausstoesse in 1 s: ' + n1);
  const a = createPlay(levelById('1-3'));
  const b = createPlay(levelById('1-3'));
  b.timeScale = 4;
  for (let i = 0; i < 60; i++) {
    a.advance(4 / 60);
    b.advance(1 / 60);
  }
  assert.equal(a.world.steps, b.world.steps);
  assert.equal(JSON.stringify(snapshot(a.world)), JSON.stringify(snapshot(b.world)));
});

test('Play: ist das Geraet zu langsam, werden hoechstens maxStepsPerFrame Schritte gerechnet', () => {
  const play = createPlay(levelById('1-3'));
  const n = play.advance(5);
  assert.equal(n, T.maxStepsPerFrame);
});

test('Play: serialize/restore setzt Spielzeit, Koerper und Versuche fort', () => {
  const lv = levelById('1-3');
  const a = createPlay(lv);
  a.ejectAt(5, 5);
  for (let i = 0; i < 120; i++) a.advance(1 / 60);
  const saved = JSON.parse(JSON.stringify(a.serialize()));
  const b = createPlay(lv, saved);
  assert.equal(b.rewindsLeft, a.rewindsLeft);
  for (let i = 0; i < 60; i++) {
    a.advance(1 / 60);
    b.advance(1 / 60);
  }
  assert.equal(JSON.stringify(snapshot(a.world)), JSON.stringify(snapshot(b.world)));
});

test('Steuerung: Standard fliegt zum Finger, umgekehrt vom Finger weg', () => {
  const a = createPlay(levelById('1-3'));
  a.ejectAt(10, 0);
  assert.ok(a.world.player.vx > 0, 'Standard: zum Finger');
  const b = createPlay(levelById('1-3'));
  b.invert = true;
  b.ejectAt(10, 0);
  assert.ok(b.world.player.vx < 0, 'umgekehrt: vom Finger weg');
});

test('Spielstand: Fortschritt, Sterne, Freischalten, Schnappschuss, Export/Import, Loeschen', () => {
  const storage = createStorage(mem());
  const pr = createProgress({ storage });
  assert.equal(pr.unlocked(LEVELS[0].id), true);
  assert.equal(pr.unlocked(LEVELS[1].id), false);
  const fresh = pr.record(LEVELS[0].id, { time: 40, ejected: 0.2, eff: true, fast: false });
  assert.equal(fresh.first, true);
  assert.equal(pr.stars(LEVELS[0].id), 2);
  assert.equal(pr.unlocked(LEVELS[1].id), true);
  pr.record(LEVELS[0].id, { time: 50, ejected: 0.4, eff: false, fast: true }); // Sterne sind Bestwerte und bleiben
  assert.equal(pr.stars(LEVELS[0].id), 3);
  assert.equal(pr.info(LEVELS[0].id).bestTime, 40);
  assert.equal(pr.info(LEVELS[0].id).bestEject, 0.2);
  const play = createPlay(LEVELS[0]);
  play.advance(1);
  pr.setSnap({ levelId: LEVELS[0].id, play: play.serialize(), timeScale: 4 });
  pr.settings.invert = true;
  assert.equal(pr.save(), true);
  const again = createProgress({ storage });
  assert.equal(again.stars(LEVELS[0].id), 3);
  assert.equal(again.settings.invert, true);
  assert.equal(again.state.snap.levelId, LEVELS[0].id);
  assert.equal(again.state.snap.timeScale, 4);
  const text = again.exportString();
  const other = createProgress({ storage: createStorage(mem()) });
  other.importString(text);
  assert.equal(other.stars(LEVELS[0].id), 3);
  assert.throws(() => other.importString('muell'), /gültig/);
  other.reset();
  assert.equal(other.stars(LEVELS[0].id), 0);
});

test('kein Math.random in Physik, Generatoren, Bot und Leveln', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['physics', 'gen', 'bot', 'levels', 'play', 'rewind', 'goals']) {
    const src = readFileSync(new URL(`../games/protoplanet/${f}.js`, import.meta.url), 'utf8');
    assert.ok(!/Math\.random/.test(src), f);
  }
});
