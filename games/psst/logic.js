// Psst! game logic: pure and DOM-free (runs in Node for tests). Deterministic with an injectable RNG and clock.
// Vocabulary follows GLOSSARY.md: Zug, Runde, Team, Erklärer, Wächter, Buzzer, Einspruch, Überspringen, Überspringer-Kontingent.
//
// Structure
//   mulberry32(seed)            seedable RNG
//   mergeCards(lists)           de-duplicate cards by id across Kartenpakete
//   createDeck(cards, opts)     card queue: no repeats (persisted played-set), reshuffles when exhausted
//   scoreZug(...)               pure scoring of one Zug (free skips, penalties) -> also used for live display and corrections
//   createGame(opts)/restoreGame  the state machine
//
// Phases:  bereit -> laeuft <-> pausiert -> vorbei -> zusammenfassung -> tabelle -> (bereit | ende)

export const DEFAULT_SETTINGS = Object.freeze({
  turnSecs: 60, // Zugdauer
  skipMode: 'turn', // Überspringer-Kontingent: 'turn' (jeden Zug neu) | 'game' (pro Team für das ganze Spiel)
  skipFree: 1, // freie Überspringer; -1 = unbegrenzt
  skipPenalty: 0, // Punkte Abzug pro Überspringer nach dem Kontingent (0 oder 1)
  buzzPause: true, // Buzzer pausiert das Spiel (Einspruch möglich)
  buzzPenalty: 1, // Punkte Abzug pro Buzzer
  sound: true,
  vibrate: true,
  mode: 'punkte', // Spielmodus: 'punkte' | 'runden' | 'frei'
  target: 30, // Punkteziel
  rounds: 5, // Rundenlimit
});

export const RESULTS = ['richtig', 'uebersprungen', 'buzzer'];

/* ---------- RNG ---------- */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- cards ---------- */

