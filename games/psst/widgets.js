// Small UI building blocks (DOM helpers on top of engine/ui/dom.js).
import { h } from '../../engine/ui/dom.js';

export const icon = (name) =>
  ({
    back: '‹',
    flag: '⚑',
    check: '✓',
    pause: 'Ⅱ',
  })[name] || '';

/** Top bar with a back button and a title. */
export function topbar(title, onBack, right = null) {
  return h('header', { class: 'topbar' },
    onBack ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Zurück', onClick: onBack, text: '‹' }) : h('span', { class: 'icon-btn ghost' }),
    h('h1', { text: title }),
    right || h('span', { class: 'icon-btn ghost' }),
  );
}

/** Segmented choice. options: [{value,label}] */
export function segmented(options, value, onChange, { label = '', cls = '' } = {}) {
  const el = h('div', { class: 'seg ' + cls, role: 'radiogroup', 'aria-label': label });
  for (const o of options) {
    const b = h('button', {
      type: 'button',
      role: 'radio',
      'aria-checked': String(o.value === value),
      class: 'seg-btn' + (o.value === value ? ' on' : ''),
      text: o.label,
      onClick: () => onChange(o.value),
    });
    el.append(b);
  }
  return el;
}

/** Row with title/hint on the left and a control below or right. */
export function field(title, hint, control) {
  return h('div', { class: 'field' },
    h('div', { class: 'field-head' }, h('b', { text: title }), hint ? h('small', { text: hint }) : null),
    control,
  );
}

export function switchRow(title, hint, on, onChange) {
  const btn = h('button', {
    type: 'button',
    role: 'switch',
    'aria-checked': String(!!on),
    class: 'switch' + (on ? ' on' : ''),
    'aria-label': title,
    onClick: () => onChange(!on),
  }, h('span', { class: 'knob' }));
  return h('div', { class: 'field row' }, h('div', { class: 'field-head' }, h('b', { text: title }), hint ? h('small', { text: hint }) : null), btn);
}

export function stepper(value, { min, max, step = 1, suffix = '' }, onChange) {
  return h('div', { class: 'stepper' },
    h('button', { type: 'button', class: 'step-btn', 'aria-label': 'weniger', text: '−', disabled: value <= min, onClick: () => onChange(Math.max(min, value - step)) }),
    h('output', { text: value + suffix }),
    h('button', { type: 'button', class: 'step-btn', 'aria-label': 'mehr', text: '+', disabled: value >= max, onClick: () => onChange(Math.min(max, value + step)) }),
  );
}

export const section = (title, ...children) => h('section', { class: 'panel' }, title ? h('h2', { text: title }) : null, ...children);

/** Modal without engine styles dependency: own overlay classes (see style.css). Returns {close, el}. */
export function sheet({ title, body, actions = [], dismissible = true, onClose = null, cls = '' }) {
  const overlay = h('div', { class: 'sheet-overlay' });
  const box = h('div', { class: 'sheet ' + cls, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' });
  const acts = h('div', { class: 'sheet-actions' });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.body.classList.remove('modal-open');
    if (onClose) onClose();
  };
  for (const a of actions) {
    acts.append(h('button', {
      type: 'button',
      class: 'btn ' + (a.kind ? 'btn-' + a.kind : ''),
      text: a.label,
      onClick: () => {
        const r = a.onClick ? a.onClick() : undefined;
        if (r !== false) close();
      },
    }));
  }
  box.append(...(title ? [h('h2', { text: title })] : []), body, acts);
  overlay.append(box);
  if (dismissible) overlay.addEventListener('pointerdown', (e) => e.target === overlay && close());
  document.body.append(overlay);
  document.body.classList.add('modal-open');
  const first = acts.querySelector('.btn-primary') || acts.querySelector('button');
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 0);
  return { close, el: box };
}
