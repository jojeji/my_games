// Myzel Chronik (Paket 3): cast, story data, house style, the ending text, variants by fork, and the migration of the LIVE Paket-2 saves
// (tests/fixtures/myzel-p2.json: real saves from the Paket-2 code, day 4 and the ending). The pacing in visits is tests/sim-myzel-story.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMyzel, def } from '../games/myzel/logic.js';
import { CAST, isMet, metCast, portrait, castInfo, T, K } from '../games/myzel/characters.js';
import { ENDING, NACHSPIEL } from '../games/myzel/ending.js';
import * as M from '../games/myzel/def.js';
import { createRuntime, advance } from '../engine/core.js';
import { createStorage, parse, stringify } from '../engine/save.js';

const FX = JSON.parse(fs.readFileSync(new URL('./fixtures/myzel-p2.json', import.meta.url), 'utf8'));
const SRC = fs.readFileSync(new URL('../games/myzel/story.js', import.meta.url), 'utf8');
const resolve = (g, l) => (typeof l.t === 'function' ? l.t(g) : l.t);

/** Texts of every entry, with all variants of the forks resolved (a copy of the game per combination). */
function allVariants() {
  const out = [];
  for (const a of ['s', 'm']) for (const b of ['l', 'z']) {
    const g = createMyzel();
    g.state.fork = { a, b };
    for (const s of g.def.story) for (const l of s.lines) out.push({ id: s.id, who: l.who, text: resolve(g, l), fork: a + b });
  }
  return out;
}

test('cast: role, bio, colour, side and an emblem for everybody; distinct colours; unlock ids exist in the story', () => {
  const g = createMyzel();
  for (const c of Object.values(CAST)) {
    assert.ok(c.name && c.role && c.bio && /^#[0-9a-f]{6}$/i.test(c.color), c.id);
    assert.ok(c.emblem && c.emblem.startsWith('<'), 'emblem ' + c.id);
    assert.ok(['left', 'right'].includes(c.side), c.id);
    if (c.unlock) assert.ok(g.def.story.some((s) => s.id === c.unlock), c.unlock);
    assert.equal(portrait(c.id).emblem, c.emblem);
  }
  assert.equal(new Set(Object.values(CAST).map((c) => c.color)).size, Object.keys(CAST).length);
  assert.deepEqual(Object.keys(CAST), ['myzel', 'taxus', 'kurt'], 'the cast stays small');
  assert.equal(portrait('niemand').name, CAST.myzel.name);
  // no spoiler in the cards before the story says it
  assert.ok(!/vierzehn|Stümpfe|Kahlschlag/.test(CAST.taxus.bio + CAST.taxus.role));
});

test('cast: met in the order of the story (Myzel always, Kurt with the first dialog, Taxus with the first Hut); cards change after the ending', () => {
  const g = createMyzel();
  assert.deepEqual(metCast(g), ['myzel']);
  g.state.chronicle.shown.st_start = true;
  assert.deepEqual(metCast(g), ['myzel', 'kurt']);
  g.state.chronicle.read.f_first = true;
  assert.ok(isMet(g, 'taxus'));
  assert.deepEqual(castInfo(g, 'taxus'), {});
  g.state.myz.end = 1000;
  assert.match(castInfo(g, 'taxus').role, /nicht mehr allein/);
  assert.ok(castInfo(g, 'kurt').bio);
  assert.deepEqual(castInfo(g, 'myzel'), {});
});

test('story data: unique ids, chapters and speakers exist, every entry is a link of ONE chain, only the key moments are dialogs', () => {
  const g = createMyzel();
  const d = g.def;
  assert.equal(d.chronicle, true);
  const ids = d.story.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 36 && ids.length <= 46, 'entries: ' + ids.length);
  const chapters = new Set(d.chapters.map((c) => c.id));
  for (const s of d.story) {
    assert.ok(chapters.has(s.chapter), s.id);
    assert.ok(s.lines.length && s.lines.every((l) => l.t && CAST[l.who]), s.id);
    assert.equal(typeof s.cond, 'function', s.id);
  }
  // the key moments (start, fork A, first Fruchtkörper, fork B, Waldnetz, ending) are the only dialogs
  assert.deepEqual(d.story.filter((s) => s.modal).map((s) => s.id), ['st_start', 'fork_a', 'f_first', 'fork_b', 'w_first', 'end_ring']);
  // on a new game only the start is true: nothing runs ahead of the chain
  const fresh = createMyzel();
  assert.deepEqual(d.story.filter((s) => s.cond(fresh)).map((s) => s.id), ['st_start']);
  fresh.tick(1);
  assert.deepEqual(fresh.storyPendingModals().map((e) => e.id), ['st_start']);
  assert.equal(fresh.state.settings.storyBubbles, true);
});

