// Challenges: enter a restricted run (a no-gain reset of the lower layers),
// reach a goal to earn a permanent reward.
import { D } from '../decimal.js';

export const challengeMethods = {
  chDef(id) {
    return this.chalById[id];
  },

  chActive() {
    const id = this.state.challenge.active;
    return id ? this.chalById[id] : null;
  },

  chDone(id) {
    return (this.state.challenge.done[id] || 0) > 0;
  },

  chDoneCount() {
    return Object.keys(this.state.challenge.done).filter((k) => this.state.challenge.done[k] > 0).length;
  },

  chUnlocked() {
    return this.def.challengesUnlocked ? !!this.def.challengesUnlocked(this) : true;
  },

  /** Rule value of the active challenge (or fallback when none/not set). */
  rule(key, fallback) {
    const c = this.chActive();
    if (c && c.rules && key in c.rules) return c.rules[key];
    return fallback;
  },

  chGoal(c) {
    return D(c.goal.amount);
  },

  /** Progress 0..1 on a log scale towards the goal (for the progress bar). */
  chProgress(c) {
    const have = this.state.cur[c.goal.currency].run;
    const goal = this.chGoal(c);
    if (have.lte(1)) return 0;
    return Math.max(0, Math.min(1, have.log10() / goal.log10()));
  },

  /** Seconds spent in the active challenge (0 when none). */
  chRunTime() {
    return this.chActive() ? this.state.time.played - this.state.challenge.t0 : 0;
  },

  /** Challenge can be started now (globally unlocked + its own optional `unlock(g)` condition). */
  chAvailable(id) {
    const c = this.chalById[id];
    return !!c && this.chUnlocked() && !this.chDone(id) && (!c.unlock || !!c.unlock(this));
  },

  chEnter(id) {
    const c = this.chalById[id];
    if (!this.chAvailable(id)) return false;
    this.state.challenge.active = id;
    this.state.challenge.t0 = this.state.time.played;
    this.state.challenge.entered[id] = (this.state.challenge.entered[id] || 0) + 1;
    this.resetBelow(c.resetLayer);
    this.hook('afterReset', c.resetLayer);
    this.refresh();
    this.emit('challenge-enter', { id });
    return true;
  },

  /** Leave the active challenge without a reward. */
  chExit() {
    const c = this.chActive();
    if (!c) return false;
    this.state.challenge.active = null;
    this.resetBelow(c.resetLayer);
    this.hook('afterReset', c.resetLayer);
    this.refresh();
    this.emit('challenge-exit', { id: c.id });
    return true;
  },

  chCheckGoal() {
    const c = this.chActive();
    if (!c) return false;
    if (this.state.cur[c.goal.currency].run.lt(this.chGoal(c))) return false;
    this.state.challenge.done[c.id] = (this.state.challenge.done[c.id] || 0) + 1;
    this.state.challenge.active = null;
    this.resetBelow(c.resetLayer);
    this.hook('afterReset', c.resetLayer);
    this.refresh();
    this.emit('challenge-done', { id: c.id });
    return true;
  },
};
