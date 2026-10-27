import test from 'node:test';
import assert from 'node:assert/strict';
import { createReplikator } from '../games/replikator/logic.js';
import { createRuntime, advance } from '../engine/core.js';
import { createStorage } from '../engine/save.js';
import { D } from '../engine/decimal.js';
import { HEAD_MAX, TAIL_MAX, IDLE_GAP } from '../engine/kit/playlog.js';

const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};

test('prestige, story and unlocks land in the log with aggregates', () => {
  const g = createReplikator();
  advance(g, 5);
  g.slowChecks();
  g.add('matter', D(1e9));
  g.slowChecks();
  assert.ok(g.prestige('replication'));
  const ev = g.plogEvents();
  assert.ok(ev.some((e) => e[1] === 'prestige' && /#1/.test(e[2])));
  assert.ok(ev.some((e) => e[1] === 'story'));
  assert.equal(g.state.plog.layers.replication.n, 1);
  assert.match(g.plogText(), /Prestiges: .*1x/);
});

test('idle gap needs input after >5 min; offline time does not count as idle', () => {
  const g = createReplikator();
  advance(g, 10);
  g.plogInput();
  advance(g, IDLE_GAP + 20);
  g.plogInput();
  assert.equal(g.state.plog.idle.n, 1);
  g.plogOffline(3600);
  advance(g, 3600); // simulated offline catch-up advances play time
  g.plogInput();
  assert.equal(g.state.plog.idle.n, 1);
  assert.equal(g.state.plog.offline.n, 1);
});

test('log is capped: first HEAD_MAX kept, rolling tail, counters aggregate', () => {
  const g = createReplikator();
  for (let i = 0; i < HEAD_MAX + TAIL_MAX + 50; i++) g.plog('x', 'e' + i, i);
  const pl = g.state.plog;
  assert.equal(pl.head.length, HEAD_MAX);
  assert.equal(pl.tail.length, TAIL_MAX);
  assert.equal(pl.dropped, 50);
  assert.equal(pl.counts.x, HEAD_MAX + TAIL_MAX + 50);
  assert.equal(g.plogEvents().at(-1)[2], 'e' + (HEAD_MAX + TAIL_MAX + 49));
});

test('log survives save/export/import via the runtime', () => {
  const storage = createStorage(mem());
  const g = createReplikator();
  const rt = createRuntime(g, { storage });
  rt.load();
  g.plog('x', 'hallo', 12);
  rt.save();
  const str = rt.exportString();
  const g2 = createReplikator();
  const rt2 = createRuntime(g2, { storage: createStorage(mem()) });
  rt2.load();
  rt2.importString(str);
  assert.ok(g2.plogEvents().some((e) => e[2] === 'hallo'));
});

test('short export leaves out the log, is much smaller, and imports like a full one', () => {
  const g = createReplikator();
  const rt = createRuntime(g, { storage: createStorage(mem()) });
  rt.load();
  for (let i = 0; i < 400; i++) g.plog('x', 'Ereignis Nummer ' + i, i);
  g.add('matter', 12345);
  const full = rt.exportString();
  const short = rt.exportString({ short: true });
  assert.ok(short.length < full.length / 2, `${short.length} vs ${full.length}`);
  assert.ok(g.plogEvents().length >= 400, 'the running game keeps its log');
  const g2 = createReplikator();
  const rt2 = createRuntime(g2, { storage: createStorage(mem()) });
  rt2.load();
  rt2.importString(short);
  assert.equal(g2.state.cur.matter.amount.toString(), g.state.cur.matter.amount.toString());
  assert.equal(g2.plogEvents().length, 0, 'fresh log after importing the short form');
  rt2.importString(full);
  assert.ok(g2.plogEvents().length >= 400);
});
