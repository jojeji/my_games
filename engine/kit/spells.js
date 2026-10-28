// Active abilities with duration + cooldown (+ optional auto-cast).
//
// def.spells = [{
//   id, name, desc, icon?, autoDefault?: bool,
//   unlock(g) -> bool,
//   duration(g) -> seconds (0 = instant),
//   cooldown(g) -> seconds (counted from the cast),
//   cast?(g)  -> instant effect, called when the spell is cast,
//   info?(g)  -> string with the current numbers (shown in the details)
//   autoWhen?(g) -> bool, extra condition for AUTO-casts only (a game can keep an auto from wasting a cast; manual casts are never blocked by it)
// }]
// Time-limited effects read `g.spellFrac(id, dt)` (share of the next dt during which the spell is active; works with
// the large steps of offline catch-up) or `g.spellActive(id)`. A game-defined auto (kind 'misc') calls `g.spellAutoRun()`.
export const spellMethods = {
  spellState(id) {
    return this.state.spells[id];
  },

  spellUnlocked(id) {
    const s = this.spellById[id];
    return !s.unlock || !!s.unlock(this);
  },

  spellActive(id) {
    return this.state.spells[id].t > 0;
  },

  spellRemaining(id) {
    return this.state.spells[id].t;
  },

  spellCooldownLeft(id) {
    return this.state.spells[id].cd;
  },

  spellReady(id) {
    return this.spellUnlocked(id) && this.state.spells[id].cd <= 0 && !(this.hooks.spellBlocked && this.hooks.spellBlocked(this, id));
  },

  spellDuration(id) {
    return this.spellById[id].duration(this);
  },

  spellCooldown(id) {
    return this.spellById[id].cooldown(this);
  },

  /** Fraction (0..1) of the next `dt` seconds this spell is active. dt = 0: momentary 0/1. */
  spellFrac(id, dt) {
    const t = this.state.spells[id].t;
    if (t <= 0) return 0;
    return dt > 0 ? Math.min(t, dt) / dt : 1;
  },

  spellCast(id, auto = false) {
    if (!this.spellReady(id)) return false;
    const def = this.spellById[id];
    const st = this.state.spells[id];
    st.t = def.duration(this);
    st.cd = Math.max(def.cooldown(this), st.t);
    st.n += 1;
    if (def.cast) def.cast(this);
    this.refresh();
    this.emit('spell', { id, auto });
    return true;
  },

  /** Cast every ready spell that has auto-cast switched on. */
  spellAutoRun() {
    let n = 0;
    for (const sp of this.def.spells) {
      if (this.state.spells[sp.id].auto && (!sp.autoWhen || sp.autoWhen(this)) && this.spellCast(sp.id, true)) n++;
    }
    return n;
  },

  spellsTick(dt) {
    for (const sp of this.def.spells) {
      const st = this.state.spells[sp.id];
      if (st.t > 0) st.t = Math.max(0, st.t - dt);
      if (st.cd > 0) st.cd = Math.max(0, st.cd - dt);
    }
  },
};
