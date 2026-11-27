import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMelody, parseNote, staffStep, fingerOf, noteColor, NOTE_COLORS } from '../games/inselmelodie/music.js';
import { ISLANDS, ANIMALS, findTask, say, SAY } from '../games/inselmelodie/world.js';
import { createRun, starsFor, noteGameNotes, defaultProgress, record, nextTask, islandOpen, COLLECT } from '../games/inselmelodie/session.js';
import { existsSync } from 'node:fs';

test('Notenschrift: parseNote, parseMelody, Lage im Notensystem', () => {
  assert.equal(parseNote('C4'), 60);
  assert.equal(parseNote('H4'), 71);
  assert.equal(parseNote('Fis4'), 66);
  assert.throws(() => parseNote('B4')); // B ist im Deutschen das erniedrigte H: nicht als Stammton schreiben
  const m = parseMelody('G4 E4 E4:2 | F4');
  assert.deepEqual(m.map((n) => [n.midi, n.beats, n.bar]), [[67, 1, false], [64, 1, false], [64, 2, true], [65, 1, true]]);
  assert.deepEqual(staffStep(60), { step: 0, sharp: false }); // Mittel-C: Hilfslinie
  assert.deepEqual(staffStep(64), { step: 2, sharp: false }); // E: unterste Linie
  assert.deepEqual(staffStep(71), { step: 6, sharp: false }); // H: Mittellinie
  assert.deepEqual(staffStep(66), { step: 3, sharp: true });
  assert.equal(fingerOf(60), 1);
  assert.equal(fingerOf(67), 5);
  assert.equal(fingerOf(69), null);
  assert.equal(fingerOf(48), 5); // linke Hand: kleiner Finger auf dem tiefen C
  assert.equal(fingerOf(55), 1); // Daumen auf dem G
  assert.equal(fingerOf(57), null);
  assert.equal(noteColor(72), NOTE_COLORS.C);
});

test('Jedes Stück nutzt nur Noten, die VORHER eingeführt sind (Reihenfolge der Aufgaben)', () => {
  const known = new Set();
  for (const isl of ISLANDS) {
    for (const t of isl.tasks) {
      if (t.kind === 'learn') known.add(t.note);
      const notes = t.kind === 'song' ? t.notes.map((n) => n.midi) : t.kind === 'game' ? t.pool : [];
      for (const m of notes) {
        assert.ok(known.has(m), `${isl.name} / ${t.title}: Note ${m} ist noch nicht eingeführt`);
        assert.ok(m >= isl.range[0] && m <= isl.range[1], `${t.title}: ${m} liegt außerhalb der Tastatur`);
      }
    }
  }
});

test('Stücke: eindeutige ids, Notenwerte darstellbar, Herkunft angegeben', () => {
  const ids = new Set();
  for (const isl of ISLANDS) for (const t of isl.tasks) {
    assert.ok(!ids.has(t.id), 'doppelte id ' + t.id);
    ids.add(t.id);
    if (t.kind !== 'song') continue;
    assert.ok(t.own || t.trad, `${t.title}: eigenes Stück oder gemeinfreie Herkunft angeben`);
    for (const n of t.notes) assert.ok([1, 2, 3, 4].includes(n.beats), `${t.title}: Notenwert ${n.beats}`);
    assert.ok(t.notes.length >= 6);
  }
  assert.ok(findTask('haenschen'));
});

test('Bilder zu allen Inseln und Tieren sind vorhanden', () => {
  const img = (n) => new URL(`../games/inselmelodie/img/${n}.webp`, import.meta.url);
  for (const isl of ISLANDS) assert.ok(existsSync(img(isl.img)), isl.img);
  for (const a of Object.values(ANIMALS)) assert.ok(existsSync(img(a.img)), a.img);
  for (const c of Object.values(COLLECT)) assert.ok(existsSync(img(c)), c);
  for (const m of ['neutral', 'jubel', 'zeigt', 'staunt']) assert.ok(existsSync(img('papagei-' + m)));
});

test('Texte: kein fester Name für den Papagei, Platzhalter werden ersetzt', () => {
  for (const [k, t] of Object.entries(SAY)) assert.ok(!/Kiki|Coco|Pepe|Lori|Mango/.test(t), k);
  assert.equal(say('named', { B: 'Lori' }).includes('Lori'), true);
});

