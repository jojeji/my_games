#!/usr/bin/env node
// Prints the Replikator Chronik in the order a player meets it (active sim), with timestamps, and checks the pacing:
// gaps between entries (target: none above ~20 min until st_end) and pile-ups (two entries closer than a minute).
//
//   node tools/story-replikator.mjs [--idle] [--max 20] [--plain]
//
// Reuse in tests: import { storyTimeline, storyPacing } and feed them the game of a finished runSim().
import { pathToFileURL } from 'node:url';
import { advance } from '../engine/core.js';
import { runSim } from './simulate.mjs';
import { lineText } from '../games/replikator/characters.js';
import { CAST } from '../games/replikator/characters.js';

const hms = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

/** [{ id, t, def }] in play order (stable: ties keep definition order). */
export function storyTimeline(game) {
  return game.storyList().map(({ def, t }) => ({ id: def.id, t, def }));
}

/** Gaps (seconds) between consecutive entries up to the last one (st_end), start of the game counts as 0. */
export function storyPacing(timeline, { endId = 'st_end' } = {}) {
  const end = timeline.find((e) => e.id === endId);
  const list = end ? timeline.filter((e) => e.t <= end.t) : timeline;
  const gaps = [];
  let prev = { id: '(Start)', t: 0 };
  for (const e of list) {
    gaps.push({ from: prev.id, to: e.id, start: prev.t, len: e.t - prev.t });
    prev = e;
  }
  const maxGap = gaps.reduce((a, b) => (b.len > a.len ? b : a), gaps[0] || { len: 0 });
  const piles = gaps.filter((x) => x.from !== '(Start)' && x.len < 60);
  return { gaps, maxGap, piles, count: list.length, end: end ? end.t : null };
}

function printTranscript(timeline, g) {
  for (const e of timeline) {
    const modal = e.def.modal ? ' [Modal]' : '';
    console.log(`\n${hms(e.t)}  ${e.id}  (${e.def.chapter})${modal}`);
    for (const l of e.def.lines) console.log(`  ${CAST[l.who].name.padEnd(5)} ${lineText(g, l)}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const idle = args.includes('--idle');
  const maxMin = Number(args[args.indexOf('--max') + 1]) || 20;
  const r = idle
    ? runSim({ hours: 40, act: 120, session: 20, quiet: true })
    : runSim({ hours: 22, quiet: true });
  advance(r.game, 3); // the sim stops the moment the last challenge is done: let the slow checks fire st_end
  const tl = storyTimeline(r.game);
  if (!args.includes('--plain')) printTranscript(tl, r.game);
  const pc = storyPacing(tl);
  console.log(`\n=== Tempo (${idle ? 'idle' : 'aktiv'}) ===`);
  console.log(`${pc.count} Einträge bis st_end (${pc.end != null ? hms(pc.end) : 'nicht erreicht'}), Sim-Ende ${r.endTime ? hms(r.endTime) : '-'}`);
  console.log('Größte Lücken: ' + [...pc.gaps].sort((a, b) => b.len - a.len).slice(0, 8).map((x) => `${Math.round(x.len / 60)} min (${x.from} -> ${x.to} @${hms(x.start)})`).join(' | '));
  const over = pc.gaps.filter((x) => x.len > maxMin * 60);
  console.log(over.length ? `Lücken über ${maxMin} min: ${over.map((x) => `${x.from}->${x.to} ${Math.round(x.len / 60)} min`).join(', ')}` : `Keine Lücke über ${maxMin} min.`);
  console.log(pc.piles.length ? `Häufungen (< 60 s): ${pc.piles.map((x) => `${x.from}->${x.to} ${Math.round(x.len)} s`).join(', ')}` : 'Keine Häufungen.');
  const never = r.game.def.story.filter((s) => r.game.state.story[s.id] === undefined).map((s) => s.id);
  if (never.length) console.log('Nie ausgelöst: ' + never.join(', '));
}
