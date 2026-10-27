// Psst! multiplayer room: every device of a game connects by WebSocket to /room/<code>; the Room relays each
// message to all other devices. Game logic stays on the host device. Minimal first version (relay only).
import { DurableObject } from 'cloudflare:workers';

const ALLOWED_ORIGINS = ['https://jojeji.github.io', 'http://localhost:8765'];
const CODE = /^[A-Z0-9]{4,8}$/;

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

export class Room extends DurableObject {
  async fetch() {
    const pair = new WebSocketPair();
    // hibernation API: the room sleeps between messages and costs nothing while idle
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > 16384) return;
    for (const peer of this.ctx.getWebSockets()) {
      if (peer !== ws) {
        try {
          peer.send(message);
        } catch {
          /* peer already gone */
        }
      }
    }
  }

  async webSocketClose(ws, code) {
    try {
      ws.close(code === 1005 ? 1000 : code, 'bye');
    } catch {
      /* already closed */
    }
  }
}
