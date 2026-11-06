// Deploy-Sperre fuer Protoplanet: der Bot (games/protoplanet/bot.js, gleiche Physik wie das Spiel) loest jedes feste Level,
// jede Levelfamilie ueber >= 40 Seeds zu >= 95 % und mit Median-Spielzeit zwischen 1 und 5 Minuten (Lehrlevels duerfen kuerzer sein).
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../games/protoplanet/levels.js';
import { playLevel, botBatch } from '../games/protoplanet/bot.js';
import { starsFor } from '../games/protoplanet/goals.js';

test('Bot loest jedes feste Level von Kapitel 1', () => {
  for (const lv of LEVELS) {
    const r = playLevel(lv);
    assert.ok(r.solved, `${lv.id} nicht geloest (${r.lost ? 'verloren' : 'Zeitlimit'} nach ${r.time.toFixed(0)} s)`);
    assert.ok(r.time < 300, `${lv.id}: ${r.time.toFixed(0)} s`);
    // die Stern-Ziele sind fuer einen sauber spielenden Bot erreichbar (Eintrag steht im Verhaeltnis zum Bot-Ergebnis)
    const st = starsFor(lv, { time: r.time, ejected: r.ejected, rewound: false });
    assert.equal(st.count, 3, `${lv.id}: der Bot selbst schafft nicht alle Sterne (${JSON.stringify(st)}, Zeit ${r.time.toFixed(0)}, Ausstoss ${r.ejected.toFixed(2)})`);
  }
});

const seeds = Array.from({ length: 40 }, (_, i) => 1000 + i);
for (const lv of LEVELS.filter((l) => l.family !== 'hand')) {
  test(`Familie ${lv.family} (Level ${lv.id}): >= 95 % gelöst, Median 1-5 min über 40 Seeds`, () => {
    const b = botBatch(lv, seeds);
    assert.ok(b.rate >= 0.95, `${lv.id}: nur ${b.solved}/${b.n} gelöst`);
    assert.ok(b.medTime >= 60 && b.medTime <= 300, `${lv.id}: Median ${b.medTime.toFixed(0)} s`);
  });
}
