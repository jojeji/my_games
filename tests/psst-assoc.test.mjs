// Psst! association report (games/psst/data/assoc-report.json): shape and consistency with the card data.
// Reads only committed files, never the raw norm data (that stays outside the repo, see tools/psst-data/README.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadData } from '../tools/psst-data/check.mjs';
import { blocked } from '../tools/psst-data/lib.mjs';
import { matches } from '../tools/psst-data/assoc.mjs';

const DATA = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'games', 'psst', 'data');
const FILE = path.join(DATA, 'assoc-report.json');
const report = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const { packs } = loadData(DATA);
const ids = new Set(Object.values(packs).flat().map(c => c.id));

test('report has the agreed top-level shape and stays small', () => {
  assert.deepEqual(Object.keys(report).sort(), ['cards', 'source', 'version']);
  assert.equal(report.version, 1);
  assert.equal(typeof report.source, 'string');
  assert.match(report.source, /USF/);
  assert.ok(fs.statSync(FILE).size < 150_000, 'report should stay small (single words only)');
});

test('every id of the report is a card, and nearly every card has an entry', () => {
  const keys = Object.keys(report.cards);
  for (const id of keys) assert.ok(ids.has(id), `unknown card id ${id}`);
  const covered = [...ids].filter(id => report.cards[id]).length;
  assert.ok(covered >= ids.size * 0.95, `only ${covered} of ${ids.size} cards have an entry (run node tools/psst-data/assoc.mjs)`);
});

test('entries contain single words only: score, covered, missing (max 3), weak (max 5)', () => {
  let covered = 0;
  for (const [id, e] of Object.entries(report.cards)) {
    assert.equal(typeof e.covered, 'boolean', id);
    if (!e.covered) { assert.deepEqual(Object.keys(e), ['covered'], `${id}: no data means no other fields`); continue; }
    covered++;
    assert.deepEqual(Object.keys(e).sort(), ['covered', 'missing', 'score', 'weak'], id);
    assert.ok(Number.isInteger(e.score) && e.score >= 0 && e.score <= 5, `${id}: score ${e.score}`);
    assert.ok(Array.isArray(e.missing) && e.missing.length <= 3, `${id}: missing`);
    assert.ok(Array.isArray(e.weak) && e.weak.length <= 5, `${id}: weak`);
    for (const w of [...e.missing, ...e.weak]) {
      assert.ok(typeof w === 'string' && w.trim() === w && w.length >= 2 && w.length <= 30, `${id}: bad word "${w}"`);
      assert.equal(blocked(w), null, `${id}: "${w}" is on the blocklist`);
    }
    assert.equal(new Set(e.missing.map(x => x.toLowerCase())).size, e.missing.length, `${id}: duplicate suggestion`);
  }
  assert.ok(covered >= 400, `only ${covered} covered cards`);
});

test('the coverage numbers are plausible and the pack start has data', () => {
  const inStart = packs.start.map(c => report.cards[c.id]).filter(Boolean);
  const cov = inStart.filter(e => e.covered).length;
  assert.ok(cov >= 80, `start: only ${cov} covered cards`);
});

test('matches(): stems, plural and compounds count as the same word, unrelated words do not', () => {
  assert.ok(matches('Katze', 'Katzen'));
  assert.ok(matches('Hundehütte', 'Hütte'));
  assert.ok(matches('Schläger', 'schläger'));
  assert.ok(!matches('Kuh', 'Kuchen'));
  assert.ok(!matches('Hund', 'Hut'));
  assert.ok(!matches('', 'Hund'));
});

test('assoc-swaps.txt only lists existing cards outside the pack start', () => {
  const lines = fs.readFileSync(path.join(DATA, '..', '..', '..', 'tools', 'psst-data', 'assoc-swaps.txt'), 'utf8')
    .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  assert.ok(lines.length > 0);
  const startWords = new Set(packs.start.map(c => c.w));
  const all = new Map(Object.values(packs).flat().map(c => [c.w, c]));
  for (const l of lines) {
    const [w, ...pairs] = l.split('|').map(x => x.trim());
    assert.ok(all.has(w), `unknown card ${w}`);
    assert.ok(!startWords.has(w), `${w} is in the pack start: its text is owned by the review`);
    assert.ok(pairs.length >= 1 && pairs.length <= 2, `${w}: 1 or 2 swaps`);
    const card = all.get(w);
    for (const p of pairs) {
      const [from, to] = p.split('>').map(x => x.trim());
      assert.ok(from && to, `${w}: bad swap "${p}"`);
      assert.ok(card.t.includes(to) || card.t.includes(from), `${w}: neither "${from}" nor "${to}" is on the card`);
    }
  }
});
