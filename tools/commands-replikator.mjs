#!/usr/bin/env node
// What do the Replikator Sondenbefehle really do in Akt II? Active sim from the start of Akt II (fresh v1 finish AND the real end-of-v1 save), mutations off (no offers),
// each command ALONE with auto-cast (the sim player casts through g.spellAutoRun() = the Auto-Befehl), then all three, against the run without commands.
// Metrics: dt6 / dt10 / dt12 = time to 6 / 10 / 12 sectors (% against the run without commands), dSys / dQK = Sternsysteme / Quantenkerne gained in the window (decades),
// casts = how often it was cast, min/cast = minutes of the 10-sector time saved per cast.
//   node tools/commands-replikator.mjs [--hours 3.5] [--seeds 1,2] [--starts fixture,fresh] [--dt 2] [--offline]
import { pathToFileURL } from 'node:url';
import { createReplikator } from '../games/replikator/logic.js';
import { D } from '../engine/decimal.js';
import { TUNE as T } from '../games/replikator/tune.js';
import { runSim } from './simulate.mjs';
import { startSnapshot } from './mutations-replikator.mjs';
import { parse, stringify } from '../engine/save.js';

const clone = (s) => parse(stringify(s));
const lg = (d) => (d && d.m > 0 ? d.log10() : 0);
export const CMDS = ['uebertakten', 'sonnenwind', 'tiefenscan'];

/** One run from a snapshot. `on` = the commands that are cast. Returns the sector times (min) and the totals. */
export function measureCmd(snap, on, { hours = 3.5, dt = 2, offline = null } = {}) {
  const keepUnlock = T.mutUnlockAt;
  T.mutUnlockAt = 999; // no mutation offers: the effect of the commands alone
  try {
    const g = createReplikator();
    g.load(clone(snap));
    for (const id of CMDS) g.state.spells[id].auto = on.includes(id);
    const s0 = { sys: g.state.cur.systems.total, qk: g.state.cur.cores.total };
    const r = runSim({ game: g, hours, dt, quiet: true, act2: true, offline });
    const at = (n) => (r.map.claims[n - 1] ? (r.map.claims[n - 1].t - r.map.start) / 60 : null);
    return {
      t6: at(6), t10: at(10), t12: at(12), n: r.map.claims.length,
      sys: lg(g.state.cur.systems.total.sub(s0.sys).max(1)), qk: lg(g.state.cur.cores.total.sub(s0.qk).max(1)),
      casts: Object.fromEntries(CMDS.map((id) => [id, g.state.spells[id].n])),
    };
  } finally {
    T.mutUnlockAt = keepUnlock;
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
  const offline = a.offline ? { every: 8 * 3600, session: 120 } : null;
  const variants = [['ohne', []], ...CMDS.map((c) => [c, [c]]), ['alle', CMDS]];
  const rows = {}; // variant -> [metrics]
  for (const start of starts) {
    for (const seed of seeds) {
      const snap = startSnapshot(start, seed);
      let base = null;
      for (const [name, on] of variants) {
        const r = measureCmd(snap, on, { hours, dt, offline });
        if (name === 'ohne') base = r;
        const pc = (k) => (base[k] && r[k] ? (r[k] / base[k] - 1) * 100 : null);
        const casts = on.reduce((x, id) => x + r.casts[id], 0);
        const d = { t6: pc('t6'), t10: pc('t10'), t12: pc('t12'), sys: r.sys - base.sys, qk: r.qk - base.qk, casts, min: casts && base.t10 && r.t10 ? (base.t10 - r.t10) / casts : null, abs10: r.t10 };
        (rows[name] ||= []).push(d);
      }
      console.error(`${start} Seed ${seed}: ohne Befehle ${base.t6 && base.t6.toFixed(0)} / ${base.t10 && base.t10.toFixed(0)} / ${base.t12 && base.t12.toFixed(0)} min (6 / 10 / 12 Sektoren)`);
    }
  }
  const avg = (ds, k) => {
    const v = ds.map((d) => d[k]).filter((x) => x !== null && x !== undefined);
    return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null;
  };
  const f = (x, p = 0, suf = '') => (x === null ? '  -  ' : (x >= 0 ? '+' : '') + x.toFixed(p) + suf);
  console.log(`Sondenbefehle einzeln, Mittel über ${starts.join('+')} x Seeds ${seeds.join(',')}, ${hours} h Akt II${offline ? ', offline-Szenario' : ''}. dt6/dt10/dt12 = Zeit bis 6/10/12 Sektoren (%), dSys/dQK = Gewinn im Fenster (Dekaden), Casts, Min je Cast`);
  console.log('Befehl'.padEnd(13) + 'dt6'.padStart(7) + 'dt10'.padStart(7) + 'dt12'.padStart(7) + 'dSys'.padStart(7) + 'dQK'.padStart(7) + 'Casts'.padStart(7) + 'Min/Cast'.padStart(9) + 't10 abs'.padStart(9));
  for (const [name] of variants) {
    const ds = rows[name];
    console.log(name.padEnd(13) + f(avg(ds, 't6'), 0, ' %').padStart(7) + f(avg(ds, 't10'), 0, ' %').padStart(7) + f(avg(ds, 't12'), 0, ' %').padStart(7) + f(avg(ds, 'sys'), 2).padStart(7) + f(avg(ds, 'qk'), 2).padStart(7) + String(Math.round(avg(ds, 'casts'))).padStart(7) + f(avg(ds, 'min'), 1).padStart(9) + (avg(ds, 'abs10') ? avg(ds, 'abs10').toFixed(0) : '-').padStart(9));
  }
}
