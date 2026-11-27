// Notensystem als SVG: Violinschlüssel, Bassschlüssel oder beide (Klaviersystem), Noten mit Farbe/Name/Fingernummer,
// Taktstriche, Lauf von rechts nach links. Welche Zeilen gezeichnet werden, ergibt sich aus den Noten:
// nur ab Mittel-C = Violinschlüssel, nur darunter = Bassschlüssel, beides = zwei Zeilen (rechte Hand oben, linke unten).
import { staffStep, noteColor, fingerOf } from './music.js';
import { noteName, MITTEL_C } from './notes.js';

const NS = 'http://www.w3.org/2000/svg';
const S = 36; // Linienabstand
const NOW_X = 330; // hier steht die aktuelle Note
const GAP = 132; // Abstand je Note
const BEAT_EXTRA = 34; // zusätzlicher Abstand je weiterem Schlag
const MIN_W = 950; // so breit ist der sichtbare Ausschnitt mindestens (Einheiten)
let fadeId = 0;

/** Stufe der untersten Linie relativ zu C4 = 0: Violinschlüssel E4 (2), Bassschlüssel G2 (-10). */
const BASE = { t: 2, b: -10 };

const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.append(e);
  return e;
};

/** Violinschlüssel als Linie, gezeichnet für die unterste Linie bei y = 250 (wird verschoben). */
const TREBLE =
  'M 66 318 C 54 326 44 312 56 304 C 66 298 76 306 72 318 ' +
  'C 68 270 76 160 80 104 C 82 70 104 64 102 92 C 100 126 52 158 44 206 ' +
  'C 38 246 74 262 96 248 C 116 234 108 196 82 198 C 62 200 60 228 78 232';

/** Aufbau je nach Noten: welche Zeilen, wo ihre unterste Linie liegt, Gesamthöhe. */
export function staffLayout(midis, force) {
  const low = midis.some((m) => m < MITTEL_C);
  const high = midis.some((m) => m >= MITTEL_C);
  if ((low && high) || force === 'grand') return { kind: 'grand', H: 580, bottoms: { t: 230, b: 446 }, nameY: 566, fingerY: 40, fingerYL: 524 };
  if (low) return { kind: 'bass', H: 400, bottoms: { b: 250 }, nameY: 372, fingerY: 52 };
  return { kind: 'treble', H: 400, bottoms: { t: 250 }, nameY: 372, fingerY: 52 };
}
/** Zeile für eine Note in diesem Aufbau. */
export const clefFor = (lay, midi) => (lay.kind === 'grand' ? (midi >= MITTEL_C ? 't' : 'b') : lay.kind === 'bass' ? 'b' : 't');

/**
 * @param {HTMLElement} host
 * @param {{notes:{midi:number,beats:number,bar?:boolean}[], help:{colors,names,fingers}, single?:boolean, reveal?:number, fish?:boolean}} opt
 */
