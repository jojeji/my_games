// Paket 3 in the active sim (fresh v1 finish AND the real end-of-v1 save): the sim's player takes its mutation decisions with the Auto-Genom's function
// (def.js mutAutoGenom). Checks the offer rhythm, that mutations do not break the map pacing (tests/sim-replikator-act2-map.test.mjs has the numbers),
// and the Akt II story: no gap over 25 min until the 10th sector, no two entries within a minute.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runSim, loadSaveFile } from '../tools/simulate.mjs';
import { TUNE as T } from '../games/replikator/tune.js';
import { MUTATIONS } from '../games/replikator/mutations.js';

const stop = (n) => (g) => g.state.rep2.map.claimed >= n;
const fresh = runSim({ hours: 11.5 + 8, dt: 2, quiet: true, act2: true, until: stop(10) });
const fixture = runSim({ game: loadSaveFile(new URL('./fixtures/replikator-end-v1.json', import.meta.url).pathname), hours: 8, dt: 2, quiet: true, act2: true, until: stop(10) });
const runs = { fresh, fixture };

test('offers: the first one with the 3rd sector, then about one per 25-30 min of play time; the genome fills up and swaps happen', () => {
  for (const [name, r] of Object.entries(runs)) {
    const offers = r.map.mut.filter((x) => x.kind === 'offer');
    const third = r.map.claims[2].t;
    assert.ok(Math.abs(offers[0].t - third) <= 4, name + ': first offer at the 3rd sector');
    const t10 = r.map.claims[9].t;
    assert.ok(offers.length >= 5 && offers.length <= 8, `${name}: ${offers.length} offers until 10 sectors`);
    for (let i = 1; i < offers.length; i++) {
      const d = offers[i].t - offers[i - 1].t;
      const fastest = Math.max(1, ...Object.values(T.mutFx).map((x) => x.offers || 1)); // Fehlerfreudig
      assert.ok(d >= T.mutEvery / fastest - 10 && d <= T.mutEvery * 1.5, `${name}: offer ${i + 1} after ${Math.round(d)} s`);
    }
    assert.ok(offers.at(-1).t <= t10 + 1);
    const g = r.game;
    assert.ok(g.state.rep2.mut.genome.length >= 3, name + ': genome ' + g.state.rep2.mut.genome);
    assert.ok(g.state.rep2.mut.taken >= 4);
    assert.equal(g.state.rep2.mut.queue, 0, 'the sim decides every offer');
  }
});

test('Akt II story: the mutation thread closes the gap (<= 25 min until the 10th sector, both starts), nothing within a minute of another entry', () => {
  for (const [name, r] of Object.entries(runs)) {
    const g = r.game;
    const start = r.map.start;
    const t10 = r.map.claims[9].t;
    const list = g.storyList().filter((x) => x.def.chapter.startsWith('a2') && x.t <= g.state.rep2.act2At + (t10 - start) + 1);
    let prev = g.state.rep2.act2At;
    let worst = 0;
    for (const e of list) {
      assert.ok(e.t - prev >= 59 || prev === g.state.rep2.act2At, `${name}: ${e.def.id} only ${Math.round(e.t - prev)} s after the previous entry`);
      worst = Math.max(worst, e.t - prev);
      prev = e.t;
    }
    assert.ok(worst <= 25 * 60, `${name}: longest gap ${Math.round(worst / 60)} min`);
    const ids = list.map((x) => x.def.id);
    assert.ok(ids.includes('mut_first') && ids.includes('mut_pick1') && ids.includes('mut_full') && ids.includes('mut_slot4'), `${name}: ${ids}`);
    // the first offer's modal comes within 5 min of the 3rd sector
    const first = list.find((x) => x.def.id === 'mut_first');
    assert.ok(first.def.modal && first.t - g.state.rep2.act2At - (r.map.claims[2].t - start) < 300);
    // every WR-0 report belongs to a mutation that was really taken
    for (const m of MUTATIONS) assert.equal(g.state.story['mut_' + m.id] !== undefined && g.state.rep2.mut.seen[m.id] === undefined, false, m.id);
  }
});

test('map pacing with mutations: both starts reach 10 sectors in 2-5 h and within a factor 2 of each other', () => {
  const t = (r) => (r.map.claims[9].t - r.map.start) / 60;
  for (const r of [fresh, fixture]) assert.ok(t(r) >= 120 && t(r) <= 300, 'minutes: ' + t(r));
  assert.ok(t(fresh) / t(fixture) <= 2 && t(fixture) / t(fresh) <= 2);
});
