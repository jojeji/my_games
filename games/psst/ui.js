// Psst! UI: app shell + the menu screens (start, teams, Kartenpakete, settings, gemeldete Karten).
// The game screens (Zug, Zusammenfassung, Tabelle, Ende) live in zug-view.js.
import { h } from '../../engine/ui/dom.js';
import { createToaster } from '../../engine/ui/toast.js';
import { createDeck, createGame, restoreGame, REPORT_REASONS } from './logic.js';
import { TEAM_COLORS } from './store.js';
import { topbar, segmented, field, switchRow, stepper, section, sheet } from './widgets.js';
import { createZugView } from './zug-view.js';
import { createMultiplayer } from './mp-ui.js';

const TILE_COLORS = ['#e8452c', '#2563eb', '#0f7f50', '#8b3fc8', '#b45309', '#c21d6b', '#0e7490', '#4f46e5'];
const STAR_RULES = [
  [/leicht/i, 1],
  [/mittel/i, 2],
  [/schwer/i, 3],
];
const DURATIONS = [30, 45, 60, 90, 120];
const FREE_SKIPS = [0, 1, 2, 3, 5, -1];

export const packStars = (p) => {
  if (p.kind !== 'difficulty') return 0;
  for (const [re, n] of STAR_RULES) if (re.test(p.id) || re.test(p.name)) return n;
  return 0;
};

