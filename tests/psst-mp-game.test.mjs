import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { startedGame, makeHost, makeGuest, closeAll, createMemoryRoom, until, sleep, WORDS } from './helpers/mp-harness.mjs';
import { createNet } from '../games/psst/net.js';
import { createHostSession } from '../games/psst/host.js';
import { createClient } from '../games/psst/client.js';
import { createDeck, mulberry32 } from '../games/psst/logic.js';

after(closeAll);
const settle = () => sleep(25);

/** Name-based access to the five devices of a started game. */
function dev(T) {
  const view = (n) => (n === 'Hanna' ? T.host.viewFor(T.host.id) : T.guests[n].client.view);
  const act = (n, t, extra = {}) => (n === 'Hanna' ? T.host.intent(t, extra) : T.guests[n].client.act(t, extra));
  const roles = () => Object.fromEntries(['Hanna', 'Anna', 'Ben', 'Cleo', 'TV'].map((n) => [n, view(n).role]));
  const idOf = (n) => (n === 'Hanna' ? T.host.id : T.guests[n].net.id);
  return { view, act, roles, idOf };
}
const erklaerer = (D) => Object.entries(D.roles()).find(([, r]) => r === 'erklaerer')[0];

/** Run a whole Zug: Erklärer taps bereit, `hits` x richtig, time runs out, summary + confirm. Returns the words guessed. */
async function playZug(T, D, { hits = 2, afterTime = null } = {}) {
  const e = erklaerer(D);
  assert.equal(D.act(e, 'bereit'), e === 'Hanna' ? true : true);
  await settle();
  const words = [];
  for (let i = 0; i < hits; i++) {
    const c = D.view(e).card;
    words.push(c.w);
    D.act(e, 'richtig', { ref: c.id });
    await settle();
  }
  T.clock.t += 61_000;
  T.host.tick();
  await settle();
  if (afterTime) await afterTime();
  D.act(e, 'zusammenfassung');
  await settle();
  D.act(e, 'bestaetigen');
  await settle();
  return words;
}

test('lobby: probe, join with team / random / display, unique names, start checks', async () => {
  const room = createMemoryRoom();
  const H = makeHost(room);
  H.host.addSelf('Hanna', 0);
  await until(() => H.net.status === 'online');
  const g = makeGuest(room, 'guestanna000');
  const info = await (async () => {
    await until(() => g.net.status === 'online');
    return g.client.probe();
  })();
  assert.deepEqual(info.teams.map((t) => [t.name, t.n]), [['Rot', 1], ['Blau', 0]]);
  assert.equal(info.running, false);
  assert.equal(H.host.check().ok, false); // one player only
  g.client.join({ name: 'Anna', team: 'random' });
  await until(() => g.client.view);
  assert.equal(g.client.view.kind, 'lobby');
  assert.equal(g.client.view.you.team, 1, 'random goes to the smaller team');
  const g2 = makeGuest(room, 'guestanna002');
  await until(() => g2.net.status === 'online');
  g2.client.join({ name: 'anna', team: 1 });
  await until(() => g2.client.view);
  assert.equal(g2.client.view.teams[1].players.map((p) => p.name).join(), 'Anna,anna 2');
  const tv = makeGuest(room, 'guesttv000002');
  await until(() => tv.net.status === 'online');
  tv.client.join({ kind: 'display' });
  await until(() => tv.client.view);
  assert.equal(tv.client.view.you.display, true);
  assert.equal(g.client.view.displays, 1);
  const c = H.host.check();
  assert.equal(c.ok, true);
  assert.ok(c.warnings.some((w) => w.includes('Rot hat nur einen Spieler')));
  // moving a player in the lobby shows up on the device
  H.host.lobby.setTeam('guestanna000', 0);
  await until(() => g.client.view.you.team === 0);
  // empty packs block the start
  H.host.lobby.setPacks([]);
  assert.equal(H.host.check().ok, false);
});

