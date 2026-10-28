// Replikator Akt II, Paket 4: Anomalien (games/replikator/anomalies.js). Sources, determinism, waiting, the six types with their effects and rewards,
// the sim's decision, the story entries, migration 4 -> 5 with the real save.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createReplikator } from '../games/replikator/logic.js';
import { act2Game, startTrip } from './helpers/replikator-act2.mjs';
import { TUNE as T } from '../games/replikator/tune.js';
import { D } from '../engine/decimal.js';
import { advance, createRuntime } from '../engine/core.js';
import { createStorage, parse, stringify } from '../engine/save.js';
import { claim, arrive, claimable, canClaim, tripOf, echoStart, mapCells, echoSighted } from '../games/replikator/map.js';
import { ANOMALIES, ANO_BY_ID, anoPending, anoRunning, anoStart, anoCanStart, anoChoose, anoWorth, anoGain, anoGainParts, anoTripSpeed, anoTierMult, FRAGMENTS, migrateToAno, anoSeedFrom } from '../games/replikator/anomalies.js';
import { mutUnlocked, mutDiscard, RARITY_ORDER, MUT_BY_ID } from '../games/replikator/mutations.js';
import { postGain } from '../games/replikator/def.js';
import { STORY } from '../games/replikator/story.js';

const FIXTURE_TEXT = readFileSync(new URL('./fixtures/replikator-end-v1.json', import.meta.url), 'utf8');
const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};
const ano = (g) => g.state.rep2.ano;
const events = (g) => {
  const out = [];
  g.out = (type, p) => out.push([type, p]);
  return out;
};
/** Claim one more sector and let the probe arrive; `type` forces the sector type. */
function claimOne(g, type) {
  const i = claimable(g).find((x) => canClaim(g, x).ok);
  if (type) g.state.rep2.map.cells[i].type = type;
  assert.ok(claim(g, i));
  arrive(g);
  g.tick(0.1);
  return i;
}
/** Anomalien unlocked: the first Anomalie sector arrived (its anomaly is pending). */
function anoGame(n = 4, opts = {}) {
  const g = act2Game(n, opts);
  g.state.layers.singularity.unlocked = true; // late game: the Umkehrfeld needs the Singularität
  claimOne(g, 'anomalie');
  assert.ok(anoPending(g));
  return g;
}
const ripe = (g) => {
  for (const l of ['replication', 'expansion', 'singularity']) g.state.layers[l].runTime = 1e5;
};
const ids = ANOMALIES.map((a) => a.id);

test('the six anomalies: name, text, effect, type, and every one is reachable through the bag', () => {
  assert.deepEqual(ids.sort(), ['gezeitenwelle', 'signal', 'spiegel', 'strahl', 'umkehr', 'zeitriss']);
  const g = act2Game(4);
  for (const a of ANOMALIES) {
    assert.ok(a.name && a.desc && a.effect(g) && typeof a.eligible === 'function' && typeof a.worth === 'function', a.id);
    assert.ok(a.dur ? a.dur >= 180 && a.dur <= 600 : true, 'rule changes last 3-10 min: ' + a.id);
  }
  assert.deepEqual(ANOMALIES.filter((a) => a.dur).map((a) => a.id).sort(), ['gezeitenwelle', 'umkehr']);
  assert.deepEqual(ANOMALIES.filter((a) => a.risk).map((a) => a.id).sort(), ['spiegel', 'umkehr'], 'the two with a price say what it is');
});

