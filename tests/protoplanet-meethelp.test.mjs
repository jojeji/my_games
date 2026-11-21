// Treffpunkt-Hilfe: erst nach Fehlversuchen (Zaehler je Level im Spielstand, Einstellung Automatisch | Immer | Aus), Massenvergleich im HUD,
// ein ECHTER Spielstand der Version 4 (tests/fixtures/protoplanet-v4.json, vom Code davor geschrieben) laedt.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createProgress, SAVE_VERSION } from '../games/protoplanet/state.js';
import { createStorage } from '../engine/save.js';
import { levelById } from '../games/protoplanet/levels.js';
import { createPlay } from '../games/protoplanet/play.js';
import { goalStatus, goalCounter } from '../games/protoplanet/goals.js';
import { T } from '../games/protoplanet/tune.js';

const mem = (init) => {
  const d = new Map(Object.entries(init || {}));
  return { getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => d.set(k, String(v)), removeItem: (k) => d.delete(k), d };
};
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/protoplanet-v4.json', import.meta.url), 'utf8'));

test('Spielstand v4 laedt unveraendert, neue Schluessel kommen ueber mergeDefaults (kein Versionssprung)', () => {
  const raw = JSON.parse(fixture['mg:protoplanet:save']);
  assert.equal(raw.v, 4);
  assert.equal(SAVE_VERSION, 4);
  const pr = createProgress({ storage: createStorage(mem(fixture)) });
  assert.equal(pr.done('3-5'), true);
  assert.deepEqual(pr.info('3-5'), raw.data.progress['3-5']);
  assert.equal(pr.state.snap.levelId, '3-5', 'Schnappschuss rev 2 bleibt gueltig');
  assert.equal(pr.settings.aim, true);
  assert.equal(pr.settings.meetHelp, 'auto');
  assert.deepEqual(pr.state.fails, {});
  assert.equal(pr.fails('3-5'), 0);
  assert.equal(pr.meetHelp('3-5'), false, 'auch ein geschafftes Level zeigt die Hilfe ohne Fehlversuche nicht');
});

test('Zaehler und Schwelle: ab 2 Fehlversuchen ist die Hilfe in genau diesem Level an, sie ueberlebt Speichern/Laden und das Schaffen', () => {
  const m = mem();
  const pr = createProgress({ storage: createStorage(m) });
  assert.equal(T.orbit.meet.failsNeeded, 2);
  assert.equal(pr.meetHelp('3-5'), false);
  pr.addFail('3-5');
  assert.equal(pr.meetHelp('3-5'), false);
  pr.addFail('3-5');
  assert.equal(pr.meetHelp('3-5'), true);
  assert.equal(pr.meetHelp('5-5'), false, 'je Level');
  pr.record('3-5', { time: 100, ejected: 1, eff: true, fast: true });
  assert.equal(pr.meetHelp('3-5'), true, 'nach dem Schaffen bleibt sie an');
  pr.save();
  const again = createProgress({ storage: createStorage(m) });
  assert.equal(again.fails('3-5'), 2);
  assert.equal(again.meetHelp('3-5'), true);
});

test('Einstellung: Immer / Aus / Automatisch', () => {
  const pr = createProgress({ storage: createStorage(mem()) });
  pr.settings.meetHelp = 'always';
  assert.equal(pr.meetHelp('3-5'), true);
  pr.settings.meetHelp = 'off';
  pr.addFail('3-5');
  pr.addFail('3-5');
  pr.addFail('3-5');
  assert.equal(pr.meetHelp('3-5'), false);
  pr.settings.meetHelp = 'auto';
  assert.equal(pr.meetHelp('3-5'), true);
  pr.settings.meetHelp = 'quatsch';
  assert.equal(pr.meetHelp('3-5'), true, 'unbekannter Wert verhaelt sich wie Automatisch');
});

test('Massenvergleich im HUD (Ziel absorb): "Ziel .. - wachse zuerst" bei zu grossem Ziel, sonst "Ziel .. · du .."', () => {
  const lv = levelById('2-3');
  const goal = { type: 'absorb' };
  const w = createPlay({ ...lv, goal }).world;
  const t = w.bodies.find((b) => b.tag === 'target');
  assert.ok(t, 'Level mit Zielkoerper');
  w.player.m = t.m * 0.5;
  let st = goalStatus(w, goal);
  assert.equal(st.edible, false);
  assert.match(goalCounter(goal, st), /^Ziel \d+,\d\d – wachse zuerst$/);
  w.player.m = t.m * 2;
  st = goalStatus(w, goal);
  assert.equal(st.edible, true);
  assert.match(goalCounter(goal, st), /^Ziel \d+,\d\d · du \d+,\d\d$/);
  assert.equal(goalCounter({ type: 'mass', value: 4 }, { frac: 0.5 }), '50 %');
});
