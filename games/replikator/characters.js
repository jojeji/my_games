// Cast of Replikator. Display names, roles, colours, bios and emblems live ONLY here - story texts reference names through this config.
// No photos: every character has a simple SVG emblem (inner markup of a 24x24 stroke icon) that engine/ui/avatar.js draws in the character's colour.
// Replace an emblem (or add `img`/`sm` image paths relative to games/replikator/) and the UI picks it up; images win over emblems.
export const CAST = {
  sonde: {
    id: 'sonde', name: 'R-1', role: 'Sonde, das bist du', color: '#38d6f2', side: 'left', // cyan = the game's accent
    bio: 'Prototyp einer selbstkopierenden Sonde. Führt Protokoll, nicht Tagebuch. Ist ein bisschen stolz auf ihren Wirkungsgrad und höflich zu allem, auch zu Sternen. Ihr Auftrag besteht aus zwei Wörtern.',
    emblem: '<circle cx="12" cy="13" r="4.5"/><path d="M12 8.5V4M9.5 4h5M7.5 16.5L5 20M16.5 16.5L19 20M7.5 13H3.5M16.5 13h4"/>',
  },
  wartung: {
    id: 'wartung', name: 'WR-0', role: 'Wartungsroutine', color: '#f0b64a', side: 'right', // amber
    unlock: 'st_start',
    bio: 'Läuft im Hintergrund und schreibt Berichte über die Sonde. Gewissenhaft, wörtlich und hilflos. Jeder Bericht endet auf eine Verfügung. Hat keinen Schraubenschlüssel, aber Zeit.',
    emblem: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2.1 2.1M15.9 15.9L18 18M18 6l-2.1 2.1M8.1 15.9L6 18"/>',
  },
  // Akt II: defined now so the voice and the look are fixed, but never shown in version 1 (`later`: no story entry introduces them yet).
  mission: {
    id: 'mission', name: 'Missionsleitung', role: 'Die Erbauer', color: '#ff8f6b', side: 'right', // warm coral
    later: true,
    bio: 'Die Erbauer der Sonde. Melden sich per Funk, mit Lichtlaufzeit. Warm und gesprächig, über die Jahre immer kürzer.',
    emblem: '<circle cx="6" cy="18" r="1.6"/><path d="M6 12a6 6 0 0 1 6 6M6 6a12 12 0 0 1 12 12"/>',
  },
  echo: {
    id: 'echo', name: 'Echo', role: 'Eine zweite R-1', color: '#9b8cff', side: 'right', // violet = the game's second accent
    later: true,
    bio: 'Klingt wie die Sonde, nur einen Hauch älter und müder. Kennt ihre Fehler, weil es dieselben hat.',
    emblem: '<circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="6" stroke-dasharray="2 3"/><circle cx="12" cy="12" r="10" stroke-dasharray="1 4"/>',
  },
};

/** Has the story entry that introduces a character been shown (modal played / bubble announced / read)? The Sonde: always. */
export function isMet(g, who) {
  const c = CAST[who];
  if (!c || c.later) return false;
  if (!c.unlock) return true;
  const ch = g.state.chronicle || { shown: {}, read: {} };
  return !!(ch.shown[c.unlock] || ch.read[c.unlock]);
}
/** Cast ids visible in the "Figuren" row, in display order. */
export const metCast = (g) => Object.keys(CAST).filter((id) => isMet(g, id));

/** Placeholders for story texts. */
export const P = CAST.sonde.name;
export const W = CAST.wartung.name;
export const M = CAST.mission.name;
export const E = CAST.echo.name;

/** Speaker data for the UI: { name, color, side, emblem, img?, sm? }. Unknown speakers fall back to the Sonde. */
export function portrait(who) {
  const c = CAST[who] || CAST.sonde;
  return { name: c.name, color: c.color, emblem: c.emblem, img: c.img, sm: c.sm };
}

/** Line text; may be a function of the game. */
export const lineText = (g, line) => (typeof line.t === 'function' ? line.t(g) : line.t);
