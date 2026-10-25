import test from 'node:test';
import assert from 'node:assert/strict';
import { createMerlin } from '../games/merlin/logic.js';
import { CAST, isMet, metCast, merlinStageList } from '../games/merlin/characters.js';

test('Figuren: Merlin always, Rick after e1_leo, Joey after e2_jonas (no spoilers)', () => {
  const g = createMerlin();
  assert.deepEqual(metCast(g), ['merlin']);
  g.state.chronicle.shown.e1_leo = true;
  assert.deepEqual(metCast(g), ['merlin', 'waechter']);
  assert.ok(!isMet(g, 'chronist'));
  g.state.chronicle.read.e2_jonas = true;
  assert.deepEqual(metCast(g), ['merlin', 'chronist', 'waechter']);
});

test('unlock ids exist in the story and cards have role and bio', () => {
  const g = createMerlin();
  for (const c of Object.values(CAST)) {
    assert.ok(c.role && c.bio, c.id);
    if (c.unlock) assert.ok(g.def.story.some((s) => s.id === c.unlock), c.unlock);
  }
  assert.equal(CAST.merlin.role, 'Zauberer, lebt rückwärts');
});

test('Merlin age stages: only those already passed, oldest first, current flagged', () => {
  assert.deepEqual(merlinStageList(0).map((s) => s.age), [75]);
  assert.deepEqual(merlinStageList(1).map((s) => s.age), [75]);
  assert.deepEqual(merlinStageList(2).map((s) => s.age), [75, 55]);
  assert.deepEqual(merlinStageList(5).map((s) => s.age), [75, 55, 40]);
  const l = merlinStageList(7);
  assert.deepEqual(l.map((s) => s.age), [75, 55, 40, 25]);
  assert.deepEqual(l.map((s) => !!s.current), [false, false, false, true]);
  assert.equal(l.at(-1).img, CAST.merlin.stages[7].img);
});
