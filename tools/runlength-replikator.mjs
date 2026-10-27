#!/usr/bin/env node
// Optimal run length per prestige layer for Replikator ("gain per second over fixed run lengths", see docs/LESSONS.md).
//   node tools/runlength-replikator.mjs [--phases rep1,rep2,...] [--layers replication,expansion,singularity] [--verbose]
// 1. plays the normal active sim and takes snapshots right after a prestige in several phases (early / mid / late replication-only play,
//    expansion phase, singularity phase),
// 2. from each snapshot plays several fixed run lengths of ONE layer (that layer prestiges exactly every L seconds, everything below it
//    follows the normal player logic, layers above are never prestiged, no challenges, autobuyers on) and measures
//    prestige currency gained per second (up to the last completed run, over the same time window for every L),
// 3. prints gain/s relative to the best length and the optimum per phase.
import { pathToFileURL } from 'node:url';
import { createReplikator } from '../games/replikator/logic.js';
import { parse, stringify } from '../engine/save.js';
import { runSim } from './simulate.mjs';

/** Snapshot points of the active sim: { id, label, layer, count } = right after the count-th prestige of `layer`. */
export const PHASES = [
  { id: 'rep1', label: 'Replikation früh', layer: 'replication', count: 3, measure: ['replication'] },
  { id: 'rep2', label: 'Replikation mitte', layer: 'replication', count: 10, measure: ['replication'] },
  { id: 'rep3', label: 'Replikation spät', layer: 'replication', count: 17, measure: ['replication'] },
  { id: 'exp1', label: 'Expansion früh', layer: 'expansion', count: 3, measure: ['replication', 'expansion'] },
  { id: 'exp2', label: 'Expansion spät', layer: 'expansion', count: 12, measure: ['replication', 'expansion'] },
  { id: 'sing1', label: 'Singularität früh', layer: 'singularity', count: 2, measure: ['replication', 'expansion', 'singularity'] },
  { id: 'sing2', label: 'Singularität spät', layer: 'singularity', count: 6, measure: ['replication', 'expansion', 'singularity'] },
];

/** Run lengths in seconds per layer. */
export const LENGTHS = {
  replication: [15, 30, 60, 120, 180, 300, 480, 720, 1200],
  expansion: [120, 300, 600, 1200, 2400, 4800],
  singularity: [120, 300, 600, 900, 1800, 3600],
};

const CURRENCY = { replication: 'blueprints', expansion: 'systems', singularity: 'cores' };
const clone = (state) => parse(stringify(state));

export function gameFromSnapshot(snap) {
  const g = createReplikator();
  g.load(clone(snap.state));
  g.chExit(); // snapshots are taken right after a prestige: leaving a challenge entered in the same tick loses nothing
  return g;
}

/** Snapshots {phase, t, state} of an active run (normal player, autobuyers on). */
export function takeSnapshots({ phases = PHASES, dt = 1, hours = 22 } = {}) {
  const snaps = {};
  runSim({
    hours,
    dt,
    quiet: true,
    stopAtEnd: false,
    until: (g, t) => {
      for (const p of phases) {
        if (snaps[p.id]) continue;
        const ls = g.state.layers[p.layer];
        if (ls.count === p.count && ls.runTime <= 1.5) snaps[p.id] = { phase: p, t, state: clone(g.state) };
      }
      return phases.every((p) => snaps[p.id]);
    },
  });
  return phases.map((p) => snaps[p.id]).filter(Boolean);
}

/** The layer a player works towards while running `layer`, and the gain at which it counts as reached. */
const NEXT = { replication: ['expansion', 5], expansion: ['singularity', 8] };

/**
 * One fixed run length from a snapshot. Two numbers:
 *  - rate: gain per second of `layer`'s currency. The window is the same for every L of a layer (`window`) and only completed runs
 *    count (a long run that is cut off at the end would otherwise be punished). Careful: Blaupausen feed back into production, so
 *    this number keeps rising with L for a long time; it is only meaningful next to ...
 *  - tNext: seconds until the NEXT layer could be used with a decent gain (the layer the player is really working towards);
 *    null = not within `limit`.
 */
