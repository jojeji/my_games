// Protoplanet: WebAudio-Graph (keine Dateien). Die Logik (Tonleitern, Plan, Drosselung, Parameter) steht in audio-score.js.
// createEngine(ctx, opts) baut den Graphen gegen JEDEN Context (AudioContext oder OfflineAudioContext, so wird die Musik offline gemessen).
// createAudio({ settings }) ist die Huelle fuer die Oberflaeche: AudioContext erst bei der ersten Nutzergeste (iOS), Lautstaerken, Pause, Sichtbarkeit.
// Alle Pegelaenderungen laufen ueber Rampen (setTargetAtTime / Kurven), nie als Sprung. Die Physik haengt in keiner Weise vom Klang ab.
import { T } from './tune.js';
import { createScore, createGate, makeRng, midiToHz, musicParams, moodFor, scaleMidi, scaleOf, absorbPitch, winFigure, volumeGain, clamp } from './audio-score.js';

const A = T.audio;
const TAU = 0.015; // s, Zeitkonstante fuer "sofortige" Pegelaenderungen (kein Knacksen)

/** Hanning-Huellkurve fuer setValueCurveAtTime (sanftes Ein- und Ausblenden in einem Zug). */
const ENV = (() => {
  const n = 96;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.sin((Math.PI * i) / (n - 1)) ** 2;
  return c;
})();

/** Raum ohne Datei: Rauschen mit exponentiellem Abfall, nach hinten dunkler (Einpol-Tiefpass mit wachsender Daempfung). */
function makeImpulse(ctx, seconds, rng, decayDb = 60) {
  const sr = ctx.sampleRate;
  const n = Math.floor(seconds * sr);
  const buf = ctx.createBuffer(2, n, sr);
  const pre = Math.floor(0.018 * sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / (n - pre);
      const x = rng.next() * 2 - 1;
      const k = 0.55 - 0.45 * t; // Glaettung nimmt zu
      y += (x - y) * k;
      d[i] = y * Math.pow(10, (-decayDb * t) / 20);
    }
  }
  return buf;
}

/** Eine Sekunde Rauschen (fuer Ausstoss-Puff und Schweller). */
function makeNoise(ctx, rng) {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, sr, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < sr; i++) d[i] = rng.next() * 2 - 1;
  return buf;
}

