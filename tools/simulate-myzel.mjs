#!/usr/bin/env node
// Headless balance simulation for Myzel using the REAL game logic (scripted player; the same buy / auto functions as the game).
//   node tools/simulate-myzel.mjs --pendler [--fork s|m] [--days 4] [--seed 1] [--no-rain] [--verbose]
//   node tools/simulate-myzel.mjs --active  [--fork s|m] [--hours 24]
//   node tools/simulate-myzel.mjs --selten  [--fork s|m] [--days 6]
// Scenarios:
//   --active   plays all the time (shows the pure play time of the content)
//   --pendler  main scenario: day 7:00-23:00, a visit every 60-150 min (seeded), 3 min of play each, 8 h night; between visits the REAL
//              offline path (runtime.simulateOffline with the fixed 3 h cap). The bot buys with the game's own functions (buyNode = upgBuyBest),
//              prestiges, taps the Regenschauer before it leaves, and switches new autos on at the next visit (after the hint).
//   --selten   one visit every 8 h (for information)
// Env: TUNE_OVERRIDE='{"sBase":3e5}' overrides games/myzel/tune.js.
import { pathToFileURL } from 'node:url';
import { createMyzel } from '../games/myzel/logic.js';
import { buyNode, rainCast, zersetzen, humusGain, humus, ended } from '../games/myzel/def.js';
import { TUNE as T } from '../games/myzel/tune.js';
import { createRuntime } from '../engine/core.js';
import { D } from '../engine/decimal.js';
import { rngRoll, rngInt } from '../engine/kit/rng.js';
import { formatDuration, formatNumber as f } from '../engine/format.js';

export const STRATEGY = {
  fork: 's', // 's' | 'm' (fork A)
  forkB: 'l', // 'l' | 'z' (fork B)
  rain: true, // taps the Regenschauer
  actEvery: 5, // the bot acts every this many seconds of a visit
  deepEvery: 3, // ... but looks at the deep layers (many candidates, slow) only every this many actions
  hRun: T.ripeSecs, // manual Hyphen prestige when the run is at least this old (the auto-Hyphen default is T.autoHTime)
  zersetzen: true, // the player rots the stock into Humus at every visit (fork z)
  zersFrac: 0.1, // ... when that adds at least this share of the Humus owned
  fMinFrac: 0.02, // Fruchtkörper when the gain is >= this fraction of the Fruchtkörper owned (and >= 1)
  challenges: true, // enters the next challenge right after a Fruchtkörper prestige / a finished challenge
};

