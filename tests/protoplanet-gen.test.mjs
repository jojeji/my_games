import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, checkRules, FAMILIES, RULES, buildLevel } from '../games/protoplanet/gen.js';
import { LEVELS, CHAPTERS, levelById, nextLevel } from '../games/protoplanet/levels.js';
import { createWorld } from '../games/protoplanet/physics.js';

// Die Familien aus P1/P2 (wolke, ziel, strom, enge, brocken, jaeger) kommen seit Paket A in keinem Level mehr vor (die Level nutzen `welt`), bleiben aber als Familien fuer spaeter
// (Tageslevel): ihre Grundregeln pruefen wir mit den alten Parametern
const LEGACY = [
  { id: 'wolke (P1)', family: 'wolke', goal: { type: 'last' }, params: { R: 13, nSmall: 13, sLo: 0.1, sHi: 0.85, sSkew: 1.5, vSmall: 0.05, keepOut: 2.5, nBig: 1, bLo: 1.1, bHi: 1.2, vBig: 0 } },
  { id: 'ziel (P1)', family: 'ziel', goal: { type: 'absorb' }, params: { R: 20, nSmall: 19, sLo: 0.1, sHi: 0.85, sSkew: 1.5, vSmall: 0.03, keepOut: 3, tLo: 1.5, tHi: 1.7, tDistLo: 15, tDistHi: 17, vT: 0, slack: 2 } },
  { id: 'brocken (P2)', family: 'brocken', goal: { type: 'largest' }, params: { R: 17, nSmall: 20, sLo: 0.1, sHi: 0.85, sSkew: 1.5, vSmall: 0.03, keepOut: 3, nRock: 1, rLo: 3.6, rHi: 4.2, rMin: 9, rockKeep: 8, vRock: 0.01, nMid: 4, mLo: 1.1, mHi: 1.9, vMid: 0.01 } },
  { id: 'jaeger (P2)', family: 'jaeger', goal: { type: 'mass' }, params: { R: 22, nSmall: 28, sLo: 0.15, sHi: 0.85, sSkew: 1.5, vSmall: 0.03, keepOut: 2.5, nHunter: 2, hLo: 1.3, hHi: 1.7, hMin: 8, hDiffs: ['easy', 'easy'], nRock: 1, rLo: 5, rHi: 6, rMin: 12, rockKeep: 10, vRock: 0.01, nMid: 2, mLo: 1.1, mHi: 1.6, vMid: 0.01, mFrac: 0.28 } },
  { id: 'strom (P1)', family: 'strom', goal: { type: 'last' }, params: { R: 14, rho0: 4, rho1: 12, nSmall: 12, sLo: 0.1, sHi: 0.85, sSkew: 1.5, vS: 0.1, vN: 0.02, nBig: 0 } },
  { id: 'enge (P1)', family: 'enge', goal: { type: 'last' }, params: { R: 15, nBig: 3, bLo: 1.1, bHi: 1.3, vBig: 0, bGap: 3, keepOut: 2, nSmall: 16, sLo: 0.15, sHi: 0.85, sSkew: 1.5, vSmall: 0.05 } },
];
const levelsWithFamily = LEVELS.filter((l) => l.family !== 'hand');
const familyLevels = [...levelsWithFamily.filter((l) => l.family !== 'orbit'), ...LEGACY]; // Kapitel 3 (Familie orbit) hat eigene Regeln: tests/protoplanet-orbit.test.mjs
const CH12 = LEVELS.filter((l) => l.chapter <= 2); // Kapitel 1 und 2: Arena, Spieler in der Mitte
const seeds = Array.from({ length: 60 }, (_, i) => 1 + i * 17);

test('jede Familie ist durch ein Level oder einen Altbestand abgedeckt, alle Level-Familien sind bekannt', () => {
  for (const f of Object.keys(FAMILIES)) assert.ok([...familyLevels, ...levelsWithFamily].some((l) => l.family === f), f);
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
      if (lv.family === 'brocken' || lv.family === 'jaeger') for (const b of res.bodies.filter((x) => x.tag === 'rock')) assert.ok(Math.hypot(b.vx, b.vy) <= 0.05, 'Brocken ruhen (fast)');
      if (lv.family === 'jaeger' || (lv.params && lv.params.hunters)) assert.ok(res.bodies.some((b) => b.kind === 'hunter' && b.hunter && b.hunter.diff), 'mindestens ein Jaeger');
      if (lv.family === 'welt') {
        // lebendige Welt: Koerper treiben, Starthilfe nahe am Spieler, grosse Koerper weit auseinander
        const speed = res.bodies.reduce((s, b) => s + Math.hypot(b.vx, b.vy), 0) / res.bodies.length;
        assert.ok(lv.family !== 'welt' || speed > 0.05, `${lv.id} Seed ${seed}: Welt steht still (${speed.toFixed(3)})`);
        assert.ok(res.bodies.some((b) => b.m < 0.9 && Math.hypot(b.x, b.y) <= 8), 'Starthilfe nahe am Spieler');
        const bigs = res.bodies.filter((b) => b.m >= 1.4 && b.kind !== 'hunter');
        for (let i = 0; i < bigs.length; i++) for (let j = i + 1; j < bigs.length; j++) assert.ok(Math.hypot(bigs[i].x - bigs[j].x, bigs[i].y - bigs[j].y) >= 9.5, `${lv.id}: grosse Koerper zu dicht beieinander`);
      }
      if (goal.type === 'absorb') assert.equal(res.bodies.filter((b) => b.tag === 'target').length, 1);
    }
    assert.ok(attemptsTotal / seeds.length < 12, `${lv.id}: Generator braucht im Mittel ${attemptsTotal / seeds.length} Versuche`);
  }
});

