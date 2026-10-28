#!/usr/bin/env node
// Headless balance simulation for Replikator using the REAL game logic.
// Scripted greedy player: buys generators/upgrades, prestiges when the gain is "worth it",
// runs challenges right after an Expansion, buys research.
//
//   node tools/simulate.mjs [--hours 30] [--dt 1] [--act 1] [--quiet] [--idle] [--both]
//
// --act N : the simulated player only interacts every N seconds (autobuyers still run every tick),
//           use e.g. --act 60 to see how the game behaves when played "idle".
// --idle  : shorthand for --act 120 --session 20 ("check in every 2 minutes for ~20 s", phone sessions).
// --session N : player acts continuously for N seconds at the start of each --act interval (default 0 = one action per interval).
// --both  : run active (act 1) and idle (act 120) and print a comparison (idle should finish in <= ~2x active time).
// --act2  : keep playing after the end of version 1 (Akt II: the player also claims map sectors with the SAME function as the Auto-Erkundung,
//           mapAutoClaim in def.js). Prints the time of every claimed sector and of every Echo occupation (relative to the start of Akt II).
// --fixture <file> : start from a save file (e.g. tests/fixtures/replikator-end-v1.json) instead of a new game; goes through the real
//           migrations (and starts Akt II when the save has finished version 1). Combine with --act2 --hours N.
// runSim options commands:false / anomalies:false: the commands are not cast / no anomaly appears (isolates the map or the mutations)
// --jump / runSim option jump:true : the player also does the Galaxiensprung (jumpPlay: jump when open, pick the galaxy with galPick, buy Saatkern-Upgrades with SEED_PLAN).
//           With --act2 --hours N the CLI turns it on and prints per galaxy: type, start, sectors 3 / 6 / 10, jump, Saatkerne gained. Tests that stop at 10 sectors leave it off.
// --end merge|split|mergesplit|splitmerge : which ending the player takes (first, then the other one when it opens); default merge then split. With --jump the player makes the choice at once.
// runSim option endForce: ['merge'] etc. puts those endings in effect from the start (measurements of the bonuses in the galaxies of Akt II, tools/ending-replikator.mjs)
// --seed N : seed of the map RNG (default fixed, so runs are reproducible)
// --offline : player checks in every --every H hours (default 8) for --session S seconds (default 120); in between the real offline catch-up
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { advance } from '../engine/core.js';
import { createSaveStore } from '../engine/save.js';
import { createReplikator } from '../games/replikator/logic.js';
import { chPower, buyRepUpgrades, mapAutoClaim, singularityHeld, mutAutoGenom, chooseAnomaly, jumpPlay, buySeedPlan } from '../games/replikator/def.js';
import { MUT_BY_ID, RARITY } from '../games/replikator/mutations.js';
import { endPlay, endAvailable } from '../games/replikator/ending.js';
import { TUNE as T } from '../games/replikator/tune.js';
import { formatNumber as f, formatDuration } from '../engine/format.js';

const RESEARCH_ORDER = ['kern', 'b_ernte', 'c_auto', 'a_dichte', 'b_kosten', 'a_fluss', 'd_pruef', 'a_schmiede', 'c_schnell', 'c_zeit', 'z_horizont'];

/** Default strategy parameters ("worth it" factors: reset when gain >= factor * currency held-this-run). */
export const STRATEGY = {
  repFactor: 1.0, // replicate when gain >= repFactor * blueprints earned this expansion run
  expFactor: 1.0,
  singFactor: 0.25,
  repMinGain: 1,
  expMinGain: 2,
  singMinGain: 8,
  repMinTime: 20, // never replicate more often than this (seconds of run time)
  expMinTime: 60,
  singMinTime: 120,
  repStall: 900, // reset anyway when stuck this long and gain >= 1
  expStall: 2700,
  singStall: 5400,
  challengeTimeout: 600, // give a challenge up after this many seconds
  challengeRetryExp: 1, // retry a failed challenge after this many more expansions
  // Measurement switches (tools/runlength-replikator.mjs); all off for normal play:
  fixed: null, // { layerId: seconds } prestige exactly when the run of that layer is this old
  skip: [], // layer ids that are never prestiged by the player
  noChallenges: false,
  endPick: ['merge', 'split'], // the ending the player chooses first, then the other one when it opens (ending.js endPlay)
  autosOff: false, // switch the in-game prestige autos off (the player logic does the prestiging)
};

