// Spielt ein Signal wie im Browser durch: Fenster von WIN Werten alle HOP Werte (≈ 60 Bilder/s), Erkennung + Verfolger.
import { detectPitch, rms } from '../../games/inselmelodie/pitch.js';
import { createTracker } from '../../games/inselmelodie/tracker.js';
import { SR } from './piano-synth.mjs';

/** ctx: Spielkontext {want, lo, hi} oder Funktion (bisherige Ereignisse) -> Kontext (wie das Spiel nach jedem Treffer). */
export function runSignal(sig, { win = 2048, hop = 800, sr = SR, tracker = {}, ctx = null } = {}) {
  const tr = createTracker(tracker);
  const setCtx = (events) => { if (ctx) tr.setContext(typeof ctx === 'function' ? ctx(events) : ctx); };
  const events = [];
  const frames = [];
  setCtx(events);
  for (let end = win; end <= sig.length; end += hop) {
    const buf = sig.subarray(end - win, end);
    const p = detectPitch(buf, sr);
    const f = { t: (end / sr) * 1000, rms: rms(buf), freq: p.freq, clarity: p.clarity };
    frames.push(f);
    const ev = tr.push(f);
    if (ev) { events.push(ev); setCtx(events); }
  }
  return { events, frames };
}
