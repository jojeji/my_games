// Standard mobile UI for kit games: header, generator tab, one tab per prestige layer,
// achievements, "Mehr" (statistics, settings, log). Games customise it through `options`.
import { h, txt, setHidden, setDisabled, svgIcon } from './dom.js';
import { ICONS } from './icons.js';
import { mountApp } from './app.js';
import { openModal } from './modal.js';
import { buildSettingsPanel } from './settings.js';
import { buildStatsPanel, defaultStatRows } from './stats.js';
import {
  buyModeBar, generatorList, upgradeList, prestigePanel, milestoneList, challengeList, researchTree,
  respecDialog, autoPanel, achievementGrid, showOfflineSummary, section, sectionTitle, progressBar, doPrestige,
} from './kit-views.js';
import { formatNumber as fmt, setNotation } from '../format.js';

/**
 * @param {object} cfg
 * @param {HTMLElement} cfg.root
 * @param {object} cfg.runtime  from engine/core.js
 * @param {object} cfg.options
 *   gameId, title, primary (currency id), chips (currency ids), generators { chain, label, intro?(ctx), details?(ctx) },
 *   layers [{ id, label, icon, groups:[{id,title,research?,branches?}], challenges?:true, visible?(g) }],
 *   multParts?(g) -> [label, Decimal][], bonusText?(g), statRows?(g), tabIcons
 */