test('gleicher Seed = gleiches Level, anderer Seed = anderes Level', () => {
  for (const lv of familyLevels) {
    const a = JSON.stringify(generate(lv.family, lv.params, 77));
    assert.equal(a, JSON.stringify(generate(lv.family, lv.params, 77)));
    assert.notEqual(a, JSON.stringify(generate(lv.family, lv.params, 78)));
  }
});

test('Spieler startet mit Masse 1 in der Mitte und ruht (Kapitel 1 und 2; Kapitel 3 startet auf einer Kreisbahn: tests/protoplanet-orbit.test.mjs)', () => {
  for (const lv of CH12) {
    const b = buildLevel(lv);
    const w = createWorld(b);
    assert.equal(w.player.m, 1);
    assert.deepEqual([w.player.x, w.player.y, w.player.vx, w.player.vy], [0, 0, 0, 0]);
    assert.ok(b.arenaR > 5);
  }
});

test('Lehrlevels und feste Levels erfuellen die Grundregeln (soweit sie fuer Lehrlevels gelten)', () => {
  for (const lv of CH12) {
    const b = buildLevel(lv);
    const goal = { ...(b.goal || {}), ...lv.goal };
    if (lv.family === 'hand') {
      // von Hand gebaut: Ueberlappung/Arena/Abstand pruefen, die Massenregel nur grob
      const bad = checkRules({ bodies: b.bodies, arenaR: b.arenaR, goal: { ...goal, slack: 1 } });
      assert.deepEqual(bad, [], lv.id);
    } else assert.deepEqual(checkRules({ bodies: b.bodies, arenaR: b.arenaR, goal }), [], lv.id);
  }
});

test('Kapitel 1: 8 Levels, 3 Lehrlevels mit Bedienhilfe, 1-4..1-8 lebendige Welten (Familie welt); Kapitel 2: 8 Levels', () => {
  assert.equal(CHAPTERS.length, 3);
  const c1 = LEVELS.filter((l) => l.chapter === 1);
  const c2 = LEVELS.filter((l) => l.chapter === 2);
  assert.equal(c1.length, 8);
  assert.equal(c2.length, 8);
  assert.equal(LEVELS.length, 24);
  assert.equal(new Set(LEVELS.map((l) => l.id)).size, 24);
  assert.deepEqual(c1.slice(0, 3).map((l) => l.family), ['hand', 'hand', 'hand']);
  for (const l of c1.slice(0, 3)) assert.ok(l.hint && l.hint.text && l.hint.until, l.id);
  assert.deepEqual(c1.slice(3).map((l) => l.family), ['welt', 'welt', 'welt', 'welt', 'welt']);
  assert.deepEqual(c1.slice(3).map((l) => l.rev), [3, 3, 3, 3, 3]); // umgebaut: alte Schnappschuesse werden verworfen, Spielstand-Migration 2 -> 3
  assert.deepEqual(c1.slice(0, 3).map((l) => l.rev), [undefined, undefined, undefined]);
  for (const l of LEVELS) {
    assert.ok(l.targets.eject > 0 && l.targets.time > 0, l.id);
    assert.ok(['largest', 'last', 'absorb', 'mass'].includes(l.goal.type), l.id);
    assert.ok(l.title && l.title.length > 2, l.id);
  }
  assert.equal(new Set(LEVELS.map((l) => l.title)).size, 24, 'jedes Level hat einen eigenen Namen');
  assert.equal(levelById('1-4').family, 'welt');
  assert.equal(nextLevel('1-8').id, '2-1');
  assert.equal(nextLevel('2-8').id, '3-1');
  assert.equal(nextLevel('3-8'), null);
  assert.equal(nextLevel('1-1').id, '1-2');
  // Ziele gemischt: in jedem Kapitel mindestens drei verschiedene
  for (const c of [c1, c2]) assert.ok(new Set(c.map((l) => l.goal.type)).size >= 3);
});

