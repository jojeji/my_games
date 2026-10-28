// Replikator Akt II - Galaxiekarte. Pure and DOM-free (runs in Node for tests and the sim).
// State lives in g.state.rep2 (see rep2State): rng seed, act-II flag, cost anchor and the map itself.
//  - hex grid in axial coordinates (q, r), radius 2 = 19 cells, centre = Heimat (claimed from the start)
//  - layout and types come from the seeded RNG (engine/kit/rng.js) when Akt II starts; the cells are stored in the save
//  - fog: a cell's type is only visible next to an own cell; claiming only next to own territory
//  - claiming starts an Erschliessung (the probe flies there, `mapTrip*` seconds, one at a time, runs offline too); the sector counts when it arrives
//  - the Echo takes one free cell per `mapEchoEvery` claimed sectors (never time based) and never cuts off a free cell from the player,
//    so every map can be claimed down to the last free cell (>= 12 sectors, see tests/replikator-map.test.mjs)
import { D, ONE, Decimal } from '../../engine/decimal.js';
import { newSeed, rngNext, rngRoll, rngInt, rngShuffle, toSeed } from '../../engine/kit/rng.js';
import { TUNE as T } from './tune.js';
import { cmdState } from './commands.js';
import { anoState, anoReset } from './anomalies.js';
import { mutState, mutReset, mutMapCost, mutTrip, mutAdj, ripen } from './mutations.js';

/* ------------------------------------------------------------------ */
/* Hex geometry                                                         */
/* ------------------------------------------------------------------ */

const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

/** Distance between two axial cells. */
export const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

/** Canonical cell order of a disc: centre first, then ring 1, ring 2 ... (stable, the save stores the order). */
export function hexDisc(radius) {
  const out = [{ q: 0, r: 0 }];
  for (let k = 1; k <= radius; k++) {
    let q = -k;
    let r = k; // start at direction 4 * k, walk around
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < k; step++) {
        out.push({ q, r });
        q += DIRS[side][0];
        r += DIRS[side][1];
      }
    }
  }
  return out;
}

const nbCache = new WeakMap();
/** Neighbour index lists for a cells array (cached per array; cell coordinates never change). */
export function neighbors(cells) {
  let nb = nbCache.get(cells);
  if (nb && nb.length === cells.length) return nb;
  const at = new Map(cells.map((c, i) => [c.q + ',' + c.r, i]));
  nb = cells.map((c) => DIRS.map(([dq, dr]) => at.get(c.q + dq + ',' + (c.r + dr))).filter((i) => i !== undefined));
  nbCache.set(cells, nb);
  return nb;
}

/* ------------------------------------------------------------------ */
/* Sector types                                                         */
/* ------------------------------------------------------------------ */

/**
 * kind = what the sector multiplies: 'systems' / 'blueprints' / 'cores' = prestige gain, 'prod' = production.
 * base = effect of one sector without neighbours (tune.js mapBase), color/short for the UI.
 */
export const SECTOR = {
  home: { name: 'Heimat', short: 'H', color: '#38d6f2', desc: 'Dein Ausgangspunkt. Von hier aus wächst das Gebiet.' },
  haufen: { name: 'Sternhaufen', short: 'S', color: '#f2c14e', kind: 'systems', effect: 'Sternsystem-Gewinn', desc: 'Dichter Sternhaufen. Mehr Sterne pro Expansion.' },
  nebel: { name: 'Nebel', short: 'N', color: '#ff7eb6', kind: 'blueprints', effect: 'Blaupausen-Gewinn', desc: 'Gaswolke voller Rohstoffe. Mehr Blaupausen pro Replikation.' },
  pulsar: { name: 'Pulsar', short: 'P', color: '#5ef2c0', kind: 'prod', effect: 'Produktion', desc: 'Schneller Taktgeber. Die gesamte Produktion steigt und Sondenbefehle laden schneller nach.' },
  loch: { name: 'Schwarzes Loch', short: 'L', color: '#c9c9ff', kind: 'cores', effect: 'Quantenkern-Gewinn', desc: 'Sehr dicht, sehr still. Mehr Quantenkerne pro Singularität.' },
  ruine: { name: 'Ruine', short: 'R', color: '#c3a57a', kind: 'prod', effect: 'Produktion', desc: 'Überreste von etwas Altem. Einmalig ein Eintrag in der Chronik, dauerhaft ein kleiner Bonus.' },
  anomalie: { name: 'Anomalie', short: 'A', color: '#ff8a4c', kind: 'prod', effect: 'Produktion', desc: 'Hier stimmt etwas nicht. Bei der Ankunft entsteht eine Anomalie, die auf dich wartet. Dazu ein kleiner Produktionsbonus.' },
  echo: { name: 'Echo', short: 'E', color: '#9b8cff', desc: 'Besetzt. Nicht erschließbar.' },
};
/** Order of the effect types in lists. */
export const SECTOR_ORDER = ['haufen', 'nebel', 'pulsar', 'loch', 'ruine', 'anomalie'];
export const RUIN_VARIANTS = 4;

