// Psst! Kartenprüfung. Plain ES module, no dependencies, all paths relative.
// Lädt ../data/packs/<pack>.json (?pack=start|mix1|...), der Besitzer entscheidet pro Karte
// (Behalten / Verwerfen / Bearbeiten) per Knopf oder Wischen. Entscheidungen liegen in localStorage,
// der Export ist ein Textcode PSSTREVIEW1.<base64(JSON)>, den man in den Chat einfügt.
// Optional: ../data/assoc-report.json (tools/psst-data/assoc.mjs) zeigt pro Karte, wie gut die Tabuwörter zu menschlichen Assoziationen passen,
// und bietet häufig genannte, fehlende Wörter zum Übernehmen an (landet als normale Bearbeitung im Export).

const CODE_PREFIX = 'PSSTREVIEW1.';
const TABU_COUNT = 5;
const SWIPE_AT = 90;
const app = document.getElementById('app');

const params = new URLSearchParams(location.search);
const packId = (params.get('pack') || 'start').replace(/[^a-z0-9-]/gi, '');
const storeKey = `psst-review-v1:${packId}`;

// ---------------------------------------------------------------- Helfer
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

function loadStore() {
  try {
    const s = JSON.parse(localStorage.getItem(storeKey) || 'null');
    if (s && typeof s === 'object') return { dec: s.dec || {}, edits: s.edits || {}, pos: s.pos | 0, sort: s.sort };
  } catch { /* private mode or broken value */ }
  return { dec: {}, edits: {}, pos: 0 };
}
let memoryOnly = false;
function saveStore() {
  try { localStorage.setItem(storeKey, JSON.stringify(state)); memoryOnly = false; } catch { memoryOnly = true; }
}

const b64 = {
  enc: s => btoa(String.fromCharCode(...new TextEncoder().encode(s))),
  dec: s => new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0))),
};

// ---------------------------------------------------------------- Zustand
let cards = [];      // in der gewählten Reihenfolge
let allCards = [];   // Reihenfolge der Datei (Export, Fortschritt der alten Prüfungen)
let report = null;   // assoc-report.json (optional)
let sortMode = 'orig'; // orig | weak
let index = null;
let state = loadStore();
let cur = 0;
let mode = 'card'; // card | edit | end | export
let toastTimer = 0;

const cardOf = i => {
  const c = cards[i];
  const e = state.edits[c.id];
  return e ? { ...c, w: e.w, t: e.t } : c;
};
const counts = () => {
  let keep = 0, drop = 0;
  for (const c of cards) { const d = state.dec[c.id]; if (d === 'keep') keep++; else if (d === 'drop') drop++; }
  return { keep, drop, open: cards.length - keep - drop };
};
// ---------------------------------------------------------------- Assoziationen
const lc = x => String(x).toLowerCase();
const assocOf = id => (report && report.cards && report.cards[id]) || null;
/** Treffer nach dem aktuellen Stand der Karte: unveränderte Treffer plus übernommene fehlende Wörter. */
function assocScore(orig, now) {
  const a = assocOf(orig.id);
  if (!a || !a.covered) return null;
  const weak = new Set(a.weak.map(lc)), miss = new Set(a.missing.map(lc));
  const good = new Set(orig.t.filter(t => !weak.has(lc(t))).map(lc));
  return now.t.filter(t => good.has(lc(t)) || miss.has(lc(t))).length;
}
const weakFirstKey = c => {
  const a = assocOf(c.id);
  return a && a.covered ? a.score : 99;
};
function orderCards() {
  const list = allCards.map((c, i) => ({ c, i }));
  if (sortMode === 'weak') {
    list.sort((x, y) => weakFirstKey(x.c) - weakFirstKey(y.c) || (((assocOf(y.c.id)?.missing || []).length) - ((assocOf(x.c.id)?.missing || []).length)) || x.i - y.i);
  }
  cards = list.map(x => x.c);
}
const hasAssoc = () => !!report && allCards.some(c => assocOf(c.id)?.covered);
function setSort(next) {
  sortMode = next;
  state.sort = next;
  orderCards();
  cur = Math.min(firstOpen(), Math.max(cards.length - 1, 0));
  state.pos = cur;
  saveStore();
  mode = 'card';
  render();
}

