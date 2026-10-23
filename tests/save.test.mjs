import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaveStore, createStorage, mergeDefaults, stringify, parse } from '../engine/save.js';
import { D, Decimal } from '../engine/decimal.js';

const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};

test('Decimal JSON roundtrip', () => {
  const o = { a: D('1.5e400'), n: [D(3)], s: 'äö' };
  const r = parse(stringify(o));
  assert.ok(r.a instanceof Decimal);
  assert.equal(r.a.toString(), o.a.toString());
  assert.equal(r.s, 'äö');
});

test('save/load, export/import, migration', () => {
  const storage = createStorage(mem());
  const store = createSaveStore({ id: 'x', version: 2, storage, migrations: { 1: (d) => ({ ...d, added: true }) } });
  store.save({ n: D(5) });
  assert.equal(store.load().data.n.toNumber(), 5);
  const old = createSaveStore({ id: 'x', version: 1, storage });
  old.save({ n: D(7) });
  const loaded = store.load();
  assert.equal(loaded.data.added, true);
  const text = store.exportString({ n: D('1e500') });
  assert.equal(store.importString(text).data.n.toString(), D('1e500').toString());
  assert.throws(() => store.importString('müll'), /gültig/);
  assert.throws(() => createSaveStore({ id: 'other', version: 2, storage }).importString(text), /anderen Spiel/);
  store.wipe();
  assert.equal(store.load(), null);
});

test('corrupt save falls back to backup, storage failures do not throw', () => {
  const backend = mem();
  const store = createSaveStore({ id: 'y', version: 1, storage: createStorage(backend) });
  store.save({ v: 1 });
  store.load(); // writes backup
  backend.setItem('mg:y:save', '{broken');
  assert.equal(store.load().data.v, 1);
  const bad = createStorage({ getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } });
  assert.equal(bad.set('a', 'b'), false);
  assert.equal(bad.get('a'), 'b');
});

test('mergeDefaults keeps types and adds new keys', () => {
  const r = mergeDefaults({ a: 1, d: D(2), o: { x: 1, y: 2 }, m: {} }, { a: 'bad', d: '3', o: { x: 9 }, m: { k: 1 } });
  assert.equal(r.a, 1);
  assert.equal(r.d.toNumber(), 3);
  assert.deepEqual(r.o, { x: 9, y: 2 });
  assert.deepEqual(r.m, { k: 1 });
});
