import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, restoreGame, createDeck, mergeCards, mulberry32, scoreZug, DEFAULT_SETTINGS } from '../games/psst/logic.js';

const cards = (n, prefix = 'k') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, w: `Wort ${i}`, t: ['a', 'b', 'c', 'd', 'e'], d: 1 }));

function setup({ teams = 2, settings = {}, players = [], n = 200, seed = 1 } = {}) {
  const clock = { t: 1000 };
  const rng = mulberry32(seed);
  const deck = createDeck(cards(n), { rng });
  const game = createGame({
    teams: Array.from({ length: teams }, (_, i) => ({ name: 'T' + (i + 1), color: '#000', players: players[i] || [] })),
    settings: { turnSecs: 60, ...settings },
    deck,
    rng,
    now: () => clock.t,
  });
  return { game, clock, deck };
}

/** play one complete Zug: results = list of 'r' | 's' | 'b' ; then confirm and go on. */
function zug(game, results = [], { next = true } = {}) {
  game.bereit();
  for (const r of results) {
    if (r === 'r') game.richtig();
    else if (r === 's') game.ueberspringen();
    else if (r === 'b') game.buzzer(), game.state.zug.pause === 'buzzer' && game.buzzerBestaetigt();
  }
  game.state.zug.timeLeftMs = 0; // force time up
  game.state.zug.runSince = null;
  game.state.phase = 'laeuft';
  assert.ok(game.tick());
  game.zusammenfassung();
  game.bestaetigen();
  if (next) game.weiter();
}

test('Zug: Richtig scores, time up drops the shown card and moves to summary', () => {
  const { game, clock } = setup();
  game.bereit();
  assert.equal(game.phase, 'laeuft');
  const first = game.zug.current;
  game.richtig();
  game.richtig();
  assert.notEqual(game.zug.current.id, first.id);
  clock.t += 59_999;
  assert.equal(game.tick(), false);
  assert.equal(game.secondsLeft(), 1);
  clock.t += 2;
  assert.equal(game.tick(), true);
  assert.equal(game.phase, 'vorbei');
  assert.equal(game.zug.current, null); // the card on screen when time ran out gives no points
  game.zusammenfassung();
  assert.equal(game.summaryScore().points, 2);
  game.bestaetigen();
  assert.deepEqual(game.scores, [2, 0]);
  game.weiter();
  assert.equal(game.phase, 'bereit');
  assert.equal(game.turnInfo().team, 1);
});

test('Überspringer-Kontingent pro Zug: refilled each Zug, penalty after the free ones', () => {
  const { game } = setup({ settings: { skipMode: 'turn', skipFree: 2, skipPenalty: 1 } });
  game.bereit();
  assert.equal(game.skipInfo().free, 2);
  game.ueberspringen();
  assert.equal(game.skipInfo().free, 1);
  game.ueberspringen();
  assert.deepEqual([game.skipInfo().free, game.skipInfo().penalty], [0, 1]);
  game.ueberspringen(); // costs -1
  game.richtig();
  assert.equal(game.zugScore().points, 0); // +1 -1
  game.state.zug.timeLeftMs = 0;
  game.tick();
  game.zusammenfassung();
  game.bestaetigen();
  assert.equal(game.scores[0], 0);
  game.weiter();
  game.bereit(); // other team
  assert.equal(game.skipInfo().free, 2);
  game.ueberspringen();
  game.state.zug.timeLeftMs = 0;
  game.tick();
  game.zusammenfassung();
  game.bestaetigen();
  game.weiter();
  game.bereit(); // team 0 again: refilled
  assert.equal(game.skipInfo().free, 2);
});

test('Überspringer-Kontingent pro Spiel: carries over per team, no penalty with penalty 0', () => {
  const { game } = setup({ settings: { skipMode: 'game', skipFree: 3, skipPenalty: 0 } });
  zug(game, ['s', 's', 'r']);
  assert.equal(game.teamSkipQuota(0), 1);
  assert.equal(game.teamSkipQuota(1), 3);
  zug(game, ['r']);
  game.bereit(); // team 0 again
  assert.equal(game.skipInfo().free, 1);
  game.ueberspringen();
  game.ueberspringen(); // beyond the quota, but penalty 0
  assert.equal(game.zugScore().points, 0);
  assert.equal(game.skipInfo().free, 0);
  game.state.zug.timeLeftMs = 0;
  game.tick();
  game.zusammenfassung();
  game.bestaetigen();
  assert.equal(game.teamSkipQuota(0), 0);
});