const firstOpen = () => { const i = cards.findIndex(c => !state.dec[c.id]); return i < 0 ? cards.length : i; };

function decide(kind) {
  const c = cards[cur];
  if (!c) return;
  state.dec[c.id] = kind;
  cur += 1;
  state.pos = cur;
  saveStore();
  mode = cur >= cards.length ? 'end' : 'card';
  render();
}
function back() {
  cur = Math.max(0, cur - 1);
  state.pos = cur;
  saveStore();
  mode = 'card';
  render();
}
function toast(msg) {
  document.querySelector('.rv-toast')?.remove();
  const t = h('div', { class: 'rv-toast', role: 'status', text: msg });
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2200);
}

// ---------------------------------------------------------------- Export
function buildPayload() {
  const keep = [], drop = [], edit = {};
  for (const c of allCards) {
    const d = state.dec[c.id];
    if (d === 'keep') keep.push(c.id);
    else if (d === 'drop') drop.push(c.id);
    const e = state.edits[c.id];
    if (e && d !== 'drop') edit[c.id] = { w: e.w, t: e.t };
  }
  return { pack: packId, keep, drop, edit };
}
const exportCode = () => CODE_PREFIX + b64.enc(JSON.stringify(buildPayload()));

async function copyText(text, area) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { /* fall through */ }
  try {
    area.focus(); area.select(); area.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch { return false; }
}

// ---------------------------------------------------------------- Ansichten
function header() {
  const sel = h('select', { 'aria-label': 'Kartenpaket wählen', onchange: e => { location.search = '?pack=' + e.target.value; } },
    (index ? index.packs : [{ id: packId, name: packId }]).map(p => h('option', { value: p.id, selected: p.id === packId }, `${p.name} (${p.count ?? '?'})`)));
  const c = counts();
  const done = c.keep + c.drop;
  const shown = Math.min(cur + 1, cards.length);
  return [
    h('div', { class: 'rv-top' }, h('h1', { text: 'Karten prüfen' }), sel),
    h('div', { class: 'rv-progress' },
      h('div', { class: 'rv-count', 'aria-live': 'polite' },
        h('span', {}, h('b', { class: 'num', text: `${mode === 'end' ? cards.length : shown} / ${cards.length}` })),
        h('span', { class: 'num', text: `${c.keep} behalten · ${c.drop} verworfen · ${c.open} offen` })),
      h('div', { class: 'rv-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': cards.length, 'aria-valuenow': done },
        h('i', { class: 'k', style: `width:${(c.keep / cards.length) * 100}%` }),
        h('i', { class: 'd', style: `width:${(c.drop / cards.length) * 100}%` }))),
  ];
}

/** Übernimmt ein häufig genanntes, fehlendes Wort anstelle des schwächsten Tabuworts (als normale Bearbeitung). */
function takeOver(word) {
  const c = cardOf(cur);
  if (c.t.some(t => lc(t) === lc(word))) return;
  const weak = new Set((assocOf(c.id)?.weak || []).map(lc));
  let idx = -1;
  for (let i = c.t.length - 1; i >= 0; i--) if (weak.has(lc(c.t[i]))) { idx = i; break; }
  if (idx < 0) idx = c.t.length - 1;
  const old = c.t[idx];
  const t = c.t.slice();
  t[idx] = word;
  const orig = cards[cur];
  if (t.every((x, i) => x === orig.t[i]) && c.w === orig.w) delete state.edits[c.id];
  else state.edits[c.id] = { w: c.w, t };
  saveStore();
  toast(`${word} statt ${old}`);
  render();
}

function assocBlock(c) {
  const a = assocOf(c.id);
  if (!a || !a.covered) return null;
  const left = a.missing.filter(m => !c.t.some(t => lc(t) === lc(m)));
  const edited = !!state.edits[c.id];
  if (!left.length && !edited) return null;
  return h('div', { class: 'rv-assoc' },
    left.length > 0 && h('div', { class: 'rv-assoc-h', text: 'Häufig genannt, fehlt:' }),
    left.length > 0 && h('div', { class: 'rv-assoc-b' }, left.map(m =>
      h('button', { class: 'rv-take', type: 'button', onclick: () => takeOver(m) }, m, h('small', { text: 'übernehmen' })))),
    edited && h('button', { class: 'rv-undo', type: 'button', onclick: () => { delete state.edits[c.id]; saveStore(); render(); } }, '↶ Original wiederherstellen'));
}

