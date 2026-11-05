// Pacing of the whole Myzel game (Paket 1 + 2) in the "Pendler" scenario (7:00-23:00, a visit every 60-150 min of 3 min each, 8 h night,
// offline path with the fixed 3 h cap), for BOTH choices of fork A and BOTH of fork B, seeds 1-5. Deterministic: seeded visit pattern, fixed
// time step. Deploy gate. Times are calendar days since the start ("day 3" = 2.0 <= t < 3.0 days).
// Also the progress metric of the spec (>= 90 % of the visits with progress, never 3 visits in a row without something new, the first
// visit after the night has progress) and the scenario "selten" (one visit every 8 h: never stands still).
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPendler, runActive, runSelten, pacing, progressMetric, hms } from '../tools/simulate-myzel.mjs';

const H = 3600;
const D = 86400;
const COMBOS = [['s', 'l'], ['s', 'z'], ['m', 'l'], ['m', 'z']];
const SEEDS = [1, 2, 3, 4, 5];
const cache = {};
const pend = (fa, fb, seed) => (cache[fa + fb + seed] ||= runPendler({ days: 10, seed, fork: fa, forkB: fb }));
const day = (t) => (t / D).toFixed(2);

for (const [fa, fb] of COMBOS) {
  test(`pendler ${fa}${fb}: the targets of the spec on seeds 1-5 (Hyphen in the first visit, fork A day 1, Fruchtkörper day 2, fork B day 3, Waldnetz day 4, first ring day 5, ending day 5-7)`, () => {
    for (const seed of SEEDS) {
      const ctx = pend(fa, fb, seed);
      const F = pacing(ctx).first;
      const who = `${fa}${fb} seed ${seed}`;
      assert.ok(F.hyphen <= 4 * 60, `${who}: first Hyphen at ${F.hyphen}`);
      assert.ok(F.forkA < D, `${who}: fork A at ${hms(F.forkA)}`);
      assert.ok(F.fruit >= D && F.fruit < 2 * D, `${who}: first Fruchtkörper at ${hms(F.fruit)}`);
      for (const k of ['chDurre', 'chFrost', 'chKahl']) assert.ok(F[k] !== null && F[k] < 3 * D, `${who}: ${k} at ${F[k]}`);
      assert.ok(F.forkB >= 2 * D && F.forkB < 3 * D, `${who}: fork B on day 3 (${day(F.forkB)})`);
      assert.ok(F.wLayer >= 3 * D && F.wLayer < 4 * D, `${who}: Waldnetz on day 4 (${day(F.wLayer)})`);
      assert.ok(F.ring1 >= 4 * D && F.ring1 < 5 * D, `${who}: first ring on day 5 (${day(F.ring1)})`);
      assert.ok(ctx.contentAt >= 5 * D && ctx.contentAt <= 7 * D, `${who}: ending on day 5-7 (${day(ctx.contentAt)})`);
      assert.ok(F.a2 !== null && F.b2 !== null && F.a2 < ctx.contentAt && F.b2 < ctx.contentAt, `${who}: both second branches open before the ending`);
    }
  });

  test(`progress metric ${fa}${fb}, seeds 1-5: >= 90 % of the visits with progress, never 3 visits in a row without something new, the first visit after the night has progress`, () => {
    for (const seed of SEEDS) {
      const m = progressMetric(pend(fa, fb, seed));
      const who = `${fa}${fb} seed ${seed}`;
      assert.ok(m.visits >= 40, `${who}: visits ${m.visits}`);
      assert.ok(m.ratio >= 0.9, `${who}: only ${m.withProgress} of ${m.visits} visits with progress`);
      assert.ok(m.worstNewGap <= 2, `${who}: ${m.worstNewGap} visits in a row without something new`);
      assert.ok(m.morning.length >= 4);
      for (const v of m.morning) assert.ok(v.progress, `${who}: first visit after the night (${hms(v.at)}) without progress`);
    }
  });
}

test('pendler: all four combinations end in similar time (ratio <= 1.25), for every visit pattern', () => {
  for (const seed of SEEDS) {
    const ends = COMBOS.map(([fa, fb]) => pend(fa, fb, seed).contentAt);
    const r = Math.max(...ends) / Math.min(...ends);
    assert.ok(r <= 1.25, `seed ${seed}: ${ends.map(hms).join(' / ')} (ratio ${r.toFixed(2)})`);
  }
  const all = SEEDS.flatMap((seed) => COMBOS.map(([fa, fb]) => pend(fa, fb, seed).contentAt));
  assert.ok(Math.max(...all) / Math.min(...all) <= 1.25, 'over all seeds');
});

test('selten (one visit every 8 h): slower than the pendler but never standing still, the ending is reached, the rings go on afterwards', () => {
  for (const [fa, fb] of [['s', 'l'], ['m', 'z']]) {
    const ctx = runSelten({ days: 20, fork: fa, forkB: fb });
    const m = progressMetric(ctx);
    assert.ok(m.ratio >= 0.9, `${fa}${fb}: ${m.withProgress} of ${m.visits} visits with progress`);
    assert.ok(ctx.contentAt !== null && ctx.contentAt <= 16 * D, `${fa}${fb}: ending at ${hms(ctx.contentAt)}`);
    assert.ok(ctx.contentAt > pend(fa, fb, 1).contentAt, 'slower than the commuter');
    assert.ok(ctx.g.state.layers.r.units > 5, 'Nachspiel: the rings go on');
    assert.equal(pacing(ctx).first.hyphen <= 4 * 60, true);
  }
});

test('active play (information): the whole game is much faster than the commuter, but not trivial', () => {
  const a = runActive({ hours: 200, fork: 's', forkB: 'l', dt: 2 });
  assert.ok(a.contentAt, 'active play finishes');
  assert.ok(a.contentAt < pend('s', 'l', 1).contentAt);
  assert.ok(a.contentAt >= 3 * D, 'not trivial: ' + hms(a.contentAt));
});
