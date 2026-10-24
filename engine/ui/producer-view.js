// View for engine/kit/producers.js: one row per slot with count, output, synergy line, bundle progress and a hold-to-buy button.
import { h, txt, setHidden, setDisabled, setCls } from './dom.js';
import { holdRepeat, longPress } from './hold.js';
import { openModal } from './modal.js';
import { progressBar } from './kit-views.js';
import { formatNumber as fmt, formatInt, formatPercent } from '../format.js';

export function producerList(g, pid) {
  const p = g.producerById[pid];
  const cur = g.currencyById[p.currency].name;
  const root = h('div', { class: 'gens' });

  const synText = (i) => {
    const syn = p.slots[i].synergies;
    if (!syn || !syn.length) return '';
    const scale = g.hooks.prodSynergyScale ? g.hooks.prodSynergyScale(g) : 1;
    return syn.map((s) => `+${formatPercent(s.per * scale, 1)} je ${g.prodLabel(p, s.from).name}`).join(', ');
  };

  const details = (i) => {
    const lab = g.prodLabel(p, i);
    const c = g.cache.prod[pid];
    const st = g.state.prod[pid][i];
    const info = g.prodBuyInfo(p, i, '1');
    const rows = [
      ['Besitz', String(st.n)],
      ['Pro Stück', fmt(c.unit[i].mul(c.global)) + '/s'],
      ['Gesamt', fmt(c.rate[i]) + '/s'],
      ['Synergie-Faktor', '×' + fmt(c.syn[i])],
      ['Meilenstein-Faktor', '×' + fmt(Math.pow(c.bundleMult, c.steps[i]))],
      ['Nächster Kauf', fmt(info.cost) + ' ' + cur],
    ];
    const next = g.prodNextBundle(p, st.n);
    if (next) rows.push(['Nächster Meilenstein', `${next} Stück (×${fmt(c.bundleMult)})`]);
    const sy = synText(i);
    openModal({
      title: lab.name,
      body: h('div', {}, h('p', { class: 'muted', text: lab.desc }), sy ? h('p', { class: 'upg-eff', text: 'Synergie: ' + sy }) : null, h('ul', { class: 'mult-list' }, ...rows.map(([a, b]) => h('li', {}, h('span', { text: a }), h('b', { class: 'num', text: b }))))),
      actions: [{ label: 'Schließen', kind: 'primary' }],
    });
  };

  const rows = p.slots.map((slot, i) => {
    const name = h('b', { class: 'gen-name' });
    const amount = h('span', { class: 'gen-amount num' });
    const rate = h('span', { class: 'gen-rate' });
    const syn = h('span', { class: 'gen-syn' });
    const bar = progressBar();
    const barText = h('small', { class: 'gen-bar-text' });
    const buyTop = h('span', { class: 'buy-top' });
    const buyCost = h('span', { class: 'buy-cost num' });
    const btn = h('button', { class: 'btn btn-buy', type: 'button' }, buyTop, buyCost);
    const info = h('div', { class: 'gen-info', role: 'button', tabindex: 0 },
      h('div', { class: 'gen-head' }, name, amount),
      h('div', { class: 'gen-rate-line' }, rate),
      syn,
      h('div', { class: 'gen-bundle' }, bar.el, barText),
    );
    const row = h('div', { class: 'gen card', hidden: true }, info, btn);
    row.addEventListener('animationend', () => row.classList.remove('flash'));
    holdRepeat(btn, () => {
      if (g.prodBuy(pid, i, g.state.settings.buyMode)) row.classList.add('flash');
    });
    longPress(info, () => details(i));
    info.addEventListener('click', () => details(i));
    info.addEventListener('keydown', (e) => e.key === 'Enter' && details(i));
    root.append(row);
    return { row, name, amount, rate, syn, bar, barText, buyTop, buyCost, btn, last: -1 };
  });

  return {
    el: root,
    update() {
      const mode = g.state.settings.buyMode;
      const c = g.cache.prod[pid];
      rows.forEach((r, i) => {
        const vis = g.prodVisible(p, i);
        setHidden(r.row, !vis);
        if (!vis) return;
        const st = g.state.prod[pid][i];
        txt(r.name, g.prodLabel(p, i).name);
        txt(r.amount, formatInt(st.n));
        txt(r.rate, `+${fmt(c.rate[i])}/s` + (st.n > 0 ? ` · ×${fmt(c.syn[i])} Synergie` : ''));
        const sy = synText(i);
        txt(r.syn, sy ? 'Synergie: ' + sy : '');
        setHidden(r.syn, !sy);
        const next = g.prodNextBundle(p, st.n);
        const prev = [...g.prodBundleList(p)].reverse().find((t) => t <= st.n) || 0;
        r.bar.set(next ? (st.n - prev) / (next - prev) : 1);
        txt(r.barText, next ? `${st.n}/${next}` : 'max');
        const info = g.prodBuyInfo(p, i, mode);
        txt(r.buyTop, 'Kaufen ×' + formatInt(info.count));
        txt(r.buyCost, fmt(info.cost));
        setDisabled(r.btn, !info.affordable);
        setCls(r.row, 'lit', info.affordable);
      });
    },
  };
}
