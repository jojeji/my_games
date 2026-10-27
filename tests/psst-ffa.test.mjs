// Psst! Jeder gegen jeden (Spielform "ffa"): rotation, scoring, Punkteziel / Verlängerung, corrections, save/restore.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, restoreGame, createDeck, mulberry32, scoreZug, zugDeltas, DEFAULT_SETTINGS } from '../games/psst/logic.js';

const cards = (n) => Array.from({ length: n }, (_, i) => ({ id: `k${i}`, w: `Wort ${i}`, t: ['a', 'b', 'c', 'd', 'e'], d: 1 }));

function setup({ names = ['Anna', 'Ben', 'Cleo'], settings = {}, seed = 1 } = {}) {
  const clock = { t: 1000 };
  const rng = mulberry32(seed);
  const deck = createDeck(cards(300), { rng });
  const game = createGame({
    teams: names.map((n) => ({ name: n, color: '#000', players: [n] })),
    settings: { form: 'ffa', turnSecs: 60, ...settings },
    deck,
    rng,
    now: () => clock.t,
  });
  return { game, clock, deck };
}

/** One complete Zug. items: 'r' (guessed by the first Rater / the only one), {r: unit}, 's', 'b'. Confirms and (optionally) moves on. */
function zug(game, items = [], { next = true } = {}) {
  game.bereit();
  const raters = game.zug.raters;
  for (const it of items) {
    if (it === 'r') game.richtig(raters[0]);
    else if (it && typeof it === 'object') game.richtig(it.r);
    else if (it === 's') game.ueberspringen();
    else if (it === 'b') {
      game.buzzer();
      if (game.state.zug.pause === 'buzzer') game.buzzerBestaetigt();
    }
  }
  game.state.zug.timeLeftMs = 0;
  game.state.zug.runSince = null;
  game.state.phase = 'laeuft';
  assert.ok(game.tick());
  game.zusammenfassung();
  game.bestaetigen();
  if (next) game.weiter();
}

const names = (game, units) => units.map((u) => game.teams[u].players[0]);

for (const n of [3, 4, 5, 6]) {
  test(`Rotation with ${n} players: everybody explains once per Runde, the Wächter is never the Erklärer, duty is spread fairly`, () => {
    const list = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, n);
    const { game } = setup({ names: list, settings: { mode: 'frei' } });
    const rounds = n - 1; // after n-1 Runden every (Erklärer, Wächter) pair has occurred
    const pairs = new Set();
    for (let r = 0; r < rounds; r++) {
      const explained = [];
      const guarded = [];
      for (let k = 0; k < n; k++) {
        const t = game.turnInfo();
        assert.equal(t.round, r + 1);
        assert.notEqual(t.team, t.guardTeam, 'Wächter is never the Erklärer');
        assert.equal(t.raters.length, n - 2);
        assert.ok(!t.raters.includes(t.team) && !t.raters.includes(t.guardTeam));
        assert.deepEqual([t.team, t.guardTeam, ...t.raters].sort(), list.map((_, i) => i), 'Erklärer + Wächter + Rater = everybody');
        assert.equal(t.erklaerer, list[t.team]);
        assert.equal(t.waechter, list[t.guardTeam]);
        assert.deepEqual(t.raterNames, names(game, t.raters));
        explained.push(t.team);
        guarded.push(t.guardTeam);
        pairs.add(t.team + '>' + t.guardTeam);
        zug(game, ['r']);
      }
      assert.deepEqual([...explained].sort(), list.map((_, i) => i), `Runde ${r + 1}: everybody explains exactly once`);
      assert.deepEqual([...guarded].sort(), list.map((_, i) => i), `Runde ${r + 1}: everybody is Wächter exactly once`);
    }
    assert.equal(pairs.size, n * (n - 1), 'all Erklärer/Wächter pairs came up once over n-1 Runden');
    // from Runde n on the cycle repeats
    assert.equal(game.turnInfo().round, n);
    assert.equal(game.turnInfo().guardTeam, 1);
  });
}

test('3 players: the Wächter is the one non-explainer, the other one is the single Rater (they swap every Runde)', () => {
  const { game } = setup();
  const a = game.turnInfo();
  assert.deepEqual([a.erklaerer, a.waechter, a.raterNames], ['Anna', 'Ben', ['Cleo']]);
  zug(game, []);
  zug(game, []);
  zug(game, []);
  const b = game.turnInfo(); // Runde 2, Anna again
  assert.deepEqual([b.erklaerer, b.waechter, b.raterNames], ['Anna', 'Cleo', ['Ben']]);
});