test('names only via characters.js; no old franchises; the house style of the voice bible', () => {
  for (const c of [CAST.taxus, CAST.kurt]) assert.ok(!SRC.includes(c.name), 'hard-coded name ' + c.name);
  assert.equal(T, 'Taxus');
  assert.equal(K, 'Kurt');
  const all = allVariants();
  const texts = all.map((x) => x.text).join('\n');
  assert.ok(texts.includes(T) && texts.includes(K), 'placeholders resolve to the cast names');
  for (const bad of ['Hobbit', 'Ent ', 'Gandalf', 'Mario', 'Pokémon']) assert.ok(!texts.includes(bad), bad);
  const byEntry = {};
  for (const x of all) (byEntry[x.id + x.fork] ||= []).push(x.text);
  for (const [id, lines] of Object.entries(byEntry)) {
    const t = lines.join(' ');
    assert.ok(!/nicht [^.]*, sondern/i.test(t), 'nicht X, sondern Y: ' + id);
    assert.ok(!/irgendwie|Es ist, als ob|In einer Welt/i.test(t), id);
    assert.ok((t.match(/ – | - |—/g) || []).length <= 1, 'dashes: ' + id);
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(t), 'emoji: ' + id);
    assert.ok(!/[a-zäöüß,] Sie\b|\bIhnen\b|\bIhr\b/.test(t), 'Sie-form: ' + id);
    assert.ok(!lines.at(-1).trim().endsWith('?'), 'closing question: ' + id);
    assert.ok(lines.every((l) => l.length <= 260), 'a line is too long for a chat bubble: ' + id);
  }
});

test('the world rule: the Myzel and the Eibe neither see nor hear (Kurt does); no word about the game itself', () => {
  for (const x of allVariants()) {
    if (x.who !== 'kurt') assert.ok(!/\b(sehe|siehst|sieht|sehen|gesehen|hören|höre|hörst|hört|Sicht)\b/.test(x.text), `${x.id} (${x.who}): ${x.text}`);
    assert.ok(!/\b(Handy|Spieler|Tippen|Besuch|Spiel|App|Bildschirm|Klick)\b/i.test(x.text), `${x.id}: ${x.text}`);
    assert.ok(!/der (Erste|Zweite|Dritte|Vierte|Fünfte|Wievielte)\b/i.test(x.text) || x.who !== 'kurt', x.id); // Kurt has no ordinal
  }
});

test('the setups are resolved: the yew was one of fourteen, the stumps are thirteen and connected, Kurt finishes his sentence, the Untermieter is entered under Familie', () => {
  const g = createMyzel();
  const all = allVariants().filter((x) => x.fork === 'sl');
  const text = (id) => all.filter((x) => x.id === id).map((x) => x.text).join(' ');
  assert.match(text('k2_kahl'), /Vierzehn/);
  assert.match(text('k4_stuempfe'), /Dreizehn/);
  assert.match(text('f_first'), /Untermieter/);
  assert.match(text('k1_gestalt'), /wie Boden/);
  assert.match(text('end_ring'), /dreizehn Stümpfe/);
  assert.match(text('end_ring'), /Untermieter mehr/);
  assert.match(text('end_ring'), /Unter Familie/);
  assert.match(text('end_ring'), /Ein Kreis.*Ein ziemlich guter/);
  assert.match(text('end_ring'), /Dass du gut aussiehst/);
  assert.match(text('end_ring'), /Hexen/);
  // the ending screen takes its lines from ending.js: one place
  assert.deepEqual(g.def.story.find((s) => s.id === 'end_ring').lines, ENDING.lines);
  assert.ok(ENDING.lines.length <= 10 && ENDING.title, 'short: one dialog of a few pages');
  assert.ok(NACHSPIEL.text.includes(T));
});

test('variants: the entries after a fork choice read differently for s | m and l | z, and are the same entry', () => {
  const texts = (a, b, id) => {
    const g = createMyzel();
    g.state.fork = { a, b };
    return g.def.story.find((s) => s.id === id).lines.map((l) => resolve(g, l)).join(' | ');
  };
  for (const id of ['fork_a', 'k1_einheit', 'k1_drei']) assert.notEqual(texts('s', 'l', id), texts('m', 'l', id), id);
  for (const id of ['fork_b', 'k3_erste', 'k4_alge']) assert.notEqual(texts('s', 'l', id), texts('s', 'z', id), id);
  assert.match(texts('s', 'l', 'fork_a'), /Sporen/);
  assert.match(texts('m', 'l', 'fork_a'), /Wurzelspitzen/);
});

