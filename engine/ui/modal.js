// Modal dialogs without <dialog> (works on every mobile browser) + confirm/alert helpers.
import { h } from './dom.js';

let openCount = 0;

/**
 * @param {{title?:string, body?:Node|string, actions?:Array<{label:string, kind?:string, onClick?:()=>(boolean|void)}>, dismissible?:boolean}} opts
 * An action's onClick may return false to keep the dialog open.
 */
export function openModal({ title = '', body = '', actions = [], dismissible = true } = {}) {
  const overlay = h('div', { class: 'modal-overlay' });
  const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' });
  const bodyEl = h('div', { class: 'modal-body' }, typeof body === 'string' ? h('p', { text: body }) : body);
  const btns = h('div', { class: 'modal-actions' });
  box.append(...(title ? [h('h2', { class: 'modal-title', text: title })] : []), bodyEl, btns);
  overlay.append(box);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    openCount = Math.max(0, openCount - 1);
    if (!openCount) document.body.classList.remove('modal-open');
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && dismissible) close();
  };

  for (const a of actions) {
    const b = h('button', { class: 'btn ' + (a.kind ? 'btn-' + a.kind : ''), type: 'button', text: a.label });
    b.addEventListener('click', () => {
      const r = a.onClick ? a.onClick() : undefined;
      if (r !== false) close();
    });
    btns.append(b);
  }
  if (dismissible) {
    overlay.addEventListener('pointerdown', (e) => {
      if (e.target === overlay) close();
    });
  }
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  document.body.classList.add('modal-open');
  openCount++;
  const first = btns.querySelector('.btn-primary, .btn-danger') || btns.querySelector('button');
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 0);
  return { close, el: box, body: bodyEl };
}

/** Promise<boolean> confirmation. */
export function confirmDialog(message, { title = 'Bist du sicher?', ok = 'Ja', cancel = 'Abbrechen', danger = false } = {}) {
  return new Promise((resolve) => {
    openModal({
      title,
      body: typeof message === 'string' ? h('p', { text: message }) : message,
      dismissible: true,
      actions: [
        { label: cancel, kind: 'ghost', onClick: () => resolve(false) },
        { label: ok, kind: danger ? 'danger' : 'primary', onClick: () => resolve(true) },
      ],
    });
  });
}

export function alertDialog(message, { title = 'Hinweis', ok = 'OK' } = {}) {
  return new Promise((resolve) => {
    openModal({ title, body: message, actions: [{ label: ok, kind: 'primary', onClick: () => resolve() }] });
  });
}
