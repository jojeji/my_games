// Upgrades (also used for research-tree nodes): cost per level, prerequisites,
// mutual exclusion, effect functions, keep-on-reset predicates.
import { D, ZERO } from '../decimal.js';

export const upgradeMethods = {
  upgLevel(id) {
    return this.state.upg[id] || 0;
  },

  upgMax(u) {
    return u.max ?? 1;
  },

  /** Cost of the next level. */
  upgCost(id) {
    const u = this.upgById[id];
    const lvl = this.upgLevel(id);
    return D(typeof u.cost === 'function' ? u.cost(lvl, this) : u.cost);
  },

  upgDisabled(u) {
    return this.hooks.upgradeDisabled ? !!this.hooks.upgradeDisabled(this, u) : false;
  },

  /** Prerequisites fulfilled (requires = all, requiresAny = at least one, require() = custom)? */
  upgRequirementsMet(u) {
    if (u.requires && !u.requires.every((r) => this.upgLevel(r) > 0)) return false;
    if (u.requiresAny && !u.requiresAny.some((r) => this.upgLevel(r) > 0)) return false;
    if (u.require && !u.require(this)) return false;
    return true;
  },

  /** Blocked by an owned mutually-exclusive node? */
  upgExcluded(u) {
    if (!u.excl || (this.hooks.upgradeExclusionOff && this.hooks.upgradeExclusionOff(this, u))) return false;
    return u.excl.some((r) => this.upgLevel(r) > 0);
  },

  /** Should the card be shown at all? */
  upgVisible(u) {
    return u.show ? !!u.show(this) : true;
  },

  upgMaxed(id) {
    return this.upgLevel(id) >= this.upgMax(this.upgById[id]);
  },

  upgCanBuy(id) {
    const u = this.upgById[id];
    if (this.upgMaxed(id) || this.upgDisabled(u) || this.upgExcluded(u) || !this.upgRequirementsMet(u)) return false;
    return this.canAfford(u.currency, this.upgCost(id));
  },

  upgBuy(id) {
    if (!this.upgCanBuy(id)) return false;
    const u = this.upgById[id];
    this.spend(u.currency, this.upgCost(id));
    this.state.upg[id] = this.upgLevel(id) + 1;
    this.refresh();
    this.emit('upgrade', { id });
    return true;
  },

  /** Buy repeatedly while affordable (for multi-level upgrades). Returns levels bought. */
  upgBuyMax(id) {
    let n = 0;
    while (n < 1000 && this.upgBuy(id)) n++;
    return n;
  },

  /** Effect value for the current level. Disabled upgrades behave like level 0. */
  upgEffect(id) {
    const u = this.upgById[id];
    const lvl = this.upgDisabled(u) ? 0 : this.upgLevel(id);
    return u.effect ? u.effect(lvl, this) : lvl;
  },

  /** Is the upgrade owned and active (not suppressed by a challenge)? */
  upgActive(id) {
    return this.upgLevel(id) > 0 && !this.upgDisabled(this.upgById[id]);
  },

  /** Buy every affordable upgrade of a group, cheapest first. Returns count. */
  upgBuyAll(group) {
    let bought = 0;
    for (;;) {
      let best = null;
      let bestCost = null;
      for (const u of this.def.upgrades) {
        if (u.group !== group || !this.upgCanBuy(u.id)) continue;
        const c = this.upgCost(u.id);
        if (!best || c.lt(bestCost)) {
          best = u;
          bestCost = c;
        }
      }
      if (!best) return bought;
      this.upgBuy(best.id);
      bought++;
    }
  },

  /** Upgrades of a group that could be bought if only the currency were there (requirements, exclusions, max level). */
  upgCandidates(group) {
    return this.def.upgrades.filter((u) => {
      if (u.group !== group || this.upgMaxed(u.id) || this.upgDisabled(u) || this.upgExcluded(u) || !this.upgRequirementsMet(u)) return false;
      return u.show ? !!u.show(this) : true;
    });
  },

  /**
   * Benefit of the next level of an upgrade: objective(g) is a game-supplied estimate on a log scale ("ln of how good the
   * state is": e.g. ln of the Erinnerungen gain per run). The level is applied temporarily, so every effect the game
   * implements is seen without extra code. Returns the increase of the objective (>= 0).
   */
  upgBenefit(id, objective, before = objective(this)) {
    const prev = this.state.upg[id];
    this.state.upg[id] = (prev || 0) + 1;
    this.refresh();
    let after;
    try {
      after = objective(this);
    } finally {
      if (prev === undefined) delete this.state.upg[id];
      else this.state.upg[id] = prev;
      this.refresh();
    }
    return Number.isFinite(after) && after > before ? after - before : 0;
  },

  /**
   * Value-based autobuyer for a group: buys what gives the most benefit per cost instead of the cheapest.
   *  - The best upgrade (by benefit / cost) among ALL candidates is the goal. If it is affordable it is bought.
   *  - If the goal is out of reach, cheaper upgrades are only bought as "side purchases" when they do not starve it:
   *    they must have a benefit, cost at most `sideFrac` of the goal's cost, and we must be far from the goal
   *    (currency below `reserveFrac` of its cost). Otherwise the currency is saved.
   * Deterministic. Returns the number of levels bought.
   */
  upgBuyBest(group, objective, { sideFrac = 0.15, reserveFrac = 0.5 } = {}) {
    let bought = 0;
    for (let guard = 0; guard < 200; guard++) {
      const cands = this.upgCandidates(group);
      if (!cands.some((u) => this.upgCanBuy(u.id))) return bought; // nothing affordable: no need to evaluate anything
      const before = objective(this);
      // Judging every candidate is expensive (one refresh each). When the last judgement ended with "buy nothing" and neither the
      // currency, an owned level nor the objective (rounded: it moves while production builds up) changed since, skip.
      const key = cands.map((u) => u.id + this.upgLevel(u.id)).join() + '|' + this.get(cands[0].currency).toString() + '|' + Math.round(before * 4);
      if (bought === 0 && this._upgIdle?.[group] === key) return 0;
      const rows = cands.map((u) => {
        const cost = this.upgCost(u.id);
        const c = Math.max(cost.toNumber(), 1e-9);
        return { u, cost, benefit: this.upgBenefit(u.id, objective, before), score: 0, afford: this.canAfford(u.currency, cost), c };
      });
      for (const r of rows) r.score = r.benefit / r.c;
      const better = (a, b) => (a.score !== b.score ? a.score > b.score : a.c < b.c);
      let goal = rows[0];
      for (const r of rows) if (better(r, goal)) goal = r;
      let pick = null;
      if (goal.afford) pick = goal;
      else {
        const money = this.get(goal.u.currency).toNumber();
        if (money < reserveFrac * goal.c) {
          for (const r of rows) if (r.afford && r.benefit > 0 && r.c <= sideFrac * goal.c && (!pick || better(r, pick))) pick = r;
        }
      }
      if (!pick || !this.upgBuy(pick.u.id)) {
        (this._upgIdle || (this._upgIdle = {}))[group] = key;
        return bought;
      }
      bought++;
    }
    return bought;
  },

  /**
   * Refund all upgrades of a group (research respec) and reset the lower layers
   * without awarding anything (prevents free re-allocation exploits).
   */
  upgRespec(group, resetLayer) {
    let refund = ZERO;
    let cur = null;
    for (const u of this.def.upgrades) {
      if (u.group !== group) continue;
      const lvl = this.upgLevel(u.id);
      cur = u.currency;
      for (let l = 0; l < lvl; l++) refund = refund.add(D(typeof u.cost === 'function' ? u.cost(l, this) : u.cost));
      delete this.state.upg[u.id];
    }
    if (cur) this.grant(cur, refund);
    this.resetBelow(resetLayer);
    this.emit('respec', { group, refund });
    this.refresh();
  },
};
