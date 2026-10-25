#!/usr/bin/env node
// Optimal Verjüngung interval per era for Merlin.
//   node tools/runlength-merlin.mjs [--eras 0,1,...] [--lengths 10,30,60,120,240,480,960] [--horizon 900] [--verbose]
// 1. plays the normal active sim and takes a snapshot in the middle of every era (first Verjüngung after 50 % of the era's Erinnerungen),
// 2. from each snapshot plays several fixed run lengths (Verjüngung exactly every L seconds, normal buying / tapping / spells,
//    no Epochensprung) over >= `horizon` seconds and measures Erinnerungen per second,
// 3. reports the optimum per era (and slot usage: how many of the 8 Quellen are owned at the end of a run, when the 8th was bought).
import { pathToFileURL } from 'node:url';
import { createMerlin } from '../games/merlin/logic.js';
import { parse, stringify } from '../engine/save.js';
import { runSim } from './simulate-merlin.mjs';
import { jumpThreshold } from '../games/merlin/def.js';

export const LENGTHS = [12, 30, 60, 120, 240, 480, 960];

const clone = (state) => parse(stringify(state));
export function gameFromSnapshot(snap) {
  const g = createMerlin();
  g.load(clone(snap));
  return g;
}

/** Snapshots {era, t, state} in the middle of each era 0..7 of an active run (cycle 1). */
export function takeSnapshots({ eras = [0, 1, 2, 3, 4, 5, 6, 7], frac = 0.5, dt = 1 } = {}) {
  const snaps = {};
  runSim({
    hours: 16,
    dt,
    quiet: true,
    until: (g, t) => {
      const e = g.state.mer.era;
      if (g.state.layers.cycle.count > 0 || snaps[e] || !eras.includes(e)) return g.state.layers.cycle.count > 0;
      const ls = g.state.layers.rejuv;
      if (ls.runTime <= 1.5 && ls.count > 0 && g.state.cur.mem.run.gte(jumpThreshold(g) * frac)) snaps[e] = { era: e, t, state: clone(g.state) };
      return eras.every((x) => snaps[x]);
    },
  });
  return Object.values(snaps);
}

/** Erinnerungen/s for one fixed run length from a snapshot. */
export function measure(snap, L, { horizon = 900, dt = 1 } = {}) {
  const g = gameFromSnapshot(snap.state);
  const runs = Math.max(3, Math.ceil(horizon / L));
  const slots = [];
  const full = [];
  const orig = g.prestige.bind(g);
  g.prestige = (id) => {
    if (id === 'rejuv') slots.push(g.state.prod.quellen.filter((p) => p.n > 0).length);
    return orig(id);
  };
  let allAt = null;
  let prevRt = 0;
  const m0 = g.state.cur.mem.total;
  const t0 = g.state.time.played;
  runSim({
    game: g,
    hours: (runs * L) / 3600,
    dt: Math.min(dt, L / 10),
    quiet: true,
    strategy: { fixedRun: L, noJump: true, useAutoRejuv: false },
    until: (gg) => {
      const rt = gg.state.layers.rejuv.runTime;
      if (rt < prevRt) {
        full.push(allAt);
        allAt = null;
      }
      prevRt = rt;
      if (allAt === null && gg.state.prod.quellen.every((p) => p.n > 0)) allAt = rt;
      return false;
    },
  });
  const el = g.state.time.played - t0;
  const gain = g.state.cur.mem.total.sub(m0).toNumber();
  const ok = full.filter((x) => x !== null);
  return {
    L,
    rate: gain / el,
    rejuvs: slots.length,
    slots: slots.length ? slots.reduce((a, b) => a + b, 0) / slots.length : 0,
    allAt: ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null,
  };
}

export function measureEra(snap, lengths = LENGTHS, opt = {}) {
  const rows = lengths.map((L) => measure(snap, L, opt));
  let best = rows[0];
  for (const r of rows) if (r.rate > best.rate) best = r;
  return { era: snap.era, rows, best };
}

const fmtL = (L) => (L >= 60 ? (L / 60 + ' min').replace('.', ',') : L + ' s');

export function table(results) {
  const lengths = results[0].rows.map((r) => r.L);
  const out = [];
  out.push('Epoche | ' + lengths.map((L) => fmtL(L).padStart(8)).join(' ') + ' | Optimum | 12 s vs Opt.');
  for (const r of results) {
    const mx = r.best.rate || 1;
    const cells = r.rows.map((x) => ((x.rate / mx) * 100).toFixed(0).padStart(7) + '%');
    const r10 = r.rows[0].rate / mx;
    out.push(`${String(r.era).padStart(6)} | ${cells.join(' ')} | ${fmtL(r.best.L).padStart(7)} | ${(r10 * 100).toFixed(0)} %`);
  }
  return out.join('\n');
}

export function slotTable(results) {
  const out = ['Quellen belegt am Laufende (von 8) / Sekunden bis alle 8 da:'];
  for (const r of results) out.push(`  Epoche ${r.era}: ` + r.rows.map((x) => `${fmtL(x.L)} ${x.slots.toFixed(1)}/${x.allAt === null ? '-' : Math.round(x.allAt) + 's'}`).join(' | '));
  return out.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const arg = (k, d) => {
    const i = argv.indexOf('--' + k);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
  };
  const eras = arg('eras', '0,1,2,3,4,5,6,7').split(',').map(Number);
  const lengths = arg('lengths', LENGTHS.join(',')).split(',').map(Number);
  const horizon = Number(arg('horizon', 900));
  const t0 = Date.now();
  const snaps = takeSnapshots({ eras });
  const results = snaps.map((s) => measureEra(s, lengths, { horizon }));
  console.log('Erinnerungen/s relativ zum besten Wert je Epoche (Mitte der Epoche, aktiver Spieler):');
  console.log(table(results));
  if (argv.includes('--verbose')) {
    console.log(slotTable(results));
    for (const r of results) console.log(`  Epoche ${r.era} absolut: ` + r.rows.map((x) => `${fmtL(x.L)}=${x.rate.toPrecision(3)}/s`).join(' '));
  }
  console.log(`(Rechenzeit ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
