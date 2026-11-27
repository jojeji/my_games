// Mikrofon-Eingabe: dieselbe Erkennung wie die Probe (pitch.js + tracker.js), meldet Anschläge als MIDI-Nummern.
import { detectPitch, rms } from './pitch.js';
import { createTracker } from './tracker.js';

export function createMic() {
  let ctx = null;
  let analyser = null;
  let stream = null;
  let buf = null;
  let nsdf = null;
  let tracker = createTracker();
  let raf = 0;
  let onNote = null;
  let onFrame = null;
  let mutedUntil = 0;
  let context = null;

  function loop() {
    if (!stream || !ctx) return; // gestoppt (auch mitten in einem Durchlauf, z. B. am Ende eines Stücks)
    analyser.getFloatTimeDomainData(buf);
    const t = performance.now();
    const p = detectPitch(buf, ctx.sampleRate, { nsdf });
    const f = { t, rms: rms(buf), freq: p.freq, clarity: p.clarity };
    const ev = tracker.push(f);
    onFrame?.(f, tracker);
    if (ev && t > mutedUntil) onNote?.(ev.midi, ev);
    if (stream) raf = requestAnimationFrame(loop); // onNote kann das Mikrofon gestoppt haben
  }

  return {
    get running() { return !!stream; },
    /** @returns {Promise<string|null>} Fehlermeldung oder null */
    async start(offsetCents = 0) {
      tracker = createTracker({ offsetCents });
      tracker.setContext(context);
      if (stream) return null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch (e) {
        return e.name === 'NotAllowedError' ? 'Das Mikrofon wurde nicht erlaubt.' : 'Kein Mikrofon gefunden.';
      }
      ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      buf = new Float32Array(analyser.fftSize);
      nsdf = new Float32Array(1200);
      raf = requestAnimationFrame(loop);
      return null;
    },
    stop() {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close();
      stream = null;
      ctx = null;
    },
    /** Meldungen für ms ignorieren (z. B. während die App selbst einen Ton spielt). */
    mute(ms) { mutedUntil = performance.now() + ms; },
    set onNote(fn) { onNote = fn; },
    set onFrame(fn) { onFrame = fn; },
    setOffset(c) { tracker.setOffset(c); },
    /** Spielkontext für die Störfestigkeit: {want, lo, hi} (gesuchte Note, Tastenbereich) oder null. */
    setContext(c) { context = c; tracker.setContext(c); },
  };
}
