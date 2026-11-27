// Notensystem als SVG: Violinschlüssel, Noten mit Farbe/Name/Fingernummer, Taktstriche, Lauf von rechts nach links.
import { staffStep, noteColor, fingerOf } from './music.js';
import { noteName } from './notes.js';

const NS = 'http://www.w3.org/2000/svg';
const S = 36; // Linienabstand
const BOTTOM = 250; // y der untersten Linie (E4)
const H = 400;
const NOW_X = 330; // hier steht die aktuelle Note
const GAP = 132; // Abstand je Note
const BEAT_EXTRA = 34; // zusätzlicher Abstand je weiterem Schlag
const MIN_W = 950;
let fadeId = 0; // so breit ist der sichtbare Ausschnitt mindestens (Einheiten)

const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.append(e);
  return e;
};
export const stepY = (step) => BOTTOM - (step - 2) * (S / 2);

/** Violinschlüssel als Linie (gezeichnet um die G-Linie y = stepY(4)). */
const CLEF =
  'M 66 318 C 54 326 44 312 56 304 C 66 298 76 306 72 318 ' +
  'C 68 270 76 160 80 104 C 82 70 104 64 102 92 C 100 126 52 158 44 206 ' +
  'C 38 246 74 262 96 248 C 116 234 108 196 82 198 C 62 200 60 228 78 232';

/**
 * @param {HTMLElement} host
 * @param {{notes:{midi:number,beats:number,bar?:boolean}[], help:{colors,names,fingers}, single?:boolean}} opt
 */
