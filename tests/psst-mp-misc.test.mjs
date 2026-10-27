import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { qrMatrix, qrSvg } from '../games/psst/qr.js';
import { roomUrl } from '../games/psst/mp-ui.js';
import { createStore } from '../games/psst/store.js';

const fp = (url) => createHash('sha1').update(qrMatrix(url).map((r) => r.map((b) => (b ? 1 : 0)).join('')).join('\n')).digest('hex').slice(0, 16);

test('QR code: the join link encodes to the module matrix that was verified by decoding it (jsQR, 6x scale) when the encoder was vendored', () => {
  // If this fails the vendored encoder changed: decode the new code with a reader before updating the fingerprints.
  assert.equal(fp('https://jojeji.github.io/my_games/games/psst/?raum=ABCDE'), '7e3d4ad8dc77ed24');
  assert.equal(fp('https://jojeji.github.io/my_games/games/psst/?raum=Z9X2K'), 'f7799336e1013966');
  const m = qrMatrix('https://jojeji.github.io/my_games/games/psst/?raum=ABCDE');
  assert.equal(m.length, 33); // version 4
  // finder patterns in three corners
  for (const [x, y] of [[0, 0], [26, 0], [0, 26]]) {
    assert.ok(m[y][x] && m[y][x + 6] && m[y + 6][x] && m[y + 6][x + 6] && !m[y + 1][x + 1] && m[y + 3][x + 3]);
  }
  const svg = qrSvg('https://x.y/?raum=ABCDE');
  assert.match(svg, /^<svg[^>]+viewBox="0 0 \d+ \d+"/);
  assert.ok(svg.includes('fill="#fff"') && svg.includes('fill="#000"'));
});

test('the vendored QR encoder keeps its MIT license file', () => {
  const lic = readFileSync(new URL('../games/psst/vendor/LICENSE', import.meta.url), 'utf8');
  assert.match(lic, /MIT/);
  assert.match(lic, /Kazuhiko Arase/);
});

test('roomUrl: join link next to the page, any host, no stale query', () => {
  assert.equal(roomUrl('ABCDE', { href: 'https://jojeji.github.io/my_games/games/psst/?raum=OLD&x=1#frag' }), 'https://jojeji.github.io/my_games/games/psst/?raum=ABCDE');
  assert.equal(roomUrl('ABCDE', { href: 'http://localhost:8765/games/psst/index.html' }), 'http://localhost:8765/games/psst/?raum=ABCDE');
});

test('store keeps the multiplayer host snapshot and name apart from the one-phone game', () => {
  const mem = new Map();
  const storage = { get: (k) => mem.get(k) ?? null, set: (k, v) => mem.set(k, v), remove: (k) => mem.delete(k) };
  const store = createStore(storage);
  assert.equal(store.mpHost(), null);
  store.saveMpHost({ code: 'ABCDE', savedAt: 1 });
  store.saveMpName('Hanna');
  assert.equal(store.mpHost().code, 'ABCDE');
  assert.equal(store.mpName(), 'Hanna');
  assert.equal(store.game(), null);
  store.clearMpHost();
  assert.equal(store.mpHost(), null);
});

test('multiplayer sources use relative paths only and no CDN', () => {
  for (const f of ['net.js', 'client.js', 'host.js', 'views.js', 'mp-ui.js', 'mp-views.js', 'qr.js', 'mp.css', 'index.html']) {
    const t = readFileSync(new URL('../games/psst/' + f, import.meta.url), 'utf8');
    assert.ok(!/(?:src|href)="\//.test(t), f);
    assert.ok(!/cdn\.|unpkg|jsdelivr/.test(t), f + ' loads from a CDN');
  }
});