test('createGame: Jeder gegen jeden needs 3 to 20 players with distinct names; the default is Teams', () => {
  const deck = createDeck(cards(5));
  const mk = (n, extra = {}) => ({ teams: Array.from({ length: n }, (_, i) => ({ name: 'P' + i, color: '#000' })), settings: { form: 'ffa' }, deck, ...extra });
  assert.throws(() => createGame(mk(2)), /mindestens 3/);
  assert.throws(() => createGame(mk(21)), /höchstens 20/);
  assert.throws(() => createGame({ ...mk(3), teams: [{ name: 'Anna' }, { name: 'anna' }, { name: 'Ben' }] }), /verschieden/);
  assert.throws(() => createGame({ ...mk(3), teams: [{ name: 'Anna' }, { name: ' ' }, { name: 'Ben' }] }), /Namen/);
  assert.equal(createGame(mk(3)).ffa, true);
  assert.equal(DEFAULT_SETTINGS.form, 'teams');
  const t = createGame({ teams: [{ name: 'A', color: '#000' }, { name: 'B', color: '#000' }], deck });
  assert.equal(t.ffa, false);
  assert.equal(t.state.order, undefined);
});

test('Scoring: the Erklärer and the Rater who guessed it get +1 each; with one Rater the pick is automatic', () => {
  const { game } = setup({ names: ['Anna', 'Ben', 'Cleo', 'Dora'] });
  game.bereit();
  assert.deepEqual(names(game, game.zug.raters), ['Cleo', 'Dora']);
  assert.throws(() => game.richtig(), /Wer hat/, 'several Rater: the Erklärer has to name one');
  assert.throws(() => game.richtig(1), /kein Rater/, 'the Wächter did not guess');
  assert.throws(() => game.richtig(0), /kein Rater/, 'the Erklärer cannot guess his own card');
  game.richtig(2); // Cleo
  game.richtig(3); // Dora
  game.richtig(2); // Cleo again
  assert.equal(game.zug.cards.length, 3);
  assert.deepEqual(game.zugScore().byGuesser, { 2: 2, 3: 1 });
  game.state.zug.timeLeftMs = 0;
  game.tick();
  game.zusammenfassung();
  game.bestaetigen();
  assert.deepEqual(game.scores, [3, 0, 2, 1]);
  const st = game.standings().find((r) => r.name === 'Cleo');
  assert.deepEqual([st.score, st.solved, st.guessed], [2, 2, 0]);
  assert.deepEqual(zugDeltas(game.state.log[0]), { 0: 3, 2: 2, 3: 1 });
  game.weiter();
  // 3 players: exactly one Rater, no tap needed
  const t = setup();
  t.game.bereit();
  t.game.richtig();
  t.game.richtig();
  assert.deepEqual(t.game.zug.cards.map((e) => e.guesser), [2, 2]);
  assert.equal(t.game.zugScore().missing, 0);
});

test('Penalties (Buzzer, Überspringen) hit the Erklärer only, never a Rater', () => {
  const { game } = setup({ names: ['Anna', 'Ben', 'Cleo', 'Dora'], settings: { skipFree: 0, skipPenalty: 1, buzzPenalty: 1 } });
  game.bereit();
  game.richtig(2);
  game.richtig(3);
  game.ueberspringen(); // -1 (no free skips)
  game.buzzer();
  game.buzzerBestaetigt(); // -1
  assert.equal(game.zugScore().points, 0);
  game.state.zug.timeLeftMs = 0;
  game.tick();
  game.zusammenfassung();
  game.bestaetigen();
  assert.deepEqual(game.scores, [0, 0, 1, 1], 'Erklärer 2-1-1 = 0; the Raters keep their +1');
  assert.deepEqual(game.state.stats[0], { guessed: 2, skipped: 1, buzzed: 1, solved: 0 });
});

test('Überspringer-Kontingent pro Spiel is a per player budget', () => {
  const { game } = setup({ settings: { skipMode: 'game', skipFree: 2, skipPenalty: 1, mode: 'frei' } });
  assert.deepEqual([0, 1, 2].map((u) => game.teamSkipQuota(u)), [2, 2, 2]);
  zug(game, ['s', 's', 'r']); // Anna uses both free skips
  assert.deepEqual([0, 1, 2].map((u) => game.teamSkipQuota(u)), [0, 2, 2]);
  zug(game, ['s', 'r']); // Ben has his own two
  assert.deepEqual([0, 1, 2].map((u) => game.teamSkipQuota(u)), [0, 1, 2]);
  zug(game, []);
  game.bereit(); // Anna again: no free skips left, the next skip costs a point
  assert.deepEqual([game.skipInfo().free, game.skipInfo().penalty], [0, 1]);
  const pen = setup({ settings: { skipMode: 'turn', skipFree: 1, skipPenalty: 0 } }).game;
  pen.bereit();
  assert.equal(pen.skipInfo().free, 1);
});