/* ------------------------------------------------------------------ */
/* State                                                                */
/* ------------------------------------------------------------------ */

/** Default `state.rep2` (def.extraState). A fresh game picks a random seed once; the map is generated when Akt II starts. */
export function rep2State() {
  return {
    rep2: {
      act2: false,
      act2At: 0, // play time at the start of Akt II
      anchor: 0, // log10(Sternsysteme best) at that moment: the map's price level (tune.js mapCost*)
      rng: { seed: newSeed() },
      ruins: [], // variants of the claimed Ruinen in claim order (story entries)
      map: { radius: 0, seed: 0, claimed: 0, occupied: 0, trip: null, cells: [] }, // trip: { i, left, dur } while an Erschliessung runs
      mut: mutState(), // Mutationen (mutations.js), from Akt II on
      cmd: cmdState(), // Sondenbefehle (commands.js): unlock flag
      ano: anoState(), // Anomalien (anomalies.js)
    },
  };
}

/** Migration 2 -> 3: a stable seed from the creation time, so the same save always gets the same map. */
export function migrateToRep2(data) {
  const created = data.time && Number.isFinite(data.time.created) ? data.time.created : 0;
  const seed = toSeed(Math.floor(created / 1000) * 2654435761 + 12345);
  data.rep2 = { ...(data.rep2 || {}), rng: { seed } };
  data.v = 3;
  return data;
}

const R2 = (g) => g.state.rep2;
export const mapOf = (g) => g.state.rep2.map;
export const mapCells = (g) => g.state.rep2.map.cells;
export const act2Active = (g) => !!(g.state.rep2 && g.state.rep2.act2);
export const claimedCount = (g) => (act2Active(g) ? g.state.rep2.map.claimed : 0);
export const occupiedCount = (g) => (act2Active(g) ? g.state.rep2.map.occupied : 0);
/** Free sectors that are neither own nor taken by the Echo (the initial Echo cell is not part of the map's claimable total). */
export const freeCount = (g) => mapCells(g).filter((c) => !c.own && !c.echo).length;

/* ------------------------------------------------------------------ */
/* Generation                                                           */
/* ------------------------------------------------------------------ */

/** Number of same-type neighbour pairs among the effect types (a rough measure of how clustered a layout is). */
function clustering(types, nb) {
  let pairs = 0;
  for (let i = 0; i < types.length; i++) {
    if (!SECTOR[types[i]] || !SECTOR[types[i]].kind) continue;
    for (const j of nb[i]) if (j > i && types[j] === types[i]) pairs++;
  }
  return pairs;
}

/**
 * Build a map from the seeded RNG (consumes `rng`): the Echo sits on a random edge cell, the other cells get the type mix of
 * tune.js mapMix (shuffled; the best of `mapTries` shuffles by neighbour clusters is kept, so adjacency bonuses are possible on every map).
 * Cells: { q, r, type, own: 0|1, echo: 0|1|2 (1 = the Echo's first cell, 2 = taken later), seen: 0|1, v?: Ruine variant }.
 */
