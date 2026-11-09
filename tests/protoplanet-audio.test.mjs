import test from 'node:test';
import assert from 'node:assert/strict';
import { T } from '../games/protoplanet/tune.js';
import { createWorld } from '../games/protoplanet/physics.js';
import { CHAPTERS } from '../games/protoplanet/levels.js';
import { createProgress } from '../games/protoplanet/state.js';
import { createStorage } from '../engine/save.js';
import { createScore, createGate, moodFor, inScale, scaleMidi, scaleOf, chordNotes, musicParams, clampParams, absorbPitch, winFigure, dangerOf, sizeOf, volumeGain, makeRng } from '../games/protoplanet/audio-score.js';

const A = T.audio;
const MOODS = ['select', 1, 2, 3, 4, 5];

test('jedes Kapitel 1-5 (und die Levelauswahl) hat eine vollstaendige Stimmung, alle Kapitel des Spiels sind abgedeckt', () => {
  for (const id of MOODS) {
    const m = A.moods[id];
    assert.ok(m, `Stimmung ${id}`);
    assert.ok(A.scales[m.scale], 'Tonleiter existiert');
    assert.ok(m.root >= 36 && m.root <= 62, 'Grundton im tiefen/mittleren Bereich');
    assert.ok(m.chordEvery[0] >= 15 && m.chordEvery[1] <= 40 && m.chordEvery[0] < m.chordEvery[1], 'Akkordwechsel alle 15-40 s');
    assert.ok(m.starEvery[0] > 0 && m.starEvery[0] < m.starEvery[1]);
    assert.ok(m.bright >= 0 && m.bright <= 1 && m.cutLo < m.cutHi);
    const n = scaleOf(m).length;
    assert.ok(m.roots.every((r) => r >= 0 && r < n));
  }
  for (const ch of CHAPTERS) assert.ok(A.moods[ch.id], `Kapitel ${ch.id} hat eine Stimmung`);
  assert.equal(moodFor(99), A.moods[1], 'unbekanntes Kapitel faellt auf Kapitel 1 zurueck');
});

test('alle geplanten Toene liegen in der Tonleiter der Stimmung', () => {
  for (const id of MOODS) {
    const mood = moodFor(id);
    const sc = createScore(7, id);
    const evs = sc.plan(0, 1800, { vol: 1, noteCount: 5, starRate: 1, tempo: 1 });
    assert.ok(evs.some((e) => e.type === 'chord') && evs.some((e) => e.type === 'star'));
    for (const e of evs) {
      const notes = e.type === 'chord' ? e.notes : [e.midi];
      for (const n of notes) assert.ok(inScale(mood, n), `Kapitel ${id}: Ton ${n} nicht in der Tonleiter`);
      for (const hz of e.type === 'chord' ? e.hz : [e.hz]) assert.ok(hz > 60 && hz < 4000);
    }
  }
});

test('Akkorde wechseln alle 15-40 s (bei Tempo 1), ueberlappen, und wiederholen sich nicht stur', () => {
  const sc = createScore(3, 1);
  const chords = sc.plan(0, 3600, { vol: 1 }).filter((e) => e.type === 'chord');
  assert.ok(chords.length > 80);
  for (let i = 1; i < chords.length; i++) {
    const gap = chords[i].t - chords[i - 1].t;
    assert.ok(gap >= 15 * 0.999 && gap <= 40 / 0.7, `Abstand ${gap}`);
    assert.ok(chords[i - 1].t + chords[i - 1].dur > chords[i].t, 'Akkorde ueberlappen (kein Loch)');
  }
  const kinds = new Set(chords.map((c) => c.notes.join(',')));
  assert.ok(kinds.size >= 4, 'mehrere verschiedene Akkorde');
});

