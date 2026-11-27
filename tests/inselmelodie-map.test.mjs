import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutMap, WAYPOINTS, ease } from '../games/inselmelodie/mapgeo.js';
import { ISLANDS } from '../games/inselmelodie/world.js';
import { defaultProgress, record, pendingReveal, islandShown } from '../games/inselmelodie/session.js';
import { mergeDefaults } from '../engine/save.js';

const VIEWS = [
  { w: 1280, h: 800, padTop: 64, padBottom: 118 },
  { w: 844, h: 390, padTop: 50, padBottom: 78 },
  { w: 390, h: 844, padTop: 110, padBottom: 180 },
  { w: 360, h: 740, padTop: 110, padBottom: 180 },
];

test('Karte: jede Insel liegt auf dem Weg, in Reihenfolge, innerhalb der Welt', () => {
  for (const v of VIEWS) {
    const g = layoutMap(v);
    let last = -1;
    for (const isl of ISLANDS) {
      const at = g.islands[isl.id];
      assert.ok(at, isl.id);
      assert.ok(at.at > last, `${isl.id} in Reihenfolge (${v.w}x${v.h})`);
      last = at.at;
      const half = g.islandSize / 2;
      assert.ok(at.x - half >= -half * 0.6 && at.x + half <= g.width + half * 0.6, `${isl.id} x im Bild ${v.w}x${v.h}`);
      assert.ok(at.y - half >= 0 && at.y + half <= g.height + 1, `${isl.id} y im Bild ${v.w}x${v.h}`);
    }
  }
});

test('Karte: Inseln überlappen sich nicht, Anlegestellen liegen vor der Insel', () => {
  for (const v of VIEWS) {
    const g = layoutMap(v);
    const ids = ISLANDS.map((i) => i.id);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = g.islands[ids[i]], b = g.islands[ids[j]];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > g.islandSize * 0.95, `${ids[i]}/${ids[j]} zu nah (${v.w}x${v.h})`);
    }
    for (const id of ids) assert.ok(g.dockAt(id) < g.islands[id].at);
  }
});

test('Karte: pointAt läuft stetig, Pfad endet an der richtigen Stelle', () => {
  const g = layoutMap(VIEWS[0]);
  let prev = g.pointAt(0);
  for (let d = 5; d < g.total; d += 5) {
    const p = g.pointAt(d);
    assert.ok(Math.hypot(p.x - prev.x, p.y - prev.y) <= 5.01);
    prev = p;
  }
  assert.equal(g.pathTo(0).split('L').length, 2);
  assert.ok(g.pathTo().startsWith('M'));
  assert.equal(ease(0), 0);
  assert.equal(ease(1), 1);
  assert.equal(WAYPOINTS.filter((w) => w.island).length, ISLANDS.length);
});

test('Führung: geschaffte Insel öffnet die nächste, die Freischaltung wird einmal gezeigt', () => {
  const p = defaultProgress();
  assert.equal(pendingReveal(p), null);
  assert.equal(islandShown(p, 1), false);
  record(p, 'tour', 0);
  record(p, 'learn-C4', 0);
  const r = record(p, 'erster-ton', 3);
  assert.equal(r.next, 'i1');
  assert.equal(pendingReveal(p).id, 'i1');
  assert.equal(islandShown(p, 1), false); // erst nach der Bootsfahrt
  p.revealed.push('i1');
  assert.equal(pendingReveal(p), null);
  assert.equal(islandShown(p, 1), true);
  p.settings.allOpen = true;
  assert.equal(pendingReveal(p), null);
  assert.equal(islandShown(p, 3), true);
});

test('Spielstand der ersten Vorschau (Version 1) wird geführt fortgesetzt', async () => {
  const v1 = { birdName: 'Kiki', tasks: { tour: { stars: 0, plays: 1 }, 'learn-C4': { stars: 0, plays: 1 }, 'erster-ton': { stars: 2, plays: 1 } }, collect: ['muschel'],
    settings: { input: 'touch', sound: true, allOpen: true, help: { colors: true, names: true, fingers: true, keys: true } }, calib: { offset: 0, done: false }, boat: 'i2' };
  const { createSaveStore, createStorage } = await import('../engine/save.js');
  const storage = createStorage(null);
  createSaveStore({ id: 'inselmelodie', version: 1, storage }).save(v1);
  // dieselbe Migration wie main.js
  const MIGRATIONS = { 1: (d) => { if (d.settings) d.settings.allOpen = false; d.revealed = ['i0']; d.boat = 'i0'; return d; } };
  const loaded = createSaveStore({ id: 'inselmelodie', version: 2, migrations: MIGRATIONS, storage }).load();
  const p = mergeDefaults(defaultProgress(), loaded.data);
  assert.equal(p.settings.allOpen, false);
  assert.equal(p.birdName, 'Kiki');
  assert.equal(p.tasks['erster-ton'].stars, 2);
  assert.equal(p.settings.haptics, true);
  assert.equal(pendingReveal(p).id, 'i1'); // die Bootsfahrt zur Wasserfallinsel kommt beim nächsten Öffnen
});
