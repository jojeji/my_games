import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnvelope, route, presence, hostGone, normalizeClientId, MAX_BYTES, MAX_SOCKETS } from '../workers/psst-room/src/routing.js';

const peers = [
  { id: 'hostaaaaaa', host: true },
  { id: 'guestbbbbbb', host: false },
  { id: 'guestcccccc', host: false },
];
const ids = (res) => res.deliver.map((d) => d.id).sort();
const body = (res, i = 0) => JSON.parse(res.deliver[i].data);

test('parseEnvelope: only JSON objects with a string type, within 16 KB, never reserved room types', () => {
  assert.equal(parseEnvelope('nope'), null);
  assert.equal(parseEnvelope('[1]'), null);
  assert.equal(parseEnvelope('{"x":1}'), null);
  assert.equal(parseEnvelope(JSON.stringify({ t: 'x', to: 5 })), null);
  assert.equal(parseEnvelope(JSON.stringify({ t: 'peer-leave', from: 'hostaaaaaa' })), null);
  assert.equal(parseEnvelope(JSON.stringify({ t: 'welcome' })), null);
  assert.equal(parseEnvelope(new ArrayBuffer(4)), null);
  assert.ok(parseEnvelope(JSON.stringify({ t: 'view', to: 'x' })));
  assert.equal(parseEnvelope(JSON.stringify({ t: 'x', pad: 'a'.repeat(MAX_BYTES) })), null);
  // multi-byte characters count as bytes
  assert.equal(parseEnvelope(JSON.stringify({ t: 'x', pad: 'ä'.repeat(MAX_BYTES / 2) })), null);
  assert.equal(MAX_SOCKETS, 20);
});

test('route: default = everybody else, to=id = exactly that socket, to=host = the host, from is overwritten', () => {
  let r = route({ t: 'a', from: 'forged' }, 'guestbbbbbb', peers);
  assert.deepEqual(ids(r), ['guestcccccc', 'hostaaaaaa']);
  assert.equal(body(r).from, 'guestbbbbbb');
  r = route({ t: 'view', to: 'guestcccccc', card: 'GEHEIM' }, 'hostaaaaaa', peers);
  assert.deepEqual(ids(r), ['guestcccccc']);
  r = route({ t: 'richtig', to: 'host' }, 'guestbbbbbb', peers);
  assert.deepEqual(ids(r), ['hostaaaaaa']);
  r = route({ t: 'a', to: 'nobody123' }, 'guestbbbbbb', peers);
  assert.deepEqual(r.deliver, []);
  r = route({ t: 'a', to: 'all' }, 'hostaaaaaa', peers);
  assert.deepEqual(ids(r), ['guestbbbbbb', 'guestcccccc']);
});

test('route: a targeted card frame never reaches a third socket', () => {
  for (const sender of ['hostaaaaaa']) {
    const r = route({ t: 'view', to: 'guestbbbbbb', view: { card: { w: 'Geheim' } } }, sender, peers);
    assert.equal(r.deliver.length, 1);
    assert.equal(r.deliver[0].id, 'guestbbbbbb');
  }
});

test('route: to=host without a host answers the sender with an error', () => {
  const r = route({ t: 'ping', to: 'host' }, 'guestbbbbbb', peers.map((p) => ({ ...p, host: false })));
  assert.deepEqual(ids(r), ['guestbbbbbb']);
  assert.equal(body(r).code, 'no-host');
});

test('host-hello: first one becomes host, the same hostKey takes over again, another key is refused, the key is never forwarded', () => {
  const key = 'secret-key-1234';
  let r = route({ t: 'host-hello', hostKey: key }, 'hostaaaaaa', peers.map((p) => ({ ...p, host: false })), null);
  assert.deepEqual(r.becomeHost, { key });
  assert.ok(r.deliver.every((d) => !d.data.includes(key)));
  assert.deepEqual(ids(r), ['guestbbbbbb', 'guestcccccc']);
  r = route({ t: 'host-hello', hostKey: key }, 'newhostaaaa', peers, key);
  assert.deepEqual(r.becomeHost, { key });
  r = route({ t: 'host-hello', hostKey: 'another-key-999' }, 'guestbbbbbb', peers, key);
  assert.equal(r.becomeHost, undefined);
  assert.equal(body(r).code, 'host-taken');
  r = route({ t: 'host-hello', hostKey: 'x' }, 'guestbbbbbb', peers, null);
  assert.equal(body(r).code, 'bad-host-key');
});

test('presence: join/leave go to the host only; host-gone to all others', () => {
  let r = presence('join', 'guestbbbbbb', peers);
  assert.deepEqual(ids({ deliver: r }), ['hostaaaaaa']);
  assert.equal(JSON.parse(r[0].data).t, 'peer-join');
  assert.equal(JSON.parse(r[0].data).from, 'guestbbbbbb');
  r = presence('leave', 'guestbbbbbb', peers);
  assert.equal(JSON.parse(r[0].data).t, 'peer-leave');
  assert.deepEqual(presence('join', 'hostaaaaaa', peers), []); // the host itself joining is no news for itself
  assert.deepEqual(ids({ deliver: hostGone('hostaaaaaa', peers) }), ['guestbbbbbb', 'guestcccccc']);
});

test('normalizeClientId keeps sane proposals and replaces junk', () => {
  assert.equal(normalizeClientId('abcDEF123456'), 'abcDEF123456');
  assert.match(normalizeClientId('bad id!'), /^[a-z0-9]{10}$/);
  assert.match(normalizeClientId(undefined), /^[a-z0-9]{10}$/);
});