function cardView() {
  const c = cardOf(cur);
  const orig = cards[cur];
  const dec = state.dec[c.id];
  const edited = !!state.edits[c.id];
  const a = assocOf(c.id);
  const weak = new Set(a && a.covered ? a.weak.map(lc) : []);
  const score = assocScore(orig, c);
  const stampK = h('div', { class: 'rv-stamp k', text: 'BEHALTEN' });
  const stampD = h('div', { class: 'rv-stamp d', text: 'VERWERFEN' });
  const el = h('div', { class: 'rv-card' + (dec ? ' ' + dec : ''), 'data-id': c.id },
    stampK, stampD,
    h('div', { class: 'rv-meta' },
      h('span', { class: 'rv-chip', text: `Stufe ${c.d}` }),
      h('span', { class: 'rv-chip', text: `Quelle ${c.src}` }),
      dec === 'keep' && h('span', { class: 'rv-chip keep', text: 'behalten' }),
      dec === 'drop' && h('span', { class: 'rv-chip drop', text: 'verworfen' }),
      edited && h('span', { class: 'rv-chip edit', text: 'bearbeitet' }),
      report && (score == null
        ? h('span', { class: 'rv-chip assoc none', text: 'Assoziationen: keine Daten' })
        : h('span', { class: `rv-chip assoc ${score <= 1 ? 'low' : score <= 3 ? 'mid' : 'high'}`, text: `Assoziationen: ${score}/5` }))),
    h('div', { class: 'rv-word', text: c.w }),
    h('div', { class: 'rv-sep' }),
    h('ul', { class: 'rv-tabu', 'aria-label': 'Tabuwörter' }, c.t.map(t => h('li', { class: weak.has(lc(t)) ? 'weak' : null, text: t }))),
    assocBlock(c),
    h('div', { class: 'rv-hint', text: 'Wischen: → behalten, ← verwerfen' + (weak.size ? ' · gestrichelt: kein Treffer' : '') }));
  attachSwipe(el, stampK, stampD);
  return el;
}

