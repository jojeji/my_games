// Myzel UI: header (Nährstoffe + Regenschauer), tabs Netz and Mehr, full-screen layer views, fork dialog, offline summary.
import { h, txt, setCls, setHidden, svgIcon } from '../../engine/ui/dom.js';
import { mountApp } from '../../engine/ui/app.js';
import { progressBar, sectionTitle } from '../../engine/ui/kit-views.js';
import { confirmDialog, openModal } from '../../engine/ui/modal.js';
import { buildSettingsPanel } from '../../engine/ui/settings.js';
import { buildStatsPanel } from '../../engine/ui/stats.js';
import { announceAutoUnlocks } from '../../engine/ui/auto-hints.js';
import { formatNumber as fmt, formatCompact, formatDuration, setNotation } from '../../engine/format.js';
import { buildTree } from './tree-view.js';
import { createLayerOverlay, doRain } from './layer-view.js';
import { openForkDialog } from './fork-view.js';
import { ENDING } from './ending.js';
import { ended, humus } from './def.js';
import { showOfflineSummary } from './offline-view.js';
import { rainCharges, rainMult, rainNextIn } from './def.js';
import { TUNE as T } from './tune.js';

const CLOUD = '<path d="M7 17a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 8.5 3.8 3.8 0 0 1 17.5 17z"/><path d="M8 20l1-2M12 20l1-2M16 20l1-2"/>';