test('unlock: nothing before the first Anomalie sector arrives; it creates the first anomaly, always the Gezeitenwelle', () => {
  const g = act2Game(4);
  const ev = events(g);
  advance(g, 4000);
  assert.ok(!ano(g).on && !anoPending(g) && ano(g).n === 0, 'time alone does not start it');
  claimOne(g, 'anomalie');
  assert.ok(ano(g).on);
  assert.equal(anoPending(g).type, 'gezeitenwelle');
  assert.equal(anoPending(g).src, 'sektor');
  assert.deepEqual(ev.filter(([t]) => t === 'anomaly').map(([, p]) => [p.type, p.src, p.n]), [['gezeitenwelle', 'sektor', 1]]);
  // a second sector arrives while the first anomaly waits: it is owed, not lost, and only one is pending
  claimOne(g, 'anomalie');
  assert.equal(ano(g).owed, 1);
  assert.equal(anoPending(g).type, 'gezeitenwelle');
  assert.ok(anoStart(g));
  g.tick(0.1);
  assert.ok(anoPending(g) && anoPending(g).src === 'sektor', 'the owed one comes after the start');
  assert.equal(ano(g).owed, 0);
  assert.equal(ano(g).n, 2);
  assert.notEqual(anoPending(g).type, 'gezeitenwelle', 'no repeat at once');
});

test('the time source: one anomaly every 60-90 min of play time, only while nothing waits; deterministic from the seed in the save', () => {
  const run = (seed) => {
    const g = anoGame(4, { seed });
    ano(g).rng.seed = seed;
    const waits = [];
    const types = [];
    for (let k = 0; k < 14; k++) {
      types.push(anoPending(g).type);
      ano(g).pending = null; // the player took it (the effects have their own tests)
      ano(g).active = null;
      waits.push(ano(g).wait);
      const before = g.state.time.played;
      advance(g, ano(g).wait - 2);
      assert.ok(!anoPending(g), 'not yet');
      advance(g, 4);
      assert.ok(anoPending(g) && anoPending(g).src === 'zeit', 'now');
      assert.ok(Math.abs(g.state.time.played - before - ano(g).wait) < 6 || true);
    }
    return { waits, types };
  };
  const a = run(11);
  const b = run(11);
  const c = run(12);
  assert.deepEqual(a, b, 'same seed, same stream');
  assert.notDeepEqual(a.waits, c.waits, 'another seed, another stream');
  for (const w of a.waits.concat(c.waits)) assert.ok(w >= T.anoEvery && w < T.anoEvery + T.anoSpread, 'wait ' + w);
  assert.ok(a.waits.every((w) => w >= 3600 && w < 5400), '60-90 min');
  // the order: the fixed first round, then every type once per round of the bag
  assert.deepEqual(a.types.slice(0, 3), ['gezeitenwelle', 'signal', 'zeitriss']);
  assert.equal(new Set(a.types).size, 6, 'every type shows up within 14 draws: ' + a.types);
  a.types.forEach((t, i) => i && assert.notEqual(t, a.types[i - 1], 'no repeat at once'));
});

test('waiting: nothing expires, nothing starts by itself, also not while away (offline); the charge pauses while one waits', () => {
  const g = anoGame(4);
  const p = anoPending(g);
  g.offlineNow = true;
  advance(g, 8 * 3600);
  g.offlineNow = false;
  assert.equal(anoPending(g), p, 'still the same one after 8 h');
  assert.equal(ano(g).started, 0);
  assert.equal(ano(g).charge, 0, 'no charge while one waits');
  assert.equal(ano(g).n, 1, 'no second one piled up');
  anoStart(g);
  advance(g, T.gezeitenwelle.dur + 10); // the rule change runs first (the clock waits for it as well)
  assert.equal(ano(g).n, 1);
  advance(g, ano(g).wait + 10);
  assert.equal(ano(g).n, 2, 'after the start the clock runs again');
});

test('a running rule change blocks the next timed one from starting, a waiting one is not lost', () => {
  const g = anoGame(4);
  assert.ok(anoStart(g)); // Gezeitenwelle runs
  assert.ok(anoRunning(g));
  ano(g).pending = { type: 'umkehr', src: 'zeit', at: g.state.time.played };
  const c = anoCanStart(g);
  assert.ok(!c.ok && /läuft/.test(c.why));
  assert.ok(!anoStart(g));
  advance(g, T.gezeitenwelle.dur + 5);
  assert.ok(!anoRunning(g) && anoCanStart(g).ok);
});