export function createStaff(host, opt) {
  const lay = staffLayout(opt.notes.map((n) => n.midi), opt.layout);
  const H = lay.H;
  const yOf = (step, c) => lay.bottoms[c] - (step - BASE[c]) * (S / 2);
  const clefs = Object.keys(lay.bottoms);
  const topY = Math.min(...clefs.map((c) => lay.bottoms[c] - 4 * S));
  const botY = Math.max(...clefs.map((c) => lay.bottoms[c]));

  const svg = el('svg', { class: `staff staff-${lay.kind}` + (opt.reveal ? ' swimming' : ''), viewBox: `0 0 1600 ${H}`, preserveAspectRatio: 'xMinYMid meet', role: 'img', 'aria-label': 'Notenzeile' });
  host.append(svg);
  // Breite des Ausschnitts folgt der Form des Platzes (Höhe fest)
  const fit = () => {
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    let w = (H * r.width) / r.height;
    let vh = H;
    const minW = r.width < 520 ? 720 : MIN_W; // schmale Handys: größer, dafür etwas weniger Noten
    if (w < minW) { vh = (H * minW) / w; w = minW; }
    svg.setAttribute('viewBox', `0 ${Math.round(-(vh - H) / 2)} ${Math.round(w)} ${Math.round(vh)}`);
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
  ro?.observe(host);
  const lines = (x1, x2) => {
    for (const c of clefs) for (let i = 0; i < 5; i++) el('line', { class: 'line', x1, x2, y1: lay.bottoms[c] - i * S, y2: lay.bottoms[c] - i * S }, svg);
  };
  lines(0, 6000);
  el('rect', { class: 'nowband', x: NOW_X - 44, y: topY - 70, width: 88, height: botY - topY + 140, rx: 22 }, svg);
  const track = el('g', { class: 'track' }, svg);
  const ghosts = el('g', { class: 'ghosts' }, svg);
  // Abdeckung links: gespielte Noten verschwinden mit weichem Übergang hinter dem Schlüssel
  el('rect', { x: 0, y: -H, width: 150, height: 3 * H, class: 'clef-bg' }, svg);
  const defs = el('defs', {}, svg);
  const lg = el('linearGradient', { id: 'clef-fade-' + (++fadeId), x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
  el('stop', { offset: 0, 'stop-color': 'var(--staff-bg)', 'stop-opacity': 1 }, lg);
  el('stop', { offset: 1, 'stop-color': 'var(--staff-bg)', 'stop-opacity': 0 }, lg);
  el('rect', { x: 149, y: -H, width: 70, height: 3 * H, fill: `url(#clef-fade-${fadeId})` }, svg);
  lines(0, 150);
  if (lay.bottoms.t) el('path', { d: TREBLE, class: 'clef', transform: `translate(0 ${lay.bottoms.t - 250})` }, svg);
  if (lay.bottoms.b) {
    // Bassschlüssel (F-Schlüssel): Punkt auf der F-Linie, Bogen, zwei Punkte um die F-Linie
    const f = yOf(-4, 'b');
    el('path', { class: 'clef', d: `M 50 ${f - 2} C 54 ${f - 40} 112 ${f - 42} 112 ${f + 4} C 112 ${f + 52} 80 ${f + 92} 40 ${f + 112}` }, svg);
    el('circle', { class: 'clef-dot', cx: 54, cy: f, r: 11 }, svg);
    el('circle', { class: 'clef-dot', cx: 128, cy: f - 18, r: 6 }, svg);
    el('circle', { class: 'clef-dot', cx: 128, cy: f + 18, r: 6 }, svg);
  }
  if (lay.kind === 'grand') el('line', { class: 'brace', x1: 8, x2: 8, y1: topY, y2: botY }, svg);

  const xs = [];
  let x = 0;
  const groups = opt.notes.map((n, i) => {
    xs.push(x);
    const g = drawNote(n, x, { ...opt.help, bubbles: !!opt.reveal, fish: !!opt.fish });
    if (n.bar && !opt.single && i < opt.notes.length - 1) {
      const bx = x + (GAP + (n.beats - 1) * BEAT_EXTRA) / 2 + 6;
      el('line', { class: 'bar', x1: bx, x2: bx, y1: topY, y2: botY }, track);
    }
    x += GAP + (n.beats - 1) * BEAT_EXTRA;
    return g;
  });
  if (!opt.single && opt.notes.length) {
    const ex = xs[xs.length - 1] + GAP * 0.7;
    el('line', { class: 'bar', x1: ex, x2: ex, y1: topY, y2: botY }, track);
    el('line', { class: 'bar end', x1: ex + 10, x2: ex + 10, y1: topY, y2: botY }, track);
  }

  function ledgers(step, c, cx, g) {
    const d = step - BASE[c];
    for (let k = -2; k >= d; k -= 2) el('line', { class: 'ledger', x1: cx - 32, x2: cx + 32, y1: yOf(BASE[c] + k, c), y2: yOf(BASE[c] + k, c) }, g);
    for (let k = 10; k <= d; k += 2) el('line', { class: 'ledger', x1: cx - 32, x2: cx + 32, y1: yOf(BASE[c] + k, c), y2: yOf(BASE[c] + k, c) }, g);
  }

  function drawNote(n, nx, help) {
    const g = el('g', { class: 'note' }, track);
    const { step, sharp } = staffStep(n.midi);
    const c = clefFor(lay, n.midi);
    const cy = yOf(step, c);
    g.style.setProperty('--c', help.colors ? noteColor(n.midi) : 'var(--ink)');
    ledgers(step, c, nx, g);
    const hollow = n.beats >= 2;
    // Hülle für Animationen (Hüpfen, Wackeln): die Schrägstellung des Kopfes bleibt am Kopf selbst
    const hw = el('g', { class: 'hw' }, g);
    el('ellipse', { class: hollow ? 'head hollow' : 'head', cx: nx, cy, rx: 21, ry: 15, transform: `rotate(-20 ${nx} ${cy})` }, hw);
    if (n.beats === 3) el('circle', { class: 'dot', cx: nx + 32, cy: cy - ((step - BASE[c]) % 2 === 0 ? 9 : 0), r: 5 }, g);
    if (help.fish) {
      // Notenfisch: Schwanzflosse rechts (schwimmt nach links), Auge; der Hals fällt weg (für die Tonhöhe egal)
      el('path', { class: 'tail', d: `M${nx + 17},${cy} L${nx + 38},${cy - 13} L${nx + 34},${cy} L${nx + 38},${cy + 13} Z` }, hw);
      el('circle', { class: 'eye', cx: nx - 9, cy: cy - 3, r: 3.2 }, hw);
    } else if (n.beats < 4) {
      const up = step - BASE[c] < 4;
      const sx = up ? nx + 19 : nx - 19;
      el('line', { class: 'stem', x1: sx, x2: sx, y1: cy + (up ? -4 : 4), y2: up ? cy - 118 : cy + 118 }, g);
    }
    if (sharp) el('text', { x: nx - 52, y: cy + 12, class: 'sharp' }, g).textContent = '♯';
    if (help.names) el('text', { x: nx, y: lay.nameY, class: 'name' }, g).textContent = noteName(n.midi);
    if (help.bubbles) for (const [dx, dy, r] of [[30, -14, 6], [42, -38, 4], [34, -60, 3]]) el('circle', { class: 'bub', cx: nx + dx, cy: cy + dy, r }, g);
    const fg = fingerOf(n.midi);
    if (help.fingers && fg) {
      // Klaviersystem: Finger der linken Hand UNTER der Bass-Zeile, damit sie zu ihren Noten gehören
      const t = el('text', { x: nx, y: n.midi < MITTEL_C && lay.fingerYL ? lay.fingerYL : lay.fingerY, class: 'finger' + (n.midi < MITTEL_C ? ' left' : '') }, g);
      t.textContent = fg;
    }
    return g;
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
          g.style.animationDelay = instant ? (k - i) * 0.45 + 's' : '0s';
          g.classList.add('arrive');
          setTimeout(() => g.classList.remove('arrive'), 2600 + (instant ? (k - i) * 450 : 0));
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
    const c = clefFor(lay, midi);
    const g = el('g', { class: 'ghost' }, ghosts);
    const cy = yOf(step, c);
    ledgers(step, c, NOW_X + 46, g);
    el('ellipse', { cx: NOW_X + 46, cy, rx: 20, ry: 15, transform: `rotate(-20 ${NOW_X + 46} ${cy})` }, g);
    if (sharp) el('text', { x: NOW_X + 6, y: cy + 12, class: 'sharp' }, g).textContent = '♯';
    el('text', { x: NOW_X + 46, y: lay.nameY - 4, class: 'ghost-name' }, g).textContent = noteName(midi);
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
  return { svg, layout: lay, setIndex, ghost, clearGhost: () => ghosts.replaceChildren(), pop, groups, head, wave, shake, destroy: () => ro?.disconnect() };
}
