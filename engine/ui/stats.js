// Statistics panel (generic rows derived from the game definition + optional extras).
import { h, txt } from './dom.js';
import { formatNumber, formatDuration } from '../format.js';

/** Rows: [label, () => string] */
export function defaultStatRows(g) {
  const s = () => g.state;
  const rows = [
    ['Spielzeit', () => formatDuration(s().time.played)],
    ['davon offline berechnet', () => formatDuration(s().time.offline)],
  ];
  for (const l of g.def.layers || []) {
    rows.push([`${l.name}: Anzahl`, () => String(s().layers[l.id].count)]);
    rows.push([`Schnellster Durchlauf (${l.name})`, () => (s().layers[l.id].fastest ? formatDuration(s().layers[l.id].fastest) : '–')]);
    rows.push([`Bester Gewinn (${l.name})`, () => formatNumber(s().layers[l.id].bestGain)]);
  }
  for (const c of g.def.currencies) {
    rows.push([`${c.name}: Bestwert`, () => formatNumber(s().cur[c.id].best)]);
    rows.push([`${c.name}: insgesamt verdient`, () => formatNumber(s().cur[c.id].total)]);
  }
  if ((g.def.challenges || []).length) rows.push(['Challenges abgeschlossen', () => `${g.chDoneCount()} / ${g.def.challenges.length}`]);
  if ((g.def.achievements || []).length) rows.push(['Erfolge', () => `${g.achCount()} / ${g.def.achievements.length}`]);
  return rows;
}

export function buildStatsPanel(g, rows = defaultStatRows(g)) {
  const el = h('div', { class: 'card stats' });
  const vals = rows.map(([label, fn]) => {
    const v = h('b', { class: 'num' });
    el.append(h('div', { class: 'stat-row' }, h('span', { text: label }), v));
    return [v, fn];
  });
  return {
    el,
    update() {
      for (const [v, fn] of vals) txt(v, fn());
    },
  };
}
