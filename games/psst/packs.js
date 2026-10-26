// Kartenpakete loader. Index first, pack files lazily (only the selected ones).
// Looks in data/ (real cards) and falls back to fixtures/demo-packs/ only when data/packs.json is missing.
import { mergeCards } from './logic.js';

const BASES = ['data/', 'fixtures/demo-packs/'];

async function defaultFetchJson(url) {
  const res = await fetch(new URL(url, import.meta.url));
  if (!res.ok) throw new Error(url + ': HTTP ' + res.status);
  return res.json();
}

export function createPackStore({ fetchJson = defaultFetchJson, bases = BASES } = {}) {
  let base = null;
  let index = null;
  let pending = null;
  const cache = new Map();

  async function load() {
    let lastErr;
    for (const b of bases) {
      try {
        const j = await fetchJson(b + 'packs.json');
        if (!j || !Array.isArray(j.packs)) throw new Error('packs.json ungültig');
        base = b;
        index = j.packs;
        return index;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Keine Kartenpakete gefunden.');
  }

  const store = {
    get base() {
      return base;
    },
    get demo() {
      return base !== null && base !== bases[0];
    },
    /** Index of all Kartenpakete (concurrent calls share one request). */
    loadIndex() {
      if (!pending) pending = load().catch((e) => { pending = null; throw e; });
      return pending;
    },
    async loadPack(id) {
      await store.loadIndex();
      if (cache.has(id)) return cache.get(id);
      const meta = index.find((p) => p.id === id);
      if (!meta) throw new Error('Unbekanntes Kartenpaket: ' + id);
      const cards = await fetchJson(base + meta.file);
      if (!Array.isArray(cards)) throw new Error(meta.file + ' ungültig');
      cache.set(id, cards);
      return cards;
    },
    /** Already loaded pack (or null) - for synchronous progress counting. */
    peek: (id) => cache.get(id) || null,
    /** All cards of the given packs, de-duplicated by id. */
    async loadCards(ids) {
      const lists = await Promise.all(ids.map((id) => store.loadPack(id)));
      return mergeCards(lists);
    },
  };
  return store;
}
