// Messenger-style story bubbles: new non-modal Chronik entries play as a short chat above the tab bar.
// Game-agnostic: the game supplies speakers (name, avatar, colour, side) and how to open its Chronik. Logic lives in kit/story-bubbles.js.
import { h } from './dom.js';
import { createBubbleQueue, planBacklog, typingDelayMs, lingerMs, visibleWindow, isDiaryLine } from '../kit/story-bubbles.js';

const MAX_VISIBLE = 3;

/**
 * @param {object} g  kit Game with def.chronicle (storyBubbleBacklog / storyBubbleShown / state.chronicle)
 * @param {object} o
 * @param {HTMLElement} o.mount  element the overlay is appended to (the app root)
 * @param {(who:string)=>{name:string, avatar:(size:number, entry?:object, idx?:number)=>Node, color?:string, side?:'left'|'right'}} o.speaker
 * @param {(entryId?:string)=>void} o.openChronik  switch to the Chronik, scrolled to the entry
 * @param {(line:object)=>string} [o.lineText]
 * @param {()=>boolean} [o.blocked]   true while a modal is open: bubbles wait
 * @param {()=>boolean} [o.suppress]  true while the Chronik itself is visible: entries show up there instead
 * @param {(n:number)=>string} [o.summaryText]
 */
export function createStoryBubbles(g, { mount, speaker, openChronik, lineText, blocked = () => false, suppress = () => false, summaryText = (n) => `${n} neue Chronik-Einträge`, summaryWho = 'merlin' }) {
  const text = lineText || ((line) => (typeof line.t === 'function' ? line.t(g) : line.t));
  const settings = () => g.state.settings;
  const tempo = () => (settings().storyTempo === 'fast' ? 'fast' : 'normal');
  const enabled = () => settings().storyBubbles !== false;
  const layer = h('div', { class: 'sb-layer', 'aria-live': 'polite' });
  mount.append(layer);
  const queue = createBubbleQueue();
  let cur = null;
  let pumpTimer = null;

  // let the toast stack sit on top of the bubbles instead of overlapping them
  const root = document.documentElement;
  const syncHeight = () => root.style.setProperty('--sb-h', layer.offsetHeight ? layer.offsetHeight + 8 + 'px' : '0px');
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(syncHeight).observe(layer);

  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const schedulePump = (ms) => {
    clearTimeout(pumpTimer);
    pumpTimer = setTimeout(pump, ms);
  };

  function pump() {
    if (cur || !queue.length) return;
    if (blocked() || suppress() || document.visibilityState === 'hidden') return schedulePump(800);
    const item = queue.shift();
    if (!enabled()) return pump();
    if (item.kind === 'entry') {
      if (g.state.chronicle.read[item.def.id]) return pump(); // already read in the Chronik
      start(item);
    } else {
      const open = g.storyBubbleBacklog();
      if (!open.length) return pump();
      start({ kind: 'summary', key: 'summary', count: open.length, firstId: open[0].id, ids: open.map((e) => e.id) });
    }
  }

  function message(sp, body, { entry, idx, diary, typing } = {}) {
    const side = sp.side === 'right' ? 'right' : 'left';
    const bubble = h('div', { class: 'sb-bubble' + (diary ? ' diary' : '') }, h('small', { class: 'sb-name', text: sp.name }), typing ? h('span', { class: 'sb-typing', 'aria-label': 'schreibt …' }, h('i'), h('i'), h('i')) : h('span', { class: 'sb-text', text: body }));
    return h('div', { class: `sb-msg side-${side}` + (typing ? ' typing' : ''), role: 'button', tabindex: 0, style: sp.color ? { '--c': sp.color } : null }, sp.avatar(34, entry, idx), bubble);
  }

  function start(item) {
    const close = h('button', { class: 'sb-close', type: 'button', 'aria-label': 'Ausblenden', text: '×' });
    const stack = h('div', { class: 'sb-stack' });
    const el = h('div', { class: 'sb-conv' + (reduced() ? ' reduced' : '') }, h('div', { class: 'sb-top' }, close), stack);
    const c = (cur = { item, el, stack, shown: [], timer: null, linger: null, done: false, lines: [] });
    if (item.kind === 'entry') {
      g.storyBubbleShown(item.def.id);
      c.lines = item.def.lines.map((line, idx) => ({ line, idx }));
    } else {
      for (const id of item.ids) g.storyBubbleShown(id);
      c.lines = [{ summary: true }];
    }
    close.addEventListener('click', () => dismiss(c));
    attachGestures(c);
    layer.append(el);
    step(c);
  }

  function renderLine(c, n) {
    const l = c.lines[n];
    if (l.summary) return message(speaker(summaryWho), summaryText(c.item.count));
    const who = speaker(l.line.who || 'merlin');
    const body = text(l.line);
    const d = c.item.def;
    const diary = isDiaryLine(d, l.line, body);
    return message(who, body, { entry: d, idx: l.idx, diary });
  }

  function step(c) {
    if (cur !== c) return;
    if (c.shown.length >= c.lines.length) {
      c.done = true;
      armLinger(c);
      return;
    }
    const n = c.shown.length;
    const l = c.lines[n];
    const sp = l.summary ? speaker(summaryWho) : speaker(l.line.who || 'merlin');
    const typingEl = message(sp, '', { entry: c.item.def, idx: l.idx, typing: true });
    c.typingEl = typingEl;
    c.stack.append(typingEl);
    refresh(c);
    const delay = l.summary ? 500 : typingDelayMs(text(l.line), tempo(), n === 0);
    c.timer = setTimeout(() => reveal(c), delay);
  }

  function reveal(c) {
    if (cur !== c || c.done) return;
    clearTimeout(c.timer);
    const n = c.shown.length;
    const msg = renderLine(c, n);
    if (c.typingEl) c.typingEl.replaceWith(msg);
    else c.stack.append(msg);
    c.typingEl = null;
    c.shown.push(msg);
    refresh(c);
    step(c);
  }

  function refresh(c) {
    const nodes = [...c.shown, ...(c.typingEl ? [c.typingEl] : [])];
    const st = visibleWindow(nodes.length, MAX_VISIBLE);
    nodes.forEach((n, i) => {
      n.classList.toggle('gone', st[i] === 'gone');
      n.classList.toggle('old', st[i] === 'old');
    });
    c.stack.classList.toggle('clipped', c.stack.scrollHeight > c.stack.clientHeight + 1);
  }

  function armLinger(c) {
    clearTimeout(c.linger);
    c.linger = setTimeout(() => {
      if (blocked()) return armLinger(c);
      dismiss(c);
    }, lingerMs(tempo()));
  }

  function dismiss(c) {
    if (cur !== c) return;
    clearTimeout(c.timer);
    clearTimeout(c.linger);
    cur = null;
    c.el.classList.add('out');
    setTimeout(() => c.el.remove(), reduced() ? 120 : 320);
    schedulePump(420);
  }

  function open(c) {
    const id = c.item.kind === 'entry' ? c.item.def.id : c.item.firstId;
    dismiss(c);
    openChronik(id);
  }

  function tap(c) {
    if (cur !== c) return;
    if (!c.done) reveal(c); // skip the typing delay: show the next line now
    else open(c);
  }

  function attachGestures(c) {
    let p = null;
    c.stack.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.sb-msg')) p = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    c.stack.addEventListener('pointermove', (e) => {
      if (!p || e.pointerId !== p.id) return;
      const dy = e.clientY - p.y;
      if (dy > 8 && dy > Math.abs(e.clientX - p.x)) c.el.style.transform = `translateY(${Math.min(dy, 120)}px)`;
    });
    const end = (e, cancel) => {
      if (!p || e.pointerId !== p.id) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p = null;
      c.el.style.transform = '';
      if (cancel) return;
      if (dy > 36 && dy > Math.abs(dx)) dismiss(c);
      else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) tap(c);
    };
    c.stack.addEventListener('pointerup', (e) => end(e, false));
    c.stack.addEventListener('pointercancel', (e) => end(e, true));
    c.stack.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.sb-msg')) {
        e.preventDefault();
        tap(c);
      }
    });
  }

  /** Queue the entries that were never announced (offline progress, closed bubbles after a reload ...). Several -> one summary. */
  function syncBacklog() {
    if (!enabled()) return;
    const known = new Set([...queue.ids(), cur && cur.item.kind === 'entry' ? cur.item.def.id : null]);
    const open = g.storyBubbleBacklog().filter((e) => !known.has(e.id));
    for (const it of planBacklog(open)) queue.push(it);
    schedulePump(300);
  }

  return {
    el: layer,
    enabled,
    /** a freshly triggered entry; returns false when bubbles are switched off (caller falls back to a toast) */
    push(def) {
      if (!enabled()) return false;
      queue.push({ kind: 'entry', key: def.id, def });
      schedulePump(150);
      return true;
    },
    syncBacklog,
    /** dismiss everything (e.g. setting switched off) */
    clear() {
      queue.clear();
      if (cur) dismiss(cur);
    },
    get active() { return !!cur; },
  };
}
