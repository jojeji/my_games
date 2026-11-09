#!/usr/bin/env node
// Protoplanet: Bot-Simulation. Der Bot spielt mit derselben Physik (games/protoplanet/play.js) in Node.
//   node tools/sim-protoplanet.mjs                         alle Levels: feste Seeds in 3 Bot-Varianten + je Familienlevel Zufalls-Seeds
//   node tools/sim-protoplanet.mjs --level 1-5 [--verbose] ein Level (feste Seeds, Varianten, Familie)
//   node tools/sim-protoplanet.mjs --chapter 2 --seeds 100 --jobs 4   ein Kapitel mit 100 Seeds
//   --pick N   Seeds 1..N je Familienlevel in allen Bot-Varianten spielen und Kandidaten fuer den festen Seed nennen (alle Varianten geloest, Zeit nahe am Familien-Median)
//   --fixed-only / --family-only, --from 7000 (erster Zufalls-Seed, Standard 1000), --variants N (Standard 3), --jobs N (Worker-Threads, Standard = Kerne)
// Ausgabe: Loesungen je Variante (Zeit s / Ausstoss / Endmasse), Familienquote ueber Zufalls-Seeds (Median/p90 der Zeit, Median Ausstoss und Endmasse),
// Welt-Kennzahlen (mittlere Geschwindigkeit und Zahl der Koerper beim Start) und vorgeschlagene `targets` (Bot-Median der Varianten: Ausstoss x 1,8, Zeit x 2).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import { LEVELS, levelById } from '../games/protoplanet/levels.js';
import { playLevel, median } from '../games/protoplanet/bot.js';
import { createPlay } from '../games/protoplanet/play.js';
import { T } from '../games/protoplanet/tune.js';

const run = (task) => {
  if (task.tune) for (const k of Object.keys(task.tune)) Object.assign(T[k] || (T[k] = {}), task.tune[k]); // Experiment: tune.js ueberschreiben, z. B. --tune '{"bot":{"costK":4}}'
  const lv0 = levelById(task.level);
  const lv = task.override ? { ...lv0, family: task.override.family || lv0.family, params: { ...lv0.params, ...task.override.params }, goal: { ...lv0.goal, ...task.override.goal } } : lv0;
  const level = task.seed == null ? lv : { ...lv, seed: task.seed };
  const t0 = performance.now();
  const r = playLevel(level, { variant: task.variant || 0 });
  return { ...task, solved: r.solved, lost: r.lost, time: r.time, ejected: r.ejected, mass: r.mass, cpu: performance.now() - t0 };
};

