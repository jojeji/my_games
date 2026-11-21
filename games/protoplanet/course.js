// KURS-SPUREN (DOM-frei, rein): fuer Koerper in der Groessenklasse des Spielers eine kurze Vorhersage ihres Weges, damit man Begegnungen timen kann.
// Auswahl: Masse zwischen `massLo` x und `massHi` x Spielermasse (mit Spielraum, damit nichts an der Grenze ein- und ausspringt), keine Attraktoren, kein eigener Ausstoss,
// hoechstens `max` Koerper, die ersten nach Naehe (aktuell oder kleinster Abstand zum Spieler auf geradem Weg in `lookT` s). Spur:
// Arena (kein `w.grav`): gerade mit Randabprall wie physics.js bounds (feiner Schritt, damit die Spiegelung stimmt); Gravitations-Kapitel: orbit.js predictTrack (Stern + Planeten auf ihren Bahnen).
// Andere Koerper und Kollisionen sind NICHT eingerechnet (wie die Bahnvorschau und der Treffpunkt). Nichts hier veraendert die Welt oder die Kamera.
import { T } from './tune.js';
import { predictTrack } from './orbit.js';

const cfg = (o) => ({ ...T.course, ...o });

/** Kleinster Abstand (Mittelpunkte) von Koerper b zum Spieler p, beide mit konstanter Geschwindigkeit, im Fenster [0, horizon] (wie brain.js approach, aber ohne Import-Zyklus). */
function closest(p, b, horizon) {
  const rx = b.x - p.x;
  const ry = b.y - p.y;
  const wx = b.vx - p.vx;
  const wy = b.vy - p.vy;
  const w2 = wx * wx + wy * wy;
  const t = w2 > 1e-12 ? Math.min(horizon, Math.max(0, -(rx * wx + ry * wy) / w2)) : 0;
  return Math.hypot(rx + wx * t, ry + wy * t);
}

/**
 * Welche Koerper bekommen eine Spur? `prev` = Menge der Ids der letzten Auswahl (Hysterese) oder null. Rueckgabe: Liste von Koerpern, nahe zuerst, hoechstens `max`.
 */
export function courseSelect(w, prev = null, opt = {}) {
  const C = cfg(opt);
  const p = w.player;
  if (!p || !(p.m > 0)) return [];
  const reach = w.grav ? C.reachOrbit : C.reach;
  const out = [];
  for (const b of w.bodies) {
    if (b === p || b.kind === 'attractor' || !(b.m > 0) || b.gf === p.id) continue;
    const had = !!prev && prev.has(b.id);
    const ratio = b.m / p.m;
    const lo = had ? C.massLo * C.stay : C.massLo;
    const hi = had ? C.massHi / C.stay : C.massHi;
    if (ratio < lo || ratio > hi) continue;
    const cur = Math.hypot(b.x - p.x, b.y - p.y);
    const d = w.grav ? cur : Math.min(cur, closest(p, b, C.lookT));
    if (d > (had ? reach * C.stayReach : reach)) continue;
    out.push({ b, ratio, score: had ? d * C.keepBonus : d });
  }
  out.sort((a, c) => a.score - c.score || a.b.id - c.b.id);
  return out.slice(0, C.max).map((e) => e.b);
}

/**
 * Wie weit voraus die Spur eines Koerpers gezeigt wird (s): `show` (10 s), bei langsamen Koerpern laenger, damit mindestens `minLen` Welteinheiten Weg sichtbar sind
 * (Arena: v ~ 0,15 -> 10 s sind nur 1,5 Einheiten, kaum mehr als der Radius), hoechstens `showMax`.
 */
export function courseShow(b, opt = {}) {
  const C = cfg(opt);
  const v = Math.hypot(b.vx, b.vy);
  return Math.max(C.show, Math.min(C.showMax, v > 1e-6 ? C.minLen / v : C.showMax));
}

/** Weg eines Koerpers: Float64Array [x0,y0,x1,y1,...], n+1 Punkte im Abstand `step` s (Punkt 0 = jetzt). */
export function courseTrack(w, b, opt = {}) {
  const C = cfg(opt);
  const n = Math.round((C.horizon != null ? C.horizon : C.showMax + C.maxAge + 2 * C.step) / C.step);
  if (w.grav) {
    const times = new Float64Array(n + 1);
    for (let k = 0; k <= n; k++) times[k] = k * C.step;
    return predictTrack(w, b, times);
  }
  const out = new Float64Array(2 * (n + 1));
  const R = w.arenaR;
  const lim = R > 0 ? R - Math.sqrt(b.m) : 0;
  const sub = Math.max(1, Math.round(C.step / C.hFine));
  const h = C.step / sub;
  let x = b.x;
  let y = b.y;
  let vx = b.vx;
  let vy = b.vy;
  out[0] = x;
  out[1] = y;
  for (let k = 1; k <= n; k++) {
    for (let s = 0; s < sub; s++) {
      x += vx * h;
      y += vy * h;
      if (lim > 0) {
        const d2 = x * x + y * y;
        if (d2 > lim * lim) {
          const d = Math.sqrt(d2);
          const nx = x / d;
          const ny = y / d;
          const vn = vx * nx + vy * ny;
          if (vn > 0) {
            vx -= 2 * vn * nx;
            vy -= 2 * vn * ny;
          }
          x = nx * lim;
          y = ny * lim;
        }
      }
    }
    out[2 * k] = x;
    out[2 * k + 1] = y;
  }
  return out;
}

