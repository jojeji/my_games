// Speichern: Fortschritt, Einstellungen und der laufende Level als Schnappschuss (`snap`). DOM-frei.
// Schluessel mg:protoplanet:save (mit Sicherungskopie) ueber engine/save.js.
import { createSaveStore, mergeDefaults } from '../../engine/save.js';
import { LEVELS, levelById } from './levels.js';
import { T } from './tune.js';

// Version 2 (P2): Level 1-6..1-8 wurden umgebaut (Brocken, neue Ziele). Ihre alten Sterne/Bestwerte gehoeren zu anderen Leveln und werden geloescht
// (die Level muessen neu gespielt werden; Kapitel 2 oeffnet sich mit dem neuen 1-8). Alles andere (Level 1-1..1-5, Einstellungen) bleibt.
// Version 3 (Paket A, lebendige Welten): 1-4..1-8 und 2-2..2-8 wurden neu gebaut. Ihre Sterne und Bestwerte gehoeren zu anderen Leveln und werden geloescht;
// `done` BLEIBT (wer Kapitel 2 schon offen hat, behaelt es offen, Freischalten haengt am Geschafft-Haken des Levels davor). Laufende Schnappschuesse dieser Level gehen weg.
export const SAVE_VERSION = 3;
export const REBUILT_V3 = ['1-4', '1-5', '1-6', '1-7', '1-8', '2-2', '2-3', '2-4', '2-5', '2-6', '2-7', '2-8'];
export const REBUILT_V2 = ['1-6', '1-7', '1-8'];
export const MIGRATIONS = {
  1: (data) => {
    if (data && data.progress) for (const id of REBUILT_V2) delete data.progress[id];
    if (data && data.snap && REBUILT_V2.includes(data.snap.levelId)) data.snap = null;
    return data;
  },
  2: (data) => {
    if (data && data.progress) {
      for (const id of REBUILT_V3) {
        const p = data.progress[id];
        if (p && p.done) data.progress[id] = { done: true, eff: false, fast: false, bestTime: null, bestEject: null };
        else delete data.progress[id];
      }
    }
    if (data && data.snap && REBUILT_V3.includes(data.snap.levelId)) data.snap = null;
    return data;
  },
};

/** Ein gesicherter Level ist nur gueltig, wenn es das Level noch gibt und in derselben Fassung (`rev`, fehlt = 1). */
export const snapValid = (snap) => {
  if (!snap || !snap.levelId) return false;
  const lv = levelById(snap.levelId);
  return !!lv && (snap.rev || 1) === (lv.rev || 1);
};

export const defaultState = () => ({
  progress: {}, // levelId -> { done, eff, fast, bestTime, bestEject }
  settings: { aim: false, vibrate: true, reduceMotion: null, music: T.audio.volume.music, sfx: T.audio.volume.sfx, mute: false }, // music/sfx = Lautstaerke in %, mute = Ton aus; aim = Zielsteuerung (Tippen = dorthin fliegen), Standard: Masse fliegt zum Finger; reduceMotion null = folgt prefers-reduced-motion
  snap: null, // { levelId, rev, play: { snap, rewindsLeft, rewound }, timeScale }
});

export function createProgress({ storage, now } = {}) {
  const store = createSaveStore({ id: 'protoplanet', version: SAVE_VERSION, migrations: MIGRATIONS, storage, now });
  let state = defaultState();
  const adopt = (data) => {
    state = mergeDefaults(defaultState(), data || {});
    if (state.snap && !snapValid(state.snap)) state.snap = null; // Level umgebaut oder gestrichen: ein alter Schnappschuss waere ein kaputter Zustand
    return state;
  };
  const loaded = store.load();
  if (loaded) adopt(loaded.data);

  const api = {
    store,
    get state() {
      return state;
    },
    get settings() {
      return state.settings;
    },
    save() {
      return store.save(state);
    },
    reset() {
      store.wipe();
      state = defaultState();
      return state;
    },
    info(id) {
      return state.progress[id] || null;
    },
    done(id) {
      return !!(state.progress[id] && state.progress[id].done);
    },
    stars(id) {
      const p = state.progress[id];
      return p && p.done ? 1 + (p.eff ? 1 : 0) + (p.fast ? 1 : 0) : 0;
    },
    /** Ein Level ist offen, wenn es das erste ist oder das davor geschafft wurde. */
    unlocked(id) {
      const i = LEVELS.findIndex((l) => l.id === id);
      return i === 0 || (i > 0 && api.done(LEVELS[i - 1].id));
    },
    /** Ergebnis eintragen ({time, ejected} + {eff, fast}); gibt zurueck, was neu ist. */
    record(id, res) {
      const old = state.progress[id] || { done: false, eff: false, fast: false, bestTime: null, bestEject: null };
      const next = {
        done: true,
        eff: old.eff || !!res.eff,
        fast: old.fast || !!res.fast,
        bestTime: old.bestTime == null ? res.time : Math.min(old.bestTime, res.time),
        bestEject: old.bestEject == null ? res.ejected : Math.min(old.bestEject, res.ejected),
      };
      const fresh = { first: !old.done, eff: next.eff && !old.eff, fast: next.fast && !old.fast, time: old.bestTime == null || res.time < old.bestTime, eject: old.bestEject == null || res.ejected < old.bestEject };
      state.progress[id] = next;
      return fresh;
    },
    setSnap(snap) {
      state.snap = snap || null;
    },
    exportString() {
      return store.exportString(state);
    },
    /** Wirft Error mit deutscher Meldung, wenn der Text nicht passt. */
    importString(text) {
      const res = store.importString(text);
      adopt(res.data);
      return state;
    },
  };
  return api;
}
