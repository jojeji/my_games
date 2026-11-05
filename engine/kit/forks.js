// Forks: a row of the layer tree where the player picks ONE branch (the other one stays closed until the game opens it).
//
// def.forks = [{
//   id, row,                      // identity and tree row
//   options: [{ id, layer, name, blurb }],   // layer = id of the prestige layer of that branch
//   openWhen(g) -> bool,          // the choice is offered (until it is made)
//   secondWhen?(g) -> bool,       // the second branch may be played too (default: never)
//   reset: { currencies: [], nodes: [] }     // what a respec wipes: currencies (to their start), upgrades whose `node` is one of these ids, layer counters
// }]
// State: state.fork[id] = chosen option id or null. Respec (forkRespec) wipes the branch layers and resets the rows above the fork
// (like a prestige of the fork row without a reward); it never refunds. Events: 'fork-chosen', 'fork-respec'.
import { D } from '../decimal.js';

export const forkMethods = {
  forkDef(id) {
    return this.def.forks.find((f) => f.id === id);
  },

  forkChoice(id) {
    return this.state.fork[id] ?? null;
  },

  /** The choice is on offer (opened by the game, not made yet). */
  forkOffered(id) {
    const f = this.forkDef(id);
    return this.forkChoice(id) === null && !!f.openWhen(this);
  },

  forkOpen(id) {
    return this.forkChoice(id) !== null || !!this.forkDef(id).openWhen(this);
  },

  /** Is this option the chosen one (or, once the second branch is open, the other one)? */
  forkIs(id, opt) {
    const c = this.forkChoice(id);
    if (c === null) return false;
    return c === opt || this.forkSecondOpen(id);
  },

  forkSecondOpen(id) {
    const f = this.forkDef(id);
    return !!(f.secondWhen && f.secondWhen(this));
  },

  forkChoose(id, opt) {
    const f = this.forkDef(id);
    if (!this.forkOffered(id) || !f.options.some((o) => o.id === opt)) return false;
    this.state.fork[id] = opt;
    this.hook('onFork', id, opt);
    this.refresh();
    this.emit('fork-chosen', { id, opt });
    return true;
  },

  forkRespec(id) {
    const f = this.forkDef(id);
    if (this.forkChoice(id) === null) return false;
    const s = this.state;
    const nodes = new Set(f.reset?.nodes || f.options.map((o) => o.layer));
    for (const cid of f.reset?.currencies || []) {
      const start = D(this.currencyById[cid].start ?? 0);
      s.cur[cid] = { ...s.cur[cid], amount: start, run: D(0) };
    }
    for (const o of f.options) {
      const ls = s.layers[o.layer];
      ls.count = 0;
      ls.runTime = 0;
      ls.unlocked = false;
      if (this.layerById[o.layer].static) ls.units = 0;
    }
    for (const m of this.def.milestones || []) if (f.options.some((o) => o.layer === m.layer)) delete s.ms[m.id]; // the branch's milestones are earned again
    for (const u of this.def.upgrades) {
      if (nodes.has(u.node)) {
        delete s.upg[u.id];
        if (s.upgAt) delete s.upgAt[u.id];
      }
    }
    s.fork[id] = null;
    this.resetBelow(f.row);
    this.hook('afterReset', f.row);
    this.hook('onFork', id, null);
    this.refresh();
    this.emit('fork-respec', { id });
    return true;
  },
};
