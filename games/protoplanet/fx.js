// Effekte (Paket F): Partikel-Pool, Ringe, Atmen, Rueckstoss, Gefahren-Scan. REINE DARSTELLUNG: eigener Zufall, liest die Welt nur, veraendert sie nie.
// DOM-frei (zeichnen macht render.js). Harte Obergrenze der Partikel (T.fx.maxParticles), "Weniger Bewegung" nutzt einen kleinen Pool.
import { T } from './tune.js';

const F = T.fx;

// Farben der Teilchen (Index in COLORS): 0 kuehl (Beute fliesst zu dir), 1 warm (du fliesst weg), 2 weiss/Abgas, 3 gold (Sieg)
export const COLORS = [
  [140, 230, 255],
  [255, 160, 110],
  [215, 240, 255],
  [255, 226, 150],
];

/** Gefahren-Scan (rein): Koerper ab dangerRatio x Spielermasse auf Kollisionskurs. Gibt [{ id, ux, uy, k }] zurueck (k 0..1, hoechstens 3, staerkste zuerst). */
export function dangerScan(world, out = []) {
  out.length = 0;
  const p = world.player;
  if (!p) return out;
  const rp = Math.sqrt(p.m);
  const reach = F.dangerRange + 6 * rp;
  for (const b of world.bodies) {
    if (b === p || b.kind === 'attractor' || b.m < F.dangerRatio * p.m) continue;
    if (b.gf === p.id) continue; // eigener Ausstoss ist nie eine Gefahr
    const rx = b.x - p.x;
    const ry = b.y - p.y;
    const d = Math.hypot(rx, ry);
    const rs = Math.sqrt(b.m) + rp;
    const gap = d - rs;
    if (d > reach + Math.sqrt(b.m)) continue;
    let k = 0;
    if (gap <= 0) k = 1; // gerade absorbiert
    else {
      const rvx = b.vx - p.vx;
      const rvy = b.vy - p.vy;
      const v2 = rvx * rvx + rvy * rvy;
      if (v2 > 1e-6) {
        const tca = -(rx * rvx + ry * rvy) / v2;
        if (tca > 0 && tca < F.dangerT) {
          const mx = rx + rvx * tca;
          const my = ry + rvy * tca;
          if (Math.hypot(mx, my) < rs + 0.6 * rp + 0.25) k = Math.max(k, 1 - tca / F.dangerT);
        }
      }
      if (gap < 1.5 * rp) k = Math.max(k, 0.5 * (1 - gap / (1.5 * rp))); // auch ruhende Brocken, wenn man sich ihnen naehert
    }
    if (k > 0.02) out.push({ id: b.id, ux: rx / Math.max(d, 1e-6), uy: ry / Math.max(d, 1e-6), k });
  }
  out.sort((a, c) => c.k - a.k);
  if (out.length > 3) out.length = 3;
  return out;
}

