// Psst! multiplayer room: every device of a game connects by WebSocket to /room/<code>[?cid=<clientId>].
// The Room routes envelopes ({to?, t, ...}) between the devices (see routing.js); the game logic stays on the host device.
// Hibernation API: the room sleeps between messages and costs nothing while idle (per-socket data lives in the attachment).
import { DurableObject } from 'cloudflare:workers';
import { MAX_SOCKETS, normalizeClientId, parseEnvelope, route, presence, hostGone, welcomeFrame, errorFrame } from './routing.js';

const ALLOWED_ORIGINS = ['https://jojeji.github.io', 'http://localhost:8765'];
const CODE = /^[A-Z0-9]{4,8}$/;
const ROOM_TTL_MS = 24 * 3600 * 1000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/health') return new Response('psst-room ok');
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9]+)$/);
    if (!m || !CODE.test(m[1].toUpperCase())) return new Response('not found', { status: 404 });
    const origin = request.headers.get('Origin');
    if (origin && !ALLOWED_ORIGINS.includes(origin)) return new Response('forbidden', { status: 403 });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const room = env.ROOMS.get(env.ROOMS.idFromName(m[1].toUpperCase()));
    return room.fetch(request);
  },
};

const safeSend = (ws, data) => {
  try {
    ws.send(data);
  } catch {
    /* peer already gone */
  }
};

export class Room extends DurableObject {
  /** Every live socket as {id, host, ws} (the attachment survives hibernation). */
  peers() {
    return this.ctx.getWebSockets().map((ws) => ({ ...(ws.deserializeAttachment() || {}), ws })).filter((p) => p.id && !p.replaced);
  }

  deliver(list, peers) {
    for (const d of list) {
      const p = peers.find((q) => q.id === d.id);
      if (p) safeSend(p.ws, d.data);
    }
  }

  async fetch(request) {
    const id = normalizeClientId(new URL(request.url).searchParams.get('cid'));
    const pair = new WebSocketPair();
    let peers = this.peers();
    // the same client reconnecting: the old socket (probably half dead) is replaced silently
    for (const old of peers.filter((p) => p.id === id)) {
      old.ws.serializeAttachment({ id, host: false, replaced: true });
      try {
        old.ws.close(4002, 'replaced');
      } catch {
        /* already closed */
      }
    }
    peers = peers.filter((p) => p.id !== id);
    const hosted = !!(await this.ctx.storage.get('hostKey'));
    this.ctx.acceptWebSocket(pair[1]);
    if (peers.length >= MAX_SOCKETS) {
      pair[1].serializeAttachment({ id, host: false, replaced: true });
      safeSend(pair[1], errorFrame('full'));
      pair[1].close(4001, 'full');
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    // a reconnecting host keeps its role only by sending host-hello again (with its secret)
    pair[1].serializeAttachment({ id, host: false });
    const all = [...peers, { id, host: false, ws: pair[1] }];
    safeSend(pair[1], welcomeFrame(id, { hosted, hostPresent: peers.some((p) => p.host), count: all.length }));
    this.deliver(presence('join', id, all), all);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws, message) {
    const me = ws.deserializeAttachment();
    if (!me || !me.id || me.replaced) return;
    const env = parseEnvelope(message);
    if (!env) return;
    const peers = this.peers();
    const key = env.t === 'host-hello' ? (await this.ctx.storage.get('hostKey')) || null : null;
    const res = route(env, me.id, peers, key);
    if (res.becomeHost) {
      for (const p of peers) if (p.host && p.id !== me.id) p.ws.serializeAttachment({ id: p.id, host: false });
      ws.serializeAttachment({ id: me.id, host: true });
      await this.ctx.storage.put('hostKey', res.becomeHost.key);
      await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
    }
    this.deliver(res.deliver, peers);
  }

  async webSocketClose(ws, code) {
    this.gone(ws);
    try {
      ws.close(code === 1005 ? 1000 : code, 'bye');
    } catch {
      /* already closed */
    }
  }

  async webSocketError(ws) {
    this.gone(ws);
  }

  gone(ws) {
    const me = ws.deserializeAttachment();
    if (!me || !me.id || me.replaced) return;
    const peers = this.peers().filter((p) => p.ws !== ws);
    this.deliver(presence('leave', me.id, [...peers, { id: me.id, host: false }]), peers);
    if (me.host) this.deliver(hostGone(me.id, peers), peers);
  }

  /** Rooms expire a day after the host last said hello (empty rooms only). */
  async alarm() {
    if (this.ctx.getWebSockets().length) await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
    else await this.ctx.storage.deleteAll();
  }
}
