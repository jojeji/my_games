#!/usr/bin/env node
// Optimal run length per layer for Myzel (the lesson of Merlin: measure it, do not guess).
//   node tools/runlength-myzel.mjs [--fork s|m] [--layers h,b,f] [--horizon 3600] [--verbose]
// 1. plays the pendler sim and takes snapshots in the middle of a phase (H phase, branch phase, Fruchtkörper phase),
// 2. from each snapshot plays several FIXED run lengths of ONE layer (that layer is prestiged exactly when its run is L seconds old, the
//    other layers follow the normal policy of the bot, the same functions as the game) and measures
//      - gain per second of the layer's currency (Hyphen: total earned; branch: units; Fruchtkörper: total earned) and
//      - the N production at the end of the horizon (what the gain is worth: it is what the next phase builds on),
// 3. prints both relative to the best length.
import { pathToFileURL } from 'node:url';
import { createMyzel } from '../games/myzel/logic.js';
import { buyNode } from '../games/myzel/def.js';
import { parse, stringify } from '../engine/save.js';
import { TUNE as T } from '../games/myzel/tune.js';
import { pendlerSchedule, runSchedule } from './simulate-myzel.mjs';
import { nRate } from '../games/myzel/def.js';

export const LENGTHS = {
  h: [10, 30, 60, 120, 180, 300, 600, 1200],
  b: [60, 180, 300, 600, 1200, 2400, 4800, 9600],
  f: [900, 1800, 3600, 7200, 14400, 28800],
};
// window per layer (seconds), the same for every run length of that layer
export const HORIZON = { h: 3600, b: 19200, f: 57600 };

const clone = (state) => parse(stringify(state));
export const gameFromSnapshot = (snap) => {
  const g = createMyzel();
  g.load(clone(snap.state));
  return g;
};

/** Snapshots { phase: 'h'|'b'|'f', fork, t, state } at the end of a visit: H phase (2nd visit), branch phase (2 visits after the fork), F phase (1 visit after the F layer opened). */
export function takeSnapshots({ fork = 's', seed = 1, days = 3 } = {}) {
  const snaps = {};
  let forkAt = null;
  let fAt = null;
  runSchedule(pendlerSchedule({ days, seed }), { fork }, {
    hook: (ctx, rec) => {
      const g = ctx.g;
      const take = (phase) => (snaps[phase] = { phase, fork, t: ctx.t, state: clone(g.state) });
      if (!snaps.h && rec.i === 3) take('h');
      if (g.forkChoice('a') && forkAt === null) forkAt = rec.i;
      if (forkAt !== null && !snaps.b && rec.i >= forkAt + 2) take('b');
      if (g.layerUnlocked('f') && fAt === null) fAt = rec.i;
      if (fAt !== null && !snaps.f && rec.i >= fAt + 1) take('f');
      return !(snaps.h && snaps.b && snaps.f);
    },
  });
  return snaps;
}