/* ---------------- the live Paket-2 saves ---------------- */
function loadV2(state) {
  const mem = new Map();
  const backend = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  mem.set('mg:myzel:save', stringify({ v: 2, t: 1000, data: parse(JSON.stringify(state)) }));
  const g = createMyzel();
  const rt = createRuntime(g, { storage: createStorage(backend), now: () => 1000 });
  rt.load();
  return { g, rt };
}

test('Paket-2 save, day 4: the Chronik arrives silently (no dialog, no bubble), unread, in story order, up to the real progress', () => {
  const st = parse(JSON.stringify(FX.day4.state));
  const { g } = loadV2(FX.day4.state);
  assert.equal(def.version, 3);
  assert.equal(g.state.chronicle.backfill, undefined, 'the flag is used up');
  assert.deepEqual(g.storyPendingModals().map((e) => e.id), [], 'no dialog flood');
  assert.deepEqual(g.storyBubbleBacklog().map((e) => e.id), [], 'no bubbles');
  const got = g.storyList().map((x) => x.def.id);
  for (const id of ['st_start', 'fork_a', 'f_first', 'k2_kahl', 'fork_b', 'w_first']) assert.ok(got.includes(id), id);
  assert.ok(g.storyUnread() >= 20, 'unread in the Chronik: ' + g.storyUnread());
  // the story of the Waldnetze that did NOT happen yet is not told (the chain stops at the real progress): ring 1 and the stumps come later
  for (const id of ['k4_ring1', 'k4_stuempfe', 'k4_nahe', 'end_ring']) assert.ok(!got.includes(id), id);
  // order: the Chronik keeps the order of the story
  const order = g.def.story.map((s) => s.id).filter((id) => got.includes(id));
  assert.deepEqual(got, order);
  // nothing else about the save changed
  assert.equal(g.state.time.played, st.time.played);
  assert.equal(g.state.layers.w.count, st.layers.w.count);
  assert.deepEqual(g.state.upg, st.upg);
  // and the story goes on from here: the next entries come one after the other (spacing), not all at once
  const before = g.storyList().length;
  advance(g, 30);
  assert.ok(g.storyList().length - before <= 1);
});

test('Paket-2 save, day 4: production, gains and the time gates are the Paket-2 numbers (no Kiefer there), the live game is not set back', () => {
  const { g } = loadV2(FX.day4.state);
  const b = FX.day4.baseline;
  for (const [name, v] of [['nRate', M.nRate(g)], ['fGainMult', M.fGainMult(g)], ['wGainMult', M.wGainMult(g)], ['lGainMult', M.lGainMult(g)], ['wMinRun', M.wMinRun(g)]]) {
    assert.ok(Math.abs(v / b[name] - 1) < 1e-9, `${name} ${v} vs ${b[name]}`);
  }
  assert.equal(M.gateMul(g), 1);
  assert.equal(g.prestigeGain('f').toNumber(), b.fGain);
  assert.equal(g.prestigeGain('w').toNumber(), b.wGain);
  assert.equal(g.state.layers.w.count, b.wCount);
});

test('Paket-2 save, the ending already reached: the ending dialog comes once if it was never shown, the rest of the Chronik is silent', () => {
  // endShown false in the fixture (the sim never opens the dialog): the owner has not seen the ending yet
  const { g } = loadV2(FX.end.state);
  assert.ok(M.ended(g));
  assert.deepEqual(g.storyPendingModals().map((e) => e.id), ['end_ring']);
  const got = g.storyList().map((x) => x.def.id);
  assert.ok(got.includes('k4_nahe') && got.includes('end_ring'));
  g.storyModalShown('end_ring');
  assert.deepEqual(g.storyPendingModals().map((e) => e.id), []);
  // an owner who HAS seen it (endShown) gets no dialog at all
  const seen = parse(JSON.stringify(FX.end.state));
  seen.myz.endShown = true;
  const { g: g2 } = loadV2(seen);
  assert.deepEqual(g2.storyPendingModals().map((e) => e.id), []);
  assert.ok(g2.storyList().some((x) => x.def.id === 'end_ring'));
});

test('a new game goes the whole way through the engine: start dialog, then the chain with spacing; saving and loading keeps the Chronik', () => {
  const g = createMyzel();
  g.tick(1);
  assert.deepEqual(g.storyList().map((x) => x.def.id), ['st_start']);
  g.state.chronicle.shown.st_start = true;
  const copy = createMyzel();
  copy.load(parse(JSON.stringify(g.state)));
  assert.deepEqual(copy.storyList().map((x) => x.def.id), ['st_start']);
  assert.equal(copy.state.chronicle.shown.st_start, true);
});
