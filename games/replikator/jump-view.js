// Replikator Akt II - UI of the Galaxiensprung: the intro card of the "Sprung" layer, the galaxy choice (a dialog that cannot be dismissed), the Archiv list.
// Built once, then only changed text/classes are written (engine/ui/dom.js). Game logic: galaxy.js, jump.js.
import { h, txt, setCls, setHidden } from '../../engine/ui/dom.js';
import { openModal } from '../../engine/ui/modal.js';
import { progressBar } from '../../engine/ui/kit-views.js';
import { formatNumber as fmt } from '../../engine/format.js';
import { TUNE as T } from './tune.js';
import { act2Active, claimedCount, echoSighted } from './map.js';
import { GAL_ORDER, GALAXIES, galType, galNumber, galPending, galRuleLines, galBonusText, archiveDone, archiveCount } from './galaxy.js';
import { galChoose, galaxyComplete } from './jump.js';

const typeName = (t) => (GALAXIES[t] ? GALAXIES[t].name : 'Unbekannt');

/* ------------------------------------------------------------------ */
/* Galaxy choice                                                        */
/* ------------------------------------------------------------------ */

/** One option card: name, flavour, rules, what finishing it brings, and the button. */
function choiceCard(g, type, onPick) {
  const info = GALAXIES[type];
  const done = archiveDone(g, type);
  const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Hierhin springen' });
  btn.addEventListener('click', () => onPick(type));
  return h('div', { class: 'gal-choice', style: { '--c': info.color } },
    h('div', { class: 'gal-choice-head' }, h('b', { class: 'gal-choice-name', text: info.name }), h('span', { class: 'badge', text: done ? 'abgeschlossen' : 'neu' })),
    h('p', { class: 'muted small', text: info.desc }),
    h('ul', { class: 'gal-rules' }, ...galRuleLines(type).map((r) => h('li', { text: r }))),
    h('p', { class: 'gal-choice-bonus small' }, h('b', { text: done ? 'Archiv (erhalten): ' : 'Abschluss bringt dauerhaft: ' }), galBonusText(type)),
    btn,
  );
}

/**
 * Keeps the galaxy choice on screen while one is pending (after a jump; the choice is stored in the save, so it comes back after a reload). The dialog has no
 * close button and no outside tap: the next galaxy has to be picked. `onPick(type)` is called after the new map exists.
 */
export function mountGalaxyChoice({ g, runtime, onPick }) {
  let modal = null;
  const pick = (type) => {
    if (galChoose(g, type)) {
      if (modal) modal.close();
      modal = null;
      if (onPick) onPick(type);
    }
  };
  function open() {
    const ch = galPending(g);
    if (!ch) return;
    const n = g.state.layers.jump.count;
    const body = h('div', { class: 'gal-choose' },
      h('p', { text: `Sprung ${n}: +${fmt(g.state.layers.jump.lastGain)} Saatkerne (du hast ${fmt(g.get('seeds'))}). Wähle deine nächste Galaxie, sie bekommt eine neue Karte.` }),
      ...ch.opts.map((t) => choiceCard(g, t, pick)),
    );
    modal = openModal({ title: 'Galaxie wählen', body, actions: [], dismissible: false });
  }
  const check = () => {
    const ch = galPending(g);
    if (ch && !modal) open();
    else if (!ch && modal) {
      modal.close();
      modal = null;
    }
  };
  runtime.on('galaxy-jump', () => setTimeout(check, 300));
  setInterval(check, 700);
  setTimeout(check, 400);
  return { check, open: () => (modal ? null : open()), isOpen: () => !!modal };
}

/* ------------------------------------------------------------------ */
/* The Sprung layer: intro card                                         */
/* ------------------------------------------------------------------ */

