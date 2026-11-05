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
import { pendlerSchedule, runSchedule, makeSim, act } from './simulate-myzel.mjs';
import { nRate, bMinRun, wMinRun } from '../games/myzel/def.js';

export const LENGTHS = {
  h: [10, 30, 60, 120, 180, 300, 600, 1200],
  b: [60, 180, 300, 600, 1200, 2400, 4800, 9600],
  f: [21600, 28800, 43200, 86400], // the minimum run is 6 h (fMinRun): shorter lengths are the same as 6 h
};
// window per layer (seconds), the same for every run length of that layer
export const HORIZON = { h: 3600, b: 19200, f: 172800 };

const clone = (state) => parse(stringify(state));
export const gameFromSnapshot = (snap) => {
  const g = createMyzel();
  g.load(clone(snap.state));
  return g;
};

/** Snapshots { phase: 'h'|'b'|'f', fork, t, state } at the end of a visit: H phase (2nd visit), branch phase (2 visits after the fork), F phase (1 visit after the F layer opened). */
export function takeSnapshots({ fork = 's', forkB = 'l', seed = 1, days = 3, deep = false } = {}) {
  const snaps = {};
  let forkAt = null;
  let fAt = null;
  runSchedule(pendlerSchedule({ days: deep ? 7 : days, seed }), { fork, forkB }, {
    hook: (ctx, rec) => {
      const g = ctx.g;
      const take = (phase) => (snaps[phase] = { phase, fork, forkB, t: ctx.t, state: clone(g.state) });
      if (deep) {
        // right after a prestige of the layer (its run is young): Flechte / Fäulnis (3rd run) and Waldnetz (2nd run)
        if (!snaps.d && g.state.layers[forkB].count >= 3 && g.state.layers[forkB].runTime < 3600) take('d');
        if (!snaps.w && g.state.layers.w.count >= 2 && g.state.layers.w.runTime < 3600) take('w');
        return !(snaps.d && snaps.w);
      }
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

/**
 * Deep layers (Paket 2): from a snapshot right after a prestige of the layer, play a fixed run length `mult x gate` (the gate is the shortest
 * possible run: the time gate) and measure the gain per second over the horizon. layer 'd' = the fork-B layer (own currency, lumps AND income,
 * and the Waldfäden it feeds), layer 'w' = Waldnetz (Waldfäden). The other deep layers follow their gate; autos are off, the bot plays by hand.
 */
export function measureDeep(snap, layer, mult, { horizon = 40 * 3600, dt = 5 } = {}) {
  const g = gameFromSnapshot(snap);
  for (const a of g.def.autos) if (g.state.auto[a.id]) g.state.auto[a.id].on = false;
  const b = g.forkChoice('b');
  const cur = b === 'l' ? 'l' : 'fa';
  const gate = layer === 'w' ? wMinRun(g) : bMinRun(g);
  const L = gate * mult;
  const hold = layer === 'w' ? { w: L, l: gate, z: gate } : { [b]: L, w: Infinity };
  const ctx = makeSim({ fork: g.forkChoice('a'), forkB: b, rain: false, hold, noRing: true }, { game: g });
  ctx.inVisit = true;
  ctx.state.visitStart = false;
  const c0 = g.state.cur[cur].total.toNumber();
  const w0 = g.state.cur.w.total.toNumber();
  const n0 = g.state.layers[layer === 'w' ? 'w' : b].count;
  for (let t = 0; t < horizon; t += dt) {
    if (t % 5 < dt) act(g, ctx.S, ctx.state);
    g.tick(dt);
  }
  const runs = g.state.layers[layer === 'w' ? 'w' : b].count - n0;
  return { L, mult, runs, ownPerH: (g.state.cur[cur].total.toNumber() - c0) / (horizon / 3600), wPerH: (g.state.cur.w.total.toNumber() - w0) / (horizon / 3600) };
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
  if (argv.includes('--deep')) {
    // Paket 2: Flechte / Fäulnis and Waldnetz at 1 / 1,5 / 2 / 3 x their time gate
    for (const [fork, forkB] of [['s', 'l'], ['m', 'z']]) {
      const snaps = takeSnapshots({ fork, forkB, deep: true });
      console.log(`=== Gabeln ${fork}${forkB} ===`);
      for (const [layer, hours] of [['d', 40], ['w', 60]]) {
        const rows = [1, 1.5, 2, 3].map((m) => measureDeep(snaps[layer], layer, m, { horizon: hours * 3600 }));
        const best = Math.max(...rows.map((r) => (layer === 'w' ? r.wPerH : r.ownPerH)));
        console.log(`${layer === 'w' ? 'Waldnetz' : forkB === 'l' ? 'Flechte' : 'Fäulnis'}: Lauf = ` + rows.map((r) => `${r.mult}x Gate (${(r.L / 3600).toFixed(1)} h)`).join(' | '));
        console.log('  ' + (layer === 'w' ? 'Waldfäden/h' : 'eigene Währung/h') + '  : ' + rows.map((r) => (((layer === 'w' ? r.wPerH : r.ownPerH) / best) * 100).toFixed(0) + ' %').join(' | ') + '   (Läufe: ' + rows.map((r) => r.runs).join('/') + ')');
      }
    }
    process.exit(0);
  }
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
