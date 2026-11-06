// Rhythm of the Myzel Chronik in the "Pendler" scenario (7:00-23:00, a visit every 60-150 min of 3 min each, 8 h night, offline path with the 3 h cap),
// forks s/l and m/z, seeds 1-5. Told in VISITS (the player looks in 5-10 times a day): about one entry per 1-2 visits, never more than 3 visits
// in a row without a new entry (after the first visit), at most 2 entries and one dialog in one visit, the chain in story order, all entries reached.
// Tool for the transcript: node tools/story-myzel.mjs [--fork s|m] [--forkB l|z] [--seed N].
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPendler, hms } from '../tools/simulate-myzel.mjs';
import { storyRhythm } from '../tools/story-myzel.mjs';

const D = 86400;
const COMBOS = [['s', 'l'], ['m', 'z']];
const SEEDS = [1, 2, 3, 4, 5];
const runs = {};
const pend = (fa, fb, seed) => (runs[fa + fb + seed] ||= runPendler({ days: 8, seed, fork: fa, forkB: fb, stopAtContent: false }));

for (const [fa, fb] of COMBOS) {
  test(`story rhythm ${fa}${fb}, seeds 1-5: one entry per 1-2 visits, no run of more than 3 visits without one, <= 2 entries and 1 dialog per visit`, () => {
    for (const seed of SEEDS) {
      const ctx = pend(fa, fb, seed);
      assert.ok(ctx.contentAt != null, 'the ending is reached');
      const r = storyRhythm(ctx);
      const who = `${fa}${fb} seed ${seed}`;
      assert.ok(r.visits >= 50, `${who}: visits ${r.visits}`);
      assert.ok(r.perVisit >= 0.5 && r.perVisit <= 1, `${who}: ${r.entries} entries in ${r.visits} visits`);
      assert.ok(r.worstGap <= 3, `${who}: ${r.worstGap} visits in a row without a new entry (at visit ${r.worstGapAt + 1}): ${r.per.map((x) => x.length).join('')}`);
      assert.ok(r.maxPerVisit <= 2, `${who}: ${r.maxPerVisit} entries in one visit`);
      assert.ok(r.maxModals <= 1, `${who}: two dialogs in one visit`);
      assert.deepEqual(r.per[0], ['st_start'], `${who}: the first visit begins with the start dialog`);
    }
  });

  test(`story chain ${fa}${fb}: the entries come in story order, every entry is reached (the Nachspiel after the ending), a few every day`, () => {
    for (const seed of SEEDS) {
      const ctx = pend(fa, fb, seed);
      const g = ctx.g;
      const who = `${fa}${fb} seed ${seed}`;
      const got = g.storyList().map((x) => x.def.id);
      const order = g.def.story.map((s) => s.id).filter((id) => got.includes(id));
      assert.deepEqual(got, order, `${who}: story order`);
      const missing = g.def.story.map((s) => s.id).filter((id) => !got.includes(id));
      assert.ok(missing.every((id) => id === 'n_taxus'), `${who}: never reached ${missing}`); // the last Nachspiel line waits for the 7th ring
      // the ending dialog is the last entry before the Nachspiel and happens on the day of the ending
      const end = ctx.events.find((e) => e.type === 'story' && e.id === 'end_ring');
      assert.ok(end && Math.abs(end.t - ctx.contentAt) < 3600, `${who}: end_ring at ${hms(end?.t)} vs ${hms(ctx.contentAt)}`);
      // entries per calendar day (days 1-5 of the game): never a quiet day
      for (let day = 0; day < 5; day++) {
        const n = ctx.events.filter((e) => e.type === 'story' && e.t >= day * D && e.t < (day + 1) * D).length;
        assert.ok(n >= 4, `${who}: day ${day + 1} has ${n} entries`);
      }
    }
  });
}

test('story: the key moments sit where the spec puts them (start in the first visit, fork A day 1, first Fruchtkörper day 2, fork B day 3, Waldnetz day 4)', () => {
  for (const seed of SEEDS) {
    const ctx = pend('s', 'l', seed);
    const at = (id) => ctx.events.find((e) => e.type === 'story' && e.id === id).t;
    assert.ok(at('st_start') === 0);
    assert.ok(at('fork_a') < D, 'fork A dialog on day 1: ' + hms(at('fork_a')));
    assert.ok(at('f_first') >= D && at('f_first') < 2 * D, 'first Fruchtkörper on day 2: ' + hms(at('f_first')));
    assert.ok(at('fork_b') >= 2 * D && at('fork_b') < 3 * D, 'fork B on day 3: ' + hms(at('fork_b')));
    assert.ok(at('w_first') >= 3 * D && at('w_first') < 4 * D, 'Waldnetz on day 4: ' + hms(at('w_first')));
  }
});
