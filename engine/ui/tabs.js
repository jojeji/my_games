// Bottom tab bar. Tabs can be hidden until unlocked and can show a "new" dot.
import { h, svgIcon, setHidden, setCls } from './dom.js';
import { ICONS } from './icons.js';

export function createTabBar({ tabs, onSelect }) {
  const nav = h('nav', { class: 'tabbar', 'aria-label': 'Navigation' });
  const buttons = {};
  for (const t of tabs) {
    const b = h(
      'button',
      { class: 'tab', type: 'button', 'data-tab': t.id, onClick: () => onSelect(t.id) },
      svgIcon(ICONS[t.icon] || ICONS.more),
      h('span', { class: 'tab-label', text: t.label }),
      h('i', { class: 'tab-dot', hidden: true }),
    );
    buttons[t.id] = b;
    nav.append(b);
  }
  return {
    el: nav,
    setActive(id) {
      for (const [k, b] of Object.entries(buttons)) {
        setCls(b, 'active', k === id);
        b.setAttribute('aria-current', k === id ? 'page' : 'false');
      }
    },
    setVisible(id, visible) {
      setHidden(buttons[id], !visible);
    },
    setDot(id, on) {
      setHidden(buttons[id].querySelector('.tab-dot'), !on);
    },
  };
}