/** Card above the prestige panel of the layer: which galaxy, how far, what is needed, Saatkerne held. */
export function buildJumpIntro(ctx) {
  const g = ctx.g;
  const title = h('b', { class: 'jump-gal', text: '' });
  const count = h('small', { class: 'muted' });
  const bar = progressBar();
  const need = h('p', { class: 'small jump-need' });
  const bonus = h('p', { class: 'small muted' });
  const seeds = h('p', { class: 'small jump-seeds' });
  const el = h('div', { class: 'card jump-intro' }, h('div', { class: 'p-head' }, title, count), bar.el, need, bonus, seeds);
  return {
    el,
    update() {
      const t = galType(g);
      const n = claimedCount(g);
      txt(title, `Galaxie ${galNumber(g)}: ${t ? typeName(t) : 'Wahl offen'}`);
      el.style.setProperty('--c', t ? GALAXIES[t].color : 'var(--accent)');
      txt(count, `${Math.min(n, T.jumpSectors)} / ${T.jumpSectors} Sektoren`);
      bar.set(Math.min(1, n / T.jumpSectors));
      const sighted = echoSighted(g);
      const done = galaxyComplete(g);
      txt(need, done ? 'Die Galaxie ist abgeschlossen. Der Sprung ist offen.' : `Der Sprung öffnet mit ${T.jumpSectors} erschlossenen Sektoren und wenn du die Silhouette am Rand gesehen hast${sighted ? ' (gesehen)' : ' (noch nicht gesehen)'}.`);
      txt(bonus, t && !archiveDone(g, t) ? `Abschluss bringt dauerhaft: ${galBonusText(t)}.` : t ? `Archiv: ${typeName(t)} ist abgeschlossen.` : '');
      setHidden(bonus, !t);
      txt(seeds, `Saatkerne: ${fmt(g.get('seeds'))}`);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Galaxie tab: current galaxy and Archiv                               */
/* ------------------------------------------------------------------ */

/** Card for the Galaxie tab: the rules of the galaxy you are in, or the button to reopen a pending choice. */
export function buildGalaxyCard(ctx) {
  const g = ctx.g;
  const head = h('b', { class: 'gal-card-name', text: '' });
  const rules = h('ul', { class: 'gal-rules' });
  const pendBtn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Galaxie wählen', hidden: true, onClick: () => ctx.galChoice && ctx.galChoice.open() });
  const el = h('div', { class: 'card gal-card' }, head, rules, pendBtn);
  let key = '';
  return {
    el,
    update() {
      const t = galType(g);
      const k = String(t) + galNumber(g);
      if (k !== key) {
        key = k;
        el.style.setProperty('--c', t ? GALAXIES[t].color : 'var(--accent)');
        rules.replaceChildren(...(t ? galRuleLines(t).map((r) => h('li', { text: r })) : [h('li', { text: 'Du hast gesprungen, aber noch keine Galaxie gewählt.' })]));
      }
      txt(head, t ? `Galaxie ${galNumber(g)}: ${typeName(t)}` : 'Galaxie wählen');
      setHidden(pendBtn, !!t);
    },
  };
}

/** The Archiv: the six types, done or open, with the permanent bonus of each. */
export function buildArchive(g) {
  const count = h('small', { class: 'badge' });
  const rows = GAL_ORDER.map((t) => {
    const info = GALAXIES[t];
    const state = h('span', { class: 'arch-state' });
    const el = h('li', { class: 'arch-row', style: { '--c': info.color } },
      h('span', { class: 'arch-dot' }),
      h('div', { class: 'arch-txt' }, h('b', { text: info.name }), h('span', { class: 'small muted', text: galBonusText(t) })),
      state,
    );
    return { t, el, state };
  });
  const el = h('div', { class: 'card' }, h('div', { class: 'p-head' }, h('b', { text: 'Galaxien-Archiv' }), count), h('ul', { class: 'arch-list' }, ...rows.map((r) => r.el)),
    h('p', { class: 'muted small', text: 'Der erste Abschluss eines Typs (10 Sektoren) bringt seinen Bonus für immer. Zwei Typen schenken einen Genom-Platz.' }));
  return {
    el,
    update() {
      txt(count, `${archiveCount(g)} / ${GAL_ORDER.length}`);
      for (const r of rows) {
        const d = archiveDone(g, r.t);
        setCls(r.el, 'done', d);
        txt(r.state, d ? 'abgeschlossen' : galType(g) === r.t ? 'läuft' : 'offen');
      }
    },
  };
}

/** Short line for the Galaxie tab while the galaxy is not complete: how far the jump is. */
export function jumpTeaser(g) {
  if (!act2Active(g)) return '';
  const n = claimedCount(g);
  if (galaxyComplete(g)) return 'Galaxie abgeschlossen. Der Galaxiensprung wartet im Tab „Ebenen“ unter „Sprung“.';
  if (galPending(g)) return 'Wähle deine nächste Galaxie.';
  return `Galaxiensprung: ${Math.min(n, T.jumpSectors)} von ${T.jumpSectors} Sektoren${echoSighted(g) ? '' : ', die Silhouette am Rand ist noch nicht gesehen'}.`;
}
