// Touch/mouse interaction helpers.

/**
 * Tap = run `fn` once (on release, so scrolling over a button never triggers it).
 * Hold = after `delay` ms run `fn` repeatedly, accelerating down to `minInterval`.
 * Keyboard activation (click with detail 0) also runs `fn` once.
 */
export function holdRepeat(el, fn, { delay = 380, interval = 160, minInterval = 40, accel = 0.88 } = {}) {
  let down = false;
  let held = false;
  let timer = null;
  let cur = interval;
  let sx = 0;
  let sy = 0;

  const stopTimer = () => {
    clearTimeout(timer);
    timer = null;
  };
  const cancel = () => {
    down = false;
    held = false;
    stopTimer();
  };
  const step = () => {
    if (!down) return;
    fn();
    cur = Math.max(minInterval, cur * accel);
    timer = setTimeout(step, cur);
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (el.disabled) return;
    down = true;
    held = false;
    sx = e.clientX;
    sy = e.clientY;
    cur = interval;
    stopTimer();
    timer = setTimeout(() => {
      if (!down) return;
      held = true;
      step();
    }, delay);
  });
  el.addEventListener('pointermove', (e) => {
    if (down && Math.hypot(e.clientX - sx, e.clientY - sy) > 14) cancel();
  });
  el.addEventListener('pointerup', () => {
    if (!down) return;
    const wasHeld = held;
    cancel();
    if (!wasHeld) fn();
  });
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('click', (e) => {
    if (e.detail === 0) fn(); // keyboard / assistive tech
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

/**
 * Long press (default 500 ms) runs `fn` (used for "details" instead of hover).
 * Returns nothing; a normal tap still produces its normal click.
 */
export function longPress(el, fn, ms = 500) {
  let timer = null;
  let sx = 0;
  let sy = 0;
  let fired = false;
  const clear = () => {
    clearTimeout(timer);
    timer = null;
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    fired = false;
    sx = e.clientX;
    sy = e.clientY;
    clear();
    timer = setTimeout(() => {
      fired = true;
      fn();
    }, ms);
  });
  el.addEventListener('pointermove', (e) => {
    if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 12) clear();
  });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(t, clear);
  el.addEventListener('click', (e) => {
    if (fired) {
      e.preventDefault();
      e.stopPropagation();
      fired = false;
    }
  }, true);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