export function createEngine(ctx, opts = {}) {
  const o = { seed: 1, mood: 'select', music: A.volume.music, sfx: A.volume.sfx, muted: false, ...opts };
  const score = createScore(o.seed, o.mood);
  const fxRng = makeRng((o.seed ^ 0x9e3779b9) >>> 0);
  const gate = createGate();
  const t0 = ctx.currentTime;
  const state = { music: o.music, sfx: o.sfx, muted: !!o.muted, paused: false, hidden: false, params: null, input: { danger: 0, size: 0, timeScale: 1, lift: 0 }, planned: t0, started: false, mood: o.mood };

  /* ----- Ausgang: Busse -> Master -> Kompressor (Limiter) -> Ziel ----- */
  const master = ctx.createGain();
  master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 10;
  comp.ratio.value = 10;
  comp.attack.value = 0.004;
  comp.release.value = 0.3;
  const post = ctx.createGain();
  post.gain.value = 0.85;
  master.connect(comp);
  comp.connect(post);
  post.connect(ctx.destination);
  const musicBus = ctx.createGain();
  const sfxBus = ctx.createGain();
  musicBus.gain.value = 0;
  sfxBus.gain.value = 0;
  musicBus.connect(master);
  sfxBus.connect(master);

  /* ----- Raeume (je Bus einer, damit die Regler auch den Hall mitnehmen) ----- */
  const verbMusic = ctx.createConvolver();
  verbMusic.buffer = makeImpulse(ctx, 3.4, makeRng(o.seed ^ 0x1234567));
  const verbMusicOut = ctx.createGain();
  verbMusic.connect(verbMusicOut);
  verbMusicOut.connect(musicBus);
  const verbSfx = ctx.createConvolver();
  verbSfx.buffer = makeImpulse(ctx, 1.4, makeRng(o.seed ^ 0x7654321), 50);
  const verbSfxOut = ctx.createGain();
  verbSfxOut.gain.value = 0.55;
  verbSfx.connect(verbSfxOut);
  verbSfxOut.connect(sfxBus);
  const sendMusic = ctx.createGain(); // alles, was Hall bekommt, geht hier hinein
  sendMusic.gain.value = 1;
  sendMusic.connect(verbMusic);
  const sendSfx = ctx.createGain();
  sendSfx.connect(verbSfx);
  const noise = makeNoise(ctx, makeRng(o.seed ^ 0x55aa55));

  /* ----- Teppich (Drone): Saegezahn-Paar + Quinte durch einen atmenden Tiefpass ----- */
  const mood0 = moodFor(o.mood);
  const f0 = midiToHz(mood0.root - 12);
  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = 'lowpass';
  droneFilter.Q.value = 0.8;
  droneFilter.frequency.value = mood0.cutLo;
  const droneVol = ctx.createGain(); // wird von einem sehr langsamen LFO bewegt (0,5 .. 1)
  droneVol.gain.value = 0.75;
  const droneLevel = ctx.createGain();
  droneLevel.gain.value = 0;
  droneFilter.connect(droneVol);
  droneVol.connect(droneLevel);
  droneLevel.connect(musicBus);
  droneLevel.connect(sendMusic);
  const osc = (type, freq, detune = 0) => {
    const n = ctx.createOscillator();
    n.type = type;
    n.frequency.value = freq;
    n.detune.value = detune;
    return n;
  };
  const droneOscs = [];
  const droneVoice = (type, ratio, detune, level, dest = droneFilter) => {
    const n = osc(type, f0 * ratio, detune);
    const g = ctx.createGain();
    g.gain.value = level;
    n.connect(g);
    g.connect(dest);
    n.start(t0);
    droneOscs.push({ n, ratio });
    return { n, g };
  };
  droneVoice('sawtooth', 1, -7, 0.5);
  const sawB = droneVoice('sawtooth', 1, 8, 0.5);
  droneVoice('triangle', 1.5, 3, 0.35);
  const upperGain = ctx.createGain(); // Obertoene (Groesse)
  upperGain.gain.value = 0;
  upperGain.connect(droneFilter);
  droneVoice('triangle', 2, -4, 1, upperGain);
  droneVoice('sine', 3, 5, 0.6, upperGain);
  const beatGain = ctx.createGain(); // leise Schwebung (Gefahr): minimal verstimmte Zwillinge
  beatGain.gain.value = 0;
  beatGain.connect(droneVol);
  droneVoice('sine', 1, 0, 1, beatGain);
  droneVoice('sine', 1.0065, 0, 1, beatGain);
  const lfo = (freq, depth, target) => {
    const l = ctx.createOscillator();
    l.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = depth;
    l.connect(g);
    g.connect(target);
    l.start(t0);
    return { l, g };
  };
  const lfoCut = lfo(0.043, 150, droneFilter.frequency); // atmender Tiefpass (Tiefe wird mit der Grenzfrequenz skaliert)
  const lfoVol = lfo(0.027, 0.25, droneVol.gain);
  lfo(0.019, 5, sawB.n.detune);

  /* ----- Akkorde ("Flaechen") ----- */
  const chordFilter = ctx.createBiquadFilter();
  chordFilter.type = 'lowpass';
  chordFilter.Q.value = 0.5;
  chordFilter.frequency.value = 900;
  const chordBus = ctx.createGain();
  chordBus.gain.value = 0;
  chordFilter.connect(chordBus);
  chordBus.connect(musicBus);
  const chordSend = ctx.createGain();
  chordSend.gain.value = 0.9;
  chordBus.connect(chordSend);
  chordSend.connect(sendMusic);

  const starBus = ctx.createGain();
  starBus.gain.value = 0.16;
  starBus.connect(musicBus);
  const starSend = ctx.createGain();
  starSend.gain.value = 0.9;
  starBus.connect(starSend);
  starSend.connect(sendMusic);

  const hasPan = typeof ctx.createStereoPanner === 'function';
  const cleanup = (n, nodes) => {
    n.onended = () => nodes.forEach((x) => { try { x.disconnect(); } catch { /* schon getrennt */ } });
  };

  function playChord(ev) {
    const g = ctx.createGain();
    g.gain.value = 0;
    const per = 0.5 / Math.sqrt(ev.hz.length);
    g.connect(chordFilter);
    g.gain.setValueCurveAtTime(ENV.map((v) => v * per), ev.t, ev.dur);
    const nodes = [g];
    ev.hz.forEach((f, i) => {
      const a = osc('triangle', f, -5 + i);
      const b = osc('sine', f * 1.0, 6 - i);
      const gb = ctx.createGain();
      gb.gain.value = 0.7;
      a.connect(g);
      b.connect(gb);
      gb.connect(g);
      a.start(ev.t);
      b.start(ev.t);
      a.stop(ev.t + ev.dur + 0.1);
      b.stop(ev.t + ev.dur + 0.1);
      nodes.push(a, b, gb);
      if (i === ev.hz.length - 1) cleanup(a, nodes);
    });
  }

  function playStar(ev) {
    const g = ctx.createGain();
    const peak = ev.vel;
    g.gain.setValueAtTime(0, ev.t);
    g.gain.linearRampToValueAtTime(peak, ev.t + 0.012);
    g.gain.setTargetAtTime(0, ev.t + 0.012, ev.decay / 5);
    const a = osc('sine', ev.hz);
    const b = osc('sine', ev.hz * 2.76); // glockiger Teilton
    const gb = ctx.createGain();
    gb.gain.setValueAtTime(0.18, ev.t);
    gb.gain.setTargetAtTime(0, ev.t, 0.35);
    const c = osc('sine', ev.hz * 2);
    const gc = ctx.createGain();
    gc.gain.value = 0.25;
    a.connect(g);
    b.connect(gb);
    gb.connect(g);
    c.connect(gc);
    gc.connect(g);
    let outNode = g;
    const nodes = [g, a, b, c, gb, gc];
    if (hasPan) {
      const p = ctx.createStereoPanner();
      p.pan.value = ev.pan;
      g.connect(p);
      outNode = p;
      nodes.push(p);
    }
    outNode.connect(starBus);
    [a, b, c].forEach((x) => {
      x.start(ev.t);
      x.stop(ev.t + ev.decay + 0.5);
    });
    cleanup(a, nodes);
  }

  /* ----- Parameter (weich) ----- */
  const setT = (param, v, t, tau) => param.setTargetAtTime(v, t, tau);
  function applyParams(p, t = ctx.currentTime) {
    const tau = A.smooth.tau;
    setT(droneFilter.frequency, p.droneCut, t, tau);
    lfoCut.g.gain.setTargetAtTime(p.droneCut * 0.3, t, tau);
    setT(droneLevel.gain, p.droneGain, t, tau);
    setT(beatGain.gain, p.beatGain / Math.max(0.05, p.droneGain), t, A.smooth.danger);
    setT(upperGain.gain, p.upperGain / Math.max(0.05, p.droneGain), t, tau);
    setT(chordFilter.frequency, p.chordCut, t, tau);
    setT(chordBus.gain, p.chordGain, t, tau);
    setT(verbMusicOut.gain, p.wet, t, tau);
    lfoVol.l.frequency.setTargetAtTime(0.027 * p.lfoRate, t, tau);
    lfoCut.l.frequency.setTargetAtTime(0.043 * p.lfoRate, t, tau);
    state.params = p;
  }

  function levels(t = ctx.currentTime, tau = 0.12) {
    const muteK = state.muted || state.hidden ? 0 : 1;
    const m = volumeGain(state.music) * A.busMusic * muteK * (state.paused ? A.pauseDuck : 1);
    const s = volumeGain(state.sfx) * A.busSfx * muteK;
    musicBus.gain.setTargetAtTime(m, t, tau);
    sfxBus.gain.setTargetAtTime(s, t, tau);
  }

  function setInput(inp, t = ctx.currentTime) {
    Object.assign(state.input, inp);
    applyParams(musicParams(state.input, moodFor(state.mood)), t);
  }

  /** Stimmung wechseln (Kapitel-ID oder 'select'): Teppich gleitet in den neuen Grundton, die naechsten Akkorde kommen aus der neuen Tonleiter. */
  function setMood(id, t = ctx.currentTime) {
    if (id === state.mood) return;
    state.mood = id;
    score.setMood(id, t);
    const f = midiToHz(moodFor(id).root - 12);
    for (const d of droneOscs) d.n.frequency.setTargetAtTime(f * d.ratio, t, 3);
    setInput({}, t);
  }

  /** Plant und erzeugt Ereignisse bis `until` (Sekunden der Context-Zeit). */
  function pump(until = ctx.currentTime + A.lookahead) {
    const vol = state.muted || state.hidden ? 0 : state.music / 100;
    const p = state.params || musicParams(state.input, moodFor(state.mood));
    const from = Math.max(state.planned, ctx.currentTime);
    if (until <= from) return;
    const evs = score.plan(from, until, { vol: state.paused ? 0 : vol, noteCount: p.noteCount, starRate: p.starRate, tempo: p.tempo });
    for (const ev of evs) (ev.type === 'chord' ? playChord : playStar)(ev);
    state.planned = until;
    return evs;
  }

  /* ----- Effekte ----- */
  const sfxNode = (g, dest = sfxBus, send = 0.25) => {
    g.connect(dest);
    if (send > 0) {
      const s = ctx.createGain();
      s.gain.value = send;
      g.connect(s);
      s.connect(sendSfx);
    }
  };
  /** Weicher Ton mit Huellkurve: sine (+ leise Oktave), Anschwingen att, Ausklang dec. */
  function tone({ t, hz, gain = 0.2, att = 0.01, dec = 0.4, type = 'sine', glideTo = 0, glideT = 0.2, oct = 0.2, send = 0.3, pan = 0 }) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + att);
    g.gain.setTargetAtTime(0, t + att, dec / 4);
    const a = osc(type, hz);
    if (glideTo) a.frequency.setTargetAtTime(glideTo, t, glideT);
    a.connect(g);
    const nodes = [g, a];
    const parts = [a];
    if (oct > 0) {
      const b = osc('sine', hz * 2);
      if (glideTo) b.frequency.setTargetAtTime(glideTo * 2, t, glideT);
      const gb = ctx.createGain();
      gb.gain.value = oct;
      b.connect(gb);
      gb.connect(g);
      nodes.push(b, gb);
      parts.push(b);
    }
    let out = g;
    if (pan && hasPan) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      out = p;
      nodes.push(p);
    }
    sfxNode(out, sfxBus, send);
    parts.forEach((x) => {
      x.start(t);
      x.stop(t + att + dec * 1.6 + 0.1);
    });
    cleanup(a, nodes);
  }
  function puff({ t, gain = 0.06, dur = 0.07, freq = 1100, q = 0.8, sweepTo = 0, att = 0.004, send = 0.15 }) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + att);
    g.gain.setTargetAtTime(0, t + att, dur / 3);
    src.connect(f);
    f.connect(g);
    sfxNode(g, sfxBus, send);
    src.start(t, fxRng.range(0, 0.8));
    src.stop(t + dur * 2.5 + 0.1);
    cleanup(src, [src, f, g]);
  }

  const now = () => ctx.currentTime;
  const mood = () => moodFor(state.mood);
  const live = () => !state.muted && !state.hidden && state.sfx > 0;

  const sfx = {
    absorb({ ratio = 0.05, t = now() } = {}) {
      const gv = gate.allow('absorb', t);
      if (!gv.ok || !live()) return;
      const p = absorbPitch(mood(), ratio, gv.chain);
      tone({ t, hz: p.hz, gain: 0.2 * p.gain, att: 0.012, dec: p.dur, type: p.body > 0.55 ? 'triangle' : 'sine', oct: 0.15 + 0.25 * p.body, pan: fxRng.range(-0.25, 0.25) });
    },
    eject({ stream = false, t = now() } = {}) {
      if (!gate.allow(stream ? 'beam' : 'eject', t).ok || !live()) return;
      puff({ t, gain: stream ? 0.03 : 0.055, dur: stream ? 0.06 : 0.08, freq: fxRng.range(900, 1400) });
    },
    swallowed({ t = now() } = {}) {
      if (!live()) return;
      const m = mood();
      tone({ t, hz: midiToHz(scaleMidi(m, scaleOf(m).length)), gain: 0.26, att: 0.03, dec: 1.4, type: 'triangle', glideTo: midiToHz(m.root - 12), glideT: 0.5, oct: 0.1, send: 0.5 });
      puff({ t, gain: 0.09, dur: 0.5, freq: 600, sweepTo: 120, q: 0.6, send: 0.3 });
    },
    win({ t = now() } = {}) {
      if (!live()) return;
      for (const n of winFigure(mood())) tone({ t: t + n.dt, hz: midiToHz(n.midi), gain: 0.16, att: 0.012, dec: 1.2, oct: 0.3, send: 0.6, pan: (n.dt - 0.3) * 0.8 });
    },
    rewind({ t = now() } = {}) {
      if (!live()) return;
      const m = mood();
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 1.2;
      f.frequency.setValueAtTime(200, t);
      f.frequency.exponentialRampToValueAtTime(2600, t + 0.9);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.85);
      g.gain.linearRampToValueAtTime(0, t + 0.95); // schwillt an und bricht ab: wirkt wie rueckwaerts abgespielt
      src.connect(f);
      f.connect(g);
      sfxNode(g, sfxBus, 0.3);
      src.start(t);
      src.stop(t + 1);
      cleanup(src, [src, f, g]);
      tone({ t: t + 0.8, hz: midiToHz(scaleMidi(m, scaleOf(m).length + 2)), gain: 0.14, att: 0.02, dec: 0.9, send: 0.5 });
    },
    timeStep({ idx = 1, t = now() } = {}) {
      if (!gate.allow('time', t).ok || !live()) return;
      const m = mood();
      tone({ t, hz: midiToHz(scaleMidi(m, scaleOf(m).length * 2 + clamp(idx, 0, 3) * 2)), gain: 0.1, att: 0.006, dec: 0.2, oct: 0.1, send: 0.2 });
    },
    ui({ t = now() } = {}) {
      if (!gate.allow('ui', t).ok || !live()) return;
      const m = mood();
      tone({ t, hz: midiToHz(scaleMidi(m, scaleOf(m).length * 2)), gain: 0.05, att: 0.004, dec: 0.1, oct: 0, send: 0.15 });
    },
    // Warnung "Zu weit draussen": ein leiser, tiefer Doppelton, hoechstens alle paar Sekunden (die Oberflaeche drosselt zusaetzlich)
    warn({ t = now() } = {}) {
      if (!gate.allow('warn', t).ok || !live()) return;
      const m = mood();
      const n = scaleOf(m).length;
      [0, 0.22].forEach((dt, i) => tone({ t: t + dt, hz: midiToHz(scaleMidi(m, n - 2 - i)), gain: 0.07, att: 0.03, dec: 0.5, type: 'triangle', oct: 0, send: 0.4, pan: 0 }));
    },
    levelStart({ t = now() } = {}) {
      if (!live()) return;
      const m = mood();
      const n = scaleOf(m).length;
      [0, 2, 4].forEach((s, i) => tone({ t: t + i * 0.12, hz: midiToHz(scaleMidi(m, n + s)), gain: 0.11, att: 0.5, dec: 1.8, oct: 0.1, send: 0.6, pan: (i - 1) * 0.3 }));
    },
  };

  /* ----- Steuerung ----- */
  const api = {
    ctx,
    score,
    state,
    master,
    sfx,
    pump,
    setInput,
    setMood,
    applyParams,
    /** Lautstaerken (0-100) und Stumm; wirkt ueber Rampen. */
    setVolumes({ music, sfx: s, muted } = {}) {
      if (music != null) state.music = music;
      if (s != null) state.sfx = s;
      if (muted != null) state.muted = !!muted;
      levels();
    },
    setPaused(on) {
      state.paused = !!on;
      levels(ctx.currentTime, on ? 0.35 : 0.6);
    },
    /** Sichtbarkeit: false = ausblenden (Master), true = weich einblenden. */
    setHidden(on, tau = 0.12) {
      state.hidden = !!on;
      master.gain.setTargetAtTime(on ? 0 : 1, ctx.currentTime, on ? 0.08 : 0.5);
      levels(ctx.currentTime, tau);
    },
    /** Beginn: Master einblenden, Parameter setzen. */
    start(t = ctx.currentTime) {
      if (state.started) return;
      state.started = true;
      state.planned = t;
      master.gain.setTargetAtTime(state.hidden ? 0 : 1, t, 0.6);
      levels(t, 1.2);
      setInput({}, t);
    },
    attachAnalyser() {
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      an.smoothingTimeConstant = 0;
      post.connect(an);
      return an;
    },
    /** Offline: alles bis `seconds` im Voraus erzeugen. */
    scheduleAll(seconds) {
      api.start(0);
      pump(seconds);
    },
  };
  return api;
}

