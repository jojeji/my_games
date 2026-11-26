// Tonhöhenerkennung (DOM-frei, läuft auch in Node).
// Verfahren: McLeod Pitch Method (normalisierte Autokorrelation, NSDF, "erste Spitze über k × höchster Spitze").
// Sie findet die Periode auch dann, wenn der Grundton schwach ist (tiefe Klaviertöne, kleine Tablet-Mikrofone),
// und vermeidet Oktavfehler nach oben, weil sie die Periode und nicht den lautesten Teilton sucht.

/** Effektivwert (RMS) eines Puffers. */
export function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

/**
 * @param {Float32Array|number[]} buf Zeitsignal (ein Fenster, z. B. 2048 Werte)
 * @param {number} sampleRate
 * @param {{fMin?:number, fMax?:number, k?:number, nsdf?:Float32Array}} [opt]
 * @returns {{freq:number, clarity:number}} freq 0 = kein Ton gefunden
 */
export function detectPitch(buf, sampleRate, opt = {}) {
  const fMin = opt.fMin ?? 100;
  const fMax = opt.fMax ?? 1400;
  const k = opt.k ?? 0.9;
  const n = buf.length;
  const maxTau = Math.min(Math.floor(sampleRate / fMin) + 2, Math.floor(n / 2));
  const minTau = Math.max(2, Math.floor(sampleRate / fMax) - 1);
  const nsdf = opt.nsdf && opt.nsdf.length >= maxTau + 1 ? opt.nsdf : new Float32Array(maxTau + 1);

  // m(tau) = Summe x[i]^2 + x[i+tau]^2 für i < n - tau, inkrementell
  let m = 0;
  for (let i = 0; i < n; i++) m += 2 * buf[i] * buf[i];
  if (m <= 1e-12) return { freq: 0, clarity: 0 };
  for (let tau = 0; tau <= maxTau; tau++) {
    if (tau > 0) m -= buf[tau - 1] * buf[tau - 1] + buf[n - tau] * buf[n - tau];
    let acf = 0;
    const lim = n - tau;
    for (let i = 0; i < lim; i++) acf += buf[i] * buf[i + tau];
    nsdf[tau] = m > 1e-12 ? (2 * acf) / m : 0;
  }

  // Spitzen: jeweils das Maximum eines positiven Abschnitts nach dem ersten Nulldurchgang nach unten
  const peaks = [];
  let tau = 1;
  while (tau <= maxTau && nsdf[tau] > 0) tau++; // erster Abschnitt um tau = 0 überspringen
  let best = -1;
  let bestTau = -1;
  let inPos = false;
  for (; tau <= maxTau; tau++) {
    const v = nsdf[tau];
    if (v > 0) {
      if (!inPos) { inPos = true; best = -1; bestTau = -1; }
      if (v > best) { best = v; bestTau = tau; }
    } else if (inPos) {
      inPos = false;
      if (bestTau >= minTau) peaks.push(bestTau);
    }
  }
  if (inPos && bestTau >= minTau && bestTau < maxTau) peaks.push(bestTau);
  if (!peaks.length) return { freq: 0, clarity: 0 };

  let top = 0;
  for (const p of peaks) top = Math.max(top, nsdf[p]);
  const pick = peaks.find((p) => nsdf[p] >= k * top);

  // Parabel durch die drei Punkte um die Spitze
  const a = nsdf[pick - 1];
  const b = nsdf[pick];
  const c = pick + 1 <= maxTau ? nsdf[pick + 1] : b;
  const den = a - 2 * b + c;
  const shift = den !== 0 ? (0.5 * (a - c)) / den : 0;
  const t = pick + Math.max(-0.5, Math.min(0.5, shift));
  const clarity = Math.min(1, b - 0.25 * (a - c) * shift);
  const freq = sampleRate / t;
  if (freq < fMin * 0.97 || freq > fMax * 1.03) return { freq: 0, clarity: 0 };
  return { freq, clarity };
}
