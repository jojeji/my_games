// Full-screen layer view: stock, rate / next goal, upgrade cards in two columns, milestones, challenges, autos, respec,
// and a sticky single-line prestige button at the bottom (thumb zone).
import { h, txt, setCls, setDisabled, setHidden } from '../../engine/ui/dom.js';
import { confirmDialog, openModal } from '../../engine/ui/modal.js';
import { progressBar, autoSwitch, autoConfigRow, doPrestige } from '../../engine/ui/kit-views.js';
import { formatNumber as fmt, formatDuration, formatPercent } from '../../engine/format.js';
import { nodeById } from './nodes.js';
import { nParts, hGainParts, zRate, rainCast, rainCharges, rainNextIn, rainMult, ripeness, fRipeness } from './def.js';
import { TUNE as T } from './tune.js';

const UNIT = { s: 'Spore', m: 'Einheit' };
const cname = (g, id) => g.currencyById[id].name;
const PRESTIGE_VERB = { h: 'Ausbreiten', s: 'Freisetzen', m: 'Verdichten', f: 'Fruchten' };

/** "Alles kaufen" for the player: cheapest first, never a side of an exclusive pair (that is a choice). */
export function buyAllPlain(g, node) {
  let n = 0;
  for (let guard = 0; guard < 100; guard++) {
    let best = null;
    let bc = null;
    for (const u of g.def.upgrades) {
      if (u.node !== node || u.excl || !g.upgCanBuy(u.id)) continue;
      const c = g.upgCost(u.id);
      if (!best || c.lt(bc)) {
        best = u;
        bc = c;
      }
    }
    if (!best) break;
    g.upgBuy(best.id);
    n++;
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* building blocks                                                      */
/* ------------------------------------------------------------------ */

function upgradeCard(ctx, id) {
  const { g } = ctx;
  const u = g.upgById[id];
  const name = h('b', { class: 'uc-name', text: u.name });
  const tag = h('small', { class: 'uc-tag', text: 'Entweder / oder', hidden: !u.excl });
  const desc = h('p', { class: 'uc-desc', text: u.desc });
  const cur = h('p', { class: 'uc-cur' });
  const note = h('p', { class: 'uc-note' });
  const buy = h('button', { class: 'btn btn-buy uc-buy', type: 'button', onClick: () => g.upgBuy(id) });
  const again = h('button', { class: 'btn btn-ghost uc-again', type: 'button', text: 'Umwählen', onClick: () => g.upgRechoose(id) });
  const el = h('div', { class: 'uc' }, h('div', { class: 'uc-head' }, name, tag), desc, cur, note, buy, again);
  return {
    el,
    update() {
      const level = g.upgLevel(id);
      const owned = level > 0;
      const excluded = g.upgExcluded(u);
      const reqOk = g.upgRequirementsMet(u);
      const disabled = g.upgDisabled(u);
      txt(cur, owned ? 'Aktuell ' + u.fmt(g.upgEffect(id), level, g) : 'Dann ' + u.fmt(u.effect(1, g), 1, g));
      setCls(cur, 'is-owned', owned);
      let n = '';
      if (!owned && excluded) n = 'Gesperrt: der andere Weg ist gewählt.';
      else if (!owned && !reqOk) n = 'Benötigt: ' + (u.requires || []).map((r) => g.upgById[r].name).join(', ');
      else if (disabled) n = 'Ruht in dieser Challenge.';
      txt(note, n);
      setHidden(note, !n);
      setCls(el, 'owned', owned);
      setCls(el, 'locked', !owned && (excluded || !reqOk));
      setCls(el, 'off', disabled);
      setHidden(buy, owned);
      if (!owned) {
        txt(buy, `${fmt(g.upgCost(id))} ${cname(g, u.currency)}`);
        setDisabled(buy, !g.upgCanBuy(id));
      }
      setHidden(again, !g.upgCanRechoose(id));
    },
  };
}

function upgradeGrid(ctx, node, title, hint) {
  const { g } = ctx;
  const cards = g.def.upgrades.filter((u) => u.node === node).map((u) => upgradeCard(ctx, u.id));
  const all = h('button', { class: 'btn btn-ghost lv-all', type: 'button', text: 'Alles kaufen', onClick: () => buyAllPlain(g, node) });
  const el = h('section', { class: 'lv-sec' },
    h('div', { class: 'lv-sec-head' }, h('h3', { class: 'section-title', text: title }), all),
    hint ? h('p', { class: 'muted small', text: hint }) : null,
    h('div', { class: 'ugrid' }, ...cards.map((c) => c.el)));
  return {
    el,
    update() {
      cards.forEach((c) => c.update());
      setDisabled(all, !g.def.upgrades.some((u) => u.node === node && !u.excl && g.upgCanBuy(u.id)));
    },
  };
}

function milestoneBlock(ctx, layerId) {
  const { g } = ctx;
  const items = g.def.milestones.filter((m) => m.layer === layerId).map((m) => ({ m, li: h('li', { class: 'ms' }, h('i', { class: 'ms-mark' }), h('div', {}, h('b', { text: m.name }), h('small', { text: m.desc }))) }));
  if (!items.length) return null;
  const el = h('section', { class: 'lv-sec' }, h('h3', { class: 'section-title', text: 'Meilensteine' }), h('ul', { class: 'card ms-list' }, ...items.map((i) => i.li)));
  return { el, update: () => items.forEach(({ m, li }) => setCls(li, 'done', g.hasMs(m.id))) };
}

/** Text lines + progress for the prestige of a layer (what is the next goal). */
function prestigeInfo(ctx, layerId) {
  const { g } = ctx;
  const l = g.layerById[layerId];
  const blurb = h('p', { class: 'muted', text: l.blurb });
  const next = h('p', { class: 'p-next' });
  const bar = progressBar();
  const stats = h('p', { class: 'muted small' });
  const el = h('div', { class: 'card prestige' }, blurb, next, bar.el, stats);
  return {
    el,
    update() {
      const ls = g.state.layers[layerId];
      const gain = g.prestigeGain(layerId);
      const basis = g.prestigeBasis(layerId);
      const basisName = l.static || layerId === 'f' ? (layerId === 'f' ? 'Hyphen' : 'Nährstoffe (gesamt)') : 'Nährstoffe';
      if (l.available && l.unavailableText && !l.available(g)) {
        txt(next, l.unavailableText);
        bar.set(0);
      } else if (l.static) {
        const cost = g.prestigeBasisFor(layerId, gain.gte(1) ? gain.add(1) : 1);
        txt(next, `${gain.gte(1) ? 'Danach' : 'Nächste'} ${UNIT[layerId] || 'Einheit'} bei ${fmt(cost)} ${basisName} (jetzt ${fmt(basis)})`);
        bar.set(Math.min(1, basis.div(cost).toNumber()));
      } else {
        const target = g.prestigeBasisFor(layerId, gain.add(1));
        txt(next, gain.gte(1) ? `Nächster Punkt bei ${fmt(target)} ${basisName} (jetzt ${fmt(basis)})` : `Benötigt ${fmt(g.prestigeBasisFor(layerId, 1))} ${basisName} (jetzt ${fmt(basis)})`);
        const lo = gain.gte(1) ? g.prestigeBasisFor(layerId, gain).log10() : 0;
        const hi = target.log10();
        bar.set(hi > lo ? (Math.max(basis.log10(), 0) - lo) / (hi - lo) : 0);
      }
      txt(stats, ls.count ? `Durchläufe: ${ls.count} · Letzter Gewinn: +${fmt(ls.lastGain)} nach ${formatDuration(ls.lastTime)}` : layerId === 'h' ? `Aktueller Lauf: ${formatDuration(ls.runTime)} · Reife ${formatPercent(ripeness(g), 0)}` : layerId === 'f' ? `Aktueller Lauf: ${formatDuration(ls.runTime)} · Reife ${formatPercent(fRipeness(g), 0)}` : '');
      setHidden(stats, !stats.textContent);
    },
  };
}

function stockCard(ctx, lines) {
  const { g } = ctx;
  const val = h('b', { class: 'lv-stock num' });
  const sub = h('div', { class: 'lv-sub' });
  const subs = lines.sub.map(() => h('span', { class: 'lv-sub-line num' }));
  sub.append(...subs);
  const el = h('div', { class: 'card lv-res' }, h('span', { class: 'hdr-label', text: lines.title }), val, sub);
  return {
    el,
    update() {
      txt(val, lines.value(g));
      lines.sub.forEach((fn, i) => {
        const s = fn(g);
        txt(subs[i], s);
        setHidden(subs[i], !s);
      });
    },
  };
}

function challengeBlock(ctx) {
  const { g } = ctx;
  const intro = h('p', { class: 'muted small', text: 'Eine Challenge setzt alles darunter zurück und schränkt das Netz ein. Erreiche das Ziel, dann bleibt die Belohnung für immer. Du kannst jederzeit aufgeben.' });
  const locked = h('p', { class: 'muted', text: 'Challenges öffnen sich mit dem ersten Fruchtkörper.' });
  const cards = g.def.challenges.map((c) => {
    const status = h('span', { class: 'badge' });
    const bar = progressBar();
    const prog = h('small', { class: 'muted num' });
    const lock = h('p', { class: 'uc-note' });
    const goalLine = h('p', { class: 'chal-goal' });
    const btn = h('button', { class: 'btn', type: 'button' });
    const el = h('div', { class: 'card chal' },
      h('div', { class: 'upg-head' }, h('b', { text: c.name }), status),
      h('p', { class: 'upg-desc', text: c.desc }),
      goalLine,
      h('p', { class: 'chal-reward', text: 'Belohnung: ' + c.reward }),
      bar.el, prog, lock, btn);
    btn.addEventListener('click', async () => {
      if (g.chActive()?.id === c.id) {
        if (await confirmDialog('Challenge aufgeben? Der Lauf wird zurückgesetzt, ohne Belohnung.', { ok: 'Aufgeben', danger: true })) g.chExit();
      } else if (await confirmDialog(`„${c.name}“ starten? ${c.desc} Alles unterhalb der Fruchtkörper wird zurückgesetzt.`, { ok: 'Starten' })) g.chEnter(c.id);
    });
    return { c, el, status, bar, prog, lock, btn, goalLine };
  });
  const el = h('section', { class: 'lv-sec' }, h('h3', { class: 'section-title', text: 'Challenges' }), locked, intro, ...cards.map((x) => x.el));
  return {
    el,
    update() {
      const open = g.chUnlocked();
      setHidden(locked, open);
      setHidden(intro, !open);
      const active = g.chActive();
      for (const { c, el: card, status, bar, prog, lock, btn, goalLine } of cards) {
        setHidden(card, !open);
        if (!open) continue;
        const done = g.chDone(c.id);
        const isActive = active?.id === c.id;
        txt(goalLine, `Ziel: ${fmt(g.chGoal(c))} Hyphen in einem Lauf`);
        txt(status, done ? 'Geschafft' : isActive ? 'Läuft' : 'Offen');
        setCls(card, 'owned', done);
        setCls(card, 'active', isActive);
        setHidden(bar.el, done);
        setHidden(prog, done || !isActive);
        if (isActive) {
          bar.set(g.chProgress(c));
          txt(prog, `${fmt(g.chValue(c))} / ${fmt(g.chGoal(c))} Hyphen`);
        } else bar.set(0);
        const lk = !done && !isActive && !g.chAvailable(c.id);
        txt(lock, lk && c.lockText ? 'Gesperrt: ' + c.lockText : '');
        setHidden(lock, !(lk && c.lockText));
        setCls(card, 'locked', lk);
        setHidden(btn, done);
        txt(btn, isActive ? 'Aufgeben' : 'Starten');
        setDisabled(btn, lk || (!!active && !isActive));
      }
    },
  };
}

function rainCard(ctx) {
  const { g } = ctx;
  const pips = [0, 1, 2].map(() => h('i', { class: 'pip' }));
  const status = h('p', { class: 'muted small' });
  const btn = h('button', { class: 'btn btn-primary', type: 'button', text: 'Regenschauer auslösen', onClick: () => doRain(ctx) });
  const el = h('div', { class: 'card rain-card' },
    h('div', { class: 'p-head' }, h('b', { text: 'Regenschauer' }), h('span', { class: 'pips' }, ...pips)),
    h('p', { class: 'muted', text: `Jeder Schauer lässt das Netz ${Math.round(T.rainSecs / 60)} Minuten lang schneller wachsen (Nährstoffe und Zucker ×${T.rainMult}). Eine Ladung kommt alle ${Math.round(T.rainEvery / 60)} Minuten Spielzeit, auch wenn du weg bist, höchstens ${T.rainMax}. Mehrere Schauer addieren ihre Zeit.` }),
    status, btn);
  return {
    el,
    update() {
      const c = rainCharges(g);
      pips.forEach((p, i) => setCls(p, 'full', i < c));
      const r = g.state.myz.rain;
      txt(status, r.t > 0 ? `Es regnet: noch ${formatDuration(r.t)} (×${rainMult(g)}).` : c >= T.rainMax ? 'Alle Ladungen sind voll.' : `Nächste Ladung in ${formatDuration(rainNextIn(g))}.`);
      setDisabled(btn, c < 1);
    },
  };
}
export function doRain(ctx) {
  const { g, toast } = ctx;
  if (rainCast(g)) toast(`Wachstumsschub: ×${rainMult(g)} für ${Math.round(T.rainSecs / 60)} Minuten.`, { kind: 'good', ms: 1800, title: 'Regenschauer' });
  else toast(`Nächste Ladung in ${formatDuration(rainNextIn(g))}.`, { kind: 'info', ms: 1800, title: 'Regenschauer' });
}

function partsList(g, fn, title) {
  const ul = h('ul', { class: 'mult-list' });
  const total = h('p', { class: 'mult-total' });
  let key = '';
  return {
    el: h('div', { class: 'card' }, h('h3', { class: 'section-title', text: title }), ul, total),
    update() {
      const parts = fn(g);
      const k = parts.map(([l, v]) => l + v.toPrecision(4)).join('|');
      if (k === key) return;
      key = k;
      ul.replaceChildren(...parts.map(([l, v]) => h('li', {}, h('span', { text: l }), h('b', { class: 'num', text: '×' + fmt(v) }))));
      txt(total, 'Gesamt: ×' + fmt(parts.reduce((a, [, v]) => a * v, 1)));
    },
  };
}

/* ------------------------------------------------------------------ */
/* one node                                                             */
/* ------------------------------------------------------------------ */

function respecButton(ctx, id) {
  const { g } = ctx;
  const btn = h('button', { class: 'btn btn-block btn-ghost', type: 'button', text: 'Gabelung neu wählen …' });
  btn.addEventListener('click', async () => {
    const ok = await confirmDialog(
      'Der Ast samt Upgrades und Meilensteinen wird auf 0 gesetzt, dazu Nährstoffe und Hyphen. Erstattet wird nichts. Danach wählst du neu.',
      { title: 'Gabelung neu wählen', ok: 'Zurücksetzen', danger: true },
    );
    if (ok && g.forkRespec('a')) {
      ctx.closeLayer();
      ctx.askFork();
    }
  });
  return { el: h('section', { class: 'lv-sec' }, btn), update() {} };
}

function buildNodeView(ctx, id) {
  const { g } = ctx;
  const n = nodeById[id];
  const parts = [];
  const scroll = h('div', { class: 'lv-scroll' });
  const add = (b, wrap) => {
    if (!b) return;
    parts.push(b);
    scroll.append(wrap ? wrap(b.el) : b.el);
  };

  if (id === 'n') {
    add(stockCard(ctx, {
      title: 'Nährstoffe',
      value: (gg) => fmt(gg.get('n')),
      sub: [(gg) => '+' + fmt(gg.incomePerSec('n')) + ' pro Sekunde'],
    }));
    add(partsList(g, (gg) => nParts(gg), 'Was die Nährstoffe vervielfacht'));
    add(rainCard(ctx));
    scroll.append(h('p', { class: 'muted small', text: 'Das Netz wächst höchstens 3 Stunden, während du weg bist. Danach wartet es.' }));
  } else if (id === 'h') {
    add(stockCard(ctx, {
      title: 'Hyphen',
      value: (gg) => fmt(gg.get('h')),
      sub: [(gg) => `Insgesamt gewachsen: ${fmt(gg.state.cur.h.run)}`, (gg) => `Hyphen-Gewinn pro Ausbreitung ×${fmt(hGainParts(gg).reduce((a, [, v]) => a * v, 1))}`],
    }));
    add(prestigeInfo(ctx, 'h'));
    add(upgradeGrid(ctx, 'h', 'Hyphen-Upgrades', 'Bezahlt mit Hyphen. Je zwei Upgrades in der letzten Reihe schließen sich aus; nach der nächsten Ausbreitung darfst du umwählen.'));
    add(milestoneBlock(ctx, 'h'));
    const sw = autoSwitch(g, 'auto_hbuy', { label: 'Hyphen-Upgrades automatisch kaufen', hint: 'Kauft das Upgrade mit dem besten Nutzen.' });
    const cfg = autoConfigRow(g, 'auto_h');
    add(sw);
    add(cfg);
  } else if (id === 's') {
    add(stockCard(ctx, {
      title: 'Sporen',
      value: (gg) => fmt(gg.state.layers.s.units),
      sub: [(gg) => `Zum Ausgeben: ${fmt(gg.get('s'))}`, (gg) => `Nährstoffe durch Sporen ×${fmt(nParts(gg).find(([l]) => l === 'Sporen')?.[1] ?? 1)}`],
    }));
    add(prestigeInfo(ctx, 's'));
    add(upgradeGrid(ctx, 's', 'Sporen-Upgrades', 'Bezahlt mit Sporen. Ausgegebene Sporen verstärken weiter, nur der Vorrat sinkt.'));
    add(milestoneBlock(ctx, 's'));
    add(respecButton(ctx, 's'));
  } else if (id === 'm') {
    add(stockCard(ctx, {
      title: 'Mykorrhiza',
      value: (gg) => fmt(gg.state.layers.m.units),
      sub: [(gg) => `Zucker: ${fmt(gg.get('z'))} (+${fmt(zRate(gg))}/s)`, (gg) => `Insgesamt erzeugt: ${fmt(gg.state.cur.z.run)}`],
    }));
    add(prestigeInfo(ctx, 'm'));
    add(upgradeGrid(ctx, 'm', 'Zucker-Upgrades', 'Bezahlt mit Zucker. Das Netz erzeugt ihn auch, wenn du nicht da bist.'));
    add(milestoneBlock(ctx, 'm'));
    add(respecButton(ctx, 'm'));
  } else if (id === 'f') {
    add(stockCard(ctx, {
      title: 'Fruchtkörper',
      value: (gg) => fmt(gg.get('f')),
      sub: [(gg) => `Insgesamt: ${fmt(gg.state.cur.f.total)}`],
    }));
    add(prestigeInfo(ctx, 'f'));
    add(challengeBlock(ctx));
    add(upgradeGrid(ctx, 'f', 'Fruchtkörper-Upgrades', 'Bezahlt mit Fruchtkörpern.'));
    add(milestoneBlock(ctx, 'f'));
  }

  // sticky prestige button
  let foot = null;
  let footBtn = null;
  if (n.layer) {
    const l = g.layerById[n.layer];
    footBtn = h('button', { class: 'btn btn-primary btn-big lv-pbtn', type: 'button', onClick: () => doPrestige(ctx, n.layer) });
    foot = h('footer', { class: 'lv-foot' }, footBtn);
    parts.push({
      update() {
        const gain = g.prestigeGain(n.layer);
        const verb = PRESTIGE_VERB[n.layer] || l.verb;
        if (g.prestigeBlocked(n.layer)) txt(footBtn, 'In der Challenge gesperrt');
        else if (g.canPrestige(n.layer)) txt(footBtn, `${verb} · +${fmt(gain)} ${l.static ? (gain.eq(1) ? UNIT[n.layer] || 'Einheit' : l.plural) : cname(g, l.currency)}`);
        else txt(footBtn, `${verb} · noch nicht`);
        setDisabled(footBtn, !g.canPrestige(n.layer));
      },
    });
  }
  const root = h('div', { class: 'lv-node' }, scroll, foot);
  return { el: root, update: () => parts.forEach((p) => p.update()) };
}

/* ------------------------------------------------------------------ */
/* overlay                                                              */
/* ------------------------------------------------------------------ */

export function createLayerOverlay(ctx) {
  const { g } = ctx;
  const title = h('h2', { class: 'lv-title' });
  const back = h('button', { class: 'btn btn-ghost lv-back', type: 'button', 'aria-label': 'Zurück zum Netz', text: '‹ Netz' });
  const body = h('div', { class: 'lv-body' });
  const el = h('div', { class: 'lv', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Ebene' }, h('div', { class: 'lv-top' }, back, title), body);
  const views = {};
  let cur = null;
  let pushed = false;

  function show(id) {
    if (cur === id) return;
    cur = id;
    if (!views[id]) {
      views[id] = buildNodeView(ctx, id);
      body.append(views[id].el);
    }
    for (const [k, v] of Object.entries(views)) v.el.hidden = k !== id;
    txt(title, nodeById[id].name);
    views[id].update();
  }
  function open(id) {
    show(id);
    el.hidden = false;
    document.body.classList.add('lv-open');
    const sc = views[id].el.querySelector('.lv-scroll');
    if (sc) sc.scrollTop = 0;
    if (!pushed) {
      try {
        history.pushState({ lv: id }, '');
        pushed = true;
      } catch { /* ignore */ }
    }
  }
  function hide() {
    cur = null;
    el.hidden = true;
    document.body.classList.remove('lv-open');
  }
  function close() {
    if (el.hidden) return;
    if (pushed) {
      pushed = false;
      try {
        history.back();
        return;
      } catch { /* fall through */ }
    }
    hide();
  }
  window.addEventListener('popstate', () => {
    pushed = false;
    hide();
  });
  back.addEventListener('click', close);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && !document.querySelector('.modal-overlay') && close());
  ctx.closeLayer = close;
  return {
    el,
    open,
    close,
    get current() {
      return el.hidden ? null : cur;
    },
    update() {
      if (el.hidden || !cur) return;
      // a node can close while open (fork respec ...): fall back to the tree
      views[cur].update();
    },
  };
}
