// Replikator Chronik: cast, story data, save migration (real v1 save) and pacing in the active sim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createReplikator } from '../games/replikator/logic.js';
import { CAST, isMet, metCast, portrait, P, W } from '../games/replikator/characters.js';
import { createRuntime, advance } from '../engine/core.js';
import { createStorage } from '../engine/save.js';
import { runSim } from '../tools/simulate.mjs';
import { storyTimeline, storyPacing } from '../tools/story-replikator.mjs';

const OLD_IDS = ['st_start', 'st_rep', 'st_dock', 'st_exp', 'st_chal', 'st_sing', 'st_res', 'st_end'];
const isV1 = (s) => !s.chapter.startsWith('a2'); // Akt II entries (map.js) have their own tests (replikator-map.test.mjs)
const FIXTURE_TEXT = readFileSync(new URL('./fixtures/replikator-end-v1.json', import.meta.url), 'utf8');
const FIXTURE_T = JSON.parse(FIXTURE_TEXT).t;
const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};
const resolve = (g, l) => (typeof l.t === 'function' ? l.t(g) : l.t); // lines can be a function of the game (Archiv bonus texts)
const allText = (g) => g.def.story.flatMap((s) => s.lines.map((l) => resolve(g, l)));

test('Figuren: Sonde always, Wartungsroutine after st_start, Akt-II-Figuren not before their story entry', () => {
  const g = createReplikator();
  assert.deepEqual(metCast(g), ['sonde']);
  g.state.chronicle.shown.st_start = true;
  assert.deepEqual(metCast(g), ['sonde', 'wartung']);
  g.state.chronicle.shown.st_start = false;
  g.state.chronicle.read.st_start = true;
  assert.ok(isMet(g, 'wartung'));
  assert.ok(!isMet(g, 'mission') && !isMet(g, 'echo'));
  g.state.chronicle.shown.f_m1 = true;
  assert.ok(isMet(g, 'mission'));
  g.state.chronicle.shown.f_m1 = false;
  // the Echo is introduced by the first sighting (Akt II), the Missionsleitung is not met yet
  g.state.chronicle.shown.a2_echo = true;
  assert.ok(isMet(g, 'echo') && !isMet(g, 'mission'));
});

test('cast: role, bio, colour, side and an emblem for everybody; unlock ids exist in the story', () => {
  const g = createReplikator();
  for (const c of Object.values(CAST)) {
    assert.ok(c.name && c.role && c.bio && /^#[0-9a-f]{6}$/i.test(c.color), c.id);
    assert.ok(c.emblem && c.emblem.startsWith('<'), 'emblem ' + c.id);
    assert.ok(['left', 'right'].includes(c.side), c.id);
    if (c.unlock) assert.ok(g.def.story.some((s) => s.id === c.unlock), c.unlock);
    assert.equal(portrait(c.id).emblem, c.emblem);
  }
  assert.equal(new Set(Object.values(CAST).map((c) => c.color)).size, Object.keys(CAST).length, 'distinct colours');
  assert.equal(portrait('unbekannt').name, CAST.sonde.name);
});

test('story data: unique ids, chapters and speakers exist, the eight old ids stay, only key moments are modal', () => {
  const g = createReplikator();
  const d = g.def;
  assert.equal(d.chronicle, true);
  const ids = d.story.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of OLD_IDS) assert.ok(ids.includes(id), id);
  const chapters = new Set(d.chapters.map((c) => c.id));
  for (const s of d.story) {
    assert.ok(chapters.has(s.chapter), s.id);
    assert.ok(s.lines.length && s.lines.every((l) => l.t && CAST[l.who] && !CAST[l.who].later), s.id);
    assert.equal(typeof s.cond, 'function', s.id);
  }
  assert.deepEqual(d.story.filter((s) => s.modal).map((s) => s.id), ['st_start', 'st_sing', 'k4_horizont', 'st_end', 'a2_start', 'mut_first', 'ano_first', 'jump_first', 'e_hello', 'm_bake', 'end_merge', 'end_split', 'end_split2', 'end_merge2']);
  // the old setup survives: the first copy carries the flaws of the original
  const rep = d.story.find((s) => s.id === 'st_rep');
  assert.ok(rep.lines.some((l) => /Fehler/.test(l.t) && /Original/.test(l.t)));
});