export function createStaff(host, opt) {
  const svg = el('svg', { class: 'staff' + (opt.reveal ? ' swimming' : ''), viewBox: `0 0 1600 ${H}`, preserveAspectRatio: 'xMinYMid meet', role: 'img', 'aria-label': 'Notenzeile' });
  host.append(svg);
  // Breite des Ausschnitts folgt der Form des Platzes (Höhe ist fest 400 Einheiten)
  const fit = () => {
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    // mindestens MIN_W Einheiten breit: auf schmalen Flächen (hochkant) wird die Zeile kleiner, zeigt aber mehr Noten
    let w = (H * r.width) / r.height;
    let vh = H;
    const minW = r.width < 520 ? 720 : MIN_W; // schmale Handys: größer, dafür etwas weniger Noten
    if (w < minW) { vh = (H * minW) / w; w = minW; }
    svg.setAttribute('viewBox', `0 ${Math.round(-(vh - H) / 2)} ${Math.round(w)} ${Math.round(vh)}`);
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
  ro?.observe(host);
  for (let i = 0; i < 5; i++) el('line', { class: 'line', x1: 0, x2: 6000, y1: BOTTOM - i * S, y2: BOTTOM - i * S }, svg);
  el('rect', { class: 'nowband', x: NOW_X - 44, y: 40, width: 88, height: 340, rx: 22 }, svg);
  const track = el('g', { class: 'track' }, svg);
  const ghosts = el('g', { class: 'ghosts' }, svg);
  // Abdeckung links: gespielte Noten verschwinden hinter dem Schlüssel
  el('rect', { x: 0, y: -H, width: 150, height: 3 * H, class: 'clef-bg' }, svg);
  // weicher Übergang statt harter Kante, an der gespielte Noten verschwinden
  const defs = el('defs', {}, svg);
  const lg = el('linearGradient', { id: 'clef-fade-' + (++fadeId), x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
  el('stop', { offset: 0, 'stop-color': 'var(--staff-bg)', 'stop-opacity': 1 }, lg);
  el('stop', { offset: 1, 'stop-color': 'var(--staff-bg)', 'stop-opacity': 0 }, lg);
  el('rect', { x: 149, y: -H, width: 70, height: 3 * H, fill: `url(#clef-fade-${fadeId})` }, svg);
  for (let i = 0; i < 5; i++) el('line', { class: 'line', x1: 0, x2: 150, y1: BOTTOM - i * S, y2: BOTTOM - i * S }, svg);
  el('path', { d: CLEF, class: 'clef' }, svg);

  const xs = [];
  let x = 0;
  const groups = opt.notes.map((n, i) => {
    xs.push(x);
    const g = drawNote(n, x, { ...opt.help, bubbles: !!opt.reveal }, track);
    if (n.bar && !opt.single && i < opt.notes.length - 1) {
      const bx = x + (GAP + (n.beats - 1) * BEAT_EXTRA) / 2 + 6;
      el('line', { class: 'bar', x1: bx, x2: bx, y1: BOTTOM - 4 * S, y2: BOTTOM }, track);
    }
    x += GAP + (n.beats - 1) * BEAT_EXTRA;
    return g;
  });
  if (!opt.single && opt.notes.length) {
    const ex = xs[xs.length - 1] + GAP * 0.7;
    el('line', { class: 'bar', x1: ex, x2: ex, y1: BOTTOM - 4 * S, y2: BOTTOM }, track);
    el('line', { class: 'bar end', x1: ex + 10, x2: ex + 10, y1: BOTTOM - 4 * S, y2: BOTTOM }, track);
  }

  function setIndex(i, instant = false) {
    groups.forEach((g, k) => {
      g.classList.toggle('done', k < i);
      g.classList.toggle('now', k === i);
      if (opt.reveal) {
        // Notenspiel: nur `reveal` Noten sind zu sehen; jede neue schwimmt langsam von rechts heran
        const far = k > i + opt.reveal - 1;
        if (!far && (g.classList.contains('far') || (instant && k === i))) {
          g.classList.remove('far');
          g.classList.remove('arrive');
          void g.getBoundingClientRect();
          g.classList.add('arrive');
          setTimeout(() => g.classList.remove('arrive'), 2600);
        } else if (far) g.classList.add('far');
      }
    });
    const target = NOW_X - (xs[Math.min(i, xs.length - 1)] ?? 0) - (i >= xs.length ? GAP : 0);
    track.style.transition = instant ? 'none' : '';
    track.style.transform = `translateX(${target}px)`;
  }

  function ghost(midi) {
    ghosts.replaceChildren(); // immer nur eine Geisternote
    const { step, sharp } = staffStep(midi);
    const g = el('g', { class: 'ghost' }, ghosts);
    const cy = stepY(step);
    ledgers(step, NOW_X + 46, g);
    el('ellipse', { cx: NOW_X + 46, cy, rx: 20, ry: 15, transform: `rotate(-20 ${NOW_X + 46} ${cy})` }, g);
    if (sharp) el('text', { x: NOW_X + 6, y: cy + 12, class: 'sharp' }, g).textContent = '♯';
    const t = el('text', { x: NOW_X + 46, y: 368, class: 'ghost-name' }, g);
    t.textContent = noteName(midi);
    setTimeout(() => g.remove(), 1400);
  }

  function pop(i) {
    const g = groups[i];
    if (!g) return;
    g.classList.remove('pop');
    void g.getBoundingClientRect(); // Neustart der Animation erzwingen
    g.classList.add('pop');
  }

  setIndex(0, true);
  fit();
  /** Kopf der Note i (für Funken und Effekte). */
  const head = (i) => groups[i]?.querySelector('.head') || null;
  /** Alle Noten hüpfen nacheinander (Abschluss eines Stücks). */
  function wave() {
    groups.forEach((g, k) => setTimeout(() => { g.classList.remove('pop'); void g.getBoundingClientRect(); g.classList.add('pop'); }, k * 45));
  }
  function shake() {
    svg.classList.remove('shake');
    void svg.getBoundingClientRect();
    svg.classList.add('shake');
  }
  return { svg, setIndex, ghost, clearGhost: () => ghosts.replaceChildren(), pop, groups, head, wave, shake, destroy: () => ro?.disconnect() };
}

function ledgers(step, cx, g) {
  for (let s = 0; s >= step; s -= 2) el('line', { class: 'ledger', x1: cx - 32, x2: cx + 32, y1: stepY(s), y2: stepY(s) }, g);
  for (let s = 12; s <= step; s += 2) el('line', { class: 'ledger', x1: cx - 32, x2: cx + 32, y1: stepY(s), y2: stepY(s) }, g);
}

function drawNote(n, x, help, parent) {
  const g = el('g', { class: 'note' }, parent);
  const { step, sharp } = staffStep(n.midi);
  const cy = stepY(step);
  const color = help.colors ? noteColor(n.midi) : 'var(--ink)';
  g.style.setProperty('--c', color);
  ledgers(step, x, g);
  const hollow = n.beats >= 2;
  // Hülle für Animationen (Hüpfen, Wackeln): die Schrägstellung des Kopfes bleibt am Kopf selbst
  const hw = el('g', { class: 'hw' }, g);
  el('ellipse', { class: hollow ? 'head hollow' : 'head', cx: x, cy, rx: 21, ry: 15, transform: `rotate(-20 ${x} ${cy})` }, hw);
  if (n.beats === 3) el('circle', { class: 'dot', cx: x + 32, cy: cy - (step % 2 === 0 ? 9 : 0), r: 5 }, g);
  if (n.beats < 4) {
    const up = step < 6;
    const sx = up ? x + 19 : x - 19;
    el('line', { class: 'stem', x1: sx, x2: sx, y1: cy + (up ? -4 : 4), y2: up ? cy - 118 : cy + 118 }, g);
  }
  if (sharp) el('text', { x: x - 52, y: cy + 12, class: 'sharp' }, g).textContent = '♯';
  if (help.names) {
    const t = el('text', { x, y: 372, class: 'name' }, g);
    t.textContent = noteName(n.midi);
  }
  if (help.bubbles) for (const [dx, dy, r] of [[30, -14, 6], [42, -38, 4], [34, -60, 3]]) el('circle', { class: 'bub', cx: x + dx, cy: cy + dy, r }, g);
  const f = fingerOf(n.midi);
  if (help.fingers && f) {
    const t = el('text', { x, y: 52, class: 'finger' }, g);
    t.textContent = f;
  }
  return g;
}