test('Überspringer: unbegrenzt (-1) and survives serialisation', () => {
  const { game, deck } = setup({ settings: { skipFree: -1, skipPenalty: 1 } });
  game.bereit();
  for (let i = 0; i < 10; i++) game.ueberspringen();
  assert.equal(game.skipInfo().unlimited, true);
  assert.equal(game.zugScore().points, 0);
  const json = JSON.parse(JSON.stringify(game.toJSON()));
  const g2 = restoreGame(json, { deck });
  assert.equal(g2.skipInfo().unlimited, true);
});

test('Buzzer mit Pause: Bestätigt = Abzug + neue Karte, Timer steht während des Dialogs', () => {
  const { game, clock } = setup({ settings: { buzzPause: true, buzzPenalty: 1 } });
  game.bereit();
  const c0 = game.zug.current;
  clock.t += 10_000;
  game.buzzer();
  assert.equal(game.phase, 'pausiert');
  clock.t += 30_000; // dialog open
  assert.equal(game.secondsLeft(), 50);
  assert.equal(game.tick(), false);
  assert.throws(() => game.richtig());
  game.buzzerBestaetigt();
  assert.equal(game.phase, 'laeuft');
  assert.notEqual(game.zug.current.id, c0.id);
  assert.equal(game.zug.cards[0].result, 'buzzer');
  assert.equal(game.zugScore().points, -1);
  clock.t += 5000;
  assert.equal(game.secondsLeft(), 45);
});

test('Buzzer mit Pause: Einspruch weiter = gleiche Karte, kein Abzug; Einspruch neue Karte = andere Karte, kein Abzug', () => {
  const { game, clock } = setup({ settings: { buzzPause: true } });
  game.bereit();
  const c0 = game.zug.current;
  game.buzzer();
  clock.t += 8000;
  game.einspruchWeiter();
  assert.equal(game.zug.current.id, c0.id);
  assert.equal(game.zug.cards.length, 0);
  assert.equal(game.zugScore().points, 0);
  assert.equal(game.secondsLeft(), 60);
  game.buzzer();
  game.einspruchNeueKarte();
  assert.notEqual(game.zug.current.id, c0.id);
  assert.equal(game.zug.cards.length, 0);
  assert.equal(game.phase, 'laeuft');
  assert.equal(game.zugScore().points, 0);
});

test('Buzzer ohne Pause: sofort -1 und nächste Karte, Timer läuft weiter; Strafe 0 möglich', () => {
  const a = setup({ settings: { buzzPause: false, buzzPenalty: 1 } });
  a.game.bereit();
  const c0 = a.game.zug.current;
  a.game.buzzer();
  assert.equal(a.game.phase, 'laeuft');
  assert.notEqual(a.game.zug.current.id, c0.id);
  assert.equal(a.game.zugScore().points, -1);
  const b = setup({ settings: { buzzPause: false, buzzPenalty: 0 } });
  b.game.bereit();
  b.game.buzzer();
  assert.equal(b.game.zugScore().points, 0);
  assert.equal(b.game.zugScore().buzzed, 1);
});

test('Zusammenfassung: Korrekturen zwischen richtig/übersprungen/buzzer ändern die Punkte (inkl. Kontingent)', () => {
  const { game } = setup({ settings: { skipFree: 1, skipPenalty: 1, buzzPenalty: 1 } });
  game.bereit();
  game.richtig();
  game.ueberspringen(); // free
  game.ueberspringen(); // -1
  game.buzzer(); // pause
  game.buzzerBestaetigt(); // -1
  game.state.zug.timeLeftMs = 0;
  game.tick();
  game.zusammenfassung();
  assert.equal(game.summaryScore().points, 1 + 0 - 1 - 1);
  game.korrigiere(3, 'richtig'); // mistaken buzzer
  assert.equal(game.summaryScore().points, 1 + 0 - 1 + 1);
  game.korrigiere(2, 'richtig'); // second skip was actually correct
  assert.equal(game.summaryScore().points, 3);
  game.korrigiere(1, 'buzzer');
  game.korrigiere(2, 'uebersprungen'); // now this skip is the first one -> free
  assert.equal(game.summaryScore().per[2].free, true);
  assert.equal(game.summaryScore().points, 1 - 1 + 0 + 1);
  assert.throws(() => game.korrigiere(0, 'quatsch'));
  game.bestaetigen();
  assert.equal(game.scores[0], 1);
  assert.deepEqual(game.state.stats[0], { guessed: 2, skipped: 1, buzzed: 1 });
  assert.throws(() => game.korrigiere(0, 'richtig')); // locked after confirming
});

