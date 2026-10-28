#!/usr/bin/env node
// What do the Replikator Anomalien really do in Akt II? Active sim from the start of Akt II (fresh v1 finish AND the real end-of-v1 save), the commands on (as in play).
// "forced" variants: every anomaly is of ONE type (T.anoForce) and they come every 15 min (tune anoEvery/anoSpread overridden) so that the effect shows up in a 3.5 h window;
// the table gives the effect of the whole window and per started anomaly. "natur" = all types, the real frequency (60-90 min + Anomalie sectors).
// Metrics against 'ohne' (no anomalies): dt6 / dt10 = time to 6 / 10 sectors (%), dSys / dQK = Sternsysteme / Quantenkerne gained in the window (decades), starts, per start: minutes of the
// 10-sector time saved (Gezeitenwelle, Zeitriss), decades of Sys / QK.
//   node tools/anomalies-replikator.mjs [--hours 3.5] [--seeds 1,2] [--starts fixture,fresh] [--dt 2]
import { pathToFileURL } from 'node:url';
import { createReplikator } from '../games/replikator/logic.js';
import { TUNE as T } from '../games/replikator/tune.js';
import { runSim } from './simulate.mjs';
import { startSnapshot } from './mutations-replikator.mjs';
import { parse, stringify } from '../engine/save.js';

const clone = (s) => parse(stringify(s));
const lg = (d) => (d && d.m > 0 ? d.log10() : 0);
export const TYPES = ['gezeitenwelle', 'zeitriss', 'strahl', 'spiegel', 'signal', 'umkehr'];

/** One run from a snapshot. `force`: null (natural), 'none' or a type id (boosted frequency). */
export function measureAno(snap, force, { hours = 3.5, dt = 2 } = {}) {
  const keep = { force: T.anoForce, every: T.anoEvery, spread: T.anoSpread };
  T.anoForce = force;
  if (force && force !== 'none') {
    T.anoEvery = 900;
    T.anoSpread = 0;
  }
  try {
    const g = createReplikator();
    g.load(clone(snap));
    const s0 = { sys: g.state.cur.systems.total, qk: g.state.cur.cores.total };
    const r = runSim({ game: g, hours, dt, quiet: true, act2: true });
    const at = (n) => (r.map.claims[n - 1] ? (r.map.claims[n - 1].t - r.map.start) / 60 : null);
    return {
      t6: at(6), t10: at(10), starts: r.map.ano.filter((x) => x.kind === 'start').length,
      sys: lg(g.state.cur.systems.total.sub(s0.sys).max(1)), qk: lg(g.state.cur.cores.total.sub(s0.qk).max(1)),
      mut: g.state.rep2.mut.taken, offers: g.state.rep2.mut.n, frags: g.state.rep2.ano.frags.length,
    };
  } finally {
    T.anoForce = keep.force;
    T.anoEvery = keep.every;
    T.anoSpread = keep.spread;
  }
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
  const variants = [['ohne', 'none'], ...TYPES.map((t) => [t, t]), ['natur', null]];
  const rows = {};
  for (const start of starts) {
    for (const seed of seeds) {
      const snap = startSnapshot(start, seed);
      let base = null;
      for (const [name, force] of variants) {
        const r = measureAno(snap, force, { hours, dt });
        if (name === 'ohne') base = r;
        const pc = (k) => (base[k] && r[k] ? (r[k] / base[k] - 1) * 100 : null);
        const d = { t6: pc('t6'), t10: pc('t10'), sys: r.sys - base.sys, qk: r.qk - base.qk, starts: r.starts, abs10: r.t10, mut: r.mut - base.mut, offers: r.offers - base.offers };
        d.minPer = r.starts && base.t10 && r.t10 ? (base.t10 - r.t10) / r.starts : null;
        d.sysPer = r.starts ? d.sys / r.starts : null;
        d.qkPer = r.starts ? d.qk / r.starts : null;
        (rows[name] ||= []).push(d);
      }
      console.error(`${start} Seed ${seed}: ohne Anomalien ${base.t6 && base.t6.toFixed(0)} / ${base.t10 && base.t10.toFixed(0)} min (6 / 10 Sektoren)`);
    }
  }
  const avg = (ds, k) => {
    const v = ds.map((d) => d[k]).filter((x) => x !== null && x !== undefined);
    return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null;
  };
  const f = (x, p = 0, suf = '') => (x === null ? '  -  ' : (x >= 0 ? '+' : '') + x.toFixed(p) + suf);
  console.log(`Anomalien, Mittel über ${starts.join('+')} x Seeds ${seeds.join(',')}, ${hours} h Akt II (forced: alle 15 min eine dieser Art; natur: echte Häufigkeit). Je Start: Min = gesparte Minuten bis zum 10. Sektor, dSys/dQK = Dekaden`);
  console.log('Anomalie'.padEnd(15) + 'dt6'.padStart(7) + 'dt10'.padStart(7) + 'dSys'.padStart(7) + 'dQK'.padStart(7) + 'Starts'.padStart(7) + 'Min/St'.padStart(8) + 'Sys/St'.padStart(8) + 'QK/St'.padStart(8) + 'Angeb.'.padStart(8) + 'Mut.'.padStart(6) + 't10 abs'.padStart(9));
  for (const [name] of variants) {
    const ds = rows[name];
    console.log(name.padEnd(15) + f(avg(ds, 't6'), 0, ' %').padStart(7) + f(avg(ds, 't10'), 0, ' %').padStart(7) + f(avg(ds, 'sys'), 2).padStart(7) + f(avg(ds, 'qk'), 2).padStart(7) + String(Math.round(avg(ds, 'starts') ?? 0)).padStart(7) + f(avg(ds, 'minPer'), 1).padStart(8) + f(avg(ds, 'sysPer'), 2).padStart(8) + f(avg(ds, 'qkPer'), 3).padStart(8) + f(avg(ds, 'offers'), 1).padStart(8) + f(avg(ds, 'mut'), 1).padStart(6) + (avg(ds, 'abs10') ? avg(ds, 'abs10').toFixed(0) : '-').padStart(9));
  }
}
