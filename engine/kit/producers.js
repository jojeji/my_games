// Parallel producers ("Quellen"): every slot produces the currency DIRECTLY (no chain), so slots do not feed each other.
// Instead slots can boost each other through synergies ("+1 % per owned Eule"). Cost per purchase grows geometrically,
// every threshold in `bundleAt` owned multiplies a slot's output by `bundleMult`.
//
// def.producers = [{
//   id, currency, layer, bundleAt: [10, 25, ...], bundleMult: 2,
//   label?(g, i) -> { name, desc }       // era-themed names for the same mechanical slot
//   slots: [{ name, desc, baseCost, costMult (ratio per purchase), rate (per second per unit),
//             synergies?: [{ from: slotIndex, per: 0.01 }] , unlock?(g) }]
// }]
// hooks: prodGlobalMult(g, p) Decimal (applied to the sum), prodSlotMult(g, p, i), prodCostDiv(g, p, i),
//        prodSynergyScale(g) number, prodBundleAt(g, p) array, prodBundleMult(g, p), prodLiveMult(g, dt) Decimal
//        (time-limited effects such as spells; dt = 0 asks for the momentary value used for display).
import { Decimal, D, ONE, ZERO } from '../decimal.js';

export const producerMethods = {
  prodCount(pid, i) {
    return this.state.prod[pid][i].n;
  },

  prodLabel(p, i) {
    const l = p.label ? p.label(this, i) : null;
    return { name: l?.name || p.slots[i].name, desc: l?.desc ?? p.slots[i].desc ?? '' };
  },

  prodBundleList(p) {
    return this.hooks.prodBundleAt ? this.hooks.prodBundleAt(this, p) : p.bundleAt || [];
  },

  /** Number of bundle thresholds reached with n owned. */
  prodBundleSteps(p, n) {
    let k = 0;
    for (const t of this.prodBundleList(p)) if (n >= t) k++;
    return k;
  },

  prodNextBundle(p, n) {
    for (const t of this.prodBundleList(p)) if (n < t) return t;
    return null;
  },

  /** Synergy factor of slot i (>= 1). */
  prodSynergy(p, i) {
    const syn = p.slots[i].synergies;
    if (!syn || !syn.length) return 1;
    const scale = this.hooks.prodSynergyScale ? this.hooks.prodSynergyScale(this) : 1;
    let sum = 0;
    for (const s of syn) sum += s.per * this.state.prod[p.id][s.from].n;
    return 1 + sum * scale;
  },

  prodCostStart(p, i) {
    const div = this.hooks.prodCostDiv ? this.hooks.prodCostDiv(this, p, i) : ONE;
    return D(p.slots[i].baseCost).div(div);
  },

  prodRatio(p, i) {
    return D(p.slots[i].costMult);
  },

  prodBulkCost(p, i, k) {
    return Decimal.sumGeometricSeries(k, this.prodCostStart(p, i), this.prodRatio(p, i), this.state.prod[p.id][i].n);
  },

  prodMaxAffordable(p, i) {
    const owned = this.state.prod[p.id][i].n;
    const have = this.state.cur[p.currency].amount;
    const start = this.prodCostStart(p, i);
    const ratio = this.prodRatio(p, i);
    if (have.lt(start.mul(ratio.pow(owned)))) return 0;
    let k = Decimal.affordGeometricSeries(have, start, ratio, owned).toNumber();
    if (!Number.isFinite(k) || k < 0) return 0;
    k = Math.min(Math.floor(k), 1e5);
    while (k > 0 && this.prodBulkCost(p, i, k).gt(have)) k--;
    return k;
  },

  /** What the buy button shows for a mode ('1' | '10' | 'max'). */
  prodBuyInfo(p, i, mode) {
    const count = mode === 'max' ? Math.max(1, this.prodMaxAffordable(p, i)) : Number(mode) || 1;
    const cost = this.prodBulkCost(p, i, count);
    return { count, cost, affordable: this.state.cur[p.currency].amount.gte(cost) };
  },

  prodVisible(p, i) {
    const s = p.slots[i];
    if (s.unlock && !s.unlock(this)) return false;
    return i === 0 || this.state.prod[p.id][i].n > 0 || this.state.prod[p.id][i - 1].n > 0;
  },

  prodBuy(pid, i, k) {
    const p = this.producerById[pid];
    if (!this.prodVisible(p, i)) return 0;
    const n = k === 'max' ? this.prodMaxAffordable(p, i) : Number(k);
    if (!(n > 0)) return 0;
    if (!this.spend(p.currency, this.prodBulkCost(p, i, n))) return 0;
    this.state.prod[pid][i].n += n;
    this.refresh();
    this.emit('producer', { id: pid, i, n });
    return n;
  },

  /** Spend everything sensibly: repeatedly buy the slot with the best payback (cost per unit output). Returns purchases. */
  prodBuyAll(pid) {
    const p = this.producerById[pid];
    let total = 0;
    for (let iter = 0; iter < 80; iter++) {
      let best = -1;
      let bestScore = null;
      for (let i = 0; i < p.slots.length; i++) {
        if (!this.prodVisible(p, i)) continue;
        const unit = this.cache.prod[pid].unit[i];
        const price = this.prodBulkCost(p, i, 1);
        if (price.gt(this.state.cur[p.currency].amount)) continue;
        const score = unit.m === 0 ? Infinity : price.div(unit).log10();
        if (bestScore === null || score < bestScore) {
          best = i;
          bestScore = score;
        }
      }
      if (best < 0) break;
      const owned = this.state.prod[pid][best].n;
      const k = Math.max(1, Math.min(this.prodMaxAffordable(p, best), Math.ceil(owned * 0.2)));
      total += this.prodBuy(pid, best, k);
    }
    return total;
  },

  /** Recompute cached unit rates and totals. */
  refreshProducers() {
    for (const p of this.def.producers) {
      const st = this.state.prod[p.id];
      const bundleMult = this.hooks.prodBundleMult ? this.hooks.prodBundleMult(this, p) : p.bundleMult ?? 2;
      const global = this.hooks.prodGlobalMult ? this.hooks.prodGlobalMult(this, p) : ONE;
      const c = this.cache.prod[p.id] || (this.cache.prod[p.id] = { unit: [], rate: [], syn: [], steps: [] });
      let sum = ZERO;
      for (let i = 0; i < p.slots.length; i++) {
        const steps = this.prodBundleSteps(p, st[i].n);
        const syn = this.prodSynergy(p, i);
        let u = D(p.slots[i].rate).mul(syn);
        if (steps > 0) u = u.mul(Decimal.pow(bundleMult, steps));
        if (this.hooks.prodSlotMult) u = u.mul(this.hooks.prodSlotMult(this, p, i));
        c.unit[i] = u;
        c.syn[i] = syn;
        c.steps[i] = steps;
        c.rate[i] = u.mul(st[i].n).mul(global);
        sum = sum.add(c.rate[i]);
      }
      c.total = sum;
      c.global = global;
      c.bundleMult = bundleMult;
    }
  },

  produceProducers(dt) {
    for (const p of this.def.producers) {
      const total = this.cache.prod[p.id].total;
      if (total.m === 0) continue;
      const live = this.hooks.prodLiveMult ? this.hooks.prodLiveMult(this, dt) : ONE;
      this.add(p.currency, total.mul(live).mul(dt));
    }
  },

  /** Momentary income per second of a currency (including time-limited effects). */
  prodIncome(currencyId) {
    let sum = ZERO;
    for (const p of this.def.producers || []) {
      if (p.currency !== currencyId) continue;
      const live = this.hooks.prodLiveMult ? this.hooks.prodLiveMult(this, 0) : ONE;
      sum = sum.add(this.cache.prod[p.id].total.mul(live));
    }
    return sum;
  },
};
