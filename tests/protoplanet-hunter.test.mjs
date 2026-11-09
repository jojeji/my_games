// Jaeger (P2): gleiche Physik wie der Spieler, begrenztes Gehirn, deterministisch; Ziel "unangreifbar"; Kompatibilitaet alter Spielstaende.
import test from 'node:test';
import assert from 'node:assert/strict';
import { T } from '../games/protoplanet/tune.js';
import { createWorld, addBody, step, snapshot, restore, totalMass } from '../games/protoplanet/physics.js';
import { makeAi, runHunters, brainParams } from '../games/protoplanet/hunter.js';
import { createPlay } from '../games/protoplanet/play.js';
import { botAct, createBot } from '../games/protoplanet/bot.js';
import { goalStatus, goalText, goalCounter, lastRemaining } from '../games/protoplanet/goals.js';
import { LEVELS, levelById } from '../games/protoplanet/levels.js';
import { createProgress, snapValid, SAVE_VERSION } from '../games/protoplanet/state.js';
import { createStorage } from '../engine/save.js';

const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};
const hunter = (x, y, m, extra = {}) => ({ x, y, m, kind: 'hunter', ai: makeAi({ seed: 5, diff: 'normal', ...extra }) });
/** Welt mit Spieler (id 1) und Koerpern; der Spieler rührt sich nicht. */
const scene = (bodies, player = {}) => createWorld({ bodies, arenaR: 40, player });
const run = (w, seconds) => {
  const n = Math.round(seconds / T.dt);
  for (let i = 0; i < n; i++) {
    runHunters(w);
    step(w);
  }
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('Jaeger-Stufen: Reaktionszeit 0,5-1,5 s, je Jaeger aus dem Seed, gleicher Seed = gleicher Jaeger', () => {
  for (const diff of Object.keys(T.hunter.levels)) {
    const D = T.hunter.levels[diff];
    assert.ok(D.react[0] >= 0.5 && D.react[1] <= 1.5 && D.react[0] <= D.react[1], diff);
    const reacts = new Set();
    for (let seed = 1; seed <= 30; seed++) {
      const a = makeAi({ seed, diff });
      assert.ok(a.react >= D.react[0] && a.react <= D.react[1], `${diff} ${a.react}`);
      assert.deepEqual(a, makeAi({ seed, diff }));
      reacts.add(a.react);
    }
    assert.ok(reacts.size > 20, 'verschiedene Seeds geben verschiedene Reaktionszeiten');
  }
  // die Stufen werden haerter: schnellere Reaktion, weniger Fehler, mehr Tempo
  const { easy, normal, hard } = T.hunter.levels;
  assert.ok(easy.react[0] > normal.react[0] && normal.react[0] > hard.react[0]);
  assert.ok(easy.aimNoise > normal.aimNoise && normal.aimNoise > hard.aimNoise);
  assert.ok(easy.hesitate > normal.hesitate && normal.hesitate > hard.hesitate);
  assert.ok(brainParams('easy').vmax < brainParams('normal').vmax && brainParams('normal').vmax < brainParams('hard').vmax);
});

test('Jaeger: Ausstoss kostet Masse, das Teilchen ist ein normaler, fressbarer Koerper (Impuls und Masse bleiben erhalten)', () => {
  // ein kleiner Koerper in Reichweite, der Spieler weit weg
  const w = scene([hunter(0, 12, 2.2), { x: 3.2, y: 12, m: 0.7, kind: 'mote' }], { x: 0, y: -30 });
  const h = w.bodies.find((b) => b.kind === 'hunter');
  const m0 = totalMass(w);
  const p0 = w.bodies.reduce((s, b) => [s[0] + b.m * b.vx, s[1] + b.m * b.vy], [0, 0]);
  const before = h.m;
  run(w, 4);
  assert.ok(h.m < before + 0.4 + 1e-9);
  const parts = w.bodies.filter((b) => b.gf === h.id);
  assert.ok(parts.length > 0, 'der Jaeger hat ausgestossen');
  for (const q of parts) {
    assert.equal(q.kind, 'mote');
    assert.ok(q.m > 0 && q.m < h.m);
  }
  // Masse und Impuls bleiben exakt erhalten (der Spieler ruht, nichts wird absorbiert und verschwindet)
  assert.ok(Math.abs(totalMass(w) - m0) < 1e-9);
  const p1 = w.bodies.reduce((s, b) => [s[0] + b.m * b.vx, s[1] + b.m * b.vy], [0, 0]);
  assert.ok(Math.abs(p1[0] - p0[0]) < 1e-6 && Math.abs(p1[1] - p0[1]) < 1e-6);
  // ein Teilchen des Jaegers ist fressbar: der Spieler (gross genug) absorbiert es
  const q = parts[0];
  const player = w.player;
  player.m = 3;
  player.x = q.x;
  player.y = q.y;
  player.vx = player.vy = 0;
  q.vx = q.vy = 0;
  const mP = player.m;
  const mQ = q.m;
  step(w);
  assert.ok(player.m > mP && q.m < mQ, 'das Teilchen wird vom Spieler absorbiert');
});

test('Jaeger: Geschwindigkeit gibt es nur gegen Masse, nach der Raketengleichung mit seiner Abgasgeschwindigkeit (v <= u ln(m0/m1))', () => {
  const w = scene([hunter(0, 12, 2.2), { x: 3.5, y: 12, m: 0.4, kind: 'mote' }], { x: 0, y: -30 });
  const h = w.bodies.find((b) => b.kind === 'hunter');
  h.ai.next = 0;
  const u = brainParams('normal').ejectSpeed;
  const prey = w.bodies.find((b) => b.kind === 'mote');
  prey.m = 1e-9; // keine Beute: nichts wird absorbiert, die Masse des Jaegers aendert sich nur durch Ausstoss
  prey.x = 1000;
  const m0 = h.m;
  let spent = 0;
  for (let i = 0; i < Math.round(20 / T.dt); i++) {
    runHunters(w);
    step(w);
    if (h.m < m0 - 1e-12) spent = m0 - h.m;
  }
  const v = Math.hypot(h.vx, h.vy);
  if (v > 1e-3) {
    assert.ok(spent > 0, 'Geschwindigkeit hat Masse gekostet');
    assert.ok(v <= u * Math.log(m0 / h.m) + 1e-9, `v ${v} <= u ln(m0/m1) = ${u * Math.log(m0 / h.m)}`);
  }
  assert.ok(u < T.ejectSpeed, 'der Jaeger hat den schlechteren Antrieb als der Spieler (teurer je Geschwindigkeit)');
});

test('Jaeger flieht vor einem groesseren Koerper (auch vor dem Spieler)', () => {
  const w = scene([hunter(4.5, 0, 1)], { x: 0, y: 0, m: 3 });
  const h = w.bodies.find((b) => b.kind === 'hunter');
  h.ai.next = 0;
  const d0 = dist(h, w.player);
  run(w, 6);
  assert.ok(h.vx > 0.05, `der Jaeger fliegt vom Spieler weg (vx ${h.vx.toFixed(2)})`);
  assert.ok(dist(h, w.player) > d0, 'der Abstand waechst');
  assert.ok(h.m < 1, 'Fliehen kostet Masse');
});

test('Jaeger jagt einen kleineren Koerper und frisst ihn', () => {
  const w = scene([hunter(0, 14, 2), { x: 4.5, y: 14, m: 0.6, kind: 'mote' }], { x: -30, y: -30 });
  const h = w.bodies.find((b) => b.kind === 'hunter');
  h.ai.next = 0;
  const prey = w.bodies.find((b) => b.kind === 'mote');
  run(w, 25);
  assert.ok(w.bodies.indexOf(prey) < 0, 'die Beute ist ganz gefressen');
  assert.ok(h.m > 2.0, 'der Jaeger ist durch die Beute gewachsen (trotz Ausstosskosten)');
  assert.ok(h.x > 0.3, 'der Jaeger hat sich auf die Beute zubewegt');
});

test('Jaeger jagt den Spieler, wenn der kleiner ist, und ignoriert ihn, wenn er (fast) gleich gross ist', () => {
  const w = scene([hunter(6, 0, 2.2)], { x: 0, y: 0, m: 1 });
  const h = w.bodies.find((b) => b.kind === 'hunter');
  h.ai.next = 0;
  run(w, 5);
  assert.ok(h.vx < -0.05, `der Jaeger fliegt auf den Spieler zu (vx ${h.vx.toFixed(2)})`);
  const w2 = scene([hunter(6, 0, 1.0)], { x: 0, y: 0, m: 1 });
  const h2 = w2.bodies.find((b) => b.kind === 'hunter');
  h2.ai.next = 0;
  run(w2, 5);
  assert.ok(Math.hypot(h2.vx, h2.vy) < 0.05, 'gleich grosse Koerper jagen sich nicht');
});

test('Jaeger entscheiden nur im Takt der Reaktionszeit, nicht in jedem Physikschritt', () => {
  const w = scene([hunter(6, 0, 2.2)], { x: 0, y: 0, m: 1 });
  const h = w.bodies.find((b) => b.kind === 'hunter');
  h.ai.next = 0;
  let decisions = 0;
  let last = h.ai.next;
  for (let i = 0; i < Math.round(30 / T.dt); i++) {
    runHunters(w);
    if (h.ai.next !== last) {
      decisions++;
      assert.ok(h.ai.next - w.t >= h.ai.react * 0.85 - 1e-9 && h.ai.next - w.t <= h.ai.react * 1.15 + 1e-9, 'Abstand zur naechsten Entscheidung = Reaktionszeit +-15 %');
      last = h.ai.next;
    }
    step(w);
  }
  const expected = 30 / h.ai.react;
  assert.ok(decisions >= expected * 0.8 && decisions <= expected * 1.25, `${decisions} Entscheidungen in 30 s (erwartet ca. ${expected.toFixed(0)})`);
});

test('Jaeger sind deterministisch: gleicher Level + gleiche Bot-Eingaben = gleicher Zustand; Schnappschuss und Zurueckspulen setzen das Gehirn fort', () => {
  const lv = levelById('2-5');
  const mk = () => {
    const play = createPlay(lv);
    const st = createBot();
    return { play, st };
  };
  const stepBot = (o, n) => {
    for (let i = 0; i < n; i++) {
      botAct(o.play, o.st);
      o.play.advanceSteps(30);
    }
  };
  const a = mk();
  const b = mk();
  stepBot(a, 80); // 20 s
  stepBot(b, 80);
  assert.equal(JSON.stringify(snapshot(a.play.world)), JSON.stringify(snapshot(b.play.world)));
  const hs = a.play.world.bodies.filter((x) => x.kind === 'hunter');
  assert.ok(hs.length >= 1, 'es gibt noch Jaeger');
  assert.ok(hs.some((x) => x.ai.seed !== makeAi({ seed: 0, diff: 'easy' }).seed), 'Gehirn-Zustand liegt im Koerper');
  // Schnappschuss mitten im Lauf (ueber JSON wie im Spielstand), danach weiter: gleicher Verlauf wie ohne Unterbrechung
  const snap = JSON.parse(JSON.stringify(a.play.serialize()));
  const c = { play: createPlay(lv, snap), st: JSON.parse(JSON.stringify(a.st)) };
  stepBot(a, 40);
  stepBot(c, 40);
  assert.equal(JSON.stringify(snapshot(a.play.world)), JSON.stringify(snapshot(c.play.world)));
});

test('Jaeger: Zurueckspulen stellt auch das Gehirn (Seed, naechste Entscheidung, Plan) wieder her', () => {
  const w = scene([hunter(6, 0, 2.2)], { x: 0, y: 0, m: 1 });
  const h = w.bodies.find((b) => b.kind === 'hunter');
  h.ai.next = 0;
  run(w, 3);
  const s = JSON.parse(JSON.stringify(snapshot(w)));
  run(w, 5);
  const w2 = restore(s);
  const h2 = w2.bodies.find((b) => b.kind === 'hunter');
  assert.deepEqual(h2.ai, JSON.parse(JSON.stringify(s.b.find((r) => r[6] === 'hunter')[10])));
  run(w2, 5);
  assert.equal(JSON.stringify(snapshot(w2)), JSON.stringify(snapshot(w)));
});

test("Ziel 'largest' heisst \"Werde unangreifbar\": im Moment ist kein anderer Koerper (auch kein Jaeger) groesser", () => {
  assert.equal(goalText({ type: 'largest' }), 'Werde unangreifbar');
  const w = scene([{ x: 8, y: 0, m: 3.5, kind: 'mote' }, hunter(-8, 0, 2)], { m: 1 });
  let g = goalStatus(w, { type: 'largest' });
  assert.equal(g.done, false);
  assert.equal(g.n, 2);
  assert.equal(goalCounter({ type: 'largest' }, g), 'Noch 2 größere');
  assert.ok(Math.abs(g.frac - 1 / 3.5) < 1e-9, 'Balken = eigene Masse / groesster anderer Koerper');
  w.player.m = 2.5; // der Jaeger ist kleiner, der Brocken bleibt groesser
  g = goalStatus(w, { type: 'largest' });
  assert.equal(g.n, 1);
  assert.equal(goalCounter({ type: 'largest' }, g), 'Noch 1 größerer');
  w.player.m = 3.6;
  assert.equal(goalStatus(w, { type: 'largest' }).done, true);
  // ein Jaeger, der waechst, nimmt den Status wieder weg
  w.bodies.find((b) => b.kind === 'hunter').m = 4;
  assert.equal(goalStatus(w, { type: 'largest' }).done, false);
  // Gleichstand zaehlt als groesser (der Spieler muss strikt groesser sein)
  w.bodies.find((b) => b.kind === 'hunter').m = 3.6;
  assert.equal(goalStatus(w, { type: 'largest' }).done, false);
});

test("Ziel 'last' mit Jaegern: eigener Ausstoss zaehlt nie, Teilchen eines Jaegers zaehlen nach den normalen Regeln (ab Staubgrenze)", () => {
  const w = scene([hunter(10, 0, 0.5)], { m: 1 });
  const h = w.bodies.find((b) => b.kind === 'hunter');
  addBody(w, { x: 3, y: 3, m: 0.05, kind: 'mote', gf: h.id }); // Teilchen des Jaegers, ueber der Staubgrenze 0,03 x 1
  addBody(w, { x: -3, y: 3, m: 0.05, kind: 'mote', gf: w.player.id }); // eigenes Teilchen
  addBody(w, { x: -3, y: -3, m: 0.02, kind: 'mote', gf: h.id }); // Staub
  const r = lastRemaining(w);
  assert.equal(r.n, 2, 'Jaeger + sein Teilchen; eigenes Teilchen und Staub zaehlen nicht');
});

test('Migration 1 -> 2 direkt: 1-6..1-8 weg, Rest und Einstellungen bleiben, Schnappschuss eines umgebauten Levels weg', async () => {
  const { MIGRATIONS } = await import('../games/protoplanet/state.js');
  const data = {
    progress: { '1-1': { done: true }, '1-5': { done: true, eff: true }, '1-6': { done: true }, '1-7': { done: true }, '1-8': { done: true } },
    settings: { aim: true },
    snap: { levelId: '1-8', play: {} },
  };
  const out = MIGRATIONS[1](JSON.parse(JSON.stringify(data)));
  assert.deepEqual(Object.keys(out.progress).sort(), ['1-1', '1-5']);
  assert.equal(out.settings.aim, true);
  assert.equal(out.snap, null);
  const keep = MIGRATIONS[1]({ progress: {}, snap: { levelId: '1-4', play: {} } });
  assert.equal(keep.snap.levelId, '1-4');
});

test('Migration 2 -> 3 (Paket A) direkt: Sterne und Bestwerte der neu gebauten Level weg, `done` bleibt, unveraenderte Level und Einstellungen bleiben', async () => {
  const { MIGRATIONS, REBUILT_V3 } = await import('../games/protoplanet/state.js');
  assert.deepEqual(REBUILT_V3, ['1-4', '1-5', '1-6', '1-7', '1-8', '2-2', '2-3', '2-4', '2-5', '2-6', '2-7', '2-8']);
  for (const id of REBUILT_V3) assert.equal(levelById(id).rev, 3, id + ' hat die neue Fassung');
  for (const id of ['1-1', '1-2', '1-3', '2-1']) assert.equal(levelById(id).rev, undefined, id + ' ist unveraendert');
  const data = {
    progress: {
      '1-1': { done: true, eff: true, fast: true, bestTime: 6, bestEject: 0.06 },
      '1-4': { done: true, eff: true, fast: true, bestTime: 90, bestEject: 1.2 },
      '1-8': { done: true, eff: false, fast: true, bestTime: 80, bestEject: 3 },
      '2-2': { done: true, eff: true, fast: false, bestTime: 50, bestEject: 0.3 },
      '2-3': { done: false, eff: false, fast: false, bestTime: null, bestEject: null },
    },
    settings: { aim: true, vibrate: false },
    snap: { levelId: '2-2', rev: 1, play: {} },
  };
  const out = MIGRATIONS[2](JSON.parse(JSON.stringify(data)));
  assert.deepEqual(out.progress['1-1'], data.progress['1-1'], 'unveraendertes Level bleibt');
  for (const id of ['1-4', '1-8', '2-2']) assert.deepEqual(out.progress[id], { done: true, eff: false, fast: false, bestTime: null, bestEject: null }, id);
  assert.equal(out.progress['2-3'], undefined);
  assert.equal(out.settings.aim, true);
  assert.equal(out.snap, null);
  assert.equal(MIGRATIONS[2]({ progress: {}, snap: { levelId: '1-3', play: {} } }).snap.levelId, '1-3');
});

test('Spielstand der Version 2 (Paket A): wird beim Laden migriert, Kapitel 2 bleibt offen, Sterne der neuen Level sind weg, ein laufender Schnappschuss von 1-3 bleibt', async () => {
  const { createSaveStore } = await import('../engine/save.js');
  const storage = createStorage(mem());
  const v2 = createSaveStore({ id: 'protoplanet', version: 2, migrations: {}, storage });
  const all = {};
  for (const l of LEVELS) all[l.id] = { done: true, eff: true, fast: true, bestTime: 50, bestEject: 0.5 };
  v2.save({
    progress: all,
    settings: { aim: true, vibrate: true, reduceMotion: null },
    snap: { levelId: '1-3', play: createPlay(levelById('1-3')).serialize(), timeScale: 1 },
  });
  const pr = createProgress({ storage });
  assert.equal(SAVE_VERSION, 3);
  assert.equal(pr.stars('1-1'), 3);
  assert.equal(pr.stars('1-3'), 3);
  for (const id of ['1-4', '1-8', '2-2', '2-8']) {
    assert.equal(pr.done(id), true, id + ' bleibt geschafft');
    assert.equal(pr.stars(id), 1, id + ': nur noch der Geschafft-Stern');
    assert.equal(pr.info(id).bestTime, null);
  }
  assert.equal(pr.unlocked('2-1'), true, 'Kapitel 2 bleibt offen');
  assert.equal(pr.unlocked('2-8'), true);
  assert.equal(pr.settings.aim, true);
  assert.equal(pr.state.snap && pr.state.snap.levelId, '1-3', 'ein unveraendertes Level behaelt seinen Schnappschuss');
  // Schnappschuss eines neu gebauten Levels (alte Fassung) geht beim Laden verloren, auch wenn die Migration ihn nicht kannte
  const st2 = createStorage(mem());
  const w = createSaveStore({ id: 'protoplanet', version: 3, migrations: {}, storage: st2 });
  w.save({ progress: {}, settings: {}, snap: { levelId: '1-4', rev: 1, play: createPlay(levelById('1-4')).serialize(), timeScale: 1 } });
  assert.equal(createProgress({ storage: st2 }).state.snap, null);
});

test('Spielstand mit alter Version wird beim Laden migriert (echte Ablage ueber engine/save.js, Version 1)', async () => {
  const { createSaveStore } = await import('../engine/save.js');
  const storage = createStorage(mem());
  const v1 = createSaveStore({ id: 'protoplanet', version: 1, migrations: {}, storage });
  v1.save({
    progress: { '1-1': { done: true, eff: true, fast: true, bestTime: 6, bestEject: 0.06 }, '1-6': { done: true, eff: true, fast: true }, '1-8': { done: true } },
    settings: { aim: true, vibrate: true, reduceMotion: null },
    snap: { levelId: '1-6', play: { snap: {}, rewindsLeft: 3, rewound: false }, timeScale: 1 },
  });
  const pr = createProgress({ storage });
  assert.equal(pr.stars('1-1'), 3);
  assert.equal(pr.stars('1-6'), 0);
  assert.equal(pr.done('1-8'), false);
  assert.equal(pr.unlocked('2-1'), false);
  assert.equal(pr.unlocked('1-6'), false, '1-5 wurde nie geschafft');
  assert.equal(pr.state.snap, null);
  assert.equal(pr.settings.aim, true);
});

test('Schnappschuss eines Levels mit anderer Fassung (rev) wird verworfen, ein gueltiger bleibt; P1-Schnappschuesse (10 Spalten) laden', () => {
  assert.equal(snapValid({ levelId: '1-3' }), true, 'alte Schnappschuesse ohne rev gelten fuer unveraenderte Level');
  assert.equal(snapValid({ levelId: '1-3', rev: 1 }), true);
  assert.equal(snapValid({ levelId: '1-6' }), false, 'altes 1-6 (rev 1) gegen das neue (rev 3)');
  assert.equal(snapValid({ levelId: '1-6', rev: 2 }), false, 'auch die Fassung aus P2 ist nicht mehr gueltig');
  assert.equal(snapValid({ levelId: '1-6', rev: 3 }), true);
  assert.equal(snapValid({ levelId: 'gibt-es-nicht', rev: 1 }), false);
  assert.equal(snapValid(null), false);
  // Spielstand mit einem gueltigen Schnappschuss und einem falschen
  const storage = createStorage(mem());
  const pr = createProgress({ storage });
  const play = createPlay(levelById('1-3'));
  play.advance(1);
  pr.setSnap({ levelId: '1-3', rev: 1, play: play.serialize(), timeScale: 1 });
  pr.save();
  assert.equal(createProgress({ storage }).state.snap.levelId, '1-3');
  pr.setSnap({ levelId: '1-7', rev: 2, play: play.serialize(), timeScale: 1 });
  pr.save();
  assert.equal(createProgress({ storage }).state.snap, null);
  // ein P1-Schnappschuss (Zeilen mit 10 Eintraegen, kein ai) laedt und laeuft weiter
  const s = play.serialize();
  const p1 = JSON.parse(JSON.stringify(s));
  p1.snap.b = p1.snap.b.map((r) => r.slice(0, 10));
  const again = createPlay(levelById('1-3'), p1);
  assert.ok(again.world.bodies.every((b) => b.ai === null));
  again.advance(2);
  assert.equal(again.status, 'running');
});

test('Kapitel 2 oeffnet sich mit dem Schaffen von 1-8, Level 2-1..2-8 schalten nacheinander frei', () => {
  const pr = createProgress({ storage: createStorage(mem()) });
  for (const l of LEVELS.filter((x) => x.chapter === 1)) pr.record(l.id, { time: 1, ejected: 0, eff: false, fast: false });
  assert.equal(pr.unlocked('2-1'), true);
  assert.equal(pr.unlocked('2-2'), false);
  pr.record('2-1', { time: 1, ejected: 0, eff: false, fast: false });
  assert.equal(pr.unlocked('2-2'), true);
});
