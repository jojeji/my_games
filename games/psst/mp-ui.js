// Psst! multiplayer: screens around the room (start, join, lobby, host menu) and the glue between ui.js, host.js / client.js and mp-views.js.
// Screens (A.screen): mp-start, mp-packs (rendered by ui.js), mp-join, mp-room (lobby / game / errors).
import { h } from '../../engine/ui/dom.js';
import { createNet, createWebSocketTransport, ROOM_SERVER, makeCode, makeClientId, cleanCode, CODE_RE } from './net.js';
import { createClient, createLocalSession } from './client.js';
import { createHostSession, MAX_NAME } from './host.js';
import { createMpViews, viewSignature } from './mp-views.js';
import { qrSvg } from './qr.js';
import { topbar, field, switchRow, section, sheet } from './widgets.js';
import { TEAM_COLORS } from './store.js';

const RESUME_MAX_AGE = 3 * 3600 * 1000;
const STATUS_TEXT = {
  ok: 'Online',
  connecting: 'Verbinde …',
  'waiting-host': 'Warte auf Gastgeber …',
  reconnecting: 'Verbinde neu …',
  offline: 'Offline',
  full: 'Der Raum ist voll',
};
const JOIN_ERRORS = {
  'not-found': ['Raum nicht gefunden', 'Prüfe den Code. Der Gastgeber muss den Raum zuerst geöffnet haben.'],
  'no-host': ['Gastgeber nicht erreichbar', 'Der Raum existiert, aber der Gastgeber ist gerade nicht verbunden. Er muss das Spiel offen lassen.'],
  full: ['Der Raum ist voll', 'Es können höchstens 20 Geräte mitspielen.'],
  offline: ['Keine Verbindung', 'Du bist offline oder der Server ist nicht erreichbar.'],
};
const REJECTED = {
  running: ['Das Spiel läuft schon', 'Neue Spieler können nur vor dem Start beitreten. Warst du schon dabei? Dann tippe auf deinen Namen.'],
  full: ['Der Raum ist voll', 'Es können höchstens 20 Geräte mitspielen.'],
  name: ['Name fehlt', 'Bitte gib einen Namen ein.'],
  kicked: ['Du wurdest entfernt', 'Der Gastgeber hat dich aus dem Raum genommen.'],
  closed: ['Der Raum ist geschlossen', 'Der Gastgeber hat das Spiel beendet.'],
};

const randomKey = () => {
  const a = new Uint8Array(16);
  (globalThis.crypto || { getRandomValues: (x) => x.fill(7) }).getRandomValues(a);
  return [...a].map((b) => b.toString(36).padStart(2, '0')).join('');
};

export function roomUrl(code, loc = globalThis.location) {
  const u = new URL(loc.href);
  u.search = '';
  u.hash = '';
  u.pathname = u.pathname.replace(/[^/]*$/, '');
  return `${u.origin}${u.pathname}?raum=${code}`;
}

