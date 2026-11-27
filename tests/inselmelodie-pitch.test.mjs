import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPitch, rms } from '../games/inselmelodie/pitch.js';
import { nearest, calibrate, noteName, sciName, midiToFreq } from '../games/inselmelodie/notes.js';
import { render, SR } from './helpers/piano-synth.mjs';
import { runSignal } from './helpers/inselmelodie-run.mjs';

const midis = (evs) => evs.map((e) => e.midi);

test('Tonnamen deutsch, Mittel-C = 60', () => {
  assert.equal(noteName(60), 'C');
  assert.equal(noteName(71), 'H');
  assert.equal(noteName(70), 'B');
  assert.equal(sciName(60), 'C4');
  assert.equal(nearest(261.63).midi, 60);
});

test('reiner Sinus: Frequenz auf 1 Cent genau, C3 bis C6', () => {
  for (let midi = 48; midi <= 84; midi++) {
    const f = midiToFreq(midi);
    const buf = new Float32Array(2048).map((_, i) => 0.3 * Math.sin((2 * Math.PI * f * i) / SR));
    const p = detectPitch(buf, SR);
    const cents = 1200 * Math.log2(p.freq / f);
    assert.ok(Math.abs(cents) < 1, `midi ${midi}: ${cents.toFixed(2)} Cent`);
    assert.ok(p.clarity > 0.95);
  }
});

test('Klavierähnlicher Ton mit schwachem Grundton: keine Oktavfehler, C3 bis C6', () => {
  for (let midi = 48; midi <= 84; midi++) {
    for (const weak of [0.25, 0.05]) {
      const sig = render([{ midi, at: 0, dur: 1 }], { seconds: 1, weakFundamental: weak });
      const buf = sig.subarray(4800, 4800 + 2048); // 100 ms nach dem Anschlag
      const p = detectPitch(buf, SR);
      assert.equal(nearest(p.freq).midi, midi, `midi ${midi}, Grundton ${weak}: erkannt ${p.freq.toFixed(1)} Hz`);
    }
  }
});

test('Stille und Rauschen ergeben keinen klaren Ton', () => {
  const sig = render([], { seconds: 0.2, noise: 0.01, seed: 3 });
  const p = detectPitch(sig.subarray(0, 2048), SR);
  assert.ok(p.freq === 0 || p.clarity < 0.6, `Rauschen: ${p.freq} Hz, Klarheit ${p.clarity}`);
  assert.equal(detectPitch(new Float32Array(2048), SR).freq, 0);
  assert.equal(rms(new Float32Array(4)), 0);
});

test('Tonleiter C4..C5 im Wartemodus-Tempo: jede Note genau einmal', () => {
  const scale = [60, 62, 64, 65, 67, 69, 71, 72];
  const notes = scale.map((midi, i) => ({ midi, at: 0.3 + i * 0.7, dur: 0.65 }));
  const { events } = runSignal(render(notes, { seconds: 6.2 }));
  assert.deepEqual(midis(events), scale);
});

test('Wiederholte gleiche Note (G G G) wird dreimal gemeldet', () => {
  const notes = [0, 1, 2].map((i) => ({ midi: 67, at: 0.3 + i * 0.6, dur: 0.58 }));
  const { events } = runSignal(render(notes, { seconds: 2.4 }));
  assert.deepEqual(midis(events), [67, 67, 67]);
});

test('Lang ausgehaltene Note wird nur einmal gemeldet', () => {
  const { events } = runSignal(render([{ midi: 64, at: 0.2, dur: 3 }], { seconds: 3.4 }));
  assert.deepEqual(midis(events), [64]);
});

test('Verstimmtes Klavier (-60 Cent): ohne Kalibrierung falsch, mit Kalibrierung richtig', () => {
  const scale = [60, 62, 64, 65, 67];
  const notes = scale.map((midi, i) => ({ midi, at: 0.3 + i * 0.7, dur: 0.65, detune: -60 }));
  const sig = render(notes, { seconds: 4 });
  // Kalibrierung: Mittel-C gespielt, Frequenzen aus den Fenstern
  const cSig = render([{ midi: 60, at: 0, dur: 1, detune: -60 }], { seconds: 1 });
  const samples = [];
  for (let s = 4800; s + 2048 < 40000; s += 2400) samples.push({ freq: detectPitch(cSig.subarray(s, s + 2048), SR).freq, midi: 60 });
  const off = calibrate(samples);
  // gespreizte Obertöne heben die gemessene Tonhöhe um einige Cent, die Kalibrierung nimmt das mit
  assert.ok(Math.abs(off + 60) < 6, `Verstimmung ${off}`);
  assert.deepEqual(midis(runSignal(sig).events), scale.map((m) => m - 1), 'ohne Kalibrierung einen Halbton daneben');
  const { events } = runSignal(sig, { tracker: { offsetCents: off } });
  assert.deepEqual(midis(events), scale);
  for (const e of events) assert.ok(Math.abs(e.cents) < 10);
});