export function createFx({ reduce = false, seed = 7 } = {}) {
  const N = reduce ? F.reducedParticles : F.maxParticles;
  // Pool: Struktur aus Feldern (keine Allokation pro Partikel)
  const X = new Float32Array(N);
  const Y = new Float32Array(N);
  const VX = new Float32Array(N);
  const VY = new Float32Array(N);
  const SX = new Float32Array(N); // Startpunkt (Strom)
  const SY = new Float32Array(N);
  const AGE = new Float32Array(N);
  const LIFE = new Float32Array(N); // 0 = frei
  const SIZE = new Float32Array(N); // Welteinheiten
  const COL = new Uint8Array(N);
  const KIND = new Uint8Array(N); // 1 = Strom (zum Koerper TID), 2 = frei (Abgas, Funken)
  const TID = new Int32Array(N);
  let head = 0;
  let live = 0;
  const rings = []; // { x, y, r0, r1, age, life, col, w }
  const st = { breath: 0, recoil: 0, recAng: 0, reduce };
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const smooth = new Map(); // Gefahr: id -> geglaettetes k
  const threats = [];
  const raw = [];

  function slot() {
    // naechster freier Platz ab head; ist alles belegt, wird der aelteste Platz ueberschrieben (harte Obergrenze)
    for (let i = 0; i < N; i++) {
      const j = (head + i) % N;
      if (LIFE[j] <= 0) {
        head = (j + 1) % N;
        return j;
      }
    }
    const j = head;
    head = (head + 1) % N;
    return j;
  }

  function spawn(kind, x, y, vx, vy, life, size, col, tid = 0, sx = x, sy = y) {
    const i = slot();
    X[i] = x;
    Y[i] = y;
    VX[i] = vx;
    VY[i] = vy;
    SX[i] = sx;
    SY[i] = sy;
    AGE[i] = 0;
    LIFE[i] = life;
    SIZE[i] = size;
    COL[i] = col;
    KIND[i] = kind;
    TID[i] = tid;
  }

  const fx = {
    state: st,
    threats,
    get count() {
      return live;
    },
    get capacity() {
      return N;
    },
    /** Hinueberfliessen: Teilchen vom kleineren Koerper S zum groesseren L (Strom, Ziel = Koerper L, folgt ihm). `px` = Radius des Kleineren in Pixeln (Staerke). */
    flow(S, L, px, dt, col = 0) {
      const rate = F.flowRate[0] + (F.flowRate[1] - F.flowRate[0]) * Math.min(1, px / 22);
      let n = rate * dt * (st.reduce ? 0.4 : 1);
      let c = Math.floor(n);
      if (rnd() < n - c) c++;
      const rs = Math.sqrt(S.m);
      for (let i = 0; i < c; i++) {
        const a = rnd() * Math.PI * 2;
        const rr = rs * Math.sqrt(rnd());
        const x = S.x + Math.cos(a) * rr;
        const y = S.y + Math.sin(a) * rr;
        spawn(1, x, y, 0, 0, F.flowLife[0] + (F.flowLife[1] - F.flowLife[0]) * rnd(), 0.09 + 0.1 * rnd(), col, L.id, x, y);
      }
    },
    /** Abgas: weiche Funken am ausgestossenen Teilchen. */
    puff(x, y, vx, vy, n = 3) {
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2;
        const sp = 0.25 + 0.5 * rnd();
        spawn(2, x, y, vx * 0.25 + Math.cos(a) * sp, vy * 0.25 + Math.sin(a) * sp, F.puffLife[0] + (F.puffLife[1] - F.puffLife[0]) * rnd(), 0.06 + 0.07 * rnd(), 2);
      }
    },
    /** Funkenkranz (eigene Aufnahme, Sieg). */
    burst(x, y, r, n, col = 0, speed = 1.2) {
      const cnt = st.reduce ? Math.ceil(n * 0.35) : n;
      for (let i = 0; i < cnt; i++) {
        const a = rnd() * Math.PI * 2;
        const sp = speed * (0.4 + 0.9 * rnd());
        spawn(2, x + Math.cos(a) * r, y + Math.sin(a) * r, Math.cos(a) * sp, Math.sin(a) * sp, 0.5 + 0.5 * rnd(), 0.06 + 0.08 * rnd(), col);
      }
    },
    ring(x, y, r0, r1, life = F.ringLife, col = 0, w = 1) {
      if (rings.length >= F.maxRings) rings.shift();
      rings.push({ x, y, r0, r1, age: 0, life, col, w });
    },
    /** Spieler hat Masse gewonnen (Anteil der eigenen Masse). */
    gain(frac) {
      st.breath = Math.min(1, Math.max(st.breath, frac * F.breathGain));
    },
    /** Ausstoss in Richtung `ang` (Teilchenrichtung): der Koerper staucht in dieser Richtung kurz. */
    recoil(ang) {
      st.recoil = 1;
      st.recAng = ang;
    },
    /** Gefahr (geglaettet) aus der Welt; Ergebnis in `threats` ([{ id, ux, uy, k }]). */
    scanDanger(world, dt) {
      dangerScan(world, raw);
      const seen = new Set();
      threats.length = 0;
      for (const r of raw) {
        const old = smooth.get(r.id) || 0;
        const k = r.k > old ? old + (r.k - old) * (1 - Math.exp(-F.dangerAttack * dt)) : r.k;
        smooth.set(r.id, k);
        seen.add(r.id);
        threats.push({ id: r.id, ux: r.ux, uy: r.uy, k });
      }
      for (const [id, k] of smooth) {
        if (seen.has(id)) continue;
        const nk = k * Math.exp(-F.dangerDecay * dt);
        if (nk < 0.02) smooth.delete(id);
        else smooth.set(id, nk);
      }
      return threats;
    },
    /** Hoechste Gefahr (0..1). */
    get danger() {
      let m = 0;
      for (const t of threats) if (t.k > m) m = t.k;
      return m;
    },
    /** Findet ueberlappende Paare und laesst Masse zum Groesseren fliessen (Spieler zuerst). `visible(x,y,r)` begrenzt auf das Bild. */
    scanFlow(world, dt, scale, visible) {
      const bs = world.bodies;
      const p = world.player;
      if (!p) return 0;
      let pairs = 0;
      const n = bs.length;
      for (let i = 0; i < n && pairs < F.flowPairs; i++) {
        const a = bs[i];
        if (a.kind === 'attractor') continue;
        if (a !== p) continue; // nur Paare mit dem Spieler: Welt-Absorptionen bleiben ruhig (Leistung, Lesbarkeit)
        const ra = Math.sqrt(a.m);
        for (let j = 0; j < n && pairs < F.flowPairs; j++) {
          const b = bs[j];
          if (b === a || b.kind === 'attractor') continue;
          if (b.gf === a.id && a === p) continue; // eigener frischer Ausstoss
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const rb = Math.sqrt(b.m);
          if (dx > ra + rb || dx < -(ra + rb) || dy > ra + rb || dy < -(ra + rb)) continue;
          if (dx * dx + dy * dy >= (ra + rb) * (ra + rb)) continue;
          const small = b.m < a.m ? b : a;
          const big = small === a ? b : a;
          if (visible && !visible(small.x, small.y, Math.sqrt(small.m))) continue;
          pairs++;
          const eaten = small === p; // du wirst gefressen: warme Teilchen
          fx.flow(small, big, Math.sqrt(small.m) * scale, dt, eaten ? 1 : 0);
        }
      }
      return pairs;
    },
    update(dt, world) {
      st.breath *= Math.exp(-dt / F.breathTau);
      st.recoil *= Math.exp(-dt / F.recoilTau);
      if (st.breath < 0.002) st.breath = 0;
      if (st.recoil < 0.002) st.recoil = 0;
      let byId = null;
      let cnt = 0;
      for (let i = 0; i < N; i++) {
        if (LIFE[i] <= 0) continue;
        AGE[i] += dt;
        if (AGE[i] >= LIFE[i]) {
          LIFE[i] = 0;
          continue;
        }
        cnt++;
        if (KIND[i] === 2) {
          X[i] += VX[i] * dt;
          Y[i] += VY[i] * dt;
          const k = Math.exp(-1.6 * dt);
          VX[i] *= k;
          VY[i] *= k;
        } else {
          if (!byId) {
            byId = new Map();
            for (const b of world.bodies) byId.set(b.id, b);
          }
          const t = byId.get(TID[i]);
          if (!t) {
            LIFE[i] = 0; // Ziel weg (komplett absorbiert): der Strom endet
            continue;
          }
          const u = AGE[i] / LIFE[i];
          const e = u * u * (3 - 2 * u);
          X[i] = SX[i] + (t.x - SX[i]) * e;
          Y[i] = SY[i] + (t.y - SY[i]) * e;
        }
      }
      live = cnt;
      for (let i = rings.length - 1; i >= 0; i--) {
        rings[i].age += dt;
        if (rings[i].age >= rings[i].life) rings.splice(i, 1);
      }
    },
    clear() {
      LIFE.fill(0);
      rings.length = 0;
      smooth.clear();
      threats.length = 0;
      st.breath = 0;
      st.recoil = 0;
      live = 0;
    },
    /** Zeichnen: `dots` = Sprites je Farbe (Kantenlaenge dotSize), toX/toY/sc = Kamera. */
    draw(ctx, toX, toY, sc, dots, dotSize, W, H) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < N; i++) {
        if (LIFE[i] <= 0) continue;
        const u = AGE[i] / LIFE[i];
        const x = toX(X[i]);
        const y = toY(Y[i]);
        if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
        let a;
        let sz;
        if (KIND[i] === 1) {
          a = Math.sin(Math.PI * Math.min(1, u * 1.15)) * 0.9; // erscheint, fliesst, geht im Ziel auf
          sz = Math.max(2.4, SIZE[i] * sc);
        } else {
          a = (1 - u) * (1 - u) * 0.85;
          sz = Math.max(1.4, SIZE[i] * sc * (1 + u * 0.6));
        }
        ctx.globalAlpha = a;
        const d = sz * 3.2;
        ctx.drawImage(dots[COL[i]], x - d / 2, y - d / 2, d, d);
      }
      ctx.globalAlpha = 1;
      for (const r of rings) {
        const u = r.age / r.life;
        const e = 1 - (1 - u) * (1 - u);
        const rad = (r.r0 + (r.r1 - r.r0) * e) * sc;
        const c = COLORS[r.col];
        ctx.lineWidth = (3.4 - 2.2 * u) * r.w;
        ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${(1 - u) * 0.75})`;
        ctx.beginPath();
        ctx.arc(toX(r.x), toY(r.y), Math.max(1, rad), 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = (10 - 6 * u) * r.w;
        ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${(1 - u) * 0.12})`;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  };
  return fx;
}