test('Punkteziel: the current Runde is finished, then the leader wins', () => {
  const { game } = setup({ teams: 3, settings: { mode: 'punkte', target: 3 } });
  zug(game, ['r', 'r', 'r']); // team 0 reaches the target in the first Zug
  assert.equal(game.over, false);
  assert.equal(game.lastRound, true);
  assert.equal(game.phase, 'bereit');
  zug(game, ['r']);
  assert.equal(game.over, false);
  zug(game, ['r', 'r'], { next: false }); // Runde complete
  assert.equal(game.over, true);
  assert.deepEqual(game.winners, [0]);
  game.weiter();
  assert.equal(game.phase, 'ende');
  assert.equal(game.state.log.length, 3); // all teams had exactly one Zug
});

test('Rundenlimit: ends after N Runden, not earlier', () => {
  const { game } = setup({ settings: { mode: 'runden', rounds: 2 } });
  zug(game, ['r']);
  zug(game, []);
  zug(game, ['r', 'r']);
  assert.equal(game.over, false);
  zug(game, ['r'], { next: false });
  assert.equal(game.over, true);
  assert.deepEqual(game.winners, [0]);
  assert.deepEqual(game.scores, [3, 1]);
  game.weiter();
  assert.equal(game.phase, 'ende');
});

test('Gleichstand führt in eine Verlängerungsrunde, mehrfach möglich', () => {
  const { game } = setup({ settings: { mode: 'runden', rounds: 1 } });
  zug(game, ['r']);
  zug(game, ['r'], { next: false });
  assert.equal(game.over, false); // tie
  assert.equal(game.state.verlaengerung, true);
  game.weiter();
  assert.equal(game.phase, 'bereit');
  assert.equal(game.turnInfo().verlaengerung, true);
  zug(game, ['r']);
  zug(game, ['r'], { next: false }); // tie again
  assert.equal(game.over, false);
  game.weiter();
  zug(game, ['r', 'r']);
  zug(game, ['r'], { next: false });
  assert.equal(game.over, true);
  assert.deepEqual(game.winners, [0]);
  assert.equal(game.state.extra, 2);
});

test('Punkteziel mit Gleichstand: Verlängerung, Freies Spiel: kein automatisches Ende, beenden() von Hand', () => {
  const p = setup({ settings: { mode: 'punkte', target: 2 } });
  zug(p.game, ['r', 'r']);
  zug(p.game, ['r', 'r'], { next: false });
  assert.equal(p.game.over, false);
  assert.equal(p.game.state.extra, 1);
  const f = setup({ settings: { mode: 'frei' } });
  for (let i = 0; i < 6; i++) zug(f.game, ['r']);
  assert.equal(f.game.over, false);
  f.game.bereit();
  f.game.state.zug.timeLeftMs = 0;
  f.game.tick();
  f.game.zusammenfassung();
  f.game.bestaetigen();
  f.game.beenden();
  assert.equal(f.game.phase, 'ende');
  assert.deepEqual(f.game.winners, [0, 1]);
});

test('Spielerrotation: Erklärer und Wächter wechseln fair, ohne Namen nur Team', () => {
  const { game } = setup({ teams: 2, players: [['Anna', 'Ben', 'Cem'], ['Dora', 'Eli']], settings: { mode: 'frei' } });
  const seen = [];
  for (let i = 0; i < 12; i++) {
    const t = game.turnInfo();
    seen.push([t.team, t.erklaerer, t.waechter]);
    assert.equal(t.guardTeam, (t.team + 1) % 2);
    zug(game, ['r']);
  }
  const team0 = seen.filter((s) => s[0] === 0).map((s) => s[1]);
  const team1 = seen.filter((s) => s[0] === 1).map((s) => s[1]);
  assert.deepEqual(team0, ['Anna', 'Ben', 'Cem', 'Anna', 'Ben', 'Cem']);
  assert.deepEqual(team1, ['Dora', 'Eli', 'Dora', 'Eli', 'Dora', 'Eli']);
  const guards0 = seen.filter((s) => s[0] === 1).map((s) => s[2]); // Wächter of team 0 during team 1's Zug
  assert.deepEqual(guards0, ['Anna', 'Ben', 'Cem', 'Anna', 'Ben', 'Cem']);
  assert.deepEqual([game.bestErklaerer().name, game.bestErklaerer().guessed], ['Dora', 3]);
  const anon = setup().game.turnInfo();
  assert.equal(anon.erklaerer, null);
  assert.equal(anon.waechter, null);
});

test('Spielerrotation mit 3 Teams: jedes Team stellt gleich oft den Wächter', () => {
  const { game } = setup({ teams: 3, players: [['A1', 'A2'], ['B1', 'B2'], ['C1', 'C2']], settings: { mode: 'frei' } });
  const guards = {};
  for (let i = 0; i < 18; i++) {
    const t = game.turnInfo();
    guards[t.guardTeam] = (guards[t.guardTeam] || 0) + 1;
    zug(game, []);
  }
  assert.deepEqual(guards, { 0: 6, 1: 6, 2: 6 });
});

