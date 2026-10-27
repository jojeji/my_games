// Replikator Akt II - "Genom" tab: the genome slots, the pending mutation offer, the replace dialog, the Auto-Genom switch.
// Built once; the offer cards and the slot grid are rebuilt only when their content changes, everything else only writes changed text.
// Game logic: mutations.js (mutTake, mutDiscard, ...). Names only via characters.js.
import { h, txt, setHidden, setCls } from '../../engine/ui/dom.js';
import { sectionTitle } from '../../engine/ui/kit-views.js';
import { openModal } from '../../engine/ui/modal.js';
import { TUNE as T } from './tune.js';
import { W } from './characters.js';
import { MUT_BY_ID, RARITY, genomeList, mutSlots, mutNextIn, mutPending, mutTake, mutDiscard, mutInterval } from './mutations.js';

const clock = (sec) => {
  const s = Math.max(0, Math.ceil(sec));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
};

/** The two effect lines of a mutation: benefit (green, "+") and catch (red, "−"). Text never relies on colour alone. */
function effectLines(m) {
  return [
    h('div', { class: 'mut-line mut-good' }, h('span', { class: 'mut-sign', 'aria-hidden': 'true', text: '+' }), h('span', { text: m.benefit() }), h('span', { class: 'sr-only', text: ' (Nutzen)' })),
    h('div', { class: 'mut-line mut-bad' }, h('span', { class: 'mut-sign', 'aria-hidden': 'true', text: '−' }), h('span', { text: m.catch() }), h('span', { class: 'sr-only', text: ' (Haken)' })),
  ];
}

const rarityStyle = (m) => ({ '--c': RARITY[m.rarity].color });
const rarityChip = (m) => h('span', { class: 'mut-rar', text: RARITY[m.rarity].name });

/** A mutation as a card; `actions` are extra elements at the bottom. */
function mutCard(m, { tag = 'div', onTap = null, actions = [], cls = '' } = {}) {
  const props = { class: `mut-card ${cls}`.trim(), style: rarityStyle(m) };
  if (onTap) {
    props.type = 'button';
    props['aria-label'] = `${m.name}, ${RARITY[m.rarity].name}. Antippen für Details.`;
  }
  const el = h(onTap ? 'button' : tag, props, h('div', { class: 'mut-top' }, h('b', { class: 'mut-name', text: m.name }), rarityChip(m)), ...effectLines(m), ...actions);
  if (onTap) el.addEventListener('click', onTap);
  return el;
}

function openDetails(m) {
  const body = h('div', { class: 'mut-detail', style: rarityStyle(m) }, mutCard(m), h('p', { class: 'muted small mut-report', text: `${W}: ${m.report}` }));
  openModal({ title: '', body, actions: [{ label: 'Schließen', kind: 'ghost' }] });
}