export function generateMap(rng, radius = T.mapRadius) {
  const disc = hexDisc(radius);
  const cells = disc.map((c) => ({ q: c.q, r: c.r, type: 'home', own: 0, echo: 0, seen: 0 }));
  const nb = neighbors(cells);
  cells[0].own = 1;
  const edge = cells.map((c, i) => i).filter((i) => hexDist(cells[i], { q: 0, r: 0 }) === radius);
  const echoAt = edge[rngInt(rng, 0, edge.length - 1)];
  cells[echoAt].type = 'echo';
  cells[echoAt].echo = 1;
  const rest = cells.map((c, i) => i).filter((i) => i !== 0 && i !== echoAt);
  const pool = [];
  for (const [type, n] of Object.entries(T.mapMix)) for (let k = 0; k < n; k++) pool.push(type);
  while (pool.length < rest.length) pool.push('haufen'); // robust against a mix that is too small (tune.js)
  pool.length = rest.length;
  let best = null;
  for (let k = 0; k < T.mapTries; k++) {
    const types = Array(cells.length).fill('home');
    types[echoAt] = 'echo';
    rngShuffle(rng, pool).forEach((t, n) => (types[rest[n]] = t));
    const score = clustering(types, nb);
    if (!best || score > best.score) best = { types, score };
  }
  best.types.forEach((t, i) => (cells[i].type = t));
  // every Ruine has its own story variant
  const variants = rngShuffle(rng, [...Array(RUIN_VARIANTS).keys()]);
  let v = 0;
  for (const c of cells) if (c.type === 'ruine') c.v = variants[v++ % RUIN_VARIANTS];
  return { radius, seed: toSeed(Math.floor(rngRoll(rng) * 4294967296)), claimed: 0, occupied: 0, trip: null, cells };
}

/* ------------------------------------------------------------------ */
/* Fog, claiming, cost                                                  */
/* ------------------------------------------------------------------ */

/** Does the cell touch own territory? */
export function nextToOwn(cells, i) {
  return neighbors(cells)[i].some((j) => cells[j].own);
}

/** Is the cell's type visible? Own cells, cells next to own territory, cells the Echo took, revealed cells (Tiefenscan later). */
export function isVisible(cells, i) {
  const c = cells[i];
  return !!(c.own || c.echo === 2 || c.seen || nextToOwn(cells, i));
}

/** Where the Echo's first cell is, or -1. */
export const echoStart = (cells) => cells.findIndex((c) => c.echo === 1);
/** Has the player seen the Echo (its first cell is visible, or it has taken a cell)? */
export const echoSighted = (g) => {
  if (!act2Active(g)) return false;
  const cells = mapCells(g);
  const i = echoStart(cells);
  return (i >= 0 && isVisible(cells, i)) || mapOf(g).occupied > 0;
};

/** log10 of the price of sector number n+1 (n = sectors claimed so far). */
export const costLog = (g, n = claimedCount(g)) => R2(g).anchor + T.mapCostOffset + T.mapCostStep * n + Math.log10(mutMapCost(g));
/** Price of the next sector in Sternsysteme (a whole number). */
export function claimCost(g, n = claimedCount(g)) {
  return Decimal.pow(10, costLog(g, n)).ceil();
}

/** { ok, reason } with reason: 'inactive' | 'own' | 'echo' | 'fog' | 'trip' (an Erschliessung is running) | 'cost'. */
export function canClaim(g, i) {
  if (!act2Active(g)) return { ok: false, reason: 'inactive' };
  const cells = mapCells(g);
  const c = cells[i];
  if (!c || c.type === 'home' || c.own) return { ok: false, reason: 'own' };
  if (c.echo) return { ok: false, reason: 'echo' };
  if (!nextToOwn(cells, i)) return { ok: false, reason: 'fog' };
  if (mapOf(g).trip) return { ok: false, reason: 'trip' };
  if (!g.canAfford('systems', claimCost(g))) return { ok: false, reason: 'cost' };
  return { ok: true, reason: '' };
}

/** Indices of the cells that could be claimed if there were enough Sternsysteme. */
export function claimable(g) {
  if (!act2Active(g)) return [];
  const cells = mapCells(g);
  const trip = mapOf(g).trip;
  return cells.map((c, i) => i).filter((i) => !cells[i].own && !cells[i].echo && cells[i].type !== 'home' && !(trip && trip.i === i) && nextToOwn(cells, i));
}