export function mountMyzel({ root, runtime, offline }) {
  const g = runtime.logic;
  const ctx = { runtime, g };
  setNotation(g.state.settings.notation);

  ctx.forkAsked = { a: false, b: false };
  ctx.askFork = (fork = 'a') => {
    ctx.forkAsked[fork] = true; // dismissing the dialog is an answer: the node keeps glowing, the dialog does not come back by itself
    return openForkDialog(ctx, { fork });
  };

  /** The ending screen (all text in ending.js). Shown once when the fifth ring closes, readable again from the Hexenring view. */
  ctx.showEnding = () => {
    g.state.myz.endShown = true;
    return openModal({
      title: ENDING.title,
      body: h('div', { class: 'stack ending-text' }, ...ENDING.paragraphs.map((t) => h('p', { text: t }))),
      actions: [{ label: ENDING.button, kind: 'primary' }],
    });
  };

  /* ---------------- header ---------------- */
  const header = {
    build() {
      const val = h('b', { class: 'hdr-val num' });
      const rate = h('span', { class: 'hdr-rate num' });
      const pips = [0, 1, 2].map(() => h('i', { class: 'pip' }));
      const sub = h('small', { class: 'rain-sub' });
      const rainBtn = h('button', { class: 'rain-btn', type: 'button', 'aria-label': 'Regenschauer auslösen', onClick: () => doRain(ctx) },
        svgIcon(CLOUD, 'icon rain-ico'), h('span', { class: 'rain-body' }, h('span', { class: 'pips' }, ...pips), sub));
      const banner = h('div', { class: 'chal-banner', hidden: true });
      const bannerText = h('span', { class: 'chal-banner-text' });
      const bannerBar = progressBar();
      const giveUp = h('button', { class: 'btn btn-ghost chal-giveup', type: 'button', 'aria-label': 'Zu schwer? Challenge aufgeben', onClick: async () => {
        const ch = g.chActive();
        if (ch && (await confirmDialog(`„${ch.name}“ ist zu schwer? Du kannst aufgeben: der Lauf wird zurückgesetzt, es gibt keine Belohnung, und du kannst es später noch einmal versuchen.`, { title: 'Challenge aufgeben?', ok: 'Aufgeben', danger: true }))) g.chExit();
      } }, h('small', { text: 'Zu schwer?' }), h('b', { text: 'Aufgeben' }));
      banner.append(h('div', { class: 'chal-banner-row' }, bannerText, giveUp), bannerBar.el);
      const top = h('div', { class: 'hdr-top' }, h('div', { class: 'hdr-cur' }, val, h('div', { class: 'hdr-sub' }, h('span', { class: 'hdr-label', text: 'Nährstoffe' }), rate)), rainBtn);
      const el = h('div', { class: 'hdr-inner' }, top, banner);
      let hdrH = 0;
      return {
        el,
        update() {
          txt(val, fmt(g.get('n')));
          txt(rate, '+' + formatCompact(g.incomePerSec('n')) + '/s');
          const c = rainCharges(g);
          pips.forEach((p, i) => setCls(p, 'full', i < c));
          const r = g.state.myz.rain;
          setCls(rainBtn, 'active', r.t > 0);
          setCls(rainBtn, 'ready', c >= 1);
          txt(sub, r.t > 0 ? `×${fmt(rainMult(g))} · ${formatDuration(r.t)}` : c >= 1 ? 'Schauer' : `in ${formatDuration(rainNextIn(g))}`);
          const ch = g.chActive();
          setHidden(banner, !ch);
          if (ch) {
            txt(bannerText, `${ch.name}: ${ch.goal.text(g)}`);
            bannerBar.set(g.chProgress(ch));
          }
          const hh = el.parentElement ? el.parentElement.offsetHeight : 0;
          if (hh && hh !== hdrH) {
            hdrH = hh;
            document.documentElement.style.setProperty('--hdr-h', hh + 'px');
          }
          // a fork is on offer: ask once per visit (the node keeps glowing if the dialog is dismissed)
          if (!document.querySelector('.modal-overlay') && !document.body.classList.contains('lv-open')) {
            for (const f of ['a', 'b']) {
              if (!ctx.forkAsked[f] && g.forkOffered(f)) {
                ctx.askFork(f);
                break;
              }
            }
            // the ending: shown once (also when it was reached while the app was closed)
            if (ended(g) && !g.state.myz.endShown) ctx.showEnding();
          }
        },
      };
    },
  };

  /* ---------------- tabs ---------------- */
  let overlay = null;
  const tabs = [
    {
      id: 'netz', label: 'Netz', icon: 'layers',
      dot: () => g.forkOffered('a') || g.forkOffered('b') || (ended(g) && !g.state.myz.endShown),
      build() {
        const tree = buildTree({
          g,
          toast: (...a) => ctx.toast(...a),
          onOpen: (id) => overlay.open(id),
          onChoose: (fork) => ctx.askFork(fork),
        });
        return tree;
      },
    },
    {
      id: 'more', label: 'Mehr', icon: 'more',
      build() {
        const L = g.state.layers;
        const rows = [
          ['Spielzeit', () => formatDuration(g.state.time.played)],
          ['davon offline berechnet', () => formatDuration(g.state.time.offline)],
          ['Regenschauer ausgelöst', () => String(g.state.myz.rain.n)],
          ['Ausbreitungen', () => String(L.h.count)],
          ['Hyphen insgesamt', () => fmt(g.state.cur.h.total)],
          ['Sporen jetzt', () => String(L.s.units)],
          ['Mykorrhiza jetzt', () => String(L.m.units)],
          ['Fruchtkörper gebildet', () => String(L.f.count)],
          ['Flechte / Fäulnis gewachsen', () => `${L.l.count} / ${L.z.count}`],
          ['Humus', () => fmt(humus(g))],
          ['Waldnetze verbunden', () => String(L.w.count)],
          ['Hexenringe', () => String(L.r.units)],
          ['Jahresringe', () => String(g.state.myz.jr)],
          ['Challenges geschafft', () => `${g.chDoneCount()} / ${g.def.challenges.length}`],
          ['Nährstoffe: Bestwert', () => fmt(g.state.cur.n.best)],
          ['Nährstoffe insgesamt', () => fmt(g.state.cur.n.total)],
        ];
        const stats = buildStatsPanel(g, rows);
        const settings = buildSettingsPanel(ctx);
        const note = h('p', { class: 'muted small', text: 'Offline wächst das Netz höchstens 3 Stunden (fest eingestellt).' });
        const el = h('div', { class: 'stack' }, sectionTitle('Statistik'), stats.el, sectionTitle('Einstellungen'), note, settings.el);
        return { el, update: () => stats.update() };
      },
    },
  ];

  const app = mountApp({ root, gameId: 'myzel', header, tabs, ctx });
  ctx.toast = app.toast;
  ctx.select = app.select;

  overlay = createLayerOverlay(ctx);
  root.append(overlay.el);
  // the layer view is updated by its own ~15 fps loop (the tab loop of mountApp only knows the tabs)
  let last = 0;
  const loop = (ts) => {
    if (ts - last > 66) {
      last = ts;
      overlay.update();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  /* ---------------- events ---------------- */
  const { toast } = app;
  runtime.on('milestone', ({ def }) => toast(def.desc, { kind: 'good', title: 'Meilenstein: ' + def.name }));
  runtime.on('challenge-done', ({ id }) => toast(g.chalById[id].reward, { kind: 'good', title: 'Challenge geschafft: ' + g.chalById[id].name, ms: 6000 }));
  runtime.on('layer-unlocked', ({ id }) => toast(`${g.layerById[id].name} ist jetzt offen.`, { kind: 'good', title: 'Neu im Netz' }));
  runtime.on('fork-chosen', ({ id, opt }) => toast(g.forkDef(id).options.find((o) => o.id === opt).blurb, { kind: 'good', title: 'Gewählt', ms: 5000 }));
  runtime.on('jahresring', ({ n }) => toast(`Das Netz ist ein Jahr älter: Ring ${n}, Gewinne +${n} %.`, { kind: 'info', ms: 2600, title: 'Jahresring' }));
  runtime.on('prestige', ({ id, gain }) => id !== 'h' && id !== 'r' && toast(`+${fmt(gain)} ${g.currencyById[g.layerById[id].currency].name}`, { kind: 'good', title: g.layerById[id].name, ms: 2200 }));
  runtime.on('prestige', ({ id }) => id === 'r' && !ended(g) && toast(`Ring ${g.state.layers.r.units} von 5 liegt.`, { kind: 'good', title: 'Hexenring', ms: 3000 }));
  runtime.on('ending', () => ctx.showEnding());
  announceAutoUnlocks({ runtime, toast, offline, whereOf: () => 'Hyphen-Knoten' });

  runtime.on('offline', (s) => showOfflineSummary(g, s));
  if (offline && offline.seconds >= 60) showOfflineSummary(g, offline);

  return { app, ctx, overlay };
}
