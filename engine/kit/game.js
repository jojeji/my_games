// Generic, DOM-free game model driven by a declarative definition ("def").
// Subsystems: currencies, tiered generators, upgrades/research, prestige layers,
// milestones, challenges, achievements, story, autobuyers.
// A game provides data plus a few hook functions (see games/replikator/def.js).
import { D, ZERO, ONE, Decimal } from '../decimal.js';
import { mergeDefaults } from '../save.js';
import { createState } from './state.js';
import { generatorMethods } from './generators.js';
import { upgradeMethods } from './upgrades.js';
import { challengeMethods } from './challenges.js';

const byId = (arr = []) => Object.fromEntries(arr.map((x) => [x.id, x]));

export class Game {
  /** @param {object} def game definition */
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.version = def.version;
    this.migrations = def.migrations || {};
    this.hooks = def.hooks || {};
    this.currencyById = byId(def.currencies);
    this.chainById = byId(def.chains);
    this.layerById = byId(def.layers);
    this.upgById = byId(def.upgrades);
    this.chalById = byId(def.challenges);
    this.achById = byId(def.achievements);
    this.msById = byId(def.milestones);
    this.autoById = byId(def.autos);
    this.cache = { mult: {}, own: {}, rate: {}, maxTier: {}, global: {} };
    this.slow = 0;
    this.emit = () => {}; // replaced by the runtime (engine/core.js)
    this.state = createState(def);
    this.refresh();
  }

  /* ---------------- lifecycle ---------------- */

  newGame() {
    this.state = createState(this.def);
    this.hook('onNewGame');
    this.refresh();
  }

  serialize() {
    return this.state;
  }

  load(obj) {
    const fresh = createState(this.def);
    const s = mergeDefaults(fresh, obj);
    // tier arrays: keep saved entries, pad if the game got new tiers
    for (const chain of this.def.chains || []) {
      const saved = Array.isArray(obj?.gens?.[chain.id]) ? obj.gens[chain.id] : [];
      s.gens[chain.id] = chain.tiers.map((_, i) => mergeDefaults({ bought: 0, amount: ZERO }, saved[i]));
    }
    this.state = s;
    this.hook('onLoad');
    this.refresh();
  }

  hook(name, ...args) {
    return this.hooks[name] ? this.hooks[name](this, ...args) : undefined;
  }

  offlineCapSeconds() {
    const bonus = this.hooks.offlineCapBonusHours ? this.hooks.offlineCapBonusHours(this) : 0;
    return Math.max(0, (this.state.settings.offlineCapHours + bonus) * 3600);
  }

  /** Compact numbers for the "while you were away" summary. */
  snapshot() {
    const cur = {};
    for (const c of this.def.currencies) cur[c.id] = this.state.cur[c.id].amount;
    const layers = {};
    for (const l of this.def.layers || []) layers[l.id] = this.state.layers[l.id].count;
    return {
      cur,
      layers,
      ach: this.achCount(),
      challenges: this.chDoneCount(),
      income: this.def.currencies.map((c) => this.incomePerSec(c.id)),
    };
  }

  /* ---------------- currencies ---------------- */

  get(id) {
    return this.state.cur[id].amount;
  }

  canAfford(id, amt) {
    return this.state.cur[id].amount.gte(amt);
  }

  /** Earn: counts for run/total statistics (used for prestige gain basis). */
  add(id, amt) {
    const c = this.state.cur[id];
    c.amount = c.amount.add(amt);
    c.run = c.run.add(amt);
    c.total = c.total.add(amt);
    if (c.amount.gt(c.best)) c.best = c.amount;
  }

  /** Give without counting as earned (starting resources, refunds). */
  grant(id, amt) {
    const c = this.state.cur[id];
    c.amount = c.amount.add(amt);
    if (c.amount.gt(c.best)) c.best = c.amount;
  }

  spend(id, amt) {
    const c = this.state.cur[id];
    if (c.amount.lt(amt)) return false;
    c.amount = c.amount.sub(amt);
    if (c.amount.lt(0)) c.amount = ZERO;
    return true;
  }

  /* ---------------- tick ---------------- */

  refresh() {
    this.refreshGenerators();
  }

  /** Advance the simulation by dt seconds (real delta time). */
  tick(dt) {
    const s = this.state;
    s.time.played += dt;
    for (const l of this.def.layers || []) s.layers[l.id].runTime += dt;
    this.refresh();
    this.produce(dt);
    this.hook('onTick', dt);
    this.runAutos(dt);
    this.slow += dt;
    if (this.slow >= 0.25) {
      this.slow = 0;
      this.slowChecks();
    }
  }

  /** Cheap-enough periodic checks: unlocks, milestones, achievements, story, challenge goal. */
  slowChecks() {
    for (const l of this.def.layers || []) {
      const ls = this.state.layers[l.id];
      if (!ls.unlocked) {
        const ok = l.unlockWhen ? l.unlockWhen(this) : this.prestigeGain(l.id).gte(1);
        if (ok) {
          ls.unlocked = true;
          this.emit('layer-unlocked', { id: l.id });
        }
      }
    }
    for (const m of this.def.milestones || []) {
      if (this.state.ms[m.id]) continue;
      const ok = m.cond ? m.cond(this) : this.state.layers[m.layer].count >= m.at;
      if (ok) {
        this.state.ms[m.id] = true;
        this.emit('milestone', { id: m.id, def: m });
      }
    }
    for (const a of this.def.achievements || []) {
      if (this.state.ach[a.id]) continue;
      if (a.cond(this)) {
        this.state.ach[a.id] = this.state.time.played;
        this.emit('achievement', { id: a.id, def: a });
      }
    }
    for (const st of this.def.story || []) {
      if (this.state.story[st.id]) continue;
      if (st.cond(this)) {
        this.state.story[st.id] = this.state.time.played;
        this.emit('story', { id: st.id, def: st });
      }
    }
    this.chCheckGoal();
  }

  /* ---------------- prestige layers ---------------- */

  layerUnlocked(id) {
    const ls = this.state.layers[id];
    return ls.unlocked || ls.count > 0;
  }

  /** Metric the layer's gain is computed from (run total of its basis currency). */
  prestigeBasis(id) {
    return this.state.cur[this.layerById[id].basis].run;
  }

  prestigeMult(id) {
    const l = this.layerById[id];
    return l.mult ? D(l.mult(this)) : ONE;
  }

  /**
   * Power-law gain: floor(mult * (basis / threshold) ^ exp), 0 below the threshold.
   * Optional formula.softcap = { at, pow }: above `at` the gain only grows with exponent `pow`.
   */
  prestigeGain(id) {
    const l = this.layerById[id];
    const b = this.prestigeBasis(id);
    const f = l.formula;
    const exp = typeof f.exp === 'function' ? f.exp(this) : f.exp;
    if (b.lt(f.threshold)) return ZERO;
    let raw = b.div(f.threshold).pow(exp).mul(this.prestigeMult(id));
    if (f.softcap && raw.gt(f.softcap.at)) raw = D(f.softcap.at).mul(raw.div(f.softcap.at).pow(f.softcap.pow));
    return raw.lt(1) ? ZERO : raw.floor();
  }

  /** Basis value at which the gain would reach `gain` (inverse of the formula). */
  prestigeBasisFor(id, gain) {
    const l = this.layerById[id];
    const f = l.formula;
    const exp = typeof f.exp === 'function' ? f.exp(this) : f.exp;
    let want = D(gain);
    if (f.softcap && want.gt(f.softcap.at)) want = D(f.softcap.at).mul(want.div(f.softcap.at).pow(1 / f.softcap.pow));
    return D(f.threshold).mul(want.div(this.prestigeMult(id)).pow(1 / exp));
  }

  /** Challenge restrictions: layers at or above the challenge's reset layer are locked. */
  prestigeBlocked(id) {
    const c = this.chActive();
    return !!c && this.layerById[id].layer >= c.resetLayer;
  }

  canPrestige(id) {
    return this.layerUnlocked(id) && !this.prestigeBlocked(id) && this.prestigeGain(id).gte(1);
  }

  /**
   * Wipe everything belonging to layers below `layerIdx`: currencies, generators,
   * non-kept upgrades and the run timers. Does NOT award anything.
   */
  resetBelow(layerIdx) {
    const s = this.state;
    for (const c of this.def.currencies) {
      if (c.layer < layerIdx) {
        const start = D(c.start ?? 0);
        s.cur[c.id] = { ...s.cur[c.id], amount: start, run: ZERO };
        if (start.gt(s.cur[c.id].best)) s.cur[c.id].best = start;
      }
    }
    for (const chain of this.def.chains || []) {
      if ((chain.layer ?? 0) < layerIdx) s.gens[chain.id] = chain.tiers.map(() => ({ bought: 0, amount: ZERO }));
    }
    for (const u of this.def.upgrades) {
      if (u.layer < layerIdx && this.upgLevel(u.id) > 0) {
        if (!(u.keep && u.keep(this, layerIdx))) delete s.upg[u.id];
      }
    }
    for (const l of this.def.layers || []) {
      if (l.layer < layerIdx) s.layers[l.id].runTime = 0;
    }
    for (const a of this.def.autos || []) s.auto[a.id].t = 0;
  }

  /**
   * Perform a prestige reset of the given layer.
   * @returns {Decimal|false} gain on success
   */
  prestige(id) {
    if (!this.canPrestige(id)) return false;
    const l = this.layerById[id];
    const ls = this.state.layers[id];
    const gain = this.prestigeGain(id);
    ls.count += 1;
    ls.lastGain = gain;
    ls.lastTime = ls.runTime;
    if (!ls.fastest || ls.runTime < ls.fastest) ls.fastest = ls.runTime;
    if (gain.gt(ls.bestGain)) ls.bestGain = gain;
    this.resetBelow(l.layer);
    ls.runTime = 0;
    this.add(l.currency, gain);
    this.hook('afterReset', l.layer);
    this.refresh();
    this.emit('prestige', { id, gain });
    return gain;
  }

  /* ---------------- milestones / achievements ---------------- */

  hasMs(id) {
    return !!this.state.ms[id];
  }

  hasAch(id) {
    return !!this.state.ach[id];
  }

  achCount() {
    return Object.keys(this.state.ach).length;
  }

  /* ---------------- autobuyers ---------------- */

  autoUnlocked(id) {
    const a = this.autoById[id];
    return !!a.unlock(this);
  }

  autoActive(id) {
    return this.state.auto[id].on && this.autoUnlocked(id) && !this.rule('noAuto', false);
  }

  runAutos(dt) {
    for (const a of this.def.autos || []) {
      if (!this.autoActive(a.id)) continue;
      const st = this.state.auto[a.id];
      st.t += dt;
      const interval = a.interval ? a.interval(this) : 1;
      if (st.t >= interval) {
        st.t = 0;
        a.run(this, st);
      }
    }
  }
}

/**
 * Build an autobuyer definition for "prestige automatically".
 * Config lives in state.auto[id]: mode 'amount' (gain >= value) | 'mult' (gain >= value * layer currency run total).
 */
export function prestigeAuto({ id, layer, name, desc, unlock, interval, group }) {
  return {
    id,
    name,
    desc,
    group: group || layer,
    layer,
    kind: 'prestige',
    unlock,
    interval: interval || (() => 1),
    defaults: { on: false, mode: 'amount', value: D(1) },
    run(g, st) {
      const gain = g.prestigeGain(layer);
      if (gain.lt(1) || g.prestigeBlocked(layer)) return;
      const l = g.layerById[layer];
      const need = st.mode === 'mult' ? g.state.cur[l.currency].run.mul(st.value).max(1) : D(st.value);
      if (gain.gte(need)) g.prestige(layer);
    },
  };
}

Object.assign(Game.prototype, generatorMethods, upgradeMethods, challengeMethods);

export { Decimal };
