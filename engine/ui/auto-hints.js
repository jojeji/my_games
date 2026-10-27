// Hint toast when an autobuyer unlocks: says WHERE its switch is. Shown once per auto: the game kit flags `state.auto[id].seen`
// when it emits 'auto-unlocked' (kit/game.js slowChecks; saves from before the flag count already unlocked autos as announced).
// Unlocks that happen during offline catch-up arrive as events of the offline summary (the runtime mutes the bus meanwhile),
// both for the summary returned by runtime.load() and for later 'offline' events.

/**
 * @param {{runtime:object, toast:Function, offline?:object|null, whereOf?:(def:object)=>string}} cfg
 *   whereOf: where the switch lives for an auto def without its own `where` (e.g. "Generatoren-Tab")
 */
export function announceAutoUnlocks({ runtime, toast, offline, whereOf = () => '' }) {
  let queue = [];
  let timer = null;
  const flush = () => {
    timer = null;
    // one toast per place (a pair of autos usually unlocks in the same tick)
    const byWhere = new Map();
    for (const def of queue) {
      const w = def.where || whereOf(def);
      if (!byWhere.has(w)) byWhere.set(w, []);
      byWhere.get(w).push(def.name);
    }
    queue = [];
    for (const [where, names] of byWhere) {
      const what = names.length <= 2 ? names.join(' und ') : `${names.length} Automaten`;
      toast(`${what} freigeschaltet${where ? ' – Schalter im ' + where : ''}`, { kind: 'good', ms: 7000 });
    }
  };
  const add = ({ def }) => {
    queue.push(def);
    if (!timer) timer = setTimeout(flush, 0);
  };
  const fromSummary = (s) => (s?.events || []).filter((e) => e.type === 'auto-unlocked').forEach((e) => add(e.payload));
  runtime.on('auto-unlocked', add);
  runtime.on('offline', fromSummary);
  fromSummary(offline);
}
