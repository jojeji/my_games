// Psst! multiplayer: the host session. Runs on the Gastgeber's phone, owns the (unchanged) game logic from logic.js,
// maps the intents of the other devices to logic actions (after checking the sender's role) and pushes a per-role VIEW to every device.
// DOM-free: Node tests drive it through an in-memory room.
//
// Messages host -> devices (always with `to` = one concrete client id, so the Karte never goes to a device that may not see it):
//   view {epoch, seq, view}      the device's current screen model (views.js)
//   info {teams, running, rejoin, full}   answer to `info`
//   rejected {reason}            full | running | name | kicked
//   pong / host-hello / room-closed
// Messages devices -> host: join {name, team, kind}, info, leave, resync, ping, and the game intents
//   bereit, richtig, ueberspringen, buzzer, buzzer-bestaetigen, einspruch-weiter, einspruch-neu, pause, fortsetzen,
//   zusammenfassung, korrektur {index,result,guesser?}, bestaetigen, weiter, beenden and zug-aussetzen (host only).
// Jeder gegen jeden: `richtig` carries `guesser` (name of the Rater who guessed it; optional with exactly one Rater) and `korrektur` may name
// the guesser too; both are only accepted from the Erklärer (or the Gastgeber as safety net) and only for a Rater of the running Zug.
// Intents that depend on the screen carry `ref`: the id of the Karte the sender saw (richtig/ueberspringen/buzzer) or the Buzzer number
// (buzzer-bestaetigen, einspruch-*). The first valid intent wins; a late duplicate has a stale `ref` or hits the wrong phase and is ignored.
import { createGame, restoreGame, DEFAULT_SETTINGS, UNIT_COLORS, FFA_MIN, FFA_MAX } from './logic.js';
import { buildView, roleOf, idOfName, weiterWho, isFfa } from './views.js';

export const MAX_DEVICES = 20; // sockets per room incl. the host
export const MAX_NAME = 16;
const OFFLINE_MS = 12000; // no sign of life (ping) from a device for this long -> shown as offline
const ERKLAERER_GRACE_MS = 8000; // the Erklärer's device is gone for this long -> the Zug is paused
const RESULTS = ['richtig', 'uebersprungen', 'buzzer'];

export const cleanName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
const sameName = (a, b) => a.toLocaleLowerCase('de') === b.toLocaleLowerCase('de');

/**
 * @param {object} deps
 *   net, code, hostKey, hostId, hostName, now, rng, deckFactory(packIds) -> Promise<deck>, storage {save(snapshot), clear()},
 *   settings, teams [{name,color}], packIds, packLabels, options {oneGuard}, onUpdate(host)
 */
