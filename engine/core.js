// Runtime: real-time loop, offline progress, autosave and a tiny event bus.
// It is game-agnostic: a "logic" object (see kit/game.js) must provide
//   id, version, migrations?, state, newGame(), load(obj), serialize(), tick(dt), snapshot()
// and may call logic.emit(type, payload).
import { createSaveStore } from './save.js';

export function createBus() {
  const map = new Map();
  const bus = {
    silent: false,
    muted: null, // when set to an array, events are collected there instead of delivered
    on(type, fn) {
      if (!map.has(type)) map.set(type, new Set());
      map.get(type).add(fn);
      return () => map.get(type).delete(fn);
    },
    emit(type, payload) {
      if (bus.muted) {
        bus.muted.push({ type, payload });
        return;
      }
      const set = map.get(type);
      if (set) for (const fn of [...set]) fn(payload);
      const any = map.get('*');
      if (any) for (const fn of [...any]) fn(type, payload);
    },
  };
  return bus;
}

/**
 * Advance a logic object by `seconds` in chunks (used for offline progress and by the simulator).
 * Chunks are at most `maxStep` long and there are at most `maxSteps` of them.
 */
export function advance(logic, seconds, { maxStep = 0.1, maxSteps = 1500 } = {}) {
  if (!(seconds > 0)) return;
  const steps = Math.min(maxSteps, Math.max(1, Math.ceil(seconds / maxStep)));
  const dt = seconds / steps;
  for (let i = 0; i < steps; i++) logic.tick(dt);
}

/**
 * @param {object} logic
 * @param {{storage?:object, now?:()=>number, offlineMinShow?:number, maxLiveDelta?:number}} [opts]
 */
export function createRuntime(logic, opts = {}) {
  const now = opts.now || (() => Date.now());
  const store = createSaveStore({
    id: logic.id,
    version: logic.version,
    migrations: logic.migrations,
    storage: opts.storage,
    now,
  });
  const bus = createBus();
  const toBus = (type, payload) => bus.emit(type, payload);
  if ('out' in logic) logic.out = toBus; // kit Game: emit() logs first, then forwards
  else logic.emit = toBus;
  const offlineMinShow = opts.offlineMinShow ?? 60;
  const maxLiveDelta = opts.maxLiveDelta ?? 3; // gaps longer than this are treated as "away"

  let last = now();
  let sinceSave = 0;
  let timer = null;
  let lastSaveOk = true;

  /** Simulate `seconds` of absence (capped by the game's offline cap). Returns a summary. */
  function simulateOffline(seconds) {
    const capSec = logic.offlineCapSeconds ? logic.offlineCapSeconds() : 24 * 3600;
    const used = Math.min(seconds, capSec);
    const before = logic.snapshot();
    const events = [];
    if (logic.plogOffline) logic.plogOffline(used);
    bus.muted = events;
    try {
      advance(logic, used);
    } finally {
      bus.muted = null;
    }
    const after = logic.snapshot();
    if (logic.state && logic.state.time) logic.state.time.offline += used;
    const summary = { seconds: used, realSeconds: seconds, capped: used < seconds, before, after, events };
    if (used >= offlineMinShow) bus.emit('offline', summary);
    return summary;
  }

  function save() {
    lastSaveOk = store.save(logic.serialize());
    sinceSave = 0;
    bus.emit('saved', { ok: lastSaveOk });
    return lastSaveOk;
  }

  /** One loop iteration: real delta time, live tick or offline catch-up. */
  function frame() {
    const t = now();
    const elapsed = (t - last) / 1000;
    last = t;
    if (!(elapsed > 0)) return;
    if (elapsed > maxLiveDelta) {
      simulateOffline(elapsed);
    } else {
      let rem = elapsed;
      while (rem > 1e-9) {
        const d = Math.min(rem, 0.1);
        logic.tick(d);
        rem -= d;
      }
    }
    sinceSave += elapsed;
    const every = logic.state?.settings?.autosave ?? 10;
    if (every > 0 && sinceSave >= every) save();
  }

  function load() {
    const res = store.load();
    if (res) {
      logic.load(res.data);
      last = now();
      const away = (last - res.t) / 1000;
      if (away > 5) return simulateOffline(away);
    } else {
      logic.newGame();
      last = now();
    }
    return null;
  }

  function start() {
    if (timer) return;
    last = now();
    timer = setInterval(frame, 50);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') save();
        else frame(); // catch up immediately when returning
      });
      addEventListener('pagehide', save);
      if (logic.plogInput) addEventListener('pointerdown', () => logic.plogInput(), { capture: true, passive: true });
    }
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    logic,
    bus,
    store,
    on: bus.on,
    load,
    start,
    stop,
    save,
    frame,
    simulateOffline,
    get lastSaveOk() {
      return lastSaveOk;
    },
    exportString() {
      return store.exportString(logic.serialize());
    },
    /** Replace the current game by an imported save string (throws on invalid input). */
    importString(str) {
      const res = store.importString(str);
      logic.load(res.data);
      save();
    },
    hardReset() {
      stop();
      store.wipe();
      logic.newGame();
    },
  };
}