test('Punkteziel: when a player reaches it the Runde is finished, then the leader wins', () => {
  const { game } = setup({ names: ['Anna', 'Ben', 'Cleo', 'Dora'], settings: { mode: 'punkte', target: 3 } });
  zug(game, ['r', 'r', 'r']); // Anna 3 (and Cleo 3): target reached in the first Zug
  assert.equal(game.over, false);
  assert.equal(game.lastRound, true);
  zug(game, ['r']); // Ben
  zug(game, ['r']); // Cleo
  assert.equal(game.over, false);
  zug(game, ['r'], { next: false }); // Dora: Runde complete
  assert.equal(game.over, true);
  assert.equal(game.state.log.length, 4, 'every player explained equally often');
  assert.equal(Math.max(...game.scores), game.scores[game.winners[0]]);
  assert.ok(game.winners.length >= 1);
  game.weiter();
  assert.equal(game.phase, 'ende');
});

test('Tie at the top: Verlängerung (one more Runde for everybody), repeated until somebody leads', () => {
  const { game } = setup({ settings: { mode: 'runden', rounds: 1 } });
  zug(game, ['r']);
  zug(game, ['r']);
  zug(game, ['r'], { next: false });
  assert.deepEqual(game.scores, [2, 2, 2], 'every Zug scored Erklärer +1 and the only Rater +1');
  assert.equal(game.over, false);
  assert.equal(game.state.verlaengerung, true);
  game.weiter();
  assert.equal(game.turnInfo().verlaengerung, true);
  zug(game, ['r', 'r']); // Anna 4, Ben (the Rater of this Runde) 4
  zug(game, []);
  zug(game, [], { next: false });
  assert.deepEqual(game.scores, [4, 4, 2]);
  assert.equal(game.over, false, 'Anna and Ben are tied at the top: another Verlängerung');
  assert.equal(game.state.extra, 2);
  game.weiter();
  zug(game, ['r']); // Anna 5, Cleo 3
  zug(game, []);
  zug(game, [], { next: false });
  assert.equal(game.over, true);
  assert.deepEqual(names(game, game.winners), ['Anna']);
});

test('Rundenlimit and Freies Spiel work like in Teams', () => {
  const { game } = setup({ names: ['Anna', 'Ben', 'Cleo', 'Dora'], settings: { mode: 'runden', rounds: 2 } });
  for (let i = 0; i < 7; i++) zug(game, i === 0 ? [{ r: 2 }, { r: 3 }] : []);
  assert.equal(game.over, false, '2 Runden of 4 Züge');
  zug(game, [], { next: false });
  assert.equal(game.over, true);
  assert.deepEqual(names(game, game.winners), ['Anna']);
  const f = setup({ settings: { mode: 'frei' } }).game;
  for (let i = 0; i < 7; i++) zug(f, ['r']);
  assert.equal(f.over, false);
  f.beenden();
  assert.equal(f.phase, 'ende');
});

test('Corrections in the summary: result, and who guessed a card', () => {
  const { game } = setup({ names: ['Anna', 'Ben', 'Cleo', 'Dora'], settings: { skipFree: 1 } });
  game.bereit();
  game.richtig(2);
  game.ueberspringen();
  game.state.zug.timeLeftMs = 0;
  game.tick();
  game.zusammenfassung();
  game.korrigiere(0, 'richtig', 3); // actually Dora guessed it
  assert.equal(game.zug.cards[0].guesser, 3);
  assert.deepEqual(game.summaryScore().byGuesser, { 3: 1 });
  assert.throws(() => game.korrigiere(0, 'richtig', 1), /kein Rater/);
  game.korrigiere(1, 'richtig'); // the skip was a hit, but nobody is named yet (two Raters)
  assert.equal(game.summaryScore().missing, 1);
  assert.throws(() => game.bestaetigen(), /fehlt/);
  assert.equal(game.phase, 'zusammenfassung');
  game.korrigiere(1, 'richtig', 2);
  assert.equal(game.summaryScore().missing, 0);
  game.korrigiere(0, 'buzzer'); // not a hit any more: Dora's point is gone
  assert.deepEqual(game.summaryScore().byGuesser, { 2: 1 });
  game.korrigiere(0, 'richtig'); // back to richtig: the remembered guesser (Dora) is used again
  assert.deepEqual(game.summaryScore().byGuesser, { 2: 1, 3: 1 });
  game.bestaetigen();
  assert.deepEqual(game.scores, [2 - 0, 0, 1, 1]);
  assert.throws(() => game.korrigiere(0, 'richtig', 2), /Phase/);
  // with exactly one Rater a corrected card gets him automatically
  const t = setup();
  t.game.bereit();
  t.game.ueberspringen();
  t.game.state.zug.timeLeftMs = 0;
  t.game.tick();
  t.game.zusammenfassung();
  t.game.korrigiere(0, 'richtig');
  assert.equal(t.game.zug.cards[0].guesser, 2);
  t.game.bestaetigen();
  assert.deepEqual(t.game.scores, [1, 0, 1]);
});