test('a room that does not exist / has no host answers with an error code', async () => {
  const room = createMemoryRoom();
  const g = makeGuest(room, 'guestlost000');
  await until(() => g.net.status === 'online');
  await assert.rejects(g.client.probe({ timeout: 300 }), (e) => e.code === 'not-found');
  // a room that was hosted before but whose host is gone
  const H = makeHost(room, { code: 'ABCDE' });
  await until(() => H.net.status === 'online');
  const g2 = makeGuest(room, 'guestlost001');
  await until(() => g2.net.status === 'online');
  H.net.close();
  await sleep(30);
  await assert.rejects(g2.client.probe({ timeout: 300 }), (e) => e.code === 'no-host');
});

test('role views: the Karte reaches Erklärer and Wächter only, never Rater or Anzeige (views and wire)', async () => {
  const T = await startedGame();
  const D = dev(T);
  assert.deepEqual(D.roles(), { Hanna: 'erklaerer', Anna: 'rater', Ben: 'waechter', Cleo: 'waechter', TV: 'anzeige' });
  assert.equal(D.view('Hanna').card, undefined, 'no card before Bereit');
  D.act('Hanna', 'bereit');
  await settle();
  const c = D.view('Hanna').card;
  assert.ok(c.w.startsWith('Suchwort'));
  assert.equal(D.view('Ben').card.w, c.w);
  assert.equal(D.view('Cleo').card.w, c.w);
  for (const n of ['Anna', 'TV']) {
    assert.equal(D.view(n).card, undefined);
    const json = JSON.stringify(D.view(n));
    assert.ok(!json.includes(c.w), n + ' view leaks the word');
    assert.ok(!json.includes('Tabu'), n + ' view leaks a Tabuwort');
  }
  assert.equal(D.view('Anna').zug.guessed, 0);
  // play on: every frame that ever reached Anna or the TV is free of cards while the Zug runs
  for (let i = 0; i < 3; i++) {
    D.act('Hanna', 'richtig', { ref: D.view('Hanna').card.id });
    await settle();
  }
  D.act('Hanna', 'ueberspringen', { ref: D.view('Hanna').card.id });
  await settle();
  D.act('Ben', 'buzzer', { ref: D.view('Ben').card.id });
  await settle();
  assert.equal(D.view('Anna').zug.pause, 'buzzer');
  assert.equal(D.view('Anna').card, undefined, 'the buzzer dialog on a Rater device shows no card either');
  D.act('Anna', 'einspruch-neu', { ref: D.view('Anna').zug.buzz.seq });
  await settle();
  assert.equal(D.view('Anna').zug.guessed, 3);
  const ids = [D.idOf('Anna'), D.idOf('TV')];
  const toThem = T.room.log.filter((l) => ids.includes(l.to));
  assert.ok(toThem.length > 5);
  for (const l of toThem) assert.ok(!l.text.includes('Tabu') && !/"card"/.test(l.text), 'frame to a device without card rights contains a card: ' + l.text.slice(0, 120));
  // after the Zug the played words are public (summary, TV list)
  T.clock.t += 61_000;
  T.host.tick();
  await settle();
  assert.equal(D.view('TV').phase, 'vorbei');
  assert.ok(!JSON.stringify(D.view('TV')).includes('Suchwort'));
  D.act('Hanna', 'zusammenfassung');
  await settle();
  assert.equal(D.view('TV').words.length, 4);
  assert.equal(D.view('Anna').words.filter((w) => w.result === 'richtig').length, 3);
});