export const hms = (s) => {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d ? d + 'd ' : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/** New things that count as 'something new' for the progress metric. */
const NEW_KINDS = new Set(['upgrade', 'milestone', 'layer-unlocked', 'challenge-enter', 'challenge-done', 'fork-chosen', 'auto-unlocked', 'jahresring']);
const NODES_OF = (g) => ['h', 's', 'm', 'f', 'l', 'z', 'w'].filter((n) => !'sm'.includes(n) || g.forkIs('a', n));

/** Everything the bot decides in one moment of a visit. Pure game calls: it never touches state directly. */
export function act(g, S, state) {
  // autos start off: the player switches them on once the hint toast has told them where (here: at the next visit)
  if (state.visitStart) {
    for (const a of g.def.autos) if (g.autoUnlocked(a.id)) g.state.auto[a.id].on = true;
    state.visitStart = false;
    state.zersDone = false;
  }
  if (g.forkOffered('a')) g.forkChoose('a', S.fork);
  if (g.forkOffered('b')) g.forkChoose('b', S.forkB);
  state.n = (state.n || 0) + 1;
  const deep = state.n % S.deepEvery === 0;
  const buyAll = (force = false) => {
    buyNode(g, 'h');
    for (const n of ['s', 'm']) if (g.forkIs('a', n)) buyNode(g, n);
    buyNode(g, 'f');
    if (!deep && !force) return;
    for (const n of ['l', 'z']) if (g.forkIs('b', n)) buyNode(g, n);
    if (g.layerUnlocked('w')) buyNode(g, 'w');
  };
  buyAll();
  // Hyphen: claim as soon as the run is ripe
  if (g.canPrestige('h') && g.state.layers.h.runTime >= S.hRun) {
    g.prestige('h');
    buyAll();
  }
  // Sporen / Mykorrhiza: as soon as a unit is affordable (everything affordable is bought first: the reset wipes the Hyphen)
  for (const node of ['s', 'm']) {
    if (g.forkIs('a', node) && g.canPrestige(node)) {
      buyAll();
      g.prestige(node);
      buyAll();
    }
  }
  // Zersetzen (Fäulnis): after the purchases, the rest of the stock rots (once per visit step is enough)
  if (S.zersetzen && g.forkIs('b', 'z') && !state.zersDone) {
    const n = humusGain(g);
    if (n >= 1 && n >= S.zersFrac * Math.max(1, humus(g))) {
      zersetzen(g);
      state.zersDone = true; // once per visit is enough
    }
  }
  // Fruchtkörper (+ the next challenge, started in the fresh state right after it: the run restarts anyway)
  if (g.canPrestige('f')) {
    const gain = g.prestigeGain('f');
    if (gain.gte(Math.max(1, S.fMinFrac * g.state.cur.f.total.toNumber()))) {
      buyAll();
      g.prestige('f');
      buyNode(g, 'f');
      if (S.challenges && !g.chActive()) for (const c of g.def.challenges) if (g.chAvailable(c.id)) { g.chEnter(c.id); break; }
    }
  }
  // the deep layers: as soon as their time gate is open (they reset the layers below, so everything is bought first)
  for (const id of ['l', 'z', 'w']) {
    if (S.hold && id in S.hold && g.state.layers[id].runTime < S.hold[id]) continue; // run-length measurements: a fixed run length per layer (S.hold[id] seconds; Infinity = never)
    if (g.canPrestige(id)) {
      buyAll(true);
      g.prestige(id);
      buyAll(true);
    }
  }
  if (!S.noRing && g.canPrestige('r')) g.prestige('r');
}

export function makeSim(strategy = {}, { game = null } = {}) {
  const S = { ...STRATEGY, ...strategy };
  const g = game || createMyzel();
  const runtime = createRuntime(g, { now: () => 0 });
  const ctx = {
    S, g, runtime,
    t: 0, // calendar seconds since the start
    visit: 0,
    off: null,
    events: [], // { t, visit, type, id, ... }
    first: {}, // first time of named milestones of the run
    state: { visitStart: true },
  };
  const orig = g.emit.bind(g);
  g.emit = (type, p) => {
    orig(type, p);
    const t = ctx.off ? ctx.off.start + ctx.off.shift + (g.state.time.played - ctx.off.p0) : ctx.t;
    const ev = { t, visit: ctx.visit, type, id: p?.id };
    if (type === 'prestige') {
      const l = g.layerById[p.id];
      // the layer's stock: units of a static layer (they are wiped by the row above), else everything earned so far
      const before = l.static ? D(g.state.layers[p.id].units).sub(p.gain) : g.state.cur[l.currency].total.sub(p.gain);
      ev.gain = p.gain;
      ev.big = p.gain.gte(before.mul(0.1)) && p.gain.gte(1);
      ev.manual = ctx.inVisit;
    }
    if (type === 'upgrade') ev.buyable = g.upgMax(g.upgById[p.id]) > 1 && g.upgLevel(p.id) > 1; // another level of a buyable: progress, but nothing new
    if (type === 'zers') ev.big = p.big;
    ctx.events.push(ev);
    const key = type + (p?.id ? ':' + p.id : '');
    if (!(key in ctx.first)) ctx.first[key] = t;
  };
  return ctx;
}

/** Play `len` seconds as the player: acts every `actEvery` seconds. */
function playVisit(ctx, len, dt = 1, actEvery = ctx.S.actEvery) {
  const { g, S } = ctx;
  ctx.inVisit = true;
  ctx.state.visitStart = true;
  const t0 = ctx.t;
  for (let e = 0; e < len; e += dt) {
    if (e % actEvery < dt) act(g, S, ctx.state);
    if (S.rain && e >= len - actEvery - dt) while (rainCast(g));
    g.tick(dt);
    ctx.t += dt;
  }
  act(g, S, ctx.state);
  ctx.inVisit = false;
  return ctx.t - t0;
}

function absence(ctx, gap) {
  const { g, runtime } = ctx;
  if (!(gap > 0)) return null;
  const used = Math.min(gap, g.offlineCapSeconds());
  ctx.off = { start: ctx.t, shift: gap - used, p0: g.state.time.played };
  const sum = runtime.simulateOffline(gap);
  ctx.off = null;
  ctx.t += gap;
  return sum;
}

/** Visit schedule of the commuter: [{ at, len }]. Day = 7:00-23:00. */
export function pendlerSchedule({ days = 4, seed = 1, visitLen = 180 } = {}) {
  const rng = { seed };
  const out = [];
  let t = 0;
  const end = days * 86400;
  while (t < end) {
    out.push({ at: t, len: visitLen });
    const day = Math.floor(t / 86400);
    const gap = rngInt(rng, 60, 150) * 60;
    let next = t + visitLen + gap;
    if (next > day * 86400 + 16 * 3600) next = (day + 1) * 86400 + rngInt(rng, 0, 20) * 60; // night: next morning
    t = next;
  }
  return out;
}

export function runSchedule(schedule, strategy = {}, { game = null, hook = null } = {}) {
  const ctx = makeSim(strategy, { game });
  const visits = [];
  for (let i = 0; i < schedule.length; i++) {
    const v = schedule[i];
    ctx.visit = i; // what happened while the player was away (autos, production) is discovered at this visit (offline summary)
    if (v.at > ctx.t) absence(ctx, v.at - ctx.t);
    const from = ctx.events.length;
    const rec = { i, at: v.at, gap: i ? v.at - (schedule[i - 1].at + schedule[i - 1].len) : 0 };
    playVisit(ctx, v.len);
    rec.events = ctx.events.filter((e) => e.visit === i);
    rec.isNew = rec.events.some((e) => NEW_KINDS.has(e.type) && !e.buyable);
    rec.progress = rec.isNew || rec.events.some((e) => e.buyable || ((e.type === 'prestige' || e.type === 'zers') && e.big));
    rec.from = from;
    visits.push(rec);
    if (hook && hook(ctx, rec) === false) break;
  }
  ctx.visits = visits;
  return ctx;
}

/** Content of Paket 1 finished: all milestones, all challenges, everything of the chosen branch and the other layers bought (Paket-1 view, used for the migration test). */
export function p1Done(g) {
  const node0 = g.forkChoice('a');
  for (const m of g.def.milestones) if (['h', 'f'].includes(m.layer) || m.layer === node0) if (!g.hasMs(m.id) && !m.id.startsWith('f_m')) return false;
  if (!g.def.challenges.every((c) => g.chDone(c.id))) return false;
  if (!node0) return false;
  for (const u of g.def.upgrades) {
    if (!['h', node0, 'f'].includes(u.node)) continue;
    if (u.excl && u.excl.some((x) => g.upgLevel(x) > 0)) continue;
    if (!g.upgMaxed(u.id)) return false;
  }
  return true;
}

/** The whole game: the ring has closed (ending). */
export const contentDone = (g) => ended(g);

/** Pacing summary of a run: calendar seconds of the key moments (rings: the time of each one). */
export function pacing(ctx) {
  const F = ctx.first;
  const g = ctx.g;
  const node = g.forkChoice('a');
  const t = (k) => (k in F ? F[k] : null);
  const rings = ctx.events.filter((e) => e.type === 'prestige' && e.id === 'r').map((e) => e.t);
  const nth = (id, n) => ctx.events.filter((e) => e.type === 'prestige' && e.id === id)[n - 1]?.t ?? null;
  const first = {
    hyphen: t('prestige:h'),
    forkA: t('fork-chosen:a'),
    unit: node ? t('prestige:' + node) : null,
    fLayer: t('layer-unlocked:f'),
    fruit: t('prestige:f'),
    chDurre: t('challenge-done:durre'),
    chFrost: t('challenge-done:frost'),
    chKahl: t('challenge-done:kahl'),
    forkB: t('fork-chosen:b'),
    b1: g.forkChoice('b') ? t('prestige:' + g.forkChoice('b')) : null,
    wLayer: t('layer-unlocked:w'),
    w1: t('prestige:w'),
    w2: nth('w', 2),
    a2: t('milestone:w_a2'),
    b2: t('milestone:w_b2'),
    ring1: rings[0] ?? null,
    ring5: rings[4] ?? null,
    ending: t('ending:ending'),
  };
  return { first, rings, contentDone: ctx.contentAt ?? null };
}

export function progressMetric(ctx, { until = Infinity } = {}) {
  const vs = ctx.visits.filter((v) => v.at <= until);
  const withProg = vs.filter((v) => v.progress).length;
  let worst = 0;
  let run = 0;
  for (const v of vs) {
    run = v.isNew ? 0 : run + 1;
    worst = Math.max(worst, run);
  }
  const morning = vs.filter((v) => v.gap >= 6 * 3600); // the first visit after the night
  return { visits: vs.length, withProgress: withProg, ratio: vs.length ? withProg / vs.length : 0, worstNewGap: worst, morning, list: vs };
}

export function runPendler({ days = 10, seed = 1, fork = 's', forkB = 'l', rain = true, stopAtContent = true, visitLen = 180, strategy = {}, done = contentDone } = {}) {
  const schedule = pendlerSchedule({ days, seed, visitLen });
  const ctx = runSchedule(schedule, { fork, forkB, rain, ...strategy }, {
    hook: (c, rec) => {
      if (c.contentAt == null && done(c.g)) {
        c.contentAt = c.t;
        c.contentVisit = rec.i;
        if (stopAtContent) return false;
      }
      return true;
    },
  });
  return ctx;
}

/** Plays continuously (no absence). */
export function runActive({ hours = 24, fork = 's', forkB = 'l', dt = 1, strategy = {}, done = contentDone } = {}) {
  const ctx = makeSim({ fork, forkB, ...strategy });
  ctx.inVisit = true;
  ctx.state.visitStart = true;
  while (ctx.t < hours * 3600) {
    if (ctx.t % 5 < dt) act(ctx.g, ctx.S, ctx.state);
    ctx.g.tick(dt);
    ctx.t += dt;
    if (ctx.contentAt == null && done(ctx.g)) {
      ctx.contentAt = ctx.t;
      break;
    }
  }
  return ctx;
}

/** One visit every `every` hours (3 min), for `days` days. */
export function runSelten({ days = 14, every = 8, fork = 's', forkB = 'l', rain = true, strategy = {} } = {}) {
  const sched = [];
  for (let t = 0; t < days * 86400; t += every * 3600) sched.push({ at: t, len: 180 });
  return runSchedule(sched, { fork, forkB, rain, ...strategy }, {
    hook: (c, rec) => {
      if (c.contentAt == null && contentDone(c.g)) c.contentAt = c.t;
      return true;
    },
  });
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    const n = argv[i + 1];
    if (n !== undefined && !n.startsWith('--')) {
      o[k] = Number.isNaN(Number(n)) ? n : Number(n);
      i++;
    } else o[k] = true;
  }
  return o;
}

