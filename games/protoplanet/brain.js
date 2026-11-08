// Gemeinsames Gehirn von Bot und Jaeger: waehlt zu einem Koerper `p` (Spieler oder Jaeger) die gewuenschte Geschwindigkeitsaenderung.
// Beute = kleinere Koerper mit bestem Verhaeltnis Masse / (Abfangzeit + Ausstosskosten); weicht groesseren Koerpern aus, die bei
// linearer Vorhersage zu nah kommen; stoesst so wenig aus wie noetig. Der Aufrufer bestimmt Takt, Fehler und das eigentliche Ausstossen.
// DOM-frei, kein Zufall (Zoegern, Zielfehler und Reaktionszeit gehoeren dem Aufrufer, siehe hunter.js).
import { T } from './tune.js';

/** Beste Annaeherung von b an p (relative lineare Bahn) im Fenster [0, horizon]. */
export function approach(p, b, horizon) {
  const rx = b.x - p.x;
  const ry = b.y - p.y;
  const wx = b.vx - p.vx;
  const wy = b.vy - p.vy;
  const w2 = wx * wx + wy * wy;
  const t = w2 > 1e-12 ? Math.min(horizon, Math.max(0, -(rx * wx + ry * wy) / w2)) : 0;
  return { t, nx: rx + wx * t, ny: ry + wy * t };
}

/** Anteil der Masse, der fuer eine Geschwindigkeitsaenderung `mag` ausgestossen wird (hoechstens `maxFrac`). */
export const pushFrac = (mag, B) => Math.min(B.maxFrac, mag / ((B.ejectSpeed || T.ejectSpeed) + mag));

/**
 * Eine Entscheidung fuer Koerper `p` in Welt `w`. ctx = { B (Parameter wie T.bot), goal (Ziel des Spielers oder null) }.
 * st = veraenderlicher Planspeicher ({ plan }). Gibt die gewuenschte Geschwindigkeitsaenderung { dx, dy } zurueck oder null (nichts tun).
 */