/** One fixed run length from a snapshot: gain per second of the layer + the N production at the end. */
export function measure(snap, layer, L, { horizon = 3600, dt = 2, rain = false } = {}) {
  const g = gameFromSnapshot(snap);
  const fork = g.forkChoice('a');
  const node = layer === 'b' ? fork : layer;
  const hor = horizon; // the same window for every length (a window of 3 runs per length would make long runs look better than they are)
  const unit = () => (layer === 'h' ? g.state.cur.h.total.toNumber() : layer === 'f' ? g.state.cur.f.total.toNumber() : g.state.layers[node].units + 0 + g.state.layers[node].count * 0);
  // count units gained as the sum of prestige gains (units reset to 0 with the Fruchtkörper)
  let gained = 0;
  const orig = g.prestige.bind(g);
  g.prestige = (id) => {
    const gain = g.prestigeGain(id);
    const ok = orig(id);
    if (ok && id === node && layer === 'b') gained += gain.toNumber();
    return ok;
  };
  const h0 = g.state.cur.h.total.toNumber();
  const f0 = g.state.cur.f.total.toNumber();
  let t = 0;
  while (t < hor) {
    if (t % 5 < dt) {
      buyNode(g, 'h');
      if (fork) buyNode(g, fork);
      buyNode(g, 'f');
      // Hyphen: fixed length only when it is the measured layer, else the normal policy (ripe run)
      const hL = layer === 'h' ? L : T.ripeSecs;
      if (g.canPrestige('h') && g.state.layers.h.runTime >= hL) {
        g.prestige('h');
        buyNode(g, 'h');
      }
      if (layer === 'h') {
        // nothing above Hyphen prestiges in this measurement
      } else {
        if (fork && g.canPrestige(fork) && (layer !== 'b' || g.state.layers[fork].runTime >= L)) {
          buyNode(g, 'h');
          g.prestige(fork);
        }
        if (layer === 'f' && g.canPrestige('f') && g.state.layers.f.runTime >= L) {
          g.prestige('f');
          buyNode(g, 'f');
        }
      }
    }
    g.tick(dt);
    t += dt;
  }
  void unit;
  const el = t;
  let gain;
  if (layer === 'h') gain = g.state.cur.h.total.toNumber() - h0;
  else if (layer === 'f') gain = g.state.cur.f.total.toNumber() - f0;
  else gain = gained;
  return { L, rate: gain / el, logN: Math.log10(Math.max(1, nRate(g))), gain };
}

export function measureLayer(snap, layer, lengths = LENGTHS[layer], opt = {}) {
  const rows = lengths.map((L) => measure(snap, layer, L, opt));
  let best = rows[0];
  for (const r of rows) if (r.rate > best.rate) best = r;
  let bestN = rows[0];
  for (const r of rows) if (r.logN > bestN.logN) bestN = r;
  return { layer, phase: snap.phase, rows, best, bestN };
}

const fmtL = (L) => (L >= 3600 ? (L / 3600 + ' h').replace('.', ',') : L >= 60 ? (L / 60 + ' min').replace('.', ',') : L + ' s');

export function table(res) {
  const lengths = res.rows.map((r) => r.L);
  const mx = res.best.rate || 1;
  const out = [];
  out.push(`${res.layer === 'b' ? 'Ast' : res.layer === 'h' ? 'Hyphen' : 'Fruchtkörper'} (Zustand: ${res.phase}) | ` + lengths.map((L) => fmtL(L).padStart(7)).join(' '));
  out.push('  Gewinn/s relativ     | ' + res.rows.map((r) => (((r.rate / mx) * 100).toFixed(0) + '%').padStart(7)).join(' ') + `  | Optimum ${fmtL(res.best.L)}`);
  out.push('  log10 N/s am Ende    | ' + res.rows.map((r) => r.logN.toFixed(1).padStart(7)).join(' ') + `  | Optimum ${fmtL(res.bestN.L)}`);
  return out.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const arg = (k, d) => {
    const i = argv.indexOf('--' + k);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
  };
  const forks = arg('fork', 's,m').split(',');
  const layers = arg('layers', 'h,b,f').split(',');
  const horizonArg = arg('horizon', null);
  const t0 = Date.now();
  for (const fork of forks) {
    console.log(`=== Gabel ${fork} ===`);
    const snaps = takeSnapshots({ fork });
    for (const layer of layers) {
      // Hyphen is measured in the H phase AND later (the gains are small integers at the start)
      for (const phase of layer === 'h' ? ['h', 'b', 'f'] : [layer === 'b' ? 'b' : layer]) {
        const snap = snaps[phase];
        if (!snap) {
          console.log(`(kein Snapshot für ${layer} / ${phase})`);
          continue;
        }
        console.log(table(measureLayer(snap, layer, LENGTHS[layer], { horizon: horizonArg ? Number(horizonArg) : HORIZON[layer] })));
      }
    }
  }
  console.log(`(Rechenzeit ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
