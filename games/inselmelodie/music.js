// Noten als Daten (DOM-frei): Melodie-Kurzschrift, Lage im Notensystem, Farben, Fingernummern.
import { noteName } from './notes.js';

/** Farbe je Tonname (Hilfe "farbige Notenköpfe"). Passt zu den Inseltieren: C grün (Chamäleon), D blau (Delfin),
 *  E orange (Eule), F pink (Flamingo), G gelb (Gecko), A braun (Affe), H rot (Hummer). Das hohe C ist ein C: grün. */
export const NOTE_COLORS = {
  C: '#4fae2f',
  D: '#2b86d9',
  E: '#f08c12',
  F: '#e2559c',
  G: '#e2b616',
  A: '#9a6438',
  H: '#dc3f2c',
};
const GREY = '#8a9aa0';
export const noteColor = (midi) => NOTE_COLORS[noteName(midi)] || GREY;

const NAT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, H: 11 };
const STEP_IN_OCT = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };

/** 'C4' / 'Cis4' / 'H4' -> MIDI */
export function parseNote(s) {
  const m = /^([CDEFGAH])(is)?(\d)$/.exec(s);
  if (!m) throw new Error('Unbekannte Note: ' + s);
  return 12 * (+m[3] + 1) + NAT[m[1]] + (m[2] ? 1 : 0);
}

/**
 * Melodie-Kurzschrift: Noten mit Oktave, Dauer nach dem Doppelpunkt in Vierteln (Standard 1), '|' = Taktstrich.
 * 'G4 E4 E4:2 | F4 D4 D4:2' -> [{midi, beats, bar}] (bar = Taktstrich NACH dieser Note).
 */
export function parseMelody(str) {
  const out = [];
  for (const tok of str.trim().split(/\s+/)) {
    if (tok === '|') {
      if (out.length) out[out.length - 1].bar = true;
      continue;
    }
    const [n, d] = tok.split(':');
    out.push({ midi: parseNote(n), beats: d ? +d : 1, bar: false });
  }
  if (out.length) out[out.length - 1].bar = true;
  return out;
}

/** Diatonische Stufe: C4 = 0, D4 = 1 ... C5 = 7. Für Vorzeichen-Töne die Stufe des Tons darunter (Cis -> C). */
export function staffStep(midi) {
  const oct = Math.floor(midi / 12) - 1;
  let pc = midi % 12;
  const sharp = !(pc in STEP_IN_OCT);
  if (sharp) pc -= 1;
  return { step: (oct - 4) * 7 + STEP_IN_OCT[pc], sharp };
}

/** Fingernummer in der C-Lage der rechten Hand (C=1 ... G=5), sonst null (Lagenwechsel kommen später). */
export function fingerOf(midi) {
  const i = [60, 62, 64, 65, 67].indexOf(midi);
  return i < 0 ? null : i + 1;
}

/** Notenwert-Name für Erklärungen. */
export const valueName = (beats) => ({ 1: 'Viertel', 2: 'Halbe', 3: 'punktierte Halbe', 4: 'Ganze' })[beats] || 'Note';
