// Psst! multiplayer screens: renders the VIEW a device received (views.js) for its role.
// Erklärer: Karte + Richtig/Überspringen. Wächter: Karte + großer Buzzer. Rater/Zuschauer: Uhr, Team, Punkte, nie die Karte.
// Anzeige (Fernseher): große Punktetafel im Querformat, nie die aktuelle Karte.
//
// `session` = { view, act(t, extra), remaining() -> ms, connection(), isHost, host? } (client.js)
import { h, txt, setCls, setStyle } from '../../engine/ui/dom.js';
import { formatPoints } from './logic.js';
import { sheet } from './widgets.js';
import { confetti } from './confetti.js';

const RESULT_LABEL = { richtig: 'Richtig', uebersprungen: 'Übersprungen', buzzer: 'Buzzer' };
const RESULT_ICON = { richtig: '✓', uebersprungen: '↷', buzzer: '✕' };

/** Stable text of what is on screen: equal signature = no need to rebuild the DOM. The running clock is not part of it. */
export function viewSignature(v) {
  if (!v) return '';
  const c = { ...v };
  if (c.timer) c.timer = c.timer.endsAt == null ? { left: c.timer.leftMs } : { run: 1, total: c.timer.totalMs };
  return JSON.stringify(c);
}

export function createMpViews(ctx) {
  let timer = null;
  let live = null;
  let buzzSheet = null; // { seq, sheet }
  let stopConfetti = null;
  let lastSec = null;
  let prev = null; // previous view, for sounds
  let celebrated = false;

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    live = null;
    if (buzzSheet) {
      buzzSheet.sheet.close();
      buzzSheet = null;
    }
    if (stopConfetti) {
      stopConfetti();
      stopConfetti = null;
    }
    prev = null;
    celebrated = false;
  }

  const fb = () => ctx.feedback;
  const tcStyle = (v, i) => ({ '--tc': (v.teams[i] || v.teams[0]).color });
  const teamName = (v, i) => (v.teams[i] || {}).name || '';

  /* ---------- building blocks ---------- */

  function banner(v) {
    if (v.over) return null;
    const b = v.banner;
    if (b.verlaengerung) return h('div', { class: 'banner warn', text: 'Verlängerungsrunde nach Gleichstand' });
    if (b.lastRound) return h('div', { class: 'banner', text: 'Punkteziel erreicht – die Runde wird zu Ende gespielt' });
    if (b.mode === 'runden') return h('div', { class: 'banner soft', text: `Runde ${b.round} von ${b.rounds}` });
    return h('div', { class: 'banner soft', text: `Runde ${b.round}` });
  }
  const miniScores = (v) =>
    h('ul', { class: 'mini-scores' }, v.teams.map((t) => h('li', { style: { '--tc': t.color } }, h('span', { class: 'dot' }), h('span', { class: 'nm', text: t.name }), h('b', { text: String(t.score) }))));
  const tabooList = (card, cls = '') => h('ul', { class: 'taboo ' + cls, 'aria-label': 'Tabuwörter' }, card.t.map((w) => h('li', { text: w })));

  /** Menu button for the Gastgeber (room code, devices, end game). */
  const hostMenuBtn = (session) => (session.isHost ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Gastgeber-Menü', text: '⋯', onClick: () => ctx.openHostMenu() }) : null);

  /** Buttons are locked until the next view arrives (a guest's tap needs a round trip); unlocked again after 1.5 s in case it got lost. */
  function once(btn, fn) {
    btn.addEventListener('click', () => {
      if (btn.dataset.busy) return;
      fb().unlock();
      fn();
      if (!btn.isConnected) return;
      btn.dataset.busy = '1';
      btn.classList.add('busy');
      setTimeout(() => {
        delete btn.dataset.busy;
        btn.classList.remove('busy');
      }, 1500);
    });
    return btn;
  }

  /* ---------- router ---------- */

  function render(session) {
    if (timer) clearInterval(timer);
    timer = null;
    live = null;
    const v = session.view;
    if (stopConfetti) {
      stopConfetti();
      stopConfetti = null;
    }
    const before = prev;
    prev = v;
    // sound cues on phase changes
    if (before && v) cues(before, v);
    const needBuzz = v && v.kind === 'game' && v.role !== 'anzeige' && v.zug && v.zug.pause === 'buzzer' && v.phase === 'pausiert';
    if (!needBuzz && buzzSheet) {
      buzzSheet.sheet.close();
      buzzSheet = null;
    }
    if (v && v.kind === 'game') {
      if (v.role === 'anzeige') return tv(v, session);
      if (v.phase === 'laeuft' || v.phase === 'pausiert' || v.phase === 'bereit') ctx.wakeOn();
      switch (v.phase) {
        case 'bereit': return handover(v, session);
        case 'laeuft':
        case 'pausiert': return zugScreen(v, session, needBuzz);
        case 'vorbei': return timeUp(v, session);
        case 'zusammenfassung': return summary(v, session);
        case 'tabelle': return scoreboard(v, session);
        case 'ende': return finale(v, session);
        default: return h('main', { class: 'page' }, 'Unbekannte Phase');
      }
    }
    return h('main', { class: 'page' }, h('p', { class: 'note', text: 'Lade …' }));
  }

  function cues(a, b) {
    if (b.kind !== 'game' || a.kind !== 'game' || b.role === 'anzeige') return;
    if (b.phase === 'vorbei' && a.phase !== 'vorbei') fb().timeUp();
    if (b.zug && b.zug.pause === 'buzzer' && !(a.zug && a.zug.pause === 'buzzer')) fb().buzzer();
    if (b.phase === 'ende' && a.phase !== 'ende' && !celebrated) {
      celebrated = true;
      fb().win();
    }
  }

  /* ---------- handover ("Du bist dran – Bereit?") ---------- */

  function handover(v, session) {
    const t = v.turn;
    const team = v.teams[t.team];
    const first = v.banner.round === 1 && v.teams.every((x) => x.score === 0) && v.turn.team === 0;
    const me = v.role === 'erklaerer';
    const guardName = v.turn.waechter;
    const roles = [h('p', { class: 'role' }, h('small', { text: 'Erklärer' }), h('b', { text: me ? 'Du' : t.erklaerer }), h('span', { class: 'of', text: `(${team.name})` }))];
    const guards = v.teams.filter((_, i) => i !== t.team).map((x) => x.name).join(' & ');
    roles.push(h('p', { class: 'role dim' }, h('small', { text: 'Wächter' }), h('b', { text: guardName || `alle von ${guards}` })));
    const hint = {
      erklaerer: `Zug: ${v.settings.turnSecs} Sekunden. Die Karte bleibt verdeckt, bis du „Bereit“ tippst.`,
      waechter: `Du bist Wächter: Gleich siehst du die Karte und drückst den Buzzer, wenn ${t.erklaerer} ein Tabuwort sagt.`,
      zuschauer: 'Du schaust diesen Zug zu.',
      rater: `Du rätst mit. ${t.erklaerer} erklärt, du siehst die Karte nicht.`,
    }[v.role];
    const extra = [];
    if (session.isHost && !me && v.erklaerer && !v.erklaerer.connected) {
      extra.push(h('div', { class: 'mp-warn' },
        h('b', { text: `${t.erklaerer} ist offline.` }),
        h('div', { class: 'stack tight' },
          h('button', { class: 'btn', type: 'button', text: `Für ${t.erklaerer} starten`, onClick: () => session.act('bereit') }),
          h('button', { class: 'btn', type: 'button', text: 'Anderen Erklärer aus dem Team wählen', onClick: () => session.host.substitute() }))));
    }
    return h('main', { class: 'handover', style: tcStyle(v, t.team) },
      h('div', { class: 'mp-topline' }, banner(v), hostMenuBtn(session)),
      h('div', { class: 'ho-main' },
        h('p', { class: 'eyebrow', text: me ? 'Du bist dran' : first ? 'Los geht’s' : 'Als Nächstes' }),
        h('h1', { text: me ? `${team.name}: Du erklärst!` : `${t.erklaerer} erklärt gleich …` }),
        h('div', { class: 'roles' }, roles),
        h('p', { class: 'hint', text: hint }),
        ...extra),
      miniScores(v),
      me
        ? once(h('button', { class: 'btn btn-team btn-xxl', type: 'button', text: 'Bereit' }), () => session.act('bereit'))
        : h('div', { class: 'mp-wait', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), `Warte auf ${t.erklaerer} …`),
    );
  }

  /* ---------- Zug ---------- */

  function zugScreen(v, session, buzzOpen) {
    const z = v.zug;
    const team = v.teams[z.team];
    const paused = v.phase === 'pausiert';
    const role = v.role;
    const secEl = h('span', { class: 'sec', text: String(Math.ceil(session.remaining() / 1000)) });
    const barEl = h('i');
    const scoreEl = h('b', { text: formatPoints(z.points) });
    live = { secEl, barEl, total: v.timer.totalMs, role };
    const whoText = role === 'erklaerer' ? 'Du erklärst' : `${z.erklaerer} erklärt`;
    const top = h('header', { class: 'zug-top' },
      h('span', { class: 'chip-team', text: team.name }),
      h('span', { class: 'who', text: whoText }),
      h('span', { class: 'live-score', title: 'Punkte in diesem Zug' }, scoreEl),
      role === 'erklaerer' ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Pause', text: '⏸', disabled: paused, onClick: () => session.act('pause') }) : null,
      hostMenuBtn(session));
    const clock = h('div', { class: 'clock' }, secEl, h('span', { class: 'bar' }, barEl));
    let body;
    if (role === 'erklaerer') body = erklaererBody(v, session, paused, buzzOpen);
    else if (role === 'waechter') body = waechterBody(v, session, paused, buzzOpen);
    else body = raterBody(v, role);
    const main = h('main', { class: 'zug mp-zug role-' + role, style: tcStyle(v, z.team) }, top, clock, ...body);
    if (paused && !buzzOpen) {
      main.append(h('div', { class: 'pause-cover' },
        h('div', { class: 'pause-box' },
          h('h2', { text: 'Pausiert' }),
          h('p', { text: `Noch ${Math.ceil(session.remaining() / 1000)} Sekunden.` }),
          role === 'erklaerer' || session.isHost
            ? h('button', { class: 'btn btn-team btn-xl', type: 'button', text: 'Weiter', onClick: () => session.act('fortsetzen') })
            : h('p', { class: 'hint', text: `${z.erklaerer} macht gleich weiter.` }))));
    }
    lastSec = Math.ceil(session.remaining() / 1000);
    updateClock(session);
    if (v.phase === 'laeuft') timer = setInterval(() => loop(session), 100);
    if (buzzOpen) openBuzzDialog(v, session);
    return main;
  }

  function erklaererBody(v, session, paused, buzzOpen) {
    const card = v.card;
    const si = v.skip || { free: 0, unlimited: false, penalty: 0 };
    const skipSub = si.unlimited ? 'unbegrenzt frei' : si.free > 0 ? `noch ${si.free} frei` : si.penalty ? `−${si.penalty} Punkt` : 'kein Abzug';
    const cardEl = h('article', { class: 'card' + (!card ? ' hidden-card' : ''), 'aria-live': 'polite' },
      card ? h('button', { class: 'flag', type: 'button', 'aria-label': 'Karte melden', text: '⚑', disabled: buzzOpen, onClick: () => {
        const wasRunning = v.phase === 'laeuft';
        if (wasRunning) session.act('pause');
        ctx.openReport({ id: card.id, w: card.w }, { onClose: () => { if (wasRunning) session.act('fortsetzen'); } });
      } }) : null,
      h('h2', { class: 'word', text: card ? card.w : '…' }),
      card ? tabooList(card) : null);
    const ref = card ? card.id : '';
    const dis = paused || !card;
    return [
      cardEl,
      h('div', { class: 'actions' },
        once(h('button', { class: 'btn-act ok', type: 'button', disabled: dis }, h('span', { class: 'big', text: 'Richtig' })), () => { session.act('richtig', { ref }); fb().correct(); }),
        once(h('button', { class: 'btn-act skip', type: 'button', disabled: dis }, h('span', { class: 'big', text: 'Überspringen' }), h('small', { text: skipSub })), () => { session.act('ueberspringen', { ref }); fb().skip(); }),
      ),
    ];
  }

  function waechterBody(v, session, paused, buzzOpen) {
    const card = v.card;
    const cardEl = h('article', { class: 'card mp-card-watch' + (!card ? ' hidden-card' : '') },
      h('p', { class: 'mp-eyebrow', text: `${v.zug.erklaerer} erklärt – du passt auf` }),
      h('h2', { class: 'word', text: card ? card.w : '…' }),
      card ? tabooList(card) : null);
    const ref = card ? card.id : '';
    return [
      cardEl,
      h('p', { class: 'mp-count', text: `Erraten: ${v.zug.guessed}` }),
      once(h('button', { class: 'btn-act buzz mp-buzz', type: 'button', disabled: paused || !card || buzzOpen }, h('span', { class: 'big', text: 'Buzzer' }), h('small', { text: 'Tabuwort gesagt' })),
        () => session.act('buzzer', { ref })),
    ];
  }

  function raterBody(v, role) {
    const z = v.zug;
    return [
      h('div', { class: 'mp-rater' },
        h('p', { class: 'mp-eyebrow', text: role === 'rater' ? `Du rätst mit ${z.erklaerer}` : `${z.erklaerer} erklärt – du schaust zu` }),
        h('p', { class: 'mp-count-big' }, h('small', { text: 'Erraten' }), h('b', { text: String(z.guessed) })),
        h('p', { class: 'hint', text: role === 'rater' ? 'Die Karte sehen nur Erklärer und Wächter. Hör gut zu!' : 'Du hast in diesem Zug keine Aufgabe.' }),
        v.zug.pause === 'buzzer' ? h('p', { class: 'mp-pause-note', text: 'Pause – Buzzer!' }) : null),
    ];
  }

  function updateClock(session) {
    if (!live) return;
    const ms = session.remaining();
    const s = Math.ceil(ms / 1000);
    txt(live.secEl, String(s));
    setStyle(live.barEl, 'width', Math.min(100, (100 * ms) / live.total) + '%');
    setCls(live.secEl, 'low', s <= 10);
    setCls(live.barEl, 'low', s <= 10);
    return s;
  }
  function loop(session) {
    const s = updateClock(session);
    if (s !== lastSec) {
      lastSec = s;
      if (live && live.role === 'erklaerer' && s <= 10 && s > 0) fb().tick(s <= 3);
    }
  }

  function openBuzzDialog(v, session) {
    const z = v.zug;
    if (buzzSheet && buzzSheet.seq === z.buzz.seq) return;
    if (buzzSheet) buzzSheet.sheet.close();
    const pen = v.settings.buzzPenalty;
    const ref = z.buzz.seq;
    const act = (t) => () => { session.act(t, { ref }); };
    const card = v.card;
    const s = sheet({
      title: 'Buzzer!',
      cls: 'buzz-sheet',
      dismissible: false,
      body: h('div', { class: 'buzz-body' },
        h('p', { class: 'hint', text: `${z.buzz.by || 'Ein Wächter'}: „Tabuwort gesagt!“` }),
        card ? h('p', { class: 'buzz-word', text: card.w }) : null,
        card ? tabooList(card, 'small') : null,
        h('p', { class: 'hint', text: 'Die Uhr steht. Wer zuerst tippt, entscheidet.' })),
      actions: [
        { label: pen ? `Bestätigt (−${pen} Punkt)` : 'Bestätigt (kein Abzug)', kind: 'danger', onClick: act('buzzer-bestaetigen') },
        { label: 'Einspruch – weiter mit dieser Karte', kind: 'primary', onClick: act('einspruch-weiter') },
        { label: 'Einspruch – neue Karte', kind: 'primary', onClick: act('einspruch-neu') },
      ],
    });
    buzzSheet = { seq: z.buzz.seq, sheet: s };
  }

  /* ---------- Zeit um / Zusammenfassung / Tafel / Ende ---------- */

  function timeUp(v, session) {
    const z = v.zug;
    const me = v.role === 'erklaerer';
    const btn = h('button', { class: 'btn btn-team btn-xxl', type: 'button', text: 'Zur Zusammenfassung', disabled: true });
    once(btn, () => session.act('zusammenfassung'));
    setTimeout(() => { if (!btn.dataset.busy) btn.disabled = false; }, 800); // a late Richtig tap must not land here
    return h('main', { class: 'timeup', style: tcStyle(v, z.team) },
      h('div', { class: 'mp-topline' }, hostMenuBtn(session)),
      h('div', { class: 'ho-main' },
        h('p', { class: 'eyebrow', text: teamName(v, z.team) }),
        h('h1', { class: 'zeit', text: 'Zeit um!' }),
        h('p', { class: 'tally' }, h('b', { text: String(z.guessed) }), ' richtig · ', h('b', { text: String(z.skipped) }), ' übersprungen · ', h('b', { text: String(z.buzzed) }), ' Buzzer'),
        h('p', { class: 'hint', text: 'Die Karte, die gerade offen war, zählt nicht.' })),
      me || session.isHost ? btn : h('div', { class: 'mp-wait', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), `${z.erklaerer} sieht sich die Zusammenfassung an …`),
    );
  }

  function summary(v, session) {
    const z = v.zug;
    const me = v.role === 'erklaerer';
    const editable = me;
    const rows = v.words.map((e, i) => {
      const ptxt = e.result === 'uebersprungen' ? (e.free ? 'frei, 0 Punkte' : e.points ? `${formatPoints(e.points)} Punkt` : '0 Punkte') : `${formatPoints(e.points)} Punkt${Math.abs(e.points) === 1 ? '' : 'e'}`;
      return h('li', { class: 'sum-row r-' + e.result },
        h('div', { class: 'sum-line' },
          h('b', { class: 'sum-word', text: e.w }),
          editable
            ? h('div', { class: 'tri', role: 'radiogroup', 'aria-label': `Ergebnis für ${e.w}` }, ['richtig', 'uebersprungen', 'buzzer'].map((r) => h('button', {
              type: 'button', role: 'radio', 'aria-checked': String(e.result === r), 'aria-label': RESULT_LABEL[r], class: 'tri-btn t-' + r + (e.result === r ? ' on' : ''), text: RESULT_ICON[r],
              onClick: () => session.act('korrektur', { index: i, result: r }),
            })))
            : h('span', { class: 'tri-static t-' + e.result, 'aria-label': RESULT_LABEL[e.result], text: RESULT_ICON[e.result] })),
        h('div', { class: 'sum-sub' },
          h('span', { text: `${RESULT_LABEL[e.result]} · ${ptxt}` }),
          editable ? h('button', { class: 'mini-link', type: 'button', text: '⚑ melden', 'aria-label': `Karte ${e.w} melden`, onClick: () => ctx.openReport({ id: e.id, w: e.w }) }) : null));
    });
    return h('main', { class: 'page summary', style: tcStyle(v, z.team) },
      h('header', { class: 'sum-head' },
        h('div', { class: 'mp-topline' }, hostMenuBtn(session)),
        h('p', { class: 'eyebrow', text: `Zusammenfassung · ${teamName(v, z.team)}${z.erklaerer ? ' (' + z.erklaerer + ')' : ''}` }),
        h('h1', { class: 'sum-total' }, h('span', { text: formatPoints(z.points) }), h('small', { text: ' Punkte' })),
        h('p', { class: 'hint', text: editable ? 'Falsch getippt? Tippe auf das richtige Symbol: ✓ richtig, ↷ übersprungen, ✕ Buzzer.' : `${z.erklaerer} prüft die Karten und bestätigt.` })),
      h('div', { class: 'scroll' }, rows.length ? h('ul', { class: 'sum-list' }, rows) : h('p', { class: 'note', text: 'In diesem Zug wurde keine Karte gespielt.' })),
      h('footer', { class: 'actionbar' },
        me || session.isHost
          ? once(h('button', { class: 'btn btn-team btn-xl', type: 'button', text: me ? 'Bestätigen' : `Für ${z.erklaerer} bestätigen` }), () => session.act('bestaetigen'))
          : h('div', { class: 'mp-wait', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), `Warte auf ${z.erklaerer} …`)),
    );
  }

  function scoreRows(v) {
    const lead = Math.max(...v.teams.map((t) => t.score));
    const target = v.banner.target;
    return v.teams.map((t, i) => h('li', { class: 'score-row' + (t.score === lead ? ' lead' : ''), style: { '--tc': t.color } },
      h('span', { class: 'dot' }),
      h('div', { class: 'sr-main' }, h('b', { text: t.name }), target ? h('span', { class: 'bar' }, h('i', { style: { width: Math.max(0, Math.min(100, (100 * t.score) / target)) + '%' } })) : null),
      v.last && v.last.team === i ? h('span', { class: 'delta', text: formatPoints(v.last.points) }) : null,
      h('b', { class: 'sr-score', text: String(t.score) })));
  }

  function scoreboard(v, session) {
    const target = v.banner.target;
    let msg = null;
    if (v.over) msg = h('div', { class: 'banner', text: 'Das Spiel ist entschieden!' });
    else if (v.banner.verlaengerung) msg = h('div', { class: 'banner warn', text: 'Gleichstand! Es folgt eine Verlängerungsrunde.' });
    else if (v.banner.lastRound) msg = h('div', { class: 'banner', text: 'Punkteziel erreicht – die Runde wird zu Ende gespielt.' });
    else if (target) msg = h('div', { class: 'banner soft', text: `Ziel: ${target} Punkte` });
    const nextTeam = v.over ? v.last.team : v.next.team;
    return h('main', { class: 'page', style: tcStyle(v, nextTeam) },
      h('header', { class: 'sum-head' },
        h('div', { class: 'mp-topline' }, hostMenuBtn(session)),
        h('p', { class: 'eyebrow', text: 'Punktestand' }),
        h('h1', { text: 'Punktetafel' })),
      h('div', { class: 'scroll' }, msg, h('ul', { class: 'score-list' }, scoreRows(v)),
        v.words && v.words.length ? h('p', { class: 'hint center', text: 'Erraten: ' + v.words.filter((w) => w.result === 'richtig').map((w) => w.w).join(', ') }) : null),
      h('footer', { class: 'actionbar' },
        v.canWeiter
          ? once(h('button', { class: 'btn btn-team btn-xl', type: 'button', text: v.over ? 'Zum Ergebnis' : `Weiter: ${teamName(v, v.next.team)}${v.next.erklaerer ? ' (' + v.next.erklaerer + ')' : ''}` }), () => session.act('weiter'))
          : h('div', { class: 'mp-wait', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), `Gleich geht’s weiter – ${v.weiterNames.slice(-1)[0] || 'der Gastgeber'} tippt auf „Weiter“.`),
        session.isHost && !v.over ? h('button', { class: 'link', type: 'button', text: 'Spiel beenden', onClick: () => ctx.confirm('Das Spiel jetzt beenden? Der aktuelle Punktestand entscheidet.', 'Beenden', () => session.act('beenden')) }) : null),
    );
  }

  function finale(v, session) {
    const names = v.winners.map((i) => teamName(v, i));
    const color = v.teams[v.winners[0]].color;
    const canvas = h('canvas', { class: 'confetti', 'aria-hidden': 'true' });
    setTimeout(() => { if (canvas.isConnected) stopConfetti = confetti(canvas); }, 50);
    const table = h('table', { class: 'stats' },
      h('thead', {}, h('tr', {}, h('th', { text: 'Team' }), h('th', { text: 'Punkte' }), h('th', { title: 'richtig', text: '✓' }), h('th', { title: 'übersprungen', text: '↷' }), h('th', { title: 'Buzzer', text: '✕' }))),
      h('tbody', {}, v.standings.map((r) => h('tr', { class: v.winners.includes(r.team) ? 'win' : '', style: { '--tc': r.color } },
        h('td', {}, h('span', { class: 'dot' }), ' ', r.name), h('td', { text: String(r.score) }), h('td', { text: String(r.guessed) }), h('td', { text: String(r.skipped) }), h('td', { text: String(r.buzzed) })))));
    return h('main', { class: 'finale', style: { '--tc': color } },
      canvas,
      h('div', { class: 'ho-main' },
        h('p', { class: 'trophy', 'aria-hidden': 'true', text: '\u{1F3C6}' }),
        h('p', { class: 'eyebrow', text: v.winners.length > 1 ? 'Unentschieden' : 'Gewonnen!' }),
        h('h1', { text: v.winners.length > 1 ? names.join(' & ') : names[0] }),
        h('p', { class: 'final-score', text: `${v.teams[v.winners[0]].score} Punkte` }),
        v.best ? h('p', { class: 'best', text: `Bester Erklärer: ${v.best.name} (${teamName(v, v.best.team)}) mit ${v.best.guessed} richtigen Karten` }) : null,
        table),
      session.isHost
        ? h('div', { class: 'stack' },
          h('button', { class: 'btn btn-team btn-xl', type: 'button', text: 'Nochmal mit denselben Teams', onClick: () => ctx.rematch() }),
          h('button', { class: 'btn btn-xl', type: 'button', text: 'Zurück zur Lobby', onClick: () => ctx.toLobby() }),
          h('button', { class: 'link', type: 'button', text: 'Raum schließen', onClick: () => ctx.closeRoom() }))
        : h('div', { class: 'stack' },
          h('div', { class: 'mp-wait', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Der Gastgeber startet die nächste Partie …'),
          h('button', { class: 'link', type: 'button', text: 'Raum verlassen', onClick: () => ctx.leave() })),
    );
  }

  /* ---------- Anzeige (Fernseher) ---------- */

  function tvScore(v) {
    const lead = Math.max(...v.teams.map((t) => t.score));
    return h('ol', { class: 'tv-scores' }, v.teams.map((t, i) => h('li', { class: (t.score === lead && lead > 0 ? 'lead ' : '') + (v.zug && v.zug.team === i && v.phase !== 'tabelle' ? 'active' : ''), style: { '--tc': t.color } },
      h('span', { class: 'tv-dot' }), h('span', { class: 'tv-name', text: t.name }), h('b', { class: 'tv-pts', text: String(t.score) }))));
  }

  function tv(v, session) {
    const z = v.zug;
    const t = v.turn;
    const teamIdx = z ? z.team : t.team;
    const left = [];
    let cls = 'tv tv-' + v.phase;
    const roundLine = h('p', { class: 'tv-eyebrow', text: v.banner.mode === 'runden' ? `Runde ${v.banner.round} von ${v.banner.rounds}` : `Runde ${v.banner.round}${v.banner.target ? ' · Ziel ' + v.banner.target : ''}` });
    if (v.phase === 'bereit') {
      left.push(roundLine, h('p', { class: 'tv-small', text: 'Als Nächstes' }), h('h1', { class: 'tv-team', text: teamName(v, t.team) }), h('p', { class: 'tv-who', text: `${t.erklaerer} erklärt gleich …` }),
        h('p', { class: 'tv-small', text: `Wächter: ${t.waechter || v.teams.filter((_, i) => i !== t.team).map((x) => x.name).join(' & ')}` }));
    } else if (v.phase === 'laeuft' || v.phase === 'pausiert') {
      const secEl = h('div', { class: 'tv-clock', text: String(Math.ceil(session.remaining() / 1000)) });
      const barEl = h('i');
      live = { secEl, barEl, total: v.timer.totalMs, role: 'anzeige' };
      const buzz = v.phase === 'pausiert' && z.pause === 'buzzer';
      left.push(roundLine, h('h1', { class: 'tv-team', text: teamName(v, z.team) }), h('p', { class: 'tv-who', text: `${z.erklaerer} erklärt` }),
        secEl, h('div', { class: 'bar tv-bar' }, barEl),
        h('p', { class: 'tv-count' }, 'Erraten: ', h('b', { text: String(z.guessed) })));
      if (buzz) left.push(h('div', { class: 'tv-pause buzz', role: 'status' }, h('b', { text: 'Pause – Buzzer!' }), z.buzz.by ? h('span', { text: `${z.buzz.by} hat gebuzzert` }) : null));
      else if (v.phase === 'pausiert') left.push(h('div', { class: 'tv-pause', role: 'status' }, h('b', { text: 'Pause' })));
      lastSec = Math.ceil(session.remaining() / 1000);
      updateClock(session);
      if (v.phase === 'laeuft') timer = setInterval(() => loop(session), 100);
    } else if (v.phase === 'vorbei') {
      left.push(roundLine, h('h1', { class: 'tv-team', text: teamName(v, z.team) }), h('div', { class: 'tv-timeup', text: 'Zeit um!' }),
        h('p', { class: 'tv-count' }, h('b', { text: String(z.guessed) }), ' erraten'));
    } else if (v.phase === 'zusammenfassung' || v.phase === 'tabelle') {
      left.push(roundLine, h('h1', { class: 'tv-team', text: teamName(v, z.team) }),
        h('p', { class: 'tv-who' }, `${z.erklaerer}: `, h('b', { text: formatPoints(z.points) + ' Punkte' })),
        h('ul', { class: 'tv-words' }, (v.words || []).map((w) => h('li', { class: 'r-' + w.result }, h('span', { class: 'ic', text: RESULT_ICON[w.result] }), w.w))));
      if (v.phase === 'tabelle' && v.banner.lastRound) left.push(h('p', { class: 'tv-small', text: 'Punkteziel erreicht – die Runde wird zu Ende gespielt.' }));
    } else if (v.phase === 'ende') {
      cls += ' tv-win';
      const names = v.winners.map((i) => teamName(v, i));
      const canvas = h('canvas', { class: 'confetti', 'aria-hidden': 'true' });
      setTimeout(() => { if (canvas.isConnected) stopConfetti = confetti(canvas); }, 50);
      left.push(canvas, h('p', { class: 'tv-eyebrow', text: v.winners.length > 1 ? 'Unentschieden' : 'Gewonnen!' }), h('h1', { class: 'tv-team', text: names.join(' & ') }),
        h('p', { class: 'tv-who', text: `${v.teams[v.winners[0]].score} Punkte` }), v.best ? h('p', { class: 'tv-small', text: `Bester Erklärer: ${v.best.name} mit ${v.best.guessed} richtigen Karten` }) : null);
    }
    return h('main', { class: cls, style: tcStyle(v, teamIdx) },
      h('section', { class: 'tv-main' }, ...left),
      h('aside', { class: 'tv-side' }, h('p', { class: 'tv-eyebrow', text: 'Punkte' }), tvScore(v), h('p', { class: 'tv-code', text: 'Raum ' + v.code })));
  }

  return { render, stop, viewSignature };
}
