// Darstellung (Canvas 2D): glühende Kreise aus vorgezeichneten Sprites, Farbe relativ zum Spieler, Ring um groessere Koerper,
// Rand-Pfeile, Arena-Ring, Sternenstaub. Keine shadowBlur pro Koerper.
import { T } from './tune.js';
import { scaleOf } from './camera.js';

const SPRITE = 128; // Sprite-Kantenlaenge; der Koerper selbst fuellt den Radius 32 (Rest = Glow)
const CORE = 32;

// Farbstufen von "viel kleiner" (kuehl) ueber "gleich" (blass) bis "viel groesser" (warm)
const ANCHORS = [
  [0, [205, 72, 46]],
  [0.36, [176, 62, 58]],
  [0.5, [60, 22, 84]],
  [0.62, [36, 88, 60]],
  [1, [6, 86, 52]],
];

function ramp(t) {
  for (let i = 1; i < ANCHORS.length; i++) {
    if (t <= ANCHORS[i][0]) {
      const [t0, c0] = ANCHORS[i - 1];
      const [t1, c1] = ANCHORS[i];
      const k = (t - t0) / (t1 - t0);
      return c0.map((v, j) => v + (c1[j] - v) * k);
    }
  }
  return ANCHORS[ANCHORS.length - 1][1];
}