export function mountPsst({ root, store, packs, feedback, wake }) {
  const toasts = h('div', { class: 'toasts' });
  const view = h('div', { class: 'view' });
  root.append(view, toasts);
  const toast = createToaster(toasts, { max: 2 });

  const A = {
    screen: 'start',
    back: 'start', // where "settings" returns to
    settings: store.settings(),
    teams: store.teams(),
    selection: new Set(store.packSelection()),
    index: null,
    indexError: null,
    game: null,
    packIds: [],
    toast,
    store,
    packs,
    feedback,
    wake,
  };
  A.go = go;
  A.render = render;
  A.openReport = openReport;

  const saveSettings = () => store.saveSettings(A.settings);

  /* ---------- game lifecycle ---------- */

  function persist() {
    if (!A.game) return;
    store.saveGame({ game: A.game.toJSON(), packs: A.packIds });
    store.savePlayed(A.game.deck.played);
    if (A.game.phase === 'tabelle' || A.game.phase === 'ende') updateProgress();
  }

  function updateProgress(game = A.game, ids = A.packIds) {
    const prog = store.progress();
    const played = game.deck.played;
    for (const id of ids) {
      const cards = packs.peek(id);
      if (cards) prog[id] = cards.reduce((n, c) => n + (played.has(c.id) ? 1 : 0), 0);
    }
    store.saveProgress(prog);
  }
  A.updateProgress = updateProgress;

  function gameHooks() {
    return {
      onChange: persist,
      onEvent: (type) => {
        if (type === 'zeitum') feedback.timeUp();
      },
    };
  }

  async function buildDeck(ids) {
    const cards = await packs.loadCards(ids);
    if (!cards.length) throw new Error('Die gewählten Kartenpakete sind leer.');
    const played = store.played();
    return createDeck(cards, {
      played,
      onReshuffle: () => {
        store.savePlayed(played);
        toast('Alle Karten gespielt – die Karten werden neu gemischt.', { kind: 'warn' });
      },
    });
  }

  A.buildDeck = buildDeck;

  async function startGame() {
    const ids = [...A.selection].filter((id) => A.index.some((p) => p.id === id));
    if (!ids.length) return;
    try {
      const deck = await buildDeck(ids);
      A.packIds = ids;
      A.game = createGame({ teams: A.teams, settings: { ...A.settings }, deck, ...gameHooks() });
      persist();
      go('game');
    } catch (e) {
      toast(e.message || 'Spiel konnte nicht gestartet werden.', { kind: 'warn' });
    }
  }

  async function resumeGame() {
    const saved = store.game();
    if (!saved || !saved.game) return;
    try {
      const deck = await buildDeck(saved.packs);
      A.packIds = saved.packs;
      A.game = restoreGame(saved.game, { deck, ...gameHooks() });
      go('game');
    } catch (e) {
      toast('Spiel konnte nicht fortgesetzt werden: ' + (e.message || e), { kind: 'warn' });
    }
  }

  function leaveGame({ clear = false } = {}) {
    wake.off();
    if (clear) {
      store.clearGame();
    } else if (A.game) {
      store.saveGame({ game: A.game.toJSON(), packs: A.packIds });
    }
    store.flushPlayed();
    A.game = null;
    zug.stop();
    go('start');
  }
  A.leaveGame = leaveGame;
  A.newGameSameSetup = async () => {
    store.clearGame();
    await startGame();
  };

  const zug = createZugView(A);

  /* ---------- router ---------- */

  function go(screen) {
    A.screen = screen;
    if (screen === 'mp-room') mp.beforeRoom();
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    view.replaceChildren();
    view.className = 'view screen-' + A.screen;
    const fn = { start, teams, packs: packsScreen, settings, reports, 'mp-packs': () => packsScreen({ back: 'mp-room', label: 'Fertig', onDone: () => mp.packsDone() }), ...mp.screens }[A.screen];
    const isMp = A.screen.startsWith('mp-');
    if (A.screen !== 'game') {
      zug.stop();
      if (!isMp) wake.off();
    }
    if (A.screen === 'game') {
      view.append(zug.render());
    } else {
      view.append(fn());
    }
    mp.updateChrome();
  }

  /* ---------- start ---------- */

  function start() {
    const saved = store.game();
    const resumable = saved && saved.game && saved.game.phase !== 'ende' && !A.game;
    let resumeInfo = '';
    if (resumable) {
      const g = saved.game;
      resumeInfo = g.teams.map((t, i) => `${t.name} ${g.scores[i]}`).join(' : ') + ` · Runde ${Math.floor(g.turnIndex / g.teams.length) + 1}`;
    }
    return h('main', { class: 'start' },
      h('div', { class: 'logo', 'aria-label': 'Psst!' },
        h('div', { class: 'logo-bubble' }, h('span', { class: 'logo-text', text: 'Psst!' }), h('span', { class: 'logo-hand', 'aria-hidden': 'true', text: '\u{1F92B}' })),
      ),
      h('p', { class: 'tagline', text: 'Umschreiben, ohne die Tabuwörter zu sagen. Ein Handy, mehrere Teams, ein Raum.' }),
      h('div', { class: 'stack' },
        resumable
          ? h('button', { class: 'btn btn-primary btn-xl', type: 'button', onClick: resumeGame },
            h('span', { text: 'Spiel fortsetzen' }), h('small', { text: resumeInfo }))
          : null,
        h('button', { class: 'btn btn-xl ' + (resumable ? '' : 'btn-primary'), type: 'button', onClick: () => go('teams'), text: 'Spiel mit einem Handy' }),
        h('button', { class: 'btn btn-xl', type: 'button', onClick: () => go('mp-start') },
          h('span', { text: 'Mehrere Handys (Online)' }), h('small', { text: 'Jeder mit dem eigenen Handy, optional Fernseher' })),
        h('button', { class: 'btn btn-xl', type: 'button', onClick: () => { A.back = 'start'; go('settings'); }, text: 'Einstellungen' }),
      ),
      packs.demo ? h('p', { class: 'note', text: 'Hinweis: Es werden Demo-Karten verwendet.' }) : null,
    );
  }

  /* ---------- teams ---------- */

  function teams() {
    const T = A.teams;
    const save = () => store.saveTeams(T);
    const nextFreeColor = (i) => {
      const used = new Set(T.filter((_, j) => j !== i).map((t) => t.color));
      const start = TEAM_COLORS.indexOf(T[i].color);
      for (let k = 1; k <= TEAM_COLORS.length; k++) {
        const c = TEAM_COLORS[(start + k) % TEAM_COLORS.length];
        if (!used.has(c)) return c;
      }
      return T[i].color;
    };
    const redraw = () => { save(); render(); };

    const cards = T.map((t, i) => {
      const nameIn = h('input', {
        class: 'input', type: 'text', value: t.name, maxLength: 18, 'aria-label': `Name von Team ${i + 1}`, autocomplete: 'off', enterKeyHint: 'done',
        onInput: (e) => { t.name = e.target.value; save(); },
        onChange: (e) => { if (!t.name.trim()) { t.name = 'Team ' + (i + 1); e.target.value = t.name; save(); } },
      });
      const playerIn = h('input', { class: 'input', type: 'text', maxLength: 16, placeholder: 'Spielername', 'aria-label': `Spieler hinzufügen für ${t.name}`, autocomplete: 'off', enterKeyHint: 'done' });
      const addPlayer = () => {
        const v = playerIn.value.trim();
        if (!v) return;
        t.players = [...(t.players || []), v];
        redraw();
      };
      playerIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addPlayer(); } });
      const n = (t.players || []).length;
      return h('section', { class: 'team-card', style: { '--tc': t.color } },
        h('div', { class: 'team-row' },
          h('button', { class: 'color-dot', type: 'button', 'aria-label': `Farbe von ${t.name} ändern`, onClick: () => { t.color = nextFreeColor(i); redraw(); } }),
          nameIn,
          T.length > 2 ? h('button', { class: 'icon-btn small', type: 'button', 'aria-label': `${t.name} entfernen`, text: '×', onClick: () => { T.splice(i, 1); redraw(); } }) : null,
        ),
        h('details', { class: 'players', open: n > 0 },
          h('summary', { text: n ? `Spieler (${n})` : 'Spielernamen (optional)' }),
          h('div', { class: 'chips' }, (t.players || []).map((p, k) =>
            h('span', { class: 'chip' }, p, h('button', { type: 'button', 'aria-label': `${p} entfernen`, text: '×', onClick: () => { t.players.splice(k, 1); redraw(); } })))),
          h('div', { class: 'add-row' }, playerIn, h('button', { class: 'btn', type: 'button', text: 'Hinzufügen', onClick: addPlayer })),
          h('small', { class: 'hint', text: 'Mit Namen wechseln Erklärer und Wächter reihum. Ohne Namen heißt es nur „Team … ist dran“.' }),
        ),
      );
    });

    const s = A.settings;
    const modeBox = section('Spielmodus',
      segmented([{ value: 'punkte', label: 'Punkteziel' }, { value: 'runden', label: 'Runden' }, { value: 'frei', label: 'Frei' }], s.mode, (v) => { s.mode = v; saveSettings(); render(); }, { label: 'Spielmodus' }),
      s.mode === 'punkte' ? field('Punkteziel', 'Wer es erreicht, beendet die laufende Runde.', stepper(s.target, { min: 5, max: 200, step: 5 }, (v) => { s.target = v; saveSettings(); render(); })) : null,
      s.mode === 'runden' ? field('Anzahl Runden', 'Jedes Team hat pro Runde einen Zug.', stepper(s.rounds, { min: 1, max: 30 }, (v) => { s.rounds = v; saveSettings(); render(); })) : null,
      s.mode === 'frei' ? h('p', { class: 'hint', text: 'Du beendest das Spiel selbst über die Punktetafel.' }) : null,
      h('button', { class: 'link', type: 'button', text: 'Weitere Regeln ›', onClick: () => { A.back = 'teams'; go('settings'); } }),
    );

    return h('main', { class: 'page' },
      topbar('Teams', () => go('start')),
      h('div', { class: 'scroll' }, ...cards,
        T.length < 4 ? h('button', { class: 'btn btn-add', type: 'button', text: '+ Team hinzufügen', onClick: () => {
          const used = new Set(T.map((t) => t.color));
          T.push({ name: 'Team ' + (T.length + 1), color: TEAM_COLORS.find((c) => !used.has(c)) || TEAM_COLORS[0], players: [] });
          redraw();
        } }) : null,
        modeBox),
      h('footer', { class: 'actionbar' },
        h('button', { class: 'btn btn-primary btn-xl', type: 'button', text: 'Weiter zu den Kartenpaketen', onClick: () => { store.saveTeams(T); go('packs'); } })),
    );
  }

  /* ---------- Kartenpakete ---------- */

  function packsScreen(o = {}) {
    const body = h('div', { class: 'scroll' });
    const startBtn = h('button', { class: 'btn btn-primary btn-xl', type: 'button', text: o.label || 'Spiel starten', onClick: o.onDone || startGame });
    const info = h('div', { class: 'sel-info' });
    const bar = h('footer', { class: 'actionbar' }, info, startBtn);

    const refreshBar = () => {
      const n = [...A.selection].filter((id) => A.index && A.index.some((p) => p.id === id)).length;
      startBtn.disabled = n === 0;
      info.textContent = n === 0 ? 'Wähle mindestens ein Kartenpaket.' : `${n} ${n === 1 ? 'Paket' : 'Pakete'} gewählt`;
    };

    const buildTiles = () => {
      body.replaceChildren();
      if (A.indexError) {
        body.append(h('p', { class: 'note', text: 'Kartenpakete konnten nicht geladen werden. Bist du offline und hast die App noch nie online geöffnet?' }),
          h('button', { class: 'btn', type: 'button', text: 'Erneut versuchen', onClick: () => loadIndex().then(() => render()) }));
        return;
      }
      if (!A.index) { body.append(h('p', { class: 'note', text: 'Lade Kartenpakete …' })); return; }
      const prog = store.progress();
      const tile = (p, i) => {
        const done = Math.min(prog[p.id] || 0, p.count);
        const on = A.selection.has(p.id);
        const stars = packStars(p);
        return h('button', {
          type: 'button', class: 'tile' + (on ? ' on' : ''), style: { '--tile': TILE_COLORS[i % TILE_COLORS.length] },
          role: 'checkbox', 'aria-checked': String(on), 'aria-label': `${p.name}, ${done} von ${p.count} gespielt`,
          onClick: () => {
            on ? A.selection.delete(p.id) : A.selection.add(p.id);
            store.savePackSelection([...A.selection]);
            buildTiles(); refreshBar();
          },
        },
          h('span', { class: 'tile-check', 'aria-hidden': 'true', text: '✓' }),
          h('span', { class: 'tile-icon', 'aria-hidden': 'true', text: p.icon || '\u{1F0CF}' }),
          h('span', { class: 'tile-name', text: p.name }),
          stars ? h('span', { class: 'tile-stars', 'aria-label': `Schwierigkeit ${stars} von 3`, text: '★'.repeat(stars) + '☆'.repeat(3 - stars) }) : h('span', { class: 'tile-stars blank' }),
          h('span', { class: 'tile-prog' }, h('span', { text: `${done} / ${p.count}` }), h('span', { class: 'bar' }, h('i', { style: { width: (p.count ? (100 * done) / p.count : 0) + '%' } }))),
        );
      };
      const withIdx = A.index.map((p, i) => ({ p, i }));
      const mk = (title, kind) => {
        const list = withIdx.filter((x) => x.p.kind === kind);
        if (!list.length) return;
        body.append(h('h2', { class: 'group', text: title }), h('div', { class: 'tiles' }, list.map((x) => tile(x.p, x.i))));
      };
      mk('Nach Schwierigkeit', 'difficulty');
      mk('Nach Thema', 'topic');
      if (packs.demo) body.append(h('p', { class: 'note', text: 'Demo-Karten: Die echten Kartenpakete fehlen noch.' }));
    };

    buildTiles();
    refreshBar();
    if (!A.index && !A.indexError) loadIndex().then(() => { if (A.screen === 'packs') { buildTiles(); refreshBar(); } });
    return h('main', { class: 'page' }, topbar('Kartenpakete', () => go(o.back || 'teams')), body, bar);
  }

  async function loadIndex() {
    A.indexError = null;
    try {
      A.index = await packs.loadIndex();
      // forget selected packs that no longer exist
      A.selection = new Set([...A.selection].filter((id) => A.index.some((p) => p.id === id)));
    } catch (e) {
      A.indexError = e;
    }
  }

  /* ---------- settings ---------- */

  function settings() {
    const s = A.settings;
    const set = (k, v) => { s[k] = v; saveSettings(); render(); };
    const customDur = !DURATIONS.includes(s.turnSecs);
    const durBox = section('Zugdauer',
      segmented([...DURATIONS.map((d) => ({ value: d, label: d + ' s' })), { value: 'custom', label: 'Eigene' }], customDur ? 'custom' : s.turnSecs,
        (v) => set('turnSecs', v === 'custom' ? 75 : v), { label: 'Zugdauer', cls: 'wrap' }),
      customDur ? field('Eigene Dauer', 'in Sekunden', stepper(s.turnSecs, { min: 10, max: 300, step: 5, suffix: ' s' }, (v) => set('turnSecs', v))) : null,
    );
    const skipBox = section('Überspringen',
      field('Überspringer-Kontingent', s.skipMode === 'turn' ? 'wird jeden Zug neu aufgefüllt' : 'gilt pro Team für das ganze Spiel',
        segmented([{ value: 'turn', label: 'Pro Zug' }, { value: 'game', label: 'Pro Spiel' }], s.skipMode, (v) => set('skipMode', v), { label: 'Kontingent-Modus' })),
      field('Freie Überspringer', null,
        segmented(FREE_SKIPS.map((n) => ({ value: n, label: n < 0 ? '∞' : String(n) })), s.skipFree, (v) => set('skipFree', v), { label: 'Freie Überspringer' })),
      field('Danach pro Überspringer', null,
        segmented([{ value: 0, label: 'Kein Abzug' }, { value: 1, label: '−1 Punkt' }], s.skipPenalty, (v) => set('skipPenalty', v), { label: 'Strafe' })),
    );
    const buzzBox = section('Buzzer',
      switchRow('Buzzer pausiert das Spiel', 'Die Uhr hält an, der Wächter und der Erklärer klären: Bestätigt oder Einspruch.', s.buzzPause, (v) => set('buzzPause', v)),
      field('Abzug pro Buzzer', null,
        segmented([{ value: 1, label: '−1 Punkt' }, { value: 0, label: 'Kein Abzug' }], s.buzzPenalty, (v) => set('buzzPenalty', v), { label: 'Buzzer-Abzug' })),
    );
    const feelBox = section('Töne und Vibration',
      switchRow('Töne', 'Ticken, Buzzer, Zeit um', s.sound, (v) => { s.sound = v; saveSettings(); feedback.unlock(); render(); if (v) feedback.correct(); }),
      switchRow('Vibration', 'wenn das Gerät es kann', s.vibrate, (v) => { s.vibrate = v; saveSettings(); render(); if (v) navigator.vibrate && navigator.vibrate(30); }),
    );
    const modeBox = section('Spielmodus (Voreinstellung)',
      segmented([{ value: 'punkte', label: 'Punkteziel' }, { value: 'runden', label: 'Runden' }, { value: 'frei', label: 'Frei' }], s.mode, (v) => set('mode', v), { label: 'Spielmodus' }),
      s.mode === 'punkte' ? field('Punkteziel', null, stepper(s.target, { min: 5, max: 200, step: 5 }, (v) => set('target', v))) : null,
      s.mode === 'runden' ? field('Anzahl Runden', null, stepper(s.rounds, { min: 1, max: 30 }, (v) => set('rounds', v))) : null,
    );

    const progList = h('div', { class: 'prog-list' });
    const fillProg = () => {
      progList.replaceChildren();
      const prog = store.progress();
      if (!A.index) return;
      for (const p of A.index) {
        progList.append(h('div', { class: 'prog-row' },
          h('span', { class: 'prog-name', text: `${p.icon || ''} ${p.name}` }),
          h('span', { class: 'prog-n', text: `${Math.min(prog[p.id] || 0, p.count)} / ${p.count}` }),
          h('button', { class: 'btn small', type: 'button', text: 'Zurücksetzen', 'aria-label': `Fortschritt von ${p.name} zurücksetzen`, onClick: async () => {
            try {
              const cards = await packs.loadPack(p.id);
              store.resetPlayed(cards.map((c) => c.id));
              const pr = store.progress(); pr[p.id] = 0; store.saveProgress(pr);
              toast(`Fortschritt von „${p.name}“ zurückgesetzt.`);
              render();
            } catch { toast('Zurücksetzen fehlgeschlagen.', { kind: 'warn' }); }
          } })));
      }
    };
    if (!A.index) loadIndex().then(() => { if (A.screen === 'settings') fillProg(); });
    fillProg();
    const resetBox = section('Fortschritt',
      h('p', { class: 'hint', text: 'Gespielte Karten kommen erst wieder, wenn alle Karten der gewählten Pakete dran waren.' }),
      progList,
      h('button', { class: 'btn btn-danger', type: 'button', text: 'Alles zurücksetzen', onClick: () => {
        confirmSheet('Fortschritt aller Kartenpakete zurücksetzen?', 'Zurücksetzen', () => {
          store.resetPlayed('all'); store.saveProgress({});
          toast('Fortschritt zurückgesetzt.'); render();
        });
      } }),
    );
    const nRep = store.reports().length;
    const repBox = section('Gemeldete Karten',
      h('button', { class: 'btn', type: 'button', text: `Gemeldete Karten (${nRep})`, onClick: () => go('reports') }));

    return h('main', { class: 'page' },
      topbar('Einstellungen', () => go(A.back || 'start')),
      h('div', { class: 'scroll' }, durBox, skipBox, buzzBox, feelBox, modeBox, resetBox, repBox,
        h('p', { class: 'note', text: 'Psst! · Karten aus offenen Quellen, Lizenzen siehe games/psst/data/QUELLEN.md' })),
    );
  }

  function confirmSheet(text, okLabel, onOk) {
    sheet({ title: 'Bist du sicher?', body: h('p', { text }), actions: [{ label: 'Abbrechen', kind: 'ghost' }, { label: okLabel, kind: 'danger', onClick: onOk }] });
  }
  A.confirm = confirmSheet;

  /* ---------- Karte melden ---------- */

  function openReport(card, { onClose = null } = {}) {
    let reason = 'falsch';
    const note = h('input', { class: 'input', type: 'text', maxLength: 140, placeholder: 'Notiz (optional)', 'aria-label': 'Notiz', autocomplete: 'off' });
    const seg = h('div');
    const drawSeg = () => seg.replaceChildren(segmented(REPORT_REASONS.map((r) => ({ value: r, label: r })), reason, (v) => { reason = v; drawSeg(); }, { cls: 'wrap', label: 'Grund' }));
    drawSeg();
    sheet({
      title: 'Karte melden',
      onClose,
      body: h('div', { class: 'stack tight' }, h('p', { class: 'report-word', text: card.w }), seg, note),
      actions: [
        { label: 'Abbrechen', kind: 'ghost' },
        { label: 'Melden', kind: 'primary', onClick: () => { store.addReport({ cardId: card.id, w: card.w, reason, note: note.value.trim() }); toast('Danke, die Karte ist gemeldet.', { kind: 'good' }); } },
      ],
    });
  }

  function reports() {
    const list = store.reports();
    const code = h('textarea', { class: 'code', readOnly: true, rows: 4, 'aria-label': 'Melde-Code', hidden: true });
    return h('main', { class: 'page' },
      topbar('Gemeldete Karten', () => go('settings')),
      h('div', { class: 'scroll' },
        list.length ? h('ul', { class: 'rep-list' }, list.map((r, i) =>
          h('li', {}, h('div', {}, h('b', { text: r.w || r.cardId }), h('small', { text: ` ${r.reason}${r.note ? ' – ' + r.note : ''}` })),
            h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Meldung löschen', text: '×', onClick: () => { store.removeReport(i); render(); } }))))
          : h('p', { class: 'note', text: 'Noch keine Karten gemeldet. Tippe im Spiel auf die Flagge an der Karte.' }),
        list.length ? h('div', { class: 'stack tight' },
          h('button', { class: 'btn btn-primary', type: 'button', text: 'Export-Code anzeigen und kopieren', onClick: async () => {
            const c = store.exportReports();
            code.value = c; code.hidden = false; code.select();
            let ok = false;
            try { await navigator.clipboard.writeText(c); ok = true; } catch { try { ok = document.execCommand('copy'); } catch { /* ignore */ } }
            toast(ok ? 'Code kopiert. Schick ihn dem Entwickler.' : 'Bitte den Code markieren und kopieren.');
          } }),
          code,
          h('button', { class: 'btn btn-danger', type: 'button', text: 'Alle löschen', onClick: () => confirmSheet('Alle Meldungen löschen?', 'Löschen', () => { store.clearReports(); render(); }) }),
        ) : null),
    );
  }

  /* ---------- boot ---------- */

  const mp = createMultiplayer(A);
  A.mp = mp;
  loadIndex();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (A.game && A.game.phase === 'laeuft') { A.game.pausieren(); if (A.screen === 'game') render(); }
      store.flushPlayed();
    }
  });
  addEventListener('pagehide', () => store.flushPlayed());
  render();
  mp.boot(); // ?raum=CODE opens the join screen, an interrupted multiplayer game resumes
  return A;
}
