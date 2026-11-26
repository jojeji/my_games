// Noten, Tonnamen, Stimmung (DOM-frei).
// Intern ist jede Note eine MIDI-Nummer (60 = Mittel-C, 69 = A mit 440 Hz). Angezeigt werden deutsche Tonnamen (H statt B).

export const MITTEL_C = 60;
const NAMES = ['C', 'Cis', 'D', 'Dis', 'E', 'F', 'Fis', 'G', 'Gis', 'A', 'B', 'H'];

/** Frequenz -> MIDI als Kommazahl, mit Verstimmung des Klaviers in Cent (positiv = Klavier zu hoch). */
export function freqToMidi(freq, offsetCents = 0) {
  return 69 + 12 * Math.log2(freq / 440) - offsetCents / 100;
}

/** Nächste Note und Abweichung in Cent (-50..50). */
export function nearest(freq, offsetCents = 0) {
  const m = freqToMidi(freq, offsetCents);
  const midi = Math.round(m);
  return { midi, cents: (m - midi) * 100 };
}

export const midiToFreq = (midi, offsetCents = 0) => 440 * 2 ** ((midi - 69 + offsetCents / 100) / 12);

/** Tonname ohne Oktave: 'C', 'Fis', 'H' ... */
export const noteName = (midi) => NAMES[((midi % 12) + 12) % 12];

/** Wissenschaftliche Oktave: 60 -> 'C4'. Nur für Erwachsene/Diagnose, Kinder sehen den Tonnamen. */
export const sciName = (midi) => NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);

/**
 * Verstimmung aus einer Reihe gemessener Frequenzen, die zu bekannten Noten gehören sollen.
 * Median der Abweichungen in Cent (robust gegen Ausreißer beim Anschlag).
 * Abweichungen über ±50 Cent sind eindeutig nicht feststellbar (Halbton-Mehrdeutigkeit), deshalb muss die
 * gespielte Note bekannt sein: `samples` = [{freq, midi}].
 */
export function calibrate(samples) {
  const c = samples
    .filter((s) => s.freq > 0)
    .map((s) => 1200 * Math.log2(s.freq / midiToFreq(s.midi)))
    .filter((x) => Math.abs(x) < 150)
    .sort((a, b) => a - b);
  if (!c.length) return null;
  const mid = c.length >> 1;
  return c.length % 2 ? c[mid] : (c[mid - 1] + c[mid]) / 2;
}
