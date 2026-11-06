#!/usr/bin/env node
// Prints the Myzel Chronik in the order a commuter meets it ("Pendler" scenario of tools/simulate-myzel.mjs): every entry with the number and the
// calendar time of the VISIT that discovers it (what happens while the app is closed is discovered at the next visit), plus the rhythm:
// visits without a new entry, entries per visit, modals per visit.
//
//   node tools/story-myzel.mjs [--fork s|m] [--forkB l|z] [--seed N] [--plain] [--days 8]
//
// Reuse in tests: import { storyRhythm } and feed it the result of runPendler().
import { pathToFileURL } from 'node:url';
import { runPendler, hms } from './simulate-myzel.mjs';
import { CAST, lineText } from '../games/myzel/characters.js';

/** Rhythm of a pendler run up to the ending: per visit the entries it discovered (ids), the longest run of visits without one (first visit excluded). */
export function storyRhythm(ctx) {
  const g = ctx.g;
  const until = ctx.contentAt ?? Infinity;
  const visits = ctx.visits.filter((v) => v.at <= until);
  const modal = new Set(g.def.story.filter((s) => s.modal).map((s) => s.id));
  const per = visits.map((v) => ctx.events.filter((e) => e.type === 'story' && e.visit === v.i).map((e) => e.id));
  let worst = 0;
  let run = 0;
  let worstAt = 0;
  per.forEach((ids, i) => {
    if (i === 0) return;
    run = ids.length ? 0 : run + 1;
    if (run > worst) {
      worst = run;
      worstAt = i;
    }
  });
  const entries = ctx.events.filter((e) => e.type === 'story' && e.visit <= (visits.at(-1)?.i ?? 0));
  return {
    visits: visits.length,
    entries: entries.length,
    per,
    worstGap: worst,
    worstGapAt: worstAt,
    maxPerVisit: Math.max(0, ...per.map((x) => x.length)),
    maxModals: Math.max(0, ...per.map((x) => x.filter((id) => modal.has(id)).length)),
    perVisit: visits.length ? entries.length / visits.length : 0,
    all: entries.map((e) => ({ id: e.id, visit: e.visit, t: e.t })),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  const ctx = runPendler({ days: Number(a.days || 10), seed: Number(a.seed || 1), fork: a.fork || 's', forkB: a.forkB || 'l', stopAtContent: false });
  // play on a little beyond the ending so the Nachspiel shows up
  const g = ctx.g;
  const r = storyRhythm(ctx);
  const byId = Object.fromEntries(g.def.story.map((s) => [s.id, s]));
  if (!a.plain) {
    const all = ctx.events.filter((e) => e.type === 'story'); // including the Nachspiel after the ending
    for (const e of all) {
      const s = byId[e.id];
      console.log(`\nBesuch ${String(e.visit + 1).padStart(2)} · ${hms(e.t)}  ${e.id} (${s.chapter})${s.modal ? ' [Modal]' : ''}`);
      for (const l of s.lines) console.log(`   ${CAST[l.who].name.padEnd(6)} ${lineText(g, l)}`);
    }
  }
  console.log(`\n=== Rhythmus (Pendler ${a.fork || 's'}${a.forkB || 'l'}, Seed ${a.seed || 1}) ===`);
  console.log(`${r.entries} Einträge in ${r.visits} Besuchen bis zum Ende (${ctx.contentAt != null ? hms(ctx.contentAt) : 'Ende nicht erreicht'}), ${r.perVisit.toFixed(2)} je Besuch`);
  console.log(`Längste Folge von Besuchen ohne neuen Eintrag: ${r.worstGap} (bei Besuch ${r.worstGapAt + 1}), höchstens ${r.maxPerVisit} Einträge und ${r.maxModals} Dialoge in einem Besuch`);
  console.log('Je Besuch: ' + r.per.map((x) => x.length).join(''));
  const never = g.def.story.filter((s) => g.state.story[s.id] === undefined || g.state.story[s.id] === false).map((s) => s.id);
  if (never.length) console.log('Nie ausgelöst: ' + never.join(', '));
}
