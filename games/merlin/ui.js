// Merlin UI: header with era strip, tabs (Zeit, Zauber, Verjüngung, Epochen, Chronik, Mehr) built from the shared engine views.
import { h, txt, setHidden, setDisabled, svgIcon } from '../../engine/ui/dom.js';
import { ICONS } from '../../engine/ui/icons.js';
import { mountApp } from '../../engine/ui/app.js';
import { openModal, confirmDialog } from '../../engine/ui/modal.js';
import { buildSettingsPanel } from '../../engine/ui/settings.js';
import { buildStatsPanel, defaultStatRows } from '../../engine/ui/stats.js';
import {
  buyModeBar, upgradeList, prestigePanel, milestoneList, autoPanel, autoSwitch, achievementGrid, showOfflineSummary,
  section, sectionTitle, progressBar,
} from '../../engine/ui/kit-views.js';
import { tapView } from '../../engine/ui/tap-view.js';
import { spellBar, spellCards } from '../../engine/ui/spell-view.js';
import { producerList } from '../../engine/ui/producer-view.js';
import { chronicleView, createStoryController } from '../../engine/ui/story-view.js';
import { createStoryBubbles } from '../../engine/ui/story-bubbles.js';
import { avatar } from '../../engine/ui/avatar.js';
import { openCharacterCard } from '../../engine/ui/character-card.js';
import { formatNumber as fmt, formatPercent, setNotation } from '../../engine/format.js';
import { hourglassSvg, SPELL_ICONS } from './art.js';
import { buildEraTab } from './era-view.js';
import { CAST, portrait, entryEra, DEDICATION, lineText, metCast, merlinStageList } from './characters.js';
import { ERAS, IDEAS } from './eras.js';
import { globalParts, jumpThreshold, zeitMult, ideasOwned, bonusAch } from './def.js';
import { announceAutoUnlocks } from '../../engine/ui/auto-hints.js';
import { TUNE as T } from './tune.js';

const FINAL = ERAS.length - 1;

