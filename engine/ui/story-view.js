// Chronik (story log) view + modal controller for major story beats. Works with engine/kit/story.js.
// The game supplies `speaker(who)` -> { name, avatar(size) }, so portraits stay game-specific and swappable.
import { h, txt, setHidden } from './dom.js';
import { openModal } from './modal.js';

/**
 * Chronik: chapters (def.chapters) as collapsible sections, newest chapter first; entries chronological inside.
 * @param {object} g
 * @param {{speaker:(who:string)=>{name:string, avatar:(size:number, entry?:object)=>Node}, tabActive?:()=>boolean}} opts
 */
export function chronicleView(g, { speaker, onReplay }) {
  const root = h('div', { class: 'stack chronik' });
  const head = h('div', { class: 'card chronik-head' }, h('b', { text: 'Chronik' }), h('small', { class: 'muted' }));
  const body = h('div', { class: 'stack' });
  root.append(head, body);
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
      const d = h('details', { class: 'section chapter', open: open.has(c.id) ? open.get(c.id) : idx === 0 });
      d.addEventListener('toggle', () => open.set(c.id, d.open));
      d.append(h('summary', {}, h('span', { text: c.title }), h('small', { class: 'badge', text: String(entries.length) })));
      const ul = h('div', { class: 'stack' });
      for (const { def } of entries) {
        for (const line of def.lines) {
          const who = speaker(line.who || 'merlin');
          ul.append(h('div', { class: 'story-line card' + (fresh.has(def.id) ? ' fresh' : '') + ' who-' + (line.who || 'merlin') },
            who.avatar(40, def, def.lines.indexOf(line)),
            h('div', { class: 'story-text' }, h('small', { class: 'story-who', text: who.name }), h('p', { text: typeof line.t === 'function' ? line.t(g) : line.t })),
          ));
        }
      }
      for (const { def } of entries) {
        if (def.replay && onReplay) ul.append(h('button', { class: 'btn btn-block', type: 'button', text: 'Szene erneut ansehen', onClick: () => onReplay(def) }));
      }
      d.append(ul);
      return d;
    });
    body.replaceChildren(...nodes);
    if (!nodes.length) body.append(h('p', { class: 'muted center', text: 'Noch nichts erlebt.' }));
  };

  return {
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
      txt(head.lastChild, `${list.length} Einträge`);
      setHidden(head, false);
    },
  };
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
