// Thin wrapper around the vendored break_infinity.js so the rest of the code
// imports big numbers from a single place.
import Decimal from './vendor/break_infinity.js';

export { Decimal };

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);

/** Convert number | string | Decimal to Decimal (Decimals are returned as-is: treat them as immutable). */
export function D(x) {
  return x instanceof Decimal ? x : new Decimal(x);
}

export const isDecimal = (x) => x instanceof Decimal;

/** Like D() but never throws / never returns NaN: falls back to `fallback`. */
export function safeDecimal(x, fallback = ZERO) {
  try {
    const d = x instanceof Decimal ? x : new Decimal(x);
    if (Number.isNaN(d.mantissa) || Number.isNaN(d.exponent)) return fallback;
    return d;
  } catch {
    return fallback;
  }
}

export const dmax = (a, b) => (D(a).gte(b) ? D(a) : D(b));
export const dmin = (a, b) => (D(a).lte(b) ? D(a) : D(b));

/** 10^x for plain numbers (also fractional). */
export const pow10 = (x) => Decimal.pow(10, x);
