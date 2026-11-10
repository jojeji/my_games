// Planer des Bots fuer Gravitationslevels (Kapitel 3): VORWAERTSSIMULATION statt linearer Abfangrechnung.
// Je Entscheidung (alle T.orbit.plan.every s Spielzeit): die Bahnen aller anderen Koerper werden EINMAL vorhergesagt (nur Sterngravitation, Leapfrog mit Schritt h),
// dann wird jeder Kandidaten-Schub (dirs Richtungen x mags Staerken + "nichts tun") fuer den Spieler ebenso vorausgerechnet und ueber den Horizont bewertet:
//   + Beute: Treffer (Masse x Gewicht x exp(-t / tau)) und ein weicher Formgewinn fuer Beinahe-Treffer (Gradient, damit auch Bahnen "in die Naehe" belohnt werden),
//   - Ausstosskosten (Masse x costK), verworfen: Sturz in den Stern, Abdrift (Warnschwelle), Naehe zu Groesseren (Sicherheitsabstand).
// Geschlossener Regelkreis: nach jedem Schub wird neu geplant, ein Schub, der schon auf Kurs ist, wird nicht wiederholt (die Untaetigkeit gewinnt dann).
// DOM-frei, deterministisch (kein Zufall), schnell genug fuer die Tests (Ausduennen ueber den Bahnbereich: nur Koerper, deren Radienband das der Kandidatenbahn beruehrt).
import { T } from './tune.js';
import { attractorsOf, starOf } from './orbit.js';
import { attractorAt } from './physics.js';
import { pushFrac } from './brain.js';

const soft2 = () => T.orbit.soft * T.orbit.soft;

/**
 * Leapfrog (KDK) einer Bahn um den Stern in (sx, sy): schreibt K+1 Punkte (x, y) in out. Gibt [rmin, rmax] des Abstands zum Stern in `range` zurueck.
 * srcs = Quellen der Anziehung unter den Koerpern ([{ tr, g, r }], tr = deren vorhergesagte Bahn, g = Staerke G x selfGrav x Masse), `skip` = Index der eigenen Quelle, rb = Radius dieses Koerpers.
 */
function propagate(out, x, y, vx, vy, K, h, gm, sx, sy, s2, range, srcs = null, skip = -1, rb = 0) {
  out[0] = x;
  out[1] = y;
  let lo = Infinity;
  let hi = 0;
  const hh = h * 0.5;
  const ns = srcs ? srcs.length : 0;
  const ss = T.orbit.selfSoft * T.orbit.selfSoft;
  for (let k = 1; k <= K; k++) {
    let dx = sx - x;
    let dy = sy - y;
    let d2 = dx * dx + dy * dy;
    let f = gm / ((d2 + s2) * Math.sqrt(d2 + 1e-12));
    let ax = f * dx;
    let ay = f * dy;
    for (let i = 0; i < ns; i++) {
      if (i === skip) continue;
      const S = srcs[i];
      dx = S.tr[2 * k - 2] - x;
      dy = S.tr[2 * k - 1] - y;
      d2 = dx * dx + dy * dy;
      const rr = S.r + rb;
      f = S.pl ? S.g / ((d2 + s2) * Math.sqrt(d2 + 1e-12)) : S.g / ((d2 + ss + rr * rr) * Math.sqrt(d2 + 1e-12));
      ax += f * dx;
      ay += f * dy;
    }
    vx += ax * hh;
    vy += ay * hh;
    x += vx * h;
    y += vy * h;
    dx = sx - x;
    dy = sy - y;
    d2 = dx * dx + dy * dy;
    f = gm / ((d2 + s2) * Math.sqrt(d2 + 1e-12));
    ax = f * dx;
    ay = f * dy;
    const r2 = d2;
    for (let i = 0; i < ns; i++) {
      if (i === skip) continue;
      const S = srcs[i];
      dx = S.tr[2 * k] - x;
      dy = S.tr[2 * k + 1] - y;
      d2 = dx * dx + dy * dy;
      const rr = S.r + rb;
      f = S.pl ? S.g / ((d2 + s2) * Math.sqrt(d2 + 1e-12)) : S.g / ((d2 + ss + rr * rr) * Math.sqrt(d2 + 1e-12));
      ax += f * dx;
      ay += f * dy;
    }
    vx += ax * hh;
    vy += ay * hh;
    out[2 * k] = x;
    out[2 * k + 1] = y;
    if (r2 < lo) lo = r2;
    if (r2 > hi) hi = r2;
  }
  range[0] = Math.sqrt(lo);
  range[1] = Math.sqrt(hi);
}

