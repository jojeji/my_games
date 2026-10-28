// Replikator Akt II - UI of the Sondenbefehle and Anomalien (parts of the Galaxie tab, map-view.js) and the status line under the header.
// Logic: commands.js, anomalies.js. Built once, then only changed text/classes are written (engine/ui/dom.js setters).
import { h, txt, setHidden, setDisabled, setCls } from '../../engine/ui/dom.js';
import { autoSwitch, section, progressBar } from '../../engine/ui/kit-views.js';
import { spellBar, spellCards } from '../../engine/ui/spell-view.js';
import { TUNE as T } from './tune.js';
import { ANO_BY_ID, anoPending, anoRunning, anoUnlocked, anoCanStart, anoStart } from './anomalies.js';
import { cmdRate, cmdUnlocked } from './commands.js';

const clock = (sec) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const rate = (x) => String(+x.toFixed(2)).replace('.', ',');

export const SPELL_ICONS = {
  uebertakten: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  sonnenwind: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
  tiefenscan: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12l6-6"/>',
};

/** The status line under the header (standard-app options.banner): the running command / anomaly with the time left. */
export function statusBanner(g) {
  if (!g.state.rep2 || !g.state.rep2.act2) return null;
  const parts = [];
  let ratio = null;
  for (const sp of g.def.spells) {
    if (g.state.spells[sp.id].t > 0) {
      parts.push(`${sp.name} ${clock(g.state.spells[sp.id].t)}`);
      if (ratio === null) ratio = g.state.spells[sp.id].t / g.spellDuration(sp.id);
    }
  }
  const run = anoRunning(g);
  if (run) {
    parts.push(`${ANO_BY_ID[run.type].name} ${clock(run.left)}`);
    if (ratio === null) ratio = run.left / run.dur;
  }
  return parts.length ? { text: parts.join(' · '), ratio: ratio ?? 0 } : null;
}

/** Command bar (quick access) + the detail cards with the auto switches. */
export function buildCommands(g) {
  const bar = spellBar(g, { icons: SPELL_ICONS });
  bar.el.classList.add('cmd-bar');
  const rateLine = h('p', { class: 'muted small center cmd-rate', hidden: true });
  const cards = spellCards(g, { icons: SPELL_ICONS, autoId: 'auto_befehl' });
  const sw = autoSwitch(g, 'auto_befehl', { label: 'Auto-Befehl', hint: 'Wirkt bereite Befehle, sobald sie sich lohnen, auch offline. Pro Befehl einstellbar.' });
  const locked = h('p', { class: 'muted small center', hidden: true, text: `Sondenbefehle: erster Pulsar-Sektor oder ${T.cmdUnlockAt} erschlossene Sektoren. Auto-Befehl: ab ${T.cmdAutoAt} Sektoren.` });
  const detail = section('Sondenbefehle', h('div', { class: 'stack' }, rateLine, sw.el, cards.el), { open: true });
  return {
    barEl: h('div', { class: 'cmd-wrap' }, bar.el),
    detailEl: h('div', { class: 'stack' }, detail, locked),
    update() {
      const open = cmdUnlocked(g);
      bar.update();
      cards.update();
      sw.update();
      setHidden(detail, !open);
      setHidden(locked, open);
      const r = cmdRate(g);
      setHidden(rateLine, !open || r < 1.005);
      txt(rateLine, `Aufladen ×${rate(r)} schneller (Pulsar-Sektoren${g.state.rep2.mut.genome.includes('sonnenhunger') ? ', Sonnenhunger' : ''}).`);
    },
  };
}

/** The anomaly card: the pending one (details + Start) or the running one (time left). */
export function buildAnomalyCard(g) {
  const name = h('b', { class: 'ano-name' });
  const chip = h('span', { class: 'ano-chip' });
  const desc = h('p', { class: 'ano-desc' });
  const effect = h('p', { class: 'ano-line' });
  const risk = h('p', { class: 'ano-line ano-risk' });
  const hint = h('p', { class: 'muted small ano-hint' });
  const bar = progressBar();
  const left = h('p', { class: 'ano-left num' });
  const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Starten' });
  const why = h('p', { class: 'small ano-why' });
  btn.addEventListener('click', () => anoStart(g));
  const card = h('div', { class: 'card ano-card', hidden: true }, h('div', { class: 'ano-top' }, name, chip), desc, effect, risk, hint, left, bar.el, btn, why);
  const last = h('p', { class: 'muted small center ano-last', hidden: true });
  let key = '';
  return {
    el: h('div', { class: 'stack ano-wrap' }, card, last),
    update() {
      const on = anoUnlocked(g);
      const p = anoPending(g);
      const run = anoRunning(g);
      const shown = p ? p.type : run ? run.type : null;
      setHidden(card, !shown);
      setCls(card, 'running', !!run && !p);
      if (shown) {
        const def = ANO_BY_ID[shown];
        const k = shown + (p ? 'p' : 'r');
        if (k !== key) {
          key = k;
          txt(name, def.name);
          txt(desc, def.desc);
          txt(hint, def.hint || '');
        }
        txt(chip, p ? 'wartet auf dich' : 'läuft');
        // while one runs and another waits, the waiting one is shown (its Start is blocked until the running one is over)
        txt(effect, 'Wirkung: ' + def.effect(g));
        const rk = def.risk ? def.risk(g) : '';
        txt(risk, rk ? 'Preis: ' + rk : '');
        setHidden(risk, !rk);
        setHidden(desc, !!run && !p); // a running one only needs its numbers and the time left
        setHidden(hint, !def.hint || !p);
        const isRun = !!run && !p;
        setHidden(left, !isRun);
        setHidden(bar.el, !isRun);
        if (isRun) {
          txt(left, `Noch ${clock(run.left)}`);
          bar.set(run.left / run.dur);
        }
        setHidden(btn, !p);
        if (p) {
          const c = anoCanStart(g);
          setDisabled(btn, !c.ok);
          txt(why, c.ok ? '' : c.why || '');
          setHidden(why, c.ok);
        } else setHidden(why, true);
      }
      const l = on ? g.state.rep2.ano.last : null;
      setHidden(last, !l || !!shown);
      if (l) txt(last, `Zuletzt: ${ANO_BY_ID[l.type].name}${l.text ? ' · ' + l.text : ''}`);
    },
  };
}
