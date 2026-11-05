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
import { buyNode, rainCast } from '../games/myzel/def.js';
import { TUNE as T } from '../games/myzel/tune.js';
import { createRuntime } from '../engine/core.js';
import { rngRoll, rngInt } from '../engine/kit/rng.js';
import { formatDuration, formatNumber as f } from '../engine/format.js';

export const STRATEGY = {
  fork: 's', // 's' | 'm' (fork A)
  rain: true, // taps the Regenschauer
  hRun: T.ripeSecs, // manual Hyphen prestige when the run is at least this old (the auto-Hyphen default is T.autoHTime)
  fMinFrac: 0.3, // Fruchtkörper when the gain is >= this fraction of the Fruchtkörper owned (and >= 1)
  challenges: true, // enters the next challenge right after a Fruchtkörper prestige / a finished challenge
};

export const hms = (s) => {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d ? d + 'd ' : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/** New things that count as 'something new' for the progress metric. */
const NEW_KINDS = new Set(['upgrade', 'milestone', 'layer-unlocked', 'challenge-enter', 'challenge-done', 'fork-chosen', 'auto-unlocked']);

/** Everything the bot decides in one moment of a visit. Pure game calls: it never touches state directly. */
export function act(g, S, state) {
  // autos start off: the player switches them on once the hint toast has told them where (here: at the next visit)
  if (state.visitStart) {
    for (const a of g.def.autos) if (g.autoUnlocked(a.id)) g.state.auto[a.id].on = true;
    state.visitStart = false;
  }
  if (g.forkOffered('a')) g.forkChoose('a', S.fork);
  const node = g.forkChoice('a');
  const buyAll = () => {
    buyNode(g, 'h');
    if (node) buyNode(g, node);
    buyNode(g, 'f');
  };
  buyAll();
  // Hyphen: claim as soon as the run is ripe
  if (g.canPrestige('h') && g.state.layers.h.runTime >= S.hRun) {
    g.prestige('h');
    buyAll();
  }
  // Sporen / Mykorrhiza: as soon as a unit is affordable (everything affordable is bought first: the reset wipes the Hyphen)
  if (node && g.canPrestige(node)) {
    buyAll();
    g.prestige(node);
    buyAll();
  }
  // Fruchtkörper
  if (g.canPrestige('f')) {
    const gain = g.prestigeGain('f');
    if (gain.gte(Math.max(1, S.fMinFrac * g.state.cur.f.total.toNumber()))) {
      buyAll();
      g.prestige('f');
      buyNode(g, 'f');
    }
  }
  // challenges: start the next one in a fresh state (right after a reset of row 3)
  if (S.challenges && !g.chActive() && g.state.layers.f.count >= 1 && g.state.cur.h.total.sub(g.state.myz.hAtF).lt(1)) {
    for (const c of g.def.challenges) if (g.chAvailable(c.id)) { g.chEnter(c.id); break; }
  }
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
      const before = g.state.cur[l.currency].total.sub(p.gain);
      ev.gain = p.gain;
      ev.big = p.gain.gte(before.mul(0.1)) && p.gain.gte(1);
      ev.manual = ctx.inVisit;
    }
    ctx.events.push(ev);
    const key = type + (p?.id ? ':' + p.id : '');
    if (!(key in ctx.first)) ctx.first[key] = t;
  };
  return ctx;
}

/** Play `len` seconds as the player: acts every `actEvery` seconds. */
function playVisit(ctx, len, dt = 1, actEvery = 5) {
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
    if (v.at > ctx.t) absence(ctx, v.at - ctx.t);
    ctx.visit = i;
    const from = ctx.events.length;
    const rec = { i, at: v.at, offlineEvents: ctx.events.filter((e) => e.visit === i).length };
    playVisit(ctx, v.len);
    rec.events = ctx.events.filter((e) => e.visit === i);
    rec.progress = rec.events.some((e) => NEW_KINDS.has(e.type) || (e.type === 'prestige' && e.big));
    rec.isNew = rec.events.some((e) => NEW_KINDS.has(e.type));
    rec.from = from;
    visits.push(rec);
    if (hook && hook(ctx, rec) === false) break;
  }
  ctx.visits = visits;
  return ctx;
}

/** Content of Paket 1 finished: all milestones, all challenges, everything of the chosen branch and the other layers bought. */
export function contentDone(g) {
  const node0 = g.forkChoice('a');
  for (const m of g.def.milestones) if ((m.layer !== 's' && m.layer !== 'm') || m.layer === node0) if (!g.hasMs(m.id)) return false;
  if (!g.def.challenges.every((c) => g.chDone(c.id))) return false;
  const node = g.forkChoice('a');
  if (!node) return false;
  for (const u of g.def.upgrades) {
    if (!['h', node, 'f'].includes(u.node)) continue;
    if (u.excl && u.excl.some((x) => g.upgLevel(x) > 0)) continue;
    if (!g.upgMaxed(u.id)) return false;
  }
  return true;
}

