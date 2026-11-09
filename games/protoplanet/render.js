// Darstellung (Canvas 2D): glühende Kreise aus vorgezeichneten Sprites, Farbe relativ zum Spieler, Ring um groessere Koerper,
// Rand-Pfeile, Arena-Ring, Sternenstaub. Keine shadowBlur pro Koerper.
// Paket F: Farbwelt je Kapitel (vorgezeichneter Verlauf + Nebelflecken mit Parallax), Koerper mit Tiefe (Schattenseite), Effekte aus fx.js
// (Strom beim Absorbieren, Atmen, Rueckstoss, Ringe), Randpfeile mit Groesse/Abstand, Gefahren-Randgluehen, Abdunkeln/Zurueckspulen-Tonung.
import { T } from './tune.js';
import { scaleOf } from './camera.js';
import { COLORS } from './fx.js';

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
  // Tiefe: Schattenseite unten rechts (Licht von links oben), weicher Rand
  g.save();
  g.beginPath();
  g.arc(mid, mid, CORE, 0, Math.PI * 2);
  g.clip();
  const sh = g.createRadialGradient(mid - CORE * 0.35, mid - CORE * 0.4, CORE * 0.55, mid - CORE * 0.15, mid - CORE * 0.2, CORE * 1.5);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(2,4,12,0.42)');
  g.fillStyle = sh;
  g.fillRect(0, 0, SPRITE, SPRITE);
  g.restore();
  g.lineWidth = 2;
  g.strokeStyle = `hsla(${h},${s}%,${Math.min(96, l + 30)}%,${rim})`;
  g.beginPath();
  g.arc(mid, mid, CORE - 1, 0, Math.PI * 2);
  g.stroke();
  return c;
}

const hexRgb = (hex) => {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/** Vorgezeichnete Sprites (gemeinsam fuer Spielfeld und Levelauswahl-Hintergrund). */
export function createSprites() {
  const steps = T.glowSteps;
  const sprites = [];
  for (let i = 0; i < steps; i++) {
    const [h, s, l] = ramp(i / (steps - 1));
    sprites.push(makeSprite(Math.round(h), Math.round(s), Math.round(l)));
  }
  const playerSprite = makeSprite(188, 100, 80, { rim: 1, glow: 0.6 });
  // weiche Punkte fuer Teilchen (je Farbe aus fx.js)
  const DOT = 32;
  const dots = COLORS.map(([r, g, b]) => {
    const c = document.createElement('canvas');
    c.width = c.height = DOT;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(DOT / 2, DOT / 2, 0, DOT / 2, DOT / 2, DOT / 2);
    gr.addColorStop(0, `rgba(${r},${g},${b},1)`);
    gr.addColorStop(0.28, `rgba(${r},${g},${b},0.55)`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = gr;
    x.fillRect(0, 0, DOT, DOT);
    return c;
  });
  const spriteFor = (q) => {
    const t = 0.5 + Math.log2(Math.max(1e-3, q)) / 6;
    return sprites[Math.max(0, Math.min(steps - 1, Math.round(t * (steps - 1))))];
  };
  return { sprites, playerSprite, dots, dotSize: DOT, spriteFor };
}

// Nebelfleck: weicher Farbfleck (Sprite, wird je Farbe einmal gezeichnet und skaliert eingesetzt)
const nebCache = new Map();
function nebSprite(rgb) {
  let c = nebCache.get(rgb);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 192;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(96, 96, 0, 96, 96, 96);
  gr.addColorStop(0, `rgba(${rgb},1)`);
  gr.addColorStop(0.45, `rgba(${rgb},0.45)`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 192, 192);
  nebCache.set(rgb, c);
  return c;
}

/** Hintergrund einer Farbwelt (Verlauf, vorgezeichnet je Groesse) + Nebel mit Parallax + Sternenstaub. */
function createBackdrop() {
  const stars = [];
  let seed = 91;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < T.starCount; i++) stars.push({ x: rnd(), y: rnd(), z: 0.3 + rnd() * 0.7, a: 0.15 + rnd() * 0.4 });
  const cache = new Map(); // Schluessel Welt|Breite|Hoehe -> Canvas
  const gradient = (key, W, H, dpr) => {
    const k = `${key}|${W}|${H}`;
    let c = cache.get(k);
    if (c) return c;
    if (cache.size > 6) cache.clear();
    const world = T.worlds[key] || T.worlds[1];
    c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W * Math.min(dpr, 1.5)));
    c.height = Math.max(1, Math.round(H * Math.min(dpr, 1.5)));
    const g = c.getContext('2d');
    g.scale(c.width / W, c.height / H);
    const bg = g.createRadialGradient(W / 2, H * 0.45, 10, W / 2, H * 0.45, Math.max(W, H) * 0.8);
    bg.addColorStop(0, world.bg[0]);
    bg.addColorStop(1, world.bg[1]);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    cache.set(k, c);
    return c;
  };
  return {
    draw(ctx, key, W, H, dpr, cx, cy, sc, now, reduce) {
      ctx.drawImage(gradient(key, W, H, dpr), 0, 0, W, H);
      const world = T.worlds[key] || T.worlds[1];
      const drift = reduce ? 0 : now;
      for (let i = 0; i < world.neb.length; i++) {
        const [nx, ny, size, rgb, alpha, par] = world.neb[i];
        const d = size * W * 1.25;
        const ox = reduce ? 0 : cx * sc * par + Math.sin(drift * 0.03 + i * 1.7) * 6;
        const oy = reduce ? 0 : cy * sc * par + Math.cos(drift * 0.025 + i) * 6;
        const padW = W + d;
        const padH = H + d;
        const x = ((((nx * W - ox + d / 2) % padW) + padW) % padW) - d / 2;
        const y = ((((ny * H - oy + d / 2) % padH) + padH) % padH) - d / 2;
        ctx.globalAlpha = alpha;
        ctx.drawImage(nebSprite(rgb), x - d / 2, y - d / 2, d, d);
      }
      ctx.globalAlpha = 1;
      for (const st of stars) {
        let x = st.x * W;
        let y = st.y * H;
        if (!reduce) {
          x = (((x - cx * sc * 0.06 * st.z) % W) + W) % W;
          y = (((y - cy * sc * 0.06 * st.z) % H) + H) % H;
        }
        ctx.fillStyle = `rgba(190,210,255,${st.a})`;
        ctx.fillRect(x, y, st.z * 1.6, st.z * 1.6);
      }
    },
  };
}

