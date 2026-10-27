// Psst! multiplayer transport: WebSocket to the Cloudflare room (workers/psst-room) with auto-reconnect, heartbeat and clock estimation.
// DOM-free apart from optional browser events, so Node tests can drive it with an in-memory transport (tests/helpers/memory-room.mjs).
//
// Envelope: { to?: "<clientId>" | "host" | "all", t: "<type>", ...payload }; the room adds `from`.
// Works against BOTH the routing room (sends a `welcome` frame first, routes `to` itself) and the old broadcast-only relay
// (no welcome: after `handshakeMs` we assume a plain relay, filter `to` ourselves and never send secrets in a host-hello).
//
// Transport interface:  transport.connect(code, clientId, { onOpen(), onMessage(text), onClose(code) }) -> { send(text), close() }

export const ROOM_SERVER = 'wss://psst-room.joeylauterbach.workers.dev';
/** Room codes: 5 characters without look-alikes (no I, L, O, 0, 1). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[A-HJKMNP-Z2-9]{5}$/;

export function makeCode(random = Math.random, length = 5) {
  let s = '';
  for (let i = 0; i < length; i++) s += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return s;
}
/** User input -> code candidate: upper case, spaces/dashes and the characters a code never contains (I, L, O, 0, 1) are dropped. */
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[ILO01]/g, '').slice(0, 5);

export function makeClientId(random = Math.random) {
  let s = '';
  while (s.length < 12) s += Math.floor(random() * 36).toString(36);
  return s;
}

export function createWebSocketTransport({ base = ROOM_SERVER, WS = globalThis.WebSocket } = {}) {
  return {
    connect(code, clientId, h) {
      const ws = new WS(`${base}/room/${code}?cid=${encodeURIComponent(clientId)}`);
      ws.onopen = () => h.onOpen();
      ws.onmessage = (e) => h.onMessage(typeof e.data === 'string' ? e.data : '');
      ws.onclose = (e) => h.onClose(e && e.code);
      ws.onerror = () => {};
      return {
        send: (text) => ws.send(text),
        close: () => {
          try {
            ws.onclose = null;
            ws.close();
          } catch {
            /* ignore */
          }
        },
      };
    },
  };
}

/** Clock offset from ping/pong samples: hostTime ~= localTime + offset. The sample with the smallest round trip wins. */
export function estimateOffset(samples) {
  let best = null;
  for (const s of samples) {
    const rtt = s.t1 - s.t0;
    if (rtt < 0) continue;
    if (!best || rtt < best.rtt) best = { rtt, offset: s.hostNow - (s.t0 + rtt / 2) };
  }
  return best;
}

/** Milliseconds left of a running Zug on this device (view.timer from the host). */
export function remainingMs(timer, { offset = null, receivedAt = 0, now = Date.now() } = {}) {
  if (!timer) return 0;
  if (timer.endsAt == null) return Math.max(0, timer.leftMs);
  if (offset == null) return Math.max(0, timer.leftMs - (now - receivedAt)); // no clock estimate yet: count from the moment the view arrived
  return Math.max(0, timer.endsAt - (now + offset));
}

const HOST_TYPES = new Set(['view', 'info', 'rejected', 'room-closed']); // only the host sends these

const DEFAULTS = {
  handshakeMs: 1500, // wait this long for the room's welcome frame before assuming a plain relay
  backoffMs: [400, 800, 1600, 3200, 6000, 8000],
  pingMs: 4000,
  hostLostMs: 11000, // guests: no sign of the host for this long -> host considered gone
  quietMs: 25000, // host: nothing received for this long while expecting traffic -> reconnect (dead socket)
  jitter: 0.2,
};