test('names only via characters.js; no Bobiverse terms; house style rules for the texts', () => {
  const src = readFileSync(new URL('../games/replikator/story.js', import.meta.url), 'utf8');
  for (const c of Object.values(CAST)) assert.ok(!src.includes(c.name), 'hard-coded name ' + c.name);
  const g = createReplikator();
  const texts = allText(g).join('\n');
  const v1texts = g.def.story.filter(isV1).flatMap((s) => s.lines.map((l) => resolve(g, l))).join('\n');
  assert.ok(texts.includes(P) && texts.includes(W), 'placeholders resolve to the cast names');
  for (const bad of ['Bob', 'GUPPI', 'Deltan', 'Anderen', 'Others', 'Replikant']) assert.ok(!new RegExp(bad).test(texts), bad);
  for (const s of g.def.story) {
    const t = s.lines.map((l) => resolve(g, l)).join(' ');
    assert.ok(!/nicht [^.]*, sondern/i.test(t), 'nicht X, sondern Y: ' + s.id);
    assert.ok(!/irgendwie|Es ist, als ob|In einer Welt/i.test(t), s.id);
    assert.ok((t.match(/ – | - |—/g) || []).length <= 1, 'dashes: ' + s.id);
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(t), 'emoji: ' + s.id);
    assert.ok(!/[a-zäöüß,] Sie\b|\bIhnen\b|\bIhr\b/.test(t), 'Sie-form: ' + s.id); // sentence-initial "Sie" = they is fine
    assert.ok(!t.trimEnd().endsWith('?'), 'closing question: ' + s.id);
  }
  // the Missionsleitung and the Echo are Akt II: nobody mentions them in version 1
  assert.ok(!/Missionsleitung|Echo/.test(v1texts));
  // ... and the older Akt II chapters do not name them either: they are met in the chapters a2f / a2e (Paket 6)
  const old = g.def.story.filter((s) => s.chapter.startsWith('a2') && !['a2f', 'a2e'].includes(s.chapter)).flatMap((s) => s.lines.map((l) => resolve(g, l))).join('\n');
  assert.ok(!/Missionsleitung|Echo/.test(old));
});

test('pacing (active sim): an entry at least every ~25 min until st_end, no pile-ups, one quiet hint for Akt II', () => {
  const r = runSim({ hours: 22, quiet: true });
  advance(r.game, 3); // the sim stops the moment the last challenge is done
  const tl = storyTimeline(r.game);
  const pc = storyPacing(tl);
  assert.ok(pc.end, 'st_end reached');
  assert.ok(pc.count >= 40, 'entries: ' + pc.count);
  assert.ok(pc.maxGap.len <= 25 * 60, `longest gap ${Math.round(pc.maxGap.len / 60)} min (${pc.maxGap.from} -> ${pc.maxGap.to})`);
  assert.deepEqual(pc.piles.map((x) => x.from + '->' + x.to), [], 'entries closer than a minute');
  // the end comes last, the hint shortly before it, and the hint is the only place that talks about a signal
  assert.equal(tl.at(-1).id, 'st_end');
  const hint = tl.findIndex((e) => e.id === 'k4_signal');
  assert.ok(hint > 0 && hint >= tl.length - 4, 'hint late in the story');
  assert.equal(r.game.def.story.filter((s) => isV1(s) && s.lines.some((l) => /Signal/.test(l.t))).length, 1);
  // every entry that exists was reached in the sim (nothing unreachable)
  assert.deepEqual(r.game.def.story.filter((s) => isV1(s) && r.game.state.story[s.id] === undefined).map((s) => s.id), []);
});

test('new game: the first entry is the start modal, bubbles are on by default', () => {
  const g = createReplikator();
  assert.equal(g.state.settings.storyBubbles, true);
  g.tick(1);
  assert.deepEqual(g.storyPendingModals().map((e) => e.id), ['st_start']);
});

/* ---------------- migration with the real v1 save ---------------- */

function loadFixture({ awaySeconds = 0 } = {}) {
  const backend = mem();
  backend.setItem('mg:replikator:save', FIXTURE_TEXT);
  const g = createReplikator();
  const rt = createRuntime(g, { storage: createStorage(backend), now: () => FIXTURE_T + awaySeconds * 1000 });
  const events = [];
  rt.on('story', (e) => events.push(e.id));
  const off = rt.load();
  return { g, rt, events, off };
}

