// Contract + quality tests for the Psst! card data (games/psst/data). Fast, reads only committed files.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkAll, checkCard, loadData } from '../tools/psst-data/check.mjs';
import { sharesStem, redundant, slug, blocked } from '../tools/psst-data/lib.mjs';
import { decodeCode } from '../tools/psst-data/import-review.mjs';

const DATA = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'games', 'psst', 'data');
const EXPECTED = ['start', 'mix1', 'mix2', 'mix3', 'essen', 'tiere', 'geo', 'sport', 'film', 'personen', 'technik', 'alltag'];

test('packs.json lists the agreed packs and matches the files', () => {
  const { index, packs, problems } = loadData(DATA);
  assert.deepEqual(problems, []);
  assert.equal(index.version, 1);
  assert.deepEqual(index.packs.map(p => p.id), EXPECTED);
  for (const p of index.packs) {
    assert.equal(p.count, packs[p.id].length, p.id);
    assert.equal(p.kind, ['start', 'mix1', 'mix2', 'mix3'].includes(p.id) ? 'difficulty' : 'topic', p.id);
    assert.match(p.icon, /\p{Extended_Pictographic}/u, `${p.id} icon`);
    assert.ok(p.desc.length > 10 && p.name.length > 2);
    assert.ok(p.count >= 80, `${p.id} has only ${p.count} cards`);
  }
  const start = index.packs.find(p => p.id === 'start');
  assert.ok(start.count >= 250 && start.count <= 350, `start has ${start.count}`);
});

test('every card passes the quality check', () => {
  const r = checkAll(DATA);
  assert.deepEqual(r.problems, []);
  assert.ok(r.unique >= 1500, `only ${r.unique} unique cards`);
});

test('card shape: exactly 5 Tabuwörter, ids unique and identical across packs', () => {
  const { packs } = loadData(DATA);
  const byId = new Map();
  for (const [pid, cards] of Object.entries(packs)) {
    for (const c of cards) {
      assert.deepEqual(Object.keys(c).sort(), ['d', 'id', 'src', 't', 'w'], `${pid}/${c.id}`);
      assert.equal(c.t.length, 5, c.id);
      assert.match(c.id, /^[a-z0-9-]+$/);
      if (byId.has(c.id)) assert.deepEqual(byId.get(c.id), c, `${c.id} differs between packs`);
      byId.set(c.id, c);
    }
  }
  const ws = [...byId.values()].map(c => c.w.toLowerCase());
  assert.equal(new Set(ws).size, ws.length, 'duplicate Suchbegriff');
});

test('difficulty packs contain only their level, start only d 1-2', () => {
  const { packs } = loadData(DATA);
  for (const c of packs.mix1) assert.equal(c.d, 1);
  for (const c of packs.mix2) assert.equal(c.d, 2);
  for (const c of packs.mix3) assert.equal(c.d, 3);
  for (const c of packs.start) assert.ok(c.d <= 2);
});

test('review decisions file (if present) refers to existing cards', () => {
  const f = path.join(DATA, 'review-decisions.json');
  if (!fs.existsSync(f)) return;
  const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.equal(doc.version, 1);
  assert.ok(Array.isArray(doc.decisions));
  for (const d of doc.decisions) {
    assert.ok(EXPECTED.includes(d.pack));
    for (const [id, e] of Object.entries(d.edit || {})) { assert.equal(e.t.length, 5, id); assert.ok(e.w.trim(), id); }
  }
});

test('checker rejects bad cards', () => {
  const ok = { id: 'hund', w: 'Hund', t: ['Katze', 'bellen', 'Leine', 'Haustier', 'Knochen'], d: 1, src: 'ai' };
  assert.deepEqual(checkCard(ok), []);
  const bad = (patch, re) => assert.ok(checkCard({ ...ok, ...patch }).some(x => re.test(x)), JSON.stringify(patch));
  bad({ t: ['Katze', 'bellen', 'Leine', 'Haustier'] }, /exactly 5/);
  bad({ t: ['Katze', 'bellen', 'Leine', 'Haustier', 'Hundehütte'] }, /shares a stem/);
  bad({ t: ['Katze', 'bellen', 'Leine', 'Haustier', 'hund'] }, /shares a stem/);
  bad({ t: ['Katze', 'Katzen', 'Leine', 'Haustier', 'Knochen'] }, /duplicates/);
  bad({ t: ['Katze', 'bellen', 'Leine', 'Haustier', ''] }, /empty/);
  bad({ t: ['Katze', 'bellen', 'Leine', 'Haustier', 'Scheiße'] }, /blocklist/);
  bad({ id: 'Hund!' }, /slug/);
  bad({ d: 4 }, /d must be/);
  bad({ src: 'web' }, /src/);
  bad({ w: '' }, /Suchbegriff/);
});

test('stem helpers', () => {
  assert.ok(sharesStem('Schneemann', 'Schnee'));
  assert.ok(sharesStem('Schnee', 'Schneemann'));
  assert.ok(sharesStem('Laufen', 'Läufer'));
  assert.ok(!sharesStem('Pizza', 'Käse'));
  assert.ok(!sharesStem('Polen', 'Warschau'));
  assert.ok(!sharesStem('Eiffelturm', '1889'));
  assert.ok(redundant('Marty', 'Marty McFly'));
  assert.ok(redundant('Schauspieler', 'Schauspielerin'));
  assert.ok(!redundant('Harry Potter', 'Hogwarts'));
  assert.equal(slug('Ägypten'), 'aegypten');
  assert.equal(slug("Elyas M'Barek"), 'elyas-m-barek');
  assert.equal(blocked('Warschau'), null);
  assert.equal(blocked('Mongolei'), null);
});

test('review export code round-trips', () => {
  const payload = { pack: 'start', keep: ['ampel'], drop: ['ei'], edit: { kuh: { w: 'Kuh', t: ['Milch', 'Muh', 'Weide', 'Stall', 'Euter'] } } };
  const code = 'PSSTREVIEW1.' + Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  assert.deepEqual(decodeCode(code), payload);
  assert.throws(() => decodeCode('nope'));
});

test('review page and data files exist (unlisted page)', () => {
  const root = path.join(DATA, '..');
  assert.ok(fs.existsSync(path.join(root, 'review', 'index.html')));
  assert.ok(fs.existsSync(path.join(root, 'review', 'review.js')));
  assert.ok(fs.existsSync(path.join(DATA, 'QUELLEN.md')));
  const html = fs.readFileSync(path.join(root, 'review', 'index.html'), 'utf8');
  assert.ok(!/(href|src)="\//.test(html), 'absolute path in review page');
  const games = JSON.parse(fs.readFileSync(path.join(root, '..', '..', 'games.json'), 'utf8'));
  const list = Array.isArray(games) ? games : games.games;
  assert.ok(!JSON.stringify(list).includes('review'), 'review page must not be listed in games.json');
});
