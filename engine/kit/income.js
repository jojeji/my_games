// Rate-based currencies: a currency that simply grows with a per-second rate computed by the game (no generator chain).
//
// def.income = [{ currency, rate(g, dt) -> Decimal|number per second }]
// rate(g, dt): dt = length of the tick in progress (0 = momentary value for the display). A time-limited effect must use the
// time-weighted share of the step (g.spellFrac / own timers), so the large steps of the offline catch-up stay correct.
import { D, ZERO } from '../decimal.js';

export const incomeMethods = {
  /** Per-second rate of a currency (sum over all income entries). dt as above. */
  incomeRate(currencyId, dt = 0) {
    let r = ZERO;
    for (const x of this.def.income) if (x.currency === currencyId) r = r.add(D(x.rate(this, dt)));
    return r;
  },

  produceIncome(dt) {
    const done = new Set();
    for (const x of this.def.income) {
      if (done.has(x.currency)) continue;
      done.add(x.currency);
      const r = this.incomeRate(x.currency, dt);
      if (r.m !== 0) this.add(x.currency, r.mul(dt));
    }
  },
};