export function createNet({ transport, code, clientId, isHost = false, now = () => Date.now(), opts = {}, expectTraffic = () => false, random = Math.random }) {
  const o = { ...DEFAULTS, ...opts };
  const listeners = {};
  const emit = (ev, arg) => (listeners[ev] || []).slice().forEach((fn) => fn(arg));
  let conn = null;
  let gen = 0; // connection generation: events of older sockets are ignored
  let timers = {};
  let attempt = 0;
  let fatal = null;
  let queue = [];
  let samples = [];
  let hostId = null;

  const net = {
    code,
    id: clientId,
    isHost,
    status: 'connecting', // connecting | online | reconnecting | offline | full | closed
    routing: null, // true = routing room, false = plain relay, null = not known yet
    hosted: null,
    hostPresent: null,
    lastRx: 0,
    lastHostSeen: 0,
    hostAlive: false,
    on(ev, fn) {
      (listeners[ev] = listeners[ev] || []).push(fn);
      return () => {
        listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn);
      };
    },
    get hostId() {
      return hostId;
    },
    offset: () => {
      const e = estimateOffset(samples);
      return e ? e.offset : null;
    },
    rtt: () => {
      const e = estimateOffset(samples);
      return e ? e.rtt : null;
    },
    connect,
    /** Send an envelope. Returns false when it could not be sent (offline). During the handshake frames are queued. */
    send(msg) {
      if (!conn) return false;
      const m = { ...msg };
      if (m.t === 'host-hello' && net.routing === false) delete m.hostKey; // never broadcast the secret over a plain relay
      m.from = net.id;
      const text = JSON.stringify(m);
      if (net.status !== 'online') {
        if (queue.length < 50 && net.status === 'connecting') queue.push(text);
        return false;
      }
      try {
        conn.send(text);
        return true;
      } catch {
        return false;
      }
    },
    /** Drop the socket and reconnect now (iOS may keep a dead socket after the screen was locked). */
    reconnectNow() {
      if (fatal || net.status === 'closed') return;
      closeConn();
      attempt = 0;
      setStatus('reconnecting');
      connect();
    },
    close() {
      net.status = 'closed';
      clearTimers();
      closeConn();
      emit('status', 'closed');
    },
  };

  function setStatus(s) {
    if (net.status === s) return;
    net.status = s;
    emit('status', s);
  }
  function clearTimers() {
    for (const k of Object.keys(timers)) clearTimeout(timers[k]);
    timers = {};
  }
  function closeConn() {
    gen++;
    clearTimers();
    queue = [];
    if (conn) {
      const c = conn;
      conn = null;
      try {
        c.close();
      } catch {
        /* ignore */
      }
    }
  }

  function connect() {
    if (fatal || net.status === 'closed') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus('offline');
      return; // the 'online' browser event restarts us
    }
    clearTimers();
    const my = ++gen;
    if (net.status !== 'reconnecting') setStatus('connecting');
    queue = [];
    conn = transport.connect(code, net.id, {
      onOpen() {
        if (my !== gen) return;
        timers.handshake = setTimeout(() => {
          if (my === gen && net.status !== 'online') {
            if (net.routing === null) net.routing = false; // no welcome: plain relay
            ready();
          }
        }, o.handshakeMs);
      },
      onMessage(text) {
        if (my === gen) receive(text);
      },
      onClose(codeNum) {
        if (my !== gen) return;
        conn = null;
        gen++;
        clearTimers();
        if (codeNum === 4001) {
          fatal = 'full';
          setStatus('full');
          return;
        }
        scheduleReconnect();
      },
    });
  }

  function scheduleReconnect() {
    if (fatal || net.status === 'closed') return;
    if (net.status !== 'offline') setStatus('reconnecting');
    const base = o.backoffMs[Math.min(attempt, o.backoffMs.length - 1)];
    attempt++;
    const wait = base * (1 + (random() * 2 - 1) * o.jitter);
    timers.retry = setTimeout(connect, wait);
  }

  function ready() {
    attempt = 0;
    setStatus('online');
    net.lastRx = now();
    const q = queue;
    queue = [];
    for (const t of q) {
      try {
        conn.send(t);
      } catch {
        /* ignore */
      }
    }
    emit('ready', { routing: net.routing, hosted: net.hosted, hostPresent: net.hostPresent });
    startHeartbeat();
  }

  function startHeartbeat() {
    clearTimeout(timers.beat);
    const my = gen;
    const beat = () => {
      if (my !== gen || net.status !== 'online') return;
      const t = now();
      if (!isHost) {
        net.send({ to: 'host', t: 'ping', ts: t });
        if (net.lastHostSeen && t - net.lastHostSeen > o.hostLostMs) {
          if (net.hostAlive) {
            net.hostAlive = false;
            emit('host', false);
            // rule out a dead socket once per loss episode
            net.reconnectNow();
            return;
          }
        }
      } else if (expectTraffic() && t - net.lastRx > o.quietMs) {
        net.reconnectNow();
        return;
      }
      timers.beat = setTimeout(beat, o.pingMs);
    };
    timers.beat = setTimeout(beat, isHost ? o.pingMs : 0);
  }

  function hostSeen(from) {
    if (from) hostId = from;
    net.lastHostSeen = now();
    if (!net.hostAlive) {
      net.hostAlive = true;
      emit('host', true);
    }
  }

  function receive(text) {
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    net.lastRx = now();
    if (msg.t === 'welcome') {
      net.routing = true;
      net.hosted = !!msg.hosted;
      net.hostPresent = !!msg.hostPresent;
      if (typeof msg.id === 'string' && msg.id) net.id = msg.id;
      if (net.status !== 'online') {
        clearTimeout(timers.handshake);
        ready();
      }
      return;
    }
    if (msg.t === 'error') {
      if (msg.code === 'no-host' && !isHost) {
        net.hostPresent = false;
        if (net.hostAlive) {
          net.hostAlive = false;
          emit('host', false);
        }
      }
      emit('error', msg);
      return;
    }
    if (msg.from === net.id) return;
    // plain relay fallback: everything arrives everywhere, so filter by the target ourselves
    if (msg.to && msg.to !== 'all') {
      if (msg.to === 'host') {
        if (!isHost) return;
      } else if (msg.to !== net.id) return;
    }
    if (msg.t === 'host-hello' && !isHost) {
      hostSeen(msg.from);
      emit('message', msg);
      return;
    }
    if (msg.t === 'host-gone') {
      if (!isHost && net.hostAlive) {
        net.hostAlive = false;
        emit('host', false);
      }
      emit('message', msg);
      return;
    }
    if (msg.t === 'ping' && isHost) {
      net.send({ to: msg.from, t: 'pong', ts: msg.ts, hn: now() });
      emit('message', msg);
      return;
    }
    if (msg.t === 'pong' && !isHost) {
      const t1 = now();
      if (typeof msg.ts === 'number' && typeof msg.hn === 'number') {
        samples.push({ t0: msg.ts, t1, hostNow: msg.hn });
        if (samples.length > 8) samples.shift();
      }
      hostSeen(msg.from);
      return;
    }
    if (!isHost && (HOST_TYPES.has(msg.t) || (hostId && msg.from === hostId))) hostSeen(msg.from);
    emit('message', msg);
  }

  // browser lifecycle: come back fast after a screen lock or lost network
  if (typeof window !== 'undefined' && window.addEventListener) {
    const wake = () => {
      if (document.visibilityState === 'hidden' || fatal || net.status === 'closed') return;
      if (net.status !== 'online' || isHost) net.reconnectNow();
      else {
        // back from a locked screen: the socket may look open but be dead -> if the host does not answer quickly, take a fresh socket
        const t = now();
        net.send({ to: 'host', t: 'ping', ts: t });
        setTimeout(() => {
          if (net.status === 'online' && net.lastHostSeen < t && net.lastRx < t) net.reconnectNow();
        }, 2500);
      }
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', () => net.reconnectNow());
    window.addEventListener('offline', () => setStatus('offline'));
  }

  return net;
}
