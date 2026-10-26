// Shared helpers for the Psst! card data tools (no runtime deps).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
export const DATA = path.join(ROOT, 'games', 'psst', 'data');
export const RAW = process.env.PSST_RAW
  || '/tmp/claude-0/-home-user-my-games/863b4a33-09b1-5729-8298-874ede9459a0/scratchpad/psst-raw';

export const readJson = (p, fallback) => {
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
};

/** Stable slug of a Suchbegriff: ascii, lowercase, a-z0-9 and dashes. */
export function slug(s) {
  return s.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Crude German stem for the "shares a stem" check: lowercase, fold umlauts/ss,
 * strip common inflection and derivation suffixes. Not linguistically correct,
 * only meant to catch Hund/Hundehütte, Schnee/Schneemann, Lauf/laufen.
 */
export function stem(w) {
  let s = w.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z]/g, '');
  const suf = ['ungen', 'ischen', 'isches', 'ischer', 'lichen', 'liches', 'licher', 'erinnen', 'heiten', 'keiten',
    'ung', 'heit', 'keit', 'schaft', 'isch', 'lich', 'erin', 'ern', 'ens', 'est', 'ste', 'sten', 'er', 'en', 'es', 'em', 'e', 'n', 's', 't'];
  let changed = true;
  while (changed && s.length > 4) {
    changed = false;
    for (const x of suf) {
      if (s.length - x.length >= 4 && s.endsWith(x)) { s = s.slice(0, -x.length); changed = true; break; }
    }
  }
  return s;
}

/** Plural/singular-insensitive key used to detect duplicate Tabuwörter within a card. */
export function pluralKey(w) {
  let s = w.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss').replace(/[^a-z]/g, '');
  if (s.length >= 9 && s.endsWith('in')) s = s.slice(0, -2); // Schauspielerin -> Schauspieler
  for (const x of ['innen', 'en', 'er', 'e', 'n', 's']) {
    if (s.length - x.length >= 4 && s.endsWith(x)) { s = s.slice(0, -x.length); break; }
  }
  return s;
}

/**
 * True if Tabuwort `t` is too close to Suchbegriff `w`: equal, one contains the
 * other (compounds both ways) or they share a stem (min. 4 letters).
 */
export function sharesStem(w, t) {
  const a = w.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss').replace(/[^a-z ]/g, '');
  const b = t.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss').replace(/[^a-z ]/g, '');
  if (!a) return true;
  if (!b) return false; // purely numeric / symbolic Tabuwort (e.g. "007", "1492")
  // multi-word terms: compare token-wise
  const as = a.split(' ').filter(Boolean), bs = b.split(' ').filter(Boolean);
  for (const x of as) for (const y of bs) if (tokenClash(x, y)) return true;
  return false;
}
function tokenClash(x, y) {
  if (x === y) return true;
  const sx = stem(x), sy = stem(y);
  if (sx.length >= 4 && sy.length >= 4 && (sx === sy)) return true;
  if (sy.length >= 4 && x.includes(sy)) return true;
  if (sx.length >= 4 && y.includes(sx)) return true;
  // shared 5-letter prefix (Lauf/laufen, Schnee/Schneemann handled above)
  if (sx.length >= 5 && sy.length >= 5 && sx.slice(0, 5) === sy.slice(0, 5) && Math.min(sx.length, sy.length) <= 6) return true;
  return false;
}

/** Blocklist of offensive/adult/vulgar words. SUBSTR matches anywhere (lowercase), EXACT only as a whole word. */
export const BLOCK_SUBSTR = ['scheiß', 'scheiss', 'fick', 'fotze', 'porno', 'nutte', 'schlampe', 'bumsen', 'orgasm', 'erotik',
  'neger', 'nazi', 'hitler', 'holocaust', 'vergewalt', 'pädophil', 'suizid', 'selbstmord', 'kokain', 'heroin', 'hurensohn',
  'schwuchtel', 'zigeuner', 'kanake', 'kacke', 'kack', 'pisse', 'kotz', 'dildo', 'masturb', 'onanie', 'prostitu', 'bordell',
  'stripper', 'penis', 'vagina', 'pimmel', 'titten', 'wichs', 'folter', 'spast', 'sperma', 'vibrator'];
export const BLOCK_EXACT = new Set(['sex', 'hure', 'arsch', 'arschloch', 'mongo', 'busen', 'nackt', 'anal', 'sau', 'idiot', 'trottel',
  'penner', 'krüppel', 'bastard', 'drecksau', 'schwul', 'lesbe', 'nutte', 'tussi', 'nuttig', 'geil', 'bitch', 'fuck', 'shit']);

/** Returns the matching blocklist entry or null. Checks every token of the text. */
export function blocked(text) {
  const l = text.toLowerCase();
  for (const b of BLOCK_SUBSTR) if (l.includes(b)) return b;
  for (const tok of l.split(/[^a-zäöüß]+/)) if (BLOCK_EXACT.has(tok)) return tok;
  return null;
}

/** True if two Tabuwörter of one card are redundant: same plural key, or one is a word of the other ("Marty" / "Marty McFly"). */
export function redundant(a, b) {
  if (pluralKey(a) === pluralKey(b)) return true;
  const ta = a.toLowerCase().split(/\s+/), tb = b.toLowerCase().split(/\s+/);
  if (ta.length === tb.length) return false;
  const [short, long] = ta.length < tb.length ? [ta, tb] : [tb, ta];
  return short.every(x => long.includes(x)) && short.join('').length >= 4;
}
