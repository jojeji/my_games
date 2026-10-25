// Local playtest log: compact timeline of key events (prestiges, unlocks, story, challenges, idle gaps, offline sessions).
// Lives in state.plog (part of the save and therefore of the export string). No network, no tracking.
// Event = [seconds of play time, kind, text]. Storage: first HEAD_MAX events + rolling last TAIL_MAX events + aggregated counters.
import { formatNumber } from '../format.js';

export const HEAD_MAX = 200;
export const TAIL_MAX = 300;
export const IDLE_GAP = 300; // seconds of app-open time without any player input

export const createPlog = () => ({ head: [], tail: [], dropped: 0, counts: {}, layers: {}, idle: { n: 0, sec: 0 }, offline: { n: 0, sec: 0 } });

/** Compact clock: 5:07 or 1:05:07. */
export function clock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const hh = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${mm}:${p(ss)}`;
}

const nameOf = (d, id) => (d && (d.name || d.title)) || id;

export const playlogMethods = {
  /** Append an event (kind: short id, text: readable German line). */
  plog(kind, text, t) {
    const pl = this.state.plog;
    if (!pl) return;
    pl.counts[kind] = (pl.counts[kind] || 0) + 1;
    const ev = [Math.round(t ?? this.state.time.played), kind, text];
    if (pl.head.length < HEAD_MAX) pl.head.push(ev);
    else {
      pl.tail.push(ev);
      if (pl.tail.length > TAIL_MAX) {
        pl.tail.shift();
        pl.dropped += 1;
      }
    }
  },

  /** Called from emit(): translate game events into log lines. */
  plogEvent(type, p) {
    if (!this.state.plog) return;
    switch (type) {
      case 'prestige': {
        const l = this.layerById[p.id];
        const ls = this.state.layers[p.id];
        const agg = (this.state.plog.layers[p.id] ||= { n: 0, sec: 0 });
        agg.n += 1;
        agg.sec += ls.lastTime;
        this.plog('prestige', `${l.name} #${ls.count}: +${formatNumber(p.gain)} nach ${clock(ls.lastTime)}`);
        break;
      }
      case 'layer-unlocked': this.plog('unlock', `Freigeschaltet: ${this.layerById[p.id].name}`); break;
      case 'auto-unlocked': this.plog('unlock', `Automatik freigeschaltet: ${nameOf(p.def, p.id)}`); break;
      case 'milestone': this.plog('milestone', `Meilenstein: ${nameOf(p.def, p.id)}`); break;
      case 'story': this.plog('story', `Geschichte: ${p.def.name || p.def.title || (p.def.text ? p.def.text.slice(0, 48) + '…' : (p.def.chapter ? p.def.chapter + ' / ' : '') + p.id)}`); break;
      case 'achievement': this.plog('achievement', `Erfolg: ${nameOf(p.def, p.id)}`); break;
      case 'challenge-done': this.plog('challenge', `Challenge geschafft: ${nameOf(this.chalById[p.id], p.id)}`); break;
      case 'finale': this.plog('finale', 'Finale'); break;
      default:
    }
  },

  /** The player did something (tap, click). Closes an idle gap if one is open. Wired to pointerdown by the runtime. */
  plogInput() {
    const played = this.state.time.played;
    const gap = played - (this._lastInput ?? played);
    if (gap >= IDLE_GAP && this.state.plog) {
      this.state.plog.idle.n += 1;
      this.state.plog.idle.sec += gap;
      this.plog('idle', `Leerlauf: ${clock(gap)} ohne Eingriff`);
    }
    this._lastInput = played;
  },

  /** Offline catch-up of `sec` seconds: not counted as idle time. */
  plogOffline(sec) {
    if (!this.state.plog || !(sec > 0)) return;
    const pl = this.state.plog;
    pl.offline.n += 1;
    pl.offline.sec += sec;
    this.plog('offline', `Offline: ${clock(sec)} berechnet`);
    if (this._lastInput != null) this._lastInput += sec;
  },

  plogEvents() {
    const pl = this.state.plog;
    return pl ? [...pl.head, ...pl.tail] : [];
  },

  /** Compact plain-text summary for pasting into a chat. */
  plogText(maxLines = 150) {
    const s = this.state;
    const pl = s.plog || createPlog();
    const out = [`${this.def.title || this.id} v${this.version} - Spielzeit ${clock(s.time.played)}, davon offline ${clock(s.time.offline)}`];
    const parts = Object.entries(pl.layers).map(([id, a]) => `${this.layerById[id]?.name || id} ${a.n}x (Ø ${clock(a.sec / Math.max(1, a.n))})`);
    if (parts.length) out.push('Prestiges: ' + parts.join(', '));
    out.push(`Leerlauf >5 min: ${pl.idle.n}x (${clock(pl.idle.sec)}), Offline-Sitzungen: ${pl.offline.n}x (${clock(pl.offline.sec)})`);
    const all = this.plogEvents();
    let lines = all.map((e) => `${clock(e[0])} - ${e[2]}`);
    if (lines.length > maxLines) {
      const keep = Math.floor(maxLines / 3);
      lines = [...lines.slice(0, keep), `... ${lines.length - maxLines + 1} Einträge ausgelassen ...`, ...lines.slice(-(maxLines - keep - 1))];
    } else if (pl.dropped) lines.splice(Math.min(HEAD_MAX, lines.length), 0, `... ${pl.dropped} ältere Einträge verworfen ...`);
    return out.concat(lines).join('\n');
  },
};
