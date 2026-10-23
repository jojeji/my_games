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
    return !!u.excl && u.excl.some((r) => this.upgLevel(r) > 0);
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
