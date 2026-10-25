// Chronik (story log) view + modal controller for major story beats. Works with engine/kit/story.js.
// The game supplies `speaker(who)` -> { name, avatar(size) }, so portraits stay game-specific and swappable.
import { h, txt, setHidden } from './dom.js';
import { openModal } from './modal.js';
import { isDiaryLine } from '../kit/story-bubbles.js';

/**
 * Chronik as a chat log: chapters (def.chapters) are collapsible sections, newest chapter first; inside a chapter the
 * entries are conversations in chronological order (newest at the bottom, like a messenger). Per speaker a side and a colour.
 * @param {object} g
 * @param {{speaker:(who:string)=>{name:string, avatar:(size:number, entry?:object, idx?:number)=>Node, color?:string, side?:'left'|'right'}, onReplay?:(entry:object)=>void, figures?:()=>string[]}} opts
 */
export function chronicleView(g, { speaker, onReplay, figures }) {
  const root = h('div', { class: 'stack chronik' });
  const head = h('div', { class: 'card chronik-head' }, h('b', { text: 'Chronik' }), h('small', { class: 'muted' }));
  const body = h('div', { class: 'stack' });
  // "Figuren": compact row of the characters met so far (ids from opts.figures); the avatars open the character card
  const figRow = h('div', { class: 'card fig-row', hidden: true, 'aria-label': 'Figuren' });
  let figKey = '';
  const syncFigures = () => {
    const ids = figures ? figures() : [];
    const key = ids.join(',');
    if (key === figKey) return;
    figKey = key;
    figRow.hidden = !ids.length;
    figRow.replaceChildren(h('small', { class: 'fig-title', text: 'Figuren' }), ...ids.map((id) => {
      const sp = speaker(id);
      return h('div', { class: 'fig', style: sp.color ? { '--c': sp.color } : null }, sp.avatar(44), h('small', { text: sp.name }));
    }));
  };
  root.append(head, figRow, body);
  const open = new Map();
  const fresh = new Set();
  let shown = -1;

  const rebuild = (list) => {
    const chapters = g.def.chapters || [{ id: undefined, title: 'Chronik' }];
    const byChapter = new Map();
    for (const e of list) {
      const k = e.def.chapter;
      if (!byChapter.has(k)) byChapter.set(k, []);
      byChapter.get(k).push(e);
    }
    const order = chapters.filter((c) => byChapter.has(c.id));
    // newest chapter = the one whose last entry is the latest
    order.sort((a, b) => byChapter.get(b.id).at(-1).t - byChapter.get(a.id).at(-1).t);
    const nodes = order.map((c, idx) => {
      const entries = byChapter.get(c.id);
      const newCount = entries.filter((e) => fresh.has(e.def.id)).length;
      const d = h('details', { class: 'section chapter', open: open.has(c.id) ? open.get(c.id) : idx === 0 });
      d.addEventListener('toggle', () => open.set(c.id, d.open));
      d.append(h('summary', {}, h('span', { text: c.title }), newCount ? h('small', { class: 'badge badge-new', text: `${newCount} neu` }) : null, h('small', { class: 'badge', text: String(entries.length) })));
      const chat = h('div', { class: 'chat' });
      for (const { def } of entries) {
        const conv = h('div', { class: 'chat-entry' + (fresh.has(def.id) ? ' fresh' : ''), 'data-entry': def.id });
        let prev = null;
        def.lines.forEach((line, idx) => {
          const key = line.who || 'merlin';
          const sp = speaker(key);
          const side = sp.side === 'right' ? 'right' : 'left';
          const body = typeof line.t === 'function' ? line.t(g) : line.t;
          const cont = prev === key;
          prev = key;
          conv.append(h('div', { class: `msg side-${side} who-${key}` + (cont ? ' cont' : ''), style: sp.color ? { '--c': sp.color } : null },
            cont ? h('span', { class: 'msg-gap' }) : sp.avatar(34, def, idx),
            h('div', { class: 'msg-bubble' + (isDiaryLine(def, line, body) ? ' diary' : '') },
              cont ? null : h('small', { class: 'msg-who', text: sp.name }),
              h('p', { text: body }),
            ),
          ));
        });
        chat.append(conv);
      }
      for (const { def } of entries) {
        if (def.replay && onReplay) chat.append(h('button', { class: 'btn btn-block', type: 'button', text: 'Szene erneut ansehen', onClick: () => onReplay(def) }));
      }
      d.append(chat);
      return d;
    });
    body.replaceChildren(...nodes);
    if (!nodes.length) body.append(h('p', { class: 'muted center', text: 'Noch nichts erlebt.' }));
  };

  const view = {
    el: root,
    /** call while the tab is visible: marks entries as read */
    update() {
      const list = g.storyList();
      const unread = g.def.story.filter((s) => g.state.story[s.id] !== undefined && !g.state.chronicle.read[s.id]);
      for (const s of unread) fresh.add(s.id);
      if (unread.length) g.storyMarkRead();
      const n = list.length + fresh.size * 1000;
      if (n !== shown) {
        shown = n;
        rebuild(list);
      }
      syncFigures();
      txt(head.lastChild, `${list.length} Einträge`);
      setHidden(head, false);
    },
    /** open the chapter of an entry, scroll it into view and flash it (call after the tab is shown) */
    reveal(id) {
      view.update();
      const el = id && body.querySelector(`[data-entry="${CSS.escape(id)}"]`);
      if (!el) return;
      const d = el.closest('details');
      if (d) d.open = true;
      requestAnimationFrame(() => {
        const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 2200);
      });
    },
  };
  return view;
}

/**
 * Shows pending modal story entries one after another (also those that happened while the app was closed).
 * Each entry = pages (one per line); `render(entry, line, index)` returns the page body node.
 */
export function createStoryController(g, { runtime, renderPage, title }) {
  let busy = false;
  const queue = [];

  function next() {
    if (busy) return;
    const pending = g.storyPendingModals().filter((e) => !queue.includes(e));
    queue.push(...pending);
    const entry = queue.shift();
    if (!entry) return;
    run(entry);
  }

  /** Show one entry as a dialog (also for replays from the Chronik). */
  function run(entry) {
    busy = true;
    g.storyModalShown(entry.id);
    let i = 0;
    const holder = h('div', { class: 'story-modal' });
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button' });
    let modal;
    const show = () => {
      holder.replaceChildren(renderPage(entry, entry.lines[i], i), h('p', { class: 'muted small center', text: entry.lines.length > 1 ? `${i + 1} / ${entry.lines.length}` : '' }));
      btn.textContent = i < entry.lines.length - 1 ? 'Weiter' : 'Schließen';
    };
    btn.addEventListener('click', () => {
      if (i < entry.lines.length - 1) {
        i++;
        show();
      } else {
        modal.close();
        busy = false;
        setTimeout(next, 250);
      }
    });
    show();
    modal = openModal({ title: title ? title(entry) : '', body: h('div', {}, holder, btn), actions: [], dismissible: false });
  }

  if (runtime) runtime.on('story', () => setTimeout(next, 600));
  return { next, replay: (entry) => { if (!busy) run(entry); } };
}
