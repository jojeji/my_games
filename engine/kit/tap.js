// Tap/clicker mechanic with charges: each tap uses one charge and pays a burst; charges regenerate over time.
//
// def.tap = { currency, start?: initial charges, max(g) -> number, regen(g) -> seconds per charge, gain(g) -> Decimal }
// State: state.tap = { charges (float), n (taps so far) }. Autos may call g.tapDo(). Charges also refill while offline.
import { D, ZERO } from '../decimal.js';

export const tapMethods = {
  tapMax() {
    return Math.max(1, Math.floor(this.def.tap.max(this)));
  },

  tapRegenSec() {
    return Math.max(0.05, this.def.tap.regen(this));
  },

  tapGain() {
    return D(this.def.tap.gain(this));
  },

  tapCharges() {
    return Math.floor(this.state.tap.charges + 1e-9);
  },

  tapCan() {
    return this.state.tap.charges >= 1 - 1e-9;
  },

  /** Seconds until the next charge (0 when full). */
  tapNextIn() {
    const t = this.state.tap;
    if (t.charges >= this.tapMax()) return 0;
    return (1 - (t.charges - Math.floor(t.charges))) * this.tapRegenSec();
  },

  /** Use one charge. Returns the gained amount (Decimal) or null. */
  tapDo(auto = false) {
    if (!this.tapCan()) return null;
    const t = this.state.tap;
    const gain = this.tapGain();
    t.charges = Math.max(0, t.charges - 1);
    t.n += 1;
    this.add(this.def.tap.currency, gain);
    if (this.def.tap.onTap) this.def.tap.onTap(this, gain, auto);
    this.emit('tap', { gain, auto });
    return gain;
  },

  tapRefill() {
    this.state.tap.charges = this.tapMax();
  },

  tapTick(dt) {
    const t = this.state.tap;
    const max = this.tapMax();
    if (t.charges < max) t.charges = Math.min(max, t.charges + dt / this.tapRegenSec());
    else if (t.charges > max) t.charges = max;
  },
};