/** Combine several Kartenpakete (arrays of cards); a card that is in several packs appears once (first wins). */
export function mergeCards(lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const c of list) {
      if (!c || seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

/**
 * Card queue over the selected Kartenpakete.
 * `played` is a Set of card ids that were already shown (persisted by the caller, shared across all packs).
 * A card is marked played the moment it is drawn. When every card of the selection was played, the played marks of
 * these cards are cleared and the queue is reshuffled (`onReshuffle` is called, `reshuffles` counts).
 */
export function createDeck(cards, { played = new Set(), rng = Math.random, onReshuffle = null } = {}) {
  const all = mergeCards([cards]);
  const playedSet = played instanceof Set ? played : new Set(played);
  let queue = shuffle(all.filter((c) => !playedSet.has(c.id)), rng);
  let last = null;
  const deck = {
    cards: all,
    played: playedSet,
    reshuffles: 0,
    get size() {
      return all.length;
    },
    get remaining() {
      return queue.length;
    },
    draw() {
      if (!all.length) throw new Error('Keine Karten im Kartenpaket.');
      if (!queue.length) {
        for (const c of all) playedSet.delete(c.id);
        // avoid showing the very same card twice in a row across the reshuffle border
        queue = shuffle(all, rng);
        if (queue.length > 1 && last && queue[queue.length - 1].id === last) queue.unshift(queue.pop());
        deck.reshuffles++;
        if (onReshuffle) onReshuffle(deck);
      }
      const c = queue.pop();
      playedSet.add(c.id);
      last = c.id;
      return c;
    },
  };
  return deck;
}

/* ---------- scoring ---------- */

/** Free skips per Zug/Team as a number (Infinity for unbegrenzt). */
export const freeSkipCount = (settings) => (settings.skipFree < 0 ? Infinity : settings.skipFree);

/**
 * Score one Zug from its card list.
 * entries: [{result}] in order; quota: free skips available at the start of the Zug.
 * Returns per-entry {points, free} plus totals. Pure, so corrections in the summary just re-run it.
 */
export function scoreZug(entries, settings, quota) {
  let left = quota;
  let points = 0;
  const per = entries.map((e) => {
    if (e.result === 'richtig') {
      points += 1;
      return { points: 1, free: false };
    }
    if (e.result === 'buzzer') {
      points -= settings.buzzPenalty;
      return { points: -settings.buzzPenalty, free: false };
    }
    if (left > 0) {
      left--;
      return { points: 0, free: true };
    }
    points -= settings.skipPenalty;
    return { points: -settings.skipPenalty, free: false };
  });
  const count = (r) => entries.filter((e) => e.result === r).length;
  return { per, points, guessed: count('richtig'), skipped: count('uebersprungen'), buzzed: count('buzzer'), quotaLeft: left };
}

/* ---------- game ---------- */

const clone = (o) => JSON.parse(JSON.stringify(o));

/**
 * @param {{teams:Array<{name:string,color:string,players?:string[]}>, settings?:object, deck:object,
 *          rng?:()=>number, now?:()=>number, onChange?:()=>void, onEvent?:(type:string,data?:any)=>void}} opts
 */
export function createGame(opts) {
  const settings = { ...DEFAULT_SETTINGS, ...(opts.settings || {}) };
  const teams = opts.teams.map((t) => ({
    name: t.name,
    color: t.color,
    players: (t.players || []).map((p) => String(p).trim()).filter(Boolean),
  }));
  if (teams.length < 2 || teams.length > 4) throw new Error('Ein Spiel braucht 2 bis 4 Teams.');
  const state = {
    v: 1,
    settings,
    teams,
    phase: 'bereit',
    turnIndex: 0, // counts Züge (not Runden)
    scores: teams.map(() => 0),
    skipLeft: teams.map(() => freeSkipCount(settings)), // per-Spiel Kontingent (Infinity -> serialised as -1)
    stats: teams.map(() => ({ guessed: 0, skipped: 0, buzzed: 0 })),
    players: {}, // "teamIndex:name" -> {team, name, guessed, turns}
    targetReached: false,
    extra: 0, // Verlängerungsrunden played/needed
    verlaengerung: false, // the coming Runde is a Verlängerung
    over: false, // set when the game ended (phase 'ende' after 'tabelle')
    winners: [],
    log: [], // finished Züge
    zug: null,
  };
  return makeGame(state, opts);
}

/** Rebuild a game from `game.toJSON()`. A Zug that was running is restored paused. */
export function restoreGame(json, opts) {
  const state = clone(json);
  state.skipLeft = state.skipLeft.map((n) => (n < 0 ? Infinity : n));
  if (state.zug && state.phase === 'laeuft') {
    state.phase = 'pausiert';
    state.zug.pause = 'app';
  }
  return makeGame(state, opts);
}

function makeGame(state, { deck, now = () => Date.now(), onChange = null, onEvent = null }) {
  const S = state;
  const n = S.teams.length;
  const changed = () => onChange && onChange(game);
  const emit = (type, data) => onEvent && onEvent(type, data);
  const must = (...phases) => {
    if (!phases.includes(S.phase)) throw new Error(`Aktion in Phase "${S.phase}" nicht erlaubt.`);
  };

  const teamIdx = () => S.turnIndex % n;
  const zugQuota = () => (S.settings.skipMode === 'game' ? S.skipLeft[S.zug.team] : freeSkipCount(S.settings));

  function drawCard() {
    return deck.draw();
  }

  /** Time left in ms. */
  function timeLeft() {
    const z = S.zug;
    if (!z) return 0;
    if (S.phase === 'laeuft') return Math.max(0, z.timeLeftMs - (now() - z.runSince));
    return Math.max(0, z.timeLeftMs);
  }
  /** Fold the elapsed running time into timeLeftMs and stop the clock. */
  function stopClock() {
    const z = S.zug;
    if (S.phase === 'laeuft') z.timeLeftMs = Math.max(0, z.timeLeftMs - (now() - z.runSince));
    z.runSince = null;
  }
  function startClock() {
    S.zug.runSince = now();
  }

  function record(result) {
    S.zug.cards.push({ card: S.zug.current, result });
    S.zug.current = drawCard();
  }

  /** Who plays: Erklärer from the active team, Wächter from the next team; both rotate through their players once per Runde. */
  function turnInfo(index = S.turnIndex) {
    const ti = index % n;
    const gi = (ti + 1) % n;
    const r = Math.floor(index / n);
    const pick = (t) => (S.teams[t].players.length ? S.teams[t].players[r % S.teams[t].players.length] : null);
    return { team: ti, guardTeam: gi, round: r + 1, erklaerer: pick(ti), waechter: pick(gi), verlaengerung: S.verlaengerung };
  }
  const roundComplete = () => S.turnIndex % n === n - 1;

  function leaders() {
    const max = Math.max(...S.scores);
    return S.scores.map((s, i) => (s === max ? i : -1)).filter((i) => i >= 0);
  }

  function evaluateEnd() {
    S.verlaengerung = false;
    const rounds = Math.floor(S.turnIndex / n) + 1; // completed Runden (turnIndex is the last Zug of the Runde)
    let over = false;
    if (S.settings.mode === 'punkte') over = S.targetReached;
    else if (S.settings.mode === 'runden') over = rounds >= S.settings.rounds + S.extra;
    if (!over) return;
    const lead = leaders();
    if (lead.length > 1 && S.settings.mode !== 'frei') {
      S.extra++;
      S.verlaengerung = true;
      emit('verlaengerung', { teams: lead });
      return;
    }
    S.over = true;
    S.winners = lead;
  }

  const game = {
    state: S,
    settings: S.settings,
    teams: S.teams,
    deck,

    /* ----- read ----- */
    get phase() {
      return S.phase;
    },
    get scores() {
      return S.scores;
    },
    get over() {
      return S.over;
    },
    get winners() {
      return S.winners;
    },
    turnInfo,
    timeLeft,
    /** Remaining seconds, rounded up (display). */
    secondsLeft: () => Math.ceil(timeLeft() / 1000),
    get zug() {
      return S.zug;
    },
    get round() {
      return Math.floor(S.turnIndex / n) + 1;
    },
    /** Punkte-Vorschau of the current Zug (live). */
    zugScore() {
      return S.zug ? scoreZug(S.zug.cards, S.settings, zugQuota()) : null;
    },
    /** For the Überspringen button: free skips left and what the next skip costs. */
    skipInfo() {
      const quota = S.zug ? zugQuota() : freeSkipCount(S.settings);
      const used = S.zug ? S.zug.cards.filter((e) => e.result === 'uebersprungen').length : 0;
      const free = Math.max(0, quota - used);
      return { free, unlimited: free === Infinity, penalty: free > 0 ? 0 : S.settings.skipPenalty };
    },
    /** Free skips a team still has for the whole game (per-Spiel mode) or per Zug. */
    teamSkipQuota(t) {
      return S.settings.skipMode === 'game' ? S.skipLeft[t] : freeSkipCount(S.settings);
    },
    /** True when the Punkteziel was reached and the Runde is being finished. */
    get lastRound() {
      return S.targetReached && !S.over;
    },
    standings() {
      return S.teams
        .map((t, i) => ({ team: i, name: t.name, color: t.color, score: S.scores[i], ...S.stats[i] }))
        .sort((a, b) => b.score - a.score);
    },
    bestErklaerer() {
      const list = Object.values(S.players).filter((p) => p.guessed > 0);
      if (!list.length) return null;
      return list.sort((a, b) => b.guessed - a.guessed || a.turns - b.turns)[0];
    },
    /** Summary of every Zug in the log (for stats). */
    get log() {
      return S.log;
    },

    /* ----- Zug ----- */
    /** bereit -> laeuft: the Erklärer tapped "Bereit". Draws the first card. */
    bereit() {
      must('bereit');
      const info = turnInfo();
      S.zug = {
        team: info.team,
        guardTeam: info.guardTeam,
        erklaerer: info.erklaerer,
        waechter: info.waechter,
        quota: null,
        cards: [],
        current: null,
        timeLeftMs: S.settings.turnSecs * 1000,
        runSince: null,
        pause: null,
        buzzCard: null,
      };
      S.zug.quota = S.settings.skipMode === 'game' ? S.skipLeft[info.team] : freeSkipCount(S.settings);
      S.zug.current = drawCard();
      S.phase = 'laeuft';
      startClock();
      changed();
    },
    richtig() {
      must('laeuft');
      record('richtig');
      changed();
    },
    ueberspringen() {
      must('laeuft');
      record('uebersprungen');
      changed();
    },
    /** Buzzer (Tabuwort gesagt). With buzzPause the Zug pauses and waits for Bestätigt/Einspruch. */
    buzzer() {
      must('laeuft');
      if (S.settings.buzzPause) {
        stopClock();
        S.phase = 'pausiert';
        S.zug.pause = 'buzzer';
      } else {
        record('buzzer');
      }
      changed();
    },
    buzzerBestaetigt() {
      must('pausiert');
      if (S.zug.pause !== 'buzzer') throw new Error('Kein Buzzer offen.');
      record('buzzer');
      S.zug.pause = null;
      S.phase = 'laeuft';
      startClock();
      changed();
    },
    einspruchWeiter() {
      must('pausiert');
      if (S.zug.pause !== 'buzzer') throw new Error('Kein Buzzer offen.');
      S.zug.pause = null;
      S.phase = 'laeuft';
      startClock();
      changed();
    },
    einspruchNeueKarte() {
      must('pausiert');
      if (S.zug.pause !== 'buzzer') throw new Error('Kein Buzzer offen.');
      S.zug.current = drawCard();
      S.zug.pause = null;
      S.phase = 'laeuft';
      startClock();
      changed();
    },
    /** Manual pause (also used when the app goes to the background). */
    pausieren() {
      if (S.phase !== 'laeuft') return;
      stopClock();
      S.phase = 'pausiert';
      S.zug.pause = 'app';
      changed();
    },
    fortsetzen() {
      must('pausiert');
      if (S.zug.pause === 'buzzer') throw new Error('Erst den Buzzer klären.');
      S.zug.pause = null;
      S.phase = 'laeuft';
      startClock();
      changed();
    },
    /** Call regularly; ends the Zug when the time is up. Returns true when the phase changed. */
    tick() {
      if (S.phase !== 'laeuft') return false;
      if (timeLeft() > 0) return false;
      stopClock();
      S.zug.timeLeftMs = 0;
      S.zug.current = null; // the card on screen when the time ran out gives no points
      S.phase = 'vorbei';
      emit('zeitum');
      changed();
      return true;
    },
    /** vorbei -> zusammenfassung */
    zusammenfassung() {
      must('vorbei');
      S.phase = 'zusammenfassung';
      changed();
    },
    /** Correct a card in the summary: set its result to richtig / uebersprungen / buzzer. */
    korrigiere(index, result) {
      must('zusammenfassung');
      if (!RESULTS.includes(result)) throw new Error('Unbekanntes Ergebnis: ' + result);
      if (!S.zug.cards[index]) throw new Error('Karte nicht gefunden.');
      S.zug.cards[index].result = result;
      changed();
    },
    /** Zug score as currently shown in the summary. */
    summaryScore() {
      return scoreZug(S.zug.cards, S.settings, S.zug.quota);
    },
    /** zusammenfassung -> tabelle: apply points, update Kontingent, check the Spielende (at the end of a Runde). */
    bestaetigen() {
      must('zusammenfassung');
      const z = S.zug;
      const sc = scoreZug(z.cards, S.settings, z.quota);
      S.scores[z.team] += sc.points;
      const st = S.stats[z.team];
      st.guessed += sc.guessed;
      st.skipped += sc.skipped;
      st.buzzed += sc.buzzed;
      if (S.settings.skipMode === 'game') S.skipLeft[z.team] = sc.quotaLeft;
      if (z.erklaerer) {
        const key = z.team + ':' + z.erklaerer;
        const p = S.players[key] || (S.players[key] = { team: z.team, name: z.erklaerer, guessed: 0, turns: 0 });
        p.guessed += sc.guessed;
        p.turns++;
      }
      S.log.push({
        turn: S.turnIndex,
        team: z.team,
        erklaerer: z.erklaerer,
        waechter: z.waechter,
        points: sc.points,
        guessed: sc.guessed,
        skipped: sc.skipped,
        buzzed: sc.buzzed,
      });
      if (S.settings.mode === 'punkte' && S.scores.some((s) => s >= S.settings.target)) S.targetReached = true;
      if (roundComplete()) evaluateEnd();
      S.phase = 'tabelle';
      changed();
    },
    /** tabelle -> bereit (next team) or ende. */
    weiter() {
      must('tabelle');
      if (S.over) {
        S.phase = 'ende';
      } else {
        S.turnIndex++;
        S.zug = null;
        S.phase = 'bereit';
      }
      changed();
    },
    /** End the game early from the scoreboard (the only way in Freies Spiel). Winner = highest score (ties share). */
    beenden() {
      must('tabelle', 'bereit');
      S.over = true;
      S.winners = leaders();
      S.zug = null;
      S.phase = 'ende';
      changed();
    },

    toJSON() {
      // a running clock is folded into timeLeftMs so the saved state does not depend on wall-clock time
      const zug = S.zug && { ...S.zug, quota: S.zug.quota === Infinity ? -1 : S.zug.quota, timeLeftMs: timeLeft(), runSince: null };
      return clone({ ...S, skipLeft: S.skipLeft.map((v) => (v === Infinity ? -1 : v)), zug });
    },
  };
  // Zug quota is stored as -1 for unlimited: normalise after restore
  if (S.zug && S.zug.quota < 0) S.zug.quota = Infinity;
  return game;
}

/* ---------- helpers for the UI ---------- */

export function formatPoints(n) {
  return n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0';
}

/** Report (Karte melden) helpers: text code PSSTMELD1.<base64 json> */
export const REPORT_REASONS = ['falsch', 'doppelt', 'anstößig', 'zu schwer', 'sonstiges'];
export const REPORT_PREFIX = 'PSSTMELD1';
