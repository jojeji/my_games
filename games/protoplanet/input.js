// Eingabe (Pointer Events, Maus und Touch gleich): Tippen = ein Ausstoss, Halten = Strahl, zwei Finger = Zoomen.
// Der Ausstoss passiert beim LOSLASSEN eines kurzen Tippens, damit ein zweiter Finger (Pinch) nie versehentlich ausstoesst.
import { T } from './tune.js';

/**
 * handlers: tap(x,y), beamStart(x,y), beamMove(x,y), beamEnd(), pinchStart(), pinch(ratio), pinchEnd(), wheel(dir), enabled() -> bool
 * Koordinaten in CSS-Pixeln relativ zum Element.
 */
export function createInput(el, h) {
  const pointers = new Map(); // id -> {x, y}
  let g = null; // laufende Geste
  const pos = (e) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const dist = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const endBeam = () => {
    if (g && g.beam) {
      g.beam = false;
      h.beamEnd();
    }
  };
  const clearTimer = () => {
    if (g && g.timer) clearTimeout(g.timer);
    if (g) g.timer = null;
  };
  const startBeam = () => {
    if (!g || g.multi || g.beam) return;
    clearTimer();
    g.beam = true;
    const p = pointers.values().next().value;
    h.beamStart(p.x, p.y);
  };

  function down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (!h.enabled()) return;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignorieren */
    }
    pointers.set(e.pointerId, pos(e));
    if (pointers.size === 1) {
      const p = pos(e);
      g = { x0: p.x, y0: p.y, t0: performance.now(), multi: false, beam: false, moved: false, timer: null, pinching: false };
      g.timer = setTimeout(startBeam, T.holdDelay * 1000);
    } else if (pointers.size === 2 && g) {
      endBeam();
      clearTimer();
      g.multi = true;
      g.pinching = true;
      g.d0 = Math.max(1, dist());
      h.pinchStart();
    }
  }
  function move(e) {
    if (!pointers.has(e.pointerId) || !g) return;
    e.preventDefault();
    const p = pos(e);
    pointers.set(e.pointerId, p);
    if (g.pinching && pointers.size >= 2) {
      h.pinch(dist() / g.d0);
      return;
    }
    if (g.multi) return;
    if (!g.moved && Math.hypot(p.x - g.x0, p.y - g.y0) > T.tapSlop) {
      g.moved = true;
      if (!g.beam) startBeam(); // Wischen = der Strahl folgt dem Finger
    }
    if (g.beam) h.beamMove(p.x, p.y);
  }
  function up(e) {
    if (!pointers.has(e.pointerId)) return;
    const p = pos(e);
    const cancelled = e.type === 'pointercancel';
    pointers.delete(e.pointerId);
    if (!g) return;
    if (g.pinching && pointers.size < 2) {
      g.pinching = false;
      h.pinchEnd();
    }
    if (pointers.size === 0) {
      const wasBeam = g.beam;
      const quick = performance.now() - g.t0 < T.holdDelay * 1000 + 40;
      endBeam();
      clearTimer();
      if (!cancelled && !g.multi && !g.moved && !wasBeam && quick && h.enabled()) h.tap(p.x, p.y);
      g = null;
    }
  }
  function wheel(e) {
    e.preventDefault();
    h.wheel(e.deltaY > 0 ? -1 : 1);
  }
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  return {
    /** Laufende Geste abbrechen (Pause, Dialog): kein Ausstoss, Strahl aus. */
    cancel() {
      endBeam();
      clearTimer();
      pointers.clear();
      g = null;
    },
    get holding() {
      return !!(g && g.beam);
    },
  };
}
