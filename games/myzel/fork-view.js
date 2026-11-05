// Fork choice dialog (fork A: Sporen | Mykorrhiza).
import { h } from '../../engine/ui/dom.js';
import { openModal } from '../../engine/ui/modal.js';

const PROS = {
  s: ['Aktiv: jede Spore vervielfacht die Nährstoffe', 'Billiger Reset, du bestimmst den Takt', 'Für alle, die oft hereinschauen'],
  m: ['Ruhig: jede Einheit erzeugt Zucker', 'Auch wenn du fort bist (bis 3 Stunden)', 'Für alle, die selten hereinschauen'],
};

/** Opens the dialog. Returns the modal handle. onChoose(opt) runs after a confirmed choice. */
export function openForkDialog(ctx, { onChoose } = {}) {
  const { g } = ctx;
  const f = g.forkDef('a');
  let modal = null;
  const cards = f.options.map((o) => {
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: `${o.name} wählen`, onClick: () => {
      if (g.forkChoose('a', o.id)) {
        modal?.close();
        if (onChoose) onChoose(o.id);
      }
    } });
    return h('div', { class: 'card fork-opt', 'data-opt': o.id },
      h('b', { class: 'fork-name', text: o.name }),
      h('ul', { class: 'fork-pros' }, ...PROS[o.id].map((t) => h('li', { text: t }))),
      btn);
  });
  const body = h('div', { class: 'stack' },
    h('p', { text: 'Das Netz gabelt sich. Wohin soll es zuerst wachsen? Der andere Weg bleibt zu, bis der Wald ihn öffnet.' }),
    ...cards,
    h('p', { class: 'muted small', text: 'Umwählen geht später im Knoten, kostet aber den Ast.' }));
  modal = openModal({ title: 'Wohin wächst das Netz?', body, actions: [{ label: 'Später entscheiden', kind: 'ghost' }] });
  return modal;
}
