// Psst! game screens: handover (bereit), Zug (läuft/pausiert), Zeit um, Zusammenfassung, Punktetafel, Ende.
import { h, txt, setCls, setStyle } from '../../engine/ui/dom.js';
import { formatPoints, zugDeltas } from './logic.js';
import { sheet } from './widgets.js';
import { confetti } from './confetti.js';

const RESULT_LABEL = { richtig: 'Richtig', uebersprungen: 'Übersprungen', buzzer: 'Buzzer' };
const RESULT_ICON = { richtig: '✓', uebersprungen: '↷', buzzer: '✕' };

export function createZugView(A) {
  let timer = null;
  let live = null; // elements updated by the timer loop
  let buzzSheet = null;
  let pickSheet = null; // Jeder gegen jeden: "Wer hat es erraten?"
  let stopConfetti = null;
  let celebrated = null; // game object we already played the win sound for
  let lastSec = null;

  const g = () => A.game;
  const rerender = () => A.render();
  const teamOf = (i) => g().teams[i];
  const tcStyle = (i) => ({ '--tc': teamOf(i).color });

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    live = null;
    if (buzzSheet) { buzzSheet.close(); buzzSheet = null; }
    if (pickSheet) { pickSheet.close(); pickSheet = null; }
    if (stopConfetti) { stopConfetti(); stopConfetti = null; }
    A.wake.off();
  }

  function render() {
    if (timer) clearInterval(timer);
    timer = null;
    live = null;
    if (buzzSheet) { const b = buzzSheet; buzzSheet = null; b.close(); }
    if (pickSheet) { const b = pickSheet; pickSheet = null; b.close(); }
    if (stopConfetti) { stopConfetti(); stopConfetti = null; }
    const game = g();
    const ph = game.phase;
    if (ph === 'laeuft' || ph === 'pausiert') A.wake.on(); else A.wake.off();
    switch (ph) {
      case 'bereit': return handover();
      case 'laeuft':
      case 'pausiert': return zugScreen();
      case 'vorbei': return timeUp();
      case 'zusammenfassung': return summary();
      case 'tabelle': return scoreboard();
      case 'ende': return finale();
      default: return h('main', { class: 'page' }, 'Unbekannte Phase');
    }
  }

  /* ---------- handover ---------- */

  function banner(game) {
    if (game.over) return null;
    if (game.state.verlaengerung) return h('div', { class: 'banner warn', text: 'Verlängerungsrunde nach Gleichstand' });
    if (game.lastRound) return h('div', { class: 'banner', text: 'Punkteziel erreicht – die Runde wird zu Ende gespielt' });
    if (game.settings.mode === 'runden') return h('div', { class: 'banner soft', text: `Runde ${game.round} von ${game.settings.rounds + game.state.extra}` });
    return h('div', { class: 'banner soft', text: `Runde ${game.round}` });
  }

  function miniScores(game) {
    return h('ul', { class: 'mini-scores' }, game.teams.map((t, i) =>
      h('li', { style: { '--tc': t.color } }, h('span', { class: 'dot' }), h('span', { class: 'nm', text: t.name }), h('b', { text: String(game.scores[i]) }))));
  }

  function handover() {
    const game = g();
    const info = game.turnInfo();
    const team = teamOf(info.team);
    const guard = teamOf(info.guardTeam);
    const first = game.state.turnIndex === 0;
    const roles = [];
    if (game.ffa) {
      roles.push(
        h('p', { class: 'role' }, h('small', { text: 'Erklärer' }), h('b', { text: info.erklaerer })),
        h('p', { class: 'role' }, h('small', { text: 'Wächter' }), h('b', { text: info.waechter })),
        h('p', { class: 'role' }, h('small', { text: 'Raten' }), h('b', { text: info.raterNames.join(', ') })));
    } else if (info.erklaerer) roles.push(h('p', { class: 'role' }, h('small', { text: 'Erklärer' }), h('b', { text: info.erklaerer }), h('span', { class: 'of', text: `(${team.name})` })));
    else roles.push(h('p', { class: 'role solo' }, h('b', { text: `${team.name} ist dran` })));
    if (game.ffa) { /* roles listed above */ } else if (info.waechter) roles.push(h('p', { class: 'role' }, h('small', { text: 'Wächter' }), h('b', { text: info.waechter }), h('span', { class: 'of', text: `(${guard.name})` })));
    else if (info.erklaerer) roles.push(h('p', { class: 'role dim' }, h('small', { text: 'Wächter' }), h('b', { text: `ein Spieler von ${guard.name}` })));
    else roles.push(h('p', { class: 'role dim' }, h('small', { text: 'Wächter' }), h('b', { text: guard.name })));
    return h('main', { class: 'handover', style: tcStyle(info.team) },
      banner(game),
      h('div', { class: 'ho-main' },
        h('p', { class: 'eyebrow', text: first ? 'Los geht’s' : 'Handy weitergeben' }),
        h('h1', { text: first ? `${team.name} beginnt` : `Weiter: ${team.name}` }),
        h('div', { class: 'roles' }, roles),
        h('p', { class: 'hint', text: `Zug: ${game.settings.turnSecs} Sekunden. Die Karte bleibt verdeckt, bis der Erklärer „Bereit“ tippt.${game.ffa ? ' Rater: nicht aufs Handy schauen.' : ''}` }),
      ),
      miniScores(game),
      h('button', { class: 'btn btn-team btn-xxl', type: 'button', text: 'Bereit', onClick: () => { A.feedback.unlock(); game.bereit(); rerender(); } }),
      h('div', { class: 'ho-links' },
        h('button', { class: 'link', type: 'button', text: 'Hauptmenü', onClick: () => A.leaveGame() }),
        h('button', { class: 'link', type: 'button', text: 'Spiel beenden', onClick: () => A.confirm('Das Spiel jetzt beenden? Der aktuelle Punktestand entscheidet.', 'Beenden', () => { game.beenden(); rerender(); }) }),
      ),
    );
  }

  /* ---------- Zug ---------- */

  function tabooList(card, cls = '') {
    return h('ul', { class: 'taboo ' + cls, 'aria-label': 'Tabuwörter' }, card.t.map((w) => h('li', { text: w })));
  }

  function zugScreen() {
    const game = g();
    const z = game.zug;
    const team = teamOf(z.team);
    const paused = game.phase === 'pausiert';
    const buzzOpen = paused && z.pause === 'buzzer';
    const card = z.current;
    const sc = game.zugScore();
    const si = game.skipInfo();

    const secEl = h('span', { class: 'sec', text: String(game.secondsLeft()) });
    const barEl = h('i');
    const scoreEl = h('b', { text: formatPoints(sc.points) });
    live = { secEl, barEl, scoreEl, total: game.settings.turnSecs * 1000 };

    const skipSub = si.unlimited ? 'unbegrenzt frei' : si.free > 0 ? `noch ${si.free} frei` : si.penalty ? `−${si.penalty} Punkt` : 'kein Abzug';
    const act = (fn, snd) => () => { A.feedback.unlock(); fn(); snd && snd(); rerender(); };

    const mute = h('button', { class: 'icon-btn', type: 'button', 'aria-label': A.settings.sound ? 'Ton ausschalten' : 'Ton einschalten', text: A.settings.sound ? '\u{1F50A}' : '\u{1F507}',
      onClick: () => { A.settings.sound = !A.settings.sound; A.store.saveSettings(A.settings); rerender(); } });
    const pauseBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Pause', text: '⏸', disabled: paused, onClick: () => { game.pausieren(); rerender(); } });

    const cardEl = h('article', { class: 'card' + (paused ? ' hidden-card' : ''), 'aria-live': 'polite' },
      h('button', { class: 'flag', type: 'button', 'aria-label': 'Karte melden', text: '⚑', disabled: buzzOpen, onClick: () => {
        const wasRunning = game.phase === 'laeuft';
        if (wasRunning) game.pausieren();
        A.openReport(card, { onClose: () => { if (wasRunning && game.phase === 'pausiert' && game.zug.pause === 'app') game.fortsetzen(); rerender(); } });
      } }),
      h('h2', { class: 'word', text: card.w }),
      tabooList(card),
    );

    const main = h('main', { class: 'zug', style: tcStyle(z.team) },
      h('header', { class: 'zug-top' },
        game.ffa ? null : h('span', { class: 'chip-team', text: team.name }),
        game.ffa ? h('span', { class: 'who', text: `${z.erklaerer} erklärt · Wächter ${z.waechter}` }) : z.erklaerer ? h('span', { class: 'who', text: z.erklaerer }) : null,
        h('span', { class: 'live-score', title: 'Punkte in diesem Zug' }, scoreEl),
        mute, pauseBtn),
      h('div', { class: 'clock' }, secEl, h('span', { class: 'bar' }, barEl)),
      cardEl,
      h('div', { class: 'actions' },
        h('button', { class: 'btn-act ok', type: 'button', disabled: paused,
          onClick: game.ffa && z.raters.length > 1 ? () => { A.feedback.unlock(); openPicker(); } : act(() => game.richtig(), () => A.feedback.correct()) },
          h('span', { class: 'big', text: 'Richtig' })),
        h('button', { class: 'btn-act skip', type: 'button', disabled: paused, onClick: act(() => game.ueberspringen(), () => A.feedback.skip()) },
          h('span', { class: 'big', text: 'Überspringen' }), h('small', { text: skipSub })),
        h('button', { class: 'btn-act buzz', type: 'button', disabled: paused, onClick: act(() => game.buzzer(), () => A.feedback.buzzer()) },
          h('span', { class: 'big', text: 'Buzzer' }), h('small', { text: 'Tabuwort gesagt' })),
      ),
    );

    if (paused && !buzzOpen) {
      main.append(h('div', { class: 'pause-cover' },
        h('div', { class: 'pause-box' },
          h('h2', { text: 'Pausiert' }),
          h('p', { text: `Noch ${game.secondsLeft()} Sekunden.` }),
          h('button', { class: 'btn btn-team btn-xl', type: 'button', text: 'Weiter', onClick: () => { game.fortsetzen(); rerender(); } }),
          h('button', { class: 'link', type: 'button', text: 'Hauptmenü (Spiel bleibt gespeichert)', onClick: () => A.leaveGame() }),
        )));
    }

    lastSec = game.secondsLeft();
    updateClock();
    if (game.phase === 'laeuft') timer = setInterval(loop, 100);
    if (buzzOpen) openBuzzDialog(card);
    return main;
  }

  /** Jeder gegen jeden: the Erklärer names the Rater who guessed the card. */
  function openPicker() {
    const game = g();
    const z = game.zug;
    if (pickSheet || game.phase !== 'laeuft') return;
    const ref = z.current;
    const body = h('div', { class: 'pick-grid' }, z.raters.map((u) => h('button', {
      class: 'btn btn-xl pick-btn', type: 'button', style: tcStyle(u), text: teamOf(u).name,
      onClick: () => {
        pickSheet.close();
        if (game.phase !== 'laeuft' || game.zug.current !== ref) return; // the card changed meanwhile (time up): nothing to score
        A.feedback.correct();
        game.richtig(u);
        rerender();
      },
    })));
    const sh = sheet({ title: 'Wer hat es erraten?', cls: 'pick-sheet', body, actions: [{ label: 'Abbrechen', kind: 'ghost' }], onClose: () => { if (pickSheet === sh) pickSheet = null; } });
    pickSheet = sh;
  }

  function updateClock() {
    if (!live) return;
    const game = g();
    const ms = game.timeLeft();
    const s = Math.ceil(ms / 1000);
    txt(live.secEl, String(s));
    setStyle(live.barEl, 'width', (100 * ms) / live.total + '%');
    setCls(live.secEl, 'low', s <= 10);
    setCls(live.barEl, 'low', s <= 10);
  }

  function loop() {
    const game = g();
    if (!game || game.phase !== 'laeuft') return;
    if (game.tick()) { rerender(); return; }
    updateClock();
    const s = game.secondsLeft();
    if (s !== lastSec) {
      lastSec = s;
      if (s <= 10 && s > 0) A.feedback.tick(s <= 3);
    }
  }

  function openBuzzDialog(card) {
    const game = g();
    const pen = game.settings.buzzPenalty;
    const fin = (fn) => () => { fn(); buzzSheet = null; rerender(); };
    buzzSheet = sheet({
      title: 'Tabuwort gesagt?',
      cls: 'buzz-sheet',
      dismissible: false,
      body: h('div', { class: 'buzz-body' }, h('p', { class: 'buzz-word', text: card.w }), tabooList(card, 'small'), h('p', { class: 'hint', text: 'Die Uhr steht. Wächter und Erklärer klären kurz.' })),
      actions: [
        { label: pen ? `Bestätigt (−${pen} Punkt)` : 'Bestätigt (kein Abzug)', kind: 'danger', onClick: fin(() => game.buzzerBestaetigt()) },
        { label: 'Einspruch – weiter mit dieser Karte', kind: 'primary', onClick: fin(() => game.einspruchWeiter()) },
        { label: 'Einspruch – neue Karte', kind: 'primary', onClick: fin(() => game.einspruchNeueKarte()) },
      ],
    });
  }

  /* ---------- Zeit um ---------- */

  function timeUp() {
    const game = g();
    const z = game.zug;
    const team = teamOf(z.team);
    const sc = game.zugScore();
    const btn = h('button', { class: 'btn btn-team btn-xxl', type: 'button', text: 'Zur Zusammenfassung', disabled: true, onClick: () => { game.zusammenfassung(); rerender(); } });
    setTimeout(() => { btn.disabled = false; }, 800); // guard against a late Richtig tap landing here
    return h('main', { class: 'timeup', style: tcStyle(z.team) },
      h('div', { class: 'ho-main' },
        h('p', { class: 'eyebrow', text: team.name }),
        h('h1', { class: 'zeit', text: 'Zeit um!' }),
        h('p', { class: 'tally' }, h('b', { text: String(sc.guessed) }), ' richtig · ', h('b', { text: String(sc.skipped) }), ' übersprungen · ', h('b', { text: String(sc.buzzed) }), ' Buzzer'),
        h('p', { class: 'hint', text: 'Die Karte, die gerade offen war, zählt nicht.' }),
      ),
      btn,
    );
  }

  /* ---------- Zusammenfassung ---------- */

  function summary() {
    const game = g();
    const z = game.zug;
    const team = teamOf(z.team);
    const sc = game.summaryScore();
    const rows = z.cards.map((e, i) => {
      const per = sc.per[i];
      const ptxt = e.result === 'uebersprungen' ? (per.free ? 'frei, 0 Punkte' : per.points ? `${formatPoints(per.points)} Punkt` : '0 Punkte') : `${formatPoints(per.points)} Punkt${Math.abs(per.points) === 1 ? '' : 'e'}`;
      return h('li', { class: 'sum-row r-' + e.result },
        h('div', { class: 'sum-line' },
          h('b', { class: 'sum-word', text: e.card.w }),
          h('div', { class: 'tri', role: 'radiogroup', 'aria-label': `Ergebnis für ${e.card.w}` },
            ['richtig', 'uebersprungen', 'buzzer'].map((r) => h('button', {
              type: 'button', role: 'radio', 'aria-checked': String(e.result === r), 'aria-label': RESULT_LABEL[r], class: 'tri-btn t-' + r + (e.result === r ? ' on' : ''), text: RESULT_ICON[r],
              onClick: () => { game.korrigiere(i, r); rerender(); },
            })))),
        h('div', { class: 'sum-sub' },
          h('span', { text: `${RESULT_LABEL[e.result]} · ${ptxt}` }),
          h('button', { class: 'mini-link', type: 'button', text: '⚑ melden', 'aria-label': `Karte ${e.card.w} melden`, onClick: () => A.openReport(e.card) })),
        game.ffa && e.result === 'richtig' && z.raters.length > 1
          ? h('div', { class: 'guess-chips', role: 'radiogroup', 'aria-label': `Erraten von, ${e.card.w}` },
            h('small', { text: 'Erraten von' }),
            z.raters.map((u) => h('button', {
              type: 'button', role: 'radio', 'aria-checked': String(e.guesser === u), class: 'chip-pick' + (e.guesser === u ? ' on' : ''), style: tcStyle(u), text: teamOf(u).name,
              onClick: () => { game.korrigiere(i, 'richtig', u); rerender(); },
            })))
          : game.ffa && e.result === 'richtig' ? h('div', { class: 'guess-chips' }, h('small', { text: `Erraten von ${teamOf(z.raters[0]).name}` })) : null,
      );
    });
    return h('main', { class: 'page summary', style: tcStyle(z.team) },
      h('header', { class: 'sum-head' },
        h('p', { class: 'eyebrow', text: game.ffa ? `Zusammenfassung · ${team.name}` : `Zusammenfassung · ${team.name}${z.erklaerer ? ' (' + z.erklaerer + ')' : ''}` }),
        h('h1', { class: 'sum-total' }, h('span', { text: formatPoints(sc.points) }), h('small', { text: ' Punkte' })),
        h('p', { class: 'hint', text: 'Falsch getippt? Tippe auf das richtige Symbol: ✓ richtig, ↷ übersprungen, ✕ Buzzer.' + (game.ffa ? ' Bei ✓ kannst du ändern, wer erraten hat.' : '') }),
      ),
      h('div', { class: 'scroll' }, rows.length ? h('ul', { class: 'sum-list' }, rows) : h('p', { class: 'note', text: 'In diesem Zug wurde keine Karte gespielt.' })),
      h('footer', { class: 'actionbar' },
        sc.missing ? h('small', { class: 'mp-note err', role: 'alert', text: `Bei ${sc.missing === 1 ? 'einer Karte' : sc.missing + ' Karten'} fehlt noch, wer erraten hat.` }) : null,
        h('button', { class: 'btn btn-team btn-xl', type: 'button', text: 'Bestätigen', disabled: sc.missing > 0, onClick: () => { game.bestaetigen(); rerender(); } })),
    );
  }

  /* ---------- Punktetafel ---------- */

  function scoreboard() {
    const game = g();
    const S = game.state;
    const last = S.log[S.log.length - 1];
    const lead = Math.max(...game.scores);
    const target = game.settings.mode === 'punkte' ? game.settings.target : 0;
    const deltas = last ? zugDeltas(last) : {};
    const rows = game.teams.map((t, i) => h('li', { class: 'score-row' + (game.scores[i] === lead ? ' lead' : ''), style: { '--tc': t.color } },
      h('span', { class: 'dot' }),
      h('div', { class: 'sr-main' },
        h('b', { text: t.name }),
        target ? h('span', { class: 'bar' }, h('i', { style: { width: Math.max(0, Math.min(100, (100 * game.scores[i]) / target)) + '%' } })) : null),
      deltas[i] !== undefined && (game.ffa || last.team === i) ? h('span', { class: 'delta', text: formatPoints(deltas[i]) }) : null,
      h('b', { class: 'sr-score', text: String(game.scores[i]) })));
    const next = game.turnInfo(S.turnIndex + 1);
    let msg = null;
    if (game.over) msg = h('div', { class: 'banner', text: 'Das Spiel ist entschieden!' });
    else if (S.verlaengerung) msg = h('div', { class: 'banner warn', text: 'Gleichstand! Es folgt eine Verlängerungsrunde.' });
    else if (game.lastRound) msg = h('div', { class: 'banner', text: 'Punkteziel erreicht – die Runde wird zu Ende gespielt.' });
    else if (target) msg = h('div', { class: 'banner soft', text: `Ziel: ${target} Punkte` });
    return h('main', { class: 'page' },
      h('header', { class: 'sum-head' },
        h('p', { class: 'eyebrow', text: game.settings.mode === 'runden' ? `Nach Runde ${Math.floor(S.turnIndex / game.teams.length) + 1}${game.over ? '' : ' (Zug ' + (S.turnIndex % game.teams.length + 1) + ')'}` : 'Punktestand' }),
        h('h1', { text: 'Punktetafel' })),
      h('div', { class: 'scroll' }, msg, h('ul', { class: 'score-list' }, rows)),
      h('footer', { class: 'actionbar' },
        h('button', { class: 'btn btn-team btn-xl', type: 'button', style: tcStyle(game.over ? S.log[S.log.length - 1].team : next.team),
          text: game.over ? 'Zum Ergebnis' : `Weiter: ${teamOf(next.team).name}`, onClick: () => { game.weiter(); rerender(); } }),
        game.over ? null : h('button', { class: 'link', type: 'button', text: 'Spiel beenden', onClick: () => A.confirm('Das Spiel jetzt beenden? Der aktuelle Punktestand entscheidet.', 'Beenden', () => { game.beenden(); rerender(); }) }),
      ),
    );
  }

  /* ---------- Ende ---------- */

  function finale() {
    const game = g();
    const w = game.winners;
    const names = w.map((i) => teamOf(i).name);
    const color = teamOf(w[0]).color;
    const stand = game.standings();
    const best = game.bestErklaerer();
    const canvas = h('canvas', { class: 'confetti', 'aria-hidden': 'true' });
    if (celebrated !== game) { celebrated = game; A.feedback.win(); }
    setTimeout(() => { if (canvas.isConnected) stopConfetti = confetti(canvas); }, 50);
    const ffa = game.ffa;
    const table = h('table', { class: 'stats' },
      h('thead', {}, h('tr', {}, h('th', { text: ffa ? 'Spieler' : 'Team' }), h('th', { text: 'Punkte' }), h('th', { title: ffa ? 'erklärt' : 'richtig', text: '✓' }),
        ffa ? h('th', { title: 'erraten', text: '★' }) : null, h('th', { title: 'übersprungen', text: '↷' }), h('th', { title: 'Buzzer', text: '✕' }))),
      h('tbody', {}, stand.map((r) => h('tr', { class: w.includes(r.team) ? 'win' : '', style: { '--tc': r.color } },
        h('td', {}, h('span', { class: 'dot' }), ' ', r.name), h('td', { text: String(r.score) }), h('td', { text: String(r.guessed) }),
        ffa ? h('td', { text: String(r.solved || 0) }) : null, h('td', { text: String(r.skipped) }), h('td', { text: String(r.buzzed) })))));
    return h('main', { class: 'finale', style: { '--tc': color } },
      canvas,
      h('div', { class: 'ho-main' },
        h('p', { class: 'trophy', 'aria-hidden': 'true', text: '\u{1F3C6}' }),
        h('p', { class: 'eyebrow', text: w.length > 1 ? 'Unentschieden' : 'Gewonnen!' }),
        h('h1', { text: w.length > 1 ? names.join(' & ') : names[0] }),
        h('p', { class: 'final-score', text: `${game.scores[w[0]]} Punkte` }),
        best ? h('p', { class: 'best', text: ffa ? `Bester Erklärer: ${best.name} mit ${best.guessed} richtigen Karten` : `Bester Erklärer: ${best.name} (${teamOf(best.team).name}) mit ${best.guessed} richtigen Karten` }) : null,
        table,
        ffa ? h('p', { class: 'hint', text: '✓ erklärt · ★ erraten · ↷ übersprungen · ✕ Buzzer' }) : null,
      ),
      h('div', { class: 'stack' },
        h('button', { class: 'btn btn-team btn-xl', type: 'button', text: game.ffa ? 'Nochmal mit denselben Spielern' : 'Nochmal mit denselben Teams', onClick: () => { A.newGameSameSetup(); } }),
        h('button', { class: 'btn btn-xl', type: 'button', text: 'Hauptmenü', onClick: () => A.leaveGame({ clear: true }) }),
      ),
    );
  }

  return { render, stop };
}