test('scoreZug stays pure and ignores guessers outside Jeder gegen jeden', () => {
  const e = [{ result: 'richtig', guesser: 2 }, { result: 'richtig' }];
  assert.deepEqual(scoreZug(e, DEFAULT_SETTINGS, 0).byGuesser, {});
  assert.equal(scoreZug(e, DEFAULT_SETTINGS, 0).missing, 0);
  const f = scoreZug(e, { ...DEFAULT_SETTINGS, form: 'ffa' }, 0);
  assert.deepEqual([f.byGuesser, f.missing, f.points], [{ 2: 1 }, 1, 2]);
});

test('Save/restore: a running Zug comes back paused with Rater and order; between Züge too', () => {
  const { game, deck, clock } = setup({ names: ['Anna', 'Ben', 'Cleo', 'Dora'], settings: { skipMode: 'game', skipFree: 2 } });
  zug(game, ['r']);
  game.bereit(); // Ben
  game.richtig(3);
  game.ueberspringen();
  clock.t += 10_000;
  const json = JSON.parse(JSON.stringify(game.toJSON()));
  const g2 = restoreGame(json, { deck, now: () => clock.t });
  assert.equal(g2.ffa, true);
  assert.equal(g2.phase, 'pausiert');
  assert.equal(g2.zug.erklaerer, 'Ben');
  assert.deepEqual([g2.zug.guardTeam, g2.zug.raters], [2, [0, 3]], 'Ben explains, Cleo watches, Anna and Dora guess');
  assert.deepEqual(g2.zug.cards.map((e) => e.guesser), [3, undefined]);
  g2.fortsetzen();
  g2.richtig(g2.zug.raters[0]);
  g2.state.zug.timeLeftMs = 0;
  g2.tick();
  g2.zusammenfassung();
  g2.bestaetigen();
  g2.weiter();
  const g3 = restoreGame(JSON.parse(JSON.stringify(g2.toJSON())), { deck });
  assert.equal(g3.phase, 'bereit');
  assert.equal(g3.turnInfo().erklaerer, 'Cleo');
  assert.deepEqual(g3.teamSkipQuota(1), 1, 'Ben used one of his two free skips');
  assert.deepEqual(g3.state.order, [0, 1, 2, 3]);
});

test('Old saves without the Spielform field are Teams', () => {
  const deck = createDeck(cards(50), { rng: mulberry32(2) });
  const g = createGame({ teams: [{ name: 'T1', color: '#000', players: ['a', 'b'] }, { name: 'T2', color: '#111', players: ['c', 'd'] }], deck });
  const json = JSON.parse(JSON.stringify(g.toJSON()));
  delete json.settings.form;
  const old = restoreGame(json, { deck });
  assert.equal(old.ffa, false);
  assert.equal(old.turnInfo().guardTeam, 1);
  old.bereit();
  old.richtig(); // no guesser needed in Teams
  assert.equal(old.zug.cards[0].guesser, undefined);
  assert.equal(old.zug.raters, undefined);
});

test('An absent Erklärer: the next player can take over, the Wächter cannot', () => {
  const { game } = setup({ names: ['Anna', 'Ben', 'Cleo', 'Dora'] });
  assert.throws(() => game.tauscheErklaerer(1), /Wächter/);
  game.tauscheErklaerer(2); // Cleo explains instead of Anna; Anna has Cleo's slot
  assert.equal(game.turnInfo().erklaerer, 'Cleo');
  assert.equal(game.turnInfo().waechter, 'Ben', 'the Wächter slot is unchanged');
  zug(game, ['r']);
  zug(game, []);
  const t = game.turnInfo(); // slot 2 now belongs to Anna
  assert.equal(t.erklaerer, 'Anna');
});

test('zugAussetzen: the Zug counts as played with 0 points (Runde advances), the Kontingent is untouched', () => {
  const { game } = setup({ settings: { mode: 'runden', rounds: 1, skipMode: 'game', skipFree: 2 } });
  game.zugAussetzen();
  assert.equal(game.phase, 'tabelle');
  assert.deepEqual(game.scores, [0, 0, 0]);
  assert.equal(game.state.log[0].aussetzer, true);
  assert.equal(game.teamSkipQuota(0), 2);
  game.weiter();
  zug(game, []);
  zug(game, [], { next: false });
  assert.equal(game.state.log.length, 3);
  assert.equal(game.state.verlaengerung, true, 'all tied at 0 -> Verlängerung');
  assert.throws(() => game.zugAussetzen(), /Phase/);
});
