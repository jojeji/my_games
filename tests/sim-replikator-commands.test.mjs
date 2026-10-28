// Paket 4 in the active sim (fresh v1 finish AND the real end-of-v1 save): the sim's player casts the commands through the Auto-Befehl's function
// (g.spellAutoRun) and starts anomalies with chooseAnomaly (def.js). Checks the pacing of the map WITH the commands and anomalies, the Akt II story
// (no gap over 25 min until the 10th sector, nothing within a minute of another entry) and that each command / anomaly type is FELT:
// it moves what limits Akt II (the Erschliessung time, the gains after the softcap), measured against the same run without it (tools/commands-replikator.mjs,
// tools/anomalies-replikator.mjs print the full tables).
import test from 'node:test';
import assert from 'node:assert/strict';
import { runSim, loadSaveFile, SIM_SEED } from '../tools/simulate.mjs';
import { measureCmd } from '../tools/commands-replikator.mjs';
import { measureAno } from '../tools/anomalies-replikator.mjs';
import { startSnapshot } from '../tools/mutations-replikator.mjs';
import { TUNE as T } from '../games/replikator/tune.js';

const FIXTURE = new URL('./fixtures/replikator-end-v1.json', import.meta.url).pathname;
const stop = (n) => (g) => g.state.rep2.map.claimed >= n;
const min = (s) => s / 60;
const t10 = (r) => min(r.map.claims[9].t - r.map.start);
const play = (start, seed) =>
  start === 'fresh'
    ? runSim({ hours: 11.5 + 8, dt: 2, quiet: true, act2: true, until: stop(10), seed })
    : runSim({ game: loadSaveFile(FIXTURE, { seed }), hours: 8, dt: 2, quiet: true, act2: true, until: stop(10), seed });
// the sum of the pure travel times of 10 sectors (no commands, no waiting for prices): the map's own pace
const travel10 = min(Array.from({ length: 10 }, (_, n) => Math.round(T.mapTripBase * Math.pow(T.mapTripGrow, n))).reduce((a, b) => a + b, 0));

const runs = { fresh: play('fresh', SIM_SEED), fixture: play('fixture', SIM_SEED), fresh2: play('fresh', 2), fixture2: play('fixture', 2) };

test('with commands and anomalies both starts reach 10 sectors clearly faster than the travel time alone, within a factor 2 of each other', () => {
  for (const [name, r] of Object.entries(runs)) {
    const t = t10(r);
    assert.ok(t >= 55 && t <= 0.85 * travel10, `${name}: ${t.toFixed(0)} min (travel time alone ${travel10.toFixed(0)} min)`);
  }
  for (const [a, b] of [['fresh', 'fixture'], ['fresh2', 'fixture2']]) assert.ok(t10(runs[a]) / t10(runs[b]) <= 2 && t10(runs[b]) / t10(runs[a]) <= 2, `${a} vs ${b}`);
});

test('the sim casts the commands (Übertakten again and again, Tiefenscan, Sonnenwind) and every cast waits for its cooldown', () => {
  for (const [name, r] of Object.entries(runs)) {
    const by = (id) => r.map.cmd.filter((c) => c.id === id);
    assert.ok(by('uebertakten').length >= 4 && by('tiefenscan').length >= 1 && by('sonnenwind').length >= 1, `${name}: ${r.map.cmd.map((c) => c.id[0]).join('')}`);
    const g = r.game;
    for (const id of ['uebertakten', 'sonnenwind', 'tiefenscan']) {
      const casts = by(id);
      const base = id === 'uebertakten' ? T.uebertakten.cd : id === 'sonnenwind' ? T.sonnenwind.cd : T.tiefenscan.cd;
      const maxRate = 1 + T.cmdPulsar * 12; // the biggest Pulsar bonus a map can give
      for (let i = 1; i < casts.length; i++) assert.ok(casts[i].t - casts[i - 1].t >= base / maxRate / Math.max(1, T.mutFx.sonnenhunger.cmd) - 2, `${name} ${id} cooldown`);
      assert.ok(g.state.spells[id].n >= casts.length);
    }
  }
});

test('Akt II story: no gap over 25 min until the 10th sector in all four runs, no two entries within a minute, the new entries are there', () => {
  for (const [name, r] of Object.entries(runs)) {
    const g = r.game;
    const a0 = g.state.rep2.act2At;
    const end = a0 + (r.map.claims[9].t - r.map.start);
    const list = g.storyList().filter((x) => x.def.chapter.startsWith('a2') && x.t <= end + 1);
    let prev = a0;
    let worst = 0;
    for (const e of list) {
      assert.ok(e.t - prev >= 59 || prev === a0, `${name}: ${e.def.id} only ${Math.round(e.t - prev)} s after the previous entry`);
      worst = Math.max(worst, e.t - prev);
      prev = e.t;
    }
    worst = Math.max(worst, end - prev);
    assert.ok(worst <= 25 * 60, `${name}: longest gap ${Math.round(worst / 60)} min`);
    const ids = list.map((x) => x.def.id);
    assert.ok(ids.includes('cmd_unlock') && ids.includes('cmd_first'), `${name}: ${ids}`);
  }
});