export function buildGenomeTab(ctx) {
  const g = ctx.g;
  const mut = () => g.state.rep2.mut;

  /* ---------------- status ---------------- */
  const statLine = h('p', { class: 'gen-stat' });
  const nextLine = h('p', { class: 'muted small' });
  const dots = h('span', { class: 'mut-dots', 'aria-hidden': 'true' }, ...Array.from({ length: T.mutQueueMax }, () => h('i')));
  const head = h('div', { class: 'card gen-head' }, h('div', { class: 'gen-head-row' }, statLine, dots), nextLine);

  /* ---------------- the offer ---------------- */
  const offerTitle = h('h3', { class: 'section-title' });
  const offerCards = h('div', { class: 'mut-offer' });
  const discardBtn = h('button', { class: 'btn btn-block', type: 'button', text: 'Angebot verwerfen' });
  discardBtn.addEventListener('click', () => mutDiscard(g));
  const offerHint = h('p', { class: 'muted small center', text: 'Eine Mutation nehmen oder das Angebot verwerfen. Das nächste wartet erst nach seiner Zeit; nichts verfällt.' });
  const offerBox = h('div', { class: 'stack', hidden: true }, offerTitle, offerCards, discardBtn, offerHint);
  let offerKey = '';

  function take(ci) {
    const m = mut();
    if (!m.offer) return;
    if (m.genome.length < mutSlots(g)) {
      mutTake(g, ci, -1);
      return;
    }
    openReplace(ci);
  }

  /** Full genome: choose the mutation that is lost. */
  function openReplace(ci) {
    const id = mut().offer && mut().offer.cards[ci];
    if (!id) return;
    const incoming = MUT_BY_ID[id];
    let modal;
    const rows = genomeList(g).map((old, j) =>
      mutCard(old, {
        cls: 'mut-row',
        actions: [
          h('button', {
            class: 'btn btn-danger btn-block',
            type: 'button',
            text: `${old.name} ersetzen`,
            onClick: () => {
              if (mutTake(g, ci, j)) modal.close();
            },
          }),
        ],
      }),
    );
    const body = h('div', { class: 'stack mut-replace' },
      h('p', { text: 'Das Genom ist voll. Eine Mutation geht verloren, damit die neue Platz hat.' }),
      h('b', { class: 'mut-sub', text: 'Neu' }),
      mutCard(incoming),
      h('b', { class: 'mut-sub', text: 'Welche soll gehen?' }),
      ...rows,
    );
    modal = openModal({ title: 'Platz tauschen', body, actions: [{ label: 'Abbrechen', kind: 'ghost' }] });
  }

  function paintOffer() {
    const m = mut();
    const offer = m.offer;
    const key = offer ? m.n + ':' + offer.cards.join(',') + ':' + (m.genome.length < mutSlots(g)) : '';
    setHidden(offerBox, !offer);
    if (key === offerKey) {
      if (offer) txt(offerTitle, m.queue > 1 ? `Mutationsangebot · ${m.queue - 1} weitere wartend` : 'Mutationsangebot');
      return;
    }
    offerKey = key;
    if (!offer) {
      offerCards.replaceChildren();
      return;
    }
    const full = m.genome.length >= mutSlots(g);
    offerCards.replaceChildren(
      ...offer.cards.map((id, ci) =>
        mutCard(MUT_BY_ID[id], {
          cls: 'mut-pick',
          actions: [h('button', { class: 'btn btn-primary btn-block', type: 'button', text: full ? 'Nehmen und tauschen' : 'Nehmen', onClick: () => take(ci) })],
        }),
      ),
    );
    txt(offerTitle, m.queue > 1 ? `Mutationsangebot · ${m.queue - 1} weitere wartend` : 'Mutationsangebot');
  }

  /* ---------------- the slots ---------------- */
  const slotGrid = h('div', { class: 'mut-slots' });
  let slotKey = '';
  function lockedText(i) {
    const at = T.genomeSlotAt[i - T.genomeSlots];
    return at ? `Platz ${i + 1}: ab ${at} Sektoren` : `Platz ${i + 1}: noch gesperrt`;
  }
  function paintSlots() {
    const list = genomeList(g);
    const slots = mutSlots(g);
    const key = list.map((x) => x.id).join(',') + '|' + slots;
    if (key === slotKey) return;
    slotKey = key;
    const cells = [];
    for (let i = 0; i < T.genomeMax; i++) {
      if (i < list.length) cells.push(mutCard(list[i], { cls: 'mut-slot', onTap: () => openDetails(list[i]) }));
      else if (i < slots) cells.push(h('div', { class: 'mut-slot mut-empty' }, h('b', { text: `Platz ${i + 1}` }), h('span', { class: 'muted small', text: 'frei' })));
      else cells.push(h('div', { class: 'mut-slot mut-locked' }, h('b', { text: lockedText(i) })));
    }
    slotGrid.replaceChildren(...cells);
  }

  /* ---------------- Auto-Genom ---------------- */
  const autoInput = h('input', { type: 'checkbox', class: 'switch-input' });
  autoInput.addEventListener('change', () => (g.state.auto.auto_genom.on = autoInput.checked));
  const autoRow = h('label', { class: 'row setting card', hidden: true },
    h('span', { class: 'row-main' }, h('b', { text: 'Auto-Genom' }), h('small', { class: 'muted', text: 'Nimmt von jedem Angebot die Mutation mit dem größten Zuwachs, tauscht dafür die schwächste aus oder verwirft das Angebot.' })),
    h('span', { class: 'switch' }, autoInput, h('i', { class: 'switch-track' })),
  );
  const autoLocked = h('p', { class: 'muted small center', hidden: true, text: `Auto-Genom: ab ${T.mutAutoAt} erschlossenen Sektoren oder ${T.mutAutoTaken} gewählten Mutationen.` });

  const info = h('p', { class: 'muted small center' });

  const page = h('div', { class: 'stack' },
    head,
    offerBox,
    sectionTitle('Genom', 'Antippen für Details'),
    slotGrid,
    autoRow,
    autoLocked,
    info,
  );

  return {
    el: page,
    update() {
      const m = mut();
      const list = genomeList(g);
      txt(statLine, `Genom · ${list.length} von ${mutSlots(g)} Plätzen belegt`);
      const pending = mutPending(g);
      dots.childNodes.forEach((d, i) => setCls(d, 'on', i < pending));
      const nx = mutNextIn(g);
      txt(nextLine, nx === null ? `Warteschlange voll (${T.mutQueueMax} von ${T.mutQueueMax}). Entscheide ein Angebot, dann lädt das nächste weiter.` : `Nächstes Angebot in ${clock(nx)}${pending ? ` · ${pending} wartend` : ''}`);
      paintOffer();
      paintSlots();
      const open = g.autoUnlocked('auto_genom');
      setHidden(autoRow, !open);
      setHidden(autoLocked, open);
      if (open && autoInput.checked !== g.state.auto.auto_genom.on) autoInput.checked = g.state.auto.auto_genom.on;
      txt(info, `Alle ${Math.round(mutInterval(g) / 60)} Minuten Spielzeit kommt ein Angebot, auch wenn du nicht da bist (höchstens ${T.mutQueueMax} warten). Mutationen bleiben bei jedem Reset erhalten.`);
    },
  };
}
