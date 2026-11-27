// Klänge (WebAudio, keine Dateien): Glockenspiel-Stimme für Tasten und "Anhören", kurze Effekte für Erfolge.
// Regel (ADR 0004): Während das Mikrofon zuhört, spielt die App keine Töne. ui.js hält sich daran.
import { midiToFreq } from './notes.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let enabled = true;

  function ensure() {
    if (!ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** Glockenspiel-Ton: Grundton + zwei unharmonische Teiltöne, schnell abklingend. */
  function bell(midi, at = 0, dur = 1.2, vol = 0.32) {
    if (!enabled || !ensure()) return;
    const t0 = ctx.currentTime + at;
    const f = midiToFreq(midi);
    for (const [mul, v, d] of [[1, 1, dur], [2.76, 0.28, dur * 0.4], [5.4, 0.12, dur * 0.2]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f * mul;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol * v, t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + d);
      o.connect(g).connect(master);
      o.start(t0);
      o.stop(t0 + d + 0.05);
    }
  }

  /** Rauschen mit Filter: Wind und Wellen für die Bootsfahrt. */
  function whoosh(dur = 2.2, vol = 0.12) {
    if (!enabled || !ensure()) return;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.8;
    const t0 = ctx.currentTime;
    f.frequency.setValueAtTime(300, t0);
    f.frequency.linearRampToValueAtTime(900, t0 + dur * 0.5);
    f.frequency.linearRampToValueAtTime(400, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + dur * 0.3);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
  }

  const sfx = {
    sail: () => { whoosh(2.4, 0.1); [67, 72].forEach((m, i) => bell(m, i * 0.18, 1, 0.12)); },
    arrive: () => [72, 79, 84].forEach((m, i) => bell(m, i * 0.1, 1.1, 0.18)),
    streak: (n) => bell(84 + Math.min(12, n), 0, 0.5, 0.16),
    unlock: () => { whoosh(0.6, 0.08); [76, 81, 84, 88].forEach((m, i) => bell(m, 0.2 + i * 0.09, 1.3, 0.2)); },
    hit: () => bell(96, 0, 0.35, 0.12),
    win: () => [72, 76, 79, 84].forEach((m, i) => bell(m, i * 0.12, 1.4, 0.26)),
    star: (i) => bell(84 + [0, 4, 7][i % 3], 0, 0.9, 0.22),
    collect: () => [79, 84, 88, 91, 96].forEach((m, i) => bell(m, i * 0.08, 1.2, 0.18)),
    tap: () => bell(91, 0, 0.18, 0.08),
  };

  /** Melodie vorspielen ("Anhören"). Liefert die Dauer in Sekunden. */
  function playMelody(notes, { bpm = 96, onNote } = {}) {
    if (!ensure()) return 0;
    const beat = 60 / bpm;
    let t = 0.15;
    const timers = [];
    notes.forEach((n, i) => {
      bell(n.midi, t, Math.max(0.6, n.beats * beat * 1.3), 0.3);
      if (onNote) timers.push(setTimeout(() => onNote(i), t * 1000));
      t += n.beats * beat;
    });
    playMelody.cancel = () => timers.forEach(clearTimeout);
    return t;
  }

  return {
    unlock: ensure,
    note: (midi) => bell(midi),
    sfx,
    playMelody,
    stop() {
      playMelody.cancel?.();
      if (ctx && master) {
        master.disconnect();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
      }
    },
    set enabled(v) { enabled = v; },
    get enabled() { return enabled; },
  };
}