/** Duration (s) of the Erschliessung of the next sector: grows with the number of sectors claimed so far. */
export const tripSecs = (g, n = claimedCount(g)) => Math.round(T.mapTripBase * Math.pow(T.mapTripGrow, n) * mutTrip(g));
/** The running Erschliessung: { i, left, dur } or null. */
export const tripOf = (g) => (act2Active(g) ? mapOf(g).trip : null);

/** Claim a sector: pays Sternsysteme (current amount) and starts the Erschliessung. The sector counts on arrival (arrive). Returns false when not possible. */
export function claim(g, i) {
  if (!canClaim(g, i).ok) return false;
  const m = mapOf(g);
  const cost = claimCost(g);
  g.spend('systems', cost);
  const dur = tripSecs(g);
  m.trip = { i, left: dur, dur };
  g.plog('map', `Erschließung: ${SECTOR[m.cells[i].type].name} (${D(cost).toExponential(1)} Sys, ${dur} s)`);
  g.emit('map-trip', { i, type: m.cells[i].type, dur });
  return true;
}

/** The probe arrives: the sector is claimed (bonus, story, Echo occupation). */
export function arrive(g) {
  const m = mapOf(g);
  if (!m.trip) return false;
  const c = m.cells[m.trip.i];
  m.trip = null;
  c.own = 1;
  m.claimed += 1;
  if (c.type === 'ruine') R2(g).ruins.push(c.v ?? 0);
  g.plog('map', `Sektor ${m.claimed}: ${SECTOR[c.type].name}`);
  g.refresh();
  g.emit('map-claim', { i: m.cells.indexOf(c), type: c.type, n: m.claimed });
  while (m.occupied < Math.floor(m.claimed / T.mapEchoEvery)) {
    const taken = echoOccupy(g);
    if (taken < 0) break;
  }
  return true;
}

/** Advance the running Erschliessung (hooks.onTick; also during offline catch-up). */
export function mapTick(g, dt) {
  const r = g.state.rep2;
  if (!r.act2 || !r.map.trip) return;
  // hooks.tripSpeed: time-limited effects (Übertakten, Gezeitenwelle) make the probe fly faster; dt may be a large offline step
  const speed = g.hooks.tripSpeed ? g.hooks.tripSpeed(g, dt) : 1;
  r.map.trip.left -= dt * speed;
  if (r.map.trip.left <= 0) arrive(g);
}

/** Cut `secs` off the running Erschliessung (Tiefenscan, Zeitriss). Returns the seconds really saved. */
export function trimTrip(g, secs) {
  const trip = tripOf(g);
  if (!trip || !(secs > 0)) return 0;
  const cut = Math.min(secs, Math.max(0, trip.left));
  trip.left -= cut;
  return cut;
}

/** Reveal the `n` fogged cells nearest to own territory (the `seen` flag, Tiefenscan). Returns the indices revealed. */
export function revealFog(g, n) {
  if (!act2Active(g)) return [];
  const cells = mapCells(g);
  const ownCells = cells.filter((c) => c.own);
  const dist = (c) => Math.min(...ownCells.map((o) => hexDist(c, o)));
  const fogged = cells.map((c, i) => i).filter((i) => !cells[i].own && !isVisible(cells, i));
  fogged.sort((a, b) => dist(cells[a]) - dist(cells[b]) || a - b);
  const take = fogged.slice(0, n);
  for (const i of take) cells[i].seen = 1;
  if (take.length) g.refresh();
  return take;
}

/** Number of claimed sectors of one type. */
export const ownedOfType = (g, type) => (act2Active(g) ? mapCells(g).filter((c) => c.own && c.type === type).length : 0);

/**
 * Should the Singularität wait? It wipes the Sternsysteme stock: while sectors are left and the next one costs at most `mapHoldReach` times
 * the current stock, the Auto-Singularität (and the sim's player) keep the run, for at most `mapHoldMax` seconds of run time.
 */
export function holdSingularity(g) {
  if (!act2Active(g) || !claimable(g).length) return false;
  if (g.state.layers.singularity.runTime > T.mapHoldMax) return false;
  return claimCost(g).lte(g.get('systems').mul(T.mapHoldReach));
}

