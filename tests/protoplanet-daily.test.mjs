// Protoplanet Tageslevel (Paket D): Auswahl rein aus Datum + Freischaltstufe, Serie ueber Tages-/Monats-/Jahreswechsel, alte Spielstaende, Liste vollstaendig.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dayIndex, prevKey, dateKey, dateLabel, chapterOfDay, dailyLevel, PRESETS, presetsOf } from '../games/protoplanet/daily.js';
import { DAILY } from '../games/protoplanet/daily-list.js';
import { createProgress } from '../games/protoplanet/state.js';
import { createSaveStore, createStorage } from '../engine/save.js';
import { levelsOf } from '../games/protoplanet/levels.js';

const mem = () => {
  const d = new Map();
  return { getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => d.set(k, String(v)), removeItem: (k) => d.delete(k) };
};
const fresh = () => createProgress({ storage: createStorage(mem()) });

test('Datum: lokaler Schluessel, Tag im Jahr (366 Eintraege, Schaltjahr-fest), Vortag ueber Monats- und Jahreswechsel', () => {
  assert.equal(dateKey(new Date(2026, 2, 5, 23, 59)), '2026-03-05');
  assert.equal(dayIndex('2025-01-01'), 0);
  assert.equal(dayIndex('2025-12-31'), 365);
  assert.equal(dayIndex('2024-03-14'), dayIndex('2025-03-14'), 'gleicher Kalendertag, gleicher Eintrag');
  assert.equal(new Set(Array.from({ length: 366 }, (_, i) => i)).size, 366);
  assert.equal(prevKey('2026-03-01'), '2026-02-28');
  assert.equal(prevKey('2024-03-01'), '2024-02-29');
  assert.equal(prevKey('2026-01-01'), '2025-12-31');
  assert.equal(dateLabel('2026-03-14'), '14. März');
});

test('jede 5 Tage kommen alle fuenf Kapitel vor, die Liste hat 366 Tage x 5 Stufen', () => {
  for (let b = 0; b < 73; b++) assert.deepEqual(Array.from({ length: 5 }, (_, i) => chapterOfDay(b * 5 + i)).sort(), [1, 2, 3, 4, 5]);
  assert.equal(DAILY.length, 366);
  for (const row of DAILY) assert.equal(row.length, 5);
});

test('Auswahl rein aus Datum und Stufe: gleiche Eingabe gleiches Level, niemals ein Kapitel ueber der Stufe, hoehere Stufen koennen nur hinzukommen', () => {
  for (let i = 0; i < 366; i++) {
    const key = `2025-${String(1 + Math.floor(i / 31)).padStart(2, '0')}-${String(1 + (i % 31)).padStart(2, '0')}`;
    if (dayIndex(key) !== i) continue;
    for (let st = 1; st <= 5; st++) {
      const a = dailyLevel(key, st);
      const b = dailyLevel(key, st);
      assert.deepEqual(a, b);
      assert.ok(a.chapter <= st, `${key} Stufe ${st}: Kapitel ${a.chapter}`);
      assert.equal(a.daily, true);
    }
    assert.equal(dailyLevel(key, 5).chapter, chapterOfDay(i), 'mit allen Kapiteln gilt das Kapitel des Tages');
  }
  // Abwechslung: ueber ein Jahr kommen alle Presets vor
  const used = new Set(DAILY.flatMap((r) => r.map((e) => e[0])));
  assert.equal(used.size, PRESETS.length);
  for (let c = 1; c <= 5; c++) assert.ok(presetsOf(c).length >= 4);
});

test('Stufe: ein Neuling sieht nur Kapitel 1, mit Kapitel 2 offen auch Kapitel 2', () => {
  const pr = fresh();
  assert.equal(pr.dailyOpen(), false);
  assert.equal(pr.dailyStage(), 1);
  for (const l of levelsOf(1).slice(0, 5)) pr.record(l.id, { time: 100, ejected: 1, eff: false, fast: false });
  assert.equal(pr.dailyOpen(), true, 'ab 5 geschafften Leveln in Kapitel 1');
  assert.equal(pr.dailyStage(), 2);
  for (const l of levelsOf(2).slice(0, 5)) pr.record(l.id, { time: 100, ejected: 1, eff: false, fast: false });
  assert.equal(pr.dailyStage(), 3);
});

test('Serie: zaehlt ueber Tages-, Monats- und Jahreswechsel, reisst bei einer Luecke, zaehlt am selben Tag nicht doppelt', () => {
  const pr = fresh();
  const win = (k, t = 100, e = 1) => pr.recordDaily(k, { time: t, ejected: e });
  assert.equal(win('2025-12-30').streak, 1);
  assert.equal(win('2025-12-31').streak, 2);
  assert.equal(win('2026-01-01').streak, 3, 'Jahreswechsel');
  assert.equal(win('2026-01-01', 90, 0.5).streak, 3, 'derselbe Tag zaehlt nicht doppelt');
  assert.equal(pr.dailyInfo('2026-01-01').bestTime, 90, 'Bestwerte des Tages');
  assert.equal(pr.dailyInfo('2026-01-01').bestEject, 0.5);
  assert.equal(pr.dailyInfo('2026-01-02').streak, 3, 'gestern geschafft: die Serie lebt noch');
  assert.equal(pr.dailyInfo('2026-01-02').done, false);
  assert.equal(pr.dailyInfo('2026-01-03').streak, 0, 'eine Luecke: die Serie ist weg');
  assert.equal(win('2026-01-03').streak, 1);
  // Monatswechsel und Schaltjahr
  const p2 = fresh();
  assert.equal(p2.recordDaily('2024-02-28', { time: 1, ejected: 1 }).streak, 1);
  assert.equal(p2.recordDaily('2024-02-29', { time: 1, ejected: 1 }).streak, 2);
  assert.equal(p2.recordDaily('2024-03-01', { time: 1, ejected: 1 }).streak, 3);
  // ein Level von gestern, das nach Mitternacht endet, zerstoert die Werte von heute nicht
  const r = p2.recordDaily('2024-02-29', { time: 5, ejected: 5 });
  assert.equal(r.first, false);
  assert.equal(p2.dailyInfo('2024-03-01').bestTime, 1);
});

test('Ein alter Spielstand ohne Tageslevel laedt unveraendert und bekommt den leeren Stand', () => {
  const storage = createStorage(mem());
  createSaveStore({ id: 'protoplanet', version: 3, storage }).save({ progress: { '1-1': { done: true, eff: true, fast: true, bestTime: 12, bestEject: 0.2 } }, settings: { aim: true, vibrate: true, reduceMotion: null, music: 70, sfx: 80, mute: false }, snap: null });
  const pr = createProgress({ storage });
  assert.equal(pr.done('1-1'), true);
  assert.equal(pr.state.settings.aim, true);
  assert.deepEqual(pr.dailyInfo('2026-05-01'), { done: false, bestTime: null, bestEject: null, streak: 0 });
  pr.recordDaily('2026-05-01', { time: 50, ejected: 1 });
  pr.save();
  const again = createProgress({ storage });
  assert.equal(again.dailyInfo('2026-05-01').streak, 1);
  assert.equal(again.done('1-1'), true);
});