export function createMultiplayer(A) {
  const { store } = A;
  const M = { role: null, code: null, net: null, client: null, host: null, session: null, join: null, tick: null, sig: '', pending: false };
  const server = () => {
    try {
      return globalThis.PSST_ROOM_URL || localStorage.getItem('psst:server') || ROOM_SERVER;
    } catch {
      return ROOM_SERVER;
    }
  };
  const transport = () => createWebSocketTransport({ base: server() });
  const ss = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* optional */ } },
    del: (k) => { try { sessionStorage.removeItem(k); } catch { /* optional */ } },
  };
  const clientId = () => {
    let id = ss.get('psst:mp-cid');
    if (!id) { id = makeClientId(); ss.set('psst:mp-cid', id); }
    return id;
  };

  /* ---------- chrome: connection dot + banner ---------- */

  const dot = h('span', { class: 'mp-conn', hidden: true, role: 'status' }, h('i'), h('span', { class: 'mp-conn-text' }));
  const banner = h('div', { class: 'mp-conn-banner', hidden: true, role: 'status' });
  document.body.append(dot, banner);

  function connection() {
    if (M.session) return M.session.connection();
    if (M.net) {
      if (M.net.status === 'full') return 'full';
      if (M.net.status === 'offline') return 'offline';
      return M.net.status === 'online' ? 'ok' : M.net.status === 'connecting' ? 'connecting' : 'reconnecting';
    }
    return 'ok';
  }
  function updateChrome() {
    const active = !!(M.role && A.screen.startsWith('mp') && A.screen !== 'mp-start');
    dot.hidden = !active;
    const c = connection();
    const kind = c === 'ok' ? 'good' : c === 'waiting-host' || c === 'reconnecting' || c === 'connecting' ? 'warn' : 'bad';
    dot.className = 'mp-conn ' + kind;
    dot.setAttribute('aria-label', 'Verbindung: ' + STATUS_TEXT[c]);
    dot.lastChild.textContent = c === 'ok' ? '' : STATUS_TEXT[c];
    banner.hidden = !active || c === 'ok' || c === 'connecting';
    banner.className = 'mp-conn-banner ' + kind;
    banner.textContent = STATUS_TEXT[c] + (c === 'offline' ? ' – ohne Internet geht Mehrspieler nicht.' : '');
    const tvMode = !!(M.session && M.session.view && M.session.view.you && (M.session.view.role === 'anzeige' || M.session.view.you.display));
    document.documentElement.classList.toggle('tv-mode', tvMode && active);
  }

  /* ---------- views ---------- */

  const views = createMpViews({
    feedback: A.feedback,
    confirm: (t, ok, fn) => A.confirm(t, ok, fn),
    openReport: (card, o) => A.openReport(card, o),
    wakeOn: () => A.wake.on(),
    openHostMenu: () => hostMenu(),
    rematch: () => rematch(),
    toLobby: () => M.host && M.host.backToLobby(),
    closeRoom: () => closeRoomConfirm(),
    leave: () => leaveRoom(),
  });

  /* ---------- session lifecycle ---------- */

  function teardown({ keepScreen = false } = {}) {
    if (M.tick) clearInterval(M.tick);
    if (M.host) M.host.stop();
    if (M.client) M.client.stop();
    if (M.net) M.net.close();
    views.stop();
    Object.assign(M, { role: null, code: null, net: null, client: null, host: null, session: null, join: null, tick: null, sig: '', pending: false });
    ss.del('psst:mp-guest');
    updateChrome();
    if (!keepScreen) A.wake.off();
  }
  function exit() {
    teardown();
    A.go('start');
  }

  function refresh() {
    updateChrome();
    if (A.screen !== 'mp-room' || !M.role) return;
    const sig = signature();
    if (sig === M.sig) return;
    if (typing()) { M.pending = true; return; }
    A.render();
  }
  const typing = () => {
    const a = document.activeElement;
    return !!(a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && document.querySelector('.view').contains(a));
  };
  document.addEventListener('focusout', () => setTimeout(() => { if (M.pending && !typing()) { M.pending = false; refresh(); } }, 50));

  function signature() {
    if (M.role === 'host') {
      const S = M.host.S;
      const v = M.host.viewFor(M.host.id);
      if (!v || v.kind === 'lobby') {
        return 'L' + JSON.stringify([S.teams, S.order.map((id) => [S.players[id].name, S.players[id].team, S.players[id].connected, S.players[id].kind]), S.options, S.settings, S.packLabels, S.closed]);
      }
      return 'G' + viewSignature(v) + S.order.map((id) => (S.players[id].connected ? 1 : 0)).join('');
    }
    return (M.client ? M.client.st.stage + (M.client.st.reason || '') : '') + viewSignature(M.client && M.client.view);
  }

  /* ---------- host ---------- */

  function startHost({ code, hostKey, hostId, snapshot = null, name, tries = 0 }) {
    const net = createNet({ transport: transport(), code, clientId: hostId, isHost: true, expectTraffic: () => !!(M.host && Object.values(M.host.S.players).some((p) => !p.isHost && p.connected)) });
    const labels = () => (A.index || []).filter((p) => A.selection.has(p.id)).map((p) => p.name);
    const host = createHostSession({
      net, code, hostKey, hostId,
      deckFactory: (ids) => A.buildDeck(ids),
      storage: {
        save: (s) => {
          store.saveMpHost(s);
          if (host.S.game) {
            store.savePlayed(host.S.game.deck.played);
            if (host.S.game.phase === 'tabelle' || host.S.game.phase === 'ende') A.updateProgress(host.S.game, host.S.packIds);
          }
        },
        clear: () => store.clearMpHost(),
      },
      settings: { ...A.settings },
      teams: A.teams.map((t) => ({ name: t.name, color: t.color })),
      packIds: [...A.selection],
      packLabels: labels(),
      options: { oneGuard: false },
      onUpdate: refresh,
      onTaken: () => {
        // the code is used by another host: take a new one
        if (tries > 6) return exit();
        teardown({ keepScreen: true });
        startHost({ code: makeCode(), hostKey: randomKey(), hostId: makeClientId(), name, tries: tries + 1 });
        A.go('mp-room');
      },
    });
    Object.assign(M, { role: 'host', code, net, host, session: createLocalSession(host) });
    M.session.host = host;
    if (!snapshot) host.addSelf(name, 0);
    M.tick = setInterval(() => host.tick(), 100);
    net.on('status', refresh);
    net.connect();
    return snapshot ? host.restore(snapshot) : Promise.resolve();
  }

  function createRoom(name) {
    store.saveMpName(name);
    teardown({ keepScreen: true });
    startHost({ code: makeCode(), hostKey: randomKey(), hostId: makeClientId(), name });
    A.go('mp-room');
  }

  async function resume() {
    const snap = store.mpHost();
    if (!snap || !snap.code || Date.now() - snap.savedAt > RESUME_MAX_AGE) { store.clearMpHost(); return false; }
    teardown({ keepScreen: true });
    try {
      const ready = startHost({ code: snap.code, hostKey: snap.hostKey, hostId: snap.hostId, snapshot: snap });
      A.go('mp-room');
      await ready;
      refresh();
      A.render();
      return true;
    } catch (e) {
      teardown();
      store.clearMpHost();
      A.toast('Der Raum konnte nicht fortgesetzt werden: ' + (e.message || e), { kind: 'warn' });
      A.go('start');
      return false;
    }
  }

  async function rematch() {
    try { await M.host.rematch(); } catch (e) { A.toast(e.message || 'Neustart fehlgeschlagen.', { kind: 'warn' }); }
  }
  function closeRoomConfirm() {
    A.confirm('Den Raum für alle schließen? Das Spiel wird beendet.', 'Raum schließen', () => {
      if (M.host) M.host.endRoom();
      setTimeout(exit, 60);
    });
  }
  function leaveRoom() {
    if (M.role === 'guest' && M.client) M.client.leave();
    exit();
  }

  /* ---------- guest ---------- */

  function openJoin(code, { kind = 'player', auto = null } = {}) {
    teardown({ keepScreen: true });
    const net = createNet({ transport: transport(), code, clientId: clientId() });
    const client = createClient({ net });
    Object.assign(M, { role: 'guest', code, net, client, join: { stage: 'connecting', info: null, error: null, kind, auto } });
    net.on('status', refresh);
    client.onUpdate(refresh);
    net.connect();
    A.go('mp-join');
    client.probe().then(
      (info) => {
        if (M.client !== client) return;
        M.join.stage = 'info';
        M.join.info = info;
        if (kind === 'display') return doJoin({ kind: 'display' });
        if (auto && auto.name && !info.running) return doJoin({ name: auto.name, team: auto.team, kind: 'player' });
        if (auto && auto.name && info.running && info.rejoin.some((n) => n.toLowerCase() === auto.name.toLowerCase())) return doJoin({ name: auto.name, kind: 'player' });
        if (A.screen === 'mp-join') A.render();
      },
      (e) => {
        if (M.client !== client) return;
        M.join.stage = 'error';
        M.join.error = e.code || 'offline';
        if (A.screen === 'mp-join') A.render();
      },
    );
  }

  function doJoin(args) {
    if (args.kind !== 'display') {
      store.saveMpName(args.name);
      ss.set('psst:mp-guest', JSON.stringify({ code: M.code, name: args.name, team: args.team ?? null, kind: 'player' }));
    } else ss.set('psst:mp-guest', JSON.stringify({ code: M.code, kind: 'display' }));
    M.session = M.client;
    M.client.join(args);
    A.go('mp-room');
  }

  /* ---------- share ---------- */

  async function shareLink(code) {
    const url = roomUrl(code);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Psst!', text: `Komm in meinen Psst!-Raum ${code}`, url });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch { /* fall through */ }
    A.toast(ok ? 'Link kopiert.' : url, { kind: ok ? 'good' : 'info', ms: ok ? 3000 : 8000 });
  }

  /* ---------- screens ---------- */

  function start() {
    const nameIn = h('input', { class: 'input', type: 'text', maxLength: MAX_NAME, value: store.mpName(), placeholder: 'Dein Name', 'aria-label': 'Dein Name', autocomplete: 'off', enterKeyHint: 'done' });
    const codeIn = h('input', { class: 'input mp-code-in', type: 'text', maxLength: 8, placeholder: 'CODE', 'aria-label': 'Raumcode', autocomplete: 'off', autocapitalize: 'characters', spellcheck: false, inputMode: 'text' });
    codeIn.addEventListener('input', () => { codeIn.value = cleanCode(codeIn.value); });
    const needName = () => {
      const n = nameIn.value.trim();
      if (!n) { A.toast('Wie heißt du?', { kind: 'warn' }); nameIn.focus(); return null; }
      return n;
    };
    const code = () => {
      const c = cleanCode(codeIn.value);
      if (!CODE_RE.test(c)) { A.toast('Der Raumcode hat 5 Zeichen.', { kind: 'warn' }); codeIn.focus(); return null; }
      return c;
    };
    return h('main', { class: 'page mp-start' },
      topbar('Mehrere Handys', () => A.go('start')),
      h('div', { class: 'scroll' },
        h('p', { class: 'hint', text: 'Jeder spielt mit dem eigenen Handy: Der Erklärer sieht die Karte, die Wächter der anderen Teams auch – alle anderen nicht. Braucht Internet.' }),
        section('Dein Name', nameIn),
        section('Neuen Raum erstellen',
          h('p', { class: 'hint', text: 'Du bist Gastgeber: Dein Handy rechnet das Spiel. Die anderen scannen einen QR-Code.' }),
          h('button', { class: 'btn btn-primary btn-xl', type: 'button', text: 'Raum erstellen', onClick: () => { const n = needName(); if (n) createRoom(n); } })),
        section('Einem Raum beitreten',
          h('p', { class: 'hint', text: 'Meist reicht es, den QR-Code des Gastgebers mit der Kamera zu scannen.' }),
          codeIn,
          h('button', { class: 'btn btn-xl', type: 'button', text: 'Beitreten', onClick: () => { const n = needName(); const c = n && code(); if (c) { store.saveMpName(n); openJoin(c); } } }),
          h('button', { class: 'btn btn-xl', type: 'button', text: 'Als Anzeige (Fernseher)', onClick: () => { const c = code(); if (c) openJoin(c, { kind: 'display' }); } })),
      ),
    );
  }

  function errorCard([title, text], actions) {
    return h('div', { class: 'mp-error', role: 'alert' }, h('h2', { text: title }), h('p', { text }), h('div', { class: 'stack tight' }, actions));
  }

  function joinScreen() {
    const J = M.join;
    const back = () => exit();
    if (!J || J.stage === 'connecting') {
      return h('main', { class: 'page mp-join' }, topbar('Beitreten', back), h('div', { class: 'scroll' }, h('div', { class: 'mp-wait big', role: 'status' }, h('span', { class: 'spinner' }), `Verbinde mit Raum ${M.code} …`)));
    }
    if (J.stage === 'error') {
      return h('main', { class: 'page mp-join' }, topbar('Beitreten', back), h('div', { class: 'scroll' }, errorCard(JOIN_ERRORS[J.error] || JOIN_ERRORS.offline, [
        h('button', { class: 'btn btn-primary btn-xl', type: 'button', text: 'Erneut versuchen', onClick: () => openJoin(M.code, { kind: J.kind, auto: J.auto }) }),
        h('button', { class: 'btn btn-xl', type: 'button', text: 'Zurück', onClick: back })])));
    }
    const info = J.info;
    const nameIn = h('input', { class: 'input', type: 'text', maxLength: MAX_NAME, value: store.mpName(), placeholder: 'Dein Name', 'aria-label': 'Dein Name', autocomplete: 'off', enterKeyHint: 'done' });
    const join = (team) => {
      const n = nameIn.value.trim();
      if (!n) { A.toast('Wie heißt du?', { kind: 'warn' }); nameIn.focus(); return; }
      doJoin({ name: n, team, kind: 'player' });
    };
    const tvBtn = h('button', { class: 'link', type: 'button', text: 'Als Anzeige (Fernseher) beitreten', onClick: () => doJoin({ kind: 'display' }) });
    if (info.running) {
      return h('main', { class: 'page mp-join' }, topbar(`Raum ${M.code}`, back), h('div', { class: 'scroll' },
        h('div', { class: 'mp-error' }, h('h2', { text: 'Das Spiel läuft schon' }),
          info.rejoin.length ? h('p', { text: 'Warst du schon dabei? Tippe auf deinen Namen:' }) : h('p', { text: 'Neue Spieler können nur vor dem Start beitreten.' })),
        h('div', { class: 'stack tight' }, info.rejoin.map((n) => h('button', { class: 'btn btn-xl', type: 'button', text: n, onClick: () => doJoin({ name: n, kind: 'player' }) }))),
        tvBtn));
    }
    if (info.full) {
      return h('main', { class: 'page mp-join' }, topbar(`Raum ${M.code}`, back), h('div', { class: 'scroll' }, errorCard(JOIN_ERRORS.full, [h('button', { class: 'btn btn-xl', type: 'button', text: 'Zurück', onClick: back })])));
    }
    return h('main', { class: 'page mp-join' },
      topbar(`Raum ${M.code}`, back),
      h('div', { class: 'scroll' },
        h('p', { class: 'hint', text: info.hostName ? `${info.hostName} hat dich eingeladen.` : 'Du wurdest eingeladen.' }),
        section('Dein Name', nameIn),
        section('Wähle dein Team',
          h('div', { class: 'mp-team-pick' }, info.teams.map((t, i) => h('button', { class: 'mp-team-btn', type: 'button', style: { '--tc': t.color }, onClick: () => join(i) },
            h('b', { text: t.name }), h('small', { text: t.n ? `${t.n} Spieler` : 'noch leer' })))),
          h('button', { class: 'btn btn-xl', type: 'button', text: 'Zufällig', onClick: () => join('random') })),
        tvBtn));
  }

  function hostLobby() {
    const host = M.host;
    const S = host.S;
    const L = host.lobby;
    const chk = host.check();
    const players = S.order.map((id) => S.players[id]).filter((p) => p.kind === 'player');
    const displays = S.order.filter((id) => S.players[id].kind === 'display').length;
    const nextColor = (i) => {
      const used = new Set(S.teams.filter((_, j) => j !== i).map((t) => t.color));
      const start = TEAM_COLORS.indexOf(S.teams[i].color);
      for (let k = 1; k <= TEAM_COLORS.length; k++) {
        const c = TEAM_COLORS[(start + k) % TEAM_COLORS.length];
        if (!used.has(c)) return c;
      }
      return S.teams[i].color;
    };
    const chip = (p) => h('button', { class: 'chip mp-chip' + (p.connected ? '' : ' off'), type: 'button', 'aria-label': `${p.name} verschieben`, onClick: () => moveSheet(p) },
      h('i', { class: 'mp-dot' + (p.connected ? ' on' : '') }), p.name + (p.isHost ? ' (du)' : ''));
    const moveSheet = (p) => {
      let s;
      const body = h('div', { class: 'stack tight' }, S.teams.map((t, i) => h('button', { class: 'btn' + (p.team === i ? ' btn-primary' : ''), type: 'button', style: { '--tc': t.color }, text: t.name, onClick: () => { L.setTeam(p.id, i); s.close(); } })));
      s = sheet({ title: p.name, body, actions: [...(p.isHost ? [] : [{ label: 'Aus dem Raum entfernen', kind: 'danger', onClick: () => L.kick(p.id) }]), { label: 'Abbrechen', kind: 'ghost' }] });
    };
    const teamCards = S.teams.map((t, i) => {
      const nameIn = h('input', { class: 'input', type: 'text', value: t.name, maxLength: 18, 'aria-label': `Name von Team ${i + 1}`, autocomplete: 'off', enterKeyHint: 'done', onChange: (e) => L.renameTeam(i, e.target.value) });
      const members = players.filter((p) => p.team === i);
      return h('section', { class: 'team-card', style: { '--tc': t.color } },
        h('div', { class: 'team-row' },
          h('button', { class: 'color-dot', type: 'button', 'aria-label': `Farbe von ${t.name} ändern`, onClick: () => L.setColor(i, nextColor(i)) }),
          nameIn,
          S.teams.length > 2 ? h('button', { class: 'icon-btn small', type: 'button', 'aria-label': `${t.name} entfernen`, text: '×', onClick: () => L.removeTeam(i) }) : null),
        h('div', { class: 'chips' }, members.length ? members.map(chip) : h('small', { class: 'hint', text: 'Noch niemand. Tippe einen Spieler an, um ihn hierher zu verschieben.' })));
    });
    const loose = players.filter((p) => p.team === null || p.team === undefined);
    const s = S.settings;
    const modeText = s.mode === 'punkte' ? `Punkteziel ${s.target}` : s.mode === 'runden' ? `${s.rounds} Runden` : 'Freies Spiel';
    const invite = h('section', { class: 'panel mp-invite' },
      h('h2', { text: 'Mitspieler einladen' }),
      h('div', { class: 'qr-box', innerHTML: qrSvg(roomUrl(M.code), { label: 'QR-Code zum Beitreten' }) }),
      h('p', { class: 'hint center', text: 'Mit der Handy-Kamera scannen oder den Code eingeben:' }),
      h('div', { class: 'mp-code', 'aria-label': 'Raumcode ' + M.code.split('').join(' '), text: M.code }),
      h('div', { class: 'mp-row' },
        h('button', { class: 'btn', type: 'button', text: 'Link teilen', onClick: () => shareLink(M.code) }),
        h('button', { class: 'btn', type: 'button', text: 'Code kopieren', onClick: async () => { try { await navigator.clipboard.writeText(M.code); A.toast('Code kopiert.', { kind: 'good' }); } catch { A.toast(M.code); } } })),
      h('p', { class: 'hint center', text: `Fernseher: ${roomUrl(M.code).replace(/^https?:\/\//, '')} öffnen und „Als Anzeige“ wählen.` }),
      displays ? h('p', { class: 'hint center', text: `${displays} ${displays === 1 ? 'Anzeige' : 'Anzeigen'} verbunden.` }) : null);
    return h('main', { class: 'page mp-lobby' },
      topbar('Lobby', () => closeRoomConfirm()),
      h('div', { class: 'scroll' },
        invite,
        h('h2', { class: 'group', text: `Teams · ${players.length} ${players.length === 1 ? 'Spieler' : 'Spieler'}` }),
        ...teamCards,
        loose.length ? h('section', { class: 'team-card loose' }, h('p', { class: 'hint', text: 'Noch ohne Team (werden beim Start zufällig verteilt):' }), h('div', { class: 'chips' }, loose.map(chip))) : null,
        S.teams.length < 4 ? h('button', { class: 'btn btn-add', type: 'button', text: '+ Team hinzufügen', onClick: () => { const used = new Set(S.teams.map((t) => t.color)); L.addTeam(TEAM_COLORS.find((c) => !used.has(c)) || TEAM_COLORS[0]); } }) : null,
        section('Spiel',
          field('Kartenpakete', S.packLabels.length ? S.packLabels.join(', ') : 'noch keine gewählt',
            h('button', { class: 'btn', type: 'button', text: 'Kartenpakete wählen ›', onClick: () => A.go('mp-packs') })),
          field('Regeln', `${s.turnSecs} s pro Zug · ${modeText} · Buzzer ${s.buzzPause ? 'pausiert' : 'zählt sofort'}`,
            h('button', { class: 'btn', type: 'button', text: 'Weitere Regeln ›', onClick: () => { A.back = 'mp-room'; A.go('settings'); } })),
          switchRow('Nur ein Wächter pro Zug', 'Sonst passen alle Spieler der anderen Teams auf. Mit der Option wechselt ein einzelner Wächter reihum.', S.options.oneGuard, (v) => L.setOptions({ oneGuard: v }))),
        h('p', { class: 'note', text: 'Tipp: Bildschirm anlassen. Wenn ein Handy sich sperrt, trennt es die Verbindung und kommt erst beim Entsperren zurück.' }),
      ),
      h('footer', { class: 'actionbar' },
        // one line is enough: the first problem that blocks the start, else the first hint
        chk.errors.length ? h('small', { class: 'mp-note err', text: chk.errors[0] }) : chk.warnings.length ? h('small', { class: 'mp-note', text: chk.warnings[0] + (chk.warnings.length > 1 ? ` (+${chk.warnings.length - 1})` : '') }) : null,
        h('button', { class: 'btn btn-primary btn-xl', type: 'button', text: 'Spiel starten', disabled: !chk.ok, onClick: async (e) => {
          e.currentTarget.disabled = true;
          try { await host.startGame(); } catch (err) { A.toast(err.message || 'Start fehlgeschlagen.', { kind: 'warn' }); refresh(); A.render(); }
        } })),
    );
  }

  /** Lobby of a guest / the Anzeige (view based). */
  function guestLobby(v, session) {
    const tvMode = v.you.display;
    const teams = v.teams.map((t, i) => h('section', { class: 'team-card' + (v.you.team === i ? ' mine' : ''), style: { '--tc': t.color } },
      h('div', { class: 'team-row' }, h('span', { class: 'color-dot static' }), h('b', { class: 'mp-team-name', text: t.name })),
      h('div', { class: 'chips' }, t.players.length ? t.players.map((p) => h('span', { class: 'chip mp-chip' + (p.connected ? '' : ' off') }, h('i', { class: 'mp-dot' + (p.connected ? ' on' : '') }), p.name + (p.me ? ' (du)' : ''))) : h('small', { class: 'hint', text: 'noch leer' })),
      !tvMode && v.you.team !== i ? h('button', { class: 'btn small', type: 'button', text: 'In dieses Team wechseln', onClick: () => session.act('lobby-team', { team: i }) }) : null));
    const s = v.settings;
    const modeText = s.mode === 'punkte' ? `Punkteziel ${s.target}` : s.mode === 'runden' ? `${s.rounds} Runden` : 'Freies Spiel';
    if (tvMode) {
      return h('main', { class: 'tv tv-lobby' },
        h('section', { class: 'tv-main' }, h('p', { class: 'tv-eyebrow', text: 'Psst! · Raum' }), h('div', { class: 'tv-roomcode', text: v.code }), h('p', { class: 'tv-small', text: 'Warte auf den Start durch ' + (v.hostName || 'den Gastgeber') + ' …' }),
          h('div', { class: 'qr-box tv-qr', innerHTML: qrSvg(roomUrl(v.code), { label: 'QR-Code zum Beitreten' }) })),
        h('aside', { class: 'tv-side' }, v.teams.map((t) => h('div', { class: 'tv-lobby-team', style: { '--tc': t.color } }, h('b', { text: t.name }), h('span', { text: t.players.map((p) => p.name).join(', ') || '–' })))));
    }
    return h('main', { class: 'page mp-lobby' },
      topbar('Lobby', () => leaveRoom()),
      h('div', { class: 'scroll' },
        h('section', { class: 'panel' }, h('h2', { text: `Raum ${v.code}` }), h('p', { class: 'hint', text: `Du bist ${v.you.name}. ${v.hostName ? v.hostName + ' ist Gastgeber.' : ''}` }),
          h('p', { class: 'hint', text: `${s.turnSecs} s pro Zug · ${modeText}${v.options.oneGuard ? ' · ein Wächter pro Zug' : ''}${v.packLabels.length ? ' · ' + v.packLabels.join(', ') : ''}` })),
        ...teams,
        v.loose.length ? h('section', { class: 'team-card loose' }, h('p', { class: 'hint', text: 'Noch ohne Team:' }), h('div', { class: 'chips' }, v.loose.map((p) => h('span', { class: 'chip mp-chip' }, p.name + (p.me ? ' (du)' : ''))))) : null,
        h('div', { class: 'mp-wait', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Warte auf den Start durch den Gastgeber …'),
        h('p', { class: 'note', text: 'Tipp: Bildschirm anlassen, sonst trennt dein Handy die Verbindung.' })));
  }

  function room() {
    if (!M.role) return h('main', { class: 'page' }, h('p', { class: 'note', text: 'Kein Raum aktiv.' }), h('button', { class: 'btn', type: 'button', text: 'Zurück', onClick: () => A.go('start') }));
    const session = M.session;
    const st = M.client && M.client.st;
    M.sig = signature();
    if (M.role === 'guest' && st && st.stage === 'rejected') {
      return h('main', { class: 'page' }, topbar('Raum', () => exit()), h('div', { class: 'scroll' }, errorCard(REJECTED[st.reason] || ['Beitritt nicht möglich', String(st.reason || '')], [h('button', { class: 'btn btn-xl', type: 'button', text: 'Zum Hauptmenü', onClick: () => exit() })])));
    }
    if (M.role === 'guest' && st && st.stage === 'closed') {
      return h('main', { class: 'page' }, topbar('Raum', () => exit()), h('div', { class: 'scroll' }, errorCard(REJECTED.closed, [h('button', { class: 'btn btn-xl', type: 'button', text: 'Zum Hauptmenü', onClick: () => exit() })])));
    }
    const v = session && session.view;
    if (!v) {
      const msg = M.role === 'host' ? 'Raum wird vorbereitet …' : 'Trete bei …';
      return h('main', { class: 'page' }, topbar('Raum', () => leaveRoom()), h('div', { class: 'scroll' }, h('div', { class: 'mp-wait big', role: 'status' }, h('span', { class: 'spinner' }), msg)));
    }
    if (v.kind === 'closed') {
      return h('main', { class: 'page' }, h('div', { class: 'scroll' }, errorCard(REJECTED.closed, [h('button', { class: 'btn btn-xl', type: 'button', text: 'Zum Hauptmenü', onClick: () => exit() })])));
    }
    if (v.kind === 'lobby') {
      views.stop();
      if (M.role === 'host') { A.wake.on(); return hostLobby(); }
      A.wake.on();
      return guestLobby(v, session);
    }
    return views.render(session);
  }

  /* ---------- host menu ---------- */

  function hostMenu() {
    const host = M.host;
    if (!host) return;
    const S = host.S;
    const rows = S.order.map((id) => S.players[id]).map((p) => h('li', { class: p.connected ? '' : 'off' }, h('i', { class: 'mp-dot' + (p.connected ? ' on' : '') }),
      h('span', { text: p.kind === 'display' ? 'Anzeige (Fernseher)' : p.name + (p.isHost ? ' (du)' : '') }),
      h('small', { text: p.connected ? 'online' : 'offline' })));
    const body = h('div', { class: 'stack tight' },
      h('div', { class: 'qr-box small', innerHTML: qrSvg(roomUrl(M.code), { label: 'QR-Code' }) }),
      h('div', { class: 'mp-code small', text: M.code }),
      h('button', { class: 'btn', type: 'button', text: 'Link teilen', onClick: () => shareLink(M.code) }),
      h('ul', { class: 'mp-devices' }, rows));
    sheet({
      title: 'Raum ' + M.code,
      body,
      actions: [
        ...(S.game && ['tabelle', 'bereit'].includes(S.game.phase) && !S.game.over ? [{ label: 'Spiel beenden', kind: 'danger', onClick: () => { A.confirm('Das Spiel jetzt beenden? Der aktuelle Punktestand entscheidet.', 'Beenden', () => host.intent('beenden')); } }] : []),
        { label: 'Raum schließen', kind: 'danger', onClick: () => closeRoomConfirm() },
        { label: 'Schließen', kind: 'ghost' },
      ],
    });
  }

  /* ---------- boot ---------- */

  document.addEventListener('visibilitychange', () => {
    // the Erklärer's phone goes to the background: stop the clock (like in the one-phone mode)
    if (document.visibilityState === 'hidden' && M.session && M.session.view && M.session.view.kind === 'game' && M.session.view.role === 'erklaerer' && M.session.view.phase === 'laeuft') M.session.act('pause');
  });

  function boot() {
    const params = new URLSearchParams(location.search);
    const code = cleanCode(params.get('raum') || '');
    let guest = null;
    try { guest = JSON.parse(ss.get('psst:mp-guest') || 'null'); } catch { guest = null; }
    if (CODE_RE.test(code)) {
      const auto = guest && guest.code === code ? guest : null;
      if (auto && auto.kind === 'display') openJoin(code, { kind: 'display' });
      else openJoin(code, { auto });
      return true;
    }
    if (guest && CODE_RE.test(guest.code)) {
      openJoin(guest.code, guest.kind === 'display' ? { kind: 'display' } : { auto: guest });
      return true;
    }
    const snap = store.mpHost();
    if (snap && Date.now() - snap.savedAt < RESUME_MAX_AGE) {
      resume();
      return true;
    }
    return false;
  }

  /** Called before the room screen is shown again (e.g. back from the settings screen): hand the settings to the lobby. */
  function beforeRoom() {
    if (M.role === 'host' && M.host && M.host.S.phase === 'lobby') M.host.lobby.setSettings({ ...A.settings });
  }
  /** Back from the Kartenpakete screen. */
  function packsDone() {
    if (M.role === 'host' && M.host) {
      const ids = [...A.selection].filter((id) => !A.index || A.index.some((p) => p.id === id));
      M.host.lobby.setPacks(ids, (A.index || []).filter((p) => ids.includes(p.id)).map((p) => p.name));
    }
    A.go('mp-room');
  }

  return {
    state: M,
    beforeRoom,
    packsDone,
    screens: { 'mp-start': start, 'mp-join': joinScreen, 'mp-room': room },
    boot,
    resume,
    updateChrome,
    exit,
  };
}