export function mountStandardApp({ root, runtime, options, offline }) {
  const g = runtime.logic;
  const ctx = { runtime, g, options };
  setNotation(g.state.settings.notation);

  const showMultDetails = () => {
    const parts = options.multParts ? options.multParts(g) : [];
    const list = h('ul', { class: 'mult-list' });
    let total = null;
    for (const [label, v] of parts) {
      list.append(h('li', {}, h('span', { text: label }), h('b', { class: 'num', text: '×' + fmt(v) })));
    }
    total = g.cache.global[options.generators.chain];
    openModal({
      title: 'Produktions-Multiplikator',
      body: h('div', {}, h('p', { class: 'muted', text: 'Alle Faktoren, die deine Produktion skalieren:' }), list, h('p', { class: 'mult-total' }, 'Gesamt: ', h('b', { class: 'num', text: '×' + fmt(total) }))),
      actions: [{ label: 'Schließen', kind: 'primary' }],
    });
  };

  const showGenDetails = (chainId, i) => {
    const chain = g.chainById[chainId];
    const t = chain.tiers[i];
    const st = g.state.gens[chainId][i];
    const info = g.genBuyInfo(chain, i, '1');
    const rows = [
      ['Gekauft', String(st.bought)],
      ['Vorhanden', fmt(st.amount)],
      ['Eigener Multiplikator', '×' + fmt(g.cache.own[chainId][i])],
      i === 0 ? ['Globaler Multiplikator', '×' + fmt(g.cache.global[chainId])] : null,
      ['Produktion', fmt(g.genRate(chainId, i)) + '/s'],
      ['Nächster Kauf', fmt(info.cost)],
      ['Bonus alle', `${chain.bundle} Käufe ×${fmt(chain.bundleMult === undefined ? 2 : (g.hooks.bundleMult ? g.hooks.bundleMult(g, chain) : chain.bundleMult))}`],
    ].filter(Boolean);
    openModal({
      title: t.name,
      body: h('div', {}, h('p', { class: 'muted', text: t.desc }), h('ul', { class: 'mult-list' }, ...rows.map(([a, b]) => h('li', {}, h('span', { text: a }), h('b', { class: 'num', text: b }))))),
      actions: [{ label: 'Schließen', kind: 'primary' }],
    });
  };
  ctx.showGenDetails = showGenDetails;

  /* ---------------- header ---------------- */
  const header = {
    build() {
      const primary = g.currencyById[options.primary];
      const val = h('b', { class: 'hdr-val num' });
      const rate = h('span', { class: 'hdr-rate num' });
      const mult = h('button', { class: 'hdr-mult', type: 'button', onClick: showMultDetails });
      const btnIcon = h('span', { class: 'hdr-btn-icon' });
      const btnText = h('span', { class: 'hdr-btn-text' });
      const btn = h('button', { class: 'btn btn-primary hdr-btn', type: 'button' }, btnIcon, btnText);
      let btnLayer = null;
      let shownIcon = null;
      btn.addEventListener('click', () => btnLayer && doPrestige(ctx, btnLayer));
      const layerIcon = (id) => options.layers.find((x) => x.id === id)?.icon;
      const top = h('div', { class: 'hdr-top' },
        h('div', { class: 'hdr-cur' }, val, h('div', { class: 'hdr-sub' }, h('span', { class: 'hdr-label', text: primary.name }), rate)),
        btn,
      );
      const chips = (options.chips || []).map((id) => {
        const c = g.currencyById[id];
        const v = h('b', { class: 'num' });
        const el = h('span', { class: 'chip', hidden: true, title: c.name }, h('small', { text: c.short || c.name }), v);
        return { id, v, el };
      });
      const chipRow = h('div', { class: 'hdr-chips' }, ...chips.map((c) => c.el), mult);
      const chText = h('span', { class: 'chal-banner-text' });
      const chBar = progressBar();
      const chBanner = h('div', { class: 'chal-banner', hidden: true }, chText, chBar.el);
      const el = h('div', { class: 'hdr-inner' }, top, chipRow, chBanner);
      const layersDesc = [...g.def.layers].reverse();
      return {
        el,
        update() {
          txt(val, fmt(g.get(options.primary)));
          txt(rate, '+' + fmt(g.incomePerSec(options.primary)) + '/s');
          for (const c of chips) {
            const show = g.get(c.id).gt(0) || g.state.cur[c.id].total.gt(0);
            setHidden(c.el, !show);
            if (show) txt(c.v, fmt(g.get(c.id)));
          }
          const gm = g.cache.global[options.generators.chain];
          txt(mult, '×' + fmt(gm) + ' ⓘ');
          // prestige shortcut: highest layer that can be used now, else the first visible layer
          let target = layersDesc.find((l) => g.canPrestige(l.id));
          let label;
          if (target) {
            const c = g.currencyById[target.currency];
            label = `+${fmt(g.prestigeGain(target.id))} ${c.short || c.name}`;
          } else {
            target = g.def.layers.find((l) => g.layerUnlocked(l.id) || (options.layers.find((x) => x.id === l.id)?.visible?.(g)));
            label = target ? target.verb : '';
          }
          btnLayer = target ? target.id : null;
          setHidden(btn, !target);
          if (target) {
            if (shownIcon !== target.id) {
              shownIcon = target.id;
              btnIcon.replaceChildren(svgIcon(ICONS[layerIcon(target.id)] || ICONS.more));
            }
            txt(btnText, label);
            btn.title = target.verb;
            setDisabled(btn, !g.canPrestige(target.id));
          }
          const ch = g.chActive();
          setHidden(chBanner, !ch);
          if (ch) {
            txt(chText, `${ch.name} · ${fmt(g.state.cur[ch.goal.currency].run)} / ${fmt(ch.goal.amount)}`);
            chBar.set(g.chProgress(ch));
          }
        },
      };
    },
  };

  /* ---------------- tabs ---------------- */
  const tabs = [];

  tabs.push({
    id: 'gen',
    label: options.generators.label || 'Generatoren',
    icon: 'gen',
    build() {
      const chainId = options.generators.chain;
      const modeBar = buyModeBar(g, { onBuyAll: () => g.genBuyAllMax(chainId), buyAllLabel: 'Alles Max' });
      const list = generatorList(g, chainId, { onDetails: showGenDetails });
      const autos = autoPanel(g);
      const autoSection = section('Automatisierung', autos.el, { open: false });
      const hint = h('p', { class: 'muted small center', text: 'Tipp: Kaufen-Taste gedrückt halten für Schnellkauf, Zeile antippen für Details.' });
      const intro = options.generators.intro ? options.generators.intro(ctx) : null;
      const el = h('div', { class: 'stack' }, intro && intro.el, modeBar.el, list.el, autoSection, hint);
      return {
        el,
        update() {
          intro && intro.update();
          modeBar.update();
          list.update();
          autos.update();
          setHidden(autoSection, !autos.any);
        },
      };
    },
  });

  for (const lc of options.layers) {
    const layer = g.layerById[lc.id];
    tabs.push({
      id: lc.id,
      label: lc.label || layer.name,
      icon: lc.icon || lc.id,
      visible: () => g.layerUnlocked(lc.id) || (lc.visible ? lc.visible(g) : false),
      dot: () => g.canPrestige(lc.id),
      build() {
        const parts = [];
        const stack = h('div', { class: 'stack' });
        const add = (view, wrap) => {
          parts.push(view);
          stack.append(wrap || view.el);
        };
        add(prestigePanel(g, lc.id, ctx));
        const ms = milestoneList(g, lc.id);
        if (g.def.milestones.some((m) => m.layer === lc.id)) {
          parts.push(ms);
          stack.append(section('Meilensteine', ms.el, { open: false }));
        }
        for (const grp of lc.groups || []) {
          stack.append(sectionTitle(grp.title, grp.sub));
          if (grp.research) {
            const tree = researchTree(g, grp.id, { branches: grp.branches, onRespec: () => respecDialog(g) });
            add(tree);
          } else add(upgradeList(g, grp.id));
        }
        if (lc.challenges) {
          stack.append(sectionTitle('Challenges', `${g.chDoneCount()}/${g.def.challenges.length}`));
          add(challengeList(g, ctx));
        }
        return { el: stack, update: () => parts.forEach((p) => p.update()) };
      },
    });
  }

  tabs.push({
    id: 'ach',
    label: 'Erfolge',
    icon: 'achievements',
    build() {
      const grid = achievementGrid(g, { bonusText: options.bonusText });
      return grid;
    },
  });

  tabs.push({
    id: 'more',
    label: 'Mehr',
    icon: 'more',
    build() {
      const stats = buildStatsPanel(g, options.statRows ? options.statRows(g) : defaultStatRows(g));
      const settings = buildSettingsPanel(ctx);
      const logList = h('ul', { class: 'card log' });
      let logN = -1;
      const el = h('div', { class: 'stack' },
        sectionTitle('Statistik'), stats.el,
        sectionTitle('Einstellungen'), settings.el,
        sectionTitle('Logbuch'), logList,
      );
      return {
        el,
        update() {
          stats.update();
          const entries = (g.def.story || []).filter((s) => g.state.story[s.id]);
          if (entries.length !== logN) {
            logN = entries.length;
            logList.replaceChildren(...entries.reverse().map((s) => h('li', { text: s.text })));
            if (!entries.length) logList.append(h('li', { class: 'muted', text: 'Noch nichts erlebt.' }));
          }
        },
      };
    },
  });

  /* ---------------- events -> toasts ---------------- */
  const app = mountApp({ root, gameId: options.gameId, header, tabs, ctx });
  const { toast } = app;
  const cur = (id) => g.currencyById[id].name;
  runtime.on('achievement', ({ def }) => toast(def.desc, { kind: 'good', title: 'Erfolg: ' + def.name }));
  runtime.on('milestone', ({ def }) => toast(def.desc, { kind: 'good', title: 'Meilenstein: ' + def.name }));
  runtime.on('layer-unlocked', ({ id }) => toast('Neue Ebene: ' + g.layerById[id].name, { kind: 'info', title: 'Freigeschaltet' }));
  runtime.on('story', ({ def }) => toast(def.text, { kind: 'story', ms: 7000 }));
  runtime.on('prestige', ({ id, gain }) => toast(`+${fmt(gain)} ${cur(g.layerById[id].currency)}`, { kind: 'good', title: g.layerById[id].name }));
  runtime.on('challenge-done', ({ id }) => toast(g.chalById[id].reward, { kind: 'good', title: 'Challenge geschafft: ' + g.chalById[id].name }));
  runtime.on('offline', (s) => showOfflineSummary(g, s));
  runtime.on('respec', () => toast('Forschung zurückgesetzt.', { kind: 'info' }));
  // offline progress that was simulated while loading (before the UI listened)
  if (offline && offline.seconds >= 60) showOfflineSummary(g, offline);

  return { app, ctx };
}
