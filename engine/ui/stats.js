// Statistics panel (generic rows derived from the game definition + optional extras).
import { h, txt } from './dom.js';
import { formatNumber, formatDuration } from '../format.js';
import { clock } from '../kit/playlog.js';

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

/** Collapsible "Spieltest-Protokoll": readable list of the local playtest log + copy-as-text button. */
export function buildPlaylogPanel(g) {
  const list = h('ol', { class: 'plog-list' });
  const area = h('textarea', { class: 'textarea', readOnly: true, rows: 6, hidden: true, 'aria-label': 'Protokolltext' });
  const info = h('p', { class: 'muted small' });
  const btn = h('button', { class: 'btn', type: 'button', text: 'Protokoll kopieren' });
  let shown = -1;
  btn.addEventListener('click', async () => {
    const text = g.plogText();
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      area.value = text;
      area.hidden = false;
      area.focus();
      area.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
    }
    txt(btn, ok ? 'Kopiert' : 'Text markiert – bitte manuell kopieren');
    setTimeout(() => txt(btn, 'Protokoll kopieren'), 2000);
  });
  const el = h('details', { class: 'section plog' }, h('summary', {}, h('span', { text: 'Spieltest-Protokoll' })), info, list, btn, area);
  return {
    el,
    update() {
      if (!el.open) return;
      const ev = g.plogEvents();
      const key = ev.length + ':' + (ev.at(-1)?.[0] ?? 0) + ':' + g.state.plog.dropped;
      if (key === shown) return;
      shown = key;
      const pl = g.state.plog;
      txt(info, `${pl.idle.n}× Leerlauf > 5 Min · ${pl.offline.n} Offline-Sitzungen · nur lokal gespeichert` + (pl.dropped ? ` · ${pl.dropped} ältere Einträge verworfen` : ''));
      list.replaceChildren(...ev.slice().reverse().slice(0, 120).map((e) => h('li', {}, h('time', { class: 'num', text: clock(e[0]) }), h('span', { text: e[2] }))));
      if (!ev.length) list.append(h('li', { class: 'muted', text: 'Noch keine Einträge.' }));
    },
  };
}

export function buildStatsPanel(g, rows = defaultStatRows(g)) {
  const el = h('div', { class: 'card stats' });
  const plog = g.plogEvents ? buildPlaylogPanel(g) : null;
  const vals = rows.map(([label, fn]) => {
    const v = h('b', { class: 'num' });
    el.append(h('div', { class: 'stat-row' }, h('span', { text: label }), v));
    return [v, fn];
  });
  if (plog) el.append(plog.el);
  return {
    el,
    update() {
      for (const [v, fn] of vals) txt(v, fn());
      if (plog) plog.update();
    },
  };
}
