import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createNet, estimateOffset, remainingMs, makeCode, cleanCode, CODE_RE, CODE_ALPHABET } from '../games/psst/net.js';
import { createMemoryRoom, until, sleep } from './helpers/memory-room.mjs';
import { FAST } from './helpers/mp-harness.mjs';

const all = [];
after(() => all.forEach((n) => n.close()));
const mk = (room, id, extra = {}) => {
  const n = createNet({ transport: room.transport(), code: 'ABCDE', clientId: id, opts: FAST, ...extra });
  all.push(n);
  return n;
};

test('room codes: 5 unambiguous characters', () => {
  assert.ok(!/[ILO01]/.test(CODE_ALPHABET));
  for (let i = 0; i < 200; i++) assert.match(makeCode(), CODE_RE);
  assert.equal(cleanCode(' ab-c1d2o '), 'ABCD2');
  assert.equal(CODE_RE.test('ABCDO'), false);
});

test('timer offset math: the lowest round trip wins, remaining time follows the host clock', () => {
  // host clock is 5000 ms ahead of ours; symmetric 40 ms trip
  const e = estimateOffset([
    { t0: 1000, t1: 1300, hostNow: 6150 + 100 }, // slow, asymmetric sample
    { t0: 2000, t1: 2040, hostNow: 2020 + 5000 },
  ]);
  assert.equal(e.rtt, 40);
  assert.equal(e.offset, 5000);
  // the Zug ends at host time 100000: our clock reads 75000 -> host clock reads 80000 -> 20 s left
  const timer = { endsAt: 100000, leftMs: 30000 };
  assert.equal(remainingMs(timer, { offset: 5000, now: 75000 }), 20000);
  assert.equal(remainingMs(timer, { offset: 5000, now: 200000 }), 0);
  // without an estimate it counts from the arrival of the view
  assert.equal(remainingMs(timer, { offset: null, receivedAt: 1000, now: 4000 }), 27000);
  // paused: just the stored remainder
  assert.equal(remainingMs({ endsAt: null, leftMs: 12345 }), 12345);
  assert.equal(remainingMs(null), 0);
});

test('routing room: welcome frame sets routing mode, server-side targeting works and presence reaches the host', async () => {
  const room = createMemoryRoom();
  const host = mk(room, 'hosthost0001', { isHost: true });
  const a = mk(room, 'guestaaaaaaa');
  const b = mk(room, 'guestbbbbbbb');
  const got = { host: [], a: [], b: [] };
  host.on('message', (m) => got.host.push(m));
  a.on('message', (m) => got.a.push(m));
  b.on('message', (m) => got.b.push(m));
  host.connect();
  await until(() => host.status === 'online');
  host.send({ t: 'host-hello', hostKey: 'hostkey-secret-1' });
  a.connect();
  b.connect();
  await until(() => a.status === 'online' && b.status === 'online');
  assert.equal(a.routing, true);
  assert.equal(a.hosted, true);
  await until(() => got.host.filter((m) => m.t === 'peer-join').length === 2);
  host.send({ to: a.id, t: 'view', secret: 'X' });
  await until(() => got.a.some((m) => m.t === 'view'));
  await sleep(20);
  assert.ok(!got.b.some((m) => m.t === 'view'), 'b never receives a frame addressed to a');
  assert.ok(!room.log.some((l) => l.to === b.id && l.text.includes('"secret"')), 'not even on the wire');
  a.send({ to: 'host', t: 'richtig' });
  await until(() => got.host.some((m) => m.t === 'richtig' && m.from === a.id));
  a.close();
  await until(() => got.host.some((m) => m.t === 'peer-leave' && m.from === a.id));
});

test('plain relay fallback: no welcome -> routing=false, `to` is filtered client-side, the hostKey is not broadcast', async () => {
  const room = createMemoryRoom({ legacy: true });
  const host = mk(room, 'hosthost0001', { isHost: true });
  const a = mk(room, 'guestaaaaaaa');
  const b = mk(room, 'guestbbbbbbb');
  const got = { host: [], a: [], b: [] };
  host.on('message', (m) => got.host.push(m));
  a.on('message', (m) => got.a.push(m));
  b.on('message', (m) => got.b.push(m));
  for (const n of [host, a, b]) n.connect();
  await until(() => [host, a, b].every((n) => n.status === 'online'));
  assert.equal(a.routing, false);
  host.send({ t: 'host-hello', hostKey: 'hostkey-secret-1' });
  host.send({ to: a.id, t: 'view', n: 1 });
  a.send({ to: 'host', t: 'richtig' });
  await until(() => got.host.some((m) => m.t === 'richtig'));
  await until(() => got.a.some((m) => m.t === 'view'));
  await sleep(20);
  assert.ok(!got.b.some((m) => m.t === 'view'), 'b drops it');
  assert.ok(!got.a.some((m) => m.t === 'richtig'), 'a ignores to=host');
  assert.ok(!room.log.some((l) => l.text.includes('hostkey-secret')), 'the host key never goes over a plain relay');
});

test('reconnect: after a drop the same client id comes back (backoff) and the heartbeat produces a clock estimate', async () => {
  const room = createMemoryRoom();
  const host = mk(room, 'hosthost0001', { isHost: true });
  const a = mk(room, 'guestaaaaaaa');
  host.connect();
  await until(() => host.status === 'online');
  host.send({ t: 'host-hello', hostKey: 'hostkey-secret-1' });
  a.connect();
  await until(() => a.status === 'online');
  await until(() => a.offset() !== null && a.hostAlive, 1500, 'pong');
  assert.ok(Math.abs(a.offset()) < 50);
  const states = [];
  a.on('status', (s) => states.push(s));
  room.drop(a.id);
  await until(() => states.includes('reconnecting') && a.status === 'online', 2000, 'reconnected');
  assert.equal(a.id, 'guestaaaaaaa');
});

test('a silent (black-holed) socket is detected by the heartbeat and replaced', async () => {
  const room = createMemoryRoom();
  const host = mk(room, 'hosthost0001', { isHost: true });
  const a = mk(room, 'guestaaaaaaa');
  host.connect();
  await until(() => host.status === 'online');
  host.send({ t: 'host-hello', hostKey: 'hostkey-secret-1' });
  a.connect();
  await until(() => a.hostAlive, 1500, 'host alive');
  const hostFlags = [];
  a.on('host', (v) => hostFlags.push(v));
  room.blackhole(a.id);
  await until(() => hostFlags.includes(false), 1500, 'host lost');
  await until(() => a.status === 'online' && a.hostAlive, 2500, 'recovered with a fresh socket');
});

test('the 21st device is refused as full', async () => {
  const room = createMemoryRoom();
  const nets = [];
  for (let i = 0; i < 20; i++) {
    const n = mk(room, 'device' + String(i).padStart(6, '0'));
    n.connect();
    nets.push(n);
  }
  await until(() => nets.every((n) => n.status === 'online'));
  const extra = mk(room, 'deviceextra01');
  extra.connect();
  await until(() => extra.status === 'full');
});
