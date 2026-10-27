// Psst! multiplayer: Jeder gegen jeden (views, secrecy, intents with role checks) and the lobby team-size rules.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { startedFfa, makeHost, makeGuest, closeAll, createMemoryRoom, until, sleep } from './helpers/mp-harness.mjs';

after(closeAll);
const settle = () => sleep(25);

function dev(T, all) {
  const host = all[0];
  const view = (n) => (n === host ? T.host.viewFor(T.host.id) : T.guests[n].client.view);
  const act = (n, t, extra = {}) => (n === host ? T.host.intent(t, extra) : T.guests[n].client.act(t, extra));
  const roles = () => Object.fromEntries(all.map((n) => [n, view(n).role]));
  const idOf = (n) => (n === host ? T.host.id : T.guests[n].net.id);
  return { view, act, roles, idOf };
}

test('3 devices, Jeder gegen jeden: Erklärer + Wächter see the Karte, the Rater and the Anzeige never do (views and wire frames)', async () => {
  const T = await startedFfa();
  const D = dev(T, ['Hanna', 'Anna', 'Ben', 'TV']);
  assert.deepEqual(D.roles(), { Hanna: 'erklaerer', Anna: 'waechter', Ben: 'rater', TV: 'anzeige' });
  const v0 = D.view('Ben');
  assert.equal(v0.form, 'ffa');
  assert.deepEqual([v0.turn.erklaerer, v0.turn.waechter, v0.turn.raters], ['Hanna', 'Anna', ['Ben']]);
  const mark = T.room.log.length;
  assert.equal(D.act('Hanna', 'bereit'), true);
  await settle();
  const c = D.view('Hanna').card;
  assert.equal(D.view('Anna').card.w, c.w, 'the Wächter sees the Karte');
  for (const n of ['Ben', 'TV']) {
    assert.equal(D.view(n).card, undefined);
    assert.ok(!JSON.stringify(D.view(n)).includes(c.w) && !JSON.stringify(D.view(n)).includes('Tabu'), n + ' view leaks the Karte');
  }
  // one Rater: Richtig needs no extra tap; the Rater gets the point
  assert.equal(D.act('Hanna', 'richtig', { ref: c.id }), true);
  await settle();
  const c2 = D.view('Hanna').card;
  D.act('Hanna', 'richtig', { ref: c2.id });
  await settle();
  D.act('Anna', 'buzzer', { ref: D.view('Anna').card.id });
  await settle();
  assert.equal(D.view('Ben').zug.pause, 'buzzer');
  assert.equal(D.view('Ben').card, undefined, 'the buzzer dialog of a Rater shows no Karte');
  D.act('Hanna', 'einspruch-neu', { ref: D.view('Hanna').zug.buzz.seq });
  await settle();
  const ids = [D.idOf('Ben'), D.idOf('TV')];
  const toThem = T.room.log.slice(mark).filter((l) => ids.includes(l.to));
  assert.ok(toThem.length > 4);
  for (const l of toThem) assert.ok(!l.text.includes('Tabu') && !/"card"/.test(l.text) && !l.text.includes('Suchwort'), 'frame to a device without Karte rights: ' + l.text.slice(0, 120));
  assert.equal(D.view('Ben').zug.guessed, 2);
  // after the Zug the guessers are public
  T.clock.t += 61_000;
  T.host.tick();
  await settle();
  D.act('Hanna', 'zusammenfassung');
  await settle();
  assert.deepEqual(D.view('TV').words.map((w) => w.guesser), ['Ben', 'Ben']);
  D.act('Hanna', 'bestaetigen');
  await settle();
  const tv = D.view('TV');
  assert.deepEqual(tv.teams.map((t) => [t.name, t.score]), [['Hanna', 2], ['Anna', 0], ['Ben', 2]], 'per player scoreboard on the Anzeige');
  assert.deepEqual(tv.last.deltas, { 0: 2, 2: 2 });
  // next Zug: Anna explains, Ben watches, Hanna guesses
  D.act('Hanna', 'weiter');
  await settle();
  assert.deepEqual(D.roles(), { Hanna: 'rater', Anna: 'erklaerer', Ben: 'waechter', TV: 'anzeige' });
});

