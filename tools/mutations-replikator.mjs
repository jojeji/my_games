#!/usr/bin/env node
// What does each Replikator mutation really do in Akt II? Every mutation ALONE in the genome (no offers), active sim, per start:
//   fixture = the real end-of-v1 save, fresh = a fresh v1 finish (snapshot at the start of Akt II, so every variant starts from the same state).
// Variants: "beide" = benefit and catch, "Nutzen" = catch neutralised, "Haken" = benefit neutralised (needs MUT_SPLIT in mutations.js).
// Metrics against the run without mutation: (a) change of the time to 10 sectors, (b) factor on the gain of an Expansion / Singularität in the same game state (log10, what the softcaps let through), (c) change of the Sternsysteme + Quantenkerne total.
//
//   node tools/mutations-replikator.mjs [--hours 3.5] [--seeds 1,2] [--starts fixture,fresh] [--only id,id] [--dt 2] [--md]
import { pathToFileURL } from 'node:url';
import { createReplikator } from '../games/replikator/logic.js';
import { parse, stringify } from '../engine/save.js';
import { D } from '../engine/decimal.js';
import { TUNE as T } from '../games/replikator/tune.js';
import * as M from '../games/replikator/mutations.js';
import { runSim, loadSaveFile } from './simulate.mjs';

const FIXTURE = new URL('../tests/fixtures/replikator-end-v1.json', import.meta.url).pathname;
const clone = (s) => parse(stringify(s));

/** A game at the start of Akt II: 'fixture' (real save) or 'fresh' (sim until v1 is finished). */
export function startSnapshot(start, seed) {
  if (start === 'fixture') return clone(loadSaveFile(FIXTURE, { seed }).state);
  const r = runSim({ hours: 20, dt: 2, quiet: true, act2: true, seed, until: (g) => g.state.rep2.act2 });
  return clone(r.game.state);
}

const lg = (d) => (d && d.m > 0 ? d.log10() : 0);

/** One run: genome forced, no offers. Returns { t10 (min | null), sys (mean log10 gain per Expansion), cores (per Singularität), total (log10 systems+cores total) }. */
export function measure(snapState, genome, { hours = 3.5, dt = 2, fx = null, id = null } = {}) {
  const keepFx = id && fx ? T.mutFx[id] : null;
  if (id && fx) T.mutFx[id] = { ...T.mutFx[id], ...fx };
  const keepUnlock = T.mutUnlockAt;
  T.mutUnlockAt = 999; // no offers: the genome is forced
  try {
    const g = createReplikator();
    g.load(clone(snapState));
    g.state.rep2.mut.genome = genome;
    g.refresh();
    const seen = { expansion: g.state.layers.expansion.count, singularity: g.state.layers.singularity.count };
    const gains = { expansion: [], singularity: [] };
    const r = runSim({
      game: g, hours, dt, quiet: true, act2: true,
      until: (gg) => {
        for (const k of ['expansion', 'singularity']) {
          const L = gg.state.layers[k];
          if (L.count !== seen[k]) {
            seen[k] = L.count;
            gains[k].push(L.lastGain);
          }
        }
        return false;
      },
    });
    const sum = (a) => a.reduce((x, y) => x.add(y), D(0)); // everything gained in the window: robust against the number of runs
    const s = r.game.state;
    return {
      t10: r.map.claims[9] ? (r.map.claims[9].t - r.map.start) / 60 : null,
      sys: lg(sum(gains.expansion)),
      cores: lg(sum(gains.singularity)),
      total: lg(s.cur.systems.total) + lg(s.cur.cores.total),
    };
  } finally {
    T.mutUnlockAt = keepUnlock;
    if (keepFx) T.mutFx[id] = keepFx;
  }
}

/** Gain of the Expansion / Singularität right now with a forced genome (log10): the same state with and without a mutation shows the factor the softcaps let through. */
export function refGain(state, genome, { fx = null, id = null } = {}) {
  const keep = id && fx ? T.mutFx[id] : null;
  if (id && fx) T.mutFx[id] = { ...T.mutFx[id], ...fx };
  try {
    const g = createReplikator();
    g.load(clone(state));
    g.state.rep2.mut.genome = genome;
    g.refresh();
    return { sys: lg(g.prestigeGain('expansion')), cores: lg(g.prestigeGain('singularity')) };
  } finally {
    if (keep) T.mutFx[id] = keep;
  }
}