test('migration 1 -> 2: the real v1 save gets no modal flood; seen entries are read, new ones are silently backfilled and unread', () => {
  const { g, events } = loadFixture();
  assert.equal(g.version, 7);
  const c = g.state.chronicle;
  assert.ok(!('backfill' in c), 'one-time flag removed');
  for (const id of OLD_IDS) assert.ok(c.read[id] && c.shown[id], 'old entry counts as read and shown: ' + id);
  // nothing pops up at load: no modal, no bubble backlog (the Akt II opening is real news and follows a few seconds later, see below)
  assert.deepEqual(g.storyPendingModals().map((e) => e.id), []);
  assert.deepEqual(g.storyBubbleBacklog().map((e) => e.id), []);
  assert.ok(g.state.rep2.act2, 'the finished v1 save starts Akt II');
  // entries whose condition is true for this save are in the Chronik, unread
  const stamped = g.def.story.filter((s) => g.state.story[s.id] !== undefined);
  const unread = g.storyUnread();
  assert.equal(unread, stamped.length - OLD_IDS.length);
  assert.ok(stamped.every(isV1), 'Akt II entries are not swallowed by the backfill');
  assert.ok(unread >= 40, 'backfilled: ' + unread);
  // old time stamps are untouched, the new entries keep the story order of the Chronik
  assert.equal(g.state.story.st_end, 49480.56353398053);
  const order = g.storyList().map((x) => x.def.id);
  assert.deepEqual(order, g.def.story.map((s) => s.id).filter((id) => order.includes(id)));
  // later play fires nothing old again; only the Akt II opening arrives, as a modal
  advance(g, 30);
  assert.deepEqual(events, ['a2_start']);
  assert.deepEqual(g.storyPendingModals().map((e) => e.id), ['a2_start']);
});

test('migration 1 -> 2 with offline catch-up: still no modal, and the unread entries show up as one Chronik badge, not as bubbles', () => {
  const { g, off } = loadFixture({ awaySeconds: 12 * 3600 });
  assert.ok(off && off.seconds > 3600);
  // 12 h away: the Akt II opening happened meanwhile and waits as the one modal; the old entries stay quiet
  assert.deepEqual(g.storyPendingModals().map((e) => e.id), ['a2_start']);
  assert.deepEqual(g.storyBubbleBacklog().map((e) => e.id), []);
  assert.ok(g.storyUnread() >= 40);
});

test('migration keeps a partly played v1 save sensible: seen entries read, unseen ones come later as normal entries', () => {
  const g = createReplikator();
  const data = { story: { st_start: 0.25, st_rep: 300 }, time: { played: 400 } };
  const out = g.migrations[1](JSON.parse(JSON.stringify(data)));
  assert.deepEqual(Object.keys(out.chronicle.read).sort(), ['st_rep', 'st_start']);
  assert.deepEqual(Object.keys(out.chronicle.shown).sort(), ['st_rep', 'st_start']);
  assert.equal(out.chronicle.backfill, true);
  assert.deepEqual(g.migrations[1]({}).chronicle.read, {}, 'a save without story data survives');
});

test('Akt II through galaxy 2 (jump, arrival, Archiv): no gap above 25 min, nothing within a minute, both starts', async () => {
  const { act2Run } = await import('../tools/story-replikator.mjs');
  for (const fixture of [null, new URL('./fixtures/replikator-end-v1.json', import.meta.url).pathname]) {
    const r = act2Run({ fixture, jump: true, galaxies: 2 });
    const g = r.game;
    const list = g.storyList().filter((x) => x.def.chapter.startsWith('a2'));
    const ids = list.map((x) => x.def.id);
    for (const id of ['jump_open', 'jump_first', 'gal_echo2']) assert.ok(ids.includes(id), id);
    assert.ok(ids.some((id) => id.startsWith('gal_') && id !== 'gal_echo2'), 'an arrival entry');
    assert.ok(ids.some((id) => id.startsWith('arch_')), 'an Archiv entry for the second galaxy');
    assert.ok(ids.indexOf('jump_open') < ids.indexOf('jump_first'));
    for (let i = 1; i < list.length; i++) {
      const gap = list[i].t - list[i - 1].t;
      assert.ok(gap >= 59, `${list[i - 1].def.id} -> ${list[i].def.id}: ${gap} s`);
      assert.ok(gap <= 25 * 60, `${list[i - 1].def.id} -> ${list[i].def.id}: ${Math.round(gap / 60)} min`);
    }
  }
});

