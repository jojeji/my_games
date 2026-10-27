// Round portrait with a thin ring. Swappable: pass an image URL (webp/png); if it fails to load (or there is none) the emblem is drawn,
// and without an emblem a text fallback (initial). Emblem = inner markup of a 24x24 stroke icon, drawn in `color` (games without photos).
import { h } from './dom.js';

/**
 * @param {{src?:string, emblem?:string, color?:string, name?:string, size?:number, cls?:string, eager?:boolean, onTap?:Function}} o
 * size = CSS pixels (square). The image is lazy-loaded with fixed width/height and object-fit: cover (see engine.css .avatar).
 */
export function avatar({ src, emblem = '', color = '', name = '', size = 40, cls = '', eager = false, onTap = null } = {}) {
  // with onTap the portrait is a real button ("Figur ansehen: <Name>"); pointer/key events stay on it so parents (bubbles) don't react
  const el = onTap
    ? h('button', { class: ('avatar avatar-tap ' + cls).trim(), type: 'button', style: { width: size + 'px', height: size + 'px' }, 'aria-label': 'Figur ansehen: ' + name })
    : h('span', { class: ('avatar ' + cls).trim(), style: { width: size + 'px', height: size + 'px' }, role: 'img', 'aria-label': name });
  if (onTap) {
    for (const t of ['pointerdown', 'pointerup', 'keydown', 'click']) el.addEventListener(t, (e) => e.stopPropagation());
    el.addEventListener('click', (e) => { e.preventDefault(); onTap(el); });
  }
  const fallback = () => {
    if (emblem) {
      // inline SVG from the game's own config (never user input)
      el.replaceChildren();
      el.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${emblem}</svg>`);
      el.classList.add('avatar-emblem');
      if (color) el.style.setProperty('--ec', color);
      return;
    }
    el.replaceChildren(h('b', { class: 'avatar-initial', text: (name || '?').trim()[0] || '?' }));
    el.classList.add('avatar-fallback');
  };
  if (src) {
    const img = h('img', { src, alt: '', width: size, height: size, decoding: 'async', loading: eager ? 'eager' : 'lazy', draggable: false });
    img.addEventListener('error', fallback);
    el.append(img);
  } else fallback();
  return el;
}
