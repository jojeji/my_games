// Pure routing helpers of the Psst! room (no Cloudflare imports, so Node tests can use them).
//
// Envelope (JSON text frame):  { to?: "<clientId>" | "host" | "all", t: "<type>", ...payload }
// The room overwrites `from` with the sender's client id. Default target = all other sockets.
// Reserved types (welcome, peer-join, peer-leave, host-gone, error) are created by the room only; client frames with these types are dropped.
// Card secrecy is the client's job: cards are only ever sent with `to` = a concrete client id.

export const MAX_SOCKETS = 20;
export const MAX_BYTES = 16 * 1024;
export const RESERVED_TYPES = new Set(['welcome', 'peer-join', 'peer-leave', 'host-gone', 'error']);
export const CLIENT_ID = /^[A-Za-z0-9]{6,24}$/;
export const HOST_KEY = /^[A-Za-z0-9_-]{8,64}$/;

/** Use the client's proposed id when it looks sane, else make a random one (reconnects keep their id). */
export function normalizeClientId(proposed, random = Math.random) {
  if (typeof proposed === 'string' && CLIENT_ID.test(proposed)) return proposed;
  let s = '';
  while (s.length < 10) s += Math.floor(random() * 36).toString(36);
  return s;
}

const byteLength = (s) => {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c <= 0xdbff ? (i++, 4) : 3;
  }
  return n;
};

/** Parse a raw frame. Returns the envelope object or null (not a string, too big, not JSON, no string `t`, reserved type). */
export function parseEnvelope(raw) {
  if (typeof raw !== 'string' || byteLength(raw) > MAX_BYTES) return null;
  let env;
  try {
    env = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!env || typeof env !== 'object' || Array.isArray(env)) return null;
  if (typeof env.t !== 'string' || !env.t || env.t.length > 40 || RESERVED_TYPES.has(env.t)) return null;
  if (env.to !== undefined && typeof env.to !== 'string') return null;
  return env;
}

const frame = (obj) => JSON.stringify(obj);

/**
 * Decide what to do with one envelope.
 * @param {object} env parsed envelope
 * @param {string} senderId
 * @param {Array<{id:string, host:boolean}>} peers every socket of the room (including the sender)
 * @param {string|null} storedHostKey hostKey of the room (null = nobody hosted yet)
 * @returns {{deliver: Array<{id:string, data:string}>, becomeHost?: {key:string}}}
 */
export function route(env, senderId, peers, storedHostKey = null) {
  const deliver = [];
  const others = peers.filter((p) => p.id !== senderId);
  if (env.t === 'host-hello') {
    if (typeof env.hostKey !== 'string' || !HOST_KEY.test(env.hostKey)) {
      return { deliver: [{ id: senderId, data: frame({ t: 'error', code: 'bad-host-key' }) }] };
    }
    if (storedHostKey && storedHostKey !== env.hostKey) {
      return { deliver: [{ id: senderId, data: frame({ t: 'error', code: 'host-taken' }) }] };
    }
    const data = frame({ t: 'host-hello', from: senderId });
    for (const p of others) deliver.push({ id: p.id, data });
    return { deliver, becomeHost: { key: env.hostKey } };
  }
  const out = frame({ ...env, from: senderId });
  const to = env.to === undefined ? 'all' : env.to;
  if (to === 'all') {
    for (const p of others) deliver.push({ id: p.id, data: out });
  } else if (to === 'host') {
    const host = peers.find((p) => p.host);
    if (!host) deliver.push({ id: senderId, data: frame({ t: 'error', code: 'no-host', ref: env.t }) });
    else if (host.id !== senderId) deliver.push({ id: host.id, data: out });
  } else {
    const p = others.find((q) => q.id === to);
    if (p) deliver.push({ id: p.id, data: out });
  }
  return { deliver };
}

/** Presence notes for the host (peer-join / peer-leave), `id` = the socket that came or went. */
export function presence(kind, id, peers) {
  const host = peers.find((p) => p.host && p.id !== id);
  return host ? [{ id: host.id, data: frame({ t: kind === 'join' ? 'peer-join' : 'peer-leave', from: id }) }] : [];
}

/** When the host socket closes everybody else is told. */
export function hostGone(id, peers) {
  const data = frame({ t: 'host-gone', from: id });
  return peers.filter((p) => p.id !== id).map((p) => ({ id: p.id, data }));
}

export const welcomeFrame = (id, { hosted, hostPresent, count }) => frame({ t: 'welcome', id, v: 2, hosted, hostPresent, count });
export const errorFrame = (code) => frame({ t: 'error', code });
