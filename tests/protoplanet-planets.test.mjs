// Protoplanet Kapitel 5 "Planetensystem" (Paket D): Planeten = Attraktoren auf festen Kreisbahnen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, snapshot, restore, attractorAt, circularSpeed } from '../games/protoplanet/physics.js';
import { orbitState, predictOrbit } from '../games/protoplanet/orbit.js';
import { createPlay } from '../games/protoplanet/play.js';
import { buildLevel } from '../games/protoplanet/gen.js';
import { levelsOf, CHAPTERS } from '../games/protoplanet/levels.js';
import { goalStatus } from '../games/protoplanet/goals.js';
import { T } from '../games/protoplanet/tune.js';

const GM = T.orbit.gm;
const planet = (r, a0, m = 3, gm = 2) => ({ x: r * Math.cos(a0), y: r * Math.sin(a0), m, kind: 'attractor', gm, po: { r, a0, w: circularSpeed(GM, r) / r } });
function world(extra = [], player = {}) {
  const s = orbitState(GM, 14, 0);
  return createWorld({ bodies: [{ x: 0, y: 0, m: 12.25, kind: 'attractor', gm: GM }, ...extra], arenaR: 0, grav: { selfGrav: 0, warnR: 60, loseR: 85 }, player: { x: s.x, y: s.y, vx: s.vx, vy: s.vy, m: 1, ...player } });
}
const run = (w, sec) => {
  for (let i = 0, n = Math.round(sec / T.dt); i < n; i++) step(w);
};

test('ein Planet läuft exakt auf seiner Kreisbahn (Ort = Funktion der Zeit)', () => {
  const w = world([planet(27, 0.7)]);
  const pl = w.bodies.find((b) => b.po);
  run(w, 40);
  const q = attractorAt(pl, w.t);
  assert.ok(Math.hypot(pl.x - q[0], pl.y - q[1]) < 1e-9);
  assert.ok(Math.abs(Math.hypot(pl.x, pl.y) - 27) < 1e-9);
});

test('Planeten verschlucken den Spieler, lassen aber anderes Material unversehrt hindurch', () => {
  const w = world([planet(27, 0, 3), { x: 27, y: 0, m: 0.3, kind: 'mote' }]);
  const pl = w.bodies.find((b) => b.po);
  const mote = w.bodies.find((b) => b.kind === 'mote');
  mote.x = pl.x;
  mote.y = pl.y;
  step(w);
  assert.ok(w.bodies.includes(mote) && mote.m > 0, 'Futter bleibt');
  const w2 = world([planet(14, 0, 3)], { x: 14, y: 0, vx: 0, vy: 0 });
  run(w2, 1);
  assert.equal(w2.player, null);
  assert.equal(w2.lostTo, 'planet');
});

test('Schnappschuss und Wiederherstellung erhalten die Planetenbahn, der Lauf bleibt identisch', () => {
  const a = world([planet(27, 1.1), planet(44, 2.2, 4, 2.5)]);
  run(a, 7);
  const b = restore(JSON.parse(JSON.stringify(snapshot(a))));
  run(a, 12);
  run(b, 12);
  assert.deepEqual(snapshot(a), snapshot(b));
  assert.ok(b.bodies.filter((x) => x.po).length === 2);
});

test('die Bahnvorschau rechnet den Planeten mit: sie weicht von der Vorschau ohne Planet ab und stimmt mit dem echten Flug überein', () => {
  const pl = planet(22, 2.0, 3, 6);
  const withP = world([pl]);
  const without = world([]);
  const pa = predictOrbit(withP);
  const pb = predictOrbit(without);
  assert.notDeepEqual(Array.from(pa.pts).slice(0, 40), Array.from(pb.pts).slice(0, 40));
  // echter Flug: nach 10 s liegt der Spieler dort, wo die Vorschau ihn erwartet (Abstand klein gegenüber der Bahngröße)
  const real = world([pl]);
  run(real, 10);
  let best = Infinity;
  for (let i = 0; i < pa.n; i++) best = Math.min(best, Math.hypot(pa.pts[2 * i] - real.player.x, pa.pts[2 * i + 1] - real.player.y));
  assert.ok(best < 0.6, 'Abstand zur Vorschau ' + best.toFixed(2));
});

test('Kapitel 5 hat 8 Levels, Ziele zählen Stern und Planeten nicht', () => {
  assert.equal(levelsOf(5).length, 8);
  assert.ok(CHAPTERS.some((c) => c.id === 5));
  for (const lv of levelsOf(5)) {
    const b = buildLevel(lv);
    assert.ok(b.bodies.some((x) => x.po), lv.id + ' hat einen Planeten');
    const p = createPlay(lv);
    if (lv.goal.type === 'last') assert.ok(goalStatus(p.world, p.goal).n >= 5);
  }
  const lv = levelsOf(5).find((l) => l.goal.type === 'largest');
  const p = createPlay(lv);
  const st = goalStatus(p.world, p.goal);
  assert.ok(st.n >= 1 && !st.done);
});