/** Lebendiger, ruhiger Hintergrund der Levelauswahl: ein paar treibende Koerper auf dem Farbverlauf. */
export function createAmbient(canvas) {
  const ctx = canvas.getContext('2d');
  const spr = createSprites();
  const back = createBackdrop();
  const bodies = [];
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 16; i++) bodies.push({ x: rnd(), y: rnd(), vx: (rnd() - 0.5) * 0.012, vy: (rnd() - 0.5) * 0.008, r: 3 + rnd() * rnd() * 16, q: Math.exp((rnd() - 0.5) * 3.2) });
  const view = { w: 300, h: 500, dpr: 1 };
  return {
    resize() {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      view.w = Math.max(1, r.width);
      view.h = Math.max(1, r.height);
      view.dpr = dpr;
      canvas.width = Math.round(view.w * dpr);
      canvas.height = Math.round(view.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    draw(dt, now, reduce) {
      const { w: W, h: H, dpr } = view;
      back.draw(ctx, 'select', W, H, dpr, 0, 0, 0, now, true);
      for (const b of bodies) {
        if (!reduce) {
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          if (b.x < -0.1) b.x += 1.2;
          if (b.x > 1.1) b.x -= 1.2;
          if (b.y < -0.1) b.y += 1.2;
          if (b.y > 1.1) b.y -= 1.2;
        }
        const k = b.r / CORE;
        ctx.globalAlpha = 0.4;
        ctx.drawImage(spr.spriteFor(b.q), b.x * W - (SPRITE / 2) * k, b.y * H - (SPRITE / 2) * k, SPRITE * k, SPRITE * k);
      }
      ctx.globalAlpha = 1;
    },
    view,
  };
}

const fmtQ = (q) => (q < 10 ? q.toFixed(1) : String(Math.round(q))).replace('.', ',');

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const { playerSprite, dots, dotSize, spriteFor } = createSprites();
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
  const back = createBackdrop();

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

  /**
   * s: { world, cam, now (s), reduceMotion, aim: {x,y}|null, preview, warn, chapter, fx, introRing, fade (0..1 Abdunkeln), tint (0..1 Zurueckspulen), flash (0..1 Lichtwelle) }
   */
  function draw(s) {
    const { world, cam, now, reduceMotion, fx } = s;
    const W = view.w;
    const H = view.h;
    ctx.clearRect(0, 0, W, H);
    const orbit = world.arenaR <= 0; // Kapitel 3: offener Raum um einen Protostern
    const wk = T.worlds[s.chapter] ? s.chapter : orbit ? 3 : 1;
    const pal = T.worlds[wk];
    const acc = hexRgb(pal.accent);
    const sc = scaleOf(cam, W);
    back.draw(ctx, wk, W, H, view.dpr, cam.x, cam.y, sc, now, reduceMotion);

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

    // Arena: weicher Ring in der Akzentfarbe des Kapitels
    if (world.arenaR > 0) {
      const cx = toX(0);
      const cy = toY(0);
      const R = world.arenaR * sc;
      ctx.lineWidth = 10;
      ctx.strokeStyle = `rgba(${acc[0]},${acc[1]},${acc[2]},0.06)`;
      ctx.beginPath();
      ctx.arc(cx, cy, R + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = `rgba(${acc[0]},${acc[1]},${acc[2]},0.5)`;
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
        // eigener Ausstoss: gut sichtbar (helles Teilchen mit weichem Halo und Schweif), auch wenn es winzig ist
        if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
        const rr = Math.max(r, 2.8);
        const tx = x - b.vx * sc * 0.16;
        const ty = y - b.vy * sc * 0.16;
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(2, rr * 1.5);
        ctx.strokeStyle = 'rgba(160,225,255,0.2)';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.lineWidth = Math.max(1.2, rr * 0.8);
        ctx.strokeStyle = 'rgba(200,240,255,0.4)';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - b.vx * sc * 0.08, y - b.vy * sc * 0.08);
        ctx.stroke();
        ctx.globalAlpha = 0.5;
        const hd = (rr + 4) * 2.6;
        ctx.drawImage(dots[0], x - hd / 2, y - hd / 2, hd, hd);
        ctx.globalAlpha = 1;
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
        const ty = dy !== 0 ? (H / 2 - 74) / Math.abs(dy) : Infinity;
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
      let acc0 = GAP * 0.5; // erster Punkt kurz vor dem Spieler-Rand
      const pts = pv.pts;
      const len = [0];
      for (let i = 1; i < pv.n; i++) {
        const sx = (pts[2 * i] - pts[2 * i - 2]) * sc;
        const sy = (pts[2 * i + 1] - pts[2 * i - 1]) * sc;
        len.push(len[i - 1] + Math.hypot(sx, sy));
      }
      const total = len[pv.n - 1];
      const rpx = Math.max(2, Math.sqrt(p.m) * sc);
      let seg = 1;
      for (let d = rpx + GAP * 0.6 + acc0 * 0; d < total; d += GAP) {
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

    // Effekte unter dem Spieler: Strom, Abgas, Ringe (additiv)
    if (fx) fx.draw(ctx, toX, toY, sc, dots, dotSize, W, H);

    // Spieler zuletzt (liegt oben): atmet bei Aufnahme, staucht beim Ausstoss (nur Darstellung)
    if (p) {
      const r = Math.max(2, Math.sqrt(p.m) * sc);
      const x = toX(p.x);
      const y = toY(p.y);
      if (s.introRing > 0) {
        // Auftakt: ein Ring zeigt, wo du bist
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(150,235,255,${0.85 * s.introRing})`;
        ctx.beginPath();
        ctx.arc(x, y, r + 8 + (1 - s.introRing) * 16, 0, Math.PI * 2);
        ctx.stroke();
      }
      const fs = fx ? fx.state : null;
      const breath = fs && !reduceMotion ? fs.breath : 0;
      const rec = fs && !reduceMotion ? fs.recoil : 0;
      const k = (r / CORE) * (1 + T.fx.breathScale * breath);
      const d = SPRITE * k;
      ctx.save();
      ctx.translate(x, y);
      if (rec > 0.01) {
        ctx.rotate(fs.recAng);
        ctx.scale(1 - T.fx.recoilSquash * rec, 1 + T.fx.recoilSquash * 0.5 * rec);
        ctx.rotate(-fs.recAng);
      }
      ctx.drawImage(playerSprite, -d / 2, -d / 2, d, d);
      if (breath > 0.02) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55 * breath;
        const d2 = d * 1.3;
        ctx.drawImage(playerSprite, -d2 / 2, -d2 / 2, d2, d2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
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

    // Rand-Pfeile: groessere Koerper ausserhalb des Bildes (Groesse = Pfeilgroesse und "x2,4" relativ zu dir, Naehe = Deckkraft) und der Zielkoerper
    if (p && p.m > 0.1 && arrows.length) {
      const half = cam.half;
      for (const a of arrows) a.d = Math.hypot(a.b.x - p.x, a.b.y - p.y);
      arrows.sort((a, c) => a.d - c.d);
      const padX = 22;
      const padT = 74;
      const padB = 84;
      let n = 0;
      for (const a of arrows) {
        const isTarget = a.b.tag === 'target';
        const closing = (a.b.vx - p.vx) * (a.b.x - p.x) + (a.b.vy - p.vy) * (a.b.y - p.y) < 0;
        const range = isTarget ? Infinity : closing || a.b.tag === 'rock' ? half * 4 : half * 2.2;
        if (a.d > range) continue;
        if (n++ >= 5) break;
        const near = Math.max(0, Math.min(1, 1 - (a.d - half) / (half * 3)));
        const ang = Math.atan2(a.y - H / 2, a.x - W / 2);
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        const tx = dx !== 0 ? (W / 2 - padX) / Math.abs(dx) : Infinity;
        const ty = dy !== 0 ? Math.min((H / 2 - padB) / Math.abs(dy), (H / 2 - padT) / Math.abs(dy)) : Infinity;
        const tt = Math.min(tx, ty);
        const px = W / 2 + dx * tt;
        const py = H / 2 + dy * tt;
        const sz = isTarget ? 11 : Math.max(7.5, Math.min(16, 6.5 + 3.2 * Math.log2(Math.max(1, a.q) + 0.5)));
        const alpha = isTarget ? 0.95 : (closing ? 0.45 : 0.28) + 0.5 * near;
        const col = isTarget ? '255,224,130' : '255,140,80';
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang);
        ctx.fillStyle = `rgba(${col},${alpha * (isTarget || reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(now * (2 + 5 * near)))})`;
        ctx.beginPath();
        ctx.moveTo(sz, 0);
        ctx.lineTo(-sz * 0.7, -sz * 0.75);
        ctx.lineTo(-sz * 0.3, 0);
        ctx.lineTo(-sz * 0.7, sz * 0.75);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        if (isTarget || a.q >= 1.3) {
          const label = isTarget ? 'Ziel' : '×' + fmtQ(a.q);
          const lx = px - dx * (sz + 14);
          const ly = py - dy * (sz + 14);
          ctx.font = '700 12.5px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(4,6,12,0.7)';
          ctx.strokeText(label, lx, ly);
          ctx.fillStyle = `rgba(${col},${Math.min(1, alpha + 0.15)})`;
          ctx.fillText(label, lx, ly);
        }
      }
    }

    // Gefahren-Hinweis: Randgluehen aus der Richtung eines naeherkommenden Groesseren (weich, kein Blinken)
    const th = fx ? fx.threats : null;
    if (th && th.length) {
      for (const t of th) {
        const dx = t.ux;
        const dy = t.uy;
        const tx = dx !== 0 ? (W / 2) / Math.abs(dx) : Infinity;
        const ty = dy !== 0 ? (H / 2) / Math.abs(dy) : Infinity;
        const tt = Math.min(tx, ty);
        const gx = W / 2 + dx * tt;
        const gy = H / 2 + dy * tt;
        const R = Math.min(W, H) * (0.7 + 0.4 * t.k);
        const a = T.fx.dangerAlpha * t.k * (reduceMotion ? 0.8 : 0.88 + 0.12 * Math.sin(now * (3 + 5 * t.k)));
        const vg = ctx.createRadialGradient(gx, gy, 0, gx, gy, R);
        vg.addColorStop(0, `rgba(255,86,56,${a})`);
        vg.addColorStop(0.5, `rgba(255,70,50,${a * 0.45})`);
        vg.addColorStop(1, 'rgba(255,60,40,0)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);
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

    // Zurueckspulen: kuehle Toenung mit dunklem Rand; Sieg: Lichtwelle als weicher Schein; Ende: Abdunkeln
    if (s.tint > 0.01) {
      ctx.fillStyle = `rgba(110,150,255,${0.1 * s.tint})`;
      ctx.fillRect(0, 0, W, H);
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
      vg.addColorStop(0, 'rgba(20,30,70,0)');
      vg.addColorStop(1, `rgba(20,30,70,${0.55 * s.tint})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }
    if (s.flash > 0.01 && p) {
      const x = toX(p.x);
      const y = toY(p.y);
      const vg = ctx.createRadialGradient(x, y, 0, x, y, Math.max(W, H) * 0.8);
      vg.addColorStop(0, `rgba(230,250,255,${0.45 * s.flash})`);
      vg.addColorStop(0.4, `rgba(150,225,255,${0.14 * s.flash})`);
      vg.addColorStop(1, 'rgba(150,225,255,0)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }
    if (s.fade > 0.005) {
      ctx.fillStyle = `rgba(3,5,10,${Math.min(1, s.fade)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  return { resize, draw, view };
}