test('role validation: only the right role may send each intent', async () => {
  const T = await startedGame();
  const D = dev(T);
  // before Bereit: the Rater, a Wächter and the TV cannot start the Zug
  for (const n of ['Anna', 'Ben', 'TV']) D.act(n, 'bereit');
  await settle();
  assert.equal(D.view('Hanna').phase, 'bereit');
  D.act('Hanna', 'bereit');
  await settle();
  const ref = () => D.view('Hanna').card.id;
  const before = D.view('Hanna').zug.guessed;
  for (const n of ['Anna', 'Ben', 'Cleo', 'TV']) {
    D.act(n, 'richtig', { ref: ref() });
    D.act(n, 'ueberspringen', { ref: ref() });
    D.act(n, 'pause');
    D.act(n, 'zusammenfassung');
    D.act(n, 'beenden');
  }
  assert.equal(T.host.intentFrom('hosthost0001', 'buzzer', { ref: ref() }), false, 'the Erklärer cannot buzz himself');
  D.act('TV', 'buzzer', { ref: ref() });
  D.act('Anna', 'buzzer', { ref: ref() });
  await settle();
  assert.equal(D.view('Hanna').phase, 'laeuft');
  assert.equal(D.view('Hanna').zug.guessed, before);
  assert.equal(D.view('Hanna').zug.skipped, 0);
  // unknown devices and forged senders do nothing
  assert.equal(T.host.intentFrom('nobody', 'richtig', { ref: ref() }), false);
  // the Erklärer works
  assert.equal(D.act('Hanna', 'richtig', { ref: ref() }), true);
  assert.equal(D.view('Hanna').zug.guessed, 1);
  // a stale ref (the card on his screen was another one) is ignored
  assert.equal(D.act('Hanna', 'richtig', { ref: 'c-stale' }), false);
  // corrections / confirm only from the Erklärer (or the Gastgeber)
  T.clock.t += 61_000;
  T.host.tick();
  await settle();
  D.act('Hanna', 'zusammenfassung');
  await settle();
  D.act('Anna', 'korrektur', { index: 0, result: 'buzzer' });
  D.act('Ben', 'bestaetigen');
  await settle();
  assert.equal(D.view('Hanna').phase, 'zusammenfassung');
  assert.equal(D.view('Hanna').words[0].result, 'richtig');
  D.act('Hanna', 'korrektur', { index: 0, result: 'uebersprungen' });
  assert.equal(D.view('Hanna').words[0].result, 'uebersprungen');
  assert.equal(D.act('Hanna', 'korrektur', { index: 0, result: 'quatsch' }), false);
  assert.equal(D.act('Hanna', 'korrektur', { index: 99, result: 'richtig' }), false);
});

test('first tap wins: duplicate richtig, two Wächter buzzing at once, competing pause-dialog taps', async () => {
  const T = await startedGame();
  const D = dev(T);
  D.act('Hanna', 'bereit');
  await settle();
  const ref = D.view('Ben').card.id;
  D.act('Hanna', 'richtig', { ref });
  D.act('Hanna', 'richtig', { ref }); // double tap on the old card
  await settle();
  assert.equal(D.view('Hanna').zug.guessed, 1);
  const ref2 = D.view('Ben').card.id;
  D.act('Ben', 'buzzer', { ref: ref2 });
  D.act('Cleo', 'buzzer', { ref: ref2 });
  await settle();
  assert.equal(T.host.S.buzz.seq, 1, 'only one buzzer counted');
  assert.equal(D.view('Anna').zug.buzz.by, 'Ben');
  assert.equal(D.view('Hanna').phase, 'pausiert');
  const seq = D.view('Anna').zug.buzz.seq;
  // the clock stands still while paused
  assert.equal(D.view('Anna').timer.endsAt, null);
  D.act('Anna', 'einspruch-weiter', { ref: seq });
  D.act('Cleo', 'buzzer-bestaetigen', { ref: seq });
  await settle();
  assert.equal(D.view('Hanna').phase, 'laeuft');
  assert.equal(D.view('Hanna').zug.buzzed, 0, 'Anna was first: Einspruch, nothing counted');
  assert.equal(D.view('Hanna').card.id, ref2, 'weiter with the same card');
  // second buzzer: Bestätigt by a Rater counts -1; the late stale tap is ignored
  D.act('Cleo', 'buzzer', { ref: ref2 });
  await settle();
  const seq2 = D.view('Anna').zug.buzz.seq;
  assert.equal(seq2, 2);
  D.act('Anna', 'buzzer-bestaetigen', { ref: seq2 });
  D.act('Ben', 'einspruch-neu', { ref: seq2 });
  D.act('Ben', 'einspruch-neu', { ref: seq }); // stale buzz number
  await settle();
  assert.equal(D.view('Hanna').zug.buzzed, 1);
  assert.equal(D.view('Hanna').zug.points, 0); // +1 richtig, -1 buzzer
  assert.notEqual(D.view('Hanna').card.id, ref2);
  // Einspruch-neu draws another card
  const ref3 = D.view('Ben').card.id;
  D.act('Ben', 'buzzer', { ref: ref3 });
  await settle();
  D.act('Ben', 'einspruch-neu', { ref: D.view('Ben').zug.buzz.seq });
  await settle();
  assert.notEqual(D.view('Hanna').card.id, ref3);
  assert.equal(D.view('Hanna').zug.buzzed, 1);
  // the TV is told about the pause but cannot answer it
  D.act('Ben', 'buzzer', { ref: D.view('Ben').card.id });
  await settle();
  assert.equal(D.view('TV').zug.pause, 'buzzer');
  D.act('TV', 'einspruch-weiter', { ref: D.view('TV').zug.buzz.seq });
  await settle();
  assert.equal(D.view('Hanna').phase, 'pausiert', 'the TV cannot answer the dialog');
});