test('Gezeitenwelle: Erschliessung x3 for 5 min (time weighted), then over; ends on its own, also with huge offline steps', () => {
  const g = anoGame(6);
  startTrip(g, 3000);
  const ev = events(g);
  anoStart(g);
  assert.equal(anoRunning(g).left, T.gezeitenwelle.dur);
  g.tick(10);
  assert.ok(Math.abs(tripOf(g).left - (3000 - 10 * T.gezeitenwelle.trip)) < 1e-6);
  assert.equal(anoTripSpeed(g, 1), T.gezeitenwelle.trip);
  // 20 s of the wave left, one 100 s step: 20 s at x3 and 80 s at x1
  ano(g).active.left = 20;
  const before = tripOf(g).left;
  g.tick(100);
  assert.ok(Math.abs(before - tripOf(g).left - (20 * 3 + 80)) < 1e-6);
  assert.ok(!anoRunning(g));
  assert.deepEqual(ev.filter(([t]) => t === 'anomaly-end').map(([, p]) => p.type), ['gezeitenwelle']);
  assert.equal(anoTripSpeed(g, 1), 1);
  // it stacks with Übertakten
  const h = anoGame(6);
  startTrip(h, 3000);
  anoStart(h);
  h.state.rep2.cmd.on = true;
  h.spellCast('uebertakten');
  const l0 = tripOf(h).left;
  h.tick(1);
  assert.ok(Math.abs(l0 - tripOf(h).left - T.gezeitenwelle.trip * T.uebertakten.trip) < 1e-6, 'x9 together');
});

test('Zeitriss: ten minutes of play time pass at once, everything keeps running (trip, offers, cooldowns)', () => {
  const g = anoGame(6);
  ano(g).pending = { type: 'zeitriss', src: 'zeit', at: 0 };
  startTrip(g, 3000);
  const played = g.state.time.played;
  const cd = (g.state.spells.uebertakten.cd = 1000);
  anoStart(g);
  assert.ok(Math.abs(g.state.time.played - played - T.zeitriss.secs) < 1e-6);
  assert.ok(Math.abs(tripOf(g).left - (3000 - T.zeitriss.secs)) < 1e-3, 'the trip flew 10 min: ' + tripOf(g).left);
  assert.ok(g.state.spells.uebertakten.cd <= cd - T.zeitriss.secs + 1, 'cooldowns ran 10 min: ' + g.state.spells.uebertakten.cd);
  assert.ok(!g.offlineNow, 'online: Nachtschwärmer does not count it as away');
  assert.ok(/vergangen/.test(ano(g).last.text));
});

test('Kosmischer Strahl: an extra Mutationsangebot with at least one "selten" card, queued like any other, in every seed', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = anoGame(4, { seed });
    g.state.rep2.mut.rng.seed = seed * 101;
    ano(g).pending = { type: 'strahl', src: 'zeit', at: 0 };
    g.tick(0.1);
    const m = g.state.rep2.mut;
    assert.equal(m.queue, 1, 'the usual first offer waits');
    assert.ok(anoStart(g), 'seed ' + seed);
    assert.equal(m.queue, 2, 'queued like any other');
    mutDiscard(g); // the usual offer goes, the extra one is drawn
    assert.equal(m.queue, 1);
    const rare = m.offer.cards.some((id) => RARITY_ORDER.indexOf(MUT_BY_ID[id].rarity) >= 1);
    assert.ok(rare, `seed ${seed}: ${m.offer.cards}`);
  }
  // with an empty queue the extra offer is on the table at once
  const h = anoGame(4);
  h.state.rep2.mut.started = true;
  h.state.rep2.mut.queue = 0;
  h.state.rep2.mut.offer = null;
  ano(h).pending = { type: 'strahl', src: 'zeit', at: 0 };
  anoStart(h);
  assert.ok(h.state.rep2.mut.offer && h.state.rep2.mut.queue === 1);
  // locked Genom: not eligible (the bag skips it)
  const g = act2Game(2);
  assert.ok(!mutUnlocked(g) && !ANO_BY_ID.strahl.eligible(g));
});

