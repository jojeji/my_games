// Pacing of Myzel Paket 1 in the "Pendler" scenario (7:00-23:00, a visit every 60-150 min of 3 min each, 8 h night, offline path with the
// fixed 3 h cap), for BOTH choices of fork A. Deterministic: seeded visit pattern, fixed time step. Deploy gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPendler, runActive, runSchedule, pacing, hms } from '../tools/simulate-myzel.mjs';

const H = 3600;
const cache = {};
const pend = (fork, seed = 1) => (cache[fork + seed] ||= runPendler({ days: 6, seed, fork }));

for (const fork of ['s', 'm']) {
  test(`pendler, fork ${fork}: first Hyphen in the first visit (<= 4 min), fork A on day 1, Fruchtkörper on day 2, the content lasts about 2 days`, () => {
    const ctx = pend(fork);
    const F = ctx.first;
    assert.ok(F['prestige:h'] <= 4 * 60, 'first Hyphen at ' + F['prestige:h']);
    assert.ok(F['fork-chosen:a'] < 24 * H, 'fork chosen at ' + hms(F['fork-chosen:a']));
    assert.ok(F['prestige:' + fork] < 24 * H, 'first unit at ' + hms(F['prestige:' + fork]));
    assert.ok(F['prestige:f'] >= 24 * H && F['prestige:f'] < 48 * H, 'first Fruchtkörper at ' + hms(F['prestige:f']));
    for (const c of ['durre', 'frost', 'kahl']) assert.ok(F['challenge-done:' + c] < 3 * 24 * H, c + ' at ' + hms(F['challenge-done:' + c]));
    assert.ok(ctx.contentAt >= 40 * H && ctx.contentAt <= 64 * H, 'content complete at ' + hms(ctx.contentAt));
  });
}

test('pendler: both forks finish the content of Paket 1 in similar time (ratio <= 1.25), also with other visit patterns (seeds)', () => {
  for (const seed of [1, 2, 3]) {
    const a = pend('s', seed).contentAt;
    const b = pend('m', seed).contentAt;
    assert.ok(a && b, `seed ${seed}: content not finished`);
    const r = Math.max(a, b) / Math.min(a, b);
    assert.ok(r <= 1.25, `seed ${seed}: s ${hms(a)} vs m ${hms(b)} (ratio ${r.toFixed(2)})`);
    assert.ok(Math.min(a, b) >= 36 * H && Math.max(a, b) <= 72 * H, `seed ${seed}: ${hms(a)} / ${hms(b)}`);
  }
});

test('selten (one visit every 8 h): slower than the pendler but never standing still', () => {
  for (const fork of ['s', 'm']) {
    const sched = [];
    for (let t = 0; t < 8 * 86400; t += 8 * H) sched.push({ at: t, len: 180 });
    const ctx = runSchedule(sched, { fork });
    const stuck = ctx.visits.filter((v) => !v.progress).length;
    assert.ok(stuck <= 0.15 * ctx.visits.length, `${fork}: ${stuck} of ${ctx.visits.length} visits without progress`);
    const F = ctx.first;
    assert.ok(F['prestige:h'] <= 4 * 60);
    assert.ok(F['fork-chosen:a'] < 2 * 86400, 'fork at ' + hms(F['fork-chosen:a']));
    assert.ok('prestige:f' in F, 'no Fruchtkörper within 8 days');
  }
});

test('active play (information): the content is the same, just much faster than the commuter', () => {
  const a = runActive({ hours: 40, fork: 's', dt: 2 });
  assert.ok(a.contentAt, 'active play finishes');
  assert.ok(a.contentAt < pend('s').contentAt);
  assert.ok(a.contentAt >= 3 * H, 'not trivial: ' + hms(a.contentAt));
});

test('pacing summary is consistent', () => {
  const p = pacing(pend('s'));
  assert.ok(p.first.hyphen <= 240);
});
