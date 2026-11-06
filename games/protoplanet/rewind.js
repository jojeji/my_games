// Ringpuffer von Schnappschuessen fuer das Zurueckspulen (DOM-frei).
import { T } from './tune.js';
import { snapshot } from './physics.js';

export function createRewind({ every = T.rewindEvery, keep = T.rewindKeep } = {}) {
  let list = []; // [{ t, snap }]
  return {
    get size() {
      return list.length;
    },
    clear() {
      list = [];
    },
    /** Schnappschuss ablegen, wenn seit dem letzten `every` Sekunden Spielzeit vergangen sind (oder noch keiner existiert). */
    tick(world) {
      const last = list.length ? list[list.length - 1].t : -Infinity;
      if (world.t - last < every - 1e-9) return false;
      list.push({ t: world.t, snap: snapshot(world) });
      const min = world.t - keep;
      while (list.length > 1 && list[0].t < min) list.shift();
      return true;
    },
    /** Neuester Schnappschuss mit t <= tNow - back (sonst der aelteste). Verwirft alles danach. Gibt den Schnappschuss zurueck. */
    pick(tNow, back = T.rewindBack) {
      if (!list.length) return null;
      let idx = 0;
      for (let i = 0; i < list.length; i++) if (list[i].t <= tNow - back + 1e-9) idx = i;
      const hit = list[idx];
      list = list.slice(0, idx + 1);
      return hit.snap;
    },
  };
}