test('Leise gespielt und mit Raumrauschen: Tonleiter wird trotzdem erkannt', () => {
  const scale = [60, 62, 64, 65, 67];
  const notes = scale.map((midi, i) => ({ midi, at: 0.4 + i * 0.7, dur: 0.65, vel: 0.04 }));
  const { events } = runSignal(render(notes, { seconds: 4.2, noise: 0.004, seed: 9 }));
  assert.deepEqual(midis(events), scale);
});

test('Rechenzeit je Fenster bleibt klein (Tablet hat ~10x weniger Leistung)', () => {
  const sig = render([{ midi: 60, at: 0, dur: 1 }], { seconds: 1 });
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) detectPitch(sig.subarray(4800, 4800 + 2048), SR);
  const ms = (performance.now() - t0) / 200;
  assert.ok(ms < 2, `${ms.toFixed(2)} ms je Fenster`);
});

// ---- Störfestigkeit gegen Sprache im Raum (Rückmeldung vom echten Klavier: Gerede ergab falsche Töne) ----
import { speech, mix } from './helpers/piano-synth.mjs';

const VOICES = { Maenner: [90, 170], Frauen: [170, 260], Kinder: [240, 400] };

test('Gerede im Raum ergibt im Spiel (fast) keine Fehlgriffe mehr', () => {
  for (const [name, f0] of Object.entries(VOICES)) {
    let wrong = 0, before = 0;
    for (let seed = 1; seed <= 3; seed++) {
      const sp = speech({ seconds: 20, seed, f0, level: 0.05 });
      wrong += runSignal(sp, { ctx: { want: 60, lo: 60, hi: 72 } }).events.filter((e) => e.midi !== 60).length;
      before += runSignal(sp).events.length;
    }
    const perMin = (wrong * 60) / 60;
    assert.ok(perMin <= 2, `${name}: ${perMin.toFixed(1)} Fehlgriffe/min (ohne Kontext ${before})`);
    assert.ok(before > 20, `${name}: Testsignal muss ohne Filter Fehlgriffe erzeugen (${before})`);
  }
});

test('Klavier mit Gerede: jede richtige Note und jeder echte Fehlgriff wird erkannt', () => {
  const song = [67, 64, 64, 65, 62, 62, 60, 62, 64, 65, 67, 67, 67];
  for (const [name, f0] of Object.entries(VOICES)) {
    const notes = [];
    let t = 0.4;
    let realWrong = 0;
    song.forEach((m, i) => {
      if (i % 4 === 3) { notes.push({ midi: m + 2, at: t, dur: 0.6, vel: 0.15 }); realWrong++; t += 0.7; }
      notes.push({ midi: m, at: t, dur: 0.7, vel: 0.15 });
      t += 0.75;
    });
    const sig = mix(render(notes, { seconds: t + 0.6, seed: 3 }), speech({ seconds: t + 0.6, seed: 23, f0, level: 0.04 }));
    const { events } = runSignal(sig, { ctx: (evs) => { let k = 0; for (const e of evs) if (e.midi === song[k]) k++; return { want: song[k] ?? null, lo: 60, hi: 72 }; } });
    let j = 0, w = 0;
    for (const e of events) { if (e.midi === song[j]) j++; else w++; }
    assert.equal(j, song.length, `${name}: alle Noten getroffen`);
    assert.ok(w >= realWrong && w <= realWrong + 1, `${name}: ${w} Fehlgriffe gemeldet, ${realWrong} echt`);
  }
});

test('Stimmungsfilter: ohne Kalibrierung spielt er nicht mit (Probe/Kalibrierung ohne Kontext unverändert)', () => {
  // 40 Cent verstimmt, ohne Kontext: wird erkannt wie bisher
  const notes = [60, 62, 64].map((midi, i) => ({ midi, at: 0.3 + i * 0.7, dur: 0.65, detune: -40 }));
  assert.deepEqual(runSignal(render(notes, { seconds: 2.6 })).events.map((e) => e.midi), [60, 62, 64]);
});