export function think(w, p, ctx, st) {
  const B = ctx.B;
  const u = B.ejectSpeed || T.ejectSpeed; // Abgasgeschwindigkeit: Preis je Geschwindigkeitsaenderung (Jaeger haben einen schlechteren Antrieb)
  const goal = ctx.goal || null;
  const rp = Math.sqrt(p.m);
  // Sichtweite (nur Jaeger): was weiter als B.sense entfernt ist, existiert fuer das Gehirn nicht
  const sees = B.sense ? (b) => Math.hypot(b.x - p.x, b.y - p.y) <= B.sense : () => true;
  const goalTarget = goal && goal.type === 'absorb' ? w.bodies.find((b) => b.tag === 'target') : null;
  // Ziel 'last': jeder zaehlende Koerper (>= dustFrac x Masse, nicht eigener Ausstoss) MUSS gefressen werden, auch wenn es teuer ist
  const must = (b) => goal && goal.type === 'last' && b.gf !== p.id && b.m >= T.dustFrac * p.m;
  const isPrey = (b) => b.m < B.preyRatio * p.m || (must(b) && b.m < B.lastRatio * p.m) || (b === goalTarget && b.m < 0.95 * p.m);
  
  // 1. Gefahr: groesserer (oder fast gleich grosser) Koerper, der bei linearer Vorhersage zu nah kommt
  const dangers = [];
  for (const b of w.bodies) if (b !== p && b.m >= B.dangerRatio * p.m && b !== goalTarget && sees(b)) dangers.push(b);
  if (goalTarget && goalTarget.m >= 0.97 * p.m) dangers.push(goalTarget);
  // Kleinster Abstandsueberschuss ueber alle Gefahren (>= 0: sicher) bei Spielergeschwindigkeit (vx,vy) im Fenster [0, horizon]
  const margin = (vx, vy, horizon) => {
    let worst = Infinity;
    for (const d of dangers) {
      const rx = d.x - p.x;
      const ry = d.y - p.y;
      const wx = d.vx - vx;
      const wy = d.vy - vy;
      const w2 = wx * wx + wy * wy;
      const t = w2 > 1e-12 ? Math.min(horizon, Math.max(0, -(rx * wx + ry * wy) / w2)) : 0;
      worst = Math.min(worst, Math.hypot(rx + wx * t, ry + wy * t) - (rp + Math.sqrt(d.m) + B.margin));
    }
    return worst;
  };
  const clearOf = (vx, vy, horizon) => margin(vx, vy, horizon) >= 0;
  // Koerper, die ein ausgestossenes Teilchen fuettern wuerde: Gefahren UND alle Rivalen ab feedRatio x Spielermasse (sonst wachsen sie und fressen den Vorrat)
  const feeders = w.bodies.filter((b) => b !== p && b.gf !== p.id && b.m >= B.feedRatio * p.m && b !== goalTarget);
  const feedsDanger = (ex, ey) => {
    // Teilchenbahn (mit Abprallen am Rand) gegen die Koerper, die es fuettern wuerde, B.feedHorizon Sekunden voraus
    const len = Math.hypot(ex, ey);
    if (!(len > 1e-9) || !feeders.length) return false;
    ex /= len;
    ey /= len;
    const R = w.arenaR;
    let x = p.x + ex * (rp + 0.2);
    let y = p.y + ey * (rp + 0.2);
    let vx = p.vx + ex * u;
    let vy = p.vy + ey * u;
    const h = 0.1;
    for (let t = 0; t < B.feedHorizon; t += h) {
      x += vx * h;
      y += vy * h;
      const d2 = x * x + y * y;
      if (d2 > R * R) {
        const d = Math.sqrt(d2);
        const nx = x / d;
        const ny = y / d;
        const vn = vx * nx + vy * ny;
        if (vn > 0) {
          vx -= 2 * vn * nx;
          vy -= 2 * vn * ny;
        }
        x = nx * R;
        y = ny * R;
      }
      for (const d of feeders) {
        const dx = d.x + d.vx * t - x;
        const dy = d.y + d.vy * t - y;
        const rr = Math.sqrt(d.m) + 0.3;
        if (dx * dx + dy * dy < rr * rr) return true;
      }
    }
    return false;
  };
  // Fliehen (nur Jaeger, B.fleeGap): ein groesserer Koerper naeher als fleeGap (Randabstand) -> weg von ihm, bis die Geschwindigkeit von ihm weg B.fleeV erreicht
  if (B.fleeGap && dangers.length) {
    let near = null;
    for (const d of dangers) {
      const dist = Math.hypot(p.x - d.x, p.y - d.y);
      const gap = dist - rp - Math.sqrt(d.m);
      if (gap < B.fleeGap && (!near || gap < near.gap)) near = { d, gap, dist };
    }
    if (near && near.dist > 1e-9) {
      const ux = (p.x - near.d.x) / near.dist;
      const uy = (p.y - near.d.y) / near.dist;
      const away = (p.vx - near.d.vx) * ux + (p.vy - near.d.vy) * uy;
      const want = B.fleeV * (1 - Math.max(0, near.gap) / B.fleeGap * 0.5);
      if (away < want) return { dx: ux * (want - away), dy: uy * (want - away) };
    }
  }
  if (dangers.length) {
    const now = margin(p.vx, p.vy, B.horizon);
    if (now < 0) {
      // kleinste Geschwindigkeitsaenderung (in 16 Richtungen), nach der nichts mehr zu nah kommt; sonst die mit dem groessten Abstand
      let fallback = { dx: 0, dy: 0, m: now };
      let pick = null;
      for (let mag = 0.1; mag <= 2.6; mag += 0.1) {
        for (let k = 0; k < 16; k++) {
          const ang = (k / 16) * Math.PI * 2;
          const dx = Math.cos(ang) * mag;
          const dy = Math.sin(ang) * mag;
          const m = margin(p.vx + dx, p.vy + dy, B.horizon);
          if (m > fallback.m) fallback = { dx, dy, m };
          if (m < 0) continue;
          // Ausweichen heisst Teilchen in die Gegenrichtung: ein Teilchen, das den Gegner fuettert, kostet Strafe (also eher seitlich ausweichen)
          const score = mag + (feedsDanger(-dx, -dy) ? B.feedPenalty : 0) + 0.05 * Math.hypot(p.vx + dx, p.vy + dy);
          if (!pick || score < pick.score) pick = { dx, dy, score };
        }
        if (pick && mag > pick.score) break; // weitere Staerken koennen nicht mehr besser sein
      }
      if (pick) {
        st.evade = (st.evade || 0) + 1;
        return { dx: pick.dx, dy: pick.dy };
      }
      if (fallback.m > now) {
        st.evade = (st.evade || 0) + 1;
        return { dx: fallback.dx, dy: fallback.dy };
      }
    }
  }

  // 2. Beute waehlen (Bahn darf keine Gefahr kreuzen; Gewinn abzueglich Ausstosskosten, geteilt durch die Zeit).
  //    Ein einmal gewaehlter Plan (Beute + Abfangzeit) bleibt bestehen, bis er erledigt oder unsicher ist: das vermeidet Zickzack.
  const evalAt = (b, tau, sunk, feedOk = false) => {
    const px = b.x + b.vx * tau;
    const py = b.y + b.vy * tau;
    if (Math.hypot(px, py) + Math.sqrt(b.m) > w.arenaR) return null; // Vorhersage ohne Randabprall waere unzuverlaessig
    const dx = (px - p.x) / tau - p.vx;
    const dy = (py - p.y) / tau - p.vy;
    const dvm = Math.hypot(dx, dy);
    const slack = (B.aimSlack * (rp + Math.sqrt(b.m))) / tau;
    const eff = Math.max(0, dvm - slack);
    const f = dvm > 0 ? eff / dvm : 0;
    const nvx = p.vx + dx * f;
    const nvy = p.vy + dy * f;
    if (Math.hypot(nvx, nvy) > B.vmax && Math.hypot(nvx, nvy) > Math.hypot(p.vx, p.vy)) return null;
    if (!clearOf(nvx, nvy, tau)) return null;
    if (!feedOk && eff > B.tapTol && feedsDanger(-dx * f, -dy * f)) return null; // Teilchen wuerde einen grossen Koerper fuettern und anstossen
    const cost = (1 - Math.exp(-eff / u)) * p.m;
    const w8 = b === goalTarget ? 3 : b.kind === 'player' && B.playerW ? B.playerW : must(b) && b.m >= B.rivalMass ? B.rivalW : 1; // Rivalen (fast so gross wie man selbst) zuerst: sie wachsen sonst am schnellsten
    const net = b.m * w8 - B.costK * cost;
    if (!sunk && !must(b) && net < 0.15 * b.m) return null;
    return { b, score: net / (tau + B.timeBias), tau, dx: dx * f, dy: dy * f, eff };
  };
  const act = (r) => {
    if (r.eff < B.tapTol) return null;
    st.prey = (st.prey || 0) + 1;
    return { dx: r.dx, dy: r.dy };
  };
  if (st.plan) {
    const cur = w.bodies.find((b) => b.id === st.plan.id);
    const left = st.plan.end - w.t;
    const r = cur && left >= 0.6 && isPrey(cur) ? evalAt(cur, left, true) : null;
    if (r) return act(r);
    st.plan = null;
  }
  let best = null;
  // zweiter Durchgang erlaubt fuettern, damit der Bot nie stehen bleibt (wenn jede Richtung einen Koerper traefe)
  // dritter Durchgang (nur wenn sonst nichts lohnt): auch Beute nehmen, die weniger bringt als sie kostet (ein Mensch wuerde auch irgendwo anfangen, statt zu warten)
  const passes = [[false, false], [true, false]];
  if (goal && (goal.type === 'largest' || goal.type === 'mass')) passes.push([true, true]); // 'last'/'absorb' haben mit `must`/Zielkoerper immer etwas zu tun
  for (const [feedOk, loose] of passes) {
    for (const b of w.bodies) {
      if (b === p || b.gf === p.id || !isPrey(b) || !sees(b)) continue; // eigene Teilchen jagt der Bot nicht
      if (B.sated && p.m > B.sated && b.kind !== 'player') continue; // ein satter Jaeger jagt nur noch den Spieler
      for (const tau of B.taus) {
        const r = evalAt(b, tau, loose, feedOk);
        if (r && (!best || r.score > best.score)) best = r;
      }
    }
    if (best) break;
  }
  if (!best) return null;
  st.plan = { id: best.b.id, end: w.t + best.tau };
  return act(best);
}
