// Standard mobile UI for kit games: header, generator tab, one tab per prestige layer,
// achievements, "Mehr" (statistics, settings, log). Games customise it through `options`.
import { h, txt, setHidden, setDisabled, setCls, svgIcon } from './dom.js';
import { ICONS } from './icons.js';
import { mountApp } from './app.js';
import { openModal } from './modal.js';
import { buildSettingsPanel } from './settings.js';
import { announceAutoUnlocks } from './auto-hints.js';
import { chronicleView, createStoryController } from './story-view.js';
import { createStoryBubbles } from './story-bubbles.js';
import { avatar } from './avatar.js';
import { openCharacterCard } from './character-card.js';
import { buildStatsPanel, defaultStatRows } from './stats.js';
import {
  buyModeBar, generatorList, upgradeList, prestigePanel, milestoneList, challengeList, researchTree,
  respecDialog, autoPanel, achievementGrid, showOfflineSummary, section, sectionTitle, progressBar, doPrestige,
} from './kit-views.js';
import { formatNumber as fmt, formatCompact, setNotation } from '../format.js';

/**
 * @param {object} cfg
 * @param {HTMLElement} cfg.root
 * @param {object} cfg.runtime  from engine/core.js
 * @param {object} cfg.options
 *   gameId, title, primary (currency id), chips (currency ids), generators { chain, label, intro?(ctx), details?(ctx) },
 *   layers [{ id, label, short? (word on the segment of the folded "Ebenen" tab), icon, intro?(ctx) -> { el, update } (card above the prestige panel), groups:[{id,title,research?,branches?,buyAll?:false (no "Alles kaufen" button)}], challenges?:true, visible?(g) }],
 *   multParts?(g) -> [label, Decimal][], bonusText?(g), statRows?(g), tabIcons
 *   banner? (g) -> { text, ratio? } | null  - one slim status line under the header on every tab (time-limited effects: remaining time; ratio = 0..1 progress bar)
 *   extraTabs? [{ id, label, icon, visible?(g), dot?(g), build(ctx) -> { el, update } }]  - game specific tabs between the layer tabs and the Chronik/Erfolge tab
 *   maxTabs? (default 6)  - the bottom bar never shows more tabs than this: when it would, the layer tabs fold into ONE tab "Ebenen"
 *     (segmented switch on top, one layer view at a time; needs at least two visible layer tabs)
 *   chronicle? { cast, figures(g), lineText?(g,line), defaultWho?, castInfo?(g, who) -> { role?, bio? } (overrides for the character card as the story goes on) }  - Chronik for games with def.chronicle: a Chronik tab with unread dot
 *     (it replaces the Erfolge tab, which moves into "Mehr"), story modals for def.story entries with `modal`, chat bubbles for the rest.
 *     cast = { id: { name, role?, color?, side?, bio?, emblem?, img?, sm? } } (see games/replikator/characters.js), figures = ids of the characters met so far.
 *     Without it the story stays what it was: one toast per entry and a log list in "Mehr".
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
      const chipRow = h('div', { class: 'hdr-chips fit' }, ...chips.map((c) => c.el), mult);
      const chText = h('span', { class: 'chal-banner-text' });
      const chBar = progressBar();
      const chBanner = h('div', { class: 'chal-banner', hidden: true }, chText, chBar.el);
      const stText = h('span', { class: 'chal-banner-text' });
      const stBar = progressBar();
      const stBanner = h('div', { class: 'chal-banner status-banner', hidden: true, 'aria-live': 'off' }, stText, stBar.el);
      const el = h('div', { class: 'hdr-inner' }, top, chipRow, chBanner, stBanner);
      const layersDesc = [...g.def.layers].reverse();
      return {
        el,
        update() {
          txt(val, fmt(g.get(options.primary)));
          txt(rate, '+' + fmt(g.incomePerSec(options.primary)) + '/s');
          for (const c of chips) {
            const show = g.get(c.id).gt(0) || g.state.cur[c.id].total.gt(0);
            setHidden(c.el, !show);
            if (show) txt(c.v, formatCompact(g.get(c.id)));
          }
          const gm = g.cache.global[options.generators.chain];
          txt(mult, '×' + formatCompact(gm) + ' ⓘ');
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
          const st = options.banner ? options.banner(g) : null;
          setHidden(stBanner, !st);
          if (st) {
            txt(stText, st.text);
            stBar.set(st.ratio ?? 0);
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

  /* ---------------- chronicle: speakers (portraits / emblems) ---------------- */
  const chron = options.chronicle || null;
  const cast = chron ? chron.cast : {};
  const defaultWho = chron ? chron.defaultWho || Object.keys(cast)[0] : null;
  const castOf = (who) => cast[who] || cast[defaultWho];
  const showCard = (who, from) => {
    const c = { ...castOf(who), ...(chron && chron.castInfo ? chron.castInfo(g, who) : null) }; // role / bio may change with the story
    openCharacterCard({ name: c.name, color: c.color, role: c.role, bio: c.bio, img: c.img, emblem: c.emblem }, { returnFocus: from });
  };
  const speaker = (who) => {
    const c = castOf(who);
    return {
      name: c.name,
      color: c.color,
      side: c.side,
      avatar: (size) => avatar({ src: size > 80 ? c.img : c.sm || c.img, emblem: c.emblem, color: c.color, name: c.name, size, cls: 'avatar-' + who, onTap: (el) => showCard(who, el) }),
    };
  };
  let chronikView = null;
  let story = null;
  const lineTextOf = (line) => (chron && chron.lineText ? chron.lineText(g, line) : typeof line.t === 'function' ? line.t(g) : line.t);

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

  /* ---- layer tabs: one tab per layer, or all in one tab "Ebenen" when the bar would get too crowded ---- */
  const maxTabs = options.maxTabs || 6;
  const layerOpen = (lc) => g.layerUnlocked(lc.id) || (lc.visible ? lc.visible(g) : false);
  const layerViews = {}; // built once, moved between the layer's own page and the "Ebenen" page
  let layerPick = options.layers[0] && options.layers[0].id;
  const buildLayerView = (lc) => {
    if (layerViews[lc.id]) return layerViews[lc.id];
    const parts = [];
    const stack = h('div', { class: 'stack' });
    const add = (view, wrap) => {
      parts.push(view);
      stack.append(wrap || view.el);
    };
    if (lc.intro) add(lc.intro(ctx)); // optional card above the prestige panel (game specific)
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
      } else add(upgradeList(g, grp.id, grp.buyAll === false ? { buyAllLabel: null } : {}));
    }
    if (lc.challenges) {
      stack.append(sectionTitle('Challenges', `${g.chDoneCount()}/${g.def.challenges.length}`));
      add(challengeList(g, ctx));
    }
    return (layerViews[lc.id] = { el: stack, update: () => parts.forEach((p) => p.update()) });
  };
  let foldedCache = { t: -1, v: false };
  /** Would the bar exceed maxTabs with one tab per layer? Then the layers fold into "Ebenen". */
  const folded = () => {
    const now = performance.now();
    if (now - foldedCache.t < 150) return foldedCache.v; // select/redirect/visible ask several times per frame
    const open = options.layers.filter(layerOpen).length;
    const others = tabs.filter((t) => !t.layer && t.id !== 'ebenen' && (!t.visible || t.visible())).length;
    foldedCache = { t: now, v: open >= 2 && others + open > maxTabs };
    return foldedCache.v;
  };
  const layerSwitch = h('div', { class: 'segmented seg-full', role: 'tablist' });
  const layerSlot = h('div', { class: 'layer-slot' });
  const layerBtns = options.layers.map((lc) => {
    // icon above a short word: four full layer names do not fit a 360 px phone (lc.short, default the label); the full name stays as the accessible name
    const full = lc.label || g.layerById[lc.id].name;
    const b = h('button', { class: 'seg seg-ico', type: 'button', role: 'tab', 'aria-label': full, onClick: () => { layerPick = lc.id; showPicked(); } },
      svgIcon(ICONS[lc.icon] || ICONS.more, 'seg-icon'), h('span', { class: 'seg-text', text: lc.short || full }));
    layerSwitch.append(b);
    return { lc, b };
  });
  function showPicked() {
    const open = options.layers.filter(layerOpen);
    if (!open.some((l) => l.id === layerPick) && open.length) layerPick = open[0].id;
    const lc = options.layers.find((l) => l.id === layerPick);
    if (!lc) return;
    const view = buildLayerView(lc);
    if (view.el.parentNode !== layerSlot) layerSlot.replaceChildren(view.el);
    for (const x of layerBtns) {
      setHidden(x.b, !layerOpen(x.lc));
      setCls(x.b, 'active', x.lc.id === layerPick);
      x.b.setAttribute('aria-selected', x.lc.id === layerPick ? 'true' : 'false');
    }
    view.update();
  }
  tabs.push({
    id: 'ebenen',
    label: 'Ebenen',
    icon: 'layers',
    visible: folded,
    redirect: () => (folded() ? null : layerPick),
    dot: () => options.layers.some((lc) => layerOpen(lc) && g.canPrestige(lc.id)),
    build() {
      return { el: h('div', { class: 'stack' }, layerSwitch, layerSlot), update: showPicked };
    },
  });
  for (const lc of options.layers) {
    const layer = g.layerById[lc.id];
    tabs.push({
      id: lc.id,
      layer: true,
      label: lc.label || layer.name,
      icon: lc.icon || lc.id,
      visible: () => !folded() && layerOpen(lc),
      redirect: () => {
        if (!folded()) return null;
        layerPick = lc.id;
        return 'ebenen';
      },
      dot: () => g.canPrestige(lc.id),
      build() {
        const view = buildLayerView(lc);
        const holder = h('div', {}, view.el);
        return {
          el: holder,
          update() {
            if (view.el.parentNode !== holder) holder.replaceChildren(view.el);
            view.update();
          },
        };
      },
    });
  }

  for (const et of options.extraTabs || []) {
    tabs.push({
      id: et.id,
      label: et.label,
      icon: et.icon,
      visible: et.visible ? () => !!et.visible(g) : undefined,
      dot: et.dot ? () => !!et.dot(g) : undefined,
      build: () => et.build(ctx),
    });
  }

  if (chron) {
    tabs.push({
      id: 'chronik',
      label: 'Chronik',
      icon: 'book',
      dot: () => g.storyUnread() > 0,
      build() {
        const view = chronicleView(g, { speaker, onReplay: (entry) => story && story.replay(entry), figures: () => chron.figures(g) });
        chronikView = view;
        return { el: view.el, update: () => view.update() };
      },
    });
  } else {
    tabs.push({
      id: 'ach',
      label: 'Erfolge',
      icon: 'achievements',
      build() {
        const grid = achievementGrid(g, { bonusText: options.bonusText });
        return grid;
      },
    });
  }

  tabs.push({
    id: 'more',
    label: 'Mehr',
    icon: 'more',
    build() {
      const stats = buildStatsPanel(g, options.statRows ? options.statRows(g) : defaultStatRows(g));
      const settings = buildSettingsPanel(ctx);
      const logList = h('ul', { class: 'card log' });
      let logN = -1;
      // with a Chronik the Erfolge tab is gone: the achievements take the place of the old log list (the Chronik replaces that)
      const grid = chron ? achievementGrid(g, { bonusText: options.bonusText }) : null;
      const el = h('div', { class: 'stack' },
        sectionTitle('Statistik'), stats.el,
        sectionTitle('Einstellungen'), settings.el,
        chron ? sectionTitle('Erfolge') : sectionTitle('Logbuch'), chron ? grid.el : logList,
      );
      return {
        el,
        update() {
          stats.update();
          if (grid) {
            grid.update();
            return;
          }
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
  if (!chron) runtime.on('story', ({ def }) => toast(def.text, { kind: 'story', ms: 7000 }));
  runtime.on('prestige', ({ id, gain }) => toast(`+${fmt(gain)} ${cur(g.layerById[id].currency)}`, { kind: 'good', title: g.layerById[id].name }));
  runtime.on('challenge-done', ({ id }) => toast(g.chalById[id].reward, { kind: 'good', title: 'Challenge geschafft: ' + g.chalById[id].name }));
  // new autobuyer: say where its switch is (prestige autos sit in their layer's tab, all others in the generator tab's "Automatisierung")
  announceAutoUnlocks({
    runtime,
    toast,
    offline,
    whereOf: (a) => {
      const lc = a.kind === 'prestige' && options.layers.find((x) => x.id === a.layer);
      return lc ? `${lc.label || g.layerById[lc.id].name}-Tab` : `${options.generators.label || 'Generatoren'}-Tab (Automatisierung)`;
    },
  });
  if (chron) {
    // story bubbles: new non-modal entries play as a chat above the tab bar (a toast when switched off); modal entries are dialogs
    const bubbles = createStoryBubbles(g, {
      mount: root,
      speaker,
      lineText: lineTextOf,
      summaryWho: defaultWho,
      blocked: () => !!document.querySelector('.modal-overlay'),
      suppress: () => {
        const p = document.getElementById('page-chronik');
        return !!p && !p.hidden;
      },
      openChronik: (id) => {
        app.select('chronik');
        if (chronikView) chronikView.reveal(id);
      },
    });
    ctx.storyBubbles = bubbles;
    story = createStoryController(g, {
      runtime,
      title: (entry) => ((g.def.chapters || []).find((x) => x.id === entry.chapter) || {}).title || '',
      renderPage: (entry, line, i) => {
        const who = speaker(line.who || defaultWho);
        return h('div', { class: 'story-page', style: who.color ? { '--c': who.color } : null }, who.avatar(128, entry, i), h('b', { class: 'story-name', text: who.name }), h('p', { class: 'story-body', text: lineTextOf(line) }));
      },
    });
    ctx.story = story;
    runtime.on('story', ({ def }) => {
      if (def.modal) return;
      if (!bubbles.push(def)) toast(lineTextOf(def.lines[0]), { kind: 'story', ms: 7000, title: speaker(def.lines[0].who || defaultWho).name });
    });
    // entries that fired while the app was closed or in the background are muted by the runtime: announce them once
    const catchUp = (ms) => setTimeout(() => { story.next(); bubbles.syncBacklog(); }, ms);
    runtime.on('offline', () => catchUp(500));
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && catchUp(600));
    setTimeout(() => story.next(), 700);
    setTimeout(() => bubbles.syncBacklog(), 1000);
  }
  runtime.on('offline', (s) => showOfflineSummary(g, s));
  runtime.on('respec', () => toast('Forschung zurückgesetzt.', { kind: 'info' }));
  // offline progress that was simulated while loading (before the UI listened)
  if (offline && offline.seconds >= 60) showOfflineSummary(g, offline);

  return { app, ctx };
}
