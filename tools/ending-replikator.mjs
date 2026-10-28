#!/usr/bin/env node
// Measures what the two endings of Akt II are worth (Paket 6): the same active sim (fresh start or the real v1 save), the endings put in effect from the start
// (runSim option endForce), compared over the first galaxies: how long each galaxy takes and what the jump brings.
//
//   node tools/ending-replikator.mjs [--galaxies 4] [--seeds 1,2,3] [--fixture file] [--hours 20]
//
// Rows: none / merge / split / both. `Gal n` = hours from the start of galaxy n to the jump; `Summe` = hours until galaxy `--galaxies` is left; `vs. ohne` = share of the "none" time.
import { pathToFileURL } from 'node:url';
import { runSim, loadSaveFile } from './simulate.mjs';
import { endCount } from '../games/replikator/ending.js';

const VARIANTS = [['ohne', []], ['merge', ['merge']], ['split', ['split']], ['beide', ['merge', 'split']]];

export function endingRun({ force, seed, galaxies = 4, fixture = null, hours = 40 }) {
  const game = fixture ? loadSaveFile(fixture, { seed }) : null;
  if (game && force.length) for (const k of force) { game.state.rep2.end.picked[k] = 0.001; game.state.rep2.end.order.push(k); }
  const r = runSim({ game, hours, dt: 2, quiet: true, act2: true, seed, jump: true, endForce: fixture ? null : force, strategy: { endPick: [] }, until: (g) => g.state.rep2.gal.n > galaxies });
  const gals = r.map.gals.filter((x) => x.jump != null);
  return { gals: gals.map((x) => x.jump - x.start), total: gals.length >= galaxies ? gals[galaxies - 1].jump - (r.map.start ?? 0) : null, types: gals.map((x) => x.type), seeds: gals.map((x) => x.seeds), game: r.game, endCount: endCount(r.game) };
}

export function endingTable({ galaxies = 4, seeds = [1, 2, 3], fixture = null, hours = 40, log = console.log, variants = null } = {}) {
  const out = {};
  const list = VARIANTS.filter(([name]) => !variants || name === 'ohne' || variants.includes(name));
  for (const [name, force] of list) {
    out[name] = seeds.map((seed) => endingRun({ force, seed, galaxies, fixture, hours }));
  }
  const h = (s) => (s == null ? '   -  ' : (s / 3600).toFixed(2).padStart(6));
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  log(`Zeit je Galaxie in Stunden (Mittel über Seeds ${seeds.join('/')}), ${fixture ? 'echter Spielstand' : 'frischer Abschluss'}; Galaxien 2..${galaxies} sind die, in denen das Ende wirkt (Galaxie 1: ${fixture ? 'Datei' : 'frisch'} vor dem Sprung)`);
  log('Variante  ' + Array.from({ length: galaxies }, (_, i) => `Gal ${i + 1}`.padStart(7)).join('') + '   Summe  vs. ohne  Saatkerne gesamt');
  const base = mean(out.ohne.map((x) => x.total).filter((x) => x != null));
  for (const [name] of list) {
    const rows = out[name];
    const per = Array.from({ length: galaxies }, (_, i) => mean(rows.map((r) => r.gals[i]).filter((x) => x != null)));
    const tot = mean(rows.map((r) => r.total).filter((x) => x != null));
    const sk = mean(rows.map((r) => r.seeds.reduce((a, b) => a + Number(b), 0)));
    log(`${name.padEnd(9)} ` + per.map(h).join(' ') + ` ${h(tot)}   ${base && tot ? Math.round((tot / base) * 100) + ' %' : '-'}`.padEnd(14) + (sk != null ? sk.toFixed(0) : '-'));
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const arg = (k, d) => (args.indexOf('--' + k) >= 0 ? args[args.indexOf('--' + k) + 1] : d);
  endingTable({
    galaxies: Number(arg('galaxies', 4)),
    seeds: String(arg('seeds', '1,2,3')).split(',').map(Number),
    fixture: arg('fixture', null),
    hours: Number(arg('hours', 40)),
    variants: arg('variants', null) ? String(arg('variants')).split(',') : null,
  });
}
