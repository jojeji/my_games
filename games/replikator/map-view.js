// Replikator Akt II - "Galaxie" tab: SVG hex map, sector card, list of the active map bonuses.
// Built once, then only changed attributes/classes/text are written (engine/ui/dom.js setters). Game logic: map.js.
import { h, txt, setCls, setAttr, setHidden } from '../../engine/ui/dom.js';
import { sectionTitle } from '../../engine/ui/kit-views.js';
import { openModal } from '../../engine/ui/modal.js';
import { formatNumber as fmt, formatMult } from '../../engine/format.js';
import { TUNE as T } from './tune.js';
import {
  SECTOR, SECTOR_ORDER, mapCells, mapOf, neighbors, isVisible, canClaim, claim, claimCost, claimedCount, occupiedCount, bonusRows,
  sameNeighbors, previewClaim, tripOf, tripSecs, adjStep,
} from './map.js';

const SVG = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  for (const c of kids) if (c) e.append(c);
  return e;
};

const SIZE = 40; // hex radius in viewBox units: the 5-wide map is ~346 units, 360 px wide phones scale it to ~0.9 (cells ~64 px wide)
const SQ3 = Math.sqrt(3);
const hexPoints = (r) => [0, 1, 2, 3, 4, 5].map((i) => `${(r * Math.cos(Math.PI / 6 + (i * Math.PI) / 3)).toFixed(2)},${(r * Math.sin(Math.PI / 6 + (i * Math.PI) / 3)).toFixed(2)}`).join(' ');

/** Glyphs in a 24x24 box (stroke currentColor, some filled). */
const GLYPH = {
  home: '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>',
  haufen: '<circle cx="8" cy="15" r="2.4" fill="currentColor"/><circle cx="15.5" cy="9" r="2.8" fill="currentColor"/><circle cx="16.5" cy="17" r="1.9" fill="currentColor"/><circle cx="7.5" cy="7.5" r="1.4" fill="currentColor"/>',
  nebel: '<path d="M7 18a4.2 4.2 0 0 1-.4-8.4A5.6 5.6 0 0 1 17.3 8.6 4.8 4.8 0 0 1 17 18z"/>',
  pulsar: '<circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M12 3v4.5M12 16.5V21M3 12h4.5M16.5 12H21M5.7 5.7l3 3M15.3 15.3l3 3M18.3 5.7l-3 3M8.7 15.3l-3 3"/>',
  loch: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.8" fill="currentColor"/>',
  ruine: '<path d="M5 20V9l3-1.5V20M12 20v-7l2.5-1.5L18 13v7M3.5 20h17"/>',
  anomalie: '<path d="M12 3l8 9-8 9-8-9z"/><path d="M12 8v5M12 15.8v.4"/>',
  echo: '<circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="6" stroke-dasharray="2 3"/><circle cx="12" cy="12" r="10" stroke-dasharray="1 4"/>',
};

export function glyphSvg(type, size = 20) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = GLYPH[type] || '';
  return s;
}