/** Ort einer Spur zur Zeit u (s ab t0), linear zwischen den Punkten. */
export function trackAt(tr, step, u, out = [0, 0]) {
  const n = tr.length / 2 - 1;
  const f = Math.max(0, Math.min(n, u / step));
  const i = Math.min(n - 1, Math.floor(f));
  const k = f - i;
  out[0] = tr[2 * i] + (tr[2 * i + 2] - tr[2 * i]) * k;
  out[1] = tr[2 * i + 1] + (tr[2 * i + 3] - tr[2 * i + 1]) * k;
  return out;
}

/**
 * Zeitpunkt, zu dem eine Gefahren-Spur die Bahnvorschau des Spielers kreuzt: erster Zeitpunkt der Vorschau (innerhalb `show` s), an dem beide Koerper
 * sich bis auf Radiensumme + `crossGap` nahe sind (lokales Minimum). Nur mit Bahnvorschau (Gravitations-Kapitel). `off` = Weltzeit jetzt minus Weltzeit der Spuren (s), `keepId` = Id der letzten Markierung (Spielraum `crossHide`).
 */
export function courseCross(w, pv, tracks, step, off = 0, keepId = null, opt = {}) {
  const C = cfg(opt);
  const p = w.player;
  if (!p || !pv || pv.n < 2 || !tracks.length) return null;
  const pt = [0, 0];
  let best = null;
  for (const tk of tracks) {
    if (tk.kind !== 'danger') continue;
    const gap = (tk.id === keepId ? C.crossHide : C.crossShow) + Math.sqrt(p.m) + tk.r;
    let prevD = Infinity;
    let prevI = -1;
    let found = null;
    for (let i = 0; i < pv.n; i++) {
      const t = pv.t[i];
      if (t > (tk.show || C.show)) break;
      trackAt(tk.pts, step, t + off, pt);
      const d = Math.hypot(pv.pts[2 * i] - pt[0], pv.pts[2 * i + 1] - pt[1]);
      if (prevI >= 0 && prevD < gap) {
        const next = d; // prevD ist lokales Minimum, wenn der Abstand wieder waechst
        if (next > prevD) {
          found = { i: prevI, d: prevD };
          break;
        }
      }
      prevD = d;
      prevI = i;
    }
    if (!found && prevI >= 0 && prevD < gap && pv.t[prevI] <= (tk.show || C.show)) found = { i: prevI, d: prevD };
    if (found && (!best || pv.t[found.i] < best.t)) {
      trackAt(tk.pts, step, pv.t[found.i] + off, pt);
      best = { id: tk.id, i: found.i, t: pv.t[found.i], x: pv.pts[2 * found.i], y: pv.pts[2 * found.i + 1], bx: pt[0], by: pt[1], d: found.d };
    }
  }
  return best;
}

/**
 * Zustand der Kurs-Spuren fuer die Oberflaeche. update(w) rechnet neu (Auswahl mit Hysterese + Spuren), cross(w, pv) die Kreuzungs-Markierung.
 * `data` = { t0 (Weltzeit der Berechnung), step, tracks: [{ id, kind: 'prey'|'danger', r, ratio, pts }] }
 */
export function createCourse(opt = {}) {
  const C = cfg(opt);
  let ids = new Set();
  let keepCross = null;
  const api = {
    data: null,
    cross: null,
    stats: { n: 0, ms: 0, max: 0 },
    /** Muss neu gerechnet werden? (Weltzeit seit der letzten Berechnung zu gross, z. B. bei Zeitstufe x20) */
    stale(w) {
      return !!api.data && w.t - api.data.t0 > C.maxAge;
    },
    get ids() {
      return ids;
    },
    reset() {
      ids = new Set();
      keepCross = null;
      api.data = null;
      api.cross = null;
    },
    update(w) {
      const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
      const p = w.player;
      const bodies = courseSelect(w, ids, C);
      ids = new Set(bodies.map((b) => b.id));
      const tracks = bodies.map((b) => {
        const show = courseShow(b, C);
        return { id: b.id, kind: b.m / p.m >= C.dangerRatio ? 'danger' : 'prey', r: Math.sqrt(b.m), ratio: b.m / p.m, show, pts: courseTrack(w, b, { ...C, horizon: show + C.maxAge + C.step * 2 }) };
      });
      api.data = tracks.length ? { t0: w.t, step: C.step, tracks } : null;
      if (typeof performance !== 'undefined') {
        const ms = performance.now() - t0;
        api.stats.n++;
        api.stats.ms += ms;
        if (ms > api.stats.max) api.stats.max = ms;
      }
      return api.data;
    },
    /** Kreuzung mit der Bahnvorschau neu bestimmen (guenstig: nur Interpolation). */
    updateCross(w, pv) {
      api.cross = api.data && pv ? courseCross(w, pv, api.data.tracks, api.data.step, w.t - api.data.t0, keepCross, C) : null;
      keepCross = api.cross ? api.cross.id : null;
      return api.cross;
    },
  };
  return api;
}
