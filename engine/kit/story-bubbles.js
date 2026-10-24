// DOM-free logic of the story bubble layer (engine/ui/story-bubbles.js): timing, queueing, offline aggregation.
// Items: { kind: 'entry', key, def } | { kind: 'summary', key: 'summary', count, firstId }.

export const TEMPOS = { normal: 1, fast: 0.5 };
/** Pause after the last line before the whole conversation fades out (ms, before tempo). */
export const LINGER_MS = 6000;

/** How long "typing ..." lasts before a line appears: ~1.2-4 s, proportional to the text length. */
export function typingDelayMs(text, tempo = 'normal', first = false) {
  const len = String(text || '').length;
  let ms = Math.min(4000, Math.max(1200, 700 + len * 18));
  if (first) ms = Math.min(ms, 1400); // the interruption itself: do not make the player wait for the first line
  const k = TEMPOS[tempo] ?? 1;
  return Math.round(Math.max(500, ms * k));
}

export const lingerMs = (tempo = 'normal') => Math.round(LINGER_MS * (tempo === 'fast' ? 0.7 : 1));

/**
 * Turns entries that were never announced (e.g. triggered while the app was closed) into queue items:
 * one entry -> shown normally, several -> a single summary bubble ("3 neue Chronik-Einträge").
 * @param {Array<{id:string}>} entries chronological
 */
export function planBacklog(entries, minAggregate = 2) {
  if (!entries.length) return [];
  if (entries.length < minAggregate) return entries.map((def) => ({ kind: 'entry', key: def.id, def }));
  return [{ kind: 'summary', key: 'summary', count: entries.length, firstId: entries[0].id }];
}

/** FIFO of bubble items; entries are deduplicated by id, a newer summary replaces an older, still waiting one. */
export function createBubbleQueue() {
  let items = [];
  return {
    push(item) {
      if (item.kind === 'summary') items = items.filter((x) => x.kind !== 'summary');
      else if (items.some((x) => x.key === item.key)) return false;
      items.push(item);
      return true;
    },
    shift: () => items.shift(),
    has: (key) => items.some((x) => x.key === key),
    clear: () => { items = []; },
    ids: () => items.filter((x) => x.kind === 'entry').map((x) => x.key),
    get length() { return items.length; },
  };
}

/** State per shown line of a conversation: the newest `max` stay, the oldest of them is faded, the rest is gone. */
export function visibleWindow(total, max = 3) {
  const out = [];
  for (let i = 0; i < total; i++) {
    const fromEnd = total - 1 - i;
    out.push(fromEnd >= max ? 'gone' : fromEnd === max - 1 && total > max ? 'old' : 'new');
  }
  return out;
}

/** "Diary" styling: a long line of an entry that is a monologue (one speaker only), as opposed to a dialogue line. */
export function isDiaryLine(entry, line, body, minLen = 90) {
  const lines = (entry && entry.lines) || [];
  if (String(body || '').length < minLen) return false;
  const who = (l) => l.who || 'merlin';
  return lines.every((l) => who(l) === who(line));
}