export function mountMerlin({ root, runtime, offline }) {
  const g = runtime.logic;
  const ctx = { runtime, g };
  setNotation(g.state.settings.notation);
  document.documentElement.dataset.era = String(g.state.mer.era);

  /* ---------------- prestige with era-aware confirmation ---------------- */
  ctx.askPrestige = async (id) => {
    if (!g.canPrestige(id)) return false;
    const l = g.layerById[id];
    if (g.state.settings.confirm[id]) {
      const gain = g.prestigeGain(id);
      let msg = `${l.verb}: Du erhältst +${fmt(gain)} ${g.currencyById[l.currency].name}. ${l.blurb}`;
      if (id === 'jump' && !IDEAS.some((i) => i.era === g.state.mer.era && g.upgLevel(i.id) > 0)) msg += ' Du hast in dieser Epoche noch keinen Anachronismus gepflanzt – danach ist es zu spät.';
      const ok = await confirmDialog(msg, { title: l.name, ok: l.verb });
      if (!ok) return false;
    }
    return g.prestige(id);
  };

  /* ---------------- speakers (portraits) ---------------- */
  const era = () => g.state.mer.era;
  const showCard = (who, from) => {
    const c = CAST[who] || CAST.merlin;
    const p = portrait(who, era());
    openCharacterCard({
      name: c.name, color: c.color, role: c.role, bio: c.bio, img: p.img,
      stages: who === 'merlin' ? merlinStageList(era()) : null,
    }, { returnFocus: from });
  };
  const speaker = (who) => ({
    name: (CAST[who] || CAST.merlin).name,
    color: (CAST[who] || CAST.merlin).color,
    side: (CAST[who] || CAST.merlin).side,
    avatar: (size, entry, idx = 0) => {
      const p = portrait(who, entry ? entryEra(entry) : era(), entry, idx);
      return avatar({ src: size > 80 ? p.img : p.sm, name: p.name, size, cls: 'avatar-' + who, onTap: (el) => showCard(who, el) });
    },
  });

  /* ---------------- multiplier details ---------------- */
  const showMultDetails = () => {
    const list = h('ul', { class: 'mult-list' });
    for (const [label, v] of globalParts(g)) list.append(h('li', {}, h('span', { text: label }), h('b', { class: 'num', text: '×' + fmt(v) })));
    if (g.spellActive('zeit')) list.append(h('li', {}, h('span', { text: 'Zeitraffer (aktiv)' }), h('b', { class: 'num', text: '×' + zeitMult(g) })));
    openModal({
      title: 'Produktions-Multiplikator',
      body: h('div', {}, h('p', { class: 'muted', text: 'Alle Faktoren, die deine Quellen skalieren:' }), list, h('p', { class: 'mult-total' }, 'Gesamt: ', h('b', { class: 'num', text: '×' + fmt(g.cache.prod.quellen.global) }))),
      actions: [{ label: 'Schließen', kind: 'primary' }],
    });
  };

  /* ---------------- header ---------------- */
  const header = {
    build() {
      const val = h('b', { class: 'hdr-val num' });
      const rate = h('span', { class: 'hdr-rate num' });
      const btnText = h('span', { class: 'hdr-btn-text' });
      const btnIcon = h('span', { class: 'hdr-btn-icon' }, svgIcon(ICONS.hourglass));
      const btn = h('button', { class: 'btn btn-primary hdr-btn', type: 'button' }, btnIcon, btnText);
      let btnLayer = null;
      btn.addEventListener('click', () => btnLayer && ctx.askPrestige(btnLayer));
      const top = h('div', { class: 'hdr-top' },
        h('div', { class: 'hdr-cur' }, val, h('div', { class: 'hdr-sub' }, h('span', { class: 'hdr-label', text: 'Zeitsand' }), rate)),
        btn,
      );
      const chipDefs = [['mem', 'Erinn.'], ['shards', 'Splitter'], ['eternity', 'Ewigkeit']];
      const chips = chipDefs.map(([id, label]) => {
        const v = h('b', { class: 'num' });
        return { id, v, el: h('span', { class: 'chip', hidden: true }, h('small', { text: label }), v) };
      });
      const mult = h('button', { class: 'hdr-mult', type: 'button', onClick: showMultDetails });
      const chipRow = h('div', { class: 'hdr-chips' }, ...chips.map((c) => c.el), mult);
      const eraText = h('span', { class: 'era-strip-text' });
      const eraBar = progressBar();
      const eraStrip = h('div', { class: 'era-strip' }, eraText, eraBar.el);
      const el = h('div', { class: 'hdr-inner' }, top, chipRow, eraStrip);
      let shownEra = -1;
      return {
        el,
        update() {
          txt(val, fmt(g.get('sand')));
          txt(rate, '+' + fmt(g.incomePerSec('sand')) + '/s');
          for (const c of chips) {
            const show = g.get(c.id).gt(0) || g.state.cur[c.id].total.gt(0);
            setHidden(c.el, !show);
            if (show) txt(c.v, fmt(g.get(c.id)));
          }
          txt(mult, '×' + fmt(g.cache.prod.quellen.global) + ' ⓘ');
          const e = era();
          if (shownEra !== e) {
            shownEra = e;
            document.documentElement.dataset.era = String(e);
          }
          const have = g.state.cur.mem.run;
          const thr = jumpThreshold(g);
          const fin = g.state.mer.finished;
          txt(eraText, `${ERAS[e].name} · ${ERAS[e].year}${e < FINAL || fin ? '' : ' · Das Erste Wort'}`);
          eraBar.set(fin ? 1 : have.div(thr).toNumber());
          // shortcut: cycle > jump > rejuvenate
          let target = ['cycle', 'jump', 'rejuv'].find((id) => g.canPrestige(id));
          let label;
          if (target) label = `+${fmt(g.prestigeGain(target))} ${g.currencyById[g.layerById[target].currency].short}`;
          else {
            target = g.layerUnlocked('rejuv') || g.state.cur.sand.best.gte(T.rejuvThreshold / 20) ? 'rejuv' : null;
            label = target ? g.layerById[target].verb : '';
          }
          btnLayer = target;
          setHidden(btn, !target);
          if (target) {
            txt(btnText, label);
            setDisabled(btn, !g.canPrestige(target));
          }
        },
      };
    },
  };

  /* ---------------- tabs ---------------- */
  const tabs = [];
  let chronikView = null;

  tabs.push({
    id: 'zeit', label: 'Zeit', icon: 'hourglass',
    build() {
      const tap = tapView(g, {
        art: hourglassSvg(),
        title: 'Sanduhr wenden',
        floatText: (gain) => '+' + fmt(gain),
      });
      const spells = spellBar(g, { icons: SPELL_ICONS });
      const modeBar = buyModeBar(g, { onBuyAll: () => g.prodSpendAll('quellen'), buyAllLabel: 'Alles kaufen' });
      const list = producerList(g, 'quellen');
      const swTap = autoSwitch(g, 'auto_tap', { label: 'Sanduhr automatisch wenden' });
      const swBuy = autoSwitch(g, 'auto_buy', { label: 'Automatisch kaufen' });
      const autos = autoPanel(g);
      const autoSection = section('Automatisierung', autos.el, { open: false });
      const hint = h('p', { class: 'muted small center', text: 'Tipp: Kaufen-Taste gedrückt halten für Schnellkauf, Zeile antippen für Details.' });
      const el = h('div', { class: 'stack' }, tap.el, swTap.el, spells.el, modeBar.el, swBuy.el, list.el, autoSection, hint);
      return {
        el,
        update() {
          tap.update();
          swTap.update();
          swBuy.update();
          spells.update();
          modeBar.update();
          list.update();
          autos.update();
          setHidden(autoSection, !autos.any);
        },
      };
    },
  });

  tabs.push({
    id: 'zauber', label: 'Zauber', icon: 'wand',
    visible: () => g.spellUnlocked('zeit'),
    build() {
      const cards = spellCards(g, { icons: SPELL_ICONS, autoId: 'auto_spells' });
      const note = h('p', { class: 'muted small', text: 'Zauber wirken nur, solange du spielst – außer sie werden automatisch gewirkt (ab der 8. Verjüngung), das gilt auch offline.' });
      const sw = autoSwitch(g, 'auto_spells', { label: 'Automatisch wirken', hint: 'Pro Zauber einstellbar (unten)' });
      return { el: h('div', { class: 'stack' }, note, sw.el, cards.el), update() { sw.update(); cards.update(); } };
    },
  });

  tabs.push({
    id: 'rejuv', label: 'Verjüngung', icon: 'sparkle',
    visible: () => g.layerUnlocked('rejuv') || g.state.cur.sand.best.gte(T.rejuvThreshold / 20),
    dot: () => g.canPrestige('rejuv') && g.state.layers.rejuv.count === 0,
    build() {
      const parts = [];
      const stack = h('div', { class: 'stack' });
      const add = (v, wrap) => {
        parts.push(v);
        stack.append(wrap || v.el);
      };
      add(prestigePanel(g, 'rejuv', ctx));
      const ms = milestoneList(g, 'rejuv');
      parts.push(ms);
      stack.append(section('Meilensteine', ms.el, { open: false }));
      stack.append(sectionTitle('Erinnerungen-Upgrades', 'Epochensprung setzt sie zurück'));
      const swMem = autoSwitch(g, 'auto_mem', { label: 'Automatisch kaufen', hint: 'Kauft das jeweils günstigste Upgrade' });
      add(swMem);
      add(upgradeList(g, 'mem'));
      return { el: stack, update: () => parts.forEach((p) => p.update()) };
    },
  });

  const eraTab = { id: 'epochen', label: 'Epochen', icon: 'compass', visible: () => g.state.layers.rejuv.count >= 1, dot: () => g.canPrestige('jump') || g.canPrestige('cycle'), build: () => buildEraTab(ctx) };
  tabs.push(eraTab);

  tabs.push({
    id: 'chronik', label: 'Chronik', icon: 'book',
    dot: () => g.storyUnread() > 0,
    build() {
      const view = chronicleView(g, { speaker, onReplay: (entry) => story.replay(entry), figures: () => metCast(g) });
      chronikView = view;
      return { el: view.el, update: () => view.update() };
    },
  });

  tabs.push({
    id: 'more', label: 'Mehr', icon: 'more',
    build() {
      const grid = achievementGrid(g, { bonusText: () => `Erfolgs-Bonus: +${formatPercent(0.02 * bonusAch(g), 0)} auf alle Produktion` });
      const rows = defaultStatRows(g);
      rows.splice(2, 0,
        ['Epoche', () => `${era() + 1} / ${ERAS.length} (${ERAS[era()].name})`],
        ['Zyklen geschlossen', () => String(g.state.layers.cycle.count)],
        ['Sanduhr gewendet', () => String(g.state.tap.n)],
        ['Zauber gewirkt', () => String(g.def.spells.reduce((a, s) => a + g.state.spells[s.id].n, 0))],
        ['Anachronismen gepflanzt', () => String(ideasOwned(g))],
      );
      const stats = buildStatsPanel(g, rows);
      const settings = buildSettingsPanel(ctx);
      // keepsake from the epilogue: golden hourglass with 31 grains (cosmetic only)
      const goldInput = h('input', { type: 'checkbox', id: 'gold-hg' });
      goldInput.addEventListener('change', () => { g.state.settings.goldHourglass = goldInput.checked; applyGold(); });
      const gold = h('label', { class: 'card row setting gold-hg-row' },
        h('span', { class: 'row-main' }, h('b', { text: 'Sanduhr mit 31 Körnern' }), h('small', { text: 'Das Geschenk vom Ende der Reise – nur zur Zierde.' })),
        h('span', { class: 'switch' }, goldInput, h('i', { class: 'switch-track' })));
      const dedication = h('p', { class: 'dedication', text: DEDICATION });
      const el = h('div', { class: 'stack' }, sectionTitle('Erfolge'), grid.el, gold, sectionTitle('Statistik'), stats.el, sectionTitle('Einstellungen'), settings.el, dedication);
      return { el, update() { grid.update(); stats.update(); setHidden(gold, !g.hasAch('x31')); if (goldInput.checked !== !!g.state.settings.goldHourglass) goldInput.checked = !!g.state.settings.goldHourglass; } };
    },
  });

  /* ---------------- shell + events ---------------- */
  const app = mountApp({ root, gameId: 'merlin', header, tabs, ctx });
  const { toast } = app;

  runtime.on('achievement', ({ def }) => toast(def.desc, { kind: 'good', title: 'Erfolg: ' + def.name }));
  runtime.on('milestone', ({ def }) => toast(def.desc, { kind: 'good', title: 'Meilenstein: ' + def.name }));
  // new automation: say where its switch lives (engine/ui/auto-hints.js; also covers unlocks during offline catch-up)
  announceAutoUnlocks({ runtime, toast, offline });
  runtime.on('prestige', ({ id, gain }) => toast(`+${fmt(gain)} ${g.currencyById[g.layerById[id].currency].name}`, { kind: 'good', title: g.layerById[id].name }));
  runtime.on('upgrade', ({ id }) => {
    const idea = IDEAS.find((i) => i.id === id);
    if (idea) toast(idea.desc, { kind: 'good', title: 'Gepflanzt: ' + idea.name });
  });
  // story bubbles: new non-modal entries play as a chat above the tab bar (falls back to a toast when switched off)
  const bubbles = createStoryBubbles(g, {
    mount: root,
    speaker,
    lineText: (line) => lineText(g, line),
    blocked: () => !!document.querySelector('.modal-overlay'),
    suppress: () => { const p = document.getElementById('page-chronik'); return !!p && !p.hidden; },
    openChronik: (id) => {
      ctx.select('chronik');
      if (chronikView) chronikView.reveal(id);
    },
  });
  ctx.storyBubbles = bubbles;
  runtime.on('story', ({ def }) => {
    if (def.modal) return;
    if (!bubbles.push(def)) toast(lineText(g, def.lines[0]), { kind: 'story', ms: 7000, title: speaker(def.lines[0].who || 'merlin').name });
  });
  // entries that fired while the app was closed or in the background are muted by the runtime: announce them once
  runtime.on('offline', () => setTimeout(() => { story.next(); bubbles.syncBacklog(); }, 500));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && setTimeout(() => { story.next(); bubbles.syncBacklog(); }, 600));
  runtime.on('spell', ({ id, auto }) => !auto && toast(g.spellById[id].info ? g.spellById[id].info(g) : '', { kind: 'info', title: g.spellById[id].name, ms: 1800 }));
  if (g.state.mer.rebalNotice) {
    g.state.mer.rebalNotice = false;
    setTimeout(() => toast('Längere Läufe lohnen sich jetzt: Die automatische Verjüngung steht auf 3 Minuten. Einstellbar im Verjüngungs-Tab.', { kind: 'info', title: 'Neu abgestimmt', ms: 9000 }), 1500);
  }
  runtime.on('offline', (s) => showOfflineSummary(g, s));
  if (offline && offline.seconds >= 60) showOfflineSummary(g, offline);

  /* ---------------- golden hourglass keepsake ---------------- */
  function applyGold() {
    document.documentElement.dataset.hg = g.hasAch('x31') && g.state.settings.goldHourglass ? 'gold' : '';
  }
  applyGold();
  runtime.on('saved', applyGold);

  /* ---------------- story modals ---------------- */
  const story = createStoryController(g, {
    runtime,
    title: (entry) => {
      const c = (g.def.chapters || []).find((x) => x.id === entry.chapter);
      const m = /^e(\d)$/.exec(entry.chapter || '');
      return m ? `${ERAS[Number(m[1])].name} · ${ERAS[Number(m[1])].year}` : c ? c.title : '';
    },
    renderPage: (entry, line, i) => {
      const who = speaker(line.who || 'merlin');
      return h('div', { class: 'story-page' }, who.avatar(128, entry, i), h('b', { class: 'story-name', text: who.name }), h('p', { class: 'story-body', text: lineText(g, line) }));
    },
  });
  setTimeout(() => story.next(), 700);
  setTimeout(() => bubbles.syncBacklog(), 1000);
  return { app, ctx, story };
}
