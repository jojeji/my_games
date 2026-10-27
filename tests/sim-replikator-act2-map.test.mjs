// Pacing of the Akt II map (Paket 2) in the active sim: a fresh v1 finish (sim keeps playing after the end) AND the owner's real end-of-v1 save
// must experience the map at a similar tempo. Deterministic (fixed seed, fixed time step); the player claims with mapAutoClaim, the function
// of the in-game Auto-Erkundung. Targets: first sector within ~10 min, 3 sectors quickly, 10 sectors after ~1-5 h (layout dependent:
// over 12 seeds the fresh time ranged 47-278 min, see docs/LESSONS.md). The long save starts with a windfall (its banked stock pays the first sectors).
import test from 'node:test';
import assert from 'node:assert/strict';
import { runSim, loadSaveFile, SIM_SEED } from '../tools/simulate.mjs';

const min = (s) => s / 60;
const stop = (n) => (g) => g.state.rep2.map.claimed >= n;
const since = (r, n) => (r.map.claims[n - 1] ? r.map.claims[n - 1].t - r.map.start : null);

const fresh = runSim({ hours: 11.5 + 8, dt: 2, quiet: true, act2: true, until: stop(10) });
const fixture = runSim({ game: loadSaveFile(new URL('./fixtures/replikator-end-v1.json', import.meta.url).pathname), hours: 8, dt: 2, quiet: true, act2: true, until: stop(10) });

test('fresh v1 finish: Akt II starts with the end of v1, then 1 / 3 / 6 / 10 sectors at a steady pace', () => {
  assert.ok(fresh.endTime, 'v1 finished');
  assert.ok(Math.abs(fresh.map.start - fresh.endTime) <= 4, 'Akt II starts with the end of v1');
  assert.ok(min(since(fresh, 1)) <= 10, 'first sector ' + min(since(fresh, 1)));
  assert.ok(min(since(fresh, 3)) <= 40, 'third sector ' + min(since(fresh, 3)));
  assert.ok(min(since(fresh, 6)) <= 120, 'sixth sector ' + min(since(fresh, 6)));
  const t10 = min(since(fresh, 10));
  assert.ok(t10 >= 45 && t10 <= 300, '10 sectors after ' + t10 + ' min');
  // the pace slows down (every sector costs more): the intervals do not shrink to nothing
  assert.ok(since(fresh, 10) > since(fresh, 6) && since(fresh, 6) > since(fresh, 3));
});

test('real end-of-v1 save: Akt II starts at once, the banked stock pays the first sectors, 10 sectors within hours', () => {
  assert.equal(fixture.map.start, 0, 'Akt II starts when the save is loaded');
  assert.ok(min(since(fixture, 1)) <= 10);
  assert.ok(min(since(fixture, 3)) <= 10, 'the stock of the long save pays the first sectors');
  const t10 = min(since(fixture, 10));
  assert.ok(t10 >= 45 && t10 <= 300, '10 sectors after ' + t10 + ' min');
  // but not the whole map at once: the price level follows the banked stock (mapAnchorSlope)
  assert.ok(fixture.map.claims.filter((c) => c.t - fixture.map.start < 600).length < 10, 'not all ten within 10 minutes');
});

test('both starts reach 10 sectors at a similar time (ratio <= 2)', () => {
  const a = since(fresh, 10);
  const b = since(fixture, 10);
  assert.ok(b / a <= 2 && a / b <= 2, `fresh ${Math.round(min(a))} min, long save ${Math.round(min(b))} min`);
});

test('the Echo takes one sector per 2 claimed sectors in both runs, never by itself', () => {
  for (const r of [fresh, fixture]) {
    assert.equal(r.map.echo.length, Math.floor(r.map.claims.length / 2));
    r.map.echo.forEach((e, i) => assert.equal(e.t, r.map.claims[2 * i + 1].t, 'the occupation happens with the claim'));
  }
});

test('the sim is reproducible (same seed, same times)', () => {
  const again = runSim({ hours: 11.5 + 8, dt: 2, quiet: true, act2: true, until: stop(3), seed: SIM_SEED });
  assert.deepEqual(again.map.claims.slice(0, 3).map((c) => c.t), fresh.map.claims.slice(0, 3).map((c) => c.t));
});
