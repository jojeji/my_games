import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, checkRules, FAMILIES, RULES, buildLevel } from '../games/protoplanet/gen.js';
import { LEVELS, CHAPTERS, levelById, nextLevel } from '../games/protoplanet/levels.js';
import { createWorld } from '../games/protoplanet/physics.js';

const familyLevels = LEVELS.filter((l) => l.family !== 'hand');
const seeds = Array.from({ length: 60 }, (_, i) => 1 + i * 17);

test('jede Familie wird von mindestens einem Level benutzt, alle Familien sind bekannt', () => {
  for (const f of Object.keys(FAMILIES)) assert.ok(familyLevels.some((l) => l.family === f), f);
  for (const l of familyLevels) assert.ok(FAMILIES[l.family], l.id);
});

test('Grundregeln gelten fuer jede Familie ueber viele Seeds', () => {
  for (const lv of familyLevels) {
    let attemptsTotal = 0;
    for (const seed of seeds) {
      const res = generate(lv.family, lv.params, seed, lv.goal);
      attemptsTotal += res.attempts;
      const goal = res.goal; // Zieltyp vom Level, Parameter (value, slack) von der Familie
      assert.equal(goal.type, lv.goal.type);
      assert.deepEqual(checkRules({ bodies: res.bodies, arenaR: res.arenaR, goal }), [], `${lv.id} Seed ${seed}`);
      // unabhaengig nachgerechnet: Startabstand, Ueberlappung, Masse
      const R = res.arenaR;
      for (const b of res.bodies) {
        const r = Math.sqrt(b.m);
        assert.ok(Math.hypot(b.x, b.y) + r <= R, 'in der Arena');
        assert.ok(Math.hypot(b.x, b.y) > 1 + r, 'nicht auf dem Spieler');
        if (b.m >= 0.9) {
          // geradlinige Vorhersage, 5 s, Spieler ruht in der Mitte: Abstand der Raender >= 3 Spielerradien
          for (let t = 0; t <= RULES.lookahead; t += 0.05) {
            const d = Math.hypot(b.x + b.vx * t, b.y + b.vy * t) - r - 1;
            assert.ok(d >= RULES.clearance - 1e-9, `${lv.id} Seed ${seed}: groesserer Koerper zu nah (${d.toFixed(2)})`);
          }
        }
      }
      for (let i = 0; i < res.bodies.length; i++)
        for (let j = i + 1; j < res.bodies.length; j++) {
          const a = res.bodies[i];
          const b = res.bodies[j];
          assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= Math.sqrt(a.m) + Math.sqrt(b.m), 'keine Ueberlappung');
        }
      const small = res.bodies.filter((b) => b.m < 0.9);
      assert.ok(small.some((b) => Math.hypot(b.x, b.y) <= RULES.reach), 'kleinerer Koerper in Reichweite');
      const total = res.bodies.reduce((s, b) => s + b.m, 0);
      if (goal.type === 'mass') assert.ok(1 + total >= goal.value, 'Masse reicht');
      if (goal.type === 'largest') assert.ok(res.bodies.some((b) => b.m >= 1), 'es gibt etwas Groesseres');
      if (goal.type === 'last') assert.ok(res.bodies.filter((b) => b.m >= 0.03).length >= 8, 'genug Koerper, die zaehlen');
      if (goal.type === 'absorb') assert.equal(res.bodies.filter((b) => b.tag === 'target').length, 1);
    }
    assert.ok(attemptsTotal / seeds.length < 8, `${lv.id}: Generator braucht im Mittel ${attemptsTotal / seeds.length} Versuche`);
  }
});

test('gleicher Seed = gleiches Level, anderer Seed = anderes Level', () => {
  for (const lv of familyLevels) {
    const a = JSON.stringify(generate(lv.family, lv.params, 77));
    assert.equal(a, JSON.stringify(generate(lv.family, lv.params, 77)));
    assert.notEqual(a, JSON.stringify(generate(lv.family, lv.params, 78)));
  }
});

test('Spieler startet mit Masse 1 in der Mitte und ruht', () => {
  for (const lv of LEVELS) {
    const b = buildLevel(lv);
    const w = createWorld(b);
    assert.equal(w.player.m, 1);
    assert.deepEqual([w.player.x, w.player.y, w.player.vx, w.player.vy], [0, 0, 0, 0]);
    assert.ok(b.arenaR > 5);
  }
});

test('Lehrlevels und feste Levels erfuellen die Grundregeln (soweit sie fuer Lehrlevels gelten)', () => {
  for (const lv of LEVELS) {
    const b = buildLevel(lv);
    const goal = { ...(b.goal || {}), ...lv.goal };
    if (lv.family === 'hand') {
      // von Hand gebaut: Ueberlappung/Arena/Abstand pruefen, die Massenregel nur grob
      const bad = checkRules({ bodies: b.bodies, arenaR: b.arenaR, goal: { ...goal, slack: 1 } });
      assert.deepEqual(bad, [], lv.id);
    } else assert.deepEqual(checkRules({ bodies: b.bodies, arenaR: b.arenaR, goal }), [], lv.id);
  }
});

test('Kapitel 1: 8 Levels, 3 Lehrlevels mit Bedienhilfe, 5 aus Familien, jede Familie vertreten', () => {
  assert.equal(CHAPTERS.length, 1);
  assert.equal(LEVELS.length, 8);
  const ids = new Set(LEVELS.map((l) => l.id));
  assert.equal(ids.size, 8);
  assert.deepEqual(LEVELS.slice(0, 3).map((l) => l.family), ['hand', 'hand', 'hand']);
  for (const l of LEVELS.slice(0, 3)) assert.ok(l.hint && l.hint.text && l.hint.until, l.id);
  assert.deepEqual(LEVELS.slice(3).map((l) => l.family).sort(), ['enge', 'strom', 'wolke', 'wolke', 'ziel']);
  for (const l of LEVELS) {
    assert.ok(l.targets.eject > 0 && l.targets.time > 0, l.id);
    assert.ok(['largest', 'last', 'absorb', 'mass'].includes(l.goal.type), l.id);
  }
  assert.equal(levelById('1-4').family, 'wolke');
  assert.equal(nextLevel('1-8'), null);
  assert.equal(nextLevel('1-1').id, '1-2');
});

test('Schwierigkeit steigt: Arena und Vorrat wachsen, mehr/groessere Hindernisse in den spaeteren Familienlevels', () => {
  const sizes = familyLevels.map((l) => buildLevel(l).arenaR);
  assert.ok(sizes[sizes.length - 2] >= sizes[0], 'spaetere Levels sind nicht kleiner');
  const bigMass = (l) => buildLevel(l).bodies.filter((b) => b.m >= 1).reduce((s, b) => s + b.m, 0);
  assert.ok(bigMass(levelById('1-7')) > bigMass(levelById('1-4')), '1-7 hat mehr Hindernismasse als 1-4');
  assert.ok(bigMass(levelById('1-8')) > bigMass(levelById('1-4')), '1-8 hat mehr Hindernismasse als 1-4');
});
