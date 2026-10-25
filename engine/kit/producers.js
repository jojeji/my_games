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

  /**
   * Income per second gained (Decimal, global multiplier included) if `k` more units of slot i were owned: the slot's own units,
   * the bundle multiplier(s) reached on the way (they double ALL owned units) and the synergy bonus on the slots that draw from it.
   */
  prodIncomeGain(p, i, k, synScale = 1) {
    const st = this.state.prod[p.id];
    const c = this.cache.prod[p.id];
    const n = st[i].n;
    const stepsNew = this.prodBundleSteps(p, n + k);
    let unit = c.unit[i];
    if (stepsNew !== c.steps[i]) unit = unit.mul(Decimal.pow(c.bundleMult, stepsNew - c.steps[i]));
    let d = unit.mul(n + k).sub(c.unit[i].mul(n));
    for (let j = 0; j < p.slots.length; j++) {
      if (j === i || !st[j].n) continue;
      let per = 0;
      for (const s of p.slots[j].synergies || []) if (s.from === i) per += s.per;
      if (per) d = d.add(c.unit[j].mul(st[j].n).mul(per * k * synScale).div(c.syn[j]));
    }
    return d.mul(c.global);
  },

  /**
   * Which purchase to aim for next. Every visible slot is judged by payback time (cost / income gained) PLUS the time it takes
   * to save up for it at the current income. Each slot is looked at for one unit and for "up to the next bundle threshold"
   * (the threshold multiplies everything owned, so a unit that looks poor on its own can be the best buy).
   * Returns { i, k, score, cost, payback, affordable, runnerUp } for the best plan (k = units of the plan, affordable = all k
   * affordable now, runnerUp = best score of any other slot, Infinity if none) or null when nothing is visible.
   * A plan that is not affordable means: save up for it.
   */
  prodChoose(pid, starts = null) {
    const p = this.producerById[pid];
    const st = this.state.prod[pid];
    const c = this.cache.prod[pid];
    const money = this.state.cur[p.currency].amount;
    const scale = this.hooks.prodSynergyScale ? this.hooks.prodSynergyScale(this) : 1;
    const P = c.total;
    const plans = [];
    for (let i = 0; i < p.slots.length; i++) {
      if (!this.prodVisible(p, i)) continue;
      const nb = this.prodNextBundle(p, st[i].n);
      const ks = nb !== null && nb - st[i].n > 1 ? [1, nb - st[i].n] : [1];
      let best = null;
      const start = starts ? starts[i] : this.prodCostStart(p, i);
      for (const k of ks) {
        const cost = Decimal.sumGeometricSeries(k, start, this.prodRatio(p, i), st[i].n);
        const delta = this.prodIncomeGain(p, i, k, scale);
        const affordable = cost.lte(money);
        const payback = delta.m === 0 ? Infinity : cost.div(delta).toNumber();
        const wait = affordable ? 0 : P.m === 0 ? Infinity : cost.sub(money).div(P).toNumber();
        const score = wait + payback;
        // ties (e.g. everything Infinity): the cheaper plan
        if (!best || score < best.score || (score === best.score && cost.lt(best.cost))) best = { i, k, score, cost, affordable, payback };
      }
      plans.push(best);
    }
    if (!plans.length) return null;
    let best = plans[0];
    for (const pl of plans) if (pl.score < best.score || (pl.score === best.score && pl.cost.lt(best.cost))) best = pl;
    let runnerUp = Infinity;
    for (const pl of plans) if (pl !== best && pl.score < runnerUp) runnerUp = pl.score;
    return { ...best, runnerUp };
  },

  /**
   * Spend sensibly (the in-game autobuyer and the sims use this): follow prodChoose. If the best plan is out of reach it is
   * saved up for instead of wasting the money on poorer slots (only single units of the planned slot are bought on the way).
   * Several units are bought in one go while the slot stays better than the runner-up. Returns units bought.
   */
  prodBuyAll(pid) {
    const p = this.producerById[pid];
    const money = () => this.state.cur[p.currency].amount;
    const st = this.state.prod[pid];
    let total = 0;
    for (let iter = 0; iter < 120; iter++) {
      // nothing affordable at all -> nothing to decide
      const starts = p.slots.map((_, i) => this.prodCostStart(p, i));
      let any = false;
      for (let i = 0; i < p.slots.length && !any; i++) {
        if (this.prodVisible(p, i) && starts[i].mul(this.prodRatio(p, i).pow(st[i].n)).lte(money())) any = true;
      }
      if (!any) break;
      const plan = this.prodChoose(pid, starts);
      if (!plan) break;
      const owned = this.state.prod[pid][plan.i].n;
      let k = 1;
      if (plan.affordable) {
        k = plan.k;
        if (plan.k === 1) {
          // buy on while this slot's payback stays below the runner-up's score (cost grows by `ratio` per unit)
          const r = this.prodRatio(p, plan.i).toNumber();
          let more = Infinity;
          if (Number.isFinite(plan.runnerUp) && plan.payback > 0 && r > 1) more = Math.floor(1 + Math.log(plan.runnerUp / plan.payback) / Math.log(r));
          else if (!Number.isFinite(plan.runnerUp)) more = Math.max(1, Math.ceil(owned * 0.2));
          k = Math.max(1, Math.min(more, this.prodMaxAffordable(p, plan.i)));
        }
      } else if (starts[plan.i].mul(this.prodRatio(p, plan.i).pow(st[plan.i].n)).gt(money())) {
        break; // save up
      }
      const bought = this.prodBuy(pid, plan.i, k);
      if (!bought) break;
      total += bought;
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