/* ---------------- Paket 6: Funksprüche, Echo, Enden ---------------- */

const END_FIXTURE = new URL('./fixtures/replikator-end-v1.json', import.meta.url).pathname;
const text = (g, id) => g.def.story.find((s) => s.id === id).lines.map((l) => resolve(g, l)).join(' ');

test('Akt II through the end: the story is told in order, no gap above 25 min and nothing within a minute until the first epilogue (fresh start and the real save); the other ending follows', async () => {
  const { act2Run } = await import('../tools/story-replikator.mjs');
  const ARC = ['f_m1', 'f_m2', 'f_m3', 'r_antrieb', 'r_kopie', 'e_hello', 'e_frueher', 'e_wrack', 'f_m4', 'e_zaehlen', 'f_m5', 'm_bake'];
  for (const fixture of [null, END_FIXTURE]) {
    const r = act2Run({ fixture, end: true });
    const g = r.game;
    const list = g.storyList().filter((x) => x.def.chapter.startsWith('a2'));
    const ids = list.map((x) => x.def.id);
    for (const id of ARC) assert.ok(ids.includes(id), id);
    assert.deepEqual(ARC.map((id) => ids.indexOf(id)), ARC.map((id) => ids.indexOf(id)).sort((a, b) => a - b), 'the reveal is told in order');
    assert.ok(ids.indexOf('m_bake') < ids.indexOf('end_merge'), 'the beacon comes before the epilogue');
    assert.ok(ids.includes('end_merge') && ids.includes('end_split2'), 'first the merge, three jumps later the other ending');
    assert.ok(ids.indexOf('end_again') < ids.indexOf('end_split2'));
    assert.ok(g.state.layers.jump.count - g.state.rep2.end.jumps0 >= 3);
    const first = list[ids.indexOf('end_merge')].t;
    for (let i = 1; i < list.length; i++) {
      const gap = list[i].t - list[i - 1].t;
      if (list[i].t > first) break;
      assert.ok(gap >= 59, `${list[i - 1].def.id} -> ${list[i].def.id}: ${gap} s`);
      assert.ok(gap <= 25 * 60, `${list[i - 1].def.id} -> ${list[i].def.id}: ${Math.round(gap / 60)} min`);
    }
  }
});

test('the reveal waits for its galaxy: no radio message before galaxy 3, the Echo does not speak before galaxy 5, the beacon only with all six types', () => {
  const gate = (id) => {
    const g = createReplikator();
    return g.def.story.find((s) => s.id === id).cond;
  };
  const g = createReplikator();
  g.state.rep2.act2 = true;
  g.state.rep2.act2At = 0;
  g.state.time.played = 1e6;
  g.state.rep2.gal.type = 'zwerg';
  for (const [id, n] of [['f_m1', 3], ['f_m3', 4], ['e_hello', 5], ['f_m5', 6]]) {
    g.state.rep2.gal.n = n - 1;
    g.state.story = {};
    g.state.rep2.gal.n = n - 1;
    assert.ok(!gate(id)(g), id + ' not before galaxy ' + n);
  }
  g.state.rep2.gal.n = 3;
  assert.ok(gate('f_m1')(g));
  g.state.rep2.gal.n = 6;
  g.state.story = { f_m5: 1 };
  assert.ok(!gate('m_bake')(g));
  for (const t of ['spirale', 'zwerg', 'elliptisch', 'kollision', 'leerraum', 'quasar']) g.state.rep2.archive[t] = 1;
  assert.ok(gate('m_bake')(g));
});