/** Eine Entscheidung. Gibt die gewuenschte Geschwindigkeitsaenderung { dx, dy } zurueck oder null. ctx = { goal }. st = Planspeicher. */
export function planOrbit(w, p, ctx, st, P = T.orbit.plan) {
  const atts = attractorsOf(w);
  if (!atts.length) return null;
  const A = starOf(w);
  const goal = ctx.goal || null;
  const h = P.h;
  const K = Math.round(P.horizon / h);
  const s2 = soft2();
  const u = T.ejectSpeed;
  const rS = Math.sqrt(A.m);
  const warnR = (w.grav && w.grav.warnR) || 1e9;
  const range = [0, 0];

  // --- die anderen Koerper vorhersagen (einmal) ---
  const others = [];
  const O = T.orbit;
  const G = w.grav && w.grav.selfGrav > 0 ? w.grav.selfGrav * O.selfG : 0;
  const goalTarget = goal && goal.type === 'absorb' ? w.bodies.find((b) => b.tag === 'target') : null;
  const bodies = w.bodies.filter((b) => b !== p && b.kind !== 'attractor' && b.gf !== p.id);
  // Planeten (Kapitel 5): feste Kreisbahnen, exakt vorhersagbar. Sie ziehen alle Koerper an (Attraktor-Gesetz) und sind selbst Begegnungs-Partner (Gefahr oder Beute nach Masse).
  const plSrcs = [];
  const planets = [];
  for (const a of atts) {
    if (!a.po) continue;
    const tr = new Float64Array(2 * (K + 1));
    const q = [0, 0];
    let lo = Infinity;
    let hi = 0;
    for (let k = 0; k <= K; k++) {
      attractorAt(a, w.t + k * h, q);
      tr[2 * k] = q[0];
      tr[2 * k + 1] = q[1];
    }
    lo = hi = a.po.r;
    plSrcs.push({ b: a, tr, g: a.gm, r: Math.sqrt(a.m), pl: true });
    planets.push({ b: a, tr, r: Math.sqrt(a.m), lo, hi, m: a.m, pl: true });
  }
  // Quellen der Anziehung (die schwersten, ohne den Spieler): erst allein unter dem Stern vorhergesagt, dann ziehen sie alle (auch einander) an
  const srcs = [];
  if (G > 0) {
    const heavy = bodies.filter((b) => b.m >= O.selfMin).sort((a, c) => c.m - a.m || a.id - c.id).slice(0, O.selfK);
    for (const b of heavy) {
      const tr = new Float64Array(2 * (K + 1));
      propagate(tr, b.x, b.y, b.vx, b.vy, K, h, A.gm, A.x, A.y, s2, range, plSrcs, -1, Math.sqrt(b.m));
      srcs.push({ b, tr, g: G * b.m, r: Math.sqrt(b.m) });
    }
  }
  const srcOnly = [...srcs.filter((S) => S.tr), ...plSrcs]; // Planeten zuletzt: ein eigener Quellen-Index (si) bleibt gueltig
  for (const b of bodies) {
    const tr = new Float64Array(2 * (K + 1));
    const si = srcOnly.findIndex((S) => S.b === b);
    propagate(tr, b.x, b.y, b.vx, b.vy, K, h, A.gm, A.x, A.y, s2, range, srcOnly, si, Math.sqrt(b.m));
    others.push({ b, tr, r: Math.sqrt(b.m), lo: range[0], hi: range[1], m: b.m });
  }
  for (const pl of planets) others.push(pl);
  const mustAll = goal && goal.type === 'last';
  const costK = goal && (goal.type === 'last' || goal.type === 'absorb') ? P.costKGoal : P.costK; // Ziel `last`/`absorb`: Fertigwerden zaehlt mehr als Masse sparen
  const wOf = (o) => {
    if (o.b === goalTarget) return 3;
    if (mustAll && o.m >= 1) return 1.6;
    return 1;
  };

  const path = new Float64Array(2 * (K + 1));
  const decay = Math.exp(-h / P.tau);

  /** Bewertet einen Schub (dvx, dvy). Gibt { score, clear, ok } zurueck. */
  const evalPush = (dvx, dvy) => {
    const mag = Math.hypot(dvx, dvy);
    const cost = (1 - Math.exp(-mag / u)) * p.m;
    const pm = p.m - cost;
    const rp = Math.sqrt(pm);
    propagate(path, p.x, p.y, p.vx + dvx, p.vy + dvy, K, h, A.gm, A.x, A.y, s2, range, srcOnly, -1, rp);
    let ok = true;
    let clear = Infinity;
    const lim = rS + rp + P.starMargin;
    if (range[0] < lim) {
      ok = false;
      clear = Math.min(clear, range[0] - lim);
    }
    // Abdrift: Warnschwelle nicht beruehren (auch die Bahn ausserhalb des Sterns zaehlt vom Ursprung)
    for (let k = 0; k <= K; k += 2) {
      const d = Math.hypot(path[2 * k], path[2 * k + 1]);
      if (d > warnR * 0.97) {
        ok = false;
        clear = Math.min(clear, (warnR * 0.97 - d) * 0.5);
        break;
      }
    }
    let score = -costK * cost;
    let hits = 0; // Summe der sicheren Treffer (Gewinn) auf dieser Bahn
    const near = P.near;
    let urgent = false;
    const alert = P.alertGap;
    for (let j = 0; j < others.length; j++) {
      const o = others[j];
      const rsum = rp + o.r;
      const slackR = rsum * near + P.margin;
      if (o.hi + slackR < range[0] || o.lo - slackR > range[1]) continue; // Radienbaender beruehren sich nicht
      const tr = o.tr;
      const danger = o.m >= P.dangerRatio * pm;
      let dmin = Infinity;
      let tmin = 0;
      let vrel = 0;
      for (let k = 0; k < K; k++) {
        const ax = tr[2 * k] - path[2 * k];
        const ay = tr[2 * k + 1] - path[2 * k + 1];
        const dx = tr[2 * k + 2] - path[2 * k + 2] - ax;
        const dy = tr[2 * k + 3] - path[2 * k + 3] - ay;
        const dd = dx * dx + dy * dy;
        let s = dd > 1e-12 ? -(ax * dx + ay * dy) / dd : 0;
        s = s < 0 ? 0 : s > 1 ? 1 : s;
        const ex = ax + dx * s;
        const ey = ay + dy * s;
        const d = Math.sqrt(ex * ex + ey * ey);
        if (d < dmin) {
          dmin = d;
          tmin = (k + s) * h;
          vrel = Math.sqrt(dd) / h;
          if (danger && d < rsum + P.margin + (o.pl ? 0 : P.reactT * vrel)) break;
        }
      }
      if (danger) {
        const need = o.pl ? rsum + P.margin : rsum + P.margin + P.reactT * vrel; // schnelle Begegnungen brauchen mehr Abstand: der Planer kann nur alle `every` s reagieren
        if (dmin < need) {
          ok = false;
          clear = Math.min(clear, dmin - need);
        }
        if (dmin < alert && tmin < P.alertT) urgent = true;
        continue;
      }
      if (!(o.m < 0.85 * pm)) continue; // nicht fressbar (zu gross nach dem Ausstoss)
      const needed = o.b === goalTarget || (mustAll && o.b.m >= T.dustFrac * p.m); // Ziel-Koerper muessen GANZ weg: auch ein Rest ist etwas wert
      const wt = wOf(o) * (needed ? Math.max(o.m, P.finish * pm) : o.m) * Math.exp(-tmin / P.tau);
      // Anteil, der bei der engsten Begegnung absorbiert wird (Formel aus physics.js absorb: Masse fliesst, bis sich beide gerade beruehren; ganz, wenn d^2 <= M)
      const M = pm + o.m;
      let frac = 0;
      if (dmin * dmin <= M) frac = 1;
      else if (dmin < rsum) {
        const rS = (dmin - Math.sqrt(Math.max(0, 2 * M - dmin * dmin))) / 2;
        frac = 1 - (rS * rS) / o.m;
      }
      score += wt * frac;
      if (frac > 0.85) hits += wt;
      if (frac < 1) {
        const x = Math.max(0, dmin - rsum) / rsum; // Beinahe-Treffer: breiter und enger Gradient (die Verfeinerung unten klettert daran hoch)
        score += wt * (1 - frac) * (P.shapeWide * Math.exp(-(x / P.wideW) * (x / P.wideW)) + P.shapeNarrow * Math.exp(-(x / P.narrowW) * (x / P.narrowW)));
      }
    }
    return { score, clear, ok, urgent, gain: score + costK * cost, hits };
  };

  // --- Kandidaten: grobes Raster (Richtungen x Staerken), die besten werden durch Hangklettern verfeinert ---
  const base = evalPush(0, 0);
  st.wait = base.urgent || !base.ok ? P.everyUrgent : P.every; // naht ein Groesserer, wird oefter entschieden
  let fallback = null; // wenn alles verworfen wird: der Schub mit der groessten Luft
  if (!base.ok) fallback = { dx: 0, dy: 0, clear: base.clear };
  // Die Untaetigkeit trifft schon sicher (Abfangkurs steht): nichts zu tun, die teure Suche entfaellt
  if (base.ok && base.hits >= P.onCourse * p.m) return null;
  const good = [];
  const heading = Math.atan2(p.vy, p.vx);
  const consider = (dvx, dvy) => {
    const r = evalPush(dvx, dvy);
    if (!r.ok) {
      if (!fallback || r.clear > fallback.clear) fallback = { dx: dvx, dy: dvy, clear: r.clear };
      return null;
    }
    return { dx: dvx, dy: dvy, score: r.score, gain: r.gain };
  };
  // dichte Suche entlang der Flugrichtung (vor/zurueck): hier wirkt ein Schub auf die Umlaufzeit, und ein Treffer verlangt eine Genauigkeit von ~1 % der Umlaufzeit
  const hx = Math.cos(heading);
  const hy = Math.sin(heading);
  for (let mag = P.lineMin; mag <= P.lineMax; mag *= P.lineStep) {
    for (const sg of [1, -1]) {
      const c = consider(hx * mag * sg, hy * mag * sg);
      if (c) good.push(c);
    }
  }
  for (const mag of P.mags) {
    for (let k = 0; k < P.dirs; k++) {
      if (k % (P.dirs / 2) === 0) continue; // schon in der dichten Suche
      const a = heading + (k / P.dirs) * Math.PI * 2;
      const c = consider(Math.cos(a) * mag, Math.sin(a) * mag);
      if (c) good.push(c);
    }
  }
  let best = good.reduce((a, c) => (!a || c.score > a.score ? c : a), null);
  good.sort((x, y) => y.gain - x.gain); // Saat fuer die Verfeinerung: das groesste Potenzial (Gewinn ohne Kosten), nicht der billigste Schub
  // Verfeinerung: die besten Kandidaten, die sich in der Richtung unterscheiden, klettern mit schrumpfender Schrittweite
  const seeds = [];
  for (const c of good) {
    if (seeds.length >= P.refine) break;
    if (seeds.every((q) => Math.hypot(q.dx - c.dx, q.dy - c.dy) > 0.12)) seeds.push(c);
  }
  for (const c0 of seeds) {
    let c = c0;
    let stepSize = Math.max(0.04, Math.hypot(c.dx, c.dy) * 0.35);
    for (let it = 0; it < P.climb; it++) {
      let moved = null;
      for (const [mx, my] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = consider(c.dx + mx * stepSize, c.dy + my * stepSize);
        if (n && n.score > (moved ? moved.score : c.score)) moved = n;
      }
      if (moved) c = moved;
      else stepSize *= 0.5;
    }
    if (!best || c.score > best.score) best = c;
  }
  if (!base.ok) {
    // die Untaetigkeit ist unsicher: bester sicherer Schub, sonst der mit der groessten Luft
    if (best) return { dx: best.dx, dy: best.dy };
    return fallback && (fallback.dx || fallback.dy) ? { dx: fallback.dx, dy: fallback.dy } : null;
  }
  if (st.debug) st.debug({ base: base.score, best: best && best.score, bd: best && Math.hypot(best.dx, best.dy) });
  if (best && best.score > base.score + P.minGain * p.m) return { dx: best.dx, dy: best.dy };
  return null;
}

export { pushFrac };