function makeSprite(h, s, l, { rim = 0.9, glow = 0.42 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = SPRITE;
  const g = c.getContext('2d');
  const mid = SPRITE / 2;
  const glowG = g.createRadialGradient(mid, mid, CORE * 0.9, mid, mid, mid);
  glowG.addColorStop(0, `hsla(${h},${s}%,${Math.min(90, l + 14)}%,${glow})`);
  glowG.addColorStop(1, `hsla(${h},${s}%,${l}%,0)`);
  g.fillStyle = glowG;
  g.fillRect(0, 0, SPRITE, SPRITE);
  const core = g.createRadialGradient(mid - CORE * 0.3, mid - CORE * 0.35, CORE * 0.1, mid, mid, CORE);
  core.addColorStop(0, `hsl(${h},${Math.max(10, s - 10)}%,${Math.min(96, l + 28)}%)`);
  core.addColorStop(0.65, `hsl(${h},${s}%,${l}%)`);
  core.addColorStop(1, `hsl(${h},${s}%,${Math.max(8, l - 18)}%)`);
  g.fillStyle = core;
  g.beginPath();
  g.arc(mid, mid, CORE, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = `hsla(${h},${s}%,${Math.min(96, l + 30)}%,${rim})`;
  g.beginPath();
  g.arc(mid, mid, CORE - 1, 0, Math.PI * 2);
  g.stroke();
  return c;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const steps = T.glowSteps;
  const sprites = [];
  for (let i = 0; i < steps; i++) {
    const [h, s, l] = ramp(i / (steps - 1));
    sprites.push(makeSprite(Math.round(h), Math.round(s), Math.round(l)));
  }
  const playerSprite = makeSprite(188, 100, 80, { rim: 1, glow: 0.6 });
  // Protostern (Kapitel 3): Korona als Sprite (Kern = Radius 1/3 der Kantenlaenge), Pulsieren nur ueber die Skalierung (kein shadowBlur)
  const STAR = 256;
  const starSprite = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = STAR;
    const g = c.getContext('2d');
    const mid = STAR / 2;
    const glow = g.createRadialGradient(mid, mid, STAR * 0.1, mid, mid, mid);
    glow.addColorStop(0, 'rgba(255,214,140,0.85)');
    glow.addColorStop(0.28, 'rgba(255,150,70,0.42)');
    glow.addColorStop(0.6, 'rgba(210,80,60,0.13)');
    glow.addColorStop(1, 'rgba(160,50,90,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, STAR, STAR);
    const core = g.createRadialGradient(mid - STAR * 0.03, mid - STAR * 0.03, 2, mid, mid, STAR / 6);
    core.addColorStop(0, '#fffbe8');
    core.addColorStop(0.55, '#ffd27a');
    core.addColorStop(1, '#ff9b4a');
    g.fillStyle = core;
    g.beginPath();
    g.arc(mid, mid, STAR / 6, 0, Math.PI * 2);
    g.fill();
    return c;
  })();
  // Sternenstaub: feste Punkte (einfacher LCG, nur Darstellung)
  const stars = [];
  let seed = 91;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < T.starCount; i++) stars.push({ x: rnd(), y: rnd(), z: 0.3 + rnd() * 0.7, a: 0.15 + rnd() * 0.4 });

  const view = { w: 300, h: 500, dpr: 1 };
  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, T.dprMax);
    view.w = Math.max(1, r.width);
    view.h = Math.max(1, r.height);
    view.dpr = dpr;
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const spriteFor = (q) => {
    const t = 0.5 + Math.log2(Math.max(1e-3, q)) / 6;
    return sprites[Math.max(0, Math.min(steps - 1, Math.round(t * (steps - 1))))];
  };

  /**
   * s: { world, cam, now (s), reduceMotion, targetTag, aim: {x,y}|null }
   */
  function draw(s) {
    const { world, cam, now, reduceMotion } = s;
    const W = view.w;
    const H = view.h;
    ctx.clearRect(0, 0, W, H);
    const orbit = world.arenaR <= 0; // Kapitel 3: offener Raum um einen Protostern, waermere Farbwelt
    const bg = ctx.createRadialGradient(W / 2, H * 0.45, 10, W / 2, H * 0.45, Math.max(W, H) * 0.8);
    bg.addColorStop(0, orbit ? '#171024' : '#0b1224');
    bg.addColorStop(1, orbit ? '#06040a' : '#03050a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const sc = scaleOf(cam, W);
    // Sternenstaub (Parallax nur ohne "Weniger Bewegung")
    for (const st of stars) {
      let x = st.x * W;
      let y = st.y * H;
      if (!reduceMotion) {
        x = (((x - cam.x * sc * 0.06 * st.z) % W) + W) % W;
        y = (((y - cam.y * sc * 0.06 * st.z) % H) + H) % H;
      }
      ctx.fillStyle = `rgba(190,210,255,${st.a})`;
      ctx.fillRect(x, y, st.z * 1.6, st.z * 1.6);
    }

    const toX = (x) => W / 2 + (x - cam.x) * sc;
    const toY = (y) => H / 2 + (y - cam.y) * sc;

    // Offener Raum (Kapitel 3): feine Bahnringe als Orientierung, Warn- und Abdriftgrenze
    let star = null;
    if (orbit) {
      for (const b of world.bodies) if (b.kind === 'attractor') star = b;
      const g = world.grav || {};
      const cx = toX(star ? star.x : 0);
      const cy = toY(star ? star.y : 0);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,190,130,0.09)';
      for (const rr of g.rings || []) {
        ctx.beginPath();
        ctx.arc(cx, cy, rr * sc, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([2, 9]);
      if (g.warnR > 0) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,170,80,0.38)';
        ctx.beginPath();
        ctx.arc(cx, cy, g.warnR * sc, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (g.loseR > 0) {
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = 'rgba(255,90,80,0.5)';
        ctx.beginPath();
        ctx.arc(cx, cy, g.loseR * sc, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Arena
    if (world.arenaR > 0) {
      const cx = toX(0);
      const cy = toY(0);
      const R = world.arenaR * sc;
      ctx.lineWidth = 8;
      ctx.strokeStyle = 'rgba(110,200,255,0.07)';
      ctx.beginPath();
      ctx.arc(cx, cy, R + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(140,215,255,0.5)';
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
    }

    const p = world.player;
    const mP = p ? p.m : 1;
    const pulse = reduceMotion ? 0.6 : 0.55 + 0.25 * Math.sin(now * 2.2);
    const arrows = [];
    const hunterIds = new Set();
    for (const b of world.bodies) if (b.kind === 'hunter') hunterIds.add(b.id);

    for (const b of world.bodies) {
      if (b === p || b.kind === 'attractor') continue;
      const r = Math.sqrt(b.m) * sc;
      const x = toX(b.x);
      const y = toY(b.y);
      const q = b.m / mP;
      if (p && b.gf === p.id && b.kind !== 'player') {
        // eigener Ausstoss: gut sichtbar (helles Teilchen mit Halo und kurzem Schweif), auch wenn es winzig ist
        if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
        const rr = Math.max(r, 2.8);
        const tx = x - b.vx * sc * 0.14;
        const ty = y - b.vy * sc * 0.14;
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(2, rr * 1.3);
        ctx.strokeStyle = 'rgba(160,225,255,0.28)';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.fillStyle = 'rgba(150,225,255,0.3)';
        ctx.beginPath();
        ctx.arc(x, y, rr + 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e4f8ff';
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (b.gf && hunterIds.has(b.gf) && b.kind !== 'hunter') {
        // Ausstoss eines Jaegers: warmes Teilchen mit kurzem Schweif, auch wenn es winzig ist (sein Antrieb soll sichtbar sein)
        if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
        const rr = Math.max(r, 2.2);
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1.6, rr * 1.1);
        ctx.strokeStyle = 'rgba(255,170,120,0.25)';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - b.vx * sc * 0.1, y - b.vy * sc * 0.1);
        ctx.stroke();
        ctx.fillStyle = '#ffd2b0';
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const onScreen = x + r > -40 && x - r < W + 40 && y + r > -40 && y - r < H + 40;
      if (!onScreen) {
        if (p && (q > 1.05 || b.tag === 'target')) arrows.push({ b, x, y, q });
        continue;
      }
      if (r < 1.2 && b.kind !== 'hunter') {
        ctx.fillStyle = q > 1.1 ? '#ff9a5a' : '#79d6e8';
        ctx.fillRect(x - 1, y - 1, 2, 2);
        continue;
      }
      const k = r / CORE;
      ctx.drawImage(spriteFor(q), x - (SPRITE / 2) * k, y - (SPRITE / 2) * k, SPRITE * k, SPRITE * k);
      if (q > 1.1) {
        const rock = b.tag === 'rock'; // Brocken: dicker Warnring und zweiter Ring, damit sie als Gefahr auffallen
        ctx.lineWidth = rock ? 2.6 : 1.6;
        ctx.strokeStyle = `rgba(255,150,90,${pulse})`;
        ctx.beginPath();
        ctx.arc(x, y, r * (reduceMotion ? 1.3 : 1.3 + 0.05 * Math.sin(now * 2.2)) + 3, 0, Math.PI * 2);
        ctx.stroke();
        if (rock) {
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = `rgba(255,120,70,${pulse * 0.55})`;
          ctx.beginPath();
          ctx.arc(x, y, r * 1.3 + 10, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      if (b.kind === 'hunter') {
        // Jaeger: gestrichelter Ring (dreht sich), Farbe wie immer relativ zum Spieler (warm = groesser, kuehl = kleiner, weiss = gleich)
        ctx.lineWidth = 2;
        ctx.strokeStyle = q > 1.1 ? 'rgba(255,140,90,0.95)' : q < 0.9 ? 'rgba(120,225,255,0.95)' : 'rgba(235,240,255,0.95)';
        ctx.setLineDash([3, 5]);
        ctx.lineDashOffset = reduceMotion ? 0 : now * 10;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(r, 3) * 1.25 + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (b.tag === 'target') {
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,224,130,0.95)';
        ctx.setLineDash([7, 6]);
        ctx.lineDashOffset = reduceMotion ? 0 : -now * 12;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.55 + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Protostern: Korona (pulsiert, ausser bei "Weniger Bewegung"), darunter heller Kern
    if (star) {
      const x = toX(star.x);
      const y = toY(star.y);
      const rs = Math.sqrt(star.m) * sc;
      const pulseK = reduceMotion ? 1 : 1 + 0.035 * Math.sin(now * 1.3) + 0.015 * Math.sin(now * 3.1);
      const size = rs * 6 * pulseK; // Kern = 1/3 der Sprite-Kante, also Radius rs bei Kantenlaenge 6 rs
      if (x + size > 0 && x - size < W && y + size > 0 && y - size < H) ctx.drawImage(starSprite, x - size / 2, y - size / 2, size, size);
      else if (p) {
        // ausserhalb des Bildes: goldene Marke am Rand in Richtung des Sterns
        const ang = Math.atan2(y - H / 2, x - W / 2);
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        const padX = 26;
        const tx = dx !== 0 ? (W / 2 - padX) / Math.abs(dx) : Infinity;
        const ty = dy !== 0 ? Math.min((H / 2 - 74) / Math.abs(dy), (H / 2 - 74) / Math.abs(dy)) : Infinity;
        const tt = Math.min(tx, ty);
        const px = W / 2 + dx * tt;
        const py = H / 2 + dy * tt;
        ctx.save();
        ctx.translate(px, py);
        ctx.fillStyle = 'rgba(255,190,110,0.28)';
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd98a';
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.rotate(ang);
        ctx.fillStyle = 'rgba(255,217,138,0.95)';
        ctx.beginPath();
        ctx.moveTo(21, 0);
        ctx.lineTo(12, -6);
        ctx.lineTo(12, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // Bahnvorschau: gepunktete Linie vom Spieler aus, Punktabstand fest in Pixeln (die Punkte wandern mit dem Spieler: ruhig, kein Flackern), verblassend,
    // rot dort, wo die Bahn in den Stern fuehrt, bernstein jenseits der Warnschwelle
    const pv = s.preview;
    if (p && pv && pv.n > 1) {
      const GAP = 9;
      let acc = GAP * 0.5; // erster Punkt kurz vor dem Spieler-Rand
      let total = 0;
      const pts = pv.pts;
      const len = [0];
      for (let i = 1; i < pv.n; i++) {
        const sx = (pts[2 * i] - pts[2 * i - 2]) * sc;
        const sy = (pts[2 * i + 1] - pts[2 * i - 1]) * sc;
        len.push(len[i - 1] + Math.hypot(sx, sy));
      }
      total = len[pv.n - 1];
      const rpx = Math.max(2, Math.sqrt(p.m) * sc);
      let seg = 1;
      for (let d = rpx + GAP * 0.6 + acc * 0; d < total; d += GAP) {
        while (seg < pv.n - 1 && len[seg] < d) seg++;
        const l0 = len[seg - 1];
        const k = len[seg] > l0 ? (d - l0) / (len[seg] - l0) : 0;
        const wx = pts[2 * seg - 2] + (pts[2 * seg] - pts[2 * seg - 2]) * k;
        const wy = pts[2 * seg - 1] + (pts[2 * seg + 1] - pts[2 * seg - 1]) * k;
        const fl = pv.flag[seg];
        const fade = 1 - 0.8 * (d / Math.max(1, total));
        ctx.fillStyle = fl === 1 ? `rgba(255,88,70,${0.95 * fade + 0.05})` : fl === 2 ? `rgba(255,176,70,${0.9 * fade + 0.05})` : `rgba(165,232,255,${0.8 * fade + 0.05})`;
        ctx.beginPath();
        ctx.arc(toX(wx), toY(wy), fl ? 2.3 : 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      if (pv.end) {
        // Endpunkt der Bahn (Sturz / Abdrift): kleines Kreuz in Warnfarbe
        const ex = toX(pts[2 * pv.n - 2]);
        const ey = toY(pts[2 * pv.n - 1]);
        ctx.strokeStyle = pv.end === 'star' ? 'rgba(255,88,70,0.95)' : 'rgba(255,176,70,0.95)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ex - 5, ey - 5);
        ctx.lineTo(ex + 5, ey + 5);
        ctx.moveTo(ex + 5, ey - 5);
        ctx.lineTo(ex - 5, ey + 5);
        ctx.stroke();
      }
    }

    // Spieler zuletzt (liegt oben)
    if (p) {
      const r = Math.max(2, Math.sqrt(p.m) * sc);
      const x = toX(p.x);
      const y = toY(p.y);
      if (s.introRing > 0) {
        // Auftakt (Uebersicht): ein Ring zeigt, wo du bist
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(150,235,255,${0.85 * s.introRing})`;
        ctx.beginPath();
        ctx.arc(x, y, 14 + (1 - s.introRing) * 10, 0, Math.PI * 2);
        ctx.stroke();
      }
      const k = r / CORE;
      ctx.drawImage(playerSprite, x - (SPRITE / 2) * k, y - (SPRITE / 2) * k, SPRITE * k, SPRITE * k);
      if (s.aim) {
        const ax = toX(s.aim.x);
        const ay = toY(s.aim.y);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(180,235,255,0.55)';
        ctx.beginPath();
        ctx.arc(ax, ay, 14, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Rand-Pfeile: groessere Koerper, die sich naehern, und der Zielkoerper
    if (p && arrows.length) {
      arrows.sort((a, c) => Math.hypot(a.b.x - p.x, a.b.y - p.y) - Math.hypot(c.b.x - p.x, c.b.y - p.y));
      const pad = 20;
      let n = 0;
      for (const a of arrows) {
        const isTarget = a.b.tag === 'target';
        if (!isTarget) {
          const closing = (a.b.vx - p.vx) * (a.b.x - p.x) + (a.b.vy - p.vy) * (a.b.y - p.y) < 0;
          if (!closing) continue;
        }
        if (n++ >= 4) break;
        const ang = Math.atan2(a.y - H / 2, a.x - W / 2);
        // vom Bildmittel in Richtung des Koerpers auf den Rand (mit Platz fuer Kopfleiste und Zeittaste) projizieren
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        const tx = dx !== 0 ? Math.min((W - pad - W / 2) / Math.abs(dx), (W / 2 - pad) / Math.abs(dx)) : Infinity;
        const ty = dy !== 0 ? Math.min((H - pad - 70 - H / 2) / Math.abs(dy), (H / 2 - pad - 60) / Math.abs(dy)) : Infinity;
        const tt = Math.min(tx, ty);
        const px = W / 2 + dx * tt;
        const py = H / 2 + dy * tt;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang);
        ctx.fillStyle = isTarget ? 'rgba(255,224,130,0.95)' : `rgba(255,140,80,${0.55 + 0.3 * (reduceMotion ? 0.5 : Math.sin(now * 3) * 0.5 + 0.5)})`;
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-7, -7);
        ctx.lineTo(-7, 7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // Abdrift-Warnung: roter Rand, der mit der Entfernung staerker wird (kein Blinken, "Weniger Bewegung" bleibt ruhig)
    if (s.warn > 0) {
      const a = 0.12 + 0.3 * s.warn;
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(255,70,60,0)');
      vg.addColorStop(1, `rgba(255,70,60,${a})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }
  }

  return { resize, draw, view };
}
