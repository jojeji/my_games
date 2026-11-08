import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, checkRules, FAMILIES, RULES, buildLevel } from '../games/protoplanet/gen.js';
import { LEVELS, CHAPTERS, levelById, nextLevel } from '../games/protoplanet/levels.js';
import { createWorld } from '../games/protoplanet/physics.js';

// strom und enge (Kapitel 1 in P1) kommen in keinem Level mehr vor, bleiben aber als Familien fuer spaeter (Tageslevel): ihre Grundregeln pruefen wir mit den alten Parametern
const LEGACY = [
  { id: 'strom (P1)', family: 'strom', goal: { type: 'last' }, params: { R: 14, rho0: 4, rho1: 12, nSmall: 12, sLo: 0.1, sHi: 0.85, sSkew: 1.5, vS: 0.1, vN: 0.02, nBig: 0 } },
  { id: 'enge (P1)', family: 'enge', goal: { type: 'last' }, params: { R: 15, nBig: 3, bLo: 1.1, bHi: 1.3, vBig: 0, bGap: 3, keepOut: 2, nSmall: 16, sLo: 0.15, sHi: 0.85, sSkew: 1.5, vSmall: 0.05 } },
];
const levelsWithFamily = LEVELS.filter((l) => l.family !== 'hand');
const familyLevels = [...levelsWithFamily, ...LEGACY];
const seeds = Array.from({ length: 60 }, (_, i) => 1 + i * 17);

test('jede Familie ist durch ein Level oder einen Altbestand abgedeckt, alle Level-Familien sind bekannt', () => {
  for (const f of Object.keys(FAMILIES)) assert.ok(familyLevels.some((l) => l.family === f), f);
  for (const l of levelsWithFamily) assert.ok(FAMILIES[l.family], l.id);
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
      if (lv.family === 'brocken') assert.ok(res.bodies.some((b) => b.tag === 'rock' && b.m >= 3 && b.m <= 6), 'ein Brocken mit 3-6 Startmassen');
      for (const b of res.bodies.filter((x) => x.tag === 'rock')) assert.ok(Math.hypot(b.vx, b.vy) <= 0.05, 'Brocken ruhen (fast)');
      if (lv.family === 'jaeger') assert.ok(res.bodies.some((b) => b.kind === 'hunter' && b.hunter && b.hunter.diff), 'mindestens ein Jaeger');
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

test('Kapitel 1: 8 Levels, 3 Lehrlevels mit Bedienhilfe, 1-4/1-5 aus Familien, 1-6..1-8 Brocken; Kapitel 2: 8 Levels', () => {
  assert.equal(CHAPTERS.length, 2);
  const c1 = LEVELS.filter((l) => l.chapter === 1);
  const c2 = LEVELS.filter((l) => l.chapter === 2);
  assert.equal(c1.length, 8);
  assert.equal(c2.length, 8);
  assert.equal(LEVELS.length, 16);
  assert.equal(new Set(LEVELS.map((l) => l.id)).size, 16);
  assert.deepEqual(c1.slice(0, 3).map((l) => l.family), ['hand', 'hand', 'hand']);
  for (const l of c1.slice(0, 3)) assert.ok(l.hint && l.hint.text && l.hint.until, l.id);
  assert.deepEqual(c1.slice(3).map((l) => l.family), ['wolke', 'ziel', 'brocken', 'brocken', 'brocken']);
  assert.deepEqual(c1.slice(5).map((l) => l.rev), [2, 2, 2]); // umgebaut: alte Schnappschuesse werden verworfen
  assert.deepEqual(c1.slice(0, 5).map((l) => l.rev), [undefined, undefined, undefined, undefined, undefined]);
  for (const l of LEVELS) {
    assert.ok(l.targets.eject > 0 && l.targets.time > 0, l.id);
    assert.ok(['largest', 'last', 'absorb', 'mass'].includes(l.goal.type), l.id);
  }
  assert.equal(levelById('1-4').family, 'wolke');
  assert.equal(nextLevel('1-8').id, '2-1');
  assert.equal(nextLevel('2-8'), null);
  assert.equal(nextLevel('1-1').id, '1-2');
});

test('Kapitel 2: Lehrlevel mit einem langsamen Jaeger und Bedienhilfe, danach Jaeger-Familie, Ziele gemischt', () => {
  const c2 = LEVELS.filter((l) => l.chapter === 2);
  assert.equal(c2[0].family, 'hand');
  assert.match(c2[0].hint.text, /Jäger stoßen selbst aus/);
  const b = buildLevel(c2[0]);
  const hunters = b.bodies.filter((x) => x.kind === 'hunter');
  assert.equal(hunters.length, 1);
  assert.equal(hunters[0].ai.diff, 'easy');
  assert.equal(c2[0].goal.label, 'Absorbiere den Jäger');
  for (const l of c2.slice(1)) assert.equal(l.family, 'jaeger', l.id);
  const goals = new Set(c2.map((l) => l.goal.type));
  for (const t of ['last', 'largest', 'mass', 'absorb']) assert.ok(goals.has(t), t);
  for (const l of c2) assert.ok(buildLevel(l).bodies.some((x) => x.kind === 'hunter'), l.id);
  // die Level werden zum Ende hin groesser
  assert.ok(buildLevel(c2[7]).arenaR > buildLevel(c2[1]).arenaR);
});

test('Kapitel 1: 1-6..1-8 haben Brocken mit 3-6 Startmassen und die Ziele unangreifbar/Masse', () => {
  for (const id of ['1-6', '1-7', '1-8']) {
    const lv = levelById(id);
    const rocks = buildLevel(lv).bodies.filter((x) => x.tag === 'rock');
    assert.ok(rocks.length >= 1 && rocks.length <= 2, id);
    for (const r of rocks) assert.ok(r.m >= 3 && r.m <= 6, `${id}: ${r.m}`);
    assert.ok(['largest', 'mass'].includes(lv.goal.type), id);
  }
});

test('Schwierigkeit steigt: Arena und Vorrat wachsen, mehr/groessere Hindernisse in den spaeteren Familienlevels', () => {
  const R = (id) => buildLevel(levelById(id)).arenaR;
  assert.ok(R('1-8') > R('1-4'), 'die Arena von 1-8 ist groesser als die von 1-4');
  assert.ok(R('2-8') >= R('2-2'), 'das letzte Level des Kapitels 2 ist groesser als das erste Familienlevel');
  const bigMass = (l) => buildLevel(l).bodies.filter((b) => b.m >= 1).reduce((s, b) => s + b.m, 0);
  assert.ok(bigMass(levelById('1-7')) > bigMass(levelById('1-4')), '1-7 hat mehr Hindernismasse als 1-4');
  assert.ok(bigMass(levelById('1-8')) > bigMass(levelById('1-4')), '1-8 hat mehr Hindernismasse als 1-4');
});