test('anomalies in the sim: the first one comes with the first Anomalie sector (a Gezeitenwelle, with its dialog), every one is started by chooseAnomaly', () => {
  for (const name of ['fresh2', 'fixture2']) {
    const r = runs[name];
    const g = r.game;
    const news = r.map.ano.filter((x) => x.kind === 'new');
    const starts = r.map.ano.filter((x) => x.kind === 'start');
    assert.ok(news.length >= 1, name + ': an Anomalie sector arrived within 10 sectors');
    assert.equal(news[0].type, 'gezeitenwelle');
    assert.equal(news[0].src, 'sektor');
    assert.ok(starts.length >= 1 && starts[0].type === 'gezeitenwelle', name + ': started');
    assert.ok(starts.length >= news.length - 1, 'at most one waits at the end');
    assert.ok(g.state.story.ano_first !== undefined && g.state.story.ano_gezeitenwelle !== undefined, 'story entries');
    assert.ok(g.def.story.find((s) => s.id === 'ano_first').modal);
  }
});

test('each command is felt (fixture start, 3 h Akt II, mutations off): Übertakten and Tiefenscan shorten the time to 10 sectors clearly, the Sonnenwind-Ernte lifts the Sternsysteme', () => {
  const snap = startSnapshot('fixture', 1);
  const opts = { hours: 3, dt: 2 };
  const base = measureCmd(snap, [], opts);
  assert.ok(base.t10, 'baseline reaches 10 sectors: ' + base.t10);
  const over = measureCmd(snap, ['uebertakten'], opts);
  const scan = measureCmd(snap, ['tiefenscan'], opts);
  const wind = measureCmd(snap, ['sonnenwind'], opts);
  assert.ok(over.t10 <= base.t10 * 0.88, `Übertakten: ${over.t10.toFixed(0)} vs ${base.t10.toFixed(0)} min`);
  assert.ok(scan.t10 <= base.t10 * 0.88, `Tiefenscan: ${scan.t10.toFixed(0)} vs ${base.t10.toFixed(0)} min`);
  assert.ok(over.qk > base.qk + 0.08, `Übertakten lifts the Quantenkerne: +${(over.qk - base.qk).toFixed(2)} decades`);
  assert.ok(wind.sys > base.sys + 0.3, `Sonnenwind lifts the Sternsysteme: +${(wind.sys - base.sys).toFixed(2)} decades`);
  assert.ok(wind.qk > base.qk + 0.08, `... and, through them, the Quantenkerne: +${(wind.qk - base.qk).toFixed(2)}`);
});

test('each anomaly is felt (fixture start, anomalies every 15 min of one type): Gezeitenwelle and Zeitriss shorten the map, Kosmischer Strahl and Spiegelangebot bring mutations, Umkehrfeld pays Quantenkerne', () => {
  const snap = startSnapshot('fixture', 1);
  const opts = { hours: 3, dt: 2 };
  const base = measureAno(snap, 'none', opts);
  assert.ok(base.t10);
  const wave = measureAno(snap, 'gezeitenwelle', opts);
  const rift = measureAno(snap, 'zeitriss', opts);
  const beam = measureAno(snap, 'strahl', opts);
  const mirror = measureAno(snap, 'spiegel', opts);
  const rev = measureAno(snap, 'umkehr', opts);
  assert.ok(wave.starts >= 3 && wave.t10 <= base.t10 * 0.85, `Gezeitenwelle: ${wave.t10.toFixed(0)} vs ${base.t10.toFixed(0)} min after ${wave.starts} starts`);
  assert.ok(rift.starts >= 3 && rift.t10 <= base.t10 * 0.8, `Zeitriss: ${rift.t10.toFixed(0)} vs ${base.t10.toFixed(0)} min after ${rift.starts} starts`);
  assert.ok(beam.starts >= 3 && beam.offers >= base.offers + Math.floor(beam.starts * 0.6), `Strahl: ${beam.offers} offers vs ${base.offers}`);
  assert.ok(beam.qk > base.qk + 0.2 && beam.sys > base.sys + 0.2, `Strahl: the extra mutations lift the gains by +${(beam.qk - base.qk).toFixed(2)} decades Quantenkerne`);
  assert.ok(mirror.starts >= 3 && mirror.mut > base.mut && mirror.qk > base.qk + 0.3, `Spiegel: +${(mirror.qk - base.qk).toFixed(2)} decades Quantenkerne for half the Sternsysteme`);
  assert.ok(rev.starts >= 3 && rev.qk > base.qk + 0.1, `Umkehrfeld: +${(rev.qk - base.qk).toFixed(2)} decades Quantenkerne`);
});