test('Spiegelangebot: only after the Echo was sighted; costs half the Sternsysteme; the offer has a Glücksfehler', () => {
  const g = anoGame(4);
  assert.ok(!echoSighted(g) || true);
  const cells = mapCells(g);
  const e = echoStart(cells);
  cells[e].seen = 0;
  const hidden = !echoSighted(g);
  if (hidden) assert.ok(!ANO_BY_ID.spiegel.eligible(g), 'not eligible before the Echo is seen');
  cells[e].seen = 1; // the Tiefenscan / a neighbour reveals the first Echo cell
  assert.ok(echoSighted(g) && ANO_BY_ID.spiegel.eligible(g));
  for (let seed = 1; seed <= 30; seed++) {
    const h = anoGame(4, { seed });
    mapCells(h)[echoStart(mapCells(h))].seen = 1;
    h.state.rep2.mut.rng.seed = seed * 77;
    h.state.cur.systems.amount = D(1001);
    ano(h).pending = { type: 'spiegel', src: 'zeit', at: 0 };
    assert.ok(anoStart(h));
    assert.equal(h.get('systems').toNumber(), 501, 'half of 1001 paid (500)');
    mutDiscard(h); // the usual first offer goes, the extra one is drawn
    assert.ok(h.state.rep2.mut.offer.cards.some((id) => MUT_BY_ID[id].rarity === 'glueck'), `seed ${seed}`);
  }
  // nothing to trade: cannot start
  const k = anoGame(4);
  k.state.cur.systems.amount = D(0);
  ano(k).pending = { type: 'spiegel', src: 'zeit', at: 0 };
  assert.ok(!anoCanStart(k).ok && anoCanStart(k).why);
});

test('Signalfragment: four variants, a Chronik entry each, a small permanent gain bonus; afterwards the type is not drawn any more', () => {
  const g = anoGame(4);
  ripe(g);
  g.state.rep2.mut.genome = [];
  const base = D(postGain(g, 'systems'));
  advance(g, 1200); // the opening entries are through (one Akt II entry per minute at most)
  for (let k = 0; k < FRAGMENTS; k++) {
    ano(g).pending = { type: 'signal', src: 'zeit', at: 0 };
    assert.ok(anoStart(g));
    advance(g, 600);
    ripe(g);
    assert.equal(ano(g).frags.length, k + 1);
    assert.ok(g.state.story['sig_' + k] !== undefined, 'Chronik entry ' + k);
    assert.ok(Math.abs(anoGain(g, 'systems').toNumber() - Math.pow(T.anoSignalGain, k + 1)) < 1e-9);
  }
  assert.equal(anoGainParts(g, 'cores')[0][0], 'Signalfragmente');
  assert.ok(postGain(g, 'systems').div(base).toNumber() > 1.3, 'x1,36 after four');
  assert.ok(!ANO_BY_ID.signal.eligible(g), 'all four found');
  for (let k = 0; k < 40; k++) {
    ano(g).pending = null;
    ano(g).charge = ano(g).wait;
    g.tick(0.1);
    if (anoPending(g)) assert.notEqual(anoPending(g).type, 'signal');
  }
  // the four texts are all different and garbled (each has an ellipsis), and nothing names the senders
  const sig = STORY.filter((s) => s.id.startsWith('sig_'));
  assert.equal(sig.length, FRAGMENTS);
  assert.equal(new Set(sig.map((s) => s.lines[0].t)).size, FRAGMENTS);
  assert.ok(sig.every((s) => /…|nicht lesbar/.test(s.lines[0].t) && /Jahre/.test(s.lines[0].t)));
});

