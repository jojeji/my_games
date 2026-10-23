// Persistence: localStorage (namespaced per game), export/import as base64 text, versioned migrations.
import { Decimal, safeDecimal, isDecimal } from './decimal.js';

const EXPORT_PREFIX = 'MGSAVE1';

/* ---------- JSON with Decimal support ---------- */

/** JSON.stringify that encodes Decimals as {"$D":"1e+25"}. */
export function stringify(obj) {
  return JSON.stringify(obj, function (key, value) {
    const raw = this[key];
    if (raw instanceof Decimal) return { $D: raw.toString() };
    return value;
  });
}

/** JSON.parse that revives {"$D":...} into Decimals (NaN-safe). */
export function parse(text) {
  return JSON.parse(text, (key, value) => {
    if (value && typeof value === 'object' && typeof value.$D === 'string') return safeDecimal(value.$D);
    return value;
  });
}

/* ---------- base64 (UTF-8 safe) ---------- */

export function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function fromBase64(b64) {
  const bin = atob(b64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* ---------- storage wrapper ---------- */

/** localStorage that never throws; falls back to an in-memory map. */
export function createStorage(backend) {
  const mem = new Map();
  let ls = backend;
  if (ls === undefined) {
    try {
      ls = typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      ls = null;
    }
  }
  return {
    get persistent() {
      return !!ls;
    },
    get(key) {
      try {
        if (ls) return ls.getItem(key);
      } catch {
        /* fall through */
      }
      return mem.has(key) ? mem.get(key) : null;
    },
    set(key, value) {
      try {
        if (ls) {
          ls.setItem(key, value);
          return true;
        }
      } catch {
        /* quota / private mode */
      }
      mem.set(key, value);
      return false;
    },
    remove(key) {
      try {
        if (ls) ls.removeItem(key);
      } catch {
        /* ignore */
      }
      mem.delete(key);
    },
  };
}

/* ---------- defaults merge ---------- */

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !isDecimal(v);

/**
 * Overlay `saved` on `defaults`: new default keys appear, types are respected
 * (Decimals stay Decimals, numbers stay numbers), unknown keys of map-like objects are kept.
 */
export function mergeDefaults(defaults, saved) {
  if (isDecimal(defaults)) return isDecimal(saved) ? saved : safeDecimal(saved, defaults);
  if (isPlainObject(defaults)) {
    const out = {};
    const src = isPlainObject(saved) ? saved : {};
    for (const k of Object.keys(defaults)) out[k] = k in src ? mergeDefaults(defaults[k], src[k]) : defaults[k];
    for (const k of Object.keys(src)) if (!(k in defaults)) out[k] = src[k];
    return out;
  }
  if (typeof defaults === 'number') return typeof saved === 'number' && Number.isFinite(saved) ? saved : defaults;
  if (typeof defaults === 'boolean') return typeof saved === 'boolean' ? saved : defaults;
  if (typeof defaults === 'string') return typeof saved === 'string' ? saved : defaults;
  if (defaults === null) return saved === undefined ? null : saved;
  if (Array.isArray(defaults)) return Array.isArray(saved) ? saved : defaults;
  return saved === undefined ? defaults : saved;
}

/* ---------- save store ---------- */

/**
 * @param {{id:string, version:number, migrations?:Object<number,Function>, storage?:object, now?:()=>number}} cfg
 * migrations[n] = (data) => data   upgrades a save from version n to n+1.
 */
export function createSaveStore(cfg) {
  const { id, version, migrations = {} } = cfg;
  const storage = cfg.storage || createStorage();
  const now = cfg.now || (() => Date.now());
  const key = `mg:${id}:save`;
  const backupKey = `mg:${id}:backup`;

  function migrate(data, fromVersion) {
    let v = fromVersion;
    let d = data;
    while (v < version) {
      const fn = migrations[v];
      if (fn) d = fn(d) || d;
      v++;
    }
    return d;
  }

  function unpack(text) {
    const env = parse(text);
    if (!env || typeof env !== 'object' || !env.data) throw new Error('Ungültiges Speicherformat');
    const v = Number.isFinite(env.v) ? env.v : 1;
    if (v > version) throw new Error('Spielstand stammt aus einer neueren Version');
    return { data: migrate(env.data, v), t: env.t || now(), v };
  }

  return {
    storage,
    key,
    /** Persist game data. Returns true when written to real localStorage. */
    save(data) {
      const env = stringify({ v: version, t: now(), data });
      return storage.set(key, env);
    },
    /** @returns {{data:any, t:number, v:number}|null} */
    load() {
      for (const k of [key, backupKey]) {
        const text = storage.get(k);
        if (!text) continue;
        try {
          const res = unpack(text);
          if (k === key) storage.set(backupKey, text); // rolling backup of the last good load
          return res;
        } catch (e) {
          console.warn('[save] konnte', k, 'nicht lesen:', e.message);
        }
      }
      return null;
    },
    wipe() {
      storage.remove(key);
      storage.remove(backupKey);
    },
    /** Text for copy/paste backup. */
    exportString(data) {
      const env = stringify({ v: version, t: now(), data });
      return `${EXPORT_PREFIX}.${id}.${toBase64(env)}`;
    },
    /** Parse an export string. Throws Error with a German message on failure. */
    importString(str) {
      const parts = String(str || '').trim().split('.');
      if (parts.length !== 3 || parts[0] !== EXPORT_PREFIX) throw new Error('Das ist kein gültiger Spielstand-Text.');
      if (parts[1] !== id) throw new Error(`Dieser Spielstand gehört zu einem anderen Spiel (${parts[1]}).`);
      let text;
      try {
        text = fromBase64(parts[2]);
      } catch {
        throw new Error('Der Text ist beschädigt (Base64).');
      }
      try {
        return unpack(text);
      } catch (e) {
        throw new Error(e.message || 'Der Spielstand konnte nicht gelesen werden.');
      }
    },
  };
}