test('Kartenpakete: Karten in mehreren Paketen werden nur einmal gezogen (de-duplicate by id)', () => {
  const a = cards(10, 'a');
  const b = [...cards(5, 'a'), ...cards(5, 'b')]; // a0..a4 shared
  const merged = mergeCards([a, b]);
  assert.equal(merged.length, 15);
  const deck = createDeck([...a, ...b], { rng: mulberry32(3) });
  const drawn = new Set();
  for (let i = 0; i < 15; i++) drawn.add(deck.draw().id);
  assert.equal(drawn.size, 15);
  assert.equal(deck.reshuffles, 0);
});

test('Karten wiederholen sich nicht (persistierte Gespielt-Menge), danach Neumischen mit Hinweis', () => {
  const list = cards(6);
  const played = new Set(['k0', 'k1']);
  let reshuffled = 0;
  const deck = createDeck(list, { played, rng: mulberry32(9), onReshuffle: () => reshuffled++ });
  const first = [];
  for (let i = 0; i < 4; i++) first.push(deck.draw().id);
  assert.deepEqual(new Set(first), new Set(['k2', 'k3', 'k4', 'k5']));
  assert.equal(reshuffled, 0);
  assert.equal(played.size, 6);
  const next = deck.draw(); // exhausted -> reshuffle
  assert.equal(reshuffled, 1);
  assert.notEqual(next.id, first[3]);
  assert.equal(played.size, 1);
  const round = [next.id];
  for (let i = 0; i < 5; i++) round.push(deck.draw().id);
  assert.equal(new Set(round).size, 6);
});

test('Speichern/Wiederherstellen mitten im Zug: kommt pausiert zurück, Zeit und Punkte bleiben', () => {
  const { game, clock, deck } = setup({ players: [['A'], ['B']] });
  game.bereit();
  game.richtig();
  game.ueberspringen();
  clock.t += 20_000;
  const json = JSON.parse(JSON.stringify(game.toJSON()));
  clock.t += 3_600_000; // app was closed for an hour
  const g2 = restoreGame(json, { deck, now: () => clock.t });
  assert.equal(g2.phase, 'pausiert');
  assert.equal(g2.zug.pause, 'app');
  assert.equal(g2.zug.cards.length, 2);
  assert.equal(g2.zug.current.id, game.zug.current.id);
  assert.equal(g2.secondsLeft(), 40);
  assert.equal(g2.tick(), false);
  g2.fortsetzen();
  clock.t += 41_000;
  assert.equal(g2.tick(), true);
  g2.zusammenfassung();
  assert.equal(g2.summaryScore().guessed, 1);
  g2.bestaetigen();
  assert.deepEqual(g2.scores, [1, 0]);
});

test('Speichern/Wiederherstellen mitten im Buzzer-Dialog und zwischen den Zügen', () => {
  const { game, deck } = setup({ settings: { skipMode: 'game', skipFree: 2 } });
  game.bereit();
  game.buzzer();
  const g2 = restoreGame(JSON.parse(JSON.stringify(game.toJSON())), { deck });
  assert.equal(g2.phase, 'pausiert');
  assert.equal(g2.zug.pause, 'buzzer');
  g2.einspruchWeiter();
  g2.ueberspringen();
  g2.state.zug.timeLeftMs = 0;
  g2.tick();
  g2.zusammenfassung();
  g2.bestaetigen();
  g2.weiter();
  const g3 = restoreGame(JSON.parse(JSON.stringify(g2.toJSON())), { deck });
  assert.equal(g3.phase, 'bereit');
  assert.equal(g3.teamSkipQuota(0), 1);
  assert.equal(g3.turnInfo().team, 1);
});

test('manual pause/fortsetzen stops the clock; scoreZug is pure', () => {
  const { game, clock } = setup();
  game.bereit();
  clock.t += 5000;
  game.pausieren();
  clock.t += 100_000;
  assert.equal(game.secondsLeft(), 55);
  game.fortsetzen();
  clock.t += 5000;
  assert.equal(game.secondsLeft(), 50);
  const e = [{ result: 'uebersprungen' }, { result: 'uebersprungen' }];
  assert.equal(scoreZug(e, { ...DEFAULT_SETTINGS, skipPenalty: 1 }, 1).points, -1);
  assert.equal(e[0].result, 'uebersprungen');
});

test('invalid team counts are rejected', () => {
  const deck = createDeck(cards(3));
  assert.throws(() => createGame({ teams: [{ name: 'x', color: '#000' }], deck }));
  assert.throws(() => createGame({ teams: Array(5).fill({ name: 'x', color: '#000' }), deck }));
});