/* ------------------------------------------------------------------ */
/* The Echo                                                             */
/* ------------------------------------------------------------------ */

/** Would the free cells stay reachable from own territory (through free cells) if cell `skip` were taken? */
function staysConnected(cells, nb, skip, rsv = -1) {
  const seen = new Set();
  const stack = [];
  cells.forEach((c, i) => {
    if (c.own || i === rsv) {
      seen.add(i);
      stack.push(i);
    }
  });
  while (stack.length) {
    for (const j of nb[stack.pop()]) {
      if (seen.has(j) || j === skip || cells[j].echo) continue;
      seen.add(j);
      stack.push(j);
    }
  }
  return cells.every((c, i) => c.own || c.echo || i === skip || i === rsv || seen.has(i));
}

/**
 * The cell the Echo takes next (pure: depends on the map seed and the number of cells taken, not on other random draws), or -1.
 * Candidates: free cells next to Echo territory; if there are none, the free edge cell closest to the Echo.
 * Cells whose loss would cut other free cells off from the player are skipped, so all other free cells always stay claimable.
 */
export function echoChoice(m) {
  const cells = m.cells;
  const nb = neighbors(cells);
  const rsv = m.trip ? m.trip.i : -1; // the sector the probe is flying to counts as taken
  const free = cells.map((c, i) => i).filter((i) => !cells[i].own && !cells[i].echo && i !== rsv);
  if (!free.length) return -1;
  const safe = free.filter((i) => staysConnected(cells, nb, i, rsv));
  const pool = safe.length ? safe : free;
  const echoCells = cells.map((c, i) => i).filter((i) => cells[i].echo);
  const adjacent = pool.filter((i) => nb[i].some((j) => cells[j].echo));
  let cand = adjacent;
  if (!cand.length) {
    const d = (i) => Math.min(...echoCells.map((j) => hexDist(cells[i], cells[j])));
    const ring = (i) => hexDist(cells[i], { q: 0, r: 0 });
    const score = (i) => d(i) * 10 - ring(i); // nearest to the Echo, the outer ring first
    const lo = Math.min(...pool.map(score));
    cand = pool.filter((i) => score(i) === lo);
  }
  const [v] = rngNext(m.seed + m.occupied * 7919);
  return cand[Math.floor(v * cand.length)];
}

/** The Echo takes a cell. Returns its index or -1. */
export function echoOccupy(g) {
  const m = mapOf(g);
  const i = echoChoice(m);
  if (i < 0) return -1;
  const c = m.cells[i];
  c.echo = 2;
  m.occupied += 1;
  g.plog('map', `Das Echo besetzt einen Sektor (${m.occupied})`);
  g.refresh();
  g.emit('echo-occupy', { i, n: m.occupied });
  return i;
}

/* ------------------------------------------------------------------ */
/* Effects                                                              */
/* ------------------------------------------------------------------ */

/** Own neighbours of the same type, capped (the cell's type must have an effect). */
export function sameNeighbors(cells, i) {
  const t = cells[i].type;
  return Math.min(T.mapAdjMax, neighbors(cells)[i].filter((j) => cells[j].own && cells[j].type === t).length);
}

/** Effect of one claimed sector: base ^ (1 + mapAdjStep * same-type neighbours). */
export function sectorMult(cells, i, step = T.mapAdjStep) {
  const c = cells[i];
  const base = T.mapBase[c.type];
  if (!base) return ONE;
  return D(base).pow(1 + step * sameNeighbors(cells, i));
}

/** Share of the effect exponent a same-type neighbour adds (a mutation can raise it). */
export const adjStep = (g) => T.mapAdjStep + mutAdj(g);

/** Product of all claimed sectors of one type. */
export function typeMult(g, type) {
  if (!act2Active(g)) return ONE;
  const cells = mapCells(g);
  const step = adjStep(g);
  let m = ONE;
  for (let i = 0; i < cells.length; i++) if (cells[i].own && cells[i].type === type) m = m.mul(sectorMult(cells, i, step));
  return m;
}

/** Gain multiplier of a prestige currency ('systems' | 'blueprints' | 'cores'). */
export function gainMult(g, kind) {
  let m = ONE;
  for (const t of SECTOR_ORDER) if (SECTOR[t].kind === kind) m = m.mul(typeMult(g, t));
  return m;
}