const mmss = (sec) => {
  const s = Math.max(0, Math.ceil(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
};
const RING = 2 * Math.PI * 22;

const REASON = {
  inactive: 'Die Karte ist noch nicht freigeschaltet.',
  own: 'Bereits erschlossen.',
  echo: 'Vom Echo besetzt. Dieser Sektor lässt sich nicht erschließen.',
  fog: 'Nur neben eigenem Gebiet erschließbar.',
};

export function buildGalaxyTab(ctx) {
  const g = ctx.g;
  const cells = () => mapCells(g);

  /* ---------------- status ---------------- */
  const statLine = h('p', { class: 'gal-stat' });
  const tripLine = h('p', { class: 'gal-trip', hidden: true });
  const costLine = h('p', { class: 'gal-cost muted small' });
  const echoLine = h('p', { class: 'gal-echo muted small', hidden: true });

  /* ---------------- the SVG map ---------------- */
  const root = el('svg', { class: 'gal-map', role: 'group', 'aria-label': 'Galaxiekarte', preserveAspectRatio: 'xMidYMid meet' });
  const nodes = [];
  const built = { n: 0 };

  function buildMap() {
    const cs = cells();
    built.n = cs.length;
    root.replaceChildren();
    nodes.length = 0;
    const pad = 6;
    const rad = mapOf(g).radius || T.mapRadius;
    const hw = (rad + 0.5) * SQ3 * SIZE + pad;
    const hh = (1.5 * rad + 1) * SIZE + pad;
    root.setAttribute('viewBox', `${-hw} ${-hh} ${2 * hw} ${2 * hh}`);
    cs.forEach((c, i) => {
      const x = SIZE * SQ3 * (c.q + c.r / 2);
      const y = SIZE * 1.5 * c.r;
      const poly = el('polygon', { class: 'gal-hex', points: hexPoints(SIZE - 2.5) });
      const glyph = el('g', { class: 'gal-glyph', transform: 'translate(-13 -15) scale(1.08)' });
      const q = el('text', { class: 'gal-q', x: 0, y: 8, 'text-anchor': 'middle' });
      q.textContent = '?';
      const tag = el('text', { class: 'gal-tag', x: 0, y: 29, 'text-anchor': 'middle' });
      const ring = el('circle', { class: 'gal-ring', r: 22, cx: 0, cy: 0, transform: 'rotate(-90)', 'stroke-dasharray': `0 ${RING}`, visibility: 'hidden' });
      const g1 = el('g', { class: 'gal-cell', transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})`, tabindex: 0, role: 'button' }, poly, glyph, q, tag, ring);
      g1.addEventListener('click', () => openSector(i));
      g1.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openSector(i);
        }
      });
      root.append(g1);
      nodes.push({ g: g1, glyph, q, tag, ring, shown: null, ringOn: false });
    });
  }

  /** Visual state of a cell: own | echo | open (type visible) | fog. */
  function look(i) {
    const cs = cells();
    const c = cs[i];
    if (c.type === 'home' || c.own) return 'own';
    if (c.echo && isVisible(cs, i)) return 'echo';
    if (isVisible(cs, i)) return 'open';
    return 'fog';
  }

  function paint() {
    const cs = cells();
    if (built.n !== cs.length) buildMap();
    const trip = tripOf(g);
    const afford = !trip && g.canAfford('systems', claimCost(g));
    cs.forEach((c, i) => {
      const n = nodes[i];
      const st = look(i);
      const typeKey = st === 'fog' ? 'fog' : st === 'echo' ? 'echo' : c.type;
      const flying = !!trip && trip.i === i;
      const can = st === 'open' && !c.echo && !trip && neighborsOwn(cs, i);
      // the cell the probe flies to: progress ring and remaining time, refreshed every frame
      if (flying) {
        n.ring.setAttribute('stroke-dasharray', `${(RING * (1 - trip.left / trip.dur)).toFixed(1)} ${RING}`);
        txt(n.tag, mmss(trip.left));
      }
      if (n.ringOn !== flying) {
        n.ringOn = flying;
        n.ring.setAttribute('visibility', flying ? 'visible' : 'hidden');
        if (!flying) n.tag.textContent = '';
      }
      const key = st + typeKey + (flying ? 'F' : '') + (can ? (afford ? 'A' : 'N') : '') + (st === 'own' ? sameNeighbors(cs, i) : '');
      if (n.shown === key) return;
      n.shown = key;
      const info = SECTOR[typeKey] || {};
      n.g.style.setProperty('--c', info.color || '#7d8aa3');
      setCls(n.g, 'own', st === 'own');
      setCls(n.g, 'fog', st === 'fog');
      setCls(n.g, 'echo', st === 'echo');
      setCls(n.g, 'can', can && afford);
      setCls(n.g, 'near', can && !afford);
      setCls(n.g, 'trip', flying);
      n.glyph.innerHTML = st === 'fog' ? '' : `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${GLYPH[typeKey] || ''}</g>`;
      n.q.style.display = st === 'fog' ? '' : 'none';
      // small tag under the glyph: the neighbour bonus of an own sector
      const adj = st === 'own' && c.type !== 'home' && SECTOR[c.type].kind ? sameNeighbors(cs, i) : 0;
      if (!flying) n.tag.textContent = adj ? '+'.repeat(adj) : '';
      const label = st === 'fog' ? 'Unbekannter Sektor' : (info.name || '') + (st === 'own' && c.type !== 'home' ? ', erschlossen' : '') + (can ? (afford ? ', erschließbar' : ', zu teuer') : '') + (flying ? ', Erschließung läuft' : '');
      setAttr(n.g, 'aria-label', label);
    });
  }

  const neighborsOwn = (cs, i) => neighbors(cs)[i].some((j) => cs[j].own);

  /* ---------------- sector card ---------------- */
  function openSector(i) {
    const cs = cells();
    const c = cs[i];
    const st = look(i);
    const typeKey = st === 'fog' ? 'fog' : st === 'echo' ? 'echo' : c.type;
    const info = SECTOR[typeKey] || { name: 'Unbekannter Sektor', color: '#7d8aa3', desc: 'Nebel des Unbekannten: Der Typ wird sichtbar, sobald ein Nachbarsektor erschlossen ist.' };
    const rows = [];
    let hint = '';
    const body = h('div', { class: 'sector-card', style: { '--c': info.color } });
    const head = h('div', { class: 'sector-head' }, h('span', { class: 'sector-ico' }, typeKey === 'fog' ? h('b', { text: '?' }) : glyphSvg(typeKey, 30)), h('div', {}, h('b', { class: 'sector-name', text: info.name }), h('div', { class: 'muted small', text: st === 'own' && c.type !== 'home' ? 'erschlossen' : c.type === 'home' ? 'dein Ausgangspunkt' : '' })));
    body.append(head, h('p', { text: info.desc }));
    if (st !== 'fog' && st !== 'echo' && info.kind) {
      const k = SECTOR[c.type];
      const cnt = c.own ? sameNeighbors(cs, i) : Math.min(T.mapAdjMax, neighbors(cs)[i].filter((j) => cs[j].own && cs[j].type === c.type).length);
      const base = T.mapBase[c.type];
      const own = Math.pow(base, 1 + adjStep(g) * cnt);
      rows.push([k.effect, formatMult(own) + (cnt ? ` (Basis ${formatMult(base)})` : ' je Sektor')]);
      rows.push(['Gleichartige Nachbarn', `${cnt} von max. ${T.mapAdjMax}`]);
      if (!c.own) {
        const pv = previewClaim(g, i);
        rows.push(['Gesamt dieses Typs', `${formatMult(pv.before)} → ${formatMult(pv.after)}`]);
      }
      hint = `Jeder erschlossene Nachbar gleichen Typs verstärkt den Effekt: +${Math.round(adjStep(g) * 100)} % auf den Exponenten, höchstens ${T.mapAdjMax} Nachbarn zählen.`;
    }
    if (c.type === 'ruine' && st !== 'fog') rows.push(['Einmalig', 'Ein Eintrag in der Chronik']);
    const cost = claimCost(g);
    const canC = canClaim(g, i);
    const trip = tripOf(g);
    if (st !== 'own' && st !== 'echo' && !(trip && trip.i === i)) {
      rows.push(['Kosten', fmt(cost) + ' Sternsysteme']);
      rows.push(['Du hast', fmt(g.get('systems')) + ' Sternsysteme']);
      if (st !== 'fog') rows.push(['Erschließung dauert', mmss(tripSecs(g))]);
    }
    if (trip && trip.i === i) rows.push(['Erschließung läuft', 'noch ' + mmss(trip.left)]);
    if (rows.length) body.append(h('ul', { class: 'mult-list' }, ...rows.map(([a, b]) => h('li', {}, h('span', { text: a }), h('b', { class: 'num', text: b })))));
    if (hint) body.append(h('p', { class: 'muted small', text: hint }));
    let modal;
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Erschließen' });
    const why = h('p', { class: 'sector-why small' });
    if (st === 'own') {
      /* nothing to do */
    } else {
      btn.addEventListener('click', () => {
        if (claim(g, i)) {
          modal.close();
          paint();
        }
      });
      if (trip && trip.i === i) {
        btn.hidden = true;
      } else if (st === 'fog') {
        btn.disabled = true;
        why.textContent = REASON.fog;
      } else if (!canC.ok) {
        btn.disabled = true;
        why.textContent = canC.reason === 'trip' ? `Eine Erschließung läuft bereits (noch ${mmss(trip.left)}). Die Sonde fliegt nur zu einem Sektor gleichzeitig.` : canC.reason === 'cost' ? `Zu wenig Sternsysteme: es fehlen ${fmt(cost.sub(g.get('systems')))}. Sie bauen sich mit jeder Expansion auf.` : REASON[canC.reason] || '';
      }
      body.append(btn, why);
    }
    modal = openModal({ title: '', body, actions: [{ label: 'Schließen', kind: 'ghost' }] });
  }

  /* ---------------- bonus list ---------------- */
  const bonusBox = h('div', { class: 'gal-bonus card' });
  let bonusKey = '';
  function paintBonuses() {
    const rows = bonusRows(g);
    const key = rows.map((r) => r.type + r.count + r.adj).join('|');
    if (key === bonusKey) return;
    bonusKey = key;
    if (!rows.length) {
      bonusBox.replaceChildren(h('p', { class: 'muted small', text: 'Noch kein Sektor erschlossen. Boni erscheinen hier.' }));
      return;
    }
    bonusBox.replaceChildren(
      ...rows.map((r) => {
        const info = SECTOR[r.type];
        return h('div', { class: 'gal-bonus-row', style: { '--c': info.color } },
          h('span', { class: 'gal-bonus-ico' }, glyphSvg(r.type, 22)),
          h('div', { class: 'gal-bonus-txt' },
            h('b', { text: `${info.name} × ${r.count}` }),
            h('span', { class: 'muted small', text: info.effect + (r.adj ? ` · Nachbarbonus ${r.adj}×` : '') }),
          ),
          h('b', { class: 'num gal-bonus-val', text: formatMult(r.mult) }),
        );
      }),
    );
  }

  /* ---------------- legend ---------------- */
  const legend = h('div', { class: 'gal-legend' },
    ...[...SECTOR_ORDER, 'echo'].map((t) => h('span', { class: 'gal-leg', style: { '--c': SECTOR[t].color } }, glyphSvg(t, 16), SECTOR[t].name)),
  );

  buildMapOnce();
  function buildMapOnce() {
    if (mapCells(g).length) buildMap();
  }

  /* ---------------- Auto-Erkundung switch (also in the generator tab's Automatisierung list) ---------------- */
  const autoInput = h('input', { type: 'checkbox', class: 'switch-input' });
  autoInput.addEventListener('change', () => (g.state.auto.auto_map.on = autoInput.checked));
  const autoRow = h('label', { class: 'row setting card', hidden: true },
    h('span', { class: 'row-main' }, h('b', { text: 'Auto-Erkundung' }), h('small', { class: 'muted', text: 'Startet die nächste Erschließung, sobald die laufende ankommt und du den besten Sektor bezahlen kannst.' })),
    h('span', { class: 'switch' }, autoInput, h('i', { class: 'switch-track' })),
  );
  const autoLocked = h('p', { class: 'muted small center', hidden: true });

  const wrap = h('div', { class: 'gal-wrap' }, root);
  const page = h('div', { class: 'stack' },
    wrap, // the map first: story bubbles rise from the bottom and should not cover it
    h('div', { class: 'card gal-head' }, tripLine, statLine, costLine, echoLine),
    h('p', { class: 'muted small center gal-hint', text: 'Sektor antippen: Typ, Effekt, Kosten und Dauer. Erschließen geht nur neben eigenem Gebiet, immer nur einen Sektor gleichzeitig.' }),
    legend,
    autoRow,
    autoLocked,
    sectionTitle('Aktive Boni'),
    bonusBox,
  );

  return {
    el: page,
    update() {
      paint();
      paintBonuses();
      const n = claimedCount(g);
      const free = mapCells(g).filter((c) => !c.own && !c.echo).length;
      txt(statLine, `Galaxie 1 · ${n} Sektoren erschlossen`);
      const trip = tripOf(g);
      setHidden(tripLine, !trip);
      if (trip) txt(tripLine, `Erschließung läuft: ${SECTOR[mapCells(g)[trip.i].type].name}, noch ${mmss(trip.left)}`);
      txt(costLine, free > 0 ? `Nächster Sektor: ${fmt(claimCost(g))} Sternsysteme (du hast ${fmt(g.get('systems'))})` : 'Alle freien Sektoren sind vergeben.');
      const autoOpen = g.autoUnlocked('auto_map');
      setHidden(autoRow, !autoOpen);
      setHidden(autoLocked, autoOpen);
      if (autoOpen && autoInput.checked !== g.state.auto.auto_map.on) autoInput.checked = g.state.auto.auto_map.on;
      txt(autoLocked, `Auto-Erkundung: ab ${T.mapAutoAt} erschlossenen Sektoren.`);
      const occ = occupiedCount(g);
      setHidden(echoLine, occ === 0 && !mapCells(g).some((c) => c.echo && isVisible(mapCells(g), mapCells(g).indexOf(c))));
      txt(echoLine, occ ? `Das Echo hält ${occ} ${occ === 1 ? 'weiteren Sektor' : 'weitere Sektoren'}. Pro ${T.mapEchoEvery} erschlossene Sektoren besetzt es einen.` : 'Das Echo ist in der Nähe.');
    },
  };
}
