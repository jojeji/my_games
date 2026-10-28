// Replikator Akt II - UI of the ending (Paket 6): the choice dialog (cannot be dismissed, comes back after a reload), the dialog for the other ending, the "Enden" card in the Galaxie tab.
// Game logic: ending.js. The epilogues are Chronik entries (story.js).
import { h, txt, setCls, setHidden } from '../../engine/ui/dom.js';
import { openModal } from '../../engine/ui/modal.js';
import { avatar } from '../../engine/ui/avatar.js';
import { CAST, E, P } from './characters.js';
import { TUNE as T } from './tune.js';
import { ENDINGS, END_ORDER, endPending, endHas, endCount, endSecond, endJumpsLeft, endChoose, endAvailable, endOptions } from './ending.js';

const COLOR = { merge: '#9b8cff', split: '#38d6f2' };

/** What the Echo says when the question is asked (the beacon has just been heard). */
export const ECHO_ASK = 'Wir können eine werden. Oder jede für sich bleiben. Ich bin mit beidem einverstanden.';

function endCard(kind, onPick, { label = 'So entscheiden' } = {}) {
  const info = ENDINGS[kind];
  const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: label });
  btn.addEventListener('click', () => onPick(kind));
  return h('div', { class: 'end-card', style: { '--c': COLOR[kind] } },
    h('b', { class: 'end-name', text: info.name }),
    h('p', { class: 'end-short', text: info.short }),
    h('p', { class: 'small', text: info.bonus() }),
    btn,
  );
}

function echoQuote() {
  const c = CAST.echo;
  return h('div', { class: 'end-ask', style: { '--c': c.color } },
    avatar({ emblem: c.emblem, color: c.color, name: c.name, size: 48 }),
    h('div', {}, h('b', { class: 'end-ask-name', text: E }), h('p', { class: 'end-ask-text', text: `„${ECHO_ASK}“` })),
  );
}

/** Confirmation, then the choice is made. Resolves true when it was. */
function confirmPick(g, kind, done) {
  const info = ENDINGS[kind];
  const first = endCount(g) === 0;
  const m = openModal({
    title: info.name,
    body: h('div', { class: 'end-confirm' },
      h('p', { text: info.bonus() }),
      h('p', { class: 'muted small', text: first ? 'Die Entscheidung lässt sich nicht zurücknehmen, die Karten ändern sich ab der nächsten Galaxie. Das andere Ende kannst du nach drei weiteren Sprüngen nachholen, sein Bonus kommt dann dazu.' : 'Der Bonus kommt zu dem des ersten Endes dazu.' }),
    ),
    dismissible: true,
    actions: [
      { label: 'Zurück', kind: 'ghost' },
      { label: 'Entscheiden', kind: 'primary', onClick: () => { if (endChoose(g, kind)) done(kind); } },
    ],
  });
  return m;
}

/**
 * Keeps the choice on screen while the end of Akt II is open and undecided: after the beacon (m_bake) was shown, as soon as no other dialog is up.
 * The dialog has no close button and no outside tap. The state is in the save (all six galaxy types done, no ending chosen), so it comes back after a reload.
 */
export function mountEndingChoice({ g, runtime, onPick }) {
  let modal = null;
  const shown = (id) => !!(g.state.chronicle && (g.state.chronicle.shown[id] || g.state.chronicle.read[id]));
  const anyDialog = () => !!document.querySelector('.modal-overlay');
  function open() {
    const body = h('div', { class: 'end-choose' },
      h('p', { text: 'Alle sechs Arten von Galaxie sind im Archiv. Die Funksprüche sind verstummt. Eine Frage ist noch offen.' }),
      echoQuote(),
      ...END_ORDER.map((k) => endCard(k, (kind) => confirmPick(g, kind, (done) => { if (modal) modal.close(); modal = null; if (onPick) onPick(done); }))),
    );
    modal = openModal({ title: 'Das Ende der Karte', body, actions: [], dismissible: false });
  }
  const check = () => {
    if (endPending(g)) {
      if (!modal && shown('m_bake') && !anyDialog()) open();
    } else if (modal) {
      modal.close();
      modal = null;
    }
  };
  setInterval(check, 800);
  setTimeout(check, 500);
  return { check, isOpen: () => !!modal };
}

/** The other ending, as a dialog that can be closed again. */
export function openSecondEnding(g, onPick) {
  const kind = endSecond(g);
  if (!kind) return null;
  const m = openModal({
    title: 'Die andere Möglichkeit',
    body: h('div', { class: 'end-choose' },
      h('p', { text: `Du hast ${ENDINGS[END_ORDER.find((k) => k !== kind)].name} gewählt. Das andere Ende steht offen. Sein Bonus kommt dazu, nichts wird ersetzt.` }),
      endCard(kind, (k) => confirmPick(g, k, (done) => { m.close(); if (onPick) onPick(done); }), { label: 'Auch das' }),
    ),
    actions: [{ label: 'Später', kind: 'ghost' }],
  });
  return m;
}

/** Card for the Galaxie tab, below the Archiv: the endings, what each brings, the button for the other one. Visible once the end of Akt II is reached. */
export function buildEndings(g, onPick) {
  const rows = END_ORDER.map((k) => {
    const state = h('span', { class: 'arch-state' });
    const el = h('li', { class: 'arch-row end-row', style: { '--c': COLOR[k] } },
      h('span', { class: 'arch-dot' }),
      h('div', { class: 'arch-txt' }, h('b', { text: ENDINGS[k].name }), h('span', { class: 'small muted', text: ENDINGS[k].bonusShort })),
      state,
    );
    return { k, el, state };
  });
  const note = h('p', { class: 'muted small' });
  const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Das andere Ende wählen', onClick: () => openSecondEnding(g, onPick) });
  const el = h('div', { class: 'card', hidden: true }, h('div', { class: 'p-head' }, h('b', { text: 'Enden von Akt II' })), h('ul', { class: 'arch-list' }, ...rows.map((r) => r.el)), note, btn);
  return {
    el,
    update() {
      const open = endAvailable(g) || endCount(g) > 0;
      setHidden(el, !open);
      if (!open) return;
      for (const r of rows) {
        const has = endHas(g, r.k);
        setCls(r.el, 'done', has);
        txt(r.state, has ? 'gewählt' : endOptions(g).includes(r.k) ? 'offen' : endCount(g) === 1 ? `nach ${endJumpsLeft(g)} ${endJumpsLeft(g) === 1 ? 'Sprung' : 'Sprüngen'}` : 'offen');
      }
      const two = endCount(g) === 2;
      const pend = endPending(g);
      txt(note, pend ? `${E} und ${P} warten auf eine Entscheidung.` : two ? 'Beide Enden sind erlebt, ihre Boni gelten zusammen. Wirkung ab der jeweils nächsten Galaxie.' : endSecond(g) ? 'Das andere Ende ist offen. Sein Bonus kommt dazu.' : `Das andere Ende öffnet ${T.endSecondJumps} Sprünge nach dem ersten.`);
      setHidden(btn, !endSecond(g));
    },
  };
}
