// Protoplanet Spielstand Version 4 (3-5 Kometen rev 2): ein ECHTER Spielstand der Version 3 (tests/fixtures/protoplanet-v3.json, vom Code vor der Aenderung geschrieben:
// Kapitel 1 + 2 und 3-1..3-4 geschafft, 3-5 (rev 1) geschafft mit Bestwerten, laufender Schnappschuss in 3-5) wird migriert.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createProgress, SAVE_VERSION, MIGRATIONS, snapValid } from '../games/protoplanet/state.js';
import { createStorage } from '../engine/save.js';
import { levelById, LEVELS } from '../games/protoplanet/levels.js';
import { createPlay } from '../games/protoplanet/play.js';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/protoplanet-v3.json', import.meta.url), 'utf8'));
const mem = (init) => {
  const d = new Map(Object.entries(init || {}));
  return { getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => d.set(k, String(v)), removeItem: (k) => d.delete(k) };
};
const raw = JSON.parse(fixture['mg:protoplanet:save']);

test('Fixture ist ein echter Spielstand der Version 3 mit Schnappschuss in 3-5 (rev 1)', () => {
  assert.equal(raw.v, 3);
  assert.equal(raw.data.snap.levelId, '3-5');
  assert.equal(raw.data.snap.rev, 1);
  assert.equal(raw.data.progress['3-5'].done, true);
  assert.ok(raw.data.progress['3-5'].bestTime > 0);
  assert.equal(SAVE_VERSION, 4, 'die Treffpunkt-Hilfe braucht keinen Versionssprung');
  assert.equal(levelById('3-5').rev, 2);
});

test('Spielstand v3 -> v4: 3-5 behaelt "geschafft", verliert Sterne/Bestwerte und den Schnappschuss, alles andere bleibt Byte fuer Byte', () => {
  const pr = createProgress({ storage: createStorage(mem(fixture)) });
  assert.equal(pr.done('3-5'), true, 'geschafft bleibt');
  assert.equal(pr.stars('3-5'), 1, 'nur der Geschafft-Stern');
  assert.equal(pr.info('3-5').bestTime, null);
  assert.equal(pr.info('3-5').bestEject, null);
  assert.equal(pr.state.snap, null, 'Schnappschuss von 3-5 (rev 1) ist weg');
  assert.equal(pr.unlocked('3-6'), true, 'das Kapitel bleibt offen');
  for (const l of LEVELS) {
    if (l.id === '3-5' || !raw.data.progress[l.id]) continue;
    assert.deepEqual(pr.info(l.id), raw.data.progress[l.id], l.id + ' unveraendert');
  }
  assert.deepEqual(pr.state.settings, { ...raw.data.settings, meetHelp: 'auto', courseHelp: 'auto' }, 'neue Einstellung kommt ueber mergeDefaults dazu');
  assert.deepEqual(pr.state.daily, raw.data.daily);
});

test('Migration 3 -> 4 einzeln: nicht geschaffte 3-5 verliert den Eintrag, andere Schnappschuesse bleiben', () => {
  const out = MIGRATIONS[3]({ progress: { '3-4': { done: true, eff: true, fast: true, bestTime: 80, bestEject: 1 }, '3-5': { done: false, eff: false, fast: false, bestTime: null, bestEject: null } }, snap: { levelId: '3-4', rev: 1, play: {} } });
  assert.equal(out.progress['3-5'], undefined);
  assert.equal(out.progress['3-4'].bestTime, 80);
  assert.equal(out.snap.levelId, '3-4');
  assert.equal(snapValid({ levelId: '3-5', rev: 1 }), false, 'rev 1 gilt fuer 3-5 nicht mehr');
  assert.equal(snapValid({ levelId: '3-5', rev: 2 }), true);
  assert.equal(snapValid({ levelId: '3-4', rev: 1 }), true);
  // ein neuer Schnappschuss von 3-5 (rev 2) ueberlebt Speichern und Laden
  const storage = createStorage(mem());
  const pr = createProgress({ storage });
  const lv = levelById('3-5');
  pr.setSnap({ levelId: lv.id, rev: lv.rev, play: createPlay(lv).serialize(), timeScale: 1 });
  pr.save();
  assert.equal(createProgress({ storage }).state.snap.levelId, '3-5');
});