test('4 devices: the Rater picker is an Erklärer-only intent with ref and a valid Rater name', async () => {
  const T = await startedFfa({ names: ['Anna', 'Ben', 'Cleo'] });
  const D = dev(T, ['Hanna', 'Anna', 'Ben', 'Cleo', 'TV']);
  assert.deepEqual(D.roles(), { Hanna: 'erklaerer', Anna: 'waechter', Ben: 'rater', Cleo: 'rater', TV: 'anzeige' });
  assert.deepEqual(D.view('Hanna').turn.raters, ['Ben', 'Cleo']);
  D.act('Hanna', 'bereit');
  await settle();
  const ref = () => D.view('Hanna').card.id;
  const guessed = () => D.view('Hanna').zug.guessed;
  assert.deepEqual(D.view('Hanna').zug.raters, ['Ben', 'Cleo']);
  // everybody but the Erklärer is refused, with and without a name
  for (const n of ['Anna', 'Ben', 'Cleo', 'TV']) {
    assert.equal(T.host.intentFrom(D.idOf(n), 'richtig', { ref: ref(), guesser: 'Ben' }), false, n + ' may not pick a Rater');
    assert.equal(T.host.intentFrom(D.idOf(n), 'richtig', { ref: ref() }), false);
    D.act(n, 'richtig', { ref: ref(), guesser: 'Ben' }); // and over the wire
  }
  await settle();
  assert.equal(guessed(), 0, 'no non-Erklärer got a point through');
  // the Erklärer: needs a name when there are several Rater; the Wächter / himself / strangers are no Rater; stale ref ignored
  assert.equal(D.act('Hanna', 'richtig', { ref: ref() }), false, 'several Rater: a name is required');
  assert.equal(D.act('Hanna', 'richtig', { ref: ref(), guesser: 'Anna' }), false, 'the Wächter did not guess');
  assert.equal(D.act('Hanna', 'richtig', { ref: ref(), guesser: 'Hanna' }), false);
  assert.equal(D.act('Hanna', 'richtig', { ref: ref(), guesser: 'Nobody' }), false);
  assert.equal(D.act('Hanna', 'richtig', { ref: 'c-stale', guesser: 'Ben' }), false);
  assert.equal(guessed(), 0);
  assert.equal(D.act('Hanna', 'richtig', { ref: ref(), guesser: 'Cleo' }), true);
  const stale = D.view('Hanna').card.id;
  await settle();
  assert.equal(D.act('Hanna', 'richtig', { ref: ref(), guesser: 'Ben' }), true);
  await settle();
  assert.equal(guessed(), 2);
  // the Anzeige and the other Rater do not see the card but learn the count only
  assert.equal(D.view('Cleo').card, undefined);
  assert.notEqual(stale, D.view('Hanna').card.id);
  // summary: only the Erklärer changes who guessed; invalid names are refused; a card turned into richtig needs a name
  D.act('Hanna', 'ueberspringen', { ref: ref() });
  await settle();
  T.clock.t += 61_000;
  T.host.tick();
  await settle();
  D.act('Hanna', 'zusammenfassung');
  await settle();
  const words = () => D.view('Hanna').words;
  assert.deepEqual(words().map((w) => w.guesser), ['Cleo', 'Ben', null]);
  D.act('Ben', 'korrektur', { index: 0, result: 'richtig', guesser: 'Ben' });
  D.act('Anna', 'korrektur', { index: 0, result: 'richtig', guesser: 'Ben' });
  D.act('TV', 'korrektur', { index: 0, result: 'richtig', guesser: 'Ben' });
  await settle();
  assert.equal(words()[0].guesser, 'Cleo', 'others cannot change it');
  assert.equal(D.act('Hanna', 'korrektur', { index: 0, result: 'richtig', guesser: 'Anna' }), false);
  assert.equal(D.act('Hanna', 'korrektur', { index: 0, result: 'richtig', guesser: 'Ben' }), true);
  await settle();
  assert.equal(words()[0].guesser, 'Ben');
  assert.equal(D.view('TV').words[0].guesser, 'Ben', 'public after the Zug');
  D.act('Hanna', 'korrektur', { index: 2, result: 'richtig' });
  await settle();
  assert.equal(D.view('Hanna').zug.missing, 1);
  assert.equal(D.act('Hanna', 'bestaetigen'), false, 'cannot confirm while a guesser is missing');
  assert.equal(D.view('Hanna').phase, 'zusammenfassung');
  D.act('Hanna', 'korrektur', { index: 2, result: 'richtig', guesser: 'Cleo' });
  await settle();
  assert.equal(D.act('Hanna', 'bestaetigen'), true);
  await settle();
  assert.deepEqual(D.view('Cleo').teams.map((t) => t.score), [3, 0, 2, 1], 'Hanna 3, Anna 0, Ben 2, Cleo 1');
});

