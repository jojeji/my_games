// Myzel UI: header (Nährstoffe + Regenschauer), tabs Netz and Mehr, full-screen layer views, fork dialog, offline summary.
import { h, txt, setCls, setHidden, svgIcon } from '../../engine/ui/dom.js';
import { mountApp } from '../../engine/ui/app.js';
import { progressBar, sectionTitle } from '../../engine/ui/kit-views.js';
import { buildSettingsPanel } from '../../engine/ui/settings.js';
import { buildStatsPanel } from '../../engine/ui/stats.js';
import { announceAutoUnlocks } from '../../engine/ui/auto-hints.js';
import { formatNumber as fmt, formatCompact, formatDuration, setNotation } from '../../engine/format.js';
import { buildTree } from './tree-view.js';
import { createLayerOverlay, doRain } from './layer-view.js';
import { openForkDialog } from './fork-view.js';
import { showOfflineSummary } from './offline-view.js';
import { rainCharges, rainMult, rainNextIn } from './def.js';
import { TUNE as T } from './tune.js';

const CLOUD = '<path d="M7 17a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 8.5 3.8 3.8 0 0 1 17.5 17z"/><path d="M8 20l1-2M12 20l1-2M16 20l1-2"/>';

export function mountMyzel({ root, runtime, offline }) {
  const g = runtime.logic;
  const ctx = { runtime, g };
  setNotation(g.state.settings.notation);

  ctx.askFork = () => openForkDialog(ctx);

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
      banner.append(bannerText, bannerBar.el);
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
          txt(sub, r.t > 0 ? `×${rainMult(g)} · ${formatDuration(r.t)}` : c >= 1 ? 'Schauer' : `in ${formatDuration(rainNextIn(g))}`);
          const ch = g.chActive();
          setHidden(banner, !ch);
          if (ch) {
            txt(bannerText, `${ch.name}: ${fmt(g.chValue(ch))} / ${fmt(ch.goal.amount)} Hyphen`);
            bannerBar.set(g.chProgress(ch));
          }
          const hh = el.parentElement ? el.parentElement.offsetHeight : 0;
          if (hh && hh !== hdrH) {
            hdrH = hh;
            document.documentElement.style.setProperty('--hdr-h', hh + 'px');
          }
          // the fork is on offer: ask once per visit (the node keeps glowing if the dialog is dismissed)
          if (!ctx.forkAsked && g.forkOffered('a') && !document.querySelector('.modal-overlay') && !document.body.classList.contains('lv-open')) {
            ctx.forkAsked = true;
            ctx.askFork();
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
      dot: () => g.forkOffered('a'),
      build() {
        const tree = buildTree({
          g,
          toast: (...a) => ctx.toast(...a),
          onOpen: (id) => overlay.open(id),
          onChoose: () => ctx.askFork(),
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
  runtime.on('fork-chosen', ({ opt }) => toast(g.forkDef('a').options.find((o) => o.id === opt).blurb, { kind: 'good', title: 'Gewählt', ms: 5000 }));
  runtime.on('prestige', ({ id, gain }) => id !== 'h' && toast(`+${fmt(gain)} ${g.currencyById[g.layerById[id].currency].name}`, { kind: 'good', title: g.layerById[id].name, ms: 2200 }));
  announceAutoUnlocks({ runtime, toast, offline, whereOf: () => 'Hyphen-Ebene' });

  runtime.on('offline', (s) => showOfflineSummary(g, s));
  if (offline && offline.seconds >= 60) showOfflineSummary(g, offline);

  return { app, ctx, overlay };
}
