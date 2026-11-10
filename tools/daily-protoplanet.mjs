#!/usr/bin/env node
// Protoplanet Tageslevel: erzeugt games/protoplanet/daily-list.js (366 Tage x 5 Freischaltstufen, je Eintrag [Preset-Index, Seed]) und prueft sie.
//   node tools/daily-protoplanet.mjs            erzeugt die Liste neu (mehrere Minuten, Worker-Threads) und schreibt daily-list.js
//   node tools/daily-protoplanet.mjs --verify   prueft die vorhandene Liste: jeder Eintrag in 3 von 3 Bot-Varianten geloest, Zeit 60-360 s
//   --jobs N (Worker), --days a-b (nur diese Eintraege 0..365, nur zum Probieren)
// NACH JEDER AENDERUNG an Physik, Generatoren, Levels (Presets) oder tune.js neu erzeugen: die Seeds tragen nur fuer den geprueften Stand.
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import { playLevel } from '../games/protoplanet/bot.js';
import { PRESETS, presetLevel, presetChoice, chapterOfDay } from '../games/protoplanet/daily.js';
import { DAILY } from '../games/protoplanet/daily-list.js';

const LO = 60;
const HI = 360;
const MAXT = HI + 30;

/** Prueft (Preset, Seed): 3 Varianten, alle geloest und im Korridor. Variante 0 zuerst (schneller Ausschluss). */
function check(presetIdx, seed) {
  const lv = presetLevel(PRESETS[presetIdx], seed);
  const times = [];
  for (const v of [0, 1, 2]) {
    const r = playLevel(lv, { variant: v, maxTime: MAXT });
    if (!r.solved || r.time < LO || r.time > HI) return { ok: false, v, solved: r.solved, time: r.time };
    times.push(r.time);
  }
  return { ok: true, times };
}

/** Sucht fuer Tag idx und Stufe stage (stage >= Kapitel des Tages ist der Normalfall) den ersten tragenden Eintrag. */
function find(idx, stage) {
  for (let k = 0; k < 6; k++) {
    const pr = presetChoice(idx, stage, k);
    for (let j = 0; j < 12; j++) {
      const seed = 20000 + idx * 100 + stage * 20 + k * 3 + j;
      if (check(pr.index, seed).ok) return [pr.index, seed];
    }
  }
  return null;
}

if (!isMainThread) {
  parentPort.on('message', (t) => {
    if (t.kind === 'find') parentPort.postMessage({ ...t, res: find(t.idx, t.stage) });
    else parentPort.postMessage({ ...t, res: check(t.entry[0], t.entry[1]) });
  });
} else {
  const args = process.argv.slice(2);
  const opt = (n, d) => {
    const i = args.indexOf('--' + n);
    return i < 0 ? d : args[i + 1];
  };
  const jobs = +opt('jobs', os.cpus().length);
  const days = (opt('days', '0-365') || '0-365').split('-').map(Number);
  const verify = args.includes('--verify');
  const tasks = [];
  if (verify) {
    const seen = new Set();
    for (let idx = days[0]; idx <= days[1]; idx++) for (let st = 1; st <= 5; st++) {
      const e = DAILY[idx] && DAILY[idx][st - 1];
      if (!e) {
        console.log(`FEHLT: Tag ${idx} Stufe ${st}`);
        process.exitCode = 1;
        continue;
      }
      const key = e.join(':');
      if (!seen.has(key)) {
        seen.add(key);
        tasks.push({ kind: 'check', idx, stage: st, entry: e });
      }
    }
  } else {
    for (let idx = days[0]; idx <= days[1]; idx++) for (let st = chapterOfDay(idx); st <= chapterOfDay(idx); st++) tasks.push({ kind: 'find', idx, stage: st });
    for (let idx = days[0]; idx <= days[1]; idx++) for (let st = 1; st < chapterOfDay(idx); st++) tasks.push({ kind: 'find', idx, stage: st });
  }
  const t0 = performance.now();
  const results = [];
  await new Promise((resolve) => {
    let next = 0;
    let open = 0;
    const ws = [];
    const feed = (w) => {
      if (next >= tasks.length) {
        if (--open === 0) {
          ws.forEach((x) => x.terminate());
          resolve();
        }
        return;
      }
      w.postMessage(tasks[next++]);
    };
    for (let i = 0; i < Math.min(jobs, tasks.length); i++) {
      const w = new Worker(new URL(import.meta.url));
      ws.push(w);
      open++;
      w.on('message', (r) => {
        results.push(r);
        if (results.length % 100 === 0) console.error(`${results.length}/${tasks.length} (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
        feed(w);
      });
      feed(w);
    }
    if (!tasks.length) resolve();
  });
  if (verify) {
    const bad = results.filter((r) => !r.res.ok);
    for (const r of bad) console.log(`FEHLER: Tag ${r.idx} Stufe ${r.stage} Eintrag ${r.entry} -> Variante ${r.res.v} ${r.res.solved ? 'Zeit ' + r.res.time.toFixed(0) : 'nicht geloest'}`);
    const all = results.flatMap((r) => r.res.times || []);
    console.log(`${results.length} verschiedene Eintraege geprueft, ${bad.length} Fehler, Zeiten ${Math.min(...all).toFixed(0)}-${Math.max(...all).toFixed(0)} s, ${((performance.now() - t0) / 1000).toFixed(0)} s Wanduhr`);
    if (bad.length) process.exitCode = 1;
  } else {
    const rows = DAILY.map((r) => (r ? r.slice() : []));
    const miss = [];
    for (const r of results) {
      if (!r.res) {
        miss.push(`${r.idx}/${r.stage}`);
        continue;
      }
      (rows[r.idx] ||= [])[r.stage - 1] = r.res;
    }
    for (let idx = days[0]; idx <= days[1]; idx++) {
      const row = rows[idx] || [];
      const c = chapterOfDay(idx);
      for (let st = c + 1; st <= 5; st++) row[st - 1] = row[c - 1]; // hoehere Stufen: derselbe Eintrag wie der des Tageskapitels
      rows[idx] = row;
    }
    if (miss.length) console.log('OHNE TREFFER:', miss.join(' '));
    const body = rows.map((r) => '  ' + JSON.stringify(r)).join(',\n');
    fs.writeFileSync(new URL('../games/protoplanet/daily-list.js', import.meta.url), `// ERZEUGT von tools/daily-protoplanet.mjs (nicht von Hand aendern). DAILY[tag 0..365][stufe-1] = [Preset-Index in daily.js PRESETS, Seed]; jeder Eintrag wurde vom Bot in 3 von 3 Varianten geloest (60-360 s).\n// Nach Aenderungen an Physik, Generatoren, Level-Presets oder tune.js mit "node tools/daily-protoplanet.mjs" neu erzeugen, dann "--verify".\nexport const DAILY = [\n${body},\n];\n`);
    console.log(`Liste geschrieben (${results.length} Suchen, ${((performance.now() - t0) / 1000).toFixed(0)} s Wanduhr), ohne Treffer: ${miss.length}`);
  }
}