export const SIM_SEED = 7; // a typical layout: of 12 seeds the fresh 10-sector time ranged 47-278 min (median ~2 h), see docs/LESSONS.md

/** A game loaded from a save file text through the real migrations (no offline catch-up). `seed` replaces the map seed of a migrated save. */
export function loadSaveGame(text, { seed = SIM_SEED } = {}) {
  const g = createReplikator();
  const mem = new Map([['mg:replikator:save', text]]);
  const store = createSaveStore({ id: g.id, version: g.version, migrations: g.migrations, storage: { get: (k) => mem.get(k) ?? null, set: (k, v) => mem.set(k, v), remove: (k) => mem.delete(k) } });
  const res = store.load();
  if (!res) throw new Error('Spielstand nicht lesbar');
  if (seed != null) res.data.rep2 = { ...(res.data.rep2 || {}), rng: { seed } };
  g.load(res.data);
  return g;
}
export const loadSaveFile = (path, opts) => loadSaveGame(readFileSync(path, 'utf8'), opts);

const hms = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

/**
 * `commands: false` / `anomalies: false` switch the Akt II systems of Paket 4 off for this run (measurements and tests that isolate the map or the mutations):
 * the commands are not cast, no anomaly appears.
 */
export function runSim(opts = {}) {
  const keep = T.anoForce;
  if (opts.anomalies === false) T.anoForce = 'none';
  try {
    return runSimInner(opts);
  } finally {
    T.anoForce = keep;
  }
}

