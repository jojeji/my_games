#!/usr/bin/env node
// Headless balance simulation for Merlin using the REAL game logic (scripted greedy player, like tools/simulate.mjs).
//   node tools/simulate-merlin.mjs [--hours 14] [--dt 1] [--act 1] [--session 20] [--idle] [--both] [--cycles 2] [--verbose]
// --act N   : the player acts every N s (autos always run every tick). --idle = --act 120 --session 20.
// --cycles N: keep playing after the ending (new cycle) until N cycles are finished.
// Env: TUNE_OVERRIDE='{"eraThr":[...]}' overrides games/merlin/tune.js.
import { pathToFileURL } from 'node:url';
import { createMerlin } from '../games/merlin/logic.js';
import { ERAS, IDEAS } from '../games/merlin/eras.js';
import { formatNumber as f, formatDuration } from '../engine/format.js';

export const STRATEGY = {
  rejuvFactor: 1.0, // verjuengen when gain >= factor * memories earned this era
  rejuvMinGain: 1,
  rejuvMinTime: 25,
  rejuvStall: 600,
  ideaPick: 'a', // 'a' | 'b' (first / second option of an era)
  jumpMinGain: 1,
};

const hms = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

export function runSim({ hours = 14, dt = 1, act: actEvery = 1, session = 0, cycles = 1, quiet = true, verbose = false, strategy = {} } = {}) {
  const S = { ...STRATEGY, ...strategy };
  const g = createMerlin();
  let t = 0;
  const events = []; // meaningful decisions for gap analysis
  const out = { eras: [], finished: [], rejuvFirst: null, cycleStart: [0], log: [] };
  const note = (m) => {
    const line = `${hms(t)}  ${m}`;
    out.log.push(line);
    if (!quiet) console.log(line);
  };
  g.emit = (type, p) => {
    if (type === 'prestige') {
      events.push(t);
      const n = g.state.layers[p.id].count;
      if (p.id === 'rejuv') {
        if (out.rejuvFirst === null) {
          out.rejuvFirst = t;
          note(`ERSTE VERJÜNGUNG +${f(p.gain)}`);
        } else if (verbose) note(`Verjüngung #${n} +${f(p.gain)}`);
      } else if (p.id === 'jump') {
        out.eras.push({ t, era: g.state.mer.era, cycle: g.state.layers.cycle.count });
        note(`Epochensprung -> ${ERAS[g.state.mer.era].name} (+${f(p.gain)} Splitter, Verjüngungen ${g.state.layers.rejuv.count})`);
      } else if (p.id === 'cycle') {
        out.cycleStart.push(t);
        note(`ZYKLUS ${n} geschlossen: +${f(p.gain)} Ewigkeit`);
      }
    } else if (type === 'upgrade') events.push(t);
    else if (type === 'finale') {
      out.finished.push(t);
      note('=== DAS ERSTE WORT gesprochen ===');
    }
  };

  const buyUpgrades = () => {
    g.upgBuyAll('eternity');
    // ideas of the current era first (they are the more important decision): pick one option, then the free ones
    const e = g.state.mer.era;
    const here = IDEAS.filter((i) => i.era === e);
    const opts = here.filter((i) => i.excl);
    const pick = opts[S.ideaPick === 'b' ? 1 : 0];
    if (pick && g.upgCanBuy(pick.id)) g.upgBuy(pick.id);
    for (const i of here) if (!i.excl && g.upgCanBuy(i.id)) g.upgBuy(i.id);
    g.upgBuyAll('shards');
    g.upgBuyAll('mem');
  };

  const wantRejuv = () => {
    if (!g.canPrestige('rejuv')) return false;
    const ls = g.state.layers.rejuv;
    const gain = g.prestigeGain('rejuv');
    const held = g.state.cur.mem.run;
    if (ls.runTime < S.rejuvMinTime && ls.count > 0) return false;
    if (gain.gte(held.mul(S.rejuvFactor).max(S.rejuvMinGain))) return true;
    return ls.runTime > S.rejuvStall;
  };

  const player = () => {
    // spells first (sturm only when the hourglass is empty)
    for (const sp of g.def.spells) {
      if (sp.id === 'sturm' && g.tapCharges() >= 2) continue;
      if (sp.id === 'still' && g.get('sand').lt(g.prodBulkCost(g.producerById.quellen, 0, 1).mul(50))) continue;
      g.spellCast(sp.id);
    }
    while (g.tapCan()) g.tapDo();
    buyUpgrades();
    g.prodBuyAll('quellen');
    // layers
    if (g.canPrestige('cycle')) {
      if (g.state.layers.cycle.count + 1 <= cycles) g.prestige('cycle');
    } else {
      const here = IDEAS.filter((i) => i.era === g.state.mer.era && i.excl);
      const planted = here.some((i) => g.upgLevel(i.id) > 0);
      if (g.canPrestige('jump') && (planted || !here.length) && g.prestigeGain('jump').gte(S.jumpMinGain)) g.prestige('jump');
      else if (wantRejuv()) g.prestige('rejuv');
    }
  };

  let sinceAct = 0;
  const maxT = hours * 3600;
  while (t < maxT) {
    g.tick(dt);
    t += dt;
    sinceAct += dt;
    if (session > 0 && actEvery > dt) {
      if (t % actEvery < session) player();
    } else if (sinceAct >= actEvery) {
      sinceAct = 0;
      player();
    }
    if (out.finished.length >= cycles && g.state.layers.cycle.count >= cycles) break;
  }
  out.t = t;
  out.game = g;
  // gaps between decisions
  const gaps = [];
  let prev = 0;
  for (const e of [...events, t]) {
    if (e > prev) gaps.push({ from: prev, len: e - prev });
    prev = e;
  }
  out.gaps = gaps.sort((a, b) => b.len - a.len).slice(0, 6);
  // per-cycle era durations
  out.eraTimes = [];
  return out;
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      const n = argv[i + 1];
      if (n !== undefined && !n.startsWith('--')) {
        o[k] = Number.isNaN(Number(n)) ? n : Number(n);
        i++;
      } else o[k] = true;
    }
  }
  return o;
}

