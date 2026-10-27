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
// Spielform: 'teams' (default; also for old saves without the field) or 'ffa' (Jeder gegen jeden). In 'ffa' every player is a scoring unit
// ("team" of one player), so scores/stats/skip budgets/turn counting reuse the team code. Per Zug one Erklärer (rotating through all players),
// one Wächter (rotating, never the Erklärer) and everybody else is Rater; richtig names the Rater who guessed (Erklärer +1, Rater +1).
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
  form: 'teams', // Spielform: 'teams' | 'ffa' (Jeder gegen jeden)
});

export const FORMS = ['teams', 'ffa'];
export const FFA_MIN = 3;
export const FFA_MAX = 20;
/** Colours handed out to the players in Jeder gegen jeden (cycled). */
export const UNIT_COLORS = ['#e8452c', '#2563eb', '#12915b', '#8b3fc8', '#b45309', '#db2777', '#0e7490', '#475569'];
export const isFfaSettings = (settings) => !!settings && settings.form === 'ffa';

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
  // Jeder gegen jeden: every Richtig also scores for the Rater who guessed it (entry.guesser = unit index)
  const byGuesser = {};
  let missing = 0;
  if (isFfaSettings(settings)) {
    for (const e of entries) {
      if (e.result !== 'richtig') continue;
      if (Number.isInteger(e.guesser)) byGuesser[e.guesser] = (byGuesser[e.guesser] || 0) + 1;
      else missing++;
    }
  }
  return { per, points, guessed: count('richtig'), skipped: count('uebersprungen'), buzzed: count('buzzer'), quotaLeft: left, byGuesser, missing };
}

/** Points per unit (team / player) a confirmed Zug gave: Erklärer's points plus +1 for every Rater who guessed. Works on a log entry. */
export function zugDeltas(entry) {
  const d = {};
  d[entry.team] = entry.points;
  for (const [u, n] of Object.entries(entry.guessers || {})) d[u] = (d[u] || 0) + n;
  return d;
}

/* ---------- game ---------- */

const clone = (o) => JSON.parse(JSON.stringify(o));

/**
 * @param {{teams:Array<{name:string,color:string,players?:string[]}>, settings?:object, deck:object,
 *          rng?:()=>number, now?:()=>number, onChange?:()=>void, onEvent?:(type:string,data?:any)=>void}} opts
 */
