// Persistence for Psst! (localStorage via the engine's safe wrapper). Everything is optional: the game also works without storage.
import { createStorage, toBase64, fromBase64 } from '../../engine/save.js';
import { DEFAULT_SETTINGS, REPORT_PREFIX } from './logic.js';

export const TEAM_COLORS = ['#e8452c', '#2563eb', '#12915b', '#8b3fc8', '#b45309', '#db2777', '#0e7490', '#475569'];
export const DEFAULT_TEAMS = [
  { name: 'Team 1', color: TEAM_COLORS[0], players: [] },
  { name: 'Team 2', color: TEAM_COLORS[1], players: [] },
];

const K = {
  settings: 'psst:settings',
  teams: 'psst:teams',
  ffaPlayers: 'psst:ffa-players',
  packs: 'psst:packsel',
  played: 'psst:played',
  game: 'psst:game',
  reports: 'psst:reports',
  progress: 'psst:progress',
  mpHost: 'psst:mp-host',
  mpName: 'psst:mp-name',
};

export function createStore(storage = createStorage()) {
  const read = (key, fallback) => {
    try {
      const t = storage.get(key);
      return t ? JSON.parse(t) : fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => storage.set(key, JSON.stringify(value));

  let playedTimer = null;
  let playedRef = null;
  const flushPlayed = () => {
    if (playedTimer) clearTimeout(playedTimer);
    playedTimer = null;
    if (playedRef) write(K.played, [...playedRef]);
  };

  return {
    storage,
    settings: () => ({ ...DEFAULT_SETTINGS, ...read(K.settings, {}) }),
    saveSettings: (s) => write(K.settings, s),
    teams() {
      const t = read(K.teams, null);
      return Array.isArray(t) && t.length >= 2 ? t : JSON.parse(JSON.stringify(DEFAULT_TEAMS));
    },
    saveTeams: (t) => write(K.teams, t),
    /** Player names for Jeder gegen jeden on one phone. */
    ffaPlayers() {
      const t = read(K.ffaPlayers, []);
      return Array.isArray(t) ? t.filter((x) => typeof x === 'string') : [];
    },
    saveFfaPlayers: (t) => write(K.ffaPlayers, t),
    packSelection: () => read(K.packs, []),
    savePackSelection: (ids) => write(K.packs, ids),

    /** Set of ids of every card ever played (shared across all packs). */
    played: () => new Set(read(K.played, [])),
    /** Persist the played-set soon (debounced; flushPlayed on pagehide). */
    savePlayed(set) {
      playedRef = set;
      if (!playedTimer) playedTimer = setTimeout(flushPlayed, 400);
    },
    flushPlayed,
    resetPlayed(idsToForget) {
      const s = new Set(read(K.played, []));
      if (idsToForget === 'all') s.clear();
      else for (const id of idsToForget) s.delete(id);
      playedRef = s;
      write(K.played, [...s]);
      return s;
    },

    /** {packId: playedCount} - last known progress per Kartenpaket (only packs that were loaded can be counted). */
    progress: () => read(K.progress, {}),
    saveProgress: (m) => write(K.progress, m),

    /** Multiplayer: the host's room (code, secret key, lobby, game) so a reload resumes the room. */
    mpHost: () => read(K.mpHost, null),
    saveMpHost: (snap) => write(K.mpHost, snap),
    clearMpHost: () => storage.remove(K.mpHost),
    mpName: () => read(K.mpName, ''),
    saveMpName: (n) => write(K.mpName, n),

    game: () => read(K.game, null),
    saveGame: (json) => write(K.game, json),
    clearGame: () => storage.remove(K.game),

    reports: () => read(K.reports, []),
    addReport(r) {
      const list = read(K.reports, []);
      list.push({ ...r, at: Date.now() });
      write(K.reports, list);
      return list;
    },
    removeReport(i) {
      const list = read(K.reports, []);
      list.splice(i, 1);
      write(K.reports, list);
      return list;
    },
    clearReports: () => write(K.reports, []),
    exportReports() {
      return `${REPORT_PREFIX}.${toBase64(JSON.stringify(read(K.reports, [])))}`;
    },
  };
}

/** Decode a PSSTMELD1 code (for tests / the owner's tooling). */
export function decodeReports(code) {
  const [prefix, b64] = String(code).trim().split('.');
  if (prefix !== REPORT_PREFIX || !b64) throw new Error('Kein gültiger Melde-Code.');
  return JSON.parse(fromBase64(b64));
}
