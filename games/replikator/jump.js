// Replikator Akt II - Galaxiensprung (Paket 5, layer 4). Pure and DOM-free. State: g.state.rep2.gal / .archive (galaxy.js).
//  - The jump is open when the current galaxy is completed: `jumpSectors` claimed sectors and the Echo seen. Reaching that completes the galaxy TYPE for the Archiv (once per type).
//  - The jump itself is the engine's prestige of layer 4 (def.js): it wipes layers 0-3 (currencies, generators, upgrades that are not kept, run timers) and gives Saatkerne.
//    On top of that (afterReset -> galJump): the map is gone, two galaxies are offered (stored in the save, the game waits for the pick), anomalies reset their sector bookkeeping.
//  - What survives: Genom/Mutationen, Akt II, Chronik, Befehle, Archiv, Saatkerne and their upgrades, challenge completions, milestones, achievements, layer counts.
//  - The pick (galChoose) builds the new map with a new seed, fixed price anchor, and the Echo sits on it again. The Auto-Sprung and the sim pick with galPick.
import { rngShuffle } from '../../engine/kit/rng.js';
import { TUNE as T } from './tune.js';
import { act2Active, echoSighted, generateMap, claimedCount } from './map.js';
import { anoJump } from './anomalies.js';
import { GAL_ORDER, galType, archiveDone } from './galaxy.js';

const G = (g) => g.state.rep2.gal;
const played = (g) => g.state.time.played;

/** The current galaxy has `jumpSectors` claimed sectors and the Echo has been seen (it sits on the edge of every map, so that is a matter of looking). */
export const galaxyComplete = (g) => act2Active(g) && !G(g).choice && claimedCount(g) >= T.jumpSectors && echoSighted(g);
/** The jump is open (layer.available). */
export const jumpReady = galaxyComplete;

/** hooks.onTick: record the sector record and give the Archiv bonus of the type the first time it is completed. Returns true on the tick it happens. */
export function galaxyCheck(g) {
  if (!act2Active(g)) return false;
  const gal = G(g);
  const n = claimedCount(g);
  if (n > (gal.best || 0)) gal.best = n;
  const type = galType(g);
  if (type && !archiveDone(g, type) && galaxyComplete(g)) {
    g.state.rep2.archive[type] = Math.max(0.001, played(g));
    g.plog('jump', `Archiv: ${type}`);
    g.refresh();
    g.emit('archive', { type, n: gal.n });
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* The offer                                                            */
/* ------------------------------------------------------------------ */

/**
 * The two galaxies on offer after a jump (seeded RNG in the save): never the type you just left, completed types only fill up when fewer than two are new.
 * Pure in (rng, archive, current type); consumes `rng` ({ seed }).
 */
export function drawOffers(rng, archive, current) {
  const others = GAL_ORDER.filter((t) => t !== current);
  const fresh = rngShuffle(rng, others.filter((t) => !archive[t]));
  const done = rngShuffle(rng, others.filter((t) => archive[t]));
  return [...fresh, ...done].slice(0, 2);
}

/** Which of the offered galaxies the Auto-Sprung and the sim's player take: a new type first, then the order of GAL_PICK. */
export const GAL_PICK = ['zwerg', 'quasar', 'elliptisch', 'leerraum', 'kollision', 'spirale'];
export function galPick(g, opts = G(g).choice && G(g).choice.opts) {
  if (!opts || !opts.length) return null;
  const score = (t) => (archiveDone(g, t) ? 100 : 0) + GAL_PICK.indexOf(t);
  return opts.slice().sort((a, b) => score(a) - score(b))[0];
}

/* ------------------------------------------------------------------ */
/* Jump and choice                                                      */
/* ------------------------------------------------------------------ */

/** afterReset of layer 4 (def.js): leave the galaxy. The map is gone until a galaxy is picked. */
export function galJump(g) {
  const r = g.state.rep2;
  const gal = r.gal;
  const m = r.map;
  gal.hist.push({ n: gal.n, type: gal.type, sectors: m.claimed, secs: Math.round(played(g) - gal.at) });
  const left = gal.type;
  gal.n += 1;
  gal.type = null;
  gal.at = played(g);
  gal.choice = { opts: drawOffers(gal.rng, r.archive, left), at: played(g) };
  r.map = { radius: 0, seed: 0, claimed: 0, occupied: 0, trip: null, cells: [] };
  anoJump(g);
  g.plog('jump', `Sprung aus ${left}: Angebot ${gal.choice.opts.join(', ')}`);
  g.emit('galaxy-jump', { from: left, opts: gal.choice.opts.slice(), n: gal.n });
}

/** Pick one of the offered galaxies: the new map is generated, the price level is fixed for galaxies >= 2. Returns false for a type that is not on offer. */
export function galChoose(g, type) {
  const r = g.state.rep2;
  const gal = r.gal;
  if (!gal.choice || !gal.choice.opts.includes(type)) return false;
  gal.type = type;
  gal.choice = null;
  gal.at = played(g);
  gal.exp0 = g.state.layers.expansion.count;
  r.anchor = T.galAnchor + T.galAnchorStep * (gal.n - 2);
  r.map = generateMap(r.rng);
  g.plog('jump', `Galaxie ${gal.n}: ${type}`);
  g.refresh();
  g.emit('galaxy', { type, n: gal.n });
  return true;
}

/** The Auto-Sprung and the sim's player: pick for a pending choice. Returns the picked type or null. */
export function galAutoChoose(g) {
  const t = galPick(g);
  return t && galChoose(g, t) ? t : null;
}

/** Number of galaxies left behind (jumps made). */
export const jumpsMade = (g) => g.state.layers.jump.count;