test('without Buzzer-Pause the buzzer counts at once', async () => {
  const T = await startedGame({ settings: { buzzPause: false } });
  const D = dev(T);
  D.act('Hanna', 'bereit');
  await settle();
  D.act('Ben', 'buzzer', { ref: D.view('Ben').card.id });
  await settle();
  assert.equal(D.view('Hanna').phase, 'laeuft');
  assert.equal(D.view('Hanna').zug.buzzed, 1);
  assert.equal(D.view('Anna').zug.points, -1);
});

test('timer: the host sends an absolute end time, clients correct it with the measured clock offset', async () => {
  const clock = { t: Date.now() + 7_777 }; // the host clock runs 7.8 s ahead of the guests
  const room = createMemoryRoom();
  const H = makeHost(room, { clock, netClock: true });
  H.host.addSelf('Hanna', 0);
  await until(() => H.net.status === 'online');
  const guests = {};
  for (const [n, team] of [['Anna', 0], ['Ben', 1]]) {
    guests[n] = makeGuest(room, 'guest' + n.toLowerCase() + '000');
    await until(() => guests[n].net.status === 'online');
    guests[n].client.join({ name: n, team });
  }
  await until(() => guests.Ben.client.view && guests.Anna.client.view);
  await H.host.startGame();
  H.host.intent('bereit');
  await until(() => guests.Ben.client.view.phase === 'laeuft');
  await until(() => guests.Ben.net.offset() !== null);
  const off = guests.Ben.net.offset();
  assert.ok(Math.abs(off - 7_777) < 100, 'offset ~7777, got ' + off);
  const v = guests.Ben.client.view;
  assert.equal(v.timer.endsAt - clock.t, 60_000);
  const left = guests.Ben.client.remaining();
  assert.ok(left > 59_000 && left <= 60_100, 'remaining ' + left);
  // pausing freezes the remainder
  H.host.intent('pause');
  await until(() => guests.Ben.client.view.phase === 'pausiert');
  assert.equal(guests.Ben.client.view.timer.endsAt, null);
  assert.equal(guests.Ben.client.remaining(), guests.Ben.client.view.timer.leftMs);
});