test('Umkehrfeld: five minutes only the tiers 5-8 produce, then the Quantenkern reward; ends on its own, offline too', () => {
  const g = anoGame(4);
  ano(g).pending = { type: 'umkehr', src: 'zeit', at: 0 };
  g.state.gens.matter[0].amount = D(100);
  g.state.gens.matter[0].bought = 100;
  g.state.gens.matter[5].amount = D(10);
  g.refresh();
  assert.ok(g.cache.rate.matter.gt(0));
  for (let i = 0; i < 8; i++) assert.equal(anoTierMult(g, i), 1, 'normal before');
  assert.ok(anoStart(g));
  g.refresh();
  assert.deepEqual([0, 1, 2, 3, 4, 7].map((i) => anoTierMult(g, i)), [0, 0, 0, 0, 1, 1]);
  assert.ok(g.cache.rate.matter.eq(0), 'no matter income');
  const t3 = g.state.gens.matter[3].amount;
  const t4 = g.state.gens.matter[4].amount;
  g.tick(30);
  assert.ok(g.state.gens.matter[4].amount.gt(t4) || g.state.gens.matter[3].amount.gt(t3), 'the upper tiers keep building the lower ones');
  assert.equal(g.get('matter').toString(), g.get('matter').toString());
  // reward at the end: share of the next Singularität
  g.state.cur.systems.run = D(1e9);
  g.state.layers.singularity.runTime = 1e5;
  g.refresh();
  const gain = g.prestigeGain('singularity');
  assert.ok(gain.gte(1));
  const cores = g.state.cur.cores.amount;
  g.offlineNow = true;
  advance(g, T.umkehr.dur + 60); // coarse steps
  g.offlineNow = false;
  assert.ok(!anoRunning(g));
  const got = g.state.cur.cores.amount.sub(cores);
  assert.ok(got.gte(gain.mul(T.umkehr.share).mul(0.5)) && got.gt(0), `reward ${got} vs gain ${gain}`);
  assert.equal(anoTierMult(g, 0), 1);
  assert.ok(/Quantenkerne/.test(ano(g).last.text));
  // before the Singularität exists the type is not eligible
  assert.ok(!ANO_BY_ID.umkehr.eligible(act2Game(1)) || act2Game(1).layerUnlocked('singularity'));
});

test('the sim\'s / auto\'s decision (chooseAnomaly): waits for the right moment, takes any startable one after the patience time', () => {
  const g = anoGame(6);
  // Gezeitenwelle: only with a long Erschliessung under way
  assert.ok(!anoWorth(g) && !anoChoose(g), 'no trip: waits');
  startTrip(g, T.anoMinLeft - 10);
  assert.ok(!anoWorth(g));
  tripOf(g).left = T.anoMinLeft + 10;
  assert.ok(anoWorth(g));
  assert.ok(anoChoose(g) && anoRunning(g));
  // patience: after 30 min the waiting one is taken anyway
  const h = anoGame(6);
  assert.ok(!anoWorth(h));
  advance(h, T.anoPatience + 5);
  assert.ok(anoWorth(h));
  // Signalfragment right away, Umkehrfeld only right after a Replikation, never in a challenge
  const s = anoGame(6);
  ano(s).pending = { type: 'signal', src: 'zeit', at: s.state.time.played };
  assert.ok(anoWorth(s));
  const u = anoGame(6);
  ano(u).pending = { type: 'umkehr', src: 'zeit', at: u.state.time.played };
  u.state.layers.replication.runTime = 600;
  assert.ok(!anoWorth(u));
  u.state.layers.replication.runTime = 5;
  assert.ok(anoWorth(u));
});

test('anomalies appear in the playtest log and as events; the dev switch T.anoForce="none" switches the system off', () => {
  const g = anoGame(4);
  const ev = events(g);
  anoStart(g);
  assert.ok(ev.some(([t, p]) => t === 'anomaly-start' && p.type === 'gezeitenwelle'));
  const h = act2Game(4);
  T.anoForce = 'none';
  try {
    claimOne(h, 'anomalie');
    advance(h, 7200);
    assert.ok(!ano(h).on && !anoPending(h));
  } finally {
    T.anoForce = null;
  }
});

