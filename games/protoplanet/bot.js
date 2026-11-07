// Bot: spielt mit derselben Physik (play.js) in Node. Handelt alle T.bot.every Schritte (0,25 s Spielzeit), Zeitstufe immer x1.
// Beute = kleinere Koerper mit bestem Verhaeltnis Masse / (Abfangzeit + Ausstosskosten); weicht groesseren Koerpern aus, die bei
// linearer Vorhersage zu nah kommen; stoesst so wenig aus wie noetig.
import { T } from './tune.js';
import { createPlay } from './play.js';

const B = T.bot;

/** Beste Annaeherung von b an p (relative lineare Bahn) im Fenster [0, horizon]. */
function approach(p, b, horizon) {
  const rx = b.x - p.x;
  const ry = b.y - p.y;
  const wx = b.vx - p.vx;
  const wy = b.vy - p.vy;
  const w2 = wx * wx + wy * wy;
  const t = w2 > 1e-12 ? Math.min(horizon, Math.max(0, -(rx * wx + ry * wy) / w2)) : 0;
  return { t, nx: rx + wx * t, ny: ry + wy * t };
}

/** Spielergeschwindigkeit um (dvx,dvy) aendern: ein Ausstoss in die Gegenrichtung mit genau passendem Anteil. */
function push(play, dvx, dvy) {
  const mag = Math.hypot(dvx, dvy);
  if (mag < 1e-9) return 0;
  const frac = Math.min(B.maxFrac, mag / (T.ejectSpeed + mag));
  return play.eject(-dvx, -dvy, frac) ? 1 : 0;
}

export function createBot() {
  return { plan: null };
}

/** Eine Entscheidung. Gibt die Zahl der Tippen zurueck (zu Testzwecken). */
export function botAct(play, st) {
  const w = play.world;
  const p = w.player;
  if (!p) return 0;
  const rp = Math.sqrt(p.m);
  const goalTarget = play.goal.type === 'absorb' ? w.bodies.find((b) => b.tag === 'target') : null;
  // Ziel 'last': jeder zaehlende Koerper (>= dustFrac x Masse, nicht eigener Ausstoss) MUSS gefressen werden, auch wenn es teuer ist
  const must = (b) => play.goal.type === 'last' && b.gf !== p.id && b.m >= T.dustFrac * p.m;
  const isPrey = (b) => b.m < B.preyRatio * p.m || (must(b) && b.m < B.lastRatio * p.m) || (b === goalTarget && b.m < 0.95 * p.m);
  
  // 1. Gefahr: groesserer (oder fast gleich grosser) Koerper, der bei linearer Vorhersage zu nah kommt
  const dangers = [];
  for (const b of w.bodies) if (b !== p && b.m >= B.dangerRatio * p.m && b !== goalTarget) dangers.push(b);
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
    let vx = p.vx + ex * T.ejectSpeed;
    let vy = p.vy + ey * T.ejectSpeed;
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
        return push(play, pick.dx, pick.dy);
      }
      if (fallback.m > now) {
        st.evade = (st.evade || 0) + 1;
        return push(play, fallback.dx, fallback.dy);
      }
    }
  }

  // 2. Beute waehlen (Bahn darf keine Gefahr kreuzen; Gewinn abzueglich Ausstosskosten, geteilt durch die Zeit).
  //    Ein einmal gewaehlter Plan (Beute + Abfangzeit) bleibt bestehen, bis er erledigt oder unsicher ist: das vermeidet Zickzack.
  const u = T.ejectSpeed;
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
    const w8 = b === goalTarget ? 3 : must(b) && b.m >= B.rivalMass ? B.rivalW : 1; // Rivalen (fast so gross wie man selbst) zuerst: sie wachsen sonst am schnellsten
    const net = b.m * w8 - B.costK * cost;
    if (!sunk && !must(b) && net < 0.15 * b.m) return null;
    return { b, score: net / (tau + B.timeBias), tau, dx: dx * f, dy: dy * f, eff };
  };
  const act = (r) => {
    if (r.eff < B.tapTol) return 0;
    st.prey = (st.prey || 0) + 1;
    return push(play, r.dx, r.dy);
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
  for (const feedOk of [false, true]) {
    for (const b of w.bodies) {
      if (b === p || b.gf === p.id || !isPrey(b)) continue; // eigene Teilchen jagt der Bot nicht
      for (const tau of B.taus) {
        const r = evalAt(b, tau, false, feedOk);
        if (r && (!best || r.score > best.score)) best = r;
      }
    }
    if (best) break;
  }
  if (!best) return 0;
  st.plan = { id: best.b.id, end: w.t + best.tau };
  return act(best);
}

/** Ein Level mit dem Bot spielen. Gibt {solved, lost, time, ejected, ejects} zurueck. */
export function playLevel(level, { maxTime = B.maxTime } = {}) {
  const play = createPlay(level);
  const st = createBot();
  while (play.status === 'running' && play.world.t < maxTime) {
    botAct(play, st);
    play.advanceSteps(B.every);
  }
  const w = play.world;
  return {
    solved: play.status === 'won',
    lost: play.status === 'lost',
    time: w.t,
    ejected: w.stats.ejected,
    ejects: w.stats.ejects,
    mass: w.player ? w.player.m : 0,
    play,
  };
}

export const median = (xs) => {
  if (!xs.length) return NaN;
  const a = xs.slice().sort((x, y) => x - y);
  const h = a.length >> 1;
  return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2;
};

/** Eine Familie mit den Parametern eines Levels ueber viele Seeds spielen. Gibt Kennzahlen zurueck. */
export function botBatch(level, seeds, opts) {
  const runs = seeds.map((seed) => {
    const r = playLevel({ ...level, seed }, opts);
    return { seed, solved: r.solved, lost: r.lost, time: r.time, ejected: r.ejected };
  });
  const ok = runs.filter((r) => r.solved);
  return {
    runs,
    n: runs.length,
    solved: ok.length,
    rate: ok.length / runs.length,
    medTime: median(ok.map((r) => r.time)),
    p90Time: ok.length ? ok.map((r) => r.time).sort((a, b) => a - b)[Math.min(ok.length - 1, Math.floor(ok.length * 0.9))] : NaN,
    medEject: median(ok.map((r) => r.ejected)),
  };
}