test('Planung ist bei gleichem Seed gleich, bei anderem Seed anders, und unabhaengig von der Fenstergroesse', () => {
  const a = createScore(42, 2).plan(0, 600, { vol: 1 });
  const b = createScore(42, 2).plan(0, 600, { vol: 1 });
  const c = createScore(43, 2).plan(0, 600, { vol: 1 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  const s = createScore(42, 2);
  const parts = [];
  for (let t = 0; t < 600; t += 2.2) parts.push(...s.plan(t, t + 2.2, { vol: 1 }));
  assert.deepEqual(parts, a, 'blockweises Planen (wie audio.pump) ergibt denselben Plan');
});

test('Lautstaerke 0 erzeugt keine Planung; danach faengt die Musik wieder von vorn an', () => {
  const s = createScore(1, 1);
  assert.deepEqual(s.plan(0, 500, { vol: 0 }), []);
  assert.deepEqual(s.plan(0, 500, { vol: 0.0005 }), []);
  const after = s.plan(500, 520, { vol: 0.5 });
  assert.ok(after.length > 0 && after[0].t >= 500, 'startet wieder bei der Gegenwart');
});

test('Stimmungswechsel: die naechsten Akkorde kommen aus der neuen Tonleiter', () => {
  const s = createScore(5, 'select');
  s.plan(0, 10, { vol: 1 });
  s.setMood(4, 10);
  const mood = moodFor(4);
  const evs = s.plan(10, 200, { vol: 1 });
  assert.ok(evs.length > 0);
  const first = evs.find((e) => e.type === 'chord');
  assert.ok(first.t <= 11.6, 'Wechsel ist bald zu hoeren');
  for (const e of evs) for (const n of e.type === 'chord' ? e.notes : [e.midi]) assert.ok(inScale(mood, n));
});

test('Drosselung begrenzt Effekte pro Sekunde und Mindestabstand', () => {
  for (const kind of ['absorb', 'eject', 'beam', 'ui', 'time']) {
    const g = createGate();
    const rule = A.sfx.gates[kind];
    let ok = 0;
    const times = [];
    for (let t = 0; t < 10; t += 0.005) {
      if (g.allow(kind, t).ok) {
        ok++;
        times.push(t);
      }
    }
    assert.ok(ok <= rule.max * 10 + 1, `${kind}: ${ok} in 10 s`);
    for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= rule.gap - 1e-9);
    for (let i = 0; i < times.length; i++) {
      const inSec = times.filter((x) => x >= times[i] && x < times[i] + 1).length;
      assert.ok(inSec <= rule.max, `${kind}: ${inSec} in einer Sekunde`);
    }
  }
});

test('viele Aufnahmen hintereinander werden zum aufsteigenden Arpeggio in der Tonleiter', () => {
  const g = createGate();
  const mood = moodFor(1);
  const midis = [];
  for (let i = 0; i < 6; i++) {
    const v = g.allow('absorb', i * 0.3);
    assert.equal(v.chain, i + 1);
    midis.push(absorbPitch(mood, 0.02, v.chain).midi);
  }
  assert.ok(midis.every((m) => inScale(mood, m)));
  assert.ok(midis[3] > midis[0] && midis[5] > midis[1], 'steigt');
  assert.equal(g.allow('absorb', 10).chain, 1, 'nach einer Pause beginnt die Kette neu');
});

test('Absorbieren: grosser Happen = tiefer, laenger, voller; Tonhoehe immer in der Tonleiter', () => {
  for (const id of MOODS) {
    const mood = moodFor(id);
    let prev = Infinity;
    for (const ratio of [0.0005, 0.005, 0.05, 0.3, 1]) {
      const p = absorbPitch(mood, ratio, 1);
      assert.ok(inScale(mood, p.midi));
      assert.ok(p.midi <= prev, 'je groesser, desto tiefer');
      prev = p.midi;
    }
    const small = absorbPitch(mood, 0.001, 1);
    const big = absorbPitch(mood, 1, 1);
    assert.ok(big.dur > small.dur && big.gain > small.gain && big.midi < small.midi);
    for (const c of [1, 2, 3, 4, 5, 6, 20]) assert.ok(inScale(mood, absorbPitch(mood, 0.03, c).midi));
    for (const n of winFigure(mood)) assert.ok(inScale(mood, n.midi));
  }
});

test('Akkordtoene: Terzschichtung innerhalb der Tonleiter, 3 bis 5 Toene', () => {
  const mood = moodFor(1);
  for (let r = 0; r < scaleOf(mood).length; r++) {
    for (const c of [3, 4, 5]) {
      const ch = chordNotes(mood, r, c);
      assert.equal(ch.length, c);
      assert.ok(ch.every((n) => inScale(mood, n)) && ch.every((n, i) => i === 0 || n > ch[i - 1]));
    }
  }
  assert.equal(scaleMidi(mood, 0), mood.root);
  assert.equal(scaleMidi(mood, scaleOf(mood).length), mood.root + 12);
});

test('Musikparameter bleiben fuer beliebige Eingaben in ihren Grenzen und reagieren in die richtige Richtung', () => {
  const rng = makeRng(9);
  for (let i = 0; i < 2000; i++) {
    const mood = moodFor(rng.pick(MOODS));
    const p = musicParams({ danger: rng.range(-1, 3), size: rng.range(-1, 3), timeScale: rng.pick([0.25, 1, 4, 10, 0, -5, NaN]), lift: rng.range(-3, 3) }, mood);
    for (const [k, [lo, hi]] of Object.entries(A.limits)) {
      assert.ok(Number.isFinite(p[k]) && p[k] >= lo && p[k] <= hi, `${k}=${p[k]}`);
    }
  }
  assert.deepEqual(Object.keys(clampParams({})).sort(), Object.keys(A.limits).sort());
  const mood = moodFor(1);
  const calm = musicParams({ danger: 0, size: 0, timeScale: 1, lift: 0 }, mood);
  const scary = musicParams({ danger: 1, size: 0, timeScale: 1, lift: 0 }, mood);
  assert.ok(scary.droneCut < calm.droneCut && scary.beatGain > calm.beatGain && scary.chordGain < calm.chordGain, 'Gefahr: dunkler, Schwebung, Akkorde leiser');
  const big = musicParams({ danger: 0, size: 1, timeScale: 1, lift: 0 }, mood);
  assert.ok(big.upperGain > calm.upperGain && big.starRate > calm.starRate && big.noteCount > calm.noteCount, 'Groesse: voller');
  const slow = musicParams({ danger: 0, size: 0, timeScale: 0.25, lift: 0 }, mood);
  const fast = musicParams({ danger: 0, size: 0, timeScale: 10, lift: 0 }, mood);
  assert.ok(slow.droneCut < calm.droneCut && calm.droneCut < fast.droneCut, 'Zeitstufe: Filter');
  const win = musicParams({ danger: 0, size: 0, timeScale: 1, lift: 1 }, mood);
  const lose = musicParams({ danger: 0, size: 0, timeScale: 1, lift: -1 }, mood);
  assert.ok(win.droneCut > calm.droneCut && lose.droneCut < calm.droneCut);
});

test('dangerOf / sizeOf: Gefahr steigt mit der Naehe eines groesseren Koerpers, Kleine zaehlen nicht', () => {
  const mk = (bodies) => createWorld({ bodies, arenaR: 40, player: { m: 1 } });
  assert.equal(dangerOf(mk([])), 0);
  assert.equal(dangerOf(mk([{ x: 3, y: 0, m: 0.5 }])), 0, 'kleiner: keine Gefahr');
  const far = dangerOf(mk([{ x: 30, y: 0, m: 2 }]));
  const mid = dangerOf(mk([{ x: 8, y: 0, m: 2 }]));
  const near = dangerOf(mk([{ x: 3, y: 0, m: 2 }]));
  assert.ok(far === 0 && mid > 0 && near > mid && near <= 1, `${far} ${mid} ${near}`);
  assert.ok(sizeOf(1) === 0 && sizeOf(100) === 1 && sizeOf(5) > 0 && sizeOf(5) < 1);
  const w = mk([]);
  w.player = null;
  assert.equal(dangerOf(w), 0);
});

test('Lautstaerke-Kurve: 0 % = stumm, 100 % = 1, monoton', () => {
  assert.equal(volumeGain(0), 0);
  assert.equal(volumeGain(100), 1);
  assert.ok(volumeGain(50) < volumeGain(70) && volumeGain(70) < volumeGain(100));
  assert.equal(volumeGain(500), 1);
  assert.equal(volumeGain(-5), 0);
});

test('Einstellungen: Standardwerte Musik 70 / Effekte 80 / Ton an, alte Spielstaende laden weiter', () => {
  const storage = createStorage(null);
  const fresh = createProgress({ storage });
  assert.deepEqual([fresh.settings.music, fresh.settings.sfx, fresh.settings.mute], [70, 80, false]);
  fresh.settings.aim = true;
  fresh.settings.music = 30;
  fresh.save();
  const again = createProgress({ storage });
  assert.equal(again.settings.aim, true);
  assert.equal(again.settings.music, 30);
  assert.equal(again.settings.sfx, 80);
  // alter Spielstand ohne Klang-Einstellungen
  const old = createProgress({ storage: createStorage(null) });
  old.state.settings = { aim: true, vibrate: false, reduceMotion: null };
  const exported = old.exportString();
  const restored = createProgress({ storage: createStorage(null) });
  restored.importString(exported);
  assert.equal(restored.settings.vibrate, false);
  assert.deepEqual([restored.settings.music, restored.settings.sfx, restored.settings.mute], [70, 80, false]);
});