test('turn rotation across real devices: Erklärer and Wächter rotate, the Gastgeber confirms nothing for others', async () => {
  const T = await startedGame();
  const D = dev(T);
  const seen = [];
  for (let turn = 0; turn < 4; turn++) {
    const roles = D.roles();
    const e = erklaerer(D);
    seen.push(e);
    const team = D.view(e).you.team;
    for (const n of ['Hanna', 'Anna', 'Ben', 'Cleo']) {
      if (n === e) continue;
      const sameTeam = D.view(n).you.team === team;
      assert.equal(roles[n], sameTeam ? 'rater' : 'waechter', `turn ${turn}: ${n}`);
    }
    assert.equal(roles.TV, 'anzeige');
    const words = await playZug(T, D, { hits: 2 });
    // scoreboard everywhere; only the host, the last and the next Erklärer may continue
    for (const n of ['Hanna', 'Anna', 'Ben', 'Cleo', 'TV']) assert.equal(D.view(n).phase, 'tabelle', n);
    assert.equal(D.view('TV').words.map((w) => w.w).join(), words.join(), 'TV lists the guessed words');
    const who = ['Hanna', 'Anna', 'Ben', 'Cleo', 'TV'].filter((n) => D.view(n).canWeiter);
    const next = D.view('Hanna').next.erklaerer;
    assert.ok(who.includes('Hanna') && who.includes(e) && who.includes(next), who.join());
    assert.ok(!who.includes('TV'));
    const outsider = ['Anna', 'Ben', 'Cleo'].find((n) => !who.includes(n));
    if (outsider) {
      D.act(outsider, 'weiter');
      await settle();
      assert.equal(D.view('Hanna').phase, 'tabelle', 'an outsider cannot skip the scoreboard');
    }
    D.act(next, 'weiter');
    await settle();
    assert.equal(D.view('Hanna').phase, turn === 3 ? 'bereit' : 'bereit');
  }
  assert.deepEqual(seen, ['Hanna', 'Ben', 'Anna', 'Cleo']);
  assert.deepEqual(D.view('Hanna').teams.map((t) => t.score), [4, 4]);
});

test('reconnect: a dropped device comes back with the same id and immediately gets the current view', async () => {
  const T = await startedGame();
  const D = dev(T);
  D.act('Hanna', 'bereit');
  await settle();
  const ben = T.guests.Ben;
  const id = ben.net.id;
  const seq0 = ben.client.st.seq;
  T.room.drop(id);
  await until(() => T.host.S.players[id].connected === false, 1000, 'host sees Ben offline');
  D.act('Hanna', 'richtig', { ref: D.view('Hanna').card.id }); // happens while Ben is away
  await until(() => ben.net.status === 'online' && T.host.S.players[id].connected, 1500, 'Ben back');
  await until(() => ben.client.view.zug.guessed === 1, 1500, 'resent state');
  assert.ok(ben.client.st.seq > seq0);
  assert.equal(ben.net.id, id);
  assert.equal(ben.client.view.card.id, D.view('Hanna').card.id);
  assert.equal(ben.client.connection(), 'ok');
});

test('a silent Erklärer device pauses the Zug after a grace period and resumes on request', async () => {
  const T = await startedGame();
  const D = dev(T);
  await playZug(T, D, { hits: 1 });
  D.act('Hanna', 'weiter');
  await settle(); // now Ben explains
  assert.equal(erklaerer(D), 'Ben');
  D.act('Ben', 'bereit');
  await settle();
  const ben = T.guests.Ben;
  ben.net.close(); // phone locked: socket gone for good
  await until(() => T.host.S.players[ben.net.id].connected === false);
  T.clock.t += 9_000;
  T.host.tick();
  await settle();
  assert.equal(D.view('Anna').phase, 'pausiert');
  assert.equal(D.view('Anna').zug.pause, 'app');
  assert.deepEqual(D.view('Anna').offline, ['Ben']);
  // Ben comes back with a new socket (same id) and continues
  const back = makeGuest(T.room, ben.net.id);
  back.client.join({ name: 'Ben', team: 1 });
  await until(() => back.client.view && back.client.view.phase === 'pausiert');
  assert.equal(back.client.view.card, undefined, 'paused for the app: the card stays hidden');
  back.client.act('fortsetzen');
  await until(() => back.client.view.phase === 'laeuft' && back.client.view.card);
});

