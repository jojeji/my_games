// Round portrait with a thin ring. Swappable: pass an image URL (webp/png); if it fails to load a text fallback (initial) is shown.
import { h } from './dom.js';

/**
 * @param {{src?:string, name?:string, size?:number, cls?:string, eager?:boolean}} o
 * size = CSS pixels (square). The image is lazy-loaded with fixed width/height and object-fit: cover (see engine.css .avatar).
 */
export function avatar({ src, name = '', size = 40, cls = '', eager = false, onTap = null } = {}) {
  // with onTap the portrait is a real button ("Figur ansehen: <Name>"); pointer/key events stay on it so parents (bubbles) don't react
  const el = onTap
    ? h('button', { class: ('avatar avatar-tap ' + cls).trim(), type: 'button', style: { width: size + 'px', height: size + 'px' }, 'aria-label': 'Figur ansehen: ' + name })
    : h('span', { class: ('avatar ' + cls).trim(), style: { width: size + 'px', height: size + 'px' }, role: 'img', 'aria-label': name });
  if (onTap) {
    for (const t of ['pointerdown', 'pointerup', 'keydown', 'click']) el.addEventListener(t, (e) => e.stopPropagation());
    el.addEventListener('click', (e) => { e.preventDefault(); onTap(el); });
  }
  const fallback = () => {
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
