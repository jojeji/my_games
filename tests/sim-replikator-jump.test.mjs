// Pacing of Akt II through the Galaxiensprung (Paket 5), deterministic (fixed seed and time step), player = the in-game logic (jumpPlay, SEED_PLAN, auto functions).
// Targets (active): first jump ~2-3 h after Akt II starts; galaxy 2 from the jump to its 10th sector <= 40 % of the v1 time (~12 h: <= 4.8 h), ideally 2.5-4 h; later galaxies
// faster or equal; all six types completed after ~12-18 h of Akt II; idle <= 2x active; fresh finish vs real save <= 2x for the first jump and for galaxy 2.
// The offline player (visit every 8 h for 2 min) is measured too (docs/replikator-akt2.md has the numbers).
import test from 'node:test';
import assert from 'node:assert/strict';
import { runSim, loadSaveFile, SIM_SEED } from '../tools/simulate.mjs';
import { GAL_ORDER } from '../games/replikator/galaxy.js';

const FIXTURE = new URL('./fixtures/replikator-end-v1.json', import.meta.url).pathname;
const H = 3600;
const allDone = (g) => GAL_ORDER.every((t) => g.state.rep2.archive[t]);
const run = (o) => runSim({ hours: 40, dt: 2, quiet: true, act2: true, jump: true, seed: SIM_SEED, until: allDone, ...o });
const t10 = (r, i) => (r.map.gals[i] && r.map.gals[i].claims[9] != null ? (r.map.gals[i].claims[9] - r.map.gals[i].start) / H : null);
const total = (r) => (Math.max(...r.map.gals.filter((x) => x.archive != null).map((x) => x.archive)) - (r.map.start ?? 0)) / H;

const fresh = run({});
const fixture = run({ game: loadSaveFile(FIXTURE) });
const idle = run({ act: 120, session: 20 });

test('the first jump comes ~2-3 h after Akt II starts, fresh and from the real save, at a similar time (ratio <= 2)', () => {
  for (const r of [fresh, fixture]) assert.ok(t10(r, 0) >= 1.5 && t10(r, 0) <= 3.2, 'first galaxy ' + t10(r, 0));
  assert.ok(t10(fresh, 0) / t10(fixture, 0) <= 2 && t10(fixture, 0) / t10(fresh, 0) <= 2);
});

test('galaxy 2 takes 2.5-4 h (never above 40 % of the ~12 h of version 1), fresh and real save within a factor of 2', () => {
  for (const r of [fresh, fixture]) {
    assert.ok(t10(r, 1) >= 2 && t10(r, 1) <= 4.4, 'galaxy 2 ' + t10(r, 1));
    assert.ok(t10(r, 1) <= 0.4 * 12.2);
  }
  assert.ok(t10(fresh, 1) / t10(fixture, 1) <= 2 && t10(fixture, 1) / t10(fresh, 1) <= 2);
});

test('later galaxies are as fast as galaxy 2 or faster; the Zwerggalaxie is the quick one', () => {
  for (const r of [fresh, fixture]) {
    r.map.gals.filter((x) => x.archive != null).slice(2).forEach((x, i) => assert.ok((x.claims[9] - x.start) / H <= t10(r, 1) * 1.1, `${x.type} ${(x.claims[9] - x.start) / H}`));
    const z = r.map.gals.find((x) => x.type === 'zwerg');
    if (z) assert.ok((z.claims[9] - z.start) / H < t10(r, 1) * 0.6);
  }
});

test('all six types are completed after 12-18 h of Akt II (active), both starts; a type completes once', () => {
  for (const r of [fresh, fixture]) {
    assert.ok(allDone(r.game), 'all six');
    const h = total(r);
    assert.ok(h >= 11.5 && h <= 18, 'Akt II end after ' + h.toFixed(1) + ' h');
    const done = r.map.gals.filter((x) => x.archive != null).map((x) => x.type);
    assert.equal(new Set(done).size, done.length, 'each type completes once');
  }
});

test('idle (check in every 2 min for 20 s) needs at most twice the active time', () => {
  assert.ok(allDone(idle.game));
  assert.ok(total(idle) <= 2 * total(fresh), `${total(idle).toFixed(1)} vs ${total(fresh).toFixed(1)} h`);
});

test('the sim is reproducible (same seed, same times)', () => {
  const again = run({ until: (g) => g.state.rep2.gal.n >= 3 });
  assert.deepEqual(again.map.gals.slice(0, 2).map((x) => x.claims[9]), fresh.map.gals.slice(0, 2).map((x) => x.claims[9]));
});

test('offline player (visit every 8 h for 2 min, real save): galaxy 1 within ~1 day, every later galaxy within ~6 h, all six types within ~3 days', () => {
  const r = runSim({ game: loadSaveFile(FIXTURE), hours: 24 * 4, dt: 2, quiet: true, act2: true, jump: true, seed: SIM_SEED, offline: { every: 8 * H, session: 120 }, until: allDone });
  assert.ok(allDone(r.game), 'all six within 4 days');
  assert.ok(t10(r, 0) <= 24, 'galaxy 1 ' + t10(r, 0));
  r.map.gals.filter((x) => x.archive != null).slice(1).forEach((x) => assert.ok((x.claims[9] - x.start) / H <= 6.5, `${x.type} ${(x.claims[9] - x.start) / H} h`));
  assert.ok(total(r) <= 72, 'Akt II end after ' + total(r).toFixed(0) + ' h');
});
