// Psst! multiplayer: what each device may see. Pure and DOM-free.
//   roleOf(S, id)        -> 'erklaerer' | 'waechter' | 'rater' | 'zuschauer' | 'anzeige' | 'lobby' | null
//   buildView(S, id, now) -> JSON view for exactly that device
// The Karte (Suchbegriff + Tabuwörter) is only ever part of the view of the Erklärer and the Wächter - never of Rater, Zuschauer or Anzeige.
// `S` is the host session state (see host.js): { phase, teams, players, options, settings, game, buzz, code, ... }.

import { zugDeltas } from './logic.js';

export const VIEW_VERSION = 1;

/** True when the running game is Jeder gegen jeden. */
export const isFfa = (g) => !!g && g.settings.form === 'ffa';

export function roleOf(S, id) {
  const P = S.players[id];
  if (!P) return null;
  if (P.kind === 'display') return 'anzeige';
  const g = S.game;
  if (S.phase !== 'game' || !g) return 'lobby';
  const info = g.turnInfo();
  if (isFfa(g)) return P.name === info.erklaerer ? 'erklaerer' : P.name === info.waechter ? 'waechter' : 'rater';
  if (P.team === info.team) return P.name === info.erklaerer ? 'erklaerer' : 'rater';
  if (S.options.oneGuard) return P.name === info.waechter && P.team === info.guardTeam ? 'waechter' : 'zuschauer';
  return 'waechter';
}

/** Id of the device that plays `name` in the running game (null when unknown). */
export const idOfName = (S, name) => (S.nameToId && S.nameToId[name]) || null;

const publicPlayer = (S, P) => ({ name: P.name, connected: !!P.connected, host: !!P.isHost });

function lobbyView(S, id) {
  const P = S.players[id];
  const teams = S.teams.map((t, i) => ({
    name: t.name,
    color: t.color,
    players: S.order.map((pid) => S.players[pid]).filter((p) => p && p.kind === 'player' && p.team === i).map((p) => ({ ...publicPlayer(S, p), me: p.id === id })),
  }));
  const loose = S.order.map((pid) => S.players[pid]).filter((p) => p && p.kind === 'player' && (p.team === null || p.team === undefined));
  return {
    kind: 'lobby',
    code: S.code,
    players: S.order.map((pid) => S.players[pid]).filter((p) => p && p.kind === 'player').map((p) => ({ ...publicPlayer(S, p), me: p.id === id })),
    you: { name: P.name, team: P.team ?? null, isHost: !!P.isHost, display: P.kind === 'display' },
    teams,
    loose: loose.map((p) => ({ ...publicPlayer(S, p), me: p.id === id })),
    displays: S.order.filter((pid) => S.players[pid] && S.players[pid].kind === 'display').length,
    settings: pickSettings(S.settings),
    options: { ...S.options },
    packLabels: S.packLabels || [],
    hostName: (S.players[S.hostId] || {}).name || '',
  };
}

const pickSettings = (s) => ({
  turnSecs: s.turnSecs,
  skipMode: s.skipMode,
  skipFree: s.skipFree,
  skipPenalty: s.skipPenalty,
  buzzPause: s.buzzPause,
  buzzPenalty: s.buzzPenalty,
  mode: s.mode,
  target: s.target,
  rounds: s.rounds,
  form: s.form === 'ffa' ? 'ffa' : 'teams',
});

/** Hint for the Gastgeber before a Zug: a team (or, in Jeder gegen jeden, the whole group) is too small to play it. */
function shortHanded(S, g, info) {
  const online = (name) => {
    const p = S.players[idOfName(S, name)];
    return !!(p && p.connected);
  };
  if (isFfa(g)) {
    const n = g.teams.filter((t) => online(t.players[0])).length;
    return n < 3 ? { kind: 'ffa', n, names: [], blocked: true } : null;
  }
  const small = g.teams.map((t, i) => ({ i, name: t.name, n: t.players.filter(online).length })).filter((t) => t.n < 2 && g.teams[t.i].players.length > 0);
  if (!small.length) return null;
  return { kind: 'team', n: 0, names: small.map((t) => `${t.name} (${t.n})`), blocked: small.some((t) => t.i === info.team) };
}