if (!isMainThread) {
  parentPort.on('message', (task) => parentPort.postMessage(run(task)));
} else {
  const args = process.argv.slice(2);
  const opt = (name, def) => {
    const i = args.indexOf('--' + name);
    return i < 0 ? def : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
  };
  // Experiment-Argumente sind JS-Literale; `g(n, lo, hi, flow, v, extra)` baut eine Gruppe der Familie `welt` (wie in levels.js)
  const js = (text) => new Function('g', 'return (' + text + ')')((n, lo, hi, flow, v, extra = {}) => ({ n, lo, hi, flow, v, ...extra }));
  const verbose = args.includes('--verbose');
  const nSeeds = +opt('seeds', 40);
  const nVar = +opt('variants', 3);
  const from = +opt('from', 1000);
  const jobs = +opt('jobs', os.cpus().length);
  const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '-');
  const pad = (s, n) => String(s).padEnd(n);
  const lvOpt = opt('level');
  const chOpt = opt('chapter');
  let levels = LEVELS;
  if (lvOpt && lvOpt !== true) levels = lvOpt.split(',').map((id) => levelById(id));
  else if (chOpt && chOpt !== true) levels = LEVELS.filter((l) => String(l.chapter) === chOpt);
  const override = (opt('params') && opt('params') !== true) || opt('family') || (opt('goal') && opt('goal') !== true) ? { family: opt('family') && opt('family') !== true ? opt('family') : null, params: opt('params') && opt('params') !== true ? js(opt('params')) : {}, goal: opt('goal') && opt('goal') !== true ? js(opt('goal')) : {} } : null; // Experiment: Parameter des Levels ueberschreiben (flach), z. B. --params '{"R":30}'
  const tune = opt('tune') && opt('tune') !== true ? js(opt('tune')) : null;
  const pick = +opt('pick', 0);
  const doFixed = !args.includes('--family-only');
  const doFamily = !args.includes('--fixed-only');

  const tasks = [];
  for (const l of levels) {
    if (doFixed) for (let v = 0; v < nVar; v++) tasks.push({ level: l.id, variant: v, kind: 'fixed', override, tune });
    if (pick && l.family !== 'hand') for (let sd = 1; sd <= pick; sd++) for (let v = 0; v < nVar; v++) tasks.push({ level: l.id, seed: sd, variant: v, kind: 'pick', override, tune });
    if (doFamily && l.family !== 'hand') for (let i = 0; i < nSeeds; i++) tasks.push({ level: l.id, seed: from + i, kind: 'family', override, tune });
  }
  const results = [];
  const t0 = performance.now();
  await new Promise((resolve) => {
    let next = 0;
    let open = 0;
    const workers = [];
    const feed = (w) => {
      if (next >= tasks.length) {
        if (--open === 0) {
          workers.forEach((x) => x.terminate());
          resolve();
        }
        return;
      }
      w.postMessage(tasks[next++]);
    };
    for (let i = 0; i < Math.min(jobs, tasks.length); i++) {
      const w = new Worker(new URL(import.meta.url), { workerData: {} });
      workers.push(w);
      open++;
      w.on('message', (r) => {
        results.push(r);
        feed(w);
      });
      feed(w);
    }
    if (!tasks.length) resolve();
  });

  const world = (l) => {
    const p = createPlay(l);
    const bs = p.world.bodies.filter((b) => b.kind !== 'player');
    return { n: bs.length, v: bs.reduce((s, b) => s + Math.hypot(b.vx, b.vy), 0) / Math.max(1, bs.length), arenaR: p.world.arenaR };
  };
  const status = (r) => (r.solved ? '' : r.lost ? 'V' : 'T');
  console.log('level  ziel     R    Kn  v    | feste Seeds, Varianten (Zeit s/Ausstoss/Endmasse)          | Familie: geloest  med s  p90 s  med Ausst  med Masse | targets (Vorschlag)');
  for (const l of levels) {
    const w = world(l);
    const fx = results.filter((r) => r.level === l.id && r.kind === 'fixed').sort((a, b) => a.variant - b.variant);
    const fam = results.filter((r) => r.level === l.id && r.kind === 'family');
    const ok = fx.filter((r) => r.solved);
    const fxs = fx.map((r) => `${r.solved ? '' : status(r) + ' '}${fmt(r.time, 0)}/${fmt(r.ejected, 2)}/${fmt(r.mass, 1)}`).join('  ');
    const famOk = fam.filter((r) => r.solved);
    const times = famOk.map((r) => r.time).sort((a, b) => a - b);
    const famS = fam.length ? `${pad(`${famOk.length}/${fam.length}`, 8)} ${pad(fmt(median(times), 0), 6)} ${pad(fmt(times[Math.min(times.length - 1, Math.floor(times.length * 0.9))], 0), 6)} ${pad(fmt(median(famOk.map((r) => r.ejected)), 2), 9)} ${pad(fmt(median(famOk.map((r) => r.mass)), 1), 8)}` : '-';
    const medT = median(ok.map((r) => r.time));
    const sug = ok.length ? `eject<=${fmt(Math.ceil(median(ok.map((r) => r.ejected)) * 1.8 * 20) / 20, 2)} time<=${Math.ceil((medT * 2) / 5) * 5}` : '-';
    console.log(pad(l.id, 6), pad(l.goal.type, 8), pad(fmt(w.arenaR, 0), 4), pad(w.n, 3), pad(fmt(w.v, 2), 4), '|', pad(`${ok.length}/${fx.length}  ${fxs}`, 58), '|', pad(famS, 44), '|', sug, `(${l.targets.eject}/${l.targets.time})`);
    if (verbose) for (const r of fam.filter((x) => !x.solved)) console.log('   Seed', r.seed, r.lost ? 'verloren' : 'Zeitlimit', fmt(r.time, 0));
  }
  if (pick) {
    console.log('\nKandidaten fuer feste Seeds (alle Varianten geloest; Zeit nahe am Familien-Median, Ausstoss und Endmasse nahe am Median)');
    for (const l of levels.filter((x) => x.family !== 'hand')) {
      const fam = results.filter((r) => r.level === l.id && r.kind === 'family' && r.solved);
      const mt = median(fam.map((r) => r.time));
      const me = median(fam.map((r) => r.ejected));
      const bySeed = new Map();
      for (const r of results.filter((x) => x.level === l.id && x.kind === 'pick')) (bySeed.get(r.seed) || bySeed.set(r.seed, []).get(r.seed)).push(r);
      const cand = [...bySeed.entries()]
        .filter(([, rs]) => rs.length === nVar && rs.every((r) => r.solved))
        .map(([sd, rs]) => ({ sd, t: median(rs.map((r) => r.time)), e: median(rs.map((r) => r.ejected)), tmax: Math.max(...rs.map((r) => r.time)), score: Math.abs(Math.log(median(rs.map((r) => r.time)) / mt)) + 0.5 * Math.abs(Math.log(Math.max(0.05, median(rs.map((r) => r.ejected))) / Math.max(0.05, me))) }))
        .sort((a, b) => a.score - b.score)
        .slice(0, 5);
      console.log(l.id, `(Familie: Median ${fmt(mt, 0)} s, Ausstoss ${fmt(me, 2)})`, cand.map((c) => `Seed ${c.sd}: ${fmt(c.t, 0)} s (max ${fmt(c.tmax, 0)}) / ${fmt(c.e, 2)}`).join(' | '));
    }
  }
  const cpu = results.reduce((s, r) => s + r.cpu, 0) / 1000;
  console.log(`\n(${((performance.now() - t0) / 1000).toFixed(1)} s Wanduhr, ${cpu.toFixed(0)} s CPU, ${jobs} Worker)`);
}