/**
 * Zwischenbild zweier Schnappschuss-Welten fuer den sichtbaren Rueckwaertslauf (reine Darstellung): a = neuer, b = aelter, k 0..1 von a nach b.
 * Koerper in beiden werden gemischt; nur in a (inzwischen entstanden, z. B. Ausstoss) schrumpfen weg, nur in b (inzwischen absorbiert) wachsen zurueck.
 */
export function blendWorlds(a, b, k) {
  const inB = new Map();
  for (const x of b.bodies) inB.set(x.id, x);
  const lerp = (u, v) => u + (v - u) * k;
  const bodies = [];
  const used = new Set();
  for (const x of a.bodies) {
    const y = inB.get(x.id);
    if (y) {
      used.add(x.id);
      bodies.push({ ...x, x: lerp(x.x, y.x), y: lerp(x.y, y.y), vx: lerp(x.vx, y.vx), vy: lerp(x.vy, y.vy), m: lerp(x.m, y.m) });
    } else {
      const m = x.m * (1 - k);
      if (m > 1e-5) bodies.push({ ...x, m });
    }
  }
  for (const y of b.bodies) {
    if (used.has(y.id)) continue;
    const m = y.m * k;
    if (m > 1e-5) bodies.push({ ...y, m });
  }
  const player = bodies.find((q) => q.kind === 'player') || null;
  return { ...a, t: lerp(a.t, b.t), bodies, player, lostTo: null };
}
