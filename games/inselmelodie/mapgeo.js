// Geometrie der Abenteuerkarte (DOM-frei): ein geschwungener Seeweg durch alle Inseln.
// Weltkoordinaten (u, v): u = entlang der Reise 0..L, v = quer dazu 0..B. Quer liegt u waagrecht, hochkant senkrecht.

export const L = 3000;
export const B = 1000;

/** Wegpunkte des Seewegs. `island` markiert den Anlegepunkt einer Insel. */
export const WAYPOINTS = [
  { u: 60, v: 520 },
  { u: 300, v: 640, island: 'i0' },
  { u: 520, v: 860 },
  { u: 700, v: 560 },
  { u: 930, v: 300, island: 'i1' },
  { u: 1150, v: 150 },
  { u: 1310, v: 480 },
  { u: 1530, v: 700, island: 'i2' },
  { u: 1760, v: 870 },
  { u: 1900, v: 470 },
  { u: 2130, v: 300, island: 'i3' },
  { u: 2360, v: 140 },
  { u: 2500, v: 520 },
  { u: 2720, v: 690, island: 'i4' },
  { u: 2940, v: 560 },
];

/** Kleiner Schmuck auf dem Meer (Wellen, Felsen, Möwen), in Weltkoordinaten. */
export const DECO = [
  { k: 'wave', u: 160, v: 210 }, { k: 'wave', u: 450, v: 380 }, { k: 'rock', u: 610, v: 140 },
  { k: 'wave', u: 820, v: 820 }, { k: 'gull', u: 1000, v: 640 }, { k: 'wave', u: 1220, v: 860 },
  { k: 'rock', u: 1380, v: 210 }, { k: 'wave', u: 1650, v: 300 }, { k: 'gull', u: 1840, v: 180 },
  { k: 'wave', u: 2020, v: 820 }, { k: 'rock', u: 2280, v: 640 }, { k: 'wave', u: 2440, v: 330 },
  { k: 'gull', u: 2620, v: 160 }, { k: 'wave', u: 2860, v: 880 }, { k: 'rock', u: 2900, v: 250 },
];

/** Catmull-Rom durch die Wegpunkte, fein abgetastet. */
function sample(points, per = 24) {
  const out = [];
  const P = (i) => points[Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ u: f(p0.u, p1.u, p2.u, p3.u), v: f(p0.v, p1.v, p2.v, p3.v), wp: k === 0 ? i : -1 });
    }
  }
  const last = points[points.length - 1];
  out.push({ u: last.u, v: last.v, wp: points.length - 1 });
  return out;
}

/**
 * Karte für einen Bildschirm: `portrait` legt den Weg senkrecht.
 * @param {{w:number, h:number}} view Größe des sichtbaren Bereichs in px
 */
export function layoutMap(view) {
  const portrait = view.h > view.w;
  const padTop = view.padTop ?? 0; // frei für die Kopfzeile
  const padBottom = view.padBottom ?? 0; // frei für Papagei und Knopf
  const cross = portrait ? view.w : view.h - padTop - padBottom;
  const s = cross / B; // px je Welteinheit quer
  const size = Math.max(portrait ? 130 : 104, Math.min(290, 330 * s)); // Inselgröße in px
  // entlang etwas großzügiger, mindestens so, dass benachbarte Inseln (630 Einheiten) nicht überlappen
  const sa = Math.max(s * (portrait ? 1.5 : 1.05), (size * 1.6) / 630);
  const toXY = (u, v) => (portrait ? { x: v * s, y: padTop + u * sa } : { x: u * sa, y: padTop + v * s });
  const pts = sample(WAYPOINTS).map((p) => ({ ...toXY(p.u, p.v), wp: p.wp }));
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const islands = {};
  pts.forEach((p, i) => {
    const w = p.wp >= 0 ? WAYPOINTS[p.wp] : null;
    if (w && w.island) islands[w.island] = { x: p.x, y: p.y, at: len[i] };
  });
  return {
    portrait,
    width: portrait ? view.w : L * sa,
    height: portrait ? padTop + L * sa + padBottom : view.h,
    pts,
    len,
    total: len[len.length - 1],
    islands,
    islandSize: size,
    deco: DECO.map((d) => ({ ...d, ...toXY(d.u, d.v) })),
    /** Punkt und Richtung bei Weglänge `d` (px). */
    pointAt(d) {
      const t = Math.max(0, Math.min(len[len.length - 1], d));
      let lo = 0, hi = len.length - 1;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (len[m] <= t) lo = m; else hi = m;
      }
      const a = pts[lo], b = pts[hi];
      const f = len[hi] > len[lo] ? (t - len[lo]) / (len[hi] - len[lo]) : 0;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, dx: b.x - a.x, dy: b.y - a.y };
    },
    /** Anlegestelle des Bootes vor einer Insel (etwas vor dem Inselmittelpunkt auf dem Weg). */
    dockAt(id) {
      return Math.max(0, islands[id].at - size * 0.8);
    },
    /** SVG-Pfad (Polylinie) von 0 bis Länge d. */
    pathTo(d = Infinity) {
      let s2 = '';
      for (let i = 0; i < pts.length; i++) {
        if (len[i] > d) {
          const p = this.pointAt(d);
          s2 += ` L${p.x.toFixed(1)},${p.y.toFixed(1)}`;
          break;
        }
        s2 += `${i ? ' L' : 'M'}${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)}`;
      }
      return s2;
    },
  };
}

/** Sanftes Ein- und Ausfahren. */
export const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