export function createGame(opts) {
  const settings = { ...DEFAULT_SETTINGS, ...(opts.settings || {}) };
  const ffa = isFfaSettings(settings);
  const teams = opts.teams.map((t, i) => {
    if (!ffa) {
      return { name: t.name, color: t.color, players: (t.players || []).map((p) => String(p).trim()).filter(Boolean) };
    }
    const name = String((t.players && t.players[0]) ?? t.name ?? '').trim();
    return { name, color: t.color || UNIT_COLORS[i % UNIT_COLORS.length], players: [name] };
  });
  if (ffa) {
    if (teams.length < FFA_MIN) throw new Error(`Jeder gegen jeden braucht mindestens ${FFA_MIN} Spieler.`);
    if (teams.length > FFA_MAX) throw new Error(`Jeder gegen jeden geht mit höchstens ${FFA_MAX} Spielern.`);
    const seen = new Set();
    for (const t of teams) {
      const k = t.name.toLocaleLowerCase('de');
      if (!k) throw new Error('Jeder Spieler braucht einen Namen.');
      if (seen.has(k)) throw new Error('Die Spielernamen müssen verschieden sein.');
      seen.add(k);
    }
  } else if (teams.length < 2 || teams.length > 4) throw new Error('Ein Spiel braucht 2 bis 4 Teams.');
  const state = {
    v: 1,
    settings,
    teams,
    phase: 'bereit',
    turnIndex: 0, // counts Züge (not Runden)
    scores: teams.map(() => 0),
    skipLeft: teams.map(() => freeSkipCount(settings)), // per-Spiel Kontingent (Infinity -> serialised as -1)
    stats: teams.map(() => (ffa ? { guessed: 0, skipped: 0, buzzed: 0, solved: 0 } : { guessed: 0, skipped: 0, buzzed: 0 })),
    players: {}, // "teamIndex:name" -> {team, name, guessed, turns}
    targetReached: false,
    extra: 0, // Verlängerungsrunden played/needed
    verlaengerung: false, // the coming Runde is a Verlängerung
    over: false, // set when the game ended (phase 'ende' after 'tabelle')
    winners: [],
    log: [], // finished Züge
    zug: null,
  };
  if (ffa) state.order = teams.map((_, i) => i); // turn order of the players (unit indices); only changes when an absent Erklärer is swapped
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
  const ffa = () => isFfaSettings(S.settings);
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

  function record(result, guesser = null) {
    const e = { card: S.zug.current, result };
    if (guesser !== null) e.guesser = guesser;
    S.zug.cards.push(e);
    S.zug.current = drawCard();
  }

  /** Jeder gegen jeden: the unit index of the Rater named by `guesser` (undefined = only allowed with exactly one Rater). */
  function pickGuesser(guesser) {
    const raters = S.zug.raters;
    if (guesser === undefined || guesser === null) {
      if (raters.length === 1) return raters[0];
      throw new Error('Wer hat es erraten?');
    }
    if (!raters.includes(guesser)) throw new Error('Das ist kein Rater in diesem Zug.');
    return guesser;
  }

  /**
   * Who plays. Teams: Erklärer from the active team, Wächter from the next team; both rotate through their players once per Runde.
   * Jeder gegen jeden: in a Runde every player explains once (position = turnIndex % n in `order`); the Wächter is the player `1 + r mod (n-1)`
   * places after the Erklärer (r = Runde), so he is never the Erklärer and over n-1 Runden every other player is Wächter of every Erklärer once;
   * within one Runde every player is Wächter exactly once. All others are Rater (`raters` = unit indices, `raterNames`).
   */
  function turnInfo(index = S.turnIndex) {
    if (ffa()) {
      const r = Math.floor(index / n);
      const pos = index % n;
      const gpos = (pos + 1 + (r % (n - 1))) % n;
      const ti = S.order[pos];
      const gi = S.order[gpos];
      const raters = S.order.filter((_, p) => p !== pos && p !== gpos).sort((a, b) => a - b);
      return {
        team: ti, guardTeam: gi, round: r + 1, erklaerer: S.teams[ti].players[0], waechter: S.teams[gi].players[0],
        raters, raterNames: raters.map((u) => S.teams[u].players[0]), verlaengerung: S.verlaengerung,
      };
    }
    const ti = index % n;
    const gi = (ti + 1) % n;
    const r = Math.floor(index / n);
    const pick = (t) => (S.teams[t].players.length ? S.teams[t].players[r % S.teams[t].players.length] : null);
    return { team: ti, guardTeam: gi, round: r + 1, erklaerer: pick(ti), waechter: pick(gi), verlaengerung: S.verlaengerung };
  }
  /** Builds the Zug record of the current turn (no card drawn, clock not started). */
  function startZug() {
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
    if (ffa()) S.zug.raters = info.raters.slice();
    S.zug.quota = S.settings.skipMode === 'game' ? S.skipLeft[info.team] : freeSkipCount(S.settings);
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
      startZug();
      S.zug.current = drawCard();
      S.phase = 'laeuft';
      startClock();
      changed();
    },
    /**
     * An absent Erklärer's Zug is skipped (nobody can play it, e.g. a team with fewer than two connected players): scores 0,
     * counts as the Zug of that turn (Runde, Spielende checks as usual) and is marked `aussetzer` in the log.
     */
    zugAussetzen() {
      must('bereit');
      startZug();
      S.zug.aussetzer = true;
      S.zug.timeLeftMs = 0;
      S.phase = 'zusammenfassung';
      game.bestaetigen();
    },
    /** Jeder gegen jeden, before the Zug: the player `unit` explains now instead of the current Erklärer (their turns trade places). */
    tauscheErklaerer(unit) {
      must('bereit');
      if (!ffa()) throw new Error('Nur in Jeder gegen jeden.');
      const info = turnInfo();
      const pos = S.order.indexOf(info.team);
      const j = S.order.indexOf(unit);
      if (j < 0 || unit === info.team) throw new Error('Unbekannter Spieler.');
      if (unit === info.guardTeam) throw new Error('Der Wächter kann nicht tauschen.');
      [S.order[pos], S.order[j]] = [S.order[j], S.order[pos]];
      changed();
    },
    /** Richtig. Jeder gegen jeden: `guesser` = unit index of the Rater who guessed it (optional when there is only one Rater). */
    richtig(guesser) {
      must('laeuft');
      record('richtig', ffa() ? pickGuesser(guesser) : null);
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
    /**
     * Correct a card in the summary: set its result to richtig / uebersprungen / buzzer.
     * Jeder gegen jeden: `guesser` (unit index of a Rater) changes who guessed a richtig card; a card that becomes richtig without a known
     * guesser gets the only Rater automatically, otherwise it stays open (summaryScore().missing) until the guesser is named.
     */
    korrigiere(index, result, guesser) {
      must('zusammenfassung');
      if (!RESULTS.includes(result)) throw new Error('Unbekanntes Ergebnis: ' + result);
      const e = S.zug.cards[index];
      if (!e) throw new Error('Karte nicht gefunden.');
      if (ffa() && result === 'richtig') {
        const raters = S.zug.raters;
        if (guesser !== undefined && guesser !== null) {
          if (!raters.includes(guesser)) throw new Error('Das ist kein Rater in diesem Zug.');
          e.guesser = guesser;
        } else if (!raters.includes(e.guesser)) {
          if (raters.length === 1) e.guesser = raters[0];
          else delete e.guesser;
        }
      }
      e.result = result;
      changed();
    },
    /** True in Jeder gegen jeden. */
    get ffa() {
      return ffa();
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
      if (sc.missing) throw new Error('Es fehlt noch, wer erraten hat.');
      S.scores[z.team] += sc.points;
      const st = S.stats[z.team];
      st.guessed += sc.guessed;
      st.skipped += sc.skipped;
      st.buzzed += sc.buzzed;
      for (const [u, k] of Object.entries(sc.byGuesser)) {
        S.scores[u] += k;
        S.stats[u].solved = (S.stats[u].solved || 0) + k;
      }
      if (S.settings.skipMode === 'game') S.skipLeft[z.team] = sc.quotaLeft;
      if (z.erklaerer) {
        const key = z.team + ':' + z.erklaerer;
        const p = S.players[key] || (S.players[key] = { team: z.team, name: z.erklaerer, guessed: 0, turns: 0 });
        p.guessed += sc.guessed;
        p.turns++;
      }
      const entry = {
        turn: S.turnIndex,
        team: z.team,
        erklaerer: z.erklaerer,
        waechter: z.waechter,
        points: sc.points,
        guessed: sc.guessed,
        skipped: sc.skipped,
        buzzed: sc.buzzed,
      };
      if (ffa()) entry.guessers = sc.byGuesser;
      if (z.aussetzer) entry.aussetzer = true;
      S.log.push(entry);
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
