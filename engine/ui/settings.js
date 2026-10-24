// Generic settings panel: notation, autosave, offline cap, confirmations, save export/import, hard reset.
import { h, txt } from './dom.js';
import { openModal, confirmDialog } from './modal.js';
import { NOTATIONS, setNotation } from '../format.js';
import { canInstall, onInstallAvailable, promptInstall, isStandalone } from '../pwa.js';

function selectRow(label, options, get, set, hint) {
  const sel = h('select', { class: 'select', 'aria-label': label });
  for (const [value, text] of options) sel.append(h('option', { value: String(value), text }));
  sel.value = String(get());
  sel.addEventListener('change', () => set(sel.value));
  return h('label', { class: 'row setting' }, h('span', { class: 'row-main' }, h('b', { text: label }), hint ? h('small', { text: hint }) : null), sel);
}

function toggleRow(label, get, set, hint) {
  const input = h('input', { type: 'checkbox', class: 'switch-input' });
  input.checked = !!get();
  input.addEventListener('change', () => set(input.checked));
  return h(
    'label',
    { class: 'row setting' },
    h('span', { class: 'row-main' }, h('b', { text: label }), hint ? h('small', { text: hint }) : null),
    h('span', { class: 'switch' }, input, h('i', { class: 'switch-track' })),
  );
}

async function copyText(text, area) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      area.focus();
      area.select();
      area.setSelectionRange(0, text.length);
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
}

export function openExportDialog(ctx) {
  ctx.runtime.save();
  const text = ctx.runtime.exportString();
  const area = h('textarea', { class: 'textarea', readOnly: true, rows: 6, value: text, 'aria-label': 'Spielstand-Text' });
  area.addEventListener('focus', () => area.select());
  const body = h('div', {}, h('p', { class: 'muted', text: 'Dieser Text enthält deinen kompletten Spielstand. Bewahre ihn sicher auf (Notiz, Mail an dich selbst …).' }), area);
  openModal({
    title: 'Spielstand exportieren',
    body,
    actions: [
      { label: 'Schließen', kind: 'ghost' },
      {
        label: 'Kopieren',
        kind: 'primary',
        onClick: async () => {
          const ok = await copyText(text, area);
          ctx.toast(ok ? 'In die Zwischenablage kopiert.' : 'Text markiert – bitte manuell kopieren.', { kind: ok ? 'good' : 'warn' });
          return false;
        },
      },
    ],
  });
  setTimeout(() => area.select(), 50);
}

export function openImportDialog(ctx) {
  const area = h('textarea', { class: 'textarea', rows: 6, placeholder: 'Spielstand-Text hier einfügen …', 'aria-label': 'Spielstand-Text' });
  const err = h('p', { class: 'error', hidden: true });
  const body = h('div', {}, h('p', { class: 'muted', text: 'Achtung: Der aktuelle Spielstand wird überschrieben.' }), area, err);
  openModal({
    title: 'Spielstand importieren',
    body,
    actions: [
      { label: 'Abbrechen', kind: 'ghost' },
      {
        label: 'Importieren',
        kind: 'danger',
        onClick: () => {
          try {
            ctx.runtime.importString(area.value);
            ctx.toast('Spielstand importiert.', { kind: 'good' });
            return true;
          } catch (e) {
            err.hidden = false;
            err.textContent = e.message;
            return false;
          }
        },
      },
    ],
  });
}

export async function hardReset(ctx) {
  const first = await confirmDialog('Wirklich den gesamten Spielstand löschen? Alle Fortschritte gehen verloren.', {
    title: 'Spiel zurücksetzen',
    ok: 'Weiter',
    danger: true,
  });
  if (!first) return;
  const second = await confirmDialog('Letzte Warnung: Das kann nicht rückgängig gemacht werden. Tipp: Exportiere vorher deinen Spielstand.', {
    title: 'Endgültig löschen?',
    ok: 'Alles löschen',
    danger: true,
  });
  if (!second) return;
  ctx.runtime.hardReset();
  location.reload();
}