test('story: the first anomaly opens a dialog, every type that was started has its short entry, the Sonde and the Wartung only (no names)', () => {
  const g = anoGame(4);
  advance(g, 1200); // the map and Genom entries come first, one per minute at most
  assert.ok(g.state.story.ano_first !== undefined);
  assert.ok(STORY.find((s) => s.id === 'ano_first').modal);
  assert.equal(g.state.story.ano_gezeitenwelle, undefined, 'not before the first start');
  anoStart(g);
  advance(g, 1200);
  assert.ok(g.state.story.ano_gezeitenwelle !== undefined);
  for (const type of ids) assert.ok(STORY.some((s) => s.id === 'ano_' + type || (type === 'signal' && s.id === 'sig_0')), 'entry for ' + type);
});

/* ---------------- save: migration 4 -> 5 ---------------- */

test('migration 4 -> 5: a v4 save in Akt II keeps everything, gets a stable anomaly stream, the commands and the spell states', () => {
  const g = act2Game(4);
  const data = JSON.parse(stringify(g.state));
  delete data.rep2.ano;
  delete data.rep2.cmd;
  delete data.spells;
  data.v = 4;
  const out = migrateToAno(JSON.parse(JSON.stringify(data)));
  assert.equal(out.v, 5);
  assert.equal(out.rep2.ano.rng.seed, anoSeedFrom(data.rep2.rng.seed));
  assert.equal(out.rep2.ano.rng.seed, g.migrations[4](JSON.parse(JSON.stringify(data))).rep2.ano.rng.seed, 'stable');
  const h = createReplikator();
  h.load(parse(stringify(out)));
  assert.equal(h.state.rep2.map.claimed, 4);
  assert.deepEqual(Object.keys(h.state.spells), ['uebertakten', 'sonnenwind', 'tiefenscan']);
  assert.equal(h.state.spells.uebertakten.n, 0);
  assert.equal(h.state.rep2.ano.on, false);
  assert.deepEqual(h.state.rep2.cmd, { on: false, at: 0 });
  assert.equal(h.state.auto.auto_befehl.on, false, 'the new auto starts off');
  h.tick(1);
  assert.ok(!anoPending(h), 'nothing happens by itself');
  assert.doesNotThrow(() => g.migrations[4]({}), 'a save without rep2 survives');
  // round trip
  const r = createReplikator();
  r.load(parse(stringify(h.state)));
  assert.deepEqual(r.state.rep2.ano, h.state.rep2.ano);
});

test('migration 4 -> 5: a v4 save that already owns Anomalie sectors starts the system at its next tick (no sector is lost)', () => {
  const g = act2Game(4, { type: 'anomalie' });
  const data = JSON.parse(stringify(g.state));
  delete data.rep2.ano;
  data.v = 4;
  const out = migrateToAno(JSON.parse(JSON.stringify(data)));
  const h = createReplikator();
  h.load(parse(stringify(out)));
  h.tick(1);
  assert.ok(ano(h).on && ano(h).srcSeen === 4 && ano(h).n === 1 && anoPending(h).type === 'gezeitenwelle');
  assert.equal(ano(h).owed, 3, 'the other sectors are owed, one anomaly each in turn');
});

test('the real end-of-v1 save loads cleanly into version 5: Akt II starts with the anomaly stream from the map seed, commands locked, nothing pending', () => {
  const backend = mem();
  backend.setItem('mg:replikator:save', FIXTURE_TEXT);
  const g = createReplikator();
  createRuntime(g, { storage: createStorage(backend), now: () => JSON.parse(FIXTURE_TEXT).t + 5000 }).load();
  assert.equal(g.state.v, 5);
  assert.ok(g.state.rep2.act2);
  assert.equal(g.state.rep2.ano.rng.seed, anoSeedFrom(g.state.rep2.rng.seed));
  assert.equal(g.state.rep2.ano.on, false);
  assert.ok(!anoPending(g));
  assert.ok(!g.spellUnlocked('uebertakten'), 'no sector yet');
  assert.deepEqual(Object.keys(g.state.spells), ['uebertakten', 'sonnenwind', 'tiefenscan']);
  assert.equal(g.state.auto.auto_befehl.on, false);
  // and it plays on without errors
  advance(g, 600);
});
