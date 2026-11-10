// Tageslevel (Paket D): jeden Kalendertag ein Level, ohne Server und garantiert loesbar. DOM-frei.
// Nichts wird zur Laufzeit gewuerfelt: `daily-list.js` (ERZEUGT von tools/daily-protoplanet.mjs) enthaelt je Kalendertag (366 Eintraege, 29. Februar inklusive) und je Freischaltstufe
// einen vorab vom Bot geprueften Eintrag [Preset, Seed]. Ein Preset ist ein benannter Parametersatz = die Familie und Parameter eines Levels der Kampagne (PRESETS), nur mit anderem Seed.
// Freischaltstufe = hoechstes Kapitel, das der Spieler offen hat. Fuer jede Stufe s gibt es einen eigenen Eintrag: Tage, deren Kapitel (Abwechslung ueber alle fuenf) hoeher als s liegt,
// bekommen dort ein Preset aus einem Kapitel <= s (das heutige Kapitel c wird dann durch (Tag mod s) + 1 ersetzt). So sieht ein Neuling jeden Tag ein anderes, passendes Level und nie ein gesperrtes.
import { levelById } from './levels.js';
import { DAILY } from './daily-list.js';

/** Presets: Kennung -> Level der Kampagne, dessen Familie und Parameter (und Nebel) benutzt werden. Zeiten der Bot-Laeufe liegen bei diesen Leveln im Korridor 60-360 s. */
export const PRESETS = [
  { id: 'treibgut', level: '1-4' }, { id: 'wanderer', level: '1-5' }, { id: 'gegenstroeme', level: '1-6' }, { id: 'wirbel', level: '1-7' },
  { id: 'verfolger', level: '2-2' }, { id: 'jagdzeit', level: '2-3' }, { id: 'konkurrenz', level: '2-4' }, { id: 'rudel', level: '2-5' },
  { id: 'staubguertel', level: '3-4' }, { id: 'kometen', level: '3-5' }, { id: 'planet', level: '3-7' }, { id: 'gegenlaeufer', level: '3-8' },
  { id: 'erkundung', level: '4-2' }, { id: 'schattenfels', level: '4-3' }, { id: 'nebel', level: '4-4' }, { id: 'fernes-licht', level: '4-5' }, { id: 'nebelbank', level: '4-7' },
  { id: 'erste-welt', level: '5-1' }, { id: 'zwei-welten', level: '5-2' }, { id: 'vorbeiflug', level: '5-3' }, { id: 'doppelplanet', level: '5-4' }, { id: 'kometenbahn', level: '5-5' },
].map((p, i) => ({ ...p, index: i, chapter: Number(p.level[0]) }));
export const presetsOf = (chapter) => PRESETS.filter((p) => p.chapter === chapter);

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const CUM = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335]; // Tage vor dem Monat, der Februar hat immer 29 Tage (feste Zuordnung Datum -> Eintrag)

/** Lokales Datum als 'JJJJ-MM-TT'. */
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parts = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
};
/** Eintrag 0..365 eines Datums (fest je Kalendertag, in jedem Jahr gleich). */
export const dayIndex = (key) => {
  const { m, d } = parts(key);
  return CUM[m - 1] + d - 1;
};
/** Vortag eines Datums (Kalender: Monats- und Jahreswechsel, Schaltjahre). */
export const prevKey = (key) => {
  const { y, m, d } = parts(key);
  const dt = new Date(Date.UTC(y, m - 1, d) - 86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
};
export const dateLabel = (key) => {
  const { m, d } = parts(key);
  return `${d}. ${MONTHS[m - 1]}`;
};

/** Kapitel des Tages: je 5 Tage eine Mischung aller fuenf Kapitel (feste Permutation je Block, aus dem Block gewuerfelt). Wird vom Erzeuger UND zur Laufzeit gleich benutzt. */
export function chapterOfDay(idx) {
  const block = Math.floor(idx / 5);
  const order = [1, 2, 3, 4, 5];
  let s = (block * 2654435761 + 12345) >>> 0;
  for (let i = 4; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order[idx % 5];
}
/** Preset-Wahl des Erzeugers fuer Tag idx, Stufe stage (1..5) und Versuch k (der Erzeuger probiert weiter, wenn die Seeds eines Presets nicht tragen). */
export function presetChoice(idx, stage, k = 0) {
  const c0 = chapterOfDay(idx);
  const c = c0 <= stage ? c0 : ((idx + k) % stage) + 1;
  const list = presetsOf(c);
  return list[(idx * 7 + Math.floor(idx / 5) + k) % list.length];
}

/** Level aus Preset + Seed (der Erzeuger prueft genau dieses Objekt). */
export function presetLevel(preset, seed, key = null) {
  const base = levelById(preset.level);
  return {
    id: 'daily',
    daily: true,
    dateKey: key,
    chapter: preset.chapter,
    n: 0,
    rev: 1,
    title: key ? `${base.title} · ${dateLabel(key)}` : base.title,
    short: base.title,
    family: base.family,
    params: base.params,
    seed,
    fog: base.fog,
    goal: base.goal,
    targets: { eject: Infinity, time: Infinity },
  };
}

/** Level des Tages fuer ein Datum und eine Freischaltstufe (1..5). Rein aus Datum + Stufe. */
export function dailyLevel(key, stage = 5) {
  const idx = dayIndex(key);
  const st = Math.max(1, Math.min(5, stage));
  const row = DAILY[idx];
  const e = row && row[st - 1];
  if (!e) return null;
  return presetLevel(PRESETS[e[0]], e[1], key);
}
