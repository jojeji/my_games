// Hint toast for new autobuyers (engine/ui/auto-hints.js): where the switch is, one toast per place, offline unlocks, once per auto.
import test from 'node:test';
import assert from 'node:assert/strict';
import { announceAutoUnlocks } from '../engine/ui/auto-hints.js';
import { createBus, createRuntime } from '../engine/core.js';
import { createStorage } from '../engine/save.js';
import { createReplikator } from '../games/replikator/logic.js';

const wait = () => new Promise((r) => setTimeout(r, 5));
const setup = (offline) => {
  const bus = createBus();
  const toasts = [];
  announceAutoUnlocks({ runtime: bus, toast: (t) => toasts.push(t), offline, whereOf: () => 'Generatoren-Tab' });
  return { bus, toasts };
};

test('names where the switch is; a pair in the same tick gives one toast; an own `where` wins', async () => {
  const { bus, toasts } = setup();
  bus.emit('auto-unlocked', { id: 'a', def: { name: 'Autokauf: Bohrdrohne' } });
  bus.emit('auto-unlocked', { id: 'b', def: { name: 'Autokauf: Schmelzer' } });
  bus.emit('auto-unlocked', { id: 'c', def: { name: 'Auto-Replikation', where: 'Replikation-Tab' } });
  await wait();
  assert.deepEqual(toasts, ['Autokauf: Bohrdrohne und Autokauf: Schmelzer freigeschaltet – Schalter im Generatoren-Tab', 'Auto-Replikation freigeschaltet – Schalter im Replikation-Tab']);
});

test('unlocks during offline catch-up arrive with the summary (returned by load() or as event)', async () => {
  const ev = (name) => ({ type: 'auto-unlocked', payload: { id: name, def: { name } } });
  const { bus, toasts } = setup({ events: [ev('Eins'), { type: 'story', payload: {} }] });
  bus.emit('offline', { events: [ev('Zwei')] });
  await wait();
  assert.equal(toasts.length, 1);
  assert.match(toasts[0], /Eins und Zwei freigeschaltet/);
});

test('once per auto: the kit flags it as seen, a reload does not announce it again', () => {
  const storage = createStorage({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) });
  const store = new Map();
  const g = createReplikator();
  const rt = createRuntime(g, { storage });
  rt.load();
  const seen = [];
  rt.on('auto-unlocked', ({ id }) => seen.push(id));
  g.state.upg.auto1 = 1;
  g.tick(1);
  g.tick(1);
  assert.deepEqual(seen, ['auto_gen0', 'auto_gen1'], 'announced once');
  rt.save();
  const g2 = createReplikator();
  const rt2 = createRuntime(g2, { storage });
  rt2.load();
  const again = [];
  rt2.on('auto-unlocked', ({ id }) => again.push(id));
  g2.tick(1);
  assert.deepEqual(again, []);
});
