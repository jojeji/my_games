// Default state factory for the generic game kit.
import { D, ZERO } from '../decimal.js';

/**
 * Build a fresh state from a game definition.
 * Everything that must survive a save lives in here (Decimals are fine, see save.js).
 */
export function createState(def, now = Date.now()) {
  const cur = {};
  for (const c of def.currencies) {
    const start = D(c.start ?? 0);
    cur[c.id] = { amount: start, run: ZERO, total: ZERO, best: start };
  }

  const gens = {};
  for (const chain of def.chains || []) {
    gens[chain.id] = chain.tiers.map(() => ({ bought: 0, amount: ZERO }));
  }

  const layers = {};
  const confirm = {};
  for (const l of def.layers || []) {
    layers[l.id] = { count: 0, runTime: 0, fastest: 0, bestGain: ZERO, lastGain: ZERO, lastTime: 0, unlocked: false };
    confirm[l.id] = true;
  }

  const auto = {};
  for (const a of def.autos || []) {
    const d = typeof a.defaults === 'function' ? a.defaults() : a.defaults; // function = fresh mutable defaults per state
    auto[a.id] = { on: true, t: 0, ...(d || {}) };
  }

  // optional subsystems: state exists only when the def uses them (keeps older games' saves unchanged)
  const extra = {};
  if (def.producers) {
    extra.prod = {};
    for (const p of def.producers) extra.prod[p.id] = p.slots.map(() => ({ n: 0 }));
  }
  if (def.spells) {
    extra.spells = {};
    for (const sp of def.spells) extra.spells[sp.id] = { t: 0, cd: 0, n: 0, auto: sp.autoDefault ?? true };
  }
  if (def.tap) extra.tap = { charges: def.tap.start ?? 0, n: 0 };
  if (def.chronicle) extra.chronicle = { read: {}, shown: {} };
  if (def.extraState) Object.assign(extra, def.extraState(def));

  return {
    ...extra,
    v: def.version,
    time: { played: 0, offline: 0, created: now },
    cur,
    gens,
    upg: {},
    layers,
    ms: {},
    ach: {},
    story: {},
    auto,
    challenge: { active: null, done: {}, entered: {}, t0: 0 },
    stats: {},
    settings: {
      notation: 'standard',
      autosave: 10,
      offlineCapHours: 24,
      buyMode: '1', // '1' | '10' | 'max'
      confirm,
      ...(def.settingsDefaults || {}),
    },
  };
}
