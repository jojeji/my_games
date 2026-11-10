// Stichprobe der Tageslevel-Liste (Deploy-Sperre): feste Eintraege werden vom Bot in mindestens 2 von 3 Varianten geloest, Zeit 60-360 s. Die ganze Liste prueft `node tools/daily-protoplanet.mjs --verify`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DAILY } from '../../games/protoplanet/daily-list.js';
import { PRESETS, presetLevel } from '../../games/protoplanet/daily.js';
import { playLevel } from '../../games/protoplanet/bot.js';

export function sampleDaily(picks) {
  for (const [idx, stage] of picks) {
    const e = DAILY[idx][stage - 1];
    const pr = PRESETS[e[0]];
    test(`Tageslevel Tag ${idx} Stufe ${stage} (${pr.id}, Seed ${e[1]}): der Bot loest es in mindestens 2 von 3 Varianten, Zeit 60-360 s`, () => {
      const lv = presetLevel(pr, e[1]);
      const rs = [0, 1, 2].map((v) => playLevel(lv, { variant: v, maxTime: 400 }));
      const ok = rs.filter((r) => r.solved);
      assert.ok(ok.length >= 2, `${pr.id}/${e[1]}: nur ${ok.length}/3 geloest`);
      for (const r of ok) assert.ok(r.time >= 60 && r.time <= 360, `${pr.id}/${e[1]}: Zeit ${r.time.toFixed(0)} s`);
    });
  }
}
