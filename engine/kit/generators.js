// Tiered generators (Antimatter-Dimensions style): tier 0 produces a currency,
// tier n produces tier n-1. Cost grows geometrically per purchase and a bundle of
// `chain.bundle` purchases multiplies the tier's output by `bundleMult`.
import { Decimal, D, ONE, ZERO } from '../decimal.js';

export const generatorMethods = {
  chain(id) {
    return this.chainById[id];
  },

  gens(chainId) {
    return this.state.gens[chainId];
  },

  /** Cost of the very first purchase of this tier (after cost divisors). */
  genPriceStart(chain, i) {
    const div = this.hooks.genCostDiv ? this.hooks.genCostDiv(this, chain, i) : ONE;
    return D(chain.tiers[i].baseCost).div(div);
  },

  /** Per-purchase cost ratio. costMult is defined per bundle (e.g. 10 purchases). */
  genRatio(chain, i) {
    const pow = this.hooks.genGrowthPow ? this.hooks.genGrowthPow(this, chain) : 1;
    return Decimal.pow(D(chain.tiers[i].costMult), pow / chain.bundle);
  },

  /** Cost of the next `k` purchases of tier i. */
  genBulkCost(chain, i, k) {
    const owned = this.state.gens[chain.id][i].bought;
    return Decimal.sumGeometricSeries(k, this.genPriceStart(chain, i), this.genRatio(chain, i), owned);
  },

  /** Largest k so that the next k purchases are affordable. */
  genMaxAffordable(chain, i) {
    const owned = this.state.gens[chain.id][i].bought;
    const have = this.state.cur[chain.currency].amount;
    const start = this.genPriceStart(chain, i);
    const ratio = this.genRatio(chain, i);
    if (have.lt(start.mul(ratio.pow(owned)))) return 0;
    let k = Decimal.affordGeometricSeries(have, start, ratio, owned).toNumber();
    if (!Number.isFinite(k) || k < 0) return 0;
    k = Math.min(k, 1e7);
    // float safety: make sure the total really is affordable
    while (k > 0 && this.genBulkCost(chain, i, k).gt(have)) k--;
    return k;
  },

  /** What the buy button should show for a mode ('1' | '10' | 'max'). */
  genBuyInfo(chain, i, mode) {
    let count;
    if (mode === 'max') count = Math.max(1, this.genMaxAffordable(chain, i));
    else count = Number(mode) || 1;
    const cost = this.genBulkCost(chain, i, count);
    return { count, cost, affordable: this.state.cur[chain.currency].amount.gte(cost) };
  },

  /** Is the tier shown to the player (unlocked and the one below was bought)? */
  genVisible(chain, i) {
    if (i >= this.cache.maxTier[chain.id]) return false;
    const t = chain.tiers[i];
    if (t.unlock && !t.unlock(this)) return false;
    return i === 0 || this.state.gens[chain.id][i - 1].bought > 0;
  },

  /** Buy k (number) or 'max' of tier i. Returns number actually bought. */
  genBuy(chainId, i, k) {
    const chain = this.chainById[chainId];
    if (!this.genVisible(chain, i)) return 0;
    const n = k === 'max' ? this.genMaxAffordable(chain, i) : Number(k);
    if (!(n > 0)) return 0;
    const cost = this.genBulkCost(chain, i, n);
    if (!this.spend(chain.currency, cost)) return 0;
    const g = this.state.gens[chainId][i];
    g.bought += n;
    g.amount = g.amount.add(n);
    this.refresh();
    return n;
  },

  /** Buy as many as possible, highest tier first. Returns total count. */
  genBuyAllMax(chainId) {
    const chain = this.chainById[chainId];
    let total = 0;
    for (let i = chain.tiers.length - 1; i >= 0; i--) {
      if (this.genVisible(chain, i)) total += this.genBuy(chainId, i, 'max');
    }
    return total;
  },

  /** Production of all tiers for `dt` seconds (top tier first, so lower tiers see fresh amounts). */
  produce(dt) {
    for (const chain of this.def.chains || []) {
      const gs = this.state.gens[chain.id];
      const mult = this.cache.mult[chain.id];
      const maxT = this.cache.maxTier[chain.id];
      for (let i = maxT - 1; i >= 1; i--) {
        if (gs[i].amount.m === 0) continue;
        gs[i - 1].amount = gs[i - 1].amount.add(gs[i].amount.mul(mult[i]).mul(dt));
      }
      const rate = this.cache.rate[chain.id];
      if (rate.m !== 0) this.add(chain.currency, rate.mul(dt));
    }
  },

  /** Per-second output of tier i (what it creates per second, in units of the tier below / currency). */
  genRate(chainId, i) {
    const gs = this.state.gens[chainId];
    let r = gs[i].amount.mul(this.cache.mult[chainId][i]);
    if (i === 0) {
      const chain = this.chainById[chainId];
      if (this.hooks.genRate0) r = this.hooks.genRate0(this, chain, r);
    }
    return r;
  },

  /** Recompute cached multipliers and rates. Called every tick and after actions. */
  refreshGenerators() {
    const cache = this.cache;
    for (const chain of this.def.chains || []) {
      const hooks = this.hooks;
      const gs = this.state.gens[chain.id];
      const maxTier = Math.min(chain.tiers.length, hooks.genMaxTier ? hooks.genMaxTier(this, chain) : chain.tiers.length);
      cache.maxTier[chain.id] = maxTier;
      const bundleMult = hooks.bundleMult ? hooks.bundleMult(this, chain) : chain.bundleMult;
      // The global multiplier only scales the final output (tier 0 -> currency). Applying it to every
      // tier would compound it 8 times (tier n feeds tier n-1) and explode the economy.
      const global = hooks.genGlobalMult ? hooks.genGlobalMult(this, chain) : ONE;
      cache.global[chain.id] = global;
      const arr = cache.mult[chain.id] || (cache.mult[chain.id] = []);
      const own = cache.own[chain.id] || (cache.own[chain.id] = []); // multiplier without the global part (for display)
      for (let i = 0; i < chain.tiers.length; i++) {
        const steps = Math.floor(gs[i].bought / chain.bundle);
        let m = ONE;
        if (steps > 0 && bundleMult !== 1) m = m.mul(Decimal.pow(bundleMult, steps));
        if (hooks.genTierMult) m = m.mul(hooks.genTierMult(this, chain, i));
        own[i] = m;
        arr[i] = i === 0 ? m.mul(global) : m;
      }
      let r = gs[0].amount.mul(arr[0]);
      if (hooks.genRate0) r = hooks.genRate0(this, chain, r);
      cache.rate[chain.id] = r;
    }
  },

  /** Currency income per second for display. */
  incomePerSec(currencyId) {
    for (const chain of this.def.chains || []) {
      if (chain.currency === currencyId) return this.cache.rate[chain.id];
    }
    return ZERO;
  },
};
