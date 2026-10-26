import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createPackStore } from '../games/psst/packs.js';
import { createStore, decodeReports } from '../games/psst/store.js';
import { createStorage } from '../engine/save.js';

const ROOT = new URL('../games/psst/', import.meta.url);
const diskFetch = (url) => {
  const f = new URL(url, ROOT);
  if (!existsSync(f)) return Promise.reject(new Error('404 ' + url));
  return Promise.resolve(JSON.parse(readFileSync(f, 'utf8')));
};

test('loader falls back to demo fixtures only when data/packs.json is missing, loads packs lazily and de-duplicates', async () => {
  const calls = [];
  const fakeData = {
    'fx/packs.json': { version: 1, packs: [{ id: 'a', file: 'packs/a.json', count: 2 }, { id: 'b', file: 'packs/b.json', count: 2 }, { id: 'c', file: 'packs/c.json', count: 1 }] },
    'fx/packs/a.json': [{ id: 'x', w: 'X', t: [] }, { id: 'y', w: 'Y', t: [] }],
    'fx/packs/b.json': [{ id: 'y', w: 'Y', t: [] }, { id: 'z', w: 'Z', t: [] }],
    'fx/packs/c.json': [{ id: 'q', w: 'Q', t: [] }],
  };
  const fetchJson = async (u) => { calls.push(u); if (!(u in fakeData)) throw new Error('404'); return fakeData[u]; };
  const store = createPackStore({ fetchJson, bases: ['real/', 'fx/'] });
  await Promise.all([store.loadIndex(), store.loadIndex()]);
  assert.equal(store.demo, true);
  assert.equal(calls.filter((c) => c === 'real/packs.json').length, 1); // shared request
  const cards = await store.loadCards(['a', 'b']);
  assert.deepEqual(cards.map((c) => c.id), ['x', 'y', 'z']);
  assert.ok(!calls.includes('fx/packs/c.json')); // lazy: not selected -> not loaded
  assert.equal(store.peek('c'), null);
  // real data present -> no fallback
  const real = createPackStore({ fetchJson: async (u) => (u === 'real/packs.json' ? { packs: [] } : Promise.reject(new Error('404'))), bases: ['real/', 'fx/'] });
  await real.loadIndex();
  assert.equal(real.demo, false);
});

test('demo fixtures follow the card data contract', async () => {
  const store = createPackStore({ fetchJson: diskFetch, bases: ['fixtures/demo-packs/'] });
  const index = await store.loadIndex();
  assert.ok(index.length >= 3);
  const ids = new Set();
  for (const p of index) {
    assert.ok(['difficulty', 'topic'].includes(p.kind));
    const cards = await store.loadPack(p.id);
    assert.equal(cards.length, p.count);
    for (const c of cards) {
      assert.equal(c.t.length, 5);
      assert.ok(c.w && c.id && [1, 2, 3].includes(c.d));
      ids.add(c.id);
    }
  }
  const all = await store.loadCards(index.map((p) => p.id));
  assert.equal(all.length, ids.size); // overlapping cards counted once
});

test('store: settings defaults, played set, progress, reports export code round-trip', () => {
  const mem = new Map();
  const storage = createStorage({ getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) });
  const store = createStore(storage);
  assert.equal(store.settings().turnSecs, 60);
  store.saveSettings({ ...store.settings(), turnSecs: 45 });
  assert.equal(createStore(storage).settings().turnSecs, 45);
  assert.equal(store.teams().length, 2);
  store.savePlayed(new Set(['a', 'b']));
  store.flushPlayed();
  assert.deepEqual([...store.played()].sort(), ['a', 'b']);
  assert.deepEqual([...store.resetPlayed(['a'])], ['b']);
  store.resetPlayed('all');
  assert.equal(store.played().size, 0);
  store.addReport({ cardId: 'k1', w: 'Käse', reason: 'falsch', note: 'Tabuwort fehlt' });
  const code = store.exportReports();
  assert.match(code, /^PSSTMELD1\./);
  const back = decodeReports(code);
  assert.equal(back[0].cardId, 'k1');
  assert.equal(back[0].note, 'Tabuwort fehlt');
  assert.throws(() => decodeReports('FOO.bar'));
});

test('psst files: manifest unique id and relative paths, icons present, no root-absolute urls', () => {
  const dir = new URL('../games/psst/', import.meta.url);
  const m = JSON.parse(readFileSync(new URL('manifest.webmanifest', dir), 'utf8'));
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.ok(m.id.includes('psst'));
  for (const i of m.icons) assert.ok(existsSync(new URL(i.src, dir)), i.src);
  assert.ok(existsSync(new URL('icons/apple-touch-icon.png', dir)));
  for (const f of ['index.html', 'main.js', 'ui.js', 'zug-view.js', 'style.css', 'manifest.webmanifest']) {
    const t = readFileSync(new URL(f, dir), 'utf8');
    assert.ok(!/(?:href|src|start_url|scope)=?"?\s*:?\s*"\//.test(t), f);
    assert.ok(!/https?:\/\//.test(t.replace(/http:\/\/www\.w3\.org[^"]*/g, '')), f + ' fetches nothing external');
  }
});
