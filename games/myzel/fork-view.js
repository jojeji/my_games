// Fork choice dialog (fork A: Sporen | Mykorrhiza, fork B: Flechte | Fäulnis).
import { h } from '../../engine/ui/dom.js';
import { openModal } from '../../engine/ui/modal.js';

const PROS = {
  s: ['Aktiv: jede Spore vervielfacht die Nährstoffe', 'Billiger Reset, du bestimmst den Takt', 'Für alle, die oft hereinschauen'],
  m: ['Ruhig: jede Einheit erzeugt Zucker', 'Auch wenn du fort bist (bis 3 Stunden)', 'Für alle, die selten hereinschauen'],
  l: ['Alge und Licht erzeugen Flechten', 'Jede Stufe arbeitet weiter', 'Für alle, die gern aufbauen'],
  z: ['Zersetzen: Vorrat fault zu Humus', 'Humus macht alles fruchtbarer', 'Für alle, die gern entscheiden'],
};
const TEXT = {
  a: { title: 'Wohin wächst das Netz?', lead: 'Das Netz gabelt sich. Wohin soll es zuerst wachsen? Der andere Weg bleibt zu, bis der Wald ihn öffnet.', foot: 'Umwählen geht später im Knoten, kostet aber den Ast.' },
  b: { title: 'Und tiefer?', lead: 'Unter den Fruchtkörpern gabelt sich das Netz noch einmal. Der andere Weg öffnet sich später mit dem Waldnetz und verträgt sich mit dem ersten.', foot: 'Umwählen geht später im Knoten, kostet aber den Ast und alles darüber.' },
};

/** Opens the dialog of fork `fork` ('a' | 'b'). Returns the modal handle. onChoose(opt) runs after a confirmed choice. */
export function openForkDialog(ctx, { fork = 'a', onChoose } = {}) {
  const { g } = ctx;
  const f = g.forkDef(fork);
  const txt = TEXT[fork];
  let modal = null;
  const cards = f.options.map((o) => {
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: `${o.name} wählen`, onClick: () => {
      if (g.forkChoose(fork, o.id)) {
        modal?.close();
        if (onChoose) onChoose(o.id);
      }
    } });
    return h('div', { class: 'card fork-opt', 'data-opt': o.id },
      h('b', { class: 'fork-name', text: o.name }),
      h('ul', { class: 'fork-pros' }, ...PROS[o.id].map((t) => h('li', { text: t }))),
      btn);
  });
  const body = h('div', { class: 'stack' }, h('p', { text: txt.lead }), ...cards, h('p', { class: 'muted small', text: txt.foot }));
  modal = openModal({ title: txt.title, body, actions: [{ label: 'Später entscheiden', kind: 'ghost' }] });
  return modal;
}
