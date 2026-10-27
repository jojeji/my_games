// Psst! multiplayer: a guest device (Spieler or Anzeige). Joins the host's room, keeps the latest VIEW pushed by the host and sends intents.
// DOM-free. `createLocalSession(host)` gives the host's own screen the same interface.
import { remainingMs } from './net.js';

const err = (code) => Object.assign(new Error(code), { code });

export function createClient({ net, now = () => Date.now(), retryMs = 1500, probeEveryMs = 700 }) {
  const st = { stage: 'idle', view: null, viewAt: 0, epoch: -1, seq: -1, reason: null };
  let joinArgs = null;
  let joinTimer = null;
  const listeners = new Set();
  const update = () => listeners.forEach((fn) => fn(client));

  function sendJoin() {
    if (joinArgs) net.send({ to: 'host', t: 'join', ...joinArgs });
  }
  function startJoinLoop() {
    clearInterval(joinTimer);
    joinTimer = setInterval(() => {
      if (!joinArgs || st.stage === 'joined') return;
      sendJoin();
    }, retryMs);
  }

  net.on('ready', () => {
    sendJoin();
    if (st.stage === 'joined') net.send({ to: 'host', t: 'resync' });
    update();
  });
  net.on('status', update);
  net.on('host', (alive) => {
    if (alive && joinArgs && st.stage === 'joined') net.send({ to: 'host', t: 'resync' });
    update();
  });
  net.on('message', (m) => {
    switch (m.t) {
      case 'host-hello':
        sendJoin(); // the host (re)started: say hello again
        break;
      case 'view':
        if (!joinArgs || !m.view) break;
        if (m.epoch > st.epoch || (m.epoch === st.epoch && m.seq > st.seq)) {
          st.epoch = m.epoch;
          st.seq = m.seq;
          st.view = m.view;
          st.viewAt = now();
          st.stage = m.view.kind === 'closed' ? 'closed' : 'joined';
          update();
        }
        break;
      case 'rejected':
        st.stage = 'rejected';
        st.reason = m.reason;
        joinArgs = null;
        clearInterval(joinTimer);
        update();
        break;
      case 'room-closed':
        st.stage = 'closed';
        st.view = null;
        joinArgs = null;
        clearInterval(joinTimer);
        update();
        break;
      default:
    }
  });
  net.on('error', update);

  const client = {
    isHost: false,
    net,
    st,
    get view() {
      return st.view;
    },
    onUpdate(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Ask the host about the room (teams, running?). Rejects with code not-found | no-host | full. */
    probe({ timeout = 6000 } = {}) {
      return new Promise((resolve, reject) => {
        const t0 = now();
        let iv = null;
        const finish = (fn, arg) => {
          clearInterval(iv);
          off();
          fn(arg);
        };
        const off = net.on('message', (m) => m.t === 'info' && finish(resolve, m));
        const attempt = () => {
          if (net.status === 'full') return finish(reject, err('full'));
          if (net.status === 'online') {
            if (net.routing && net.hosted === false) return finish(reject, err('not-found'));
            net.send({ to: 'host', t: 'info' });
          }
          if (now() - t0 > timeout) finish(reject, err(net.routing && net.hosted && net.hostPresent === false ? 'no-host' : net.status === 'online' ? 'not-found' : 'offline'));
        };
        iv = setInterval(attempt, probeEveryMs);
        attempt();
      });
    },
    /** @param {{name?:string, team?:number|'random'|null, kind?:'player'|'display'}} args */
    join(args) {
      joinArgs = { name: args.name || '', team: args.team ?? null, kind: args.kind === 'display' ? 'display' : 'player' };
      st.stage = 'joining';
      st.reason = null;
      sendJoin();
      startJoinLoop();
      update();
    },
    leave() {
      net.send({ to: 'host', t: 'leave' });
      joinArgs = null;
      clearInterval(joinTimer);
      st.stage = 'idle';
      st.view = null;
      net.close();
    },
    act(t, extra = {}) {
      return net.send({ to: 'host', t, ...extra });
    },
    remaining: () => remainingMs(st.view && st.view.timer, { offset: net.offset(), receivedAt: st.viewAt, now: now() }),
    /** 'ok' | 'connecting' | 'waiting-host' | 'reconnecting' | 'offline' | 'full' */
    connection() {
      if (net.status === 'full') return 'full';
      if (net.status === 'offline') return 'offline';
      if (net.status === 'connecting') return 'connecting';
      if (net.status !== 'online') return 'reconnecting';
      if (!net.hostAlive) return 'waiting-host';
      return 'ok';
    },
    stop() {
      clearInterval(joinTimer);
    },
  };
  return client;
}

/** The host's own screen: same shape as a client, but views are computed in-process and intents go straight to the host. */
export function createLocalSession(host, now = () => Date.now()) {
  const net = host.net;
  return {
    isHost: true,
    host,
    get view() {
      return host.viewFor(host.id);
    },
    act: (t, extra = {}) => host.intent(t, extra),
    remaining() {
      const v = host.viewFor(host.id);
      return remainingMs(v && v.timer, { offset: 0, receivedAt: now(), now: now() });
    },
    connection() {
      if (net.status === 'online') return 'ok';
      if (net.status === 'connecting') return 'connecting';
      return net.status === 'offline' ? 'offline' : 'reconnecting';
    },
    onUpdate: () => () => {},
  };
}
