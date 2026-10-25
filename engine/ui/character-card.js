// Character card: large portrait, name in the speaker colour, role, short bio, optional row of age stages. Game-agnostic:
// the game passes plain data. Opens as a modal on top of whatever is open (e.g. a story dialog) and returns to it on close.
import { h } from './dom.js';
import { openModal } from './modal.js';
import { avatar } from './avatar.js';

/**
 * @param {{name:string, color?:string, role?:string, bio?:string, img?:string, stages?:Array<{img:string, sm?:string, age?:number, current?:boolean}>}} info
 * @param {{returnFocus?:Element|null}} [opts]
 */
export function openCharacterCard(info, { returnFocus = document.activeElement } = {}) {
  const size = Math.max(160, Math.min(280, Math.round(window.innerWidth * 0.7)));
  const stages = info.stages || [];
  let cur = Math.max(0, stages.findIndex((s) => s.current));
  const big = h('div', { class: 'cc-big' });
  const caption = h('small', { class: 'cc-caption muted' });
  const thumbs = [];
  const showStage = (i) => {
    cur = i;
    const s = stages[i];
    big.replaceChildren(avatar({ src: s.img, name: info.name, size, cls: 'avatar-xl', eager: true }));
    caption.textContent = s.age ? `Etwa ${s.age} Jahre` : '';
    thumbs.forEach((t, k) => { t.classList.toggle('sel', k === i); t.setAttribute('aria-pressed', String(k === i)); });
  };
  if (stages.length) big.append(avatar({ src: stages[cur].img, name: info.name, size, cls: 'avatar-xl', eager: true }));
  else big.append(avatar({ src: info.img, name: info.name, size, cls: 'avatar-xl', eager: true }));

  let row = null;
  if (stages.length > 1) {
    row = h('div', { class: 'cc-stages', role: 'group', 'aria-label': 'Lebensalter' });
    stages.forEach((s, i) => {
      const t = h('button', { class: 'cc-stage' + (s.current ? ' cur' : ''), type: 'button', 'aria-label': `Alter ${s.age ? 'etwa ' + s.age : ''}${s.current ? ' (jetzt)' : ''}` },
        avatar({ src: s.sm || s.img, name: '', size: 40 }), h('small', { text: s.age ? 'etwa ' + s.age : '' }));
      t.querySelector('.avatar').removeAttribute('role');
      t.querySelector('.avatar').removeAttribute('aria-label');
      t.addEventListener('click', () => showStage(i));
      thumbs.push(t);
      row.append(t);
    });
  }

  let pushed = false;
  let fromPop = false;
  const body = h('div', { class: 'cc', style: { '--c': info.color || 'var(--accent)' } },
    big,
    h('b', { class: 'cc-name', text: info.name }),
    info.role ? h('span', { class: 'cc-role', text: info.role }) : null,
    stages.length > 1 ? caption : null,
    row,
    info.bio ? h('p', { class: 'cc-bio', text: info.bio }) : null);
  const modal = openModal({
    body, actions: [{ label: 'Schließen', kind: 'primary' }],
    onClose: () => {
      window.removeEventListener('popstate', onPop);
      if (pushed && !fromPop) { try { history.back(); } catch { /* ignore */ } }
      if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
    },
  });
  modal.el.classList.add('cc-modal');
  modal.el.setAttribute('aria-label', info.name);
  if (stages.length) showStage(cur);
  // browser/phone back closes the card first
  function onPop() { fromPop = true; modal.close(); }
  try { history.pushState({ card: 1 }, ''); pushed = true; window.addEventListener('popstate', onPop); } catch { /* ignore */ }
  return modal;
}
