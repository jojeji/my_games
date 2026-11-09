// Gemeinsame Pruefungen fuer die Bot-Tests je Level (Deploy-Sperre). Neue Abnahme (Paket A, begruendet in docs/protoplanet.md "Paket A"):
//  - Feste Levels: der Bot loest den festen Seed in mindestens 2 von 3 Bot-Varianten (andere Entscheidungs-Phase, deterministisch); Zeit der geloesten Laeufe im Korridor
//    (Lehrlevels frei, normale Levels 60-420 s, Kapitel-Finale bis 480 s). Die Stern-Ziele (`targets`, Bot-Median x 1,3) sind erreichbar: mindestens eine Variante schafft je Ziel.
//  - Familien: ueber 30 Zufalls-Seeds (1000..1029) mit den Parametern des Levels >= 80 % geloest (Familien mit `daily: true` muessten >= 95 % schaffen: gibt es noch keine), Median der Zeit im Korridor.
//  - "Welt lebt": mittlere Geschwindigkeit der Koerper beim Start >= 0,08 und Endmasse des Bots (Median ueber die geloesten Laeufe) >= 6.
// Die Bot-Laeufe gehen bis 480 s Spielzeit (danach gilt ein Level als nicht geloest), damit fehlgeschlagene Laeufe die Testzeit nicht fressen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { levelById } from '../../games/protoplanet/levels.js';
import { playLevel, botBatch, median } from '../../games/protoplanet/bot.js';
import { createPlay } from '../../games/protoplanet/play.js';

export const SEEDS = Array.from({ length: 30 }, (_, i) => 1000 + i);
const MAX = 480;
const isFinale = (lv) => lv.n === 8;

export function simLevels(ids) {
  for (const id of ids) {
    const lv = levelById(id);
    const hand = lv.family === 'hand';
    const hi = isFinale(lv) ? 480 : 420;
    let fixed = null;
    const variants = () => (fixed ||= [0, 1, 2].map((v) => playLevel(lv, { variant: v, maxTime: MAX })));

    test(`${id} ${lv.title}: der Bot loest den festen Seed in mindestens 2 von 3 Varianten${hand ? '' : `, Zeit im Korridor 60-${hi} s`}`, () => {
      const rs = variants();
      const ok = rs.filter((r) => r.solved);
      assert.ok(ok.length >= 2, `${id}: nur ${ok.length}/3 Varianten geloest (${rs.map((r) => (r.solved ? r.time.toFixed(0) : r.lost ? 'verloren' : 'Zeitlimit')).join(', ')})`);
      if (!hand) for (const r of ok) assert.ok(r.time >= 60 && r.time <= hi, `${id}: Zeit ${r.time.toFixed(0)} s ausserhalb 60-${hi}`);
    });

    test(`${id}: die Stern-Ziele sind erreichbar (mindestens eine Variante schafft Effizienz und eine Zeit)`, () => {
      const ok = variants().filter((r) => r.solved);
      assert.ok(ok.some((r) => r.ejected <= lv.targets.eject), `${id}: kein Lauf unter ${lv.targets.eject} Ausstoss (${ok.map((r) => r.ejected.toFixed(2)).join(', ')})`);
      assert.ok(ok.some((r) => r.time <= lv.targets.time), `${id}: kein Lauf unter ${lv.targets.time} s (${ok.map((r) => r.time.toFixed(0)).join(', ')})`);
    });

    if (hand) continue;
    let batch = null;
    const family = () => (batch ||= botBatch(lv, SEEDS, { maxTime: MAX }));

    test(`${id}: Familie ${lv.family} (Ziel ${lv.goal.type}) ueber ${SEEDS.length} Zufalls-Seeds >= 80 % geloest, Median der Zeit 60-${hi} s`, () => {
      const b = family();
      assert.ok(b.rate >= 0.8, `${id}: nur ${b.solved}/${b.n} geloest`);
      assert.ok(b.medTime >= 60 && b.medTime <= hi, `${id}: Median ${b.medTime.toFixed(0)} s`);
    });

    test(`${id}: die Welt lebt (mittlere Geschwindigkeit beim Start >= 0,08) und der Bot erreicht im Median eine Endmasse >= 6`, () => {
      const bs = createPlay(lv).world.bodies.filter((b) => b.kind !== 'player');
      const v = bs.reduce((s, b) => s + Math.hypot(b.vx, b.vy), 0) / bs.length;
      assert.ok(v >= 0.08, `${id}: mittlere Geschwindigkeit ${v.toFixed(3)}`);
      const masses = [...family().runs.filter((r) => r.solved).map((r) => r.mass), ...variants().filter((r) => r.solved).map((r) => r.mass)];
      assert.ok(median(masses) >= 6, `${id}: Endmasse (Median) ${median(masses).toFixed(1)}`);
    });
  }
}