test('Wartemodus: Treffer, Fehlgriffe, Sterne', () => {
  const run = createRun(parseMelody('C4 D4 E4'));
  assert.equal(run.input(62).result, 'miss');
  assert.equal(run.input(62).result, 'miss'); // dieselbe Note: zählt einmal
  assert.equal(run.index, 0);
  assert.equal(run.input(60).result, 'hit');
  assert.equal(run.input(62).result, 'hit');
  assert.equal(run.input(64).result, 'hit');
  assert.ok(run.done);
  assert.equal(run.input(60).result, 'done');
  assert.equal(run.misses, 1);
  assert.equal(run.wrongPresses, 2);
  assert.equal(starsFor(0, 24), 3);
  assert.equal(starsFor(3, 16), 2); // Hänschen klein mit 3 verfehlten Noten: noch 2 Sterne
  assert.equal(starsFor(4, 16), 2);
  assert.equal(starsFor(5, 16), 1);
  assert.equal(starsFor(1, 5), 2);
  assert.equal(starsFor(1, 16, true), 3);
  assert.equal(starsFor(5, 16, true), 2);
  assert.equal(starsFor(6, 16, true), 1);
});

test('Notenspiel: jede Note des Vorrats kommt vor, keine direkte Wiederholung, fester Seed', () => {
  const pool = [60, 62, 64, 65, 67];
  for (let seed = 1; seed < 30; seed++) {
    const ns = noteGameNotes(pool, 12, seed).map((n) => n.midi);
    assert.equal(ns.length, 12);
    for (const m of pool) assert.ok(ns.includes(m));
    for (let i = 1; i < ns.length; i++) assert.notEqual(ns[i], ns[i - 1], `seed ${seed}`);
    assert.deepEqual(ns, noteGameNotes(pool, 12, seed).map((n) => n.midi));
  }
});

test('Fortschritt: Inseln öffnen nacheinander, Sammelstück bei geschaffter Insel, Weiter üben', () => {
  const p = defaultProgress();
  p.settings.allOpen = false;
  assert.equal(islandOpen(p, 0), true);
  assert.equal(islandOpen(p, 1), false);
  assert.equal(islandOpen(p, 4), false); // "bald"
  assert.equal(nextTask(p).task.id, 'tour');
  record(p, 'tour', 0);
  record(p, 'learn-C4', 0);
  const r = record(p, 'erster-ton', 2);
  assert.equal(r.collect, 'muschel');
  assert.deepEqual(p.collect, ['muschel']);
  assert.equal(islandOpen(p, 1), true);
  assert.equal(nextTask(p).task.id, 'learn-D4');
  assert.equal(record(p, 'erster-ton', 3).better, true);
  assert.equal(p.tasks['erster-ton'].stars, 3);
  assert.equal(record(p, 'erster-ton', 1).collect, null); // nur einmal
  assert.equal(p.tasks['erster-ton'].stars, 3);
});

test('Notensystem: Violinschlüssel, Bassschlüssel oder beide, je nach Noten', async () => {
  const { staffLayout, clefFor } = await import('../games/inselmelodie/staff.js');
  assert.equal(staffLayout([60, 64, 72]).kind, 'treble');
  assert.equal(staffLayout([48, 52, 55]).kind, 'bass');
  const g = staffLayout([48, 60]);
  assert.equal(g.kind, 'grand');
  assert.equal(clefFor(g, 60), 't'); // Mittel-C spielt die rechte Hand
  assert.equal(clefFor(g, 59), 'b');
  // jede Insel ab der Höhle hat tiefe Töne, die Tastatur reicht dafür
  for (const isl of ISLANDS.slice(4)) {
    const notes = isl.tasks.flatMap((t) => (t.notes ? t.notes.map((n) => n.midi) : t.pool || []));
    assert.ok(notes.some((m) => m < 60), isl.name);
    assert.ok(isl.range[0] <= Math.min(...notes) && isl.range[1] >= Math.max(...notes), isl.name);
  }
});

test('Stücke der linken Hand und beider Hände bleiben in den Fünf-Finger-Lagen (C3-G3 links, C4-G4 rechts)', () => {
  for (const isl of ISLANDS.slice(4)) for (const t of isl.tasks) {
    for (const m of t.notes ? t.notes.map((n) => n.midi) : t.pool || []) {
      assert.ok(fingerOf(m), `${t.title}: Note ${m} ohne Finger in der C-Lage`);
    }
  }
});