export function summarize(r, label = '') {
  const jumps = r.eras.map((e) => e.t);
  const lines = [];
  lines.push(`${label} Erste Verjüngung ${r.rejuvFirst ? hms(r.rejuvFirst) : '-'} | Epochen: ${jumps.map(hms).join(' ')} | Ende: ${r.finished.map(hms).join(' / ') || 'nicht erreicht'}`);
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const strategy = a.pick ? { ideaPick: a.pick } : {};
  if (a.both) {
    for (const [label, act, session] of [['aktiv', 1, 0], ['idle ', 120, 20]]) {
      const r = runSim({ hours: a.hours ?? 40, dt: a.dt ?? 1, act, session, cycles: a.cycles ?? 2, strategy });
      console.log(summarize(r, label));
      if (r.finished.length >= 2) console.log(`   Zyklus 2 dauerte ${(((r.finished[1] - r.cycleStart[1]) / (r.finished[0])) * 100).toFixed(0)} % von Zyklus 1`);
      console.log('   Pausen: ' + r.gaps.slice(0, 4).map((x) => `${formatDuration(x.len)}@${hms(x.from)}`).join(', '));
    }
  } else {
    const r = runSim({ hours: a.hours ?? 14, dt: a.dt ?? 1, act: a.idle ? 120 : a.act ?? 1, session: a.idle ? 20 : a.session ?? 0, cycles: a.cycles ?? 1, quiet: false, verbose: !!a.verbose, strategy });
    console.log(summarize(r));
    console.log('Pausen: ' + r.gaps.slice(0, 5).map((x) => `${formatDuration(x.len)}@${hms(x.from)}`).join(', '));
  }
  console.log(`(Rechenzeit ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