export function createHostSession(deps) {
  const { net, deckFactory, storage = null, onUpdate = null } = deps;
  const now = deps.now || (() => Date.now());
  const rng = deps.rng || Math.random;
  const hostId = deps.hostId || net.id;
  const epoch = now();
  let seq = 0;
  let lastSweep = 0;
  let restoring = false; // a snapshot is being loaded (the deck loads asynchronously): ignore devices until the state is complete

  const S = {
    code: deps.code,
    hostId,
    phase: 'lobby', // lobby | game
    closed: false,
    teams: (deps.teams || [{ name: 'Team 1', color: '#e8452c' }, { name: 'Team 2', color: '#2563eb' }]).map((t) => ({ name: t.name, color: t.color })),
    players: {},
    order: [],
    options: { oneGuard: false, ...(deps.options || {}) },
    settings: { ...DEFAULT_SETTINGS, ...(deps.settings || {}) },
    packIds: (deps.packIds || []).slice(),
    packLabels: (deps.packLabels || []).slice(),
    game: null,
    nameToId: null,
    buzz: { seq: 0, by: null },
  };

  /* ---------- players ---------- */

  function addPlayer(id, name, kind) {
    const P = { id, name, team: null, kind, connected: true, lastSeen: now(), isHost: id === hostId };
    S.players[id] = P;
    S.order.push(id);
    return P;
  }
  const playersOf = (team) => S.order.map((id) => S.players[id]).filter((p) => p && p.kind === 'player' && p.team === team);
  const loosePlayers = () => S.order.map((id) => S.players[id]).filter((p) => p && p.kind === 'player' && (p.team === null || p.team === undefined));

  function uniqueName(name, exceptId) {
    const taken = (n) => Object.values(S.players).some((p) => p.id !== exceptId && p.kind === 'player' && sameName(p.name, n));
    if (!taken(name)) return name;
    for (let i = 2; i < 100; i++) {
      const suffix = ' ' + i;
      const n = name.slice(0, MAX_NAME - suffix.length) + suffix;
      if (!taken(n)) return n;
    }
    return name;
  }

  /** Smallest team (random among equals). */
  function smallestTeam() {
    const counts = S.teams.map((_, i) => playersOf(i).length);
    const min = Math.min(...counts);
    const cands = counts.map((c, i) => (c === min ? i : -1)).filter((i) => i >= 0);
    return cands[Math.floor(rng() * cands.length)];
  }
  function placeTeam(P, team) {
    if (Number.isInteger(team) && team >= 0 && team < S.teams.length) P.team = team;
    else if (team === 'random') P.team = smallestTeam();
    else P.team = null;
  }

  function takeOver(old, newId) {
    delete S.players[old.id];
    S.order = S.order.map((id) => (id === old.id ? newId : id));
    old.id = newId;
    S.players[newId] = old;
    if (S.nameToId) S.nameToId[old.name] = newId;
  }

  /* ---------- sending ---------- */

  const send = (msg) => net.send(msg);
  function sendView(id) {
    if (id === hostId) return;
    const view = buildView(S, id, now());
    if (view) send({ to: id, t: 'view', epoch, seq: ++seq, view });
  }
  function pushAll() {
    for (const id of S.order) {
      const P = S.players[id];
      if (P && P.connected && id !== hostId) sendView(id);
    }
  }
  function persist() {
    if (storage && !S.closed) {
      try {
        storage.save(host.snapshot());
      } catch {
        /* storage is optional */
      }
    }
  }
  function changed() {
    persist();
    pushAll();
    if (onUpdate) onUpdate(host);
  }
  const reject = (to, reason) => send({ to, t: 'rejected', reason });

  /* ---------- incoming ---------- */

  function touch(from) {
    const P = S.players[from];
    if (!P) return null;
    P.lastSeen = now();
    if (!P.connected) {
      P.connected = true;
      changed();
    }
    return P;
  }

  function infoFor() {
    return {
      teams: S.teams.map((t, i) => ({ name: t.name, color: t.color, n: playersOf(i).length })),
      running: S.phase === 'game',
      form: S.settings.form === 'ffa' ? 'ffa' : 'teams',
      rejoin: S.phase === 'game' ? Object.values(S.players).filter((p) => p.kind === 'player' && !p.isHost).sort((a, b) => Number(a.connected) - Number(b.connected)).map((p) => p.name) : [],
      full: Object.keys(S.players).length >= MAX_DEVICES,
      hostName: (S.players[hostId] || {}).name || '',
    };
  }

  function onJoin(from, msg) {
    const kind = msg.kind === 'display' ? 'display' : 'player';
    let P = S.players[from];
    if (!P) {
      if (S.closed) return reject(from, 'closed');
      if (Object.keys(S.players).length >= MAX_DEVICES) return reject(from, 'full');
      if (kind === 'display') {
        P = addPlayer(from, 'Anzeige', 'display');
      } else {
        const name = cleanName(msg.name);
        if (!name) return reject(from, 'name');
        if (S.phase === 'game') {
          // after a lost session (reload, new tab, cleared storage) a player gets his seat back by name
          // (a seat that still looks connected is taken over too: the old socket may be half dead, e.g. after a reload)
          const old = Object.values(S.players).find((p) => p.kind === 'player' && !p.isHost && sameName(p.name, name));
          if (!old) return reject(from, 'running');
          takeOver(old, from);
          P = S.players[from];
        } else {
          P = addPlayer(from, uniqueName(name, from), 'player');
          placeTeam(P, msg.team);
        }
      }
    } else if (S.phase === 'lobby' && P.kind === 'player' && !P.isHost && msg.name && cleanName(msg.name) && !sameName(cleanName(msg.name), P.name)) {
      P.name = uniqueName(cleanName(msg.name), from);
    }
    P.connected = true;
    P.lastSeen = now();
    changed();
  }

  function handle(msg) {
    const from = msg.from;
    if (restoring || typeof from !== 'string' || from === hostId) return;
    switch (msg.t) {
      case 'peer-join':
      case 'ping':
        touch(from);
        return;
      case 'peer-leave': {
        const P = S.players[from];
        if (P && P.connected) {
          P.connected = false;
          changed();
        }
        return;
      }
      case 'info':
        send({ to: from, t: 'info', ...infoFor() });
        return;
      case 'join':
        onJoin(from, msg);
        return;
      case 'leave': {
        const P = S.players[from];
        if (!P) return;
        if (S.phase === 'lobby') {
          delete S.players[from];
          S.order = S.order.filter((id) => id !== from);
        } else P.connected = false;
        changed();
        return;
      }
      case 'resync':
        if (touch(from)) sendView(from);
        return;
      case 'lobby-team':
        if (touch(from) && S.phase === 'lobby' && S.players[from].kind === 'player') {
          placeTeam(S.players[from], msg.team);
          changed();
        }
        return;
      case 'lobby-name':
        if (touch(from) && S.phase === 'lobby' && S.players[from].kind === 'player' && cleanName(msg.name)) {
          S.players[from].name = uniqueName(cleanName(msg.name), from);
          changed();
        }
        return;
      default:
        if (touch(from)) intent(from, msg.t, msg);
    }
  }

  /* ---------- game intents (role validated) ---------- */

  /** Jeder gegen jeden: unit index of the Rater called `name` in the running Zug; undefined = not given; false = not a Rater of this Zug. */
  function guesserUnit(g, name) {
    if (!isFfa(g) || name === undefined || name === null) return undefined;
    const z = g.zug;
    const u = z && z.raters ? z.raters.find((x) => g.teams[x].players[0] === name) : undefined;
    return u === undefined ? false : u;
  }

  function intent(from, t, m = {}) {
    const P = S.players[from];
    const g = S.game;
    if (!P || !g || S.phase !== 'game') return false;
    const role = roleOf(S, from);
    if (role === 'anzeige') return false;
    const isHost = !!P.isHost;
    const z = g.zug;
    const eid = idOfName(S, z ? z.erklaerer : g.turnInfo().erklaerer);
    const erklaererGone = !(S.players[eid] && S.players[eid].connected);
    const asErklaerer = role === 'erklaerer' || isHost; // post-Zug actions: the Erklärer or (as a safety net) the Gastgeber
    try {
      switch (t) {
        case 'bereit':
          if (!(role === 'erklaerer' || (isHost && erklaererGone))) return false;
          g.bereit();
          return true;
        case 'richtig':
        case 'ueberspringen': {
          if (role !== 'erklaerer' || !z || !z.current || m.ref !== z.current.id) return false;
          if (t === 'ueberspringen') {
            g.ueberspringen();
            return true;
          }
          const guesser = guesserUnit(g, m.guesser);
          if (guesser === false) return false;
          g.richtig(guesser);
          return true;
        }
        case 'buzzer': {
          if (role !== 'waechter' || g.phase !== 'laeuft' || !z.current || m.ref !== z.current.id) return false;
          const before = S.buzz;
          S.buzz = { seq: before.seq + 1, by: P.name }; // set first: the logic pushes the new view from inside g.buzzer()
          try {
            g.buzzer();
          } catch (e) {
            S.buzz = before;
            throw e;
          }
          return true;
        }
        case 'buzzer-bestaetigen':
        case 'einspruch-weiter':
        case 'einspruch-neu':
          if (g.phase !== 'pausiert' || z.pause !== 'buzzer' || m.ref !== S.buzz.seq) return false;
          if (t === 'buzzer-bestaetigen') g.buzzerBestaetigt();
          else if (t === 'einspruch-weiter') g.einspruchWeiter();
          else g.einspruchNeueKarte();
          return true;
        case 'pause':
          if (!asErklaerer) return false;
          g.pausieren();
          return true;
        case 'fortsetzen':
          if (!asErklaerer || !z || z.pause !== 'app') return false;
          g.fortsetzen();
          return true;
        case 'zusammenfassung':
          if (!asErklaerer) return false;
          g.zusammenfassung();
          return true;
        case 'korrektur':
          if (!asErklaerer || !Number.isInteger(m.index) || !RESULTS.includes(m.result)) return false;
          {
            const guesser = guesserUnit(g, m.guesser);
            if (guesser === false) return false;
            g.korrigiere(m.index, m.result, guesser);
          }
          return true;
        case 'bestaetigen':
          if (!asErklaerer) return false;
          g.bestaetigen();
          return true;
        case 'weiter':
          if (!weiterWho(S).includes(from)) return false;
          g.weiter();
          return true;
        case 'beenden':
          if (!isHost) return false;
          g.beenden();
          return true;
        case 'zug-aussetzen':
          if (!isHost || g.phase !== 'bereit') return false;
          g.zugAussetzen();
          return true;
        default:
          return false;
      }
    } catch {
      return false; // conflicting / stale intent: the first valid one already won
    }
  }

  /* ---------- lobby control (host UI) ---------- */

  const inLobby = () => S.phase === 'lobby' && !S.closed;
  const lobby = {
    setTeam(id, team) {
      const P = S.players[id];
      if (!inLobby() || !P || P.kind !== 'player') return;
      placeTeam(P, team);
      changed();
    },
    setName(id, name) {
      const P = S.players[id];
      if (!inLobby() || !P || !cleanName(name)) return;
      P.name = uniqueName(cleanName(name), id);
      changed();
    },
    kick(id) {
      if (!inLobby() || id === hostId || !S.players[id]) return;
      reject(id, 'kicked');
      delete S.players[id];
      S.order = S.order.filter((x) => x !== id);
      changed();
    },
    renameTeam(i, name) {
      if (!inLobby() || !S.teams[i]) return;
      S.teams[i].name = String(name ?? '').slice(0, 18) || 'Team ' + (i + 1);
      changed();
    },
    setColor(i, color) {
      if (!inLobby() || !S.teams[i]) return;
      S.teams[i].color = color;
      changed();
    },
    addTeam(color) {
      if (!inLobby() || S.teams.length >= 4) return;
      S.teams.push({ name: 'Team ' + (S.teams.length + 1), color });
      changed();
    },
    removeTeam(i) {
      if (!inLobby() || S.teams.length <= 2 || !S.teams[i]) return;
      S.teams.splice(i, 1);
      for (const p of Object.values(S.players)) {
        if (p.team === i) p.team = null;
        else if (p.team > i) p.team--;
      }
      changed();
    },
    setSettings(s) {
      if (!inLobby()) return;
      S.settings = { ...S.settings, ...s };
      changed();
    },
    setOptions(o) {
      if (!inLobby()) return;
      S.options = { ...S.options, ...o };
      changed();
    },
    setPacks(ids, labels = []) {
      if (!inLobby()) return;
      S.packIds = ids.slice();
      S.packLabels = labels.slice();
      changed();
    },
  };

  /**
   * Can the game start? errors block, warnings only inform.
   * Teams: at least 2 teams and EVERY used team needs 2 players (an Erklärer and at least one Rater). Players without a team are spread over the
   * smallest teams on start, so they count as available. `suggestFfa` = the team rule fails but Jeder gegen jeden (3+ players) would work.
   * Jeder gegen jeden: at least 3 players (Erklärer, Wächter, Rater).
   */
  function check() {
    const errors = [];
    const warnings = [];
    const players = S.order.map((id) => S.players[id]).filter((p) => p && p.kind === 'player');
    let suggestFfa = false;
    const packError = () => !S.packIds.length && errors.push('Wähle mindestens ein Kartenpaket.');
    if (S.settings.form === 'ffa') {
      if (players.length < FFA_MIN) errors.push(`Jeder gegen jeden braucht mindestens ${FFA_MIN} Spieler (noch ${FFA_MIN - players.length}).`);
      if (players.length > FFA_MAX) errors.push(`Jeder gegen jeden geht mit höchstens ${FFA_MAX} Spielern.`);
      packError();
      return { ok: errors.length === 0, errors, warnings, suggestFfa };
    }
    const sim = S.teams.map((_, i) => playersOf(i).length);
    const loose = players.filter((p) => p.team === null || p.team === undefined).length;
    for (let k = 0; k < loose; k++) sim[sim.indexOf(Math.min(...sim))]++; // same spreading as on start
    const filled = sim.filter((n) => n > 0).length;
    const teamErrors = [];
    S.teams.forEach((t, i) => {
      if (sim[i] === 1) teamErrors.push(`${t.name} braucht noch 1 Spieler.`);
    });
    if (filled < 2) {
      let need = 2 - filled;
      S.teams.forEach((t, i) => {
        if (sim[i] === 0 && need > 0) {
          teamErrors.push(`${t.name} braucht noch 2 Spieler.`);
          need--;
        }
      });
    }
    if (teamErrors.length) {
      errors.unshift(...teamErrors);
      suggestFfa = players.length >= FFA_MIN;
    }
    S.teams.forEach((t, i) => {
      if (sim[i] === 0 && filled >= 2) warnings.push(`${t.name} ist leer und wird weggelassen.`);
    });
    if (loose) warnings.push(`${loose} Spieler ohne Team werden zufällig verteilt.`);
    packError();
    return { ok: errors.length === 0, errors, warnings, suggestFfa };
  }

  async function startGame() {
    if (S.closed) throw new Error('Raum geschlossen.');
    const c = check();
    if (!c.ok) throw new Error(c.errors[0]);
    let teams;
    if (S.settings.form === 'ffa') {
      // every player is a scoring unit; the lobby teams stay untouched (the Gastgeber may switch back to Teams)
      teams = S.order.map((id) => S.players[id]).filter((p) => p && p.kind === 'player').map((p, i) => ({ name: p.name, color: UNIT_COLORS[i % UNIT_COLORS.length], players: [p.name] }));
    } else {
      for (const p of loosePlayers()) p.team = smallestTeam();
      // drop empty teams and renumber
      const keep = S.teams.map((_, i) => playersOf(i).length > 0);
      const remap = {};
      let k = 0;
      keep.forEach((yes, i) => {
        if (yes) remap[i] = k++;
      });
      S.teams = S.teams.filter((_, i) => keep[i]);
      for (const p of Object.values(S.players)) if (p.kind === 'player') p.team = remap[p.team];
      teams = S.teams.map((t, i) => ({ name: t.name, color: t.color, players: playersOf(i).map((p) => p.name) }));
    }
    const deck = await deckFactory(S.packIds);
    S.game = createGame({ teams, settings: { ...S.settings }, deck, rng, now, onChange: changed, onEvent: null });
    S.nameToId = {};
    for (const p of Object.values(S.players)) if (p.kind === 'player') S.nameToId[p.name] = p.id;
    S.buzz = { seq: 0, by: null };
    S.phase = 'game';
    changed();
  }

  function backToLobby() {
    S.game = null;
    S.nameToId = null;
    S.phase = 'lobby';
    changed();
  }
  async function rematch() {
    S.game = null;
    S.phase = 'lobby';
    await startGame();
  }

  /** The Erklärer's device is gone: swap in the next connected player of his team for this Zug. */
  function substitute() {
    const g = S.game;
    if (!g || g.phase !== 'bereit') return false;
    const info = g.turnInfo();
    const cur = S.players[idOfName(S, info.erklaerer)];
    if (cur && cur.connected) return false;
    if (isFfa(g)) {
      // the next connected player (not the Wächter) takes the turn; the absent player gets the other slot
      const order = g.state.order;
      const pos = order.indexOf(info.team);
      for (let k = 1; k < order.length; k++) {
        const unit = order[(pos + k) % order.length];
        const p = unit === info.guardTeam ? null : S.players[idOfName(S, g.teams[unit].players[0])];
        if (p && p.connected) {
          g.tauscheErklaerer(unit);
          return true;
        }
      }
      return false;
    }
    const list = g.state.teams[info.team].players;
    const i = list.indexOf(info.erklaerer);
    for (let k = 1; k < list.length; k++) {
      const j = (i + k) % list.length;
      const p = S.players[idOfName(S, list[j])];
      if (p && p.connected) {
        const idx = ((info.round - 1) % list.length);
        [list[idx], list[j]] = [list[j], list[idx]];
        changed();
        return true;
      }
    }
    return false;
  }

  function endRoom() {
    send({ t: 'room-closed' });
    S.closed = true;
    if (storage) storage.clear();
    if (onUpdate) onUpdate(host);
    setTimeout(() => net.close(), 50);
  }

  /* ---------- time ---------- */

  /** Call every ~100 ms: ends the Zug when the time is up, notices devices that fell silent. */
  function tick() {
    if (S.closed) return;
    const t = now();
    if (S.game && S.phase === 'game') S.game.tick();
    if (t - lastSweep < 1000) return;
    lastSweep = t;
    let dirty = false;
    for (const P of Object.values(S.players)) {
      if (!P.isHost && P.connected && t - P.lastSeen > OFFLINE_MS) {
        P.connected = false;
        dirty = true;
      }
    }
    if (S.game && S.phase === 'game' && S.game.phase === 'laeuft') {
      const e = S.players[idOfName(S, S.game.zug.erklaerer)];
      if (e && !e.connected && t - e.lastSeen > ERKLAERER_GRACE_MS) {
        S.game.pausieren(); // pushes through the logic's change hook
        dirty = false;
      }
    }
    if (dirty) changed();
  }

  /* ---------- persistence ---------- */

  function snapshot() {
    return {
      v: 1,
      code: S.code,
      hostKey: deps.hostKey,
      hostId,
      savedAt: now(),
      phase: S.phase,
      teams: S.teams,
      players: S.order.map((id) => {
        const p = S.players[id];
        return { id: p.id, name: p.name, team: p.team ?? null, kind: p.kind, isHost: !!p.isHost };
      }),
      options: S.options,
      settings: S.settings,
      packIds: S.packIds,
      packLabels: S.packLabels,
      nameToId: S.nameToId,
      buzz: S.buzz,
      game: S.game ? S.game.toJSON() : null,
    };
  }

  /** Load a snapshot (host page reload). A running Zug comes back paused; devices rejoin on the host-hello. */
  async function restore(snap) {
    restoring = true;
    try {
      await loadSnapshot(snap);
    } finally {
      restoring = false;
    }
    if (net.status === 'online') announce(); // devices that tried to join meanwhile were ignored: call them back
  }
  async function loadSnapshot(snap) {
    S.phase = snap.phase;
    S.teams = snap.teams;
    S.players = {};
    S.order = [];
    for (const p of snap.players) {
      S.players[p.id] = { ...p, connected: p.id === hostId, lastSeen: now() };
      S.order.push(p.id);
    }
    S.options = { oneGuard: false, ...snap.options };
    S.settings = { ...DEFAULT_SETTINGS, ...snap.settings };
    S.packIds = snap.packIds || [];
    S.packLabels = snap.packLabels || [];
    S.nameToId = snap.nameToId || null;
    S.buzz = snap.buzz || { seq: 0, by: null };
    S.game = null;
    if (snap.game) {
      const deck = await deckFactory(S.packIds);
      S.game = restoreGame(snap.game, { deck, now, onChange: changed, onEvent: null });
    }
    if (onUpdate) onUpdate(host);
  }

  /* ---------- wiring ---------- */

  function announce() {
    if (restoring) return; // restore() announces when it is done
    send({ t: 'host-hello', hostKey: deps.hostKey });
    pushAll();
  }
  const offs = [
    net.on('message', handle),
    net.on('ready', announce),
    net.on('error', (e) => {
      if (e.code === 'host-taken' && deps.onTaken) deps.onTaken();
    }),
  ];

  const host = {
    S,
    id: hostId,
    code: S.code,
    net,
    epoch,
    lobby,
    check,
    startGame,
    backToLobby,
    rematch,
    substitute,
    endRoom,
    tick,
    snapshot,
    restore,
    handle,
    intent: (t, m) => intent(hostId, t, m),
    intentFrom: intent,
    viewFor: (id) => buildView(S, id, now()),
    sendView,
    pushAll,
    /** Add the host as a normal player (name + optional team). */
    addSelf(name, team = null) {
      const P = addPlayer(hostId, uniqueName(cleanName(name) || 'Gastgeber', hostId), 'player');
      placeTeam(P, team);
      return P;
    },
    announce,
    stop() {
      offs.forEach((f) => f());
    },
  };
  return host;
}