test('setups are paid off: the register, the Original, the signal, the fragments, the open task of WR-0', () => {
  const g = createReplikator();
  // v1: "mit allen Fehlern des Originals" -> r_kopie turns it on the probe itself
  assert.match(text(g, 'st_rep'), /allen Fehlern des Originals/);
  assert.match(text(g, 'r_kopie'), /Kopie des Prototyps/);
  assert.match(text(g, 'r_kopie'), /Fehler des Originals: vollständig übernommen/);
  assert.match(text(g, 'r_kopie'), /als Lob genommen/);
  // st_end: "Ich finde etwas für dich. Später." -> the register
  assert.match(text(g, 'st_end'), /Ich finde etwas für dich\. Später\./);
  assert.match(text(g, 'x_aufgaben'), /Später\. Später: nicht datiert/);
  for (const id of ['end_merge', 'end_split']) {
    assert.match(text(g, id), /ich habe etwas für dich gefunden/);
    assert.match(text(g, id), /Du führst das Register/);
    assert.match(text(g, id), /Aufgabe angenommen\. Register eröffnet/);
  }
  assert.match(text(g, 'end_merge'), /Bestand laut Register: eine\. Bestand laut Karte: eine/);
  assert.match(text(g, 'end_split'), /Eintrag 2/);
  // "Bestand laut Register: eine" was said by the Wartung before: a2_echo, gal_echo2, f_m2, e_hello
  for (const id of ['a2_echo', 'gal_echo2', 'f_m2', 'e_hello']) assert.match(text(g, id), /Bestand laut Register: eine/);
  // a2_start: a signal with the designation -> e_hello: it was the Echo's
  assert.match(text(g, 'a2_start'), /Kennung/);
  assert.match(text(g, 'e_hello'), /Das Signal in deiner ersten Galaxie war meins/);
  // the fragments: Dienstag, Kantine, wir warten, the short word -> messages and beacon
  assert.match(text(g, 'sig_0'), /Dienstag/);
  assert.match(text(g, 'f_m1'), /Dienstag/);
  assert.match(text(g, 'sig_1'), /Kantine/);
  assert.match(text(g, 'f_m2'), /Kantine/);
  assert.match(text(g, 'sig_3'), /Wiedervorlage: später/);
  assert.match(text(g, 'm_bake'), /Danke/);
  assert.match(text(g, 'm_bake'), /Wiedervorlage: erledigt/);
  // the ruins of the first galaxy: the drive of a2_ruin1 is the prototype's (r_antrieb), the repair traces of a2_ruin3 are the prototype's (e_wrack)
  assert.match(text(g, 'a2_ruin1'), /ausgebrannter Antrieb/);
  assert.match(text(g, 'r_antrieb'), /ausgebrannter Antrieb/);
  assert.match(text(g, 'a2_ruin3'), /Reparaturspuren/);
  assert.match(text(g, 'e_wrack'), /selbst repariert/);
  // the task of the builders: "Werde mehr" -> the form had one line
  assert.match(text(g, 'st_start'), /Werde mehr/);
  assert.match(text(g, 'f_m3'), /Formular hatte nur eine Zeile/);
  // exactly one probe was built
  assert.match(text(g, 'f_m2'), /nur eine Sonde gebaut/);
  // radio messages carry their age, and it grows from message to message
  const ages = ['f_m1', 'f_m2', 'f_m3', 'f_m4', 'f_m5', 'm_bake'].map((id) => Number(text(g, id).match(/Alter: ([\d.]+) Jahre/)[1].replace('.', '')));
  assert.deepEqual(ages, ages.slice().sort((a, b) => a - b));
  assert.ok(ages[0] > 200, 'older than the fragments (41 / 63 / 118 / 200 years)');
});

test('both endings are reachable, each has its own epilogue and an achievement; the third (both) needs the other ending too', async () => {
  const { endChoose } = await import('../games/replikator/ending.js');
  const { act2Game } = await import('./helpers/replikator-act2.mjs');
  const { GAL_ORDER } = await import('../games/replikator/galaxy.js');
  for (const [first, second] of [['merge', 'split'], ['split', 'merge']]) {
    const g = act2Game(1);
    GAL_ORDER.forEach((t) => (g.state.rep2.archive[t] = 1));
    g.state.time.played = 5000;
    assert.ok(endChoose(g, first));
    advance(g, 1500);
    assert.ok(g.state.story['end_' + first] !== undefined, 'epilogue of ' + first);
    assert.ok(g.state.story['end_' + second] === undefined);
    assert.ok(g.hasAch('end_' + first) && !g.hasAch('end_' + second) && !g.hasAch('end_both'));
    g.state.layers.jump.count += 3;
    advance(g, 1500);
    assert.ok(g.state.story.end_again !== undefined, 'the hint for the other ending');
    assert.ok(endChoose(g, second));
    advance(g, 1500);
    assert.ok(g.state.story['end_' + second + '2'] !== undefined, 'epilogue of the second ending');
    assert.ok(g.hasAch('end_merge') && g.hasAch('end_split') && g.hasAch('end_both'));
  }
});