/* ---------- Huelle fuer die Oberflaeche ---------- */

export function createAudio({ settings, seed } = {}) {
  const S = () => (typeof settings === 'function' ? settings() : settings) || {};
  const get = (k, d) => (S()[k] == null ? d : S()[k]);
  let ctx = null;
  let engine = null;
  let timer = 0;
  let scene = 'select';
  let paused = false;
  let hideTimer = 0;
  const seedV = seed != null ? seed : Math.floor(Math.random() * 4294967296); // nur der Klang; die Physik nutzt dies nie

  const vols = () => ({ music: get('music', A.volume.music), sfx: get('sfx', A.volume.sfx), muted: !!get('mute', false) });

  function ensure() {
    if (engine) return engine;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    try {
      ctx = new AC({ latencyHint: 'playback' });
    } catch {
      try {
        ctx = new AC();
      } catch {
        return null;
      }
    }
    engine = createEngine(ctx, { seed: seedV, mood: scene, ...vols() });
    engine.setPaused(paused);
    engine.start();
    timer = setInterval(() => {
      if (ctx.state === 'running') engine.pump();
    }, A.pumpMs);
    return engine;
  }

  const api = {
    get ctx() {
      return ctx;
    },
    get engine() {
      return engine;
    },
    /** Muss aus einer Nutzergeste aufgerufen werden (iOS): erzeugt/weckt den Context. */
    unlock() {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const e = ensure();
      if (e && ctx.state !== 'running') ctx.resume().catch(() => {});
    },
    get unlocked() {
      return !!engine;
    },
    setScene(id) {
      scene = id;
      if (engine) engine.setMood(id);
    },
    update(inp) {
      if (engine) engine.setInput(inp);
    },
    refreshVolumes() {
      if (engine) engine.setVolumes(vols());
    },
    setPaused(on) {
      paused = !!on;
      if (engine) engine.setPaused(paused);
    },
    get muted() {
      return !!get('mute', false);
    },
    /** Sichtbarkeit des Tabs: ausblenden und danach den Context anhalten, beim Zurueckkommen weich einblenden. */
    visibility(visible) {
      if (!engine) return;
      clearTimeout(hideTimer);
      if (visible) {
        ctx.resume().catch(() => {});
        engine.setHidden(false);
      } else {
        engine.setHidden(true);
        hideTimer = setTimeout(() => {
          if (engine.state.hidden) ctx.suspend().catch(() => {});
        }, 450);
      }
    },
    sfx: {},
  };
  for (const k of ['absorb', 'eject', 'swallowed', 'win', 'rewind', 'timeStep', 'ui', 'warn', 'levelStart']) {
    api.sfx[k] = (arg) => {
      if (engine && ctx.state === 'running') engine.sfx[k](arg);
    };
  }
  api.stop = () => clearInterval(timer);
  return api;
}
