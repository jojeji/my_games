#!/usr/bin/env node
// Protoplanet: Bot-Simulation. Der Bot spielt mit derselben Physik (games/protoplanet/play.js) in Node.
//   node tools/sim-protoplanet.mjs                      alle festen Levels + je Familie 40 Seeds (= --table)
//   node tools/sim-protoplanet.mjs --level 1-5 [--verbose]   ein festes Level
//   node tools/sim-protoplanet.mjs --family jaeger --seeds 100  eine Familie (Parameter aller Levels, die sie nutzen; Familien: wolke ziel strom enge brocken jaeger)
// Ausgabe: Loesungsquote, Median/90. Perzentil der Spielzeit, Median der ausgestossenen Masse (Anteil der Startmasse) und vorgeschlagene `targets` (Bot-Median x 1,3).
import { LEVELS, levelById } from '../games/protoplanet/levels.js';
import { playLevel, botBatch } from '../games/protoplanet/bot.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i < 0 ? def : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
};
const verbose = args.includes('--verbose');
const nSeeds = +opt('seeds', 40);
const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '-');
const pad = (s, n) => String(s).padEnd(n);
const sug = (r) => `eject<=${fmt(Math.ceil(r.medEject * 1.3 * 20) / 20, 2)} time<=${Math.ceil((r.medTime * 1.3) / 5) * 5}`;

function fixed(levels) {
  console.log('Feste Levels (Bot, ein Lauf je Level)');
  console.log(pad('level', 6), pad('familie', 8), pad('ergebnis', 9), pad('zeit s', 8), pad('ausstoss', 9), pad('masse', 6), 'aktuelle targets');
  for (const l of levels) {
    const r = playLevel(l);
    console.log(pad(l.id, 6), pad(l.family, 8), pad(r.solved ? 'geloest' : r.lost ? 'verloren' : 'Zeitlimit', 9), pad(fmt(r.time), 8), pad(fmt(r.ejected, 2), 9), pad(fmt(r.mass, 2), 6), `eject<=${l.targets.eject} time<=${l.targets.time}`);
    if (verbose) console.log('   Vorschlag:', sug({ medEject: r.ejected, medTime: r.time }));
  }
}

function families(levels, seeds) {
  console.log(`\nFamilien (je ${seeds} Seeds ab 1000, Parameter des Levels)`);
  console.log(pad('level', 6), pad('familie', 8), pad('geloest', 9), pad('Median s', 9), pad('p90 s', 8), pad('Median Ausstoss', 16), 'Vorschlag');
  const list = Array.from({ length: seeds }, (_, i) => 1000 + i);
  for (const l of levels.filter((x) => x.family !== 'hand')) {
    const b = botBatch(l, list);
    console.log(pad(l.id, 6), pad(l.family, 8), pad(`${b.solved}/${b.n}`, 9), pad(fmt(b.medTime), 9), pad(fmt(b.p90Time), 8), pad(fmt(b.medEject, 2), 16), sug(b));
    if (verbose) for (const r of b.runs.filter((x) => !x.solved)) console.log('   Seed', r.seed, r.lost ? 'verloren' : 'Zeitlimit', fmt(r.time));
  }
}

const t0 = performance.now();
const lv = opt('level');
const fam = opt('family');
if (lv && lv !== true) fixed([levelById(lv)]);
else if (fam && fam !== true) families(LEVELS.filter((l) => l.family === fam), nSeeds);
else {
  fixed(LEVELS);
  families(LEVELS, nSeeds);
}
console.log(`\n(${((performance.now() - t0) / 1000).toFixed(1)} s Rechenzeit)`);