/** Pacing summary of a pendler run: calendar seconds of the key moments. */
export function pacing(ctx) {
  const F = ctx.first;
  const g = ctx.g;
  const node = g.forkChoice('a');
  const t = (k) => (k in F ? F[k] : null);
  const first = {
    hyphen: t('prestige:h'),
    forkOffered: t('fork-chosen:a'),
    unit: node ? t('prestige:' + node) : null,
    fLayer: t('layer-unlocked:f'),
    fruit: t('prestige:f'),
    chDurre: t('challenge-done:durre'),
    chFrost: t('challenge-done:frost'),
    chKahl: t('challenge-done:kahl'),
  };
  const done = ctx.contentAt ?? null;
  return { first, contentDone: done };
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
  return { visits: vs.length, withProgress: withProg, ratio: vs.length ? withProg / vs.length : 0, worstNewGap: worst, list: vs };
}

export function runPendler({ days = 4, seed = 1, fork = 's', rain = true, stopAtContent = true, visitLen = 180, strategy = {} } = {}) {
  const schedule = pendlerSchedule({ days, seed, visitLen });
  const ctx = runSchedule(schedule, { fork, rain, ...strategy }, {
    hook: (c, rec) => {
      if (c.contentAt == null && contentDone(c.g)) {
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
export function runActive({ hours = 24, fork = 's', dt = 1, strategy = {} } = {}) {
  const ctx = makeSim({ fork, ...strategy });
  ctx.inVisit = true;
  ctx.state.visitStart = true;
  while (ctx.t < hours * 3600) {
    if (ctx.t % 5 < dt) act(ctx.g, ctx.S, ctx.state);
    ctx.g.tick(dt);
    ctx.t += dt;
    if (ctx.contentAt == null && contentDone(ctx.g)) {
      ctx.contentAt = ctx.t;
      break;
    }
  }
  return ctx;
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
  out.push(`${label} 1. Hyphen ${x(L.hyphen)} | Gabel gewählt ${x(L.forkOffered)} | 1. Einheit ${x(L.unit)} | F-Ebene ${x(L.fLayer)} | 1. Fruchtkörper ${x(L.fruit)} | Dürre ${x(L.chDurre)} Frost ${x(L.chFrost)} Kahl ${x(L.chKahl)} | Inhalt komplett ${x(p.contentDone)}`);
  return out.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const fork = a.fork || 's';
  const rain = !a['no-rain'];
  if (a.active) {
    const ctx = runActive({ hours: a.hours ?? 24, fork });
    console.log(describe(ctx, 'aktiv'));
  } else if (a.selten) {
    const days = a.days ?? 6;
    const sched = [];
    for (let t = 0; t < days * 86400; t += 8 * 3600) sched.push({ at: t, len: 180 });
    const ctx = runSchedule(sched, { fork, rain });
    console.log(describe(ctx, 'selten'));
  } else {
    const ctx = runPendler({ days: a.days ?? 4, seed: a.seed ?? 1, fork, rain, stopAtContent: !a.long });
    ctx.contentAt != null && console.log(`Inhalt komplett nach ${hms(ctx.contentAt)} (Besuch ${ctx.contentVisit + 1})`);
    console.log(describe({ ...ctx, contentAt: ctx.contentAt }, `pendler ${fork}`));
    const m = progressMetric(ctx);
    console.log(`Fortschritt: ${m.withProgress}/${m.visits} Besuche (${(m.ratio * 100).toFixed(0)} %), längste Folge ohne Neues: ${m.worstNewGap}`);
    if (a.verbose) {
      for (const v of m.list) {
        const kinds = {};
        for (const e of v.events) kinds[e.type + (e.id ? ':' + e.id : '')] = (kinds[e.type + (e.id ? ':' + e.id : '')] || 0) + 1;
        console.log(`${String(v.i + 1).padStart(3)} ${hms(v.at)} ${v.progress ? (v.isNew ? 'neu ' : 'Pres') : '----'} ` + Object.entries(kinds).map(([k, n]) => (n > 1 ? `${k}×${n}` : k)).join(' '));
      }
      const g = ctx.g;
      console.log(`Endstand: N ${f(g.get('n'))} (${f(g.incomePerSec('n'))}/s) H ${f(g.get('h'))} S ${f(g.get('s'))} Einh. ${g.state.layers.s.units}/${g.state.layers.m.units} F ${f(g.get('f'))} Zucker ${f(g.get('z'))}`);
    }
  }
  console.log(`(Rechenzeit ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