export function measure(snap, layer, L, { window, limit, dt = 1 } = {}) {
  const g = gameFromSnapshot(snap);
  const cur = CURRENCY[layer];
  const c0 = g.state.cur[cur].total;
  const n0 = g.state.layers[layer].count;
  const [next, minGain] = NEXT[layer] || [];
  // reached = the next layer would at least double what the player holds of its currency (the sim's and the auto's rule), but >= minGain
  const nextGain = next ? Math.max(minGain, g.state.cur[CURRENCY[next]].run.toNumber()) : 0;
  let lastT = 0;
  let lastGain = c0;
  let prevCount = n0;
  let tNext = null;
  const skip = ['replication', 'expansion', 'singularity'].filter((id) => g.layerById[id].layer > g.layerById[layer].layer);
  runSim({
    game: g,
    hours: Math.max(window, limit) / 3600,
    dt,
    quiet: true,
    stopAtEnd: false,
    strategy: { fixed: { [layer]: L }, skip, noChallenges: true, autosOff: true },
    until: (gg, t) => {
      const n = gg.state.layers[layer].count;
      if (n !== prevCount) {
        prevCount = n;
        if (t <= window) {
          lastT = t;
          lastGain = gg.state.cur[cur].total;
        }
      }
      if (next && tNext === null && gg.layerUnlocked(next) && gg.prestigeGain(next).gte(nextGain)) tNext = t;
      return t >= window && (tNext !== null || !next || t >= limit);
    },
  });
  const gained = lastGain.sub(c0).toNumber();
  return { L, runs: prevCount - n0, rate: lastT > 0 ? gained / lastT : 0, tNext };
}

export function measureLayer(snap, layer, lengths = LENGTHS[layer], opt = {}) {
  const window = opt.window ?? Math.max(1800, 3 * Math.max(...lengths));
  const limit = opt.limit ?? (layer === 'replication' ? 7200 : 21600);
  const rows = lengths.map((L) => measure(snap, layer, L, { ...opt, window, limit }));
  let best = rows[0];
  for (const r of rows) if (r.rate > best.rate) best = r;
  let fast = null; // fastest to the next layer
  for (const r of rows) if (r.tNext !== null && (!fast || r.tNext < fast.tNext)) fast = r;
  return { phase: snap.phase, layer, rows, best, fast, window, limit };
}

export const fmtL = (L) => (L >= 60 ? (L / 60 + ' min').replace('.', ',') : L + ' s');

/** Time to the next layer per run length (minutes), the fastest in the last column. */
export function nextTable(results, layer) {
  const rs = results.filter((r) => r.layer === layer && r.fast !== undefined && NEXT[layer]);
  if (!rs.length) return '';
  const lengths = rs[0].rows.map((r) => r.L);
  const out = [`${layer === 'replication' ? 'Replikation' : 'Expansion'}: Minuten bis ${NEXT[layer][0] === 'expansion' ? 'Expansion' : 'Singularität'} mit Gewinn >= max(${NEXT[layer][1]}, Bestand) (- = nicht in ${fmtL(rs[0].limit)})`];
  out.push('Phase'.padEnd(20) + lengths.map((L) => fmtL(L).padStart(8)).join(' ') + ' | Schnellster');
  for (const r of rs) out.push(r.phase.label.padEnd(20) + r.rows.map((x) => (x.tNext === null ? '-' : (x.tNext / 60).toFixed(0)).padStart(8)).join(' ') + ' | ' + (r.fast ? fmtL(r.fast.L) : '-'));
  return out.join('\n');
}

export function table(results, layer) {
  const rs = results.filter((r) => r.layer === layer);
  if (!rs.length) return '';
  const lengths = rs[0].rows.map((r) => r.L);
  const out = [`${layer === 'replication' ? 'Replikation (Blaupausen/s)' : layer === 'expansion' ? 'Expansion (Sternsysteme/s)' : 'Singularität (Quantenkerne/s)'} relativ zum besten Wert`];
  out.push('Phase'.padEnd(20) + lengths.map((L) => fmtL(L).padStart(8)).join(' ') + ' | Optimum');
  for (const r of rs) {
    const mx = r.best.rate || 1;
    out.push(r.phase.label.padEnd(20) + r.rows.map((x) => (((x.rate / mx) * 100).toFixed(0) + ' %').padStart(8)).join(' ') + ' | ' + fmtL(r.best.L));
  }
  return out.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const arg = (k, d) => {
    const i = argv.indexOf('--' + k);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
  };
  const ids = arg('phases', PHASES.map((p) => p.id).join(',')).split(',');
  const layers = arg('layers', 'replication,expansion,singularity').split(',');
  const t0 = Date.now();
  const snaps = takeSnapshots({ phases: PHASES.filter((p) => ids.includes(p.id)) });
  const results = [];
  for (const s of snaps) for (const layer of s.phase.measure) if (layers.includes(layer)) results.push(measureLayer(s, layer));
  console.log('Snapshots (aktive Sim): ' + snaps.map((s) => `${s.phase.id} @ ${(s.t / 60).toFixed(0)} min`).join(', '));
  for (const layer of ['replication', 'expansion', 'singularity']) {
    const t = table(results, layer);
    if (t) console.log('\n' + t);
    const n = nextTable(results, layer);
    if (n) console.log('\n' + n);
  }
  if (argv.includes('--verbose')) {
    console.log('');
    for (const r of results) {
      console.log(`${r.phase.id} ${r.layer} (Fenster ${fmtL(r.window)}): ` + r.rows.map((x) => `${fmtL(x.L)}=${x.rate.toPrecision(3)}/s (${x.runs}x)`).join(' '));
    }
  }
  console.log(`\n(Rechenzeit ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
