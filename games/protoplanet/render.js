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
    const bg = ctx.createRadialGradient(W / 2, H * 0.45, 10, W / 2, H * 0.45, Math.max(W, H) * 0.8);
    bg.addColorStop(0, '#0b1224');
    bg.addColorStop(1, '#03050a');
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

    for (const b of world.bodies) {
      if (b === p) continue;
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
      const onScreen = x + r > -40 && x - r < W + 40 && y + r > -40 && y - r < H + 40;
      if (!onScreen) {
        if (p && (q > 1.05 || b.tag === 'target')) arrows.push({ b, x, y, q });
        continue;
      }
      if (r < 1.2) {
        ctx.fillStyle = q > 1.1 ? '#ff9a5a' : '#79d6e8';
        ctx.fillRect(x - 1, y - 1, 2, 2);
        continue;
      }
      const k = r / CORE;
      ctx.drawImage(spriteFor(q), x - (SPRITE / 2) * k, y - (SPRITE / 2) * k, SPRITE * k, SPRITE * k);
      if (q > 1.1) {
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = `rgba(255,150,90,${pulse})`;
        ctx.beginPath();
        ctx.arc(x, y, r * (reduceMotion ? 1.3 : 1.3 + 0.05 * Math.sin(now * 2.2)) + 3, 0, Math.PI * 2);
        ctx.stroke();
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

    // Spieler zuletzt (liegt oben)
    if (p) {
      const r = Math.max(2, Math.sqrt(p.m) * sc);
      const x = toX(p.x);
      const y = toY(p.y);
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
  }

  return { resize, draw, view };
}
