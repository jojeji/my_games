// "Welcome back" summary: honest about the 3 h limit ("7 h weg, 3 h gewachsen").
import { h } from '../../engine/ui/dom.js';
import { openModal } from '../../engine/ui/modal.js';
import { formatNumber as fmt } from '../../engine/format.js';

/** 7200 -> "2 h", 5400 -> "1,5 h", 1500 -> "25 min". */
export function formatAway(sec) {
  if (sec < 3600) return Math.max(1, Math.round(sec / 60)) + ' min';
  const hrs = sec / 3600;
  const r = hrs >= 10 ? Math.round(hrs) : Math.round(hrs * 2) / 2;
  return String(r).replace('.', ',') + ' h';
}

export function offlineSummaryText(s) {
  return `${formatAway(s.realSeconds)} weg, ${formatAway(s.seconds)} gewachsen.`;
}

export function showOfflineSummary(g, s) {
  const list = h('ul', { class: 'offline-list' });
  for (const c of g.def.currencies) {
    const d = s.after.cur[c.id].sub(s.before.cur[c.id]);
    if (d.gt(0) && !['s', 'm'].includes(c.id)) list.append(h('li', {}, h('b', { text: '+' + fmt(d) }), ' ' + c.name));
  }
  for (const l of g.def.layers) {
    const d = s.after.layers[l.id] - s.before.layers[l.id];
    if (d > 0) list.append(h('li', {}, h('b', { text: '+' + d }), ' ' + (l.id === 'h' ? (d > 1 ? 'Ausbreitungen' : 'Ausbreitung') : d > 1 ? l.plural : l.name)));
  }
  for (const e of s.events || []) {
    if (e.type === 'milestone') list.append(h('li', {}, h('b', { text: 'Meilenstein' }), ' ' + e.payload.def.name));
    else if (e.type === 'challenge-done') list.append(h('li', {}, h('b', { text: 'Challenge geschafft' }), ' ' + g.chalById[e.payload.id].name));
  }
  if (!list.children.length) list.append(h('li', { class: 'muted', text: 'Nichts Nennenswertes passiert.' }));
  const note = s.capped ? h('p', { class: 'muted small', text: 'Länger als 3 Stunden wächst das Netz nicht, ganz gleich wie lange du fort bist.' }) : null;
  openModal({
    title: 'Willkommen zurück',
    body: h('div', { class: 'stack' }, h('p', { class: 'offline-lead' }, h('b', { text: offlineSummaryText(s) })), list, note),
    actions: [{ label: 'Weiter', kind: 'primary' }],
  });
}