test('host reload: the room resumes from the saved game, guests rejoin on their own', async () => {
  const room = createMemoryRoom();
  const clock = { t: 5_000_000 };
  let saved = null;
  const storage = { save: (s) => { saved = JSON.parse(JSON.stringify(s)); }, clear: () => { saved = null; } };
  const H = makeHost(room, { clock, storage });
  H.host.addSelf('Hanna', 0);
  await until(() => H.net.status === 'online');
  const guests = {};
  for (const [n, team] of [['Anna', 0], ['Ben', 1]]) {
    guests[n] = makeGuest(room, 'guest' + n.toLowerCase() + '000');
    await until(() => guests[n].net.status === 'online');
    guests[n].client.join({ name: n, team });
  }
  await until(() => guests.Ben.client.view && guests.Anna.client.view);
  await H.host.startGame();
  H.host.intent('bereit');
  await until(() => guests.Ben.client.view.phase === 'laeuft');
  const word = guests.Ben.client.view.card;
  H.host.intent('richtig', { ref: word.id });
  await settle();
  // the host page reloads: old session gone, state only in storage
  H.net.close();
  H.host.stop();
  await until(() => guests.Ben.client.connection() === 'waiting-host', 1500, 'guests wait for the host');
  clock.t += 3_000;
  const snap = JSON.parse(JSON.stringify(saved));
  assert.equal(snap.hostKey, 'hostkey-secret-1');
  const net2 = createNet({ transport: room.transport(), code: 'ABCDE', clientId: snap.hostId, isHost: true, opts: { handshakeMs: 40, backoffMs: [10], pingMs: 40, hostLostMs: 250, quietMs: 400, jitter: 0 }, now: () => clock.t });
  const rng = mulberry32(9);
  const host2 = createHostSession({ net: net2, code: snap.code, hostKey: snap.hostKey, hostId: snap.hostId, now: () => clock.t, rng, deckFactory: async () => { await sleep(250); return createDeck(WORDS, { rng }); }, storage });
  // like the UI: connect at once, the deck (Kartenpakete) loads slowly; devices that knock meanwhile must not end up as new lobby players
  const restored = host2.restore(snap);
  net2.connect();
  await restored;
  await until(() => guests.Ben.client.view.phase === 'pausiert' && guests.Anna.client.view.phase === 'pausiert', 2000, 'views from the new host');
  assert.ok(host2.epoch > snap.savedAt - 1);
  assert.equal(guests.Ben.client.connection(), 'ok');
  assert.equal(guests.Ben.client.view.zug.guessed, 1, 'score survived');
  assert.equal(host2.viewFor(host2.id).zug.pause, 'app');
  host2.intent('fortsetzen');
  await until(() => guests.Ben.client.view.phase === 'laeuft' && guests.Ben.client.view.card);
  assert.equal(guests.Anna.client.view.card, undefined);
  net2.close();
});

test('late joiners: refused while the game runs, but a lost session gets its seat back by name; displays may always join', async () => {
  const T = await startedGame();
  const D = dev(T);
  const stranger = makeGuest(T.room, 'guestnew0001');
  await until(() => stranger.net.status === 'online');
  const info = await stranger.client.probe();
  assert.equal(info.running, true);
  assert.deepEqual(info.rejoin, ['Anna', 'Ben', 'Cleo'], 'a running game lists the seats so a lost session can pick its own');
  stranger.client.join({ name: 'Dora', team: 0 });
  await until(() => stranger.client.st.stage === 'rejected');
  assert.equal(stranger.client.st.reason, 'running');
  // Cleo's phone dies and she opens the link on another phone
  T.guests.Cleo.net.close();
  await until(() => T.host.S.players[T.guests.Cleo.net.id].connected === false);
  const fresh = makeGuest(T.room, 'guestnew0002');
  await until(() => fresh.net.status === 'online');
  assert.deepEqual((await fresh.client.probe()).rejoin, ['Cleo', 'Anna', 'Ben'], 'offline seats first');
  fresh.client.join({ name: 'cleo', team: 0 });
  await until(() => fresh.client.view && fresh.client.view.kind === 'game');
  assert.equal(fresh.client.view.you.name, 'Cleo');
  assert.equal(fresh.client.view.role, 'waechter');
  assert.equal(T.host.S.nameToId.Cleo, 'guestnew0002');
  // a second TV
  const tv2 = makeGuest(T.room, 'guesttv000099');
  await until(() => tv2.net.status === 'online');
  tv2.client.join({ kind: 'display' });
  await until(() => tv2.client.view && tv2.client.view.role === 'anzeige');
  void D;
});

