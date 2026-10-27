// Story / Chronik helpers. Entries live in def.story = [{ id, text, cond(g), title?, chapter?, modal?, pages?, who? }]
// and are triggered by Game.slowChecks (state.story[id] = play time of the trigger, event 'story').
//  - chapter: id from def.chapters = [{ id, title, sub }] (grouping in the Chronik view)
//  - modal: true -> UI shows the entry as a dialog once (state.chronicle.shown); `pages` = array of texts for multi-page sequences
// With def.chronicle = true the save also tracks which entries were read (new-story badge).
export const storyMethods = {
  /** Seen entries in chronological order: [{ def, t }]. */
  storyList() {
    const out = [];
    for (const st of this.def.story || []) {
      const t = this.state.story[st.id];
      if (t !== undefined && t !== false) out.push({ def: st, t });
    }
    return out.sort((a, b) => a.t - b.t); // stable: ties keep definition order
  },

  storyUnread() {
    const c = this.state.chronicle;
    if (!c) return 0;
    let n = 0;
    for (const st of this.def.story || []) if (this.state.story[st.id] !== undefined && !c.read[st.id]) n++;
    return n;
  },

  storyMarkRead() {
    const c = this.state.chronicle;
    if (!c) return;
    for (const st of this.def.story || []) if (this.state.story[st.id] !== undefined) c.read[st.id] = true;
  },

  /** Modal entries that happened but were not shown yet (in story order). */
  storyPendingModals() {
    const c = this.state.chronicle;
    if (!c) return [];
    return this.storyList().filter(({ def }) => def.modal && !c.shown[def.id]).map((x) => x.def);
  },

  storyModalShown(id) {
    if (this.state.chronicle) this.state.chronicle.shown[id] = true;
  },

  /** Non-modal entries that happened but were never announced as a bubble and are still unread (chronological). */
  storyBubbleBacklog() {
    const c = this.state.chronicle;
    if (!c) return [];
    return this.storyList().filter(({ def }) => !def.modal && !c.shown[def.id] && !c.read[def.id]).map((x) => x.def);
  },

  /** Marks an entry as announced (bubble started). Shares `chronicle.shown` with the modal entries. */
  storyBubbleShown(id) {
    if (this.state.chronicle) this.state.chronicle.shown[id] = true;
  },

  /**
   * For a save that gets a chronicle after the fact (migration from the one-line story): entries whose condition is already true
   * but that were never stamped are recorded silently - shown (no modal, no bubble), still unread (badge in the Chronik).
   * Each gets the stamp of the previous entry in definition order, so the Chronik keeps the story order.
   * @returns {string[]} ids that were backfilled
   */
  storyBackfill() {
    const c = this.state.chronicle;
    if (!c) return [];
    const done = [];
    let last = 0;
    for (const st of this.def.story || []) {
      const t = this.state.story[st.id];
      if (t !== undefined && t !== false) {
        last = Math.max(last, t);
        continue;
      }
      if (!st.cond(this)) continue;
      this.state.story[st.id] = last || 0.001; // slowChecks treats a falsy stamp as "not yet happened"
      c.shown[st.id] = true;
      done.push(st.id);
    }
    return done;
  },
};
