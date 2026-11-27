// Mini-Tastatur: zeigt die gesuchte Taste (Hilfe) und ist in der Bildschirm-Tastatur-Eingabe zugleich spielbar.
import { noteName } from './notes.js';
import { noteColor } from './music.js';

const BLACK = new Set([1, 3, 6, 8, 10]);

/**
 * @param {HTMLElement} host
 * @param {{lo:number, hi:number, labels:boolean, playable:boolean, onKey?:(midi:number)=>void}} opt
 */
export function createKeyboard(host, opt) {
  const wrap = document.createElement('div');
  wrap.className = 'kbd' + (opt.playable ? ' playable' : '');
  host.append(wrap);
  const whites = [];
  for (let m = opt.lo; m <= opt.hi; m++) if (!BLACK.has(m % 12)) whites.push(m);
  const keys = new Map();
  const ww = 100 / whites.length;
  whites.forEach((m, i) => {
    const k = document.createElement('button');
    k.type = 'button';
    k.className = 'key white';
    k.style.left = i * ww + '%';
    k.style.width = ww + '%';
    k.style.setProperty('--c', noteColor(m));
    k.setAttribute('aria-label', noteName(m));
    if (opt.labels) {
      const s = document.createElement('span');
      s.className = 'lbl';
      s.textContent = noteName(m);
      k.append(s);
    }
    if (m === 60) k.classList.add('middle');
    wrap.append(k);
    keys.set(m, k);
  });
  whites.forEach((m, i) => {
    const b = m + 1;
    if (b > opt.hi || !BLACK.has(b % 12)) return;
    const k = document.createElement('button');
    k.type = 'button';
    k.className = 'key black';
    k.style.left = (i + 1) * ww - ww * 0.3 + '%';
    k.style.width = ww * 0.6 + '%';
    k.setAttribute('aria-label', noteName(b));
    wrap.append(k);
    keys.set(b, k);
  });
  if (opt.playable) {
    wrap.addEventListener('pointerdown', (e) => {
      const k = e.target.closest('.key');
      if (!k) return;
      e.preventDefault();
      for (const [m, el] of keys) if (el === k) opt.onKey?.(m);
    });
  }

  let target = null;
  return {
    el: wrap,
    setTarget(midi) {
      if (target !== null) keys.get(target)?.classList.remove('target');
      target = midi;
      if (midi !== null) keys.get(midi)?.classList.add('target');
    },
    flash(midi, cls) {
      const k = keys.get(midi);
      if (!k) return;
      k.classList.remove('good', 'bad');
      void k.offsetWidth;
      k.classList.add(cls);
      setTimeout(() => k.classList.remove(cls), 450);
    },
    mark(midis, cls) {
      for (const [m, k] of keys) k.classList.toggle(cls, midis.includes(m));
    },
  };
}