/** Build the view of device `id` at host time `nowMs`. */
export function buildView(S, id, nowMs) {
  const P = S.players[id];
  if (!P) return null;
  if (S.closed) return { kind: 'closed', code: S.code };
  if (S.phase !== 'game' || !S.game) return lobbyView(S, id);
  const g = S.game;
  const st = g.state;
  const ph = g.phase;
  const role = roleOf(S, id);
  const info = g.turnInfo();
  const next = g.turnInfo(st.turnIndex + 1);
  const z = g.zug;

  const v = {
    kind: 'game',
    role,
    phase: ph,
    code: S.code,
    form: isFfa(g) ? 'ffa' : 'teams',
    you: { name: P.name, team: isFfa(g) ? null : P.team ?? null, isHost: !!P.isHost },
    teams: g.teams.map((t, i) => ({ name: t.name, color: t.color, score: g.scores[i], players: t.players.slice() })),
    turn: {
      team: info.team, guardTeam: info.guardTeam, erklaerer: info.erklaerer, waechter: S.options.oneGuard || isFfa(g) ? info.waechter : null, round: info.round,
      ...(isFfa(g) ? { raters: info.raterNames } : {}),
    },
    next: { team: next.team, erklaerer: next.erklaerer },
    banner: {
      mode: g.settings.mode,
      round: g.round,
      rounds: g.settings.rounds + st.extra,
      target: g.settings.mode === 'punkte' ? g.settings.target : 0,
      lastRound: !!g.lastRound,
      verlaengerung: !!st.verlaengerung,
    },
    settings: pickSettings(g.settings),
    options: { ...S.options },
    over: !!g.over,
    offline: S.order.map((pid) => S.players[pid]).filter((p) => p && p.kind === 'player' && !p.connected).map((p) => p.name),
  };

  if (z && (ph === 'laeuft' || ph === 'pausiert' || ph === 'vorbei' || ph === 'zusammenfassung' || ph === 'tabelle')) {
    const sc = ph === 'zusammenfassung' || ph === 'tabelle' ? g.summaryScore() : g.zugScore();
    const left = g.timeLeft();
    v.zug = {
      team: z.team,
      erklaerer: z.erklaerer,
      points: sc.points,
      guessed: sc.guessed,
      skipped: sc.skipped,
      buzzed: sc.buzzed,
      pause: z.pause,
    };
    if (isFfa(g)) {
      v.zug.raters = z.raters.map((u) => g.teams[u].players[0]);
      v.zug.missing = sc.missing;
    }
    v.timer = { totalMs: g.settings.turnSecs * 1000, leftMs: left, endsAt: ph === 'laeuft' ? nowMs + left : null };
    if (z.pause === 'buzzer') v.zug.buzz = { seq: S.buzz.seq, by: S.buzz.by };

    // the Karte: Erklärer and Wächter only; hidden while the Zug is paused because the app went to the background
    const sees = role === 'erklaerer' || role === 'waechter';
    if (sees && z.current && (ph === 'laeuft' || (ph === 'pausiert' && z.pause === 'buzzer'))) {
      v.card = { id: z.current.id, w: z.current.w, t: z.current.t.slice() };
    }
    if (role === 'erklaerer' && ph !== 'tabelle') {
      const si = g.skipInfo();
      v.skip = { free: si.unlimited ? -1 : si.free, unlimited: si.unlimited, penalty: si.penalty };
    }
    // the cards of a finished Zug are public (summary, Anzeige list of guessed words)
    if (ph === 'zusammenfassung' || ph === 'tabelle') {
      v.words = z.cards.map((e, i) => ({ id: e.card.id, w: e.card.w, result: e.result, points: sc.per[i].points, free: sc.per[i].free, ...(isFfa(g) ? { guesser: e.result === 'richtig' && Number.isInteger(e.guesser) ? g.teams[e.guesser].players[0] : null } : {}) }));
    }
  }

  if (ph === 'tabelle') {
    const last = st.log[st.log.length - 1];
    v.last = last ? { team: last.team, points: last.points, erklaerer: last.erklaerer, deltas: zugDeltas(last), aussetzer: !!last.aussetzer } : null;
    const who = weiterWho(S);
    v.canWeiter = who.includes(id);
    v.weiterNames = who.map((x) => (S.players[x] || {}).name).filter(Boolean);
  }
  if (ph === 'bereit') {
    const eid = idOfName(S, info.erklaerer);
    v.erklaerer = { name: info.erklaerer, connected: !!(S.players[eid] && S.players[eid].connected) };
    v.warn = shortHanded(S, g, info);
  }
  if (ph === 'ende') {
    v.winners = g.winners.slice();
    v.standings = g.standings();
    const best = g.bestErklaerer();
    v.best = best ? { name: best.name, team: best.team, guessed: best.guessed } : null;
  }
  return v;
}

/** Devices that may press "Weiter" on the Punktetafel: the host, the Erklärer who just played and the next Erklärer. */
export function weiterWho(S) {
  const g = S.game;
  const out = new Set();
  if (S.hostId) out.add(S.hostId);
  if (!g) return [...out];
  const last = g.zug && idOfName(S, g.zug.erklaerer);
  if (last) out.add(last);
  const next = g.turnInfo(g.state.turnIndex + 1);
  const nid = idOfName(S, next.erklaerer);
  if (nid) out.add(nid);
  return [...out].filter((x) => S.players[x]);
}
