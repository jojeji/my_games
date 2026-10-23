// App shell: sticky header, pages, bottom tab bar, toasts, throttled render loop.
import { h, prefs } from './dom.js';
import { createTabBar } from './tabs.js';
import { createToaster } from './toast.js';

/**
 * @param {object} cfg
 * @param {HTMLElement} cfg.root
 * @param {string} cfg.gameId
 * @param {{build:(ctx)=>{el:Node, update:()=>void}}} cfg.header
 * @param {Array<{id:string,label:string,icon:string,visible?:()=>boolean,build:(ctx)=>{el:Node, update:()=>void}}>} cfg.tabs
 * @param {object} cfg.ctx  shared context passed to builders (runtime, game, ...)
 * @param {number} [cfg.fps]
 */
export function mountApp({ root, gameId, header, tabs, ctx, fps = 15 }) {
  const toastBox = h('div', { class: 'toasts', 'aria-live': 'polite' });
  const headerEl = h('header', { class: 'hdr' });
  const pagesEl = h('main', { class: 'pages' });
  const toast = createToaster(toastBox);
  ctx.toast = toast;

  const hdr = header.build(ctx);
  headerEl.append(hdr.el);

  const pages = {};
  const scrolls = {};
  let active = null;

  const bar = createTabBar({ tabs, onSelect: (id) => select(id) });
  root.append(headerEl, pagesEl, bar.el, toastBox);

  function ensurePage(t) {
    if (pages[t.id]) return pages[t.id];
    const built = t.build(ctx);
    const el = h('section', { class: 'page', id: 'page-' + t.id, hidden: true }, built.el);
    pagesEl.append(el);
    pages[t.id] = { el, update: built.update, t };
    return pages[t.id];
  }

  function select(id) {
    const t = tabs.find((x) => x.id === id);
    if (!t || (t.visible && !t.visible())) return;
    if (active) {
      scrolls[active] = window.scrollY;
      pages[active].el.hidden = true;
    }
    active = id;
    const p = ensurePage(t);
    p.el.hidden = false;
    p.update();
    bar.setActive(id);
    bar.setDot(id, false);
    prefs.set(`mg:${gameId}:tab`, id);
    window.scrollTo(0, scrolls[id] || 0);
  }

  function updateTabs() {
    for (const t of tabs) {
      const vis = t.visible ? !!t.visible() : true;
      bar.setVisible(t.id, vis);
      if (t.dot) bar.setDot(t.id, vis && active !== t.id && !!t.dot());
    }
    const cur = tabs.find((x) => x.id === active);
    if (cur && cur.visible && !cur.visible()) select(tabs[0].id);
  }

  let last = 0;
  let lastTabs = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (ts - last < 1000 / fps) return;
    last = ts;
    hdr.update();
    if (active) pages[active].update();
    if (ts - lastTabs > 400) {
      lastTabs = ts;
      updateTabs();
    }
  }

  const saved = prefs.get(`mg:${gameId}:tab`);
  updateTabs();
  const first = tabs.find((t) => t.id === saved && (!t.visible || t.visible())) || tabs[0];
  select(first.id);
  requestAnimationFrame(frame);

  ctx.select = select;
  return { select, toast };
}
