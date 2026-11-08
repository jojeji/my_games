// Gemeinsame Pruefungen fuer die Bot-Tests je Kapitel (Deploy-Sperre): jedes feste Level geloest mit 3 Sternen, jedes Familienlevel ueber 40 Seeds >= 95 %, Median 1-5 min.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../../games/protoplanet/levels.js';
import { playLevel, botBatch } from '../../games/protoplanet/bot.js';
import { starsFor } from '../../games/protoplanet/goals.js';

const seeds = Array.from({ length: 40 }, (_, i) => 1000 + i);

export function simChapter(chapter) {
  const levels = LEVELS.filter((l) => l.chapter === chapter);
  test(`Bot loest jedes feste Level von Kapitel ${chapter} (3 Sterne)`, () => {
    for (const lv of levels) {
      const r = playLevel(lv);
      assert.ok(r.solved, `${lv.id} nicht geloest (${r.lost ? 'verloren' : 'Zeitlimit'} nach ${r.time.toFixed(0)} s)`);
      assert.ok(r.time < 300, `${lv.id}: ${r.time.toFixed(0)} s`);
      // die Stern-Ziele sind fuer einen sauber spielenden Bot erreichbar (Eintrag steht im Verhaeltnis zum Bot-Ergebnis)
      const st = starsFor(lv, { time: r.time, ejected: r.ejected, rewound: false });
      assert.equal(st.count, 3, `${lv.id}: der Bot selbst schafft nicht alle Sterne (${JSON.stringify(st)}, Zeit ${r.time.toFixed(0)}, Ausstoss ${r.ejected.toFixed(2)})`);
    }
  });
  for (const lv of levels.filter((l) => l.family !== 'hand')) {
    test(`Familie ${lv.family} (Level ${lv.id}, Ziel ${lv.goal.type}): >= 95 % gelöst, Median 1-5 min über 40 Seeds`, () => {
      const b = botBatch(lv, seeds);
      assert.ok(b.rate >= 0.95, `${lv.id}: nur ${b.solved}/${b.n} gelöst`);
      assert.ok(b.medTime >= 60 && b.medTime <= 300, `${lv.id}: Median ${b.medTime.toFixed(0)} s`);
    });
  }
}
