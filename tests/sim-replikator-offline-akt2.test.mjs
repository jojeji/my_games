// The offline player of Akt II (the real save is ~97 % offline): checks in every 8 h for 2 min, the rest is the real offline catch-up.
// Only one Erschliessung runs at a time, so without the Auto-Erkundung that is ~1 sector per visit (10 sectors took 3 days); the Auto-Erkundung unlocks at
// 2 sectors (starts OFF, the hint toast says where) and the offline player switches it on. Target: 3 sectors within 1 day, 10 within ~1 day.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runSim, loadSaveFile } from '../tools/simulate.mjs';
import { TUNE as T } from '../games/replikator/tune.js';

const FIXTURE = new URL('./fixtures/replikator-end-v1.json', import.meta.url).pathname;
const every = 8 * 3600;
const r = runSim({ game: loadSaveFile(FIXTURE), hours: 60, dt: 2, quiet: true, act2: true, offline: { every, session: 120 }, until: (g) => g.state.rep2.map.claimed >= 10 });
const at = (n) => (r.map.claims[n - 1] ? (r.map.claims[n - 1].t - r.map.start) / 3600 : null);

test('offline player (visit every 8 h for 2 min): 3 sectors within a day, 6 and 10 within ~1.5 days', () => {
  assert.ok(at(1) !== null && at(1) < 1, 'first sector at the first visit: ' + at(1));
  assert.ok(at(3) !== null && at(3) <= 24, '3 sectors after ' + at(3) + ' h');
  assert.ok(at(6) !== null && at(6) <= 36, '6 sectors after ' + at(6) + ' h');
  assert.ok(at(10) !== null && at(10) <= 48, '10 sectors after ' + at(10) + ' h');
});

test('the Auto-Erkundung unlocks early (2 sectors) and starts off: the first sectors are claimed by hand', () => {
  assert.equal(T.mapAutoAt, 2);
  const g = r.game;
  const auto = g.def.autos.find((a) => a.id === 'auto_map');
  assert.ok(g.autoUnlocked('auto_map'));
  assert.ok(auto.defaults.on === false);
  assert.ok(at(2) !== null && at(3) - at(2) >= 1, 'by hand at the visits until the auto is switched on');
});
