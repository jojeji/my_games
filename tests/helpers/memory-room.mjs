// In-memory stand-in for the psst-room worker: same pure routing code as the real worker, no network.
// `legacy: true` behaves like the first relay-only deployment (plain broadcast, no welcome frame).
import { MAX_SOCKETS, normalizeClientId, parseEnvelope, route, presence, hostGone, welcomeFrame, errorFrame } from '../../workers/psst-room/src/routing.js';

export function createMemoryRoom({ legacy = false, delay = 0 } = {}) {
  const socks = new Set(); // {id, host, deliver(text), closeWith(code), dead}
  let hostKey = null;
  const later = (fn) => (delay ? setTimeout(fn, delay) : setImmediate(fn));
  const peers = () => [...socks].filter((s) => !s.replaced).map((s) => ({ id: s.id, host: s.host, s }));
  const push = (list) => {
    for (const d of list) {
      const p = peers().find((q) => q.id === d.id);
      if (p && !p.s.dead) later(() => p.s.deliver(d.data));
    }
  };

  const room = {
    log: [], // every frame that reached a socket: {to, text}
    get sockets() {
      return peers().length;
    },
    /** Simulate a network drop for one client (the server notices a bit later or at once). */
    drop(id, code = 1006) {
      for (const s of socks) if (s.id === id && !s.replaced) room.kill(s, code);
    },
    kill(s, code = 1006) {
      if (!socks.has(s)) return;
      socks.delete(s);
      const was = peers();
      later(() => s.closeWith(code));
      if (!legacy && !s.replaced) {
        push(presence('leave', s.id, [...was, { id: s.id, host: false }]));
        if (s.host) push(hostGone(s.id, was));
      }
    },
    /** Socket goes silent but stays "connected" (iOS after screen lock): frames are lost both ways. */
    blackhole(id) {
      for (const s of socks) if (s.id === id) s.dead = true;
    },
    transport() {
      return {
        connect(code, cid, h) {
          const s = {
            id: legacy ? cid : normalizeClientId(cid),
            host: false,
            dead: false,
            replaced: false,
            deliver: (text) => {
              room.log.push({ to: s.id, text });
              h.onMessage(text);
            },
            closeWith: (c) => h.onClose(c),
          };
          later(() => {
            if (!legacy) {
              for (const old of [...socks].filter((x) => x.id === s.id)) {
                old.replaced = true;
                socks.delete(old);
                later(() => old.closeWith(4002));
              }
              if (peers().length >= MAX_SOCKETS) {
                socks.add(s);
                s.replaced = true;
                h.onOpen();
                later(() => s.deliver(errorFrame('full')));
                later(() => s.closeWith(4001));
                return;
              }
            }
            socks.add(s);
            h.onOpen();
            if (!legacy) {
              later(() => s.deliver(welcomeFrame(s.id, { hosted: !!hostKey, hostPresent: peers().some((p) => p.host), count: peers().length })));
              push(presence('join', s.id, peers()));
            }
          });
          return {
            send(text) {
              if (s.dead || !socks.has(s)) return;
              later(() => {
                if (s.dead || !socks.has(s)) return;
                if (legacy) {
                  for (const o of socks) if (o !== s && !o.dead) later(() => o.deliver(text));
                  return;
                }
                const env = parseEnvelope(text);
                if (!env) return;
                const res = route(env, s.id, peers(), env.t === 'host-hello' ? hostKey : null);
                if (res.becomeHost) {
                  for (const o of socks) o.host = false;
                  s.host = true;
                  hostKey = res.becomeHost.key;
                }
                push(res.deliver);
              });
            },
            close() {
              room.kill(s, 1000);
            },
          };
        },
      };
    },
  };
  return room;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Poll until fn() is truthy (or throw after `ms`). */
export async function until(fn, ms = 1500, what = 'condition') {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('timeout waiting for ' + what);
    await sleep(2);
  }
}
