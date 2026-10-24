import test from 'node:test';
import assert from 'node:assert/strict';
import { createMerlin } from '../games/merlin/logic.js';
import { advance } from '../engine/core.js';
import { typingDelayMs, lingerMs, planBacklog, createBubbleQueue, visibleWindow, isDiaryLine } from '../engine/kit/story-bubbles.js';

test('typing delay: 1.2-4 s, proportional to length, faster in fast tempo', () => {
  assert.equal(typingDelayMs('Hi'), 1200);
  assert.equal(typingDelayMs('x'.repeat(2000)), 4000);
  assert.ok(typingDelayMs('x'.repeat(100)) < typingDelayMs('x'.repeat(150)));
  assert.ok(typingDelayMs('x'.repeat(100), 'fast') < typingDelayMs('x'.repeat(100)));
  assert.ok(typingDelayMs('x'.repeat(200), 'normal', true) <= 1400);
  assert.ok(lingerMs('fast') < lingerMs('normal'));
  assert.equal(lingerMs('normal'), 6000);
});

test('planBacklog: one entry stays, several become one summary', () => {
  assert.deepEqual(planBacklog([]), []);
  const one = planBacklog([{ id: 'a' }]);
  assert.equal(one.length, 1);
  assert.equal(one[0].kind, 'entry');
  const many = planBacklog([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  assert.deepEqual(many, [{ kind: 'summary', key: 'summary', count: 3, firstId: 'a' }]);
});

test('queue: FIFO, dedupes entries, newest summary replaces older one', () => {
  const q = createBubbleQueue();
  assert.ok(q.push({ kind: 'entry', key: 'a', def: { id: 'a' } }));
  assert.ok(!q.push({ kind: 'entry', key: 'a', def: { id: 'a' } }));
  q.push({ kind: 'summary', key: 'summary', count: 2, firstId: 'x' });
  q.push({ kind: 'summary', key: 'summary', count: 5, firstId: 'x' });
  q.push({ kind: 'entry', key: 'b', def: { id: 'b' } });
  assert.equal(q.length, 3);
  assert.deepEqual(q.ids(), ['a', 'b']);
  assert.equal(q.shift().key, 'a');
  assert.equal(q.shift().count, 5);
  assert.ok(q.has('b'));
  q.clear();
  assert.equal(q.length, 0);
});

test('visibleWindow: max 3 stay, the oldest of them is faded, rest gone', () => {
  assert.deepEqual(visibleWindow(2), ['new', 'new']);
  assert.deepEqual(visibleWindow(3), ['new', 'new', 'new']);
  assert.deepEqual(visibleWindow(5), ['gone', 'gone', 'old', 'new', 'new']);
});

test('diary lines: long monologue only', () => {
  const mono = { lines: [{ who: 'merlin', t: 'x' }] };
  assert.ok(isDiaryLine(mono, mono.lines[0], 'x'.repeat(120)));
  assert.ok(!isDiaryLine(mono, mono.lines[0], 'kurz'));
  const dlg = { lines: [{ who: 'merlin' }, { who: 'chronist' }] };
  assert.ok(!isDiaryLine(dlg, dlg.lines[0], 'x'.repeat(200)));
});

test('merlin: entries triggered offline form a backlog until announced or read', () => {
  const g = createMerlin();
  const ids = g.def.story.filter((s) => !s.modal).map((s) => s.id);
  assert.ok(ids.length > 3);
  // simulate three non-modal entries that fired while muted
  for (const id of ids.slice(0, 3)) g.state.story[id] = 10;
  let backlog = g.storyBubbleBacklog();
  assert.deepEqual(backlog.map((d) => d.id), ids.slice(0, 3));
  const plan = planBacklog(backlog);
  assert.equal(plan[0].kind, 'summary');
  assert.equal(plan[0].count, 3);
  g.storyBubbleShown(ids[0]);
  g.state.chronicle.read[ids[1]] = true;
  assert.deepEqual(g.storyBubbleBacklog().map((d) => d.id), [ids[2]]);
  // modal entries never count
  const modal = g.def.story.find((s) => s.modal);
  g.state.story[modal.id] = 20;
  assert.ok(!g.storyBubbleBacklog().some((d) => d.id === modal.id));
});

test('settings defaults for the story bubbles exist on new and old saves', () => {
  const g = createMerlin();
  assert.equal(g.state.settings.storyBubbles, true);
  assert.equal(g.state.settings.storyTempo, 'normal');
  advance(g, 1);
});