test('option "one Wächter per Zug": only the rotating Wächter gets the Karte, the other opponents just watch', async () => {
  const T = await startedGame({ options: { oneGuard: true } });
  const D = dev(T);
  D.act('Hanna', 'bereit');
  await settle();
  const roles = D.roles();
  const guards = Object.entries(roles).filter(([, r]) => r === 'waechter').map(([n]) => n);
  const watchers = Object.entries(roles).filter(([, r]) => r === 'zuschauer').map(([n]) => n);
  assert.equal(guards.length, 1);
  assert.equal(watchers.length, 1);
  assert.ok(D.view(guards[0]).card);
  assert.equal(D.view(watchers[0]).card, undefined);
  D.act(watchers[0], 'buzzer', { ref: D.view('Hanna').card.id });
  await settle();
  assert.equal(D.view('Hanna').phase, 'laeuft', 'a Zuschauer has no Buzzer');
  D.act(guards[0], 'buzzer', { ref: D.view('Hanna').card.id });
  await settle();
  assert.equal(D.view('Hanna').phase, 'pausiert');
});

test('Gastgeber safety net: he can start the Zug for an offline Erklärer', async () => {
  const T = await startedGame();
  const D = dev(T);
  await playZug(T, D, { hits: 0 });
  D.act('Hanna', 'weiter');
  await settle(); // Ben is next
  assert.equal(T.host.intent('bereit'), false, 'not while Ben is online');
  const ben = T.guests.Ben;
  ben.net.close();
  await until(() => T.host.S.players[ben.net.id].connected === false);
  assert.equal(T.host.intent('bereit'), true, 'host may start when the Erklärer is offline');
  assert.equal(T.host.S.game.phase, 'laeuft');
});

test('Gastgeber can swap an offline Erklärer for the next player of his team', async () => {
  const T = await startedGame();
  const D = dev(T);
  await playZug(T, D, { hits: 0 });
  D.act('Hanna', 'weiter');
  await settle();
  assert.equal(T.host.substitute(), false, 'nothing to substitute while the Erklärer is online');
  const ben = T.guests.Ben;
  ben.net.close();
  await until(() => T.host.S.players[ben.net.id].connected === false);
  assert.equal(T.host.substitute(), true);
  await settle();
  assert.equal(D.view('Cleo').role, 'erklaerer');
  assert.equal(T.host.viewFor(ben.net.id).role, 'rater');
  D.act('Cleo', 'bereit');
  await settle();
  assert.equal(D.view('Cleo').phase, 'laeuft');
});

test('legacy relay (old worker): the whole flow works with client-side filtering', async () => {
  const T = await startedGame({ legacy: true });
  const D = dev(T);
  assert.equal(T.guests.Anna.net.routing, false);
  assert.deepEqual(D.roles(), { Hanna: 'erklaerer', Anna: 'rater', Ben: 'waechter', Cleo: 'waechter', TV: 'anzeige' });
  D.act('Hanna', 'bereit');
  await settle();
  const ref = D.view('Ben').card.id;
  D.act('Ben', 'buzzer', { ref });
  await settle();
  D.act('Anna', 'einspruch-weiter', { ref: D.view('Anna').zug.buzz.seq });
  await settle();
  D.act('Hanna', 'richtig', { ref });
  await settle();
  assert.equal(D.view('Anna').zug.guessed, 1);
  assert.equal(D.view('Anna').card, undefined);
  assert.ok(!JSON.stringify(D.view('TV')).includes('Suchwort'));
});

test('Gastgeber can end the game early and return to the lobby; rematch keeps the teams', async () => {
  const T = await startedGame();
  const D = dev(T);
  await playZug(T, D, { hits: 1 });
  D.act('Anna', 'beenden');
  await settle();
  assert.equal(D.view('Hanna').phase, 'tabelle', 'a guest cannot end the game');
  assert.equal(D.act('Hanna', 'beenden'), true);
  await settle();
  assert.equal(D.view('TV').phase, 'ende');
  assert.deepEqual(D.view('TV').winners, [0]);
  await T.host.rematch();
  await settle();
  assert.equal(D.view('Ben').phase, 'bereit');
  assert.deepEqual(D.view('Ben').teams.map((t) => t.score), [0, 0]);
  T.host.backToLobby();
  await until(() => T.guests.Ben.client.view.kind === 'lobby');
});