test('Zug fairness across devices: Erklärer and Wächter rotate over the Runde, the Gastgeber confirms nothing for others', async () => {
  const T = await startedFfa({ names: ['Anna', 'Ben', 'Cleo'] });
  const D = dev(T, ['Hanna', 'Anna', 'Ben', 'Cleo', 'TV']);
  const seen = [];
  for (let turn = 0; turn < 4; turn++) {
    const r = D.roles();
    const e = Object.keys(r).find((n) => r[n] === 'erklaerer');
    const w = Object.keys(r).find((n) => r[n] === 'waechter');
    seen.push([e, w]);
    D.act(e, 'bereit');
    await settle();
    D.act(e, 'richtig', { ref: D.view(e).card.id, guesser: Object.keys(r).find((n) => r[n] === 'rater') });
    await settle();
    T.clock.t += 61_000;
    T.host.tick();
    await settle();
    D.act(e, 'zusammenfassung');
    await settle();
    D.act(e, 'bestaetigen');
    await settle();
    D.act(e, 'weiter');
    await settle();
  }
  assert.deepEqual(seen.map((s) => s[0]), ['Hanna', 'Anna', 'Ben', 'Cleo']);
  assert.deepEqual(seen.map((s) => s[1]), ['Anna', 'Ben', 'Cleo', 'Hanna']);
});

test('lobby: Spielform Jeder gegen jeden needs 3 players and ignores teams; switching is reflected on the devices', async () => {
  const room = createMemoryRoom();
  const H = makeHost(room);
  H.host.addSelf('Hanna', 0);
  await until(() => H.net.status === 'online');
  const g = makeGuest(room, 'guestanna000');
  await until(() => g.net.status === 'online');
  g.client.join({ name: 'Anna', team: 1 });
  await until(() => g.client.view);
  assert.equal(g.client.view.settings.form, 'teams');
  H.host.lobby.setSettings({ form: 'ffa' });
  await until(() => g.client.view.settings.form === 'ffa');
  assert.deepEqual(g.client.view.players.map((p) => p.name), ['Hanna', 'Anna']);
  let c = H.host.check();
  assert.equal(c.ok, false);
  assert.match(c.errors[0], /mindestens 3 Spieler \(noch 1\)/);
  const info = await g.client.probe();
  assert.equal(info.form, 'ffa');
  const g2 = makeGuest(room, 'guestben00000');
  await until(() => g2.net.status === 'online');
  g2.client.join({ name: 'Ben' }); // no team needed
  await until(() => g2.client.view);
  c = H.host.check();
  assert.equal(c.ok, true);
  assert.deepEqual(c.warnings, []);
  assert.equal(c.suggestFfa, false);
  // back to Teams: the three cannot play teams, Jeder gegen jeden is suggested
  H.host.lobby.setSettings({ form: 'teams' });
  c = H.host.check();
  assert.equal(c.ok, false);
  assert.equal(c.suggestFfa, true);
  // start as Jeder gegen jeden: lobby teams stay as they were
  H.host.lobby.setSettings({ form: 'ffa' });
  await H.host.startGame();
  assert.equal(H.host.S.game.ffa, true);
  assert.equal(H.host.S.teams.length, 2);
  assert.equal(H.host.S.game.teams.length, 3);
  await until(() => g2.client.view.kind === 'game');
  assert.equal(g2.client.view.role, 'rater');
});

test('lobby: in Teams every team needs 2 players; the message names the team, 3 players suggest Jeder gegen jeden', async () => {
  const room = createMemoryRoom();
  const H = makeHost(room);
  const names = ['Anna', 'Ben', 'Cleo', 'Dora'];
  H.host.addSelf('Hanna', 0);
  await until(() => H.net.status === 'online');
  const gs = {};
  for (const [i, n] of names.entries()) {
    gs[n] = makeGuest(room, 'guest' + n.toLowerCase().padEnd(6, '0'));
    await until(() => gs[n].net.status === 'online');
    gs[n].client.join({ name: n, team: i < 1 ? 0 : 1 }); // Rot: Hanna, Anna; Blau: Ben, Cleo, Dora
    await until(() => gs[n].client.view);
  }
  const id = (n) => 'guest' + n.toLowerCase().padEnd(6, '0');
  let c = H.host.check();
  assert.equal(c.ok, true, 'Rot 2, Blau 3');
  // the lobby is three players: Rot Hanna, Blau Ben / Cleo -> Rot needs one more
  H.host.lobby.kick(id('Dora'));
  H.host.lobby.setTeam(id('Anna'), null);
  H.host.lobby.setTeam(id('Ben'), 1);
  H.host.lobby.kick(id('Anna'));
  c = H.host.check();
  assert.equal(c.ok, false);
  assert.deepEqual(c.errors, ['Rot braucht noch 1 Spieler.']);
  assert.equal(c.suggestFfa, true);
  // one team of two plus an empty team: the empty team would be dropped, but one team alone is no game
  H.host.lobby.setTeam(id('Ben'), 0);
  H.host.lobby.setTeam(id('Cleo'), 0);
  c = H.host.check();
  assert.equal(c.ok, false);
  assert.deepEqual(c.errors, ['Blau braucht noch 2 Spieler.']);
  assert.equal(c.suggestFfa, true);
  // players without a team are spread over the smallest teams before the rule is applied
  H.host.lobby.setTeam(id('Ben'), null);
  H.host.lobby.setTeam(id('Cleo'), null);
  H.host.lobby.setTeam('hosthost0001', null);
  c = H.host.check();
  assert.equal(c.ok, false, 'three loose players -> 2 + 1');
  assert.equal(c.suggestFfa, true);
  // a fourth player makes it 2 + 2
  const d = makeGuest(room, id('Dora'));
  await until(() => d.net.status === 'online');
  d.client.join({ name: 'Dora', team: null });
  await until(() => d.client.view);
  c = H.host.check();
  assert.equal(c.ok, true);
  assert.ok(c.warnings.some((w) => w.includes('ohne Team')));
  // only two players, or one: no suggestion
  H.host.lobby.kick(id('Dora'));
  H.host.lobby.kick(id('Cleo'));
  c = H.host.check();
  assert.equal(c.ok, false);
  assert.equal(c.suggestFfa, false, 'two players cannot play Jeder gegen jeden either');
  H.host.lobby.setSettings({ form: 'ffa' });
  assert.match(H.host.check().errors[0], /noch 1/);
  // no Kartenpaket: error in both forms
  H.host.lobby.setPacks([]);
  assert.ok(H.host.check().errors.some((e) => e.includes('Kartenpaket')));
});

