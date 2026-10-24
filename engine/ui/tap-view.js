// Big tap target with charges (engine/kit/tap.js): animation, floating "+X" numbers, charge pips.
// Honours prefers-reduced-motion (no flip/float movement, only a short fade).
import { h, txt, setStyle, setCls, setDisabled } from './dom.js';
import { holdRepeat } from './hold.js';
import { formatNumber as fmt, formatDuration } from '../format.js';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {object} g  game with the tap mixin
 * @param {{art:Node, title?:string, hint?:(g)=>string, floatText?:(gain)=>string}} opts
 *   art = decorative inner node (e.g. SVG); the view sets the CSS variable --fill (0..1) on the button.
 */
export function tapView(g, { art, title = 'Antippen', hint, floatText = (gain) => '+' + fmt(gain) } = {}) {
  const pips = h('div', { class: 'tap-pips', 'aria-hidden': 'true' });
  const label = h('span', { class: 'tap-label', text: title });
  const gainText = h('small', { class: 'tap-gain num' });
  const btn = h('button', { class: 'tap-btn', type: 'button', 'aria-label': title }, h('span', { class: 'tap-art' }, art), label, gainText);
  const status = h('p', { class: 'tap-status muted small' });
  const wrap = h('div', { class: 'tap card' }, btn, pips, status);
  let pipN = 0;
  let last = { x: 0, y: 0 };
  const live = [];

  btn.addEventListener('pointerdown', (e) => {
    const r = wrap.getBoundingClientRect();
    last = { x: e.clientX - r.left, y: e.clientY - r.top };
  });

  const spawn = (gain) => {
    const r = wrap.getBoundingClientRect();
    const x = last.x || r.width / 2;
    const y = last.y || r.height / 3;
    const f = h('span', { class: 'tap-float num', text: floatText(gain), style: { left: x + 'px', top: y + 'px' } });
    f.addEventListener('animationend', () => {
      f.remove();
      live.splice(live.indexOf(f), 1);
    });
    wrap.append(f);
    live.push(f);
    while (live.length > 6) live.shift().remove();
  };

  const doTap = () => {
    const gain = g.tapDo(false);
    if (!gain) {
      btn.classList.add('empty');
      setTimeout(() => btn.classList.remove('empty'), 180);
      return;
    }
    spawn(gain);
    if (!reduced()) {
      btn.classList.remove('flip');
      void btn.offsetWidth; // restart animation
      btn.classList.add('flip');
    }
    btn.classList.remove('pulse');
    void btn.offsetWidth;
    btn.classList.add('pulse');
  };
  btn.addEventListener('animationend', (e) => {
    if (e.animationName === 'tap-flip') btn.classList.remove('flip');
    if (e.animationName === 'tap-pulse') btn.classList.remove('pulse');
  });
  holdRepeat(btn, doTap, { delay: 450, interval: 260, minInterval: 140, accel: 0.95 });

  return {
    el: wrap,
    update() {
      const max = g.tapMax();
      const ch = g.state.tap.charges;
      setStyle(btn, '--fill', String(Math.min(1, ch / max).toFixed(3)));
      setCls(btn, 'ready', g.tapCan());
      if (max <= 14) {
        if (pipN !== max) {
          pipN = max;
          pips.replaceChildren(...Array.from({ length: max }, () => h('i')));
        }
        for (let i = 0; i < max; i++) setCls(pips.children[i], 'on', i < Math.floor(ch + 1e-9));
        setCls(pips, 'hidden-pips', false);
      } else if (pipN !== -1) {
        pipN = -1;
        pips.replaceChildren();
      }
      const next = g.tapNextIn();
      txt(status, `Ladungen ${g.tapCharges()}/${max}` + (next > 0 ? ` · nächste in ${formatDuration(next)}` : ' · voll') + (hint ? ' · ' + hint(g) : ''));
      txt(gainText, '+' + fmt(g.tapGain()));
      setDisabled(btn, false);
    },
  };
}
