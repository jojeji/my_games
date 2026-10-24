// Views for engine/kit/spells.js: compact cast bar (quick access) and detailed cards (description, numbers, auto-cast toggles).
import { h, txt, setCls, setHidden, setDisabled, setStyle, svgIcon } from './dom.js';
import { openModal } from './modal.js';
import { formatDuration } from '../format.js';

const ICON_FALLBACK = '<path d="M12 3l2.4 5.2 5.6.7-4.1 3.9 1 5.6L12 15.6 7.1 18.4l1-5.6L4 8.9l5.6-.7z"/>';

function stateOf(g, id) {
  const st = g.state.spells[id];
  const active = st.t > 0;
  const dur = g.spellDuration(id);
  const cd = g.spellCooldown(id);
  return { st, active, dur, cd };
}

/** One-line status text + progress ratio of a spell. */
function statusOf(g, id) {
  const { st, active, dur, cd } = stateOf(g, id);
  if (!g.spellUnlocked(id)) return { text: 'Gesperrt', ratio: 0, kind: 'locked' };
  if (active) return { text: 'Aktiv ' + formatDuration(st.t), ratio: dur > 0 ? st.t / dur : 0, kind: 'active' };
  if (st.cd > 0) return { text: formatDuration(st.cd), ratio: cd > 0 ? 1 - st.cd / cd : 0, kind: 'cooldown' };
  return { text: 'Bereit', ratio: 1, kind: 'ready' };
}

export function spellBar(g, { icons = {} } = {}) {
  const items = g.def.spells.map((sp) => {
    const fill = h('i', { class: 'spell-fill' });
    const name = h('span', { class: 'spell-name', text: sp.name });
    const stat = h('small', { class: 'spell-stat num' });
    const btn = h('button', { class: 'spell-btn', type: 'button', 'aria-label': sp.name }, fill, svgIcon(icons[sp.icon || sp.id] || ICON_FALLBACK, 'icon spell-icon'), name, stat);
    btn.addEventListener('click', () => g.spellCast(sp.id));
    return { sp, btn, fill, stat };
  });
  const el = h('div', { class: 'spell-bar', role: 'group', 'aria-label': 'Zauber' }, ...items.map((i) => i.btn));
  return {
    el,
    update() {
      let any = false;
      for (const { sp, btn, fill, stat } of items) {
        const un = g.spellUnlocked(sp.id);
        setHidden(btn, !un);
        if (!un) continue;
        any = true;
        const s = statusOf(g, sp.id);
        txt(stat, s.text.replace(/ /g, '\u00a0'));
        setStyle(fill, 'transform', `scaleY(${Math.max(0, Math.min(1, s.ratio)).toFixed(3)})`);
        setCls(btn, 'active', s.kind === 'active');
        setCls(btn, 'ready', s.kind === 'ready');
        setDisabled(btn, s.kind === 'cooldown' || s.kind === 'active');
      }
      setHidden(el, !any);
    },
  };
}

export function spellDetails(g, id) {
  const sp = g.spellById[id];
  const dur = g.spellDuration(id);
  const rows = [
    ['Wirkung', sp.info ? sp.info(g) : ''],
    ['Dauer', dur > 0 ? formatDuration(dur) : 'sofort'],
    ['Abklingzeit', formatDuration(g.spellCooldown(id))],
    ['Bisher gewirkt', String(g.state.spells[id].n) + '×'],
  ].filter((r) => r[1]);
  openModal({
    title: sp.name,
    body: h('div', {}, h('p', { class: 'muted', text: sp.desc }), h('ul', { class: 'mult-list' }, ...rows.map(([a, b]) => h('li', {}, h('span', { text: a }), h('b', { class: 'num', text: b }))))),
    actions: [{ label: 'Schließen', kind: 'primary' }],
  });
}

/** Detailed cards. opts.autoId: id of an auto that must be unlocked before the per-spell auto-cast switches show up. */
export function spellCards(g, { icons = {}, autoId } = {}) {
  const root = h('div', { class: 'stack' });
  const cards = g.def.spells.map((sp) => {
    const fill = h('i', { class: 'spell-fill' });
    const stat = h('span', { class: 'badge num' });
    const info = h('p', { class: 'upg-eff' });
    const lock = h('p', { class: 'upg-note' });
    const bar = h('div', { class: 'bar' }, fill);
    const btn = h('button', { class: 'btn btn-primary', type: 'button', text: 'Wirken', onClick: () => g.spellCast(sp.id) });
    const auto = h('input', { type: 'checkbox', class: 'switch-input', 'aria-label': 'Automatisch wirken: ' + sp.name });
    auto.addEventListener('change', () => (g.state.spells[sp.id].auto = auto.checked));
    const autoRow = h('label', { class: 'row setting' }, h('span', { class: 'row-main' }, h('b', { text: 'Automatisch wirken' })), h('span', { class: 'switch' }, auto, h('i', { class: 'switch-track' })));
    const detailsBtn = h('button', { class: 'btn btn-ghost', type: 'button', text: 'Details', onClick: () => spellDetails(g, sp.id) });
    const el = h('div', { class: 'card spell-card' },
      h('div', { class: 'upg-head' }, h('span', { class: 'spell-title' }, svgIcon(icons[sp.icon || sp.id] || ICON_FALLBACK, 'icon spell-icon'), h('b', { class: 'upg-name', text: sp.name })), stat),
      h('p', { class: 'upg-desc', text: sp.desc }),
      info, lock, bar, h('div', { class: 'btn-row' }, btn, detailsBtn), autoRow,
    );
    root.append(el);
    return { sp, el, stat, info, lock, bar, fill, btn, auto, autoRow };
  });
  return {
    el: root,
    update() {
      for (const c of cards) {
        const un = g.spellUnlocked(c.sp.id);
        const s = statusOf(g, c.sp.id);
        txt(c.stat, s.text);
        txt(c.info, un && c.sp.info ? c.sp.info(g) : '');
        setHidden(c.info, !un);
        txt(c.lock, !un && c.sp.lockText ? 'Freischaltung: ' + c.sp.lockText : '');
        setHidden(c.lock, un);
        setStyle(c.fill, 'width', (Math.max(0, Math.min(1, s.ratio)) * 100).toFixed(1) + '%');
        setHidden(c.bar, !un);
        setHidden(c.btn, !un);
        setDisabled(c.btn, !g.spellReady(c.sp.id));
        setCls(c.el, 'locked', !un);
        const autoOn = un && (!autoId || g.autoUnlocked(autoId));
        setHidden(c.autoRow, !autoOn);
        if (autoOn && c.auto.checked !== g.state.spells[c.sp.id].auto) c.auto.checked = g.state.spells[c.sp.id].auto;
      }
    },
  };
}