function runSimInner({ hours = 30, dt = 1, act: actEvery = 1, session = 0, quiet = false, verbose = false, strategy = {}, stopAtEnd = true, game = null, until = null, offline = null, act2 = false, seed = SIM_SEED, commands = true, jump = false, seedPlan, endForce = null } = {}) {
  const S = { ...STRATEGY, ...strategy };
  const g = game || createReplikator();
  if (!game && seed != null) g.state.rep2.rng.seed = seed; // reproducible map
  if (endForce) for (const k of endForce) { g.state.rep2.end.picked[k] = 0.001; g.state.rep2.end.order.push(k); } // measurement: these endings are in effect from the start
  if (act2) {
    stopAtEnd = false;
  }
  const map = { start: null, claims: [], echo: [], mut: [], ano: [], cmd: [], gals: [], ends: [] }; // Akt II: times (sim seconds) of the start, each claimed sector, each Echo occupation and each offer / choice
  const galNow = () => map.gals[map.gals.length - 1];
  const openGal = (n, type, start) => map.gals.push({ n, type, start, claims: [], jump: null, seeds: null, archive: null });
  if (act2 && g.state.rep2.act2) {
    map.start = 0; // a loaded save that already is in Akt II
    openGal(g.state.rep2.gal.n, g.state.rep2.gal.type, 0);
  }
  if (!commands) for (const sp of g.def.spells) g.state.spells[sp.id].auto = false;
  if (S.autosOff) for (const a of g.def.autos) if (a.kind === 'prestige') g.state.auto[a.id].on = false;
  let t = 0;
  const log = [];
  const firsts = {};
  const events = []; // meaningful events for gap analysis
  const chInfo = {}; // id -> { enteredAt, failedExp }
  let activeSince = 0;
  let endTime = null;
  const upgTimes = {};

  const note = (msg, key) => {
    const line = `${hms(t)}  ${msg}`;
    log.push(line);
    if (!quiet && (verbose || key !== 'quiet')) console.log(line);
  };

  g.emit = (type, p) => {
    if (type === 'prestige') {
      const L = g.layerById[p.id];
      const n = g.state.layers[p.id].count;
      events.push(t);
      if (!firsts[p.id]) {
        firsts[p.id] = { t, gain: p.gain, matter: g.state.cur.matter.run, bp: g.state.cur.blueprints.run, systems: g.state.cur.systems.run };
        note(`ERSTE ${L.name.toUpperCase()}: +${f(p.gain)} ${g.def.currencies.find((c) => c.id === L.currency).name}`);
      } else if (verbose || n % (p.id === 'replication' ? 25 : p.id === 'expansion' ? 5 : 1) === 0) {
        note(`${L.name} #${n}: +${f(p.gain)}  (Run ${formatDuration(g.state.layers[p.id].lastTime)}, Gesamt ${f(g.state.cur[L.currency].total)})`, 'quiet');
      }
    } else if (type === 'challenge-done') {
      events.push(t);
      firsts['ch_' + p.id] = { t };
      note(`Challenge geschafft: ${g.chalById[p.id].name} (Versuch ${g.state.challenge.entered[p.id]})`);
    } else if (type === 'upgrade') {
      events.push(t);
      if (!upgTimes[p.id]) upgTimes[p.id] = t;
    } else if (type === 'layer-unlocked') {
      note(`Layer freigeschaltet: ${g.layerById[p.id].name}`);
    } else if (type === 'milestone') {
      note(`Meilenstein: ${p.def.name}`, 'quiet');
    } else if (type === 'act2') {
      map.start = t;
      openGal(1, 'spirale', t);
      note(`=== AKT II beginnt (Anker 1e${g.state.rep2.anchor.toFixed(2)}, Sternsysteme ${f(g.get('systems'))}) ===`);
    } else if (type === 'map-trip') {
      note(`Erschließung startet: ${p.type} (${p.dur} s, Sternsysteme danach ${f(g.get('systems'))})`, 'quiet');
    } else if (type === 'map-claim') {
      map.claims.push({ t, n: p.n, type: p.type, gal: g.state.rep2.gal.n });
      if (galNow()) galNow().claims.push(t);
      note(`Sektor ${p.n} erreicht: ${p.type} (+${hms(t - (map.start ?? 0))} seit Akt II)`);
    } else if (type === 'mut-offer') {
      const row = { t, kind: 'offer', n: p.n, cards: p.cards, claimed: g.state.rep2.map.claimed };
      map.mut.push(row);
      note(`Angebot ${p.n}: ` + p.cards.map((id) => `${MUT_BY_ID[id].name} (${RARITY[MUT_BY_ID[id].rarity].name})`).join(' | '), 'quiet');
    } else if (type === 'mut-take') {
      map.mut.push({ t, kind: 'take', id: p.id, lost: p.lost, n: p.n });
      note(`  -> genommen: ${MUT_BY_ID[p.id].name}${p.lost ? ' statt ' + MUT_BY_ID[p.lost].name : ''}  [Genom: ${g.state.rep2.mut.genome.map((x) => MUT_BY_ID[x].name).join(', ')}]`, 'quiet');
    } else if (type === 'mut-discard') {
      map.mut.push({ t, kind: 'discard' });
      note('  -> verworfen', 'quiet');
    } else if (type === 'anomaly') {
      map.ano.push({ t, kind: 'new', type: p.type, src: p.src });
      note(`Anomalie erscheint: ${p.type} (${p.src})`, 'quiet');
    } else if (type === 'anomaly-start') {
      map.ano.push({ t, kind: 'start', type: p.type, text: p.text });
      note(`  -> gestartet: ${p.type}${p.text ? ' (' + p.text + ')' : ''}`, 'quiet');
    } else if (type === 'anomaly-end') {
      map.ano.push({ t, kind: 'end', type: p.type, text: p.text });
      note(`  -> beendet: ${p.type}${p.text ? ' (' + p.text + ')' : ''}`, 'quiet');
    } else if (type === 'spell') {
      map.cmd.push({ t, id: p.id });
      note(`Befehl: ${p.id}`, 'quiet');
    } else if (type === 'galaxy-jump') {
      if (galNow()) {
        galNow().jump = t;
        galNow().seeds = g.state.layers.jump.lastGain;
      }
      note(`Galaxiensprung #${g.state.layers.jump.count}: +${f(g.state.layers.jump.lastGain)} Saatkerne, Angebot ${p.opts.join(' / ')}`);
    } else if (type === 'galaxy') {
      openGal(p.n, p.type, t);
      note(`Galaxie ${p.n}: ${p.type}`);
    } else if (type === 'archive') {
      if (galNow()) galNow().archive = t;
      note(`Archiv: ${p.type} abgeschlossen`);
    } else if (type === 'ending') {
      map.ends.push({ t, kind: p.kind, second: p.second, gal: g.state.rep2.gal.n });
      note(`=== ENDE gewählt: ${p.kind}${p.second ? ' (zweites)' : ''} in Galaxie ${g.state.rep2.gal.n} ===`);
    } else if (type === 'echo-occupy') {
      map.echo.push({ t, n: p.n });
      note(`Das Echo besetzt einen Sektor (${p.n})`);
    }
  };

  const research = () => {
    for (const id of RESEARCH_ORDER) if (g.upgCanBuy(id)) g.upgBuy(id);
  };

  const wantPrestige = (id, factor, minTime, stall, minGain = 1) => {
    if (!g.canPrestige(id) || S.skip.includes(id)) return false;
    if (S.fixed && S.fixed[id] != null) return g.state.layers[id].runTime >= S.fixed[id];
    const L = g.layerById[id];
    const ls = g.state.layers[id];
    const gain = g.prestigeGain(id);
    const held = g.state.cur[L.currency].run;
    if (ls.runTime < minTime && ls.count > 0) return false;
    if (gain.gte(held.mul(factor).max(minGain))) return true;
    return ls.runTime > stall;
  };

  const doChallenges = () => {
    if (g.autoUnlocked('auto_chal') && g.state.auto.auto_chal.on) return; // the in-game autobuyer picks challenges
    const act = g.chActive();
    if (act) {
      const info = chInfo[act.id];
      if (t - info.enteredAt > S.challengeTimeout) {
        g.chExit();
        info.failedExp = g.state.layers.expansion.count;
        info.failPower = chPower(g);
        note(`Challenge abgebrochen: ${act.name}`, 'quiet');
      }
      return;
    }
    if (!g.chUnlocked()) return;
    // enter right after an expansion (fresh state), when not stuck in a long run
    const exp = g.state.layers.expansion;
    if (exp.runTime > 120 + actEvery) return;
    for (const c of g.def.challenges) {
      if (g.chDone(c.id) || !g.chAvailable(c.id)) continue;
      const info = chInfo[c.id] || (chInfo[c.id] = {});
      if (info.failedExp != null && exp.count < info.failedExp + S.challengeRetryExp) continue;
      if (info.failPower != null && chPower(g) < info.failPower + T.chRetryPower) continue; // same rule as the in-game Auto-Challenges
      if (g.chEnter(c.id)) {
        info.enteredAt = t;
        events.push(t);
        note(`Betrete Challenge: ${c.name}`, 'quiet');
      }
      return;
    }
  };

  const player = () => {
    if (act2 && g.state.rep2.act2) {
      if (jump) {
        endPlay(g, S.endPick); // the choice at the end of Akt II (ending.js), at once; the other ending as soon as it opens
        jumpPlay(g); // the Auto-Sprung's decision (def.js), taken by hand: jump when the galaxy is complete, pick the next one
        buySeedPlan(g, seedPlan); // Saatkern-Upgrades in the order of SEED_PLAN (option seedPlan: another order, [] = none)
      }
      while (mapAutoClaim(g)); // before the Auto-Erkundung unlocks the player claims by hand, with the same function (everything affordable, before any reset)
      mutAutoGenom(g); // the Auto-Genom's decision (def.js), taken by hand before it unlocks
      // starts a pending anomaly when it is worth it (anomalies.js). A Zeitriss moves the game clock by 10 min within this call; the sim's clock t
      // (= the player's real time) does not move, that is the point of it (event times in the sim output are real time, the story's time stamps are game time)
      chooseAnomaly(g);
      // an offline player follows the hints and switches the new autos on as soon as they unlock (they start off): that is what carries the game while away
      if (offline) for (const id of ['auto_map', 'auto_genom', 'auto_befehl', 'auto_jump']) if (g.autoUnlocked(id)) g.state.auto[id].on = true;
      g.spellAutoRun(); // the Auto-Befehl's decision (spells' autoWhen, commands.js), by hand before it unlocks; per-spell switches are respected
    }
    research();
    buyRepUpgrades(g, 'expansion'); // the same value-based buying as the in-game autobuyers (def.js)
    buyRepUpgrades(g, 'replication');
    g.genBuyAllMax('matter');
    if (wantPrestige('singularity', S.singFactor, S.singMinTime, S.singStall, S.singMinGain) && !singularityHeld(g)) g.prestige('singularity');
    else if (wantPrestige('expansion', S.expFactor, S.expMinTime, S.expStall, S.expMinGain)) {
      // do not leave a challenge by expanding: expansion is blocked in challenges anyway
      g.prestige('expansion');
    } else if (wantPrestige('replication', S.repFactor, S.repMinTime, S.repStall, S.repMinGain)) g.prestige('replication');
    if (!S.noChallenges) doChallenges();
  };

  const snapshotLine = () => {
    const s = g.state;
    return (
      `${hms(t)}  [Stand] Materie ${f(s.cur.matter.amount)} (+${f(g.incomePerSec('matter'))}/s)  ` +
      `BP ${f(s.cur.blueprints.amount)}  Sys ${f(s.cur.systems.amount)}  QK ${f(s.cur.cores.amount)}  ` +
      `Rep ${s.layers.replication.count} Exp ${s.layers.expansion.count} Sing ${s.layers.singularity.count}  ` +
      `Chal ${g.chDoneCount()}/8  Erf ${g.achCount()}`
    );
  };

  let nextSnap = 1800;
  let sinceAct = 0;
  const maxT = hours * 3600;
  const researchTotal = g.def.upgrades.filter((u) => u.group === 'research').length - 1; // one exclusive branch stays unbought
  const checkEnd = () => {
    if (endTime !== null) return false;
    const owned = g.def.upgrades.filter((u) => u.group === 'research' && g.upgLevel(u.id) > 0).length;
    if (g.chDoneCount() < g.def.challenges.length || owned < researchTotal) return false;
    endTime = t;
    note('=== ENDE v1: alle Challenges + alle (erreichbaren) Forschungsknoten ===');
    return stopAtEnd;
  };
  const snapIfDue = () => {
    if (t < nextSnap) return;
    const line = snapshotLine();
    log.push(line);
    if (!quiet) console.log(line);
    nextSnap += 1800;
  };
  let checkIns = 0;
  let offlineSecs = 0;
  let lostSecs = 0;
  let done = false;
  while (t < maxT && !done) {
    // offline = { every, session }: the player checks in every `every` s for `session` s (acting like the active player);
    // the rest of the time is caught up exactly like the runtime does after a long absence (core.js advance(), capped by the offline limit)
    if (offline && t % offline.every >= offline.session) {
      const away = offline.every - (t % offline.every);
      const used = Math.min(away, g.offlineCapSeconds());
      if (g.plogOffline) g.plogOffline(used);
      const realTick = g.tick;
      g.tick = (d) => {
        realTick.call(g, d);
        t += d;
        if (checkEnd()) done = true;
      };
      g.offlineNow = true;
      try {
        advance(g, used);
      } finally {
        delete g.tick;
        g.offlineNow = false;
      }
      g.state.time.offline += used;
      offlineSecs += used;
      lostSecs += away - used;
      t += away - used; // beyond the cap the time passes without progress
      snapIfDue();
      continue;
    }
    if (offline && (t % offline.every) < dt) checkIns++;
    g.tick(dt);
    t += dt;
    sinceAct += dt;
    // session > 0: the player checks in every `actEvery` s and acts every tick for `session` s (a short phone session)
    if (offline) player();
    else if (session > 0 && actEvery > dt) {
      if (t % actEvery < session) player();
    } else if (sinceAct >= actEvery) {
      sinceAct = 0;
      player();
    }
    if (until && until(g, t)) break;
    snapIfDue();
    if (checkEnd()) break;
  }

  // dead-wall analysis: longest gaps between meaningful events
  const gaps = [];
  let prev = 0;
  for (const e of [...events, t]) {
    if (e - prev > 0) gaps.push({ from: prev, len: e - prev });
    prev = e;
  }
  gaps.sort((a, b) => b.len - a.len);

  const result = { t, endTime, firsts, log, gaps: gaps.slice(0, 8), game: g, upgTimes, checkIns, offlineSecs, lostSecs, map };
  if (!quiet) {
    console.log('\n=== Zusammenfassung ===');
    for (const id of ['replication', 'expansion', 'singularity']) {
      const fi = firsts[id];
      console.log(`Erste ${g.layerById[id].name}: ${fi ? hms(fi.t) + ` (+${f(fi.gain)}, Materie-Run ${f(fi.matter)})` : 'nicht erreicht'}`);
    }
    console.log(
      'Challenges: ' +
        g.def.challenges.map((c) => `${c.name} ${firsts['ch_' + c.id] ? hms(firsts['ch_' + c.id].t) : '—'}`).join(' | '),
    );
    console.log(
      'Forschung: ' +
        g.def.upgrades
          .filter((u) => u.group === 'research')
          .map((u) => `${u.id} ${upgTimes[u.id] ? hms(upgTimes[u.id]) : '—'}`)
          .join(' | '),
    );
    console.log('Ende v1: ' + (endTime ? hms(endTime) : 'nicht erreicht in ' + hours + ' h'));
    if (act2) {
      const rel = (x) => (map.start == null ? '-' : hms(x - map.start));
      console.log(`Akt II: Start ${map.start == null ? 'nicht erreicht' : hms(map.start)}; Sektoren (seit Start): ` + (map.claims.map((c) => `${c.n}:${rel(c.t)}`).join(' ') || '-'));
      if (map.ends.length) console.log('Ende von Akt II: ' + map.ends.map((e) => `${e.kind}${e.second ? ' (zweites)' : ''} nach ${rel(e.t)} in Galaxie ${e.gal}`).join(' | '));
      if (map.gals.length) {
        console.log('Galaxien (Zeiten seit Akt II; Sektor 3 / 6 / 10 nach Galaxie-Start; Sprung; Saatkerne):');
        for (const x of map.gals) {
          const rel2 = (v) => (v == null ? '   -   ' : hms(v - x.start));
          console.log(`  ${x.n}. ${String(x.type).padEnd(10)} Start ${rel(x.start)}  Sektoren 3/6/10: ${[3, 6, 10].map((k) => rel2(x.claims[k - 1])).join(' ')}  Sprung ${x.jump == null ? '-' : rel(x.jump)}  Saatkerne ${x.seeds == null ? '-' : f(x.seeds)}  Archiv ${x.archive == null ? '-' : rel2(x.archive)}`);
        }
      }
      console.log('Echo besetzt (seit Start): ' + (map.echo.map((c) => `${c.n}:${rel(c.t)}`).join(' ') || '-'));
      const offers = map.mut.filter((x) => x.kind === 'offer');
      console.log(`Mutationen: ${offers.length} Angebote, ${map.mut.filter((x) => x.kind === 'take').length} genommen, ${map.mut.filter((x) => x.kind === 'discard').length} verworfen; Genom: ` + (g.state.rep2.mut.genome.map((x) => MUT_BY_ID[x].name).join(', ') || '-'));
      if (verbose) {
        console.log('Angebote und Entscheidungen (Minuten seit Akt II):');
        let cur = null;
        for (const x of map.mut) {
          if (x.kind === 'offer') {
            cur = x;
            console.log(`  ${rel(x.t)}  Sektoren ${x.claimed}  Angebot ${x.n}: ` + x.cards.map((id) => `${MUT_BY_ID[id].name}[${RARITY[MUT_BY_ID[id].rarity].name[0]}]`).join(' | '));
          } else if (x.kind === 'take') console.log(`           genommen: ${MUT_BY_ID[x.id].name}${x.lost ? ' (ersetzt ' + MUT_BY_ID[x.lost].name + ')' : ''}`);
          else console.log('           verworfen');
        }
      }
    }
    console.log(snapshotLine());
    console.log(
      'Längste Pausen ohne Kauf/Reset: ' + gaps.slice(0, 5).map((x) => `${formatDuration(x.len)} @${hms(x.from)}`).join(', '),
    );
  }
  return result;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[k] = Number.isNaN(Number(next)) ? next : Number(next);
        i++;
      } else out[k] = true;
    }
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = parseArgs(process.argv.slice(2));
  const started = Date.now();
  if (a.offline) {
    // player checks in every N hours (default 8) for M seconds (default 120); in between the real offline catch-up runs
    const every = (a.every ?? 8) * 3600;
    const sess = a.session ?? 120;
    const fix = typeof a.fixture === 'string' ? loadSaveFile(a.fixture, { seed: a.seed ?? SIM_SEED }) : null;
    const r = runSim({ game: fix, hours: a.hours ?? 24 * 14, dt: a.dt ?? 1, quiet: true, offline: { every, session: sess }, act2: !!a.act2 || !!fix, seed: a.seed ?? SIM_SEED, jump: !!a.jump, strategy: typeof a.end === 'string' ? { endPick: a.end === 'split' ? ['split', 'merge'] : ['merge', 'split'] } : {} });
    if (r.game.state.rep2.act2) {
      const claims = r.map.claims;
      const at = (n) => (claims[n - 1] ? `${hms(claims[n - 1].t - (r.map.start ?? 0))} (Besuch ${Math.floor((claims[n - 1].t - (r.map.start ?? 0)) / every) + 1})` : 'nicht erreicht');
      console.log(`Akt II offline: alle ${f(every / 3600)} h für ${sess} s einloggen. Sektoren 1 / 3 / 6 / 10: ${[1, 3, 6, 10].map(at).join(' | ')}; ${claims.length} Sektoren, ${r.checkIns} Besuche`);
      if (a.jump) {
        const rel = (x) => hms(x - (r.map.start ?? 0));
        console.log('Galaxien (seit Akt II): ' + r.map.gals.map((x) => `${x.n}.${x.type} ${rel(x.start)}${x.archive != null ? ' Archiv ' + hms(x.archive) : ''}${x.jump != null ? ' Sprung ' + rel(x.jump) : ''}`).join(' | '));
        console.log('Ende von Akt II: ' + (r.map.ends.length ? r.map.ends.map((e) => `${e.kind}${e.second ? ' (zweites)' : ''} nach ${rel(e.t)}`).join(' | ') : 'nicht erreicht'));
      }
      process.exit(0);
    }
    console.log(`Offline-Szenario: alle ${f(every / 3600)} h für ${sess} s einloggen, dazwischen Offline-Catch-up (Limit ${f(r.game.offlineCapSeconds() / 3600)} h)`);
    for (const id of ['replication', 'expansion', 'singularity']) {
      const fi = r.firsts[id];
      console.log(`Erste ${r.game.layerById[id].name}: ${fi ? hms(fi.t) + ` (Besuch ${Math.floor(fi.t / every) + 1})` : 'nicht erreicht'}`);
    }
    console.log('Challenges: ' + r.game.def.challenges.map((c) => `${c.name} ${r.firsts['ch_' + c.id] ? hms(r.firsts['ch_' + c.id].t) : '—'}`).join(' | '));
    console.log(`Ende v1: ${r.endTime ? hms(r.endTime) + ` (${(r.endTime / 3600 / 24).toFixed(1)} Tage, ${r.checkIns} Besuche, aktiv ${f((r.checkIns * sess) / 60)} min)` : 'nicht erreicht in ' + (a.hours ?? 24 * 14) + ' h'}`);
    console.log(`Offline berechnet ${f(r.offlineSecs / 3600)} h, durch das Limit verloren ${f(r.lostSecs / 3600)} h`);
    process.exit(0);
  }
  if (a.both) {
    const res = {};
    for (const [label, act] of [['aktiv (alle 1 s)', 1], ['idle (120 s / 20 s)', 120]]) {
      const r = runSim({ hours: a.hours ?? 40, dt: a.dt ?? 1, act, session: act > 1 ? 20 : 0, quiet: true, stopAtEnd: true });
      res[label] = r;
      const ch = r.game.def.challenges.map((c) => (r.firsts['ch_' + c.id] ? hms(r.firsts['ch_' + c.id].t) : '--')).join(' ');
      console.log(`${label.padEnd(18)} Rep ${hms(r.firsts.replication?.t ?? 0)}  Exp ${hms(r.firsts.expansion?.t ?? 0)}  Sing ${hms(r.firsts.singularity?.t ?? 0)}  Ende ${r.endTime ? hms(r.endTime) : 'nicht erreicht'}`);
      console.log(`${''.padEnd(18)} Challenges: ${ch}`);
    }
    const [a1, a2] = Object.values(res);
    if (a1.endTime && a2.endTime) console.log(`Idle/Aktiv = ${(a2.endTime / a1.endTime).toFixed(2)}x`);
    process.exit(0);
  }
  const game = typeof a.fixture === 'string' ? loadSaveFile(a.fixture, { seed: a.seed ?? SIM_SEED }) : null;
  runSim({ hours: a.hours ?? 30, dt: a.dt ?? 1, act: a.idle ? 120 : a.act ?? 1, session: a.idle ? 20 : a.session ?? 0, quiet: !!a.quiet, verbose: !!a.verbose, game, act2: !!a.act2 || !!game, seed: a.seed ?? SIM_SEED, jump: !!a.act2 || !!a.jump, strategy: typeof a.end === 'string' ? { endPick: a.end === 'splitmerge' ? ['split', 'merge'] : a.end === 'split' ? ['split'] : a.end === 'merge' ? ['merge'] : ['merge', 'split'] } : {} });
  console.log(`(Simulation dauerte ${((Date.now() - started) / 1000).toFixed(1)} s Rechenzeit)`);
}