/** fx overrides that neutralise the catch ("Nutzen") or the benefit ("Haken") of a mutation. */
export function variantFx(id, which) {
  const split = M.MUT_SPLIT && M.MUT_SPLIT[id];
  if (!split) return undefined;
  return which === 'Nutzen' ? split.catch : which === 'Haken' ? split.benefit : null;
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) o[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  return o;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = parseArgs(process.argv.slice(2));
  const hours = Number(a.hours ?? 3.5);
  const dt = Number(a.dt ?? 2);
  const seeds = String(a.seeds ?? '1,2').split(',').map(Number);
  const starts = String(a.starts ?? 'fixture,fresh').split(',');
  const only = a.only ? String(a.only).split(',') : null;
  const muts = M.MUTATIONS.filter((m) => !only || only.includes(m.id));
  const rows = {}; // id -> variant -> [deltas]
  const basis = [];
  for (const start of starts) {
    for (const seed of seeds) {
      const snap = startSnapshot(start, seed);
      const base = measure(snap, [], { hours, dt });
      basis.push(base);
      // a state in the middle of the window (1 h of play) for the gain factors
      const midG = createReplikator();
      midG.load(clone(snap));
      const unlockAt = T.mutUnlockAt;
      T.mutUnlockAt = 999;
      runSim({ game: midG, hours: 1, dt, quiet: true, act2: true });
      T.mutUnlockAt = unlockAt;
      const mid = clone(midG.state);
      const refBase = refGain(mid, []);
      for (const m of muts) {
        for (const v of ['beide', 'Nutzen', 'Haken']) {
          const fx = v === 'beide' ? null : variantFx(m.id, v);
          if (fx === undefined) continue;
          const r = measure(snap, [m.id], { hours, dt, fx: fx || null, id: m.id });
          const rg = refGain(mid, [m.id], { fx: fx || null, id: m.id });
          const d = {
            t10: base.t10 && r.t10 ? (r.t10 / base.t10 - 1) * 100 : null,
            sys: rg.sys - refBase.sys,
            cores: rg.cores - refBase.cores,
            total: r.total - base.total,
          };
          ((rows[m.id] ||= {})[v] ||= []).push(d);
        }
      }
      console.error(`${start} Seed ${seed}: Basis t10 ${base.t10 && base.t10.toFixed(0)} min, Sys gewonnen 1e${base.sys.toFixed(2)}, QK gewonnen 1e${base.cores.toFixed(2)}`);
    }
  }
  const avg = (ds, k) => {
    const v = ds.map((d) => d[k]).filter((x) => x !== null);
    return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null;
  };
  const f = (x, p = 2, suf = '') => (x === null ? '  -  ' : (x >= 0 ? '+' : '') + x.toFixed(p) + suf);
  console.log(`Wirkung je Mutation allein, Mittel über ${starts.join('+')} x Seeds ${seeds.join(',')}, ${hours} h Akt II. dt10 = Zeit bis 10 Sektoren (%), dSys / dQK = Faktor auf den Gewinn einer Expansion / Singularität im selben Spielstand (Dekaden, nach den Softcaps), dSumme = Sternsysteme + Quantenkerne gesamt (Dekaden)`);
  console.log('Mutation'.padEnd(16) + ['beide', 'Nutzen', 'Haken'].map((v) => v.padEnd(7) + ' dt10     dSys   dQK   dSumme |').join(' '));
  for (const m of muts) {
    const cols = ['beide', 'Nutzen', 'Haken'].map((v) => {
      const ds = rows[m.id] && rows[m.id][v];
      if (!ds) return ''.padEnd(48);
      return (f(avg(ds, 't10'), 0, ' %').padStart(8) + f(avg(ds, 'sys')).padStart(8) + f(avg(ds, 'cores')).padStart(7) + f(avg(ds, 'total')).padStart(8)).padEnd(41) + '|';
    });
    console.log(m.id.padEnd(16) + cols.join(' '));
  }
}