function attachSwipe(el, stampK, stampD) {
  let x0 = null, y0 = 0, dx = 0, locked = false, pid = null;
  const reset = animate => {
    el.classList.toggle('anim', animate);
    el.style.transform = '';
    el.style.opacity = '';
    stampK.style.opacity = stampD.style.opacity = 0;
  };
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; locked = false; pid = e.pointerId;
    el.classList.remove('anim');
  });
  el.addEventListener('pointermove', e => {
    if (x0 == null || e.pointerId !== pid) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!locked && Math.abs(my) > 14 && Math.abs(my) > Math.abs(mx)) { x0 = null; reset(true); return; } // vertikal = Scrollen
    if (!locked && Math.abs(mx) > 8) { locked = true; try { el.setPointerCapture(pid); } catch { /* ignore */ } }
    if (!locked) return;
    dx = mx;
    el.style.transform = `translateX(${dx}px) rotate(${dx / 22}deg)`;
    const k = Math.min(1, Math.abs(dx) / SWIPE_AT);
    stampK.style.opacity = dx > 0 ? k : 0;
    stampD.style.opacity = dx < 0 ? k : 0;
  });
  const end = e => {
    if (x0 == null || e.pointerId !== pid) return;
    const moved = dx;
    x0 = null;
    if (locked && Math.abs(moved) >= SWIPE_AT) {
      el.classList.add('anim');
      el.style.transform = `translateX(${moved > 0 ? 700 : -700}px) rotate(${moved > 0 ? 25 : -25}deg)`;
      el.style.opacity = '0';
      setTimeout(() => decide(moved > 0 ? 'keep' : 'drop'), 180);
    } else reset(true);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

function actionBar() {
  return h('div', {},
    h('div', { class: 'rv-actions' },
      h('button', { class: 'rv-btn drop', type: 'button', onclick: () => decide('drop') }, '✕ Verwerfen', h('small', { text: '← links' })),
      h('button', { class: 'rv-btn edit', type: 'button', onclick: () => { mode = 'edit'; render(); } }, '✎ Bearbeiten', h('small', { text: 'dann behalten' })),
      h('button', { class: 'rv-btn keep', type: 'button', onclick: () => decide('keep') }, '✓ Behalten', h('small', { text: 'rechts →' }))),
    h('div', { class: 'rv-row', style: 'margin-top:10px' },
      h('button', { class: 'rv-btn', type: 'button', disabled: cur === 0, onclick: back }, '↶ Zurück'),
      hasAssoc() && h('button', { class: 'rv-btn', type: 'button', 'aria-label': sortMode === 'weak' ? 'Reihenfolge: schwächste zuerst, tippen für Originalreihenfolge' : 'Reihenfolge: Original, tippen für schwächste zuerst', onclick: () => setSort(sortMode === 'weak' ? 'orig' : 'weak') },
        '⇅ Reihenfolge', h('small', { text: sortMode === 'weak' ? 'Schwächste' : 'Original' })),
      h('button', { class: 'rv-btn', type: 'button', onclick: () => { mode = 'export'; render(); } }, '⇪ Export')));
}

function editView() {
  const c = cardOf(cur);
  const inputs = [];
  const mk = (label, val, id) => {
    const inp = h('input', { type: 'text', value: val, id, autocomplete: 'off', autocapitalize: 'sentences', spellcheck: 'false', enterkeyhint: 'next' });
    inputs.push(inp);
    return h('div', {}, h('label', { for: id, text: label }), inp);
  };
  const err = h('div', { class: 'rv-err', 'aria-live': 'polite' });
  const save = () => {
    const w = inputs[0].value.trim().replace(/\s+/g, ' ');
    const t = inputs.slice(1).map(i => i.value.trim().replace(/\s+/g, ' '));
    inputs.forEach(i => i.classList.remove('bad'));
    const bad = [];
    if (!w) bad.push(0);
    t.forEach((x, i) => { if (!x) bad.push(i + 1); });
    const lower = t.map(x => x.toLowerCase());
    lower.forEach((x, i) => { if (x && lower.indexOf(x) !== i) bad.push(i + 1); });
    if (bad.length) {
      bad.forEach(i => inputs[i].classList.add('bad'));
      err.textContent = 'Alle sechs Felder ausfüllen, Tabuwörter dürfen sich nicht doppeln.';
      return;
    }
    const orig = cards[cur];
    if (w === orig.w && t.every((x, i) => x === orig.t[i])) delete state.edits[orig.id];
    else state.edits[orig.id] = { w, t };
    decide('keep');
  };
  const form = h('div', { class: 'rv-edit' },
    mk('Suchbegriff', c.w, 'ed-w'),
    ...c.t.map((t, i) => mk(`Tabuwort ${i + 1}`, t, `ed-t${i}`)),
    err);
  return { form, actions: h('div', { class: 'rv-row' },
    h('button', { class: 'rv-btn', type: 'button', onclick: () => { mode = 'card'; render(); } }, 'Abbrechen'),
    h('button', { class: 'rv-btn primary', type: 'button', onclick: save }, 'Speichern & behalten')) };
}

function exportPanel(final) {
  const c = counts();
  const code = exportCode();
  const area = h('textarea', { readonly: true, rows: 5, 'aria-label': 'Exportcode', onfocus: e => e.target.select() }, code);
  area.value = code;
  const copy = h('button', { class: 'rv-btn primary', type: 'button', onclick: async () => {
    toast((await copyText(code, area)) ? 'Code kopiert' : 'Kopieren nicht möglich, Text markieren und manuell kopieren');
  } }, '⧉ Code kopieren');
  return h('div', { class: 'rv-panel' },
    h('h2', { text: final ? 'Geschafft!' : 'Export' }),
    h('div', { class: 'rv-stats' },
      h('span', { class: 'num', text: `${c.keep} behalten` }), h('span', { class: 'num', text: `${c.drop} verworfen` }),
      h('span', { class: 'num', text: `${Object.keys(state.edits).length} bearbeitet` }), h('span', { class: 'num', text: `${c.open} offen` })),
    c.open > 0 && h('p', { class: 'warn small', text: `${c.open} Karten sind noch nicht entschieden. Sie werden im Export nicht erwähnt und bleiben unverändert.` }),
    h('p', { class: 'small muted', text: 'Diesen Code kopieren und im Chat einfügen. Er enthält nur deine Entscheidungen, keine Kartentexte außer Änderungen.' }),
    area, copy,
    memoryOnly && h('p', { class: 'warn small', text: 'Hinweis: Der Browser speichert hier nicht. Bitte jetzt exportieren, sonst gehen die Entscheidungen verloren.' }),
    h('div', { class: 'rv-row' },
      h('button', { class: 'rv-btn', type: 'button', onclick: () => { mode = 'card'; cur = Math.min(cur, cards.length - 1); render(); } }, '↶ Weiter prüfen'),
      h('button', { class: 'rv-btn', type: 'button', onclick: () => {
        if (confirm('Alle Entscheidungen dieses Pakets löschen?')) { state = { dec: {}, edits: {}, pos: 0 }; saveStore(); cur = 0; mode = 'card'; render(); }
      } }, 'Zurücksetzen')));
}

function render() {
  document.querySelector('.rv-toast')?.remove();
  const kids = [];
  if (!cards.length) {
    app.replaceChildren(h('p', { class: 'error center', style: 'padding:32px', text: `Paket „${packId}“ nicht gefunden.` }));
    return;
  }
  kids.push(...header());
  if (mode === 'card') {
    kids.push(h('div', { class: 'rv-stage' }, cardView()), actionBar());
  } else if (mode === 'edit') {
    const { form, actions } = editView();
    kids.push(h('div', { class: 'rv-stage' }, h('div', { class: 'rv-card' },
      h('div', { class: 'rv-meta', text: `Karte ${cur + 1} bearbeiten` }), form)), actions);
  } else {
    kids.push(exportPanel(mode === 'end'));
  }
  app.replaceChildren(...kids);
  if (mode === 'edit') document.getElementById('ed-w')?.focus({ preventScroll: true });
}

document.addEventListener('keydown', e => {
  if (mode !== 'card' || e.target.matches?.('input, textarea, select')) return;
  if (e.key === 'ArrowRight') decide('keep');
  else if (e.key === 'ArrowLeft') decide('drop');
  else if (e.key === 'Backspace' || e.key === 'ArrowUp') back();
  else if (e.key === 'e') { mode = 'edit'; render(); e.preventDefault(); }
});

// ---------------------------------------------------------------- Start
async function boot() {
  try {
    const [pk, idx, rep] = await Promise.all([
      fetch(`../data/packs/${packId}.json`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch('../data/packs.json').then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch('../data/assoc-report.json').then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    allCards = pk;
    index = idx;
    report = rep && rep.cards ? rep : null;
  } catch {
    allCards = [];
  }
  // Reihenfolge: gespeicherte Wahl; sonst "Schwächste zuerst" für alle Pakete außer start (dort läuft die Prüfung in Dateireihenfolge)
  // und für Pakete, in denen schon in Dateireihenfolge entschieden wurde.
  const started = Object.keys(state.dec).length > 0;
  sortMode = state.sort === 'weak' || state.sort === 'orig' ? state.sort : (packId === 'start' || started || !hasAssoc() ? 'orig' : 'weak');
  if (!hasAssoc()) sortMode = 'orig';
  state.sort = sortMode; // wird beim nächsten Speichern mitgeschrieben, damit die gemerkte Position zur Reihenfolge passt
  orderCards();
  const open = firstOpen();
  cur = Math.min(Math.max(state.pos, 0), cards.length ? cards.length - 1 : 0);
  // beim Öffnen zur ersten offenen Karte springen, falls die gemerkte Position schon entschieden ist
  if (cards.length && state.dec[cards[cur].id]) cur = Math.min(open, cards.length - 1);
  mode = 'card';
  if (cards.length && open >= cards.length) { cur = cards.length; mode = 'end'; }
  render();
}
boot();