/** @param {{runtime:object, g:object, toast:Function, layerLabels?:Object<string,string>}} ctx */
export function buildSettingsPanel(ctx) {
  const { g, runtime } = ctx;
  const s = () => g.state.settings;
  const el = h('div', { class: 'stack' });

  el.append(
    selectRow('Zahlenformat', Object.entries(NOTATIONS), () => s().notation, (v) => {
      s().notation = v;
      setNotation(v);
    }),
    selectRow(
      'Automatisch speichern',
      [[5, 'alle 5 s'], [10, 'alle 10 s'], [30, 'alle 30 s'], [60, 'jede Minute']],
      () => s().autosave,
      (v) => (s().autosave = Number(v)),
      'Zusätzlich beim Verlassen der Seite.',
    ),
    selectRow(
      'Offline-Fortschritt (max.)',
      [[1, '1 Stunde'], [4, '4 Stunden'], [12, '12 Stunden'], [24, '24 Stunden'], [48, '48 Stunden'], [72, '72 Stunden']],
      () => s().offlineCapHours,
      (v) => (s().offlineCapHours = Number(v)),
      'So lange wird deine Abwesenheit nachgerechnet.',
    ),
  );

  if (g.def.chronicle) {
    el.append(
      toggleRow('Story-Blasen anzeigen', () => s().storyBubbles !== false, (v) => {
        s().storyBubbles = v;
        if (!v && ctx.storyBubbles) ctx.storyBubbles.clear();
      }, 'Neue Chronik-Einträge erscheinen als Chat-Blasen über der Leiste.'),
      selectRow('Tempo der Story-Blasen', [['normal', 'Normal'], ['fast', 'Schnell']], () => s().storyTempo || 'normal', (v) => (s().storyTempo = v), 'Wie schnell die Zeilen erscheinen und wieder verschwinden.'),
    );
  }

  const confirms = h('div', { class: 'stack' }, h('h3', { class: 'section-title', text: 'Sicherheitsabfragen' }));
  for (const l of g.def.layers || []) {
    confirms.append(toggleRow(`${l.name}: vorher fragen`, () => s().confirm[l.id], (v) => (s().confirm[l.id] = v)));
  }
  el.append(confirms);

  const data = h('div', { class: 'stack' }, h('h3', { class: 'section-title', text: 'Spielstand' }));
  const storageNote = h('p', { class: 'muted warn', hidden: true, text: 'Hinweis: Der Browser-Speicher ist nicht verfügbar (privater Modus?). Fortschritt geht beim Schließen verloren – exportiere regelmäßig!' });
  if (!runtime.store.storage.persistent) storageNote.hidden = false;
  data.append(
    storageNote,
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', text: 'Jetzt speichern', onClick: () => { runtime.save(); ctx.toast('Gespeichert.', { kind: 'good', ms: 1500 }); } }),
      h('button', { class: 'btn', type: 'button', text: 'Exportieren', onClick: () => openExportDialog(ctx) }),
      h('button', { class: 'btn', type: 'button', text: 'Importieren', onClick: () => openImportDialog(ctx) }),
    ),
    h('button', { class: 'btn btn-danger btn-block', type: 'button', text: 'Spiel zurücksetzen …', onClick: () => hardReset(ctx) }),
  );
  el.append(data);

  const install = h('div', { class: 'stack' }, h('h3', { class: 'section-title', text: 'App' }));
  const installBtn = h('button', { class: 'btn btn-primary btn-block', type: 'button', hidden: true, text: 'Als App installieren', onClick: async () => { await promptInstall(); } });
  const hint = h('p', { class: 'muted', text: isStandalone() ? 'Du spielst gerade als installierte App.' : 'Tipp: Im Browser-Menü „Zum Startbildschirm hinzufügen“ wählen (iPhone: Teilen-Symbol). Dann startet das Spiel wie eine App und funktioniert auch offline.' });
  installBtn.hidden = !canInstall();
  onInstallAvailable((v) => (installBtn.hidden = !v));
  install.append(installBtn, hint);
  el.append(install);

  const info = h('p', { class: 'muted small' });
  txt(info, `${g.def.title} · Spielstand-Version ${g.version}`);
  el.append(info);

  return { el, update() {} };
}
