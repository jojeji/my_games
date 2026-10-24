import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMerlin } from '../games/merlin/logic.js';
import { advance } from '../engine/core.js';
import { DEDICATION, CAST, portrait, lineText } from '../games/merlin/characters.js';
import { bonusAch } from '../games/merlin/def.js';

test('epilogue triggers only after the ending, is a replayable modal with both friends', () => {
  const g = createMerlin();
  advance(g, 2);
  g.slowChecks();
  assert.equal(g.state.story.epilog, undefined);
  assert.equal(g.state.story.finale, undefined);
  g.state.mer.finished = true;
  g.slowChecks();
  assert.notEqual(g.state.story.finale, undefined);
  g.slowChecks();
  assert.notEqual(g.state.story.epilog, undefined);
  const pend = g.storyPendingModals().map((e) => e.id);
  assert.ok(pend.indexOf('finale') < pend.indexOf('epilog')); // shown after the ending, in order
  const ep = g.def.story.find((s) => s.id === 'epilog');
  assert.ok(ep.replay && ep.modal && ep.lines.length >= 2 && ep.lines.length <= 5);
  const who = new Set(ep.lines.map((l) => l.who));
  assert.ok(who.has('chronist') && who.has('waechter'));
  assert.ok(ep.lines.some((l) => /Alles Gute zum 31\., Merlin\./.test(l.t)));
  // order: young Merlin receives the gift, the aging line comes last (and only it is old)
  assert.match(ep.lines.at(-1).t, /Fertig\? Nein\. Noch\.$/);
  assert.deepEqual(ep.lines.map((l) => !!l.old), [false, false, false, false, true]);
  assert.equal(portrait('merlin', 7, ep, 3).img, CAST.merlin.stages[7].img);
  assert.ok(ep.lines.some((l) => /Einunddreißig/.test(l.t)));
  assert.equal(portrait('merlin', 7, ep, 2).img, CAST.merlin.stages.at(-1).img); // young Merlin receives the gift
});

test('keepsake achievement has no balance impact', () => {
  const g = createMerlin();
  advance(g, 1);
  g.state.story.epilog = 1;
  g.slowChecks();
  assert.ok(g.hasAch('x31'));
  const n = bonusAch(g);
  assert.equal(n, g.achCount() - 1);
});

test('dedication text lives in characters.js and is rendered in the Mehr tab', () => {
  assert.match(DEDICATION, /Merlin.*31\. Geburtstag/);
  const ui = readFileSync(new URL('../games/merlin/ui.js', import.meta.url), 'utf8');
  assert.match(ui, /text: DEDICATION/);
  assert.ok(!ui.includes('31. Geburtstag'));
});

test('story coherence: whisper progression, Joey meets an older Merlin, dynamic finale list', () => {
  const g = createMerlin();
  const T = (id) => g.def.story.find((s) => s.id === id).lines.map((l) => lineText(g, l)).join(' ');
  assert.match(T('e2_jonas'), /etwas älter/);
  assert.match(T('e0_start'), /Genug/);
  assert.match(T('e2_arrive'), /„No“/);
  assert.match(T('e5_arrive'), /„Noc …“/);
  assert.match(T('e6_arrive'), /„Noch … noch/);
  assert.match(T('e7_both'), /Du musst Merlin sein/);
  assert.match(T('finale'), /Verfrühungen\. Jede war/); // nothing planted: no list
  g.state.upg.i0a = 1; g.state.upg.i3a = 1; g.state.upg.i6a = 1;
  assert.match(T('finale'), /„Sparbuch der Zeit“, „Das Fließband“ und „Das Rad“\. Jede war/);
});

test('hidden joke achievement has no production bonus', () => {
  const g = createMerlin();
  advance(g, 1);
  g.state.layers.rejuv.count = 99;
  g.slowChecks();
  assert.ok(g.hasAch('knapp'));
  assert.equal(bonusAch(g), g.achCount() - 1);
});
