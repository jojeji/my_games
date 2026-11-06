// Cast of Myzel. Display names, roles, colours, bios and emblems live ONLY here - story texts reference the proper names through the
// placeholders T and K (a test forbids them as hard-coded text in story.js). "Myzel" is a common noun and may appear in the texts.
// No photos: every character has a simple SVG emblem (inner markup of a 24x24 stroke icon) that engine/ui/avatar.js draws in the character's colour.
export const CAST = {
  myzel: {
    id: 'myzel', name: 'Myzel', role: 'Das Netz, das bist du', color: '#4ff2b0', side: 'left', // the game's accent
    bio: 'Eine Spore, die gekeimt hat. Hat keine Augen und keine Ohren, schmeckt dafür alles. Zählt in Regen und Nächten, ist nicht eilig und merkt sich, wie Dinge schmecken.',
    emblem: '<path d="M12 21v-8M12 13C12 9 8.5 8.5 5 4M12 13c0-4 3.5-4.5 7-9M12 17c-2.2-.4-4-1.4-5.5-3.5M12 17c2.2-.4 4-1.4 5.5-3.5"/><circle cx="5" cy="4" r="1"/><circle cx="19" cy="4" r="1"/>',
  },
  taxus: {
    id: 'taxus', name: 'Taxus', role: 'Eibe, neunhundert Jahre', color: '#e8806a', side: 'right', // aril red
    unlock: 'f_first',
    bio: 'Die älteste Eibe im Wald. Spricht kurz und antwortet spät. Führt Buch über Zucker und Phosphor und nennt das einen Vertrag. Hat in ihrem Leben schon einiges kommen und gehen sehen.',
    emblem: '<path d="M12 21V5M12 8L7 5.5M12 8l5-2.5M12 12.5L6 9.5M12 12.5l6-3M12 17l-5-2.5M12 17l5-2.5"/><circle cx="17.5" cy="19.5" r="2"/>',
  },
  kurt: {
    id: 'kurt', name: 'Kurt', role: 'Waldmistkäfer, immer ein anderer', color: '#e8c26a', side: 'right', // amber
    unlock: 'st_start',
    bio: 'Läuft über das Netz und hat es eilig. Alle in seiner Familie heißen Kurt, deshalb ist es immer derselbe. Lebt einen Sommer und fängt in dieser Zeit vieles an.',
    emblem: '<ellipse cx="12" cy="13.5" rx="4.5" ry="6"/><path d="M12 7.5v12M9.5 4l2 3.5M14.5 4l-2 3.5M4.5 10l3.5 1.5M19.5 10L16 11.5M4.5 17l3.5-1.5M19.5 17L16 15.5"/>',
  },
};

/** Has the story entry that introduces a character been shown (modal played / bubble announced / read)? The Myzel: always. */
export function isMet(g, who) {
  const c = CAST[who];
  if (!c) return false;
  if (!c.unlock) return true;
  const ch = g.state.chronicle || { shown: {}, read: {} };
  return !!(ch.shown[c.unlock] || ch.read[c.unlock]);
}
/** Cast ids visible in the "Figuren" row, in display order. */
export const metCast = (g) => Object.keys(CAST).filter((id) => isMet(g, id));

/**
 * Role and bio that change with the story: after the ending the Eibe has a new name for the Myzel and a different place in the wood.
 * Returns the fields to put over the cast entry (the UI card), or {}.
 */
export function castInfo(g, who) {
  const ended = g.state.myz && g.state.myz.end > 0;
  if (who === 'taxus' && ended) return { role: 'Eibe, nicht mehr allein', bio: 'Die älteste Eibe im Wald. Führt noch Buch, aber nur aus Gewohnheit. Hängt an dreizehn Stümpfen und an dem, was sie verbindet.' };
  if (who === 'kurt' && ended) return { role: 'Waldmistkäfer, hat von oben geschaut', bio: 'Der Kurt, der den Ring von oben gesehen hat. Hat den Satz, den er seit Tagen anfängt, endlich zu Ende gebracht.' };
  return {};
}

/** Placeholders for story texts. */
export const T = CAST.taxus.name;
export const K = CAST.kurt.name;

/** Speaker data for the UI: { name, color, emblem }. Unknown speakers fall back to the Myzel. */
export function portrait(who) {
  const c = CAST[who] || CAST.myzel;
  return { name: c.name, color: c.color, emblem: c.emblem, img: c.img, sm: c.sm };
}

/** Line text; may be a function of the game. */
export const lineText = (g, line) => (typeof line.t === 'function' ? line.t(g) : line.t);