test('Kapitel 2: Lehrlevel mit einem langsamen Jaeger und Bedienhilfe, danach lebendige Welten mit Jaegern, ab der Mitte Stufe normal, am Ende mindestens ein harter', () => {
  const c2 = LEVELS.filter((l) => l.chapter === 2);
  assert.equal(c2[0].family, 'hand');
  assert.match(c2[0].hint.text, /Jäger stoßen selbst aus/);
  const b = buildLevel(c2[0]);
  const hunters = b.bodies.filter((x) => x.kind === 'hunter');
  assert.equal(hunters.length, 1);
  assert.equal(hunters[0].ai.diff, 'easy');
  assert.equal(c2[0].goal.label, 'Absorbiere den Jäger');
  for (const l of c2.slice(1)) assert.equal(l.family, 'welt', l.id);
  const goals = new Set(c2.map((l) => l.goal.type));
  for (const t of ['last', 'largest', 'mass', 'absorb']) assert.ok(goals.has(t), t);
  const diffsOf = (l) => buildLevel(l).bodies.filter((x) => x.kind === 'hunter').map((x) => x.ai.diff);
  for (const l of c2) assert.ok(diffsOf(l).length >= 1, l.id);
  for (const l of c2.slice(3)) assert.ok(diffsOf(l).includes('normal') || diffsOf(l).includes('hard'), `${l.id}: ab der Mitte mindestens ein normaler Jaeger`);
  for (const id of ['2-7', '2-8']) assert.ok(diffsOf(levelById(id)).includes('hard'), `${id}: ein harter Jaeger`);
  assert.ok(buildLevel(c2[7]).arenaR > buildLevel(c2[1]).arenaR);
});

test('Kapitel 1: 1-6 und 1-7 haben einen langsamen Brocken mit 6-7 Startmassen (Ziel unangreifbar), 1-4 und 1-8 Masse-Ziele mit hohem Wert', () => {
  for (const id of ['1-6', '1-7']) {
    const lv = levelById(id);
    const rocks = buildLevel(lv).bodies.filter((x) => x.tag === 'rock');
    assert.equal(rocks.length, 1, id);
    assert.ok(rocks[0].m >= 6 && rocks[0].m <= 7, `${id}: ${rocks[0].m}`);
    assert.ok(Math.hypot(rocks[0].vx, rocks[0].vy) > 0.02 && Math.hypot(rocks[0].vx, rocks[0].vy) < 0.2, `${id}: der Brocken bewegt sich langsam`);
    assert.equal(lv.goal.type, 'largest');
  }
  assert.ok(buildLevel(levelById('1-4')).goal.value >= 12);
  assert.ok(buildLevel(levelById('1-8')).goal.value >= 24);
});

test('Massenleiter: jedes Familienlevel hat Futter in Stufen (Staub, Kleine, Mittlere, Grosse), die Welt lebt (mittlere Geschwindigkeit >= 0,08), Arenen bis R 56 und bis ~140 Koerper', () => {
  for (const lv of LEVELS.filter((l) => l.family === 'welt')) {
    const b = buildLevel(lv);
    const bs = b.bodies;
    const speed = bs.reduce((s, x) => s + Math.hypot(x.vx, x.vy), 0) / bs.length;
    assert.ok(speed >= 0.08, `${lv.id}: mittlere Geschwindigkeit ${speed.toFixed(3)}`);
    const tier = (lo, hi) => bs.filter((x) => x.m >= lo && x.m < hi && x.kind !== 'hunter').length;
    assert.ok(tier(0, 0.5) >= 20 && tier(0.5, 1) >= 8, `${lv.id}: Staub und Kleine`);
    assert.ok(tier(1.1, 2) + tier(2, 99) >= 3 || lv.goal.type === 'last', `${lv.id}: Mittlere und Grosse`);
    assert.ok(b.arenaR >= 26 && b.arenaR <= 56, `${lv.id}: R ${b.arenaR}`);
    assert.ok(bs.length >= 40 && bs.length <= 140, `${lv.id}: ${bs.length} Koerper`);
  }
});

test('Schwierigkeit steigt: Arenen und Zahl der Koerper wachsen zum Ende des Kapitels, die Finale sind die groessten Level', () => {
  const R = (id) => buildLevel(levelById(id)).arenaR;
  const N = (id) => buildLevel(levelById(id)).bodies.length;
  assert.ok(R('1-8') > R('1-4') && N('1-8') > N('1-4'), 'Finale Kapitel 1 groesser als 1-4');
  assert.ok(R('2-8') > R('2-2') && N('2-8') > N('2-2'), 'Finale Kapitel 2 groesser als 2-2');
  assert.ok(R('1-8') >= R('1-7') && R('2-7') >= R('2-4'));
  assert.ok(levelById('1-8').targets.time >= levelById('1-4').targets.time, 'das Finale dauert laenger');
});
