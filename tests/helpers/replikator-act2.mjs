// Shared setup for the Replikator Akt II tests (commands, anomalies): a game that is in Akt II with a seeded map, without the sim.
import { createReplikator } from '../../games/replikator/logic.js';
import { generateMap, claim, arrive, claimable, canClaim } from '../../games/replikator/map.js';
import assert from 'node:assert/strict';

/** Akt II game with `n` sectors claimed (arrived at once), rich in Sternsysteme. `types`: force the type of every claimable cell. */
export function act2Game(n = 0, { seed = 5, type = null } = {}) {
  const g = createReplikator();
  const r = g.state.rep2;
  r.rng.seed = seed;
  r.act2 = true;
  r.act2At = 0;
  r.anchor = 5;
  r.map = generateMap(r.rng);
  r.ano.rng.seed = seed * 3 + 1;
  r.ano.on = false;
  r.mut.rng.seed = seed * 7 + 1;
  if (type) for (const c of r.map.cells) if (c.type !== 'home' && !c.echo) c.type = type;
  g.grant('systems', 1e60);
  for (let k = 0; k < n; k++) {
    const i = claimable(g).find((x) => canClaim(g, x).ok);
    claim(g, i);
    arrive(g);
  }
  g.refresh();
  return g;
}
/** Start an Erschliessung with `left` seconds to go. */
export function startTrip(g, left = 1000) {
  const i = claimable(g).find((x) => canClaim(g, x).ok);
  assert.ok(claim(g, i), 'trip starts');
  g.state.rep2.map.trip.left = left;
  g.state.rep2.map.trip.dur = Math.max(left, g.state.rep2.map.trip.dur);
  return i;
}
