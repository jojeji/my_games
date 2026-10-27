// Number & time formatting. German decimal comma, German-ish suffixes.
import { safeDecimal } from './decimal.js';

export const NOTATIONS = {
  standard: 'Standard (K, Mio, Mrd …)',
  scientific: 'Wissenschaftlich (1,23e45)',
  engineering: 'Ingenieur (123e42)',
};

// index = exponent / 3
const SUFFIXES = ['', 'K', 'Mio', 'Mrd', 'Bio', 'Brd', 'Tri', 'Trd', 'Quad', 'Qrd', 'Quin', 'Qid'];
const STANDARD_MAX_EXP = SUFFIXES.length * 3; // 36: from 1e36 on we fall back to scientific

let currentNotation = 'standard';
export function setNotation(n) {
  if (NOTATIONS[n]) currentNotation = n;
}
export function getNotation() {
  return currentNotation;
}

const comma = (s) => s.replace('.', ',');

/** Number of decimals so that roughly `sig` significant digits are shown for a value in [1,1000). */
function decimalsFor(v, sig) {
  const intDigits = v < 10 ? 1 : v < 100 ? 2 : 3;
  return Math.max(0, sig - intDigits);
}

function formatSmall(n, sig) {
  if (n === 0) return '0';
  const a = Math.abs(n);
  if (Number.isInteger(n)) return String(n);
  if (a < 0.001) return comma(n.toExponential(1));
  if (a < 1) return comma(n.toFixed(sig));
  return comma(n.toFixed(decimalsFor(a, sig)));
}

/**
 * Format a number/Decimal.
 * @param {*} x  number | string | Decimal
 * @param {{notation?:string, sig?:number}} [opts]  sig = significant digits (default 3)
 */
export function formatNumber(x, opts = {}) {
  const notation = opts.notation || currentNotation;
  const sig = opts.sig || 3;
  const d = safeDecimal(x);
  if (d.mantissa === 0) return '0';
  if (d.sign() < 0) return '-' + formatNumber(d.neg(), opts);
  if (d.exponent >= 9e15) return '∞';
  if (d.exponent < 3) return formatSmall(d.toNumber(), sig);

  let e = d.exponent;
  const m = d.mantissa;

  if (notation === 'standard' && e < STANDARD_MAX_EXP) {
    let idx = Math.floor(e / 3);
    let v = m * Math.pow(10, e - idx * 3); // 1 <= v < 1000
    let s = v.toFixed(decimalsFor(v, sig));
    if (parseFloat(s) >= 1000 && idx + 1 < SUFFIXES.length) {
      idx += 1;
      v = parseFloat(s) / 1000;
      s = v.toFixed(decimalsFor(v, sig));
    }
    return comma(s) + ' ' + SUFFIXES[idx];
  }

  if (notation === 'engineering') {
    const rem = ((e % 3) + 3) % 3;
    let eeOut = e - rem;
    const v = m * Math.pow(10, rem);
    let s = v.toFixed(decimalsFor(v, sig));
    if (parseFloat(s) >= 1000) {
      eeOut += 3;
      s = (1).toFixed(decimalsFor(1, sig));
    }
    return comma(s) + 'e' + eeOut;
  }

  // scientific (also fallback of standard beyond the suffix table)
  let s = m.toFixed(sig - 1);
  if (parseFloat(s) >= 10) {
    e += 1;
    s = (1).toFixed(sig - 1);
  }
  return comma(s) + 'e' + e;
}

/** Narrow variant for tight spots (header chips): the standard suffix sits right behind the number ("65,7Mio"). */
export function formatCompact(x, opts = {}) {
  return formatNumber(x, opts).replace(/ (?=[A-Za-z])/, '');
}

/** Counts (generator amounts etc.): exact integers while small. */
export function formatInt(x, opts = {}) {
  const d = safeDecimal(x);
  if (d.exponent < 6) return String(Math.floor(d.toNumber() + 1e-9));
  return formatNumber(d, opts);
}

export const formatMult = (x, opts) => '×' + formatNumber(x, opts);

/** Percent from a ratio, e.g. 0.256 -> "25,6 %". */
export function formatPercent(r, digits = 1) {
  return comma((r * 100).toFixed(digits)) + ' %';
}

/** Human readable duration in German. */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '∞';
  if (seconds < 0) seconds = 0;
  if (seconds < 10) return comma(seconds.toFixed(1)) + ' s';
  const s = Math.floor(seconds);
  if (s < 60) return s + ' s';
  const m = Math.floor(s / 60);
  if (m < 60) return m + ' Min ' + String(s % 60).padStart(2, '0') + ' s';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' Std ' + String(m % 60).padStart(2, '0') + ' Min';
  const dd = Math.floor(h / 24);
  return dd + ' d ' + (h % 24) + ' Std';
}

/**
 * Parse user input like "1e5", "1,5e3", "2500", "3 Mio" into a Decimal, or null.
 */
export function parseNumber(str) {
  if (typeof str !== 'string') return null;
  const t = str.trim().replace(/\s+/g, ' ').replace(',', '.');
  if (!t) return null;
  const m = t.match(/^([0-9.]+(?:e[+-]?\d+)?)\s*([A-Za-z]*)$/i);
  if (!m) return null;
  let mult = 1;
  if (m[2]) {
    const idx = SUFFIXES.findIndex((s) => s && s.toLowerCase() === m[2].toLowerCase());
    if (idx < 0) return null;
    mult = Math.pow(10, idx * 3);
  }
  const d = safeDecimal(m[1], null);
  if (!d) return null;
  return d.mul(mult);
}