export function describe(ctx, label = '') {
  const p = pacing(ctx);
  const x = (v) => (v === null ? '-' : hms(v));
  const L = p.first;
  const out = [];
  out.push(`${label} 1. Hyphen ${x(L.hyphen)} | Gabel A ${x(L.forkA)} | 1. Einheit ${x(L.unit)} | F-Ebene ${x(L.fLayer)} | 1. Fruchtkörper ${x(L.fruit)} | Dürre ${x(L.chDurre)} Frost ${x(L.chFrost)} Kahl ${x(L.chKahl)}`);
  out.push(`${label} Gabel B ${x(L.forkB)} | 1. ${x(L.b1)} | Waldnetz offen ${x(L.wLayer)} | 1. Waldnetz ${x(L.w1)} | 2. Ast A ${x(L.a2)} | 2. Ast B ${x(L.b2)}`);
  out.push(`${label} Ringe ${p.rings.map(x).join(' ')} | ENDE ${x(L.ending)}`);
  return out.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const fork = a.fork || 's';
  const forkB = a.forkB || 'l';
  const rain = !a['no-rain'];
  if (a.table) {
    // all four combinations x seeds: the key moments (days) and the progress metric
    const seeds = Array.from({ length: a.seeds ?? 5 }, (_, i) => i + 1);
    const d = (v) => (v == null ? '   -  ' : (v / 86400).toFixed(2).padStart(6));
    console.log('Gabel  Seed  FrB   b1    wLay  w1    ring1 ring5 ENDE | Besuche mit Fortschritt, längste Folge ohne Neues');
    const ends = {};
    const combos = String(a.combos || 'sl,sz,ml,mz').split(',');
    for (const [fa, fb] of combos) for (const seed of seeds) {
      const ctx = runPendler({ days: a.days ?? 12, seed, fork: fa, forkB: fb, rain, stopAtContent: true });
      const p = pacing(ctx).first;
      const m = progressMetric(ctx);
      (ends[fa + fb] ||= []).push(ctx.contentAt);
      console.log(`${fa}${fb}      ${seed}   ${d(p.forkB)} ${d(p.b1)} ${d(p.wLayer)} ${d(p.w1)} ${d(p.ring1)} ${d(p.ring5)} ${d(ctx.contentAt)} | ${m.withProgress}/${m.visits} (${(m.ratio * 100).toFixed(0)} %), ${m.worstNewGap}`);
    }
    const mean = (xs) => xs.reduce((x, y) => x + y, 0) / xs.length;
    const means = Object.entries(ends).map(([k, v]) => [k, mean(v) / 86400]);
    console.log('Mittel Ende (Tage): ' + means.map(([k, v]) => `${k} ${v.toFixed(2)}`).join('  ') + `   Verhältnis ${(Math.max(...means.map((x) => x[1])) / Math.min(...means.map((x) => x[1]))).toFixed(2)}`);
  } else if (a.active) {
    const ctx = runActive({ hours: a.hours ?? 120, fork, forkB });
    console.log(describe(ctx, 'aktiv'));
  } else if (a.selten) {
    const ctx = runSelten({ days: a.days ?? 14, fork, forkB, rain });
    console.log(describe(ctx, 'selten'));
    const m = progressMetric(ctx);
    console.log(`Fortschritt: ${m.withProgress}/${m.visits} Besuche (${(m.ratio * 100).toFixed(0)} %), längste Folge ohne Neues: ${m.worstNewGap}`);
  } else {
    const ctx = runPendler({ days: a.days ?? 10, seed: a.seed ?? 1, fork, forkB, rain, stopAtContent: !a.long });
    ctx.contentAt != null && console.log(`Ende nach ${hms(ctx.contentAt)} (Besuch ${ctx.contentVisit + 1})`);
    console.log(describe(ctx, `pendler ${fork}${forkB}`));
    const m = progressMetric(ctx);
    console.log(`Fortschritt: ${m.withProgress}/${m.visits} Besuche (${(m.ratio * 100).toFixed(0)} %), längste Folge ohne Neues: ${m.worstNewGap}`);
    if (a.verbose) {
      for (const v of m.list) {
        const kinds = {};
        for (const e of v.events) kinds[e.type + (e.id ? ':' + e.id : '')] = (kinds[e.type + (e.id ? ':' + e.id : '')] || 0) + 1;
        console.log(`${String(v.i + 1).padStart(3)} ${hms(v.at)} ${v.progress ? (v.isNew ? 'neu ' : 'Pres') : '----'} ` + Object.entries(kinds).map(([k, n]) => (n > 1 ? `${k}×${n}` : k)).join(' '));
      }
      const g = ctx.g;
      const L = g.state.layers;
      console.log(`Endstand: N ${f(g.get('n'))} (${f(g.incomePerSec('n'))}/s) H ${f(g.get('h'))} F ${f(g.get('f'))} (gesamt ${f(g.state.cur.f.total)}) Einh. S${L.s.units}/M${L.m.units} | L ${f(g.get('l'))} Fä ${f(g.get('fa'))} Humus ${f(g.get('hu'))} | W ${f(g.get('w'))} (gesamt ${f(g.state.cur.w.total)}) Ringe ${L.r.units}`);
    }
  }
  console.log(`(Rechenzeit ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
