// Sounds (WebAudio, no audio files), vibration and Screen Wake Lock. Everything fails silently.
export function createFeedback(getSettings) {
  let ctx = null;
  const audio = () => {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    } catch {
      ctx = null;
    }
    return ctx;
  };
  /** Must be called from a user gesture once so iOS lets us play later. */
  const unlock = () => {
    const c = audio();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  };
  function tone(freq, dur, { type = 'sine', gain = 0.18, delay = 0, slideTo = null } = {}) {
    if (!getSettings().sound) return;
    const c = audio();
    if (!c) return;
    try {
      const t0 = c.currentTime + delay;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(c.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch {
      /* ignore */
    }
  }
  const vib = (p) => {
    if (!getSettings().vibrate) return;
    try {
      navigator.vibrate && navigator.vibrate(p);
    } catch {
      /* ignore */
    }
  };
  return {
    unlock,
    tick: (last = false) => {
      tone(last ? 1250 : 900, 0.05, { type: 'square', gain: last ? 0.1 : 0.06 });
      if (last) vib(15);
    },
    correct: () => {
      tone(660, 0.1, { type: 'triangle' });
      tone(990, 0.16, { type: 'triangle', delay: 0.09 });
      vib(20);
    },
    skip: () => tone(420, 0.09, { type: 'triangle', gain: 0.1, slideTo: 330 }),
    buzzer: () => {
      tone(150, 0.45, { type: 'sawtooth', gain: 0.22 });
      tone(110, 0.45, { type: 'square', gain: 0.1 });
      vib([180, 60, 180]);
    },
    timeUp: () => {
      tone(880, 0.18, { type: 'square', gain: 0.14 });
      tone(660, 0.18, { type: 'square', gain: 0.14, delay: 0.2 });
      tone(440, 0.5, { type: 'square', gain: 0.14, delay: 0.4 });
      vib([300, 100, 300, 100, 500]);
    },
    win: () => {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, { type: 'triangle', delay: i * 0.13 }));
      vib([60, 40, 60]);
    },
  };
}

/** Keep the screen on during a Zug (Screen Wake Lock API if available). */
export function createWakeLock() {
  let lock = null;
  let want = false;
  async function acquire() {
    if (!want || lock || !('wakeLock' in navigator)) return;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => {
        lock = null;
      });
    } catch {
      lock = null;
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') acquire();
  });
  return {
    on() {
      want = true;
      acquire();
    },
    off() {
      want = false;
      if (lock) lock.release().catch(() => {});
      lock = null;
    },
  };
}