test('a team that shrinks below 2 connected players during the game: warning for the Gastgeber, the blocked Zug can be skipped', async () => {
  const { startedGame } = await import('./helpers/mp-harness.mjs');
  const T = await startedGame({ tv: false }); // Rot: Hanna, Anna; Blau: Ben, Cleo
  const hostView = () => T.host.viewFor(T.host.id);
  assert.equal(hostView().warn, null, 'everybody is online');
  T.guests.Cleo.net.close(); // phone locked for good
  await until(() => T.host.S.players[T.guests.Cleo.net.id].connected === false);
  let w = hostView().warn;
  assert.equal(w.kind, 'team');
  assert.deepEqual(w.names, ['Blau (1)']);
  assert.equal(w.blocked, false, 'Rot (2 online) can play its Zug');
  // Rot plays
  T.host.intent('bereit');
  await settle();
  T.clock.t += 61_000;
  T.host.tick();
  await settle();
  T.host.intent('zusammenfassung');
  T.host.intent('bestaetigen');
  T.host.intent('weiter');
  await settle();
  w = hostView().warn;
  assert.equal(w.blocked, true, 'now Blau (Ben alone) is due');
  // nobody but the Gastgeber may skip
  assert.equal(T.host.intentFrom(T.guests.Ben.net.id, 'zug-aussetzen'), false);
  assert.equal(T.host.intentFrom(T.guests.Anna.net.id, 'zug-aussetzen'), false);
  assert.equal(T.host.intent('zug-aussetzen'), true);
  await settle();
  const v = hostView();
  assert.equal(v.phase, 'tabelle');
  assert.equal(v.last.aussetzer, true);
  assert.deepEqual(v.teams.map((t) => t.score), [0, 0]);
  assert.equal(T.host.intent('zug-aussetzen'), false, 'only before a Zug');
  T.host.intent('weiter');
  await settle();
  assert.equal(hostView().turn.team, 0, 'Rot is next');
});

test('substitute in Jeder gegen jeden: the next connected player (not the Wächter) takes over an absent Erklärer', async () => {
  const T = await startedFfa({ names: ['Anna', 'Ben', 'Cleo'], tv: false });
  // finish Hanna's Zug so that Anna is due; then Anna's phone dies
  T.host.intent('bereit');
  await settle();
  T.clock.t += 61_000;
  T.host.tick();
  T.host.intent('zusammenfassung');
  T.host.intent('bestaetigen');
  T.host.intent('weiter');
  await settle();
  assert.equal(T.host.viewFor(T.host.id).turn.erklaerer, 'Anna');
  assert.equal(T.host.substitute(), false, 'Anna is online');
  T.guests.Anna.net.close();
  await until(() => T.host.S.players[T.guests.Anna.net.id].connected === false);
  assert.equal(T.host.substitute(), true);
  const t = T.host.viewFor(T.host.id).turn;
  assert.equal(t.erklaerer, 'Cleo', 'Ben is the Wächter of this slot, so Cleo takes over');
  assert.equal(t.waechter, 'Ben');
  // the swapped order survives a snapshot
  const snap = JSON.parse(JSON.stringify(T.host.snapshot()));
  assert.deepEqual(snap.game.order, [0, 3, 2, 1]);
});
