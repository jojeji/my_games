// Test harness: a host session and several guest clients talking through an in-memory room.
import { createNet } from '../../games/psst/net.js';
import { createClient } from '../../games/psst/client.js';
import { createHostSession } from '../../games/psst/host.js';
import { createDeck, mulberry32 } from '../../games/psst/logic.js';
import { createMemoryRoom, until, sleep } from './memory-room.mjs';

const ALL = [];
/** Close every net and client created by the harness (call from test.after). */
export function closeAll() {
  while (ALL.length) {
    const x = ALL.pop();
    if (x.stop) x.stop();
    else x.close();
  }
}
export const FAST = { handshakeMs: 40, backoffMs: [10, 20, 40], pingMs: 40, hostLostMs: 250, quietMs: 400, jitter: 0 };
export const WORDS = Array.from({ length: 300 }, (_, i) => ({ id: 'c' + i, w: `Suchwort${String(i).padStart(3, '0')}x`, t: [`Tabuaa${i}x`, `Tabubb${i}x`, `Tabucc${i}x`, `Tabudd${i}x`, `Tabuee${i}x`], d: 1 }));

export function makeHost(room, { code = 'ABCDE', clock = { t: 1_000_000 }, settings = {}, teams, storage = null, hostId = 'hosthost0001', hostKey = 'hostkey-secret-1', options, netClock = false } = {}) {
  const net = createNet({ transport: room.transport(), code, clientId: hostId, isHost: true, opts: FAST, expectTraffic: () => true, ...(netClock ? { now: () => clock.t } : {}) });
  const rng = mulberry32(7);
  const host = createHostSession({
    net, code, hostKey, hostId, now: () => clock.t, rng,
    deckFactory: async () => createDeck(WORDS, { rng }),
    storage,
    settings: { turnSecs: 60, ...settings },
    teams: teams || [{ name: 'Rot', color: '#e8452c' }, { name: 'Blau', color: '#2563eb' }],
    packIds: ['p1'], packLabels: ['Paket 1'], options,
  });
  net.connect();
  ALL.push(net);
  return { net, host, clock };
}

export function makeGuest(room, id, { code = 'ABCDE' } = {}) {
  const net = createNet({ transport: room.transport(), code, clientId: id, opts: FAST });
  const client = createClient({ net, retryMs: 30, probeEveryMs: 15 });
  net.connect();
  ALL.push(net, client);
  return { net, client };
}

/** Host "Hanna"(Rot) + guests Anna(Rot), Ben(Blau), Cleo(Blau) + TV, game started. */
export async function startedGame({ legacy = false, settings = {}, options, tv = true } = {}) {
  const room = createMemoryRoom({ legacy });
  const H = makeHost(room, { settings, options });
  H.host.addSelf('Hanna', 0);
  await until(() => H.net.status === 'online', 1000, 'host online');
  const guests = {};
  for (const [name, team] of [['Anna', 0], ['Ben', 1], ['Cleo', 1]]) {
    const g = makeGuest(room, 'guest' + name.toLowerCase().padEnd(6, '0'));
    await until(() => g.net.status === 'online', 1000, name + ' online');
    g.client.join({ name, team });
    guests[name] = g;
  }
  if (tv) {
    const g = makeGuest(room, 'guesttv000001');
    await until(() => g.net.status === 'online', 1000, 'tv online');
    g.client.join({ kind: 'display' });
    guests.TV = g;
  }
  for (const g of Object.values(guests)) await until(() => g.client.view, 1500, 'first view');
  await H.host.startGame();
  await until(() => Object.values(guests).every((g) => g.client.view.kind === 'game'), 1500, 'game views');
  return { room, ...H, guests };
}

/**
 * Jeder gegen jeden: host "Hanna" + the given guests (default Anna, Ben; pass 'Cleo' too for 4 players) + TV, game started.
 * Turn order = join order, so Hanna explains first, the next player is Wächter, the rest are Rater.
 */
export async function startedFfa({ names = ['Anna', 'Ben'], settings = {}, tv = true } = {}) {
  const room = createMemoryRoom();
  const H = makeHost(room, { settings: { form: 'ffa', ...settings } });
  H.host.addSelf('Hanna', null);
  await until(() => H.net.status === 'online', 1000, 'host online');
  const guests = {};
  for (const name of names) {
    const g = makeGuest(room, 'guest' + name.toLowerCase().padEnd(6, '0'));
    await until(() => g.net.status === 'online', 1000, name + ' online');
    g.client.join({ name });
    guests[name] = g;
  }
  if (tv) {
    const g = makeGuest(room, 'guesttv000001');
    await until(() => g.net.status === 'online', 1000, 'tv online');
    g.client.join({ kind: 'display' });
    guests.TV = g;
  }
  for (const g of Object.values(guests)) await until(() => g.client.view, 1500, 'first view');
  await H.host.startGame();
  await until(() => Object.values(guests).every((g) => g.client.view.kind === 'game'), 1500, 'game views');
  return { room, ...H, guests };
}

export { createMemoryRoom, until, sleep };
