// Non-blocking messages ("Erfolg freigeschaltet", "Gespeichert" ...).
import { h } from './dom.js';

export function createToaster(container, { max = 3 } = {}) {
  const live = [];
  return function toast(text, { kind = 'info', title = '', ms = 3500 } = {}) {
    const el = h('div', { class: 'toast toast-' + kind, role: 'status' }, title ? h('b', { text: title }) : null, h('span', { text }));
    container.append(el);
    live.push(el);
    while (live.length > max) live.shift().remove();
    const remove = () => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 250);
      const i = live.indexOf(el);
      if (i >= 0) live.splice(i, 1);
    };
    el.addEventListener('click', remove);
    setTimeout(remove, ms);
  };
}