/**
 * Gain factor of the map for a prestige currency, for layer.postMult (applied AFTER the softcap, def.js postGain). Factors above 1 ripen with the run time
 * like those of the mutations (a stack of gain factors must not make short runs optimal).
 */
export const mapGain = (g, kind) => D(ripen(g, kind, gainMult(g, kind).toNumber()));

/** What claiming sector i would do to its type's multiplier (also counts the boost it gives to same-type neighbours): { before, after }. */
export function previewClaim(g, i) {
  const c = mapCells(g)[i];
  const before = typeMult(g, c.type);
  c.own = 1;
  const after = typeMult(g, c.type);
  c.own = 0;
  return { before, after };
}

/** Labeled production parts for globalParts (only types that do something). */
export function productionParts(g) {
  const parts = [];
  for (const [t, label] of [['pulsar', 'Pulsare'], ['ruine', 'Ruinen'], ['anomalie', 'Anomalien']]) {
    const m = typeMult(g, t);
    if (m.gt(1)) parts.push([label, m]);
  }
  return parts;
}

/** Rows for the bonus list: [{ type, name, effect, count, mult, adj }] for every type with a claimed sector. */
export function bonusRows(g) {
  if (!act2Active(g)) return [];
  const cells = mapCells(g);
  const rows = [];
  for (const t of SECTOR_ORDER) {
    const own = cells.map((c, i) => i).filter((i) => cells[i].own && cells[i].type === t);
    if (!own.length) continue;
    rows.push({ type: t, name: SECTOR[t].name, effect: SECTOR[t].effect, count: own.length, mult: typeMult(g, t), adj: own.reduce((a, i) => a + sameNeighbors(cells, i), 0) });
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Auto-Erkundung (the sim's player calls exactly this)                  */
/* ------------------------------------------------------------------ */

/** Rise of `objective(g)` (log10 scale, def.js repObjective) when sector i is claimed. */
export function claimValue(g, i, objective) {
  const c = mapCells(g)[i];
  const before = objective(g);
  c.own = 1;
  g.refresh();
  let after;
  try {
    after = objective(g);
  } finally {
    c.own = 0;
    g.refresh();
  }
  return after - before;
}

/** The affordable sector with the best value per cost (all sectors cost the same at a given time, so: the best value), or -1. */
export function bestClaim(g, objective) {
  if (!act2Active(g)) return -1;
  const cost = Math.max(1, costLog(g));
  let best = -1;
  let bestV = -Infinity;
  for (const i of claimable(g)) {
    if (!canClaim(g, i).ok) continue;
    const v = claimValue(g, i, objective) / cost;
    if (v > bestV + 1e-12) {
      bestV = v;
      best = i;
    }
  }
  return best;
}

/** Claim the best affordable sector; true if one was claimed. Used by the Auto-Erkundung and by the sim's player. */
export function autoClaim(g, objective) {
  const i = bestClaim(g, objective);
  return i >= 0 ? claim(g, i) : false;
}

/* ------------------------------------------------------------------ */
/* Akt II entry                                                         */
/* ------------------------------------------------------------------ */

/** Version 1 is finished: Ereignishorizont researched and all challenges done (same as the closing story entry st_end). */
export const v1Done = (g) => g.upgActive('z_horizont') && g.chDoneCount() >= g.def.challenges.length;

/** Starts Akt II once, as soon as version 1 is finished (hooks onLoad / onTick). Returns true on the tick it starts. */
export function act2Check(g) {
  const r = R2(g);
  if (r.act2 || !v1Done(g)) return false;
  const best = g.state.cur.systems.best;
  r.act2 = true;
  r.act2At = g.state.time.played;
  r.anchor = T.mapAnchorFixed != null ? T.mapAnchorFixed : best.m > 0 ? Math.max(0, T.mapAnchorSlope * best.log10()) : 0;
  r.map = generateMap(r.rng);
  mutReset(g);
  anoReset(g);
  g.plog('map', `Akt II beginnt, Anker 1e${r.anchor.toFixed(2)}`);
  g.emit('act2', {});
  return true;
}
