// Kleine Effekte für das Spielgefühl: Partikel, schwebender Text, fliegende Bilder, Wackeln, Vibration.
// Alles liegt in einer eigenen Ebene über dem Spiel (pointer-events: none) und räumt sich selbst auf.

let layer = null;
let haptics = true;
const reduce = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initFx(root, { vibrate = true } = {}) {
  layer = document.createElement('div');
  layer.className = 'fx-layer';
  root.append(layer);
  haptics = vibrate;
}
export const setHaptics = (on) => { haptics = on; };

/** Kurze Vibration (Android; iOS ignoriert sie). */
export function buzz(ms = 12) {
  if (haptics && navigator.vibrate) try { navigator.vibrate(ms); } catch { /* egal */ }
}

const center = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/** Farbige Funken an einem Punkt oder Element. */
export function burst(at, color = '#ffc21a', n = 14, spread = 90) {
  if (!layer || reduce()) return;
  const { x, y } = at instanceof Element ? center(at) : at;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const d = spread * (0.55 + Math.random() * 0.6);
    p.className = 'spark' + (i % 3 === 0 ? ' star' : '');
    p.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;--c:${color}`;
    layer.append(p);
    setTimeout(() => p.remove(), 800);
  }
}

/** Aufsteigender Text, z. B. "+1" oder "Serie 5!". */
export function floatText(at, text, color = '#1d3b45', cls = '') {
  if (!layer) return;
  const { x, y } = at instanceof Element ? center(at) : at;
  const t = document.createElement('div');
  t.className = 'float-text ' + cls;
  t.textContent = text;
  t.style.cssText = `left:${x}px;top:${y}px;color:${color}`;
  layer.append(t);
  setTimeout(() => t.remove(), 1300);
}

/** Ein Element (Kopie) fliegt von A nach B, z. B. ein Stern in den Zähler. */
export function flyTo(fromEl, toEl, html, { duration = 700, size = 48 } = {}) {
  return new Promise((done) => {
    if (!layer || !fromEl || !toEl || reduce()) return done();
    const a = center(fromEl), b = center(toEl);
    const f = document.createElement('div');
    f.className = 'flyer';
    f.innerHTML = html;
    f.style.cssText = `left:${a.x}px;top:${a.y}px;width:${size}px;height:${size}px`;
    layer.append(f);
    const mid = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 80 };
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      const e = t * t * (3 - 2 * t);
      const x = (1 - e) ** 2 * a.x + 2 * (1 - e) * e * mid.x + e * e * b.x;
      const y = (1 - e) ** 2 * a.y + 2 * (1 - e) * e * mid.y + e * e * b.y;
      f.style.transform = `translate(${x - a.x}px, ${y - a.y}px) scale(${1 - 0.5 * e})`;
      if (t < 1) requestAnimationFrame(step);
      else { f.remove(); done(); }
    };
    requestAnimationFrame(step);
  });
}

/** Animation per Klasse neu starten. */
export function kick(el, cls, ms = 600) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
