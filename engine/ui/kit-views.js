// Reusable views for games built on engine/kit/game.js.
// Every builder returns { el, update } - DOM is built once, update() only touches changed text/classes.
import { h, txt, setCls, setDisabled, setHidden, setStyle, svgIcon } from './dom.js';
import { holdRepeat, longPress } from './hold.js';
import { openModal, confirmDialog } from './modal.js';
import { ICONS } from './icons.js';
import { formatNumber as fmt, formatInt, formatDuration, parseNumber } from '../format.js';

const cname = (g, id) => g.currencyById[id].name;

/* ------------------------------------------------------------------ */
/* small building blocks                                               */
/* ------------------------------------------------------------------ */

export function progressBar() {
  const fill = h('i');
  const el = h('div', { class: 'bar', role: 'presentation' }, fill);
  return { el, set: (r) => setStyle(fill, 'width', (Math.max(0, Math.min(1, r)) * 100).toFixed(1) + '%') };
}

/** Collapsible section; open state is remembered per key in localStorage-free memory (session). */
export function section(title, content, { open = true, badge } = {}) {
  const d = h('details', { class: 'section', open }, h('summary', {}, h('span', { text: title }), badge ? badge : null), content);
  return d;
}

export const sectionTitle = (text, sub) => h('h3', { class: 'section-title' }, text, sub ? h('small', { text: sub }) : null);

/* ------------------------------------------------------------------ */
/* buy-mode bar                                                         */
/* ------------------------------------------------------------------ */

export function buyModeBar(g, { onBuyAll, buyAllLabel = 'Alles kaufen' } = {}) {
  const modes = [['1', '×1'], ['10', '×10'], ['max', 'Max']];
  const btns = modes.map(([m, label]) =>
    h('button', { class: 'seg', type: 'button', text: label, onClick: () => (g.state.settings.buyMode = m) }),
  );
  const el = h('div', { class: 'buymode' }, h('div', { class: 'segmented', role: 'group', 'aria-label': 'Kaufmenge' }, btns));
  if (onBuyAll) el.append(h('button', { class: 'btn btn-primary', type: 'button', text: buyAllLabel, onClick: onBuyAll }));
  return {
    el,
    update() {
      modes.forEach(([m], i) => setCls(btns[i], 'active', g.state.settings.buyMode === m));
    },
  };
}

/* ------------------------------------------------------------------ */
/* generators                                                           */
/* ------------------------------------------------------------------ */

export function generatorList(g, chainId, { onDetails } = {}) {
  const chain = g.chainById[chainId];
  const curName = cname(g, chain.currency);
  const root = h('div', { class: 'gens' });
  const rows = chain.tiers.map((tier, i) => {
    const name = h('b', { class: 'gen-name', text: tier.name });
    const mult = h('span', { class: 'gen-mult' });
    const amount = h('span', { class: 'gen-amount num' });
    const rate = h('span', { class: 'gen-rate' });
    const bar = progressBar();
    const barText = h('small', { class: 'gen-bar-text', title: 'Käufe bis zum nächsten Bündelbonus' });
    const buyTop = h('span', { class: 'buy-top' });
    const buyCost = h('span', { class: 'buy-cost num' });
    const btn = h('button', { class: 'btn btn-buy', type: 'button' }, buyTop, buyCost);
    const info = h('div', { class: 'gen-info', role: 'button', tabindex: 0, 'aria-label': tier.name + ': Details' },
      h('div', { class: 'gen-head' }, name, amount),
      h('div', { class: 'gen-rate-line' }, mult, rate),
      h('div', { class: 'gen-bundle' }, bar.el, barText),
    );
    const row = h('div', { class: 'gen card', hidden: true }, info, btn);
    row.addEventListener('animationend', () => row.classList.remove('flash'));
    holdRepeat(btn, () => {
      if (g.genBuy(chainId, i, g.state.settings.buyMode)) row.classList.add('flash');
    });
    // long press (touch) or tap/Enter on the info area opens the details
    longPress(info, () => onDetails && onDetails(chainId, i));
    info.addEventListener('click', () => onDetails && onDetails(chainId, i));
    info.addEventListener('keydown', (e) => e.key === 'Enter' && onDetails && onDetails(chainId, i));
    root.append(row);
    return { row, mult, amount, rate, bar, barText, buyTop, buyCost, btn };
  });

  return {
    el: root,
    update() {
      const gs = g.state.gens[chainId];
      const mode = g.state.settings.buyMode;
      rows.forEach((r, i) => {
        const vis = g.genVisible(chain, i);
        setHidden(r.row, !vis);
        if (!vis) return;
        txt(r.mult, '×' + fmt(g.cache.own[chainId][i]));
        txt(r.amount, formatInt(gs[i].amount));
        txt(r.rate, '+' + fmt(g.genRate(chainId, i)) + '/s ' + (i === 0 ? curName : chain.tiers[i - 1].name));
        const inBundle = gs[i].bought % chain.bundle;
        r.bar.set(inBundle / chain.bundle);
        txt(r.barText, `${inBundle}/${chain.bundle}`);
        const info = g.genBuyInfo(chain, i, mode);
        txt(r.buyTop, 'Kaufen ×' + formatInt(info.count));
        txt(r.buyCost, fmt(info.cost));
        setDisabled(r.btn, !info.affordable);
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/* upgrades                                                             */
/* ------------------------------------------------------------------ */

export function upgradeCard(g, id, { showReqNames = true } = {}) {
  const u = g.upgById[id];
  const name = h('b', { class: 'upg-name', text: u.name });
  const lvl = h('span', { class: 'upg-lvl' });
  const desc = h('p', { class: 'upg-desc', text: u.desc });
  const eff = h('p', { class: 'upg-eff' });
  const note = h('p', { class: 'upg-note' });
  const btn = h('button', { class: 'btn btn-buy', type: 'button' });
  const el = h('div', { class: 'card upg' }, h('div', { class: 'upg-head' }, name, lvl), desc, eff, note, btn);
  const buy = () => g.upgBuy(id);
  if ((u.max ?? 1) > 1) holdRepeat(btn, buy);
  else btn.addEventListener('click', buy);

  const reqNames = () => [...(u.requires || []), ...(u.requiresAny || [])].map((r) => g.upgById[r].name);

  // tap on the card body (not the buy button) shows the details
  const details = () => {
    const level = g.upgLevel(id);
    const max = g.upgMax(u);
    const rows = [['Stufe', max > 1 ? `${level}/${max}` : level ? 'Gekauft' : 'Nicht gekauft']];
    if (u.fmt && (level > 0 || max > 1)) rows.push(['Aktuell', u.fmt(g.upgEffect(id), level, g)]);
    if (level < max) rows.push(['Nächster Kauf', fmt(g.upgCost(id)) + ' ' + cname(g, u.currency)]);
    const reqs = reqNames();
    if (reqs.length) rows.push(['Benötigt', (u.requiresAny && !u.requires ? reqs.join(' oder ') : reqs.join(', '))]);
    openModal({
      title: u.name,
      body: h('div', {}, h('p', { class: 'muted', text: u.desc }), h('ul', { class: 'mult-list' }, ...rows.map(([a, b]) => h('li', {}, h('span', { text: a }), h('b', { class: 'num', text: b }))))),
      actions: [{ label: 'Schließen', kind: 'primary' }],
    });
  };
  el.addEventListener('click', (e) => {
    if (!btn.contains(e.target)) details();
  });

  return {
    el,
    get owned() {
      return g.upgMaxed(id);
    },
    update() {
      const level = g.upgLevel(id);
      const max = g.upgMax(u);
      const maxed = level >= max;
      const disabled = g.upgDisabled(u);
      const excluded = g.upgExcluded(u);
      const reqOk = g.upgRequirementsMet(u);
      txt(lvl, max > 1 ? `Stufe ${level}/${max}` : level ? 'Gekauft' : '');
      if (u.fmt && (level > 0 || max > 1)) txt(eff, 'Aktuell: ' + u.fmt(g.upgEffect(id), level, g));
      else txt(eff, '');
      setHidden(eff, !(u.fmt && (level > 0 || max > 1)));
      let n = '';
      if (maxed) n = '';
      else if (excluded) n = 'Gesperrt: ein anderer Pfad wurde gewählt.';
      else if (!reqOk && showReqNames) {
        const names = reqNames();
        n = 'Benötigt: ' + (u.requiresAny && !u.requires ? names.join(' oder ') : names.join(', '));
      } else if (disabled) n = 'In dieser Challenge deaktiviert.';
      txt(note, n);
      setHidden(note, !n);
      setCls(el, 'owned', maxed);
      setCls(el, 'locked', !maxed && (!reqOk || excluded));
      setCls(el, 'off', disabled);
      setHidden(btn, maxed);
      if (!maxed) {
        txt(btn, fmt(g.upgCost(id)) + ' ' + cname(g, u.currency));
        setDisabled(btn, !g.upgCanBuy(id));
      }
    },
  };
}

export function upgradeList(g, group, { buyAllLabel = 'Alles kaufen', emptyText } = {}) {
  const ups = g.def.upgrades.filter((u) => u.group === group);
  const cards = ups.map((u) => ({ u, c: upgradeCard(g, u.id) }));
  const avail = h('div', { class: 'stack' });
  const ownedBox = h('div', { class: 'stack' });
  const ownedCount = h('small', { class: 'badge' });
  const owned = h('details', { class: 'section' }, h('summary', {}, h('span', { text: 'Gekauft' }), ownedCount), ownedBox);
  // buyAllLabel: null = no "buy everything" button (upgrades that are a choice, not a shopping list)
  const buyAll = buyAllLabel ? h('button', { class: 'btn btn-primary btn-block', type: 'button', text: buyAllLabel, onClick: () => g.upgBuyAll(group) }) : null;
  const el = h('div', { class: 'stack' }, buyAll, avail, owned);
  const where = new Map();
  for (const { c } of cards) {
    avail.append(c.el);
    where.set(c, avail);
  }
  return {
    el,
    update() {
      let nOwned = 0;
      let anyBuyable = false;
      for (const { u, c } of cards) {
        const visible = g.upgVisible(u);
        const own = visible && c.owned;
        const target = own ? ownedBox : avail;
        if (where.get(c) !== target) {
          target.append(c.el);
          where.set(c, target);
        }
        setHidden(c.el, !visible);
        if (visible) c.update();
        if (own) nOwned++;
        else if (visible && g.upgCanBuy(u.id)) anyBuyable = true;
      }
      txt(ownedCount, String(nOwned));
      setHidden(owned, nOwned === 0);
      if (buyAll) setDisabled(buyAll, !anyBuyable);
    },
  };
}

/* ------------------------------------------------------------------ */
/* prestige layer                                                       */
/* ------------------------------------------------------------------ */

export async function doPrestige(ctx, layerId) {
  const g = ctx.g;
  if (!g.canPrestige(layerId)) return false;
  const l = g.layerById[layerId];
  if (g.state.settings.confirm[layerId]) {
    const gain = g.prestigeGain(layerId);
    const ok = await confirmDialog(`${l.verb}: Du erhältst +${fmt(gain)} ${cname(g, l.currency)}. ${l.blurb}`, {
      title: l.name,
      ok: l.verb,
    });
    if (!ok) return false;
  }
  return g.prestige(layerId);
}

/**
 * Compact on/off row for one auto, to be placed where the auto acts. Hidden until the auto is unlocked;
 * the switch mirrors state.auto[id].on in both directions (also when changed from the central panel).
 */
export function autoSwitch(g, autoId, { label = 'Automatisch kaufen', hint } = {}) {
  const st = () => g.state.auto[autoId];
  const input = h('input', { type: 'checkbox', class: 'switch-input', 'aria-label': label });
  input.addEventListener('change', () => (st().on = input.checked));
  const el = h('label', { class: 'card row setting auto-sw', hidden: true },
    h('span', { class: 'row-main' }, h('b', { text: label }), hint ? h('small', { text: hint }) : null),
    h('span', { class: 'switch' }, input, h('i', { class: 'switch-track' })));
  return {
    el,
    update() {
      const un = g.autoUnlocked(autoId);
      setHidden(el, !un);
      if (un && input.checked !== st().on) input.checked = st().on;
    },
  };
}

export function autoConfigRow(g, autoId) {
  const a = g.autoById[autoId];
  const st = () => g.state.auto[autoId];
  const toggle = h('input', { type: 'checkbox', class: 'switch-input' });
  toggle.addEventListener('change', () => (st().on = toggle.checked));
  const modeLabels = { amount: 'Gewinn ≥ Zahl', mult: 'Gewinn ≥ Faktor × bisherige Summe', time: 'Laufzeit (s)' };
  const mode = h('select', { class: 'select', 'aria-label': 'Modus' }, ...(a.modes || ['amount', 'mult']).map((m) => h('option', { value: m, text: modeLabels[m] })));
  mode.addEventListener('change', () => (st().mode = mode.value));
  const input = h('input', { class: 'input', type: 'text', inputMode: 'decimal', 'aria-label': 'Schwellwert', autocomplete: 'off' });
  const apply = () => {
    const v = parseNumber(input.value);
    if (v && v.gt(0)) st().value = v;
    input.value = fmt(st().value);
  };
  input.addEventListener('change', apply);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
  const wait = h('small', { class: 'auto-wait muted', hidden: true });
  const el = h('div', { class: 'card auto-cfg' },
    h('label', { class: 'row' }, h('span', { class: 'row-main' }, h('b', { text: a.name }), h('small', { text: a.desc })), h('span', { class: 'switch' }, toggle, h('i', { class: 'switch-track' }))),
    h('div', { class: 'row gap' }, mode, input),
    wait,
  );
  let synced = false;
  return {
    el,
    update() {
      const unlocked = g.autoUnlocked(autoId);
      setHidden(el, !unlocked);
      if (!unlocked) return;
      if (document.activeElement !== input && (!synced || input._v !== String(st().value))) {
        input.value = fmt(st().value);
        input._v = String(st().value);
        synced = true;
      }
      if (toggle.checked !== st().on) toggle.checked = st().on;
      const status = a.status && st().on ? a.status(g) : '';
      setHidden(wait, !status);
      if (status) txt(wait, status);
      if (document.activeElement !== mode && mode.value !== st().mode) mode.value = st().mode;
    },
  };
}

export function prestigePanel(g, layerId, ctx) {
  const l = g.layerById[layerId];
  const basisName = cname(g, l.basis);
  const curName = cname(g, l.currency);
  const title = h('h2', { class: 'p-title', text: l.name });
  const count = h('small', { class: 'p-count' });
  const blurb = h('p', { class: 'muted', text: l.blurb });
  const btn = h('button', { class: 'btn btn-primary btn-big', type: 'button', onClick: () => doPrestige(ctx, layerId) });
  const next = h('p', { class: 'p-next' });
  const bar = progressBar();
  const stats = h('p', { class: 'muted small' });
  const el = h('div', { class: 'card prestige' }, h('div', { class: 'p-head' }, title, count), blurb, btn, next, bar.el, stats);
  const autoRows = g.def.autos.filter((a) => a.kind === 'prestige' && a.layer === layerId).map((a) => autoConfigRow(g, a.id));
  const wrap = h('div', { class: 'stack' }, el, ...autoRows.map((a) => a.el));
  return {
    el: wrap,
    update() {
      const ls = g.state.layers[layerId];
      const gain = g.prestigeGain(layerId);
      const blocked = g.prestigeBlocked(layerId);
      const can = g.canPrestige(layerId);
      txt(count, `Durchläufe: ${ls.count}`);
      if (blocked) txt(btn, 'In der Challenge gesperrt');
      else if (can) txt(btn, `${l.verb}  ·  +${fmt(gain)} ${curName}`);
      else txt(btn, `Noch nicht möglich`);
      setDisabled(btn, !can);
      const basis = g.prestigeBasis(layerId);
      const target = g.prestigeBasisFor(layerId, gain.add(1));
      if (l.available && l.unavailableText && !l.available(g)) txt(next, l.unavailableText); // the layer is closed for another reason than the basis amount: say that one
      else txt(next, gain.gte(1) ? `Nächster Punkt bei ${fmt(target)} ${basisName} (jetzt ${fmt(basis)})` : `Benötigt ${fmt(g.prestigeBasisFor(layerId, 1))} ${basisName} (jetzt ${fmt(basis)})`);
      const lo = gain.gte(1) ? g.prestigeBasisFor(layerId, gain) : null;
      const lb = lo ? lo.log10() : 0;
      const hb = target.log10();
      bar.set(hb > lb ? (Math.max(basis.log10(), 0) - lb) / (hb - lb) : 0);
      txt(
        stats,
        ls.count
          ? `Letzter Gewinn: +${fmt(ls.lastGain)} nach ${formatDuration(ls.lastTime)} · Bester: +${fmt(ls.bestGain)}` + (ls.fastest ? ` · Schnellster: ${formatDuration(ls.fastest)}` : '')
          : `Aktueller Durchlauf: ${formatDuration(ls.runTime)}`,
      );
      autoRows.forEach((a) => a.update());
    },
  };
}

/* ------------------------------------------------------------------ */
/* milestones                                                           */
/* ------------------------------------------------------------------ */

export function milestoneList(g, layerId) {
  const ms = g.def.milestones.filter((m) => m.layer === layerId);
  const items = ms.map((m) => {
    const icon = svgIcon(ICONS.check, 'icon ms-icon');
    const el = h('li', { class: 'ms' }, icon, h('div', {}, h('b', { text: m.name }), h('small', { text: m.desc })));
    return { m, el };
  });
  const el = h('ul', { class: 'card ms-list' }, ...items.map((i) => i.el));
  return {
    el,
    update() {
      for (const { m, el: li } of items) setCls(li, 'done', g.hasMs(m.id));
    },
  };
}

/* ------------------------------------------------------------------ */
/* challenges                                                           */
/* ------------------------------------------------------------------ */

export function challengeList(g, ctx) {
  const root = h('div', { class: 'stack' });
  const locked = h('p', { class: 'muted', text: 'Challenges werden mit der ersten Expansion freigeschaltet.' });
  const intro = h('p', { class: 'muted', text: 'Eine Challenge startet einen eingeschränkten Durchlauf (wie eine Expansion ohne Gewinn). Erreiche das Ziel, um eine dauerhafte Belohnung zu erhalten. Du kannst jederzeit aufgeben.' });
  root.append(locked, intro);
  const cards = g.def.challenges.map((c) => {
    const status = h('span', { class: 'badge' });
    const bar = progressBar();
    const prog = h('small', { class: 'muted' });
    const btn = h('button', { class: 'btn', type: 'button' });
    const lock = h('p', { class: 'upg-note' });
    const el = h('div', { class: 'card chal' },
      h('div', { class: 'upg-head' }, h('b', { text: c.name }), status),
      h('p', { class: 'upg-desc', text: c.desc }),
      h('p', { class: 'chal-goal', text: `Ziel: ${fmt(c.goal.amount)} ${cname(g, c.goal.currency)} in einem Durchlauf` }),
      h('p', { class: 'chal-reward', text: 'Belohnung: ' + c.reward }),
      bar.el, prog, lock, btn,
    );
    btn.addEventListener('click', async () => {
      if (g.chActive() && g.chActive().id === c.id) {
        if (await confirmDialog('Challenge aufgeben? Du verlierst den Fortschritt dieses Durchlaufs (Replikation & Blaupausen werden zurückgesetzt).', { ok: 'Aufgeben', danger: true })) g.chExit();
      } else if (await confirmDialog(`„${c.name}“ starten? ${c.desc} Dein aktueller Durchlauf (alles unterhalb der Expansion) wird zurückgesetzt.`, { ok: 'Starten' })) {
        g.chEnter(c.id);
      }
    });
    root.append(el);
    return { c, el, status, bar, prog, btn, lock };
  });
  return {
    el: root,
    update() {
      const unlocked = g.chUnlocked();
      setHidden(locked, unlocked);
      const active = g.chActive();
      cards.forEach(({ c, el, status, bar, prog, btn, lock }) => {
        setHidden(el, !unlocked);
        if (!unlocked) return;
        const done = g.chDone(c.id);
        const isActive = active && active.id === c.id;
        setCls(el, 'owned', done);
        setCls(el, 'active', !!isActive);
        txt(status, done ? 'Abgeschlossen' : isActive ? 'Aktiv' : 'Offen');
        setHidden(bar.el, done);
        setHidden(prog, done || !isActive);
        if (isActive) {
          bar.set(g.chProgress(c));
          txt(prog, `${fmt(g.state.cur[c.goal.currency].run)} / ${fmt(c.goal.amount)}`);
        } else bar.set(0);
        setHidden(btn, done);
        const locked = !done && !isActive && !g.chAvailable(c.id);
        txt(lock, locked && c.lockText ? 'Gesperrt: ' + c.lockText : '');
        setHidden(lock, !(locked && c.lockText));
        setCls(el, 'locked', locked);
        txt(btn, isActive ? 'Aufgeben' : 'Starten');
        setDisabled(btn, locked);
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/* research tree                                                        */
/* ------------------------------------------------------------------ */

export function researchTree(g, group, { branches = {}, onRespec } = {}) {
  const nodes = g.def.upgrades.filter((u) => u.group === group);
  const order = [...new Set(nodes.map((n) => n.branch || ''))];
  const root = h('div', { class: 'stack tree' });
  const cards = [];
  for (const b of order) {
    const list = h('div', { class: 'stack branch-list' });
    const info = branches[b] || { title: b ? 'Zweig ' + b : 'Grundlagen' };
    root.append(h('div', { class: 'branch' }, h('h3', { class: 'section-title' }, info.title, info.sub ? h('small', { text: info.sub }) : null), list));
    for (const n of nodes.filter((x) => (x.branch || '') === b)) {
      const c = upgradeCard(g, n.id);
      c.el.classList.add('node');
      list.append(c.el);
      cards.push(c);
    }
  }
  const respec = h('button', { class: 'btn btn-block', type: 'button', text: 'Forschung neu verteilen …', onClick: onRespec });
  root.append(respec);
  return {
    el: root,
    update() {
      cards.forEach((c) => c.update());
      setHidden(respec, !nodes.some((n) => g.upgLevel(n.id) > 0));
    },
  };
}

export function respecDialog(g) {
  return confirmDialog(
    'Alle Forschungsknoten werden erstattet. Dafür wird der aktuelle Durchlauf (Replikation, Expansion, Sternsysteme) ohne Gewinn zurückgesetzt. Quantenkerne bleiben erhalten.',
    { title: 'Forschung neu verteilen', ok: 'Zurücksetzen', danger: true },
  ).then((ok) => {
    if (ok) g.upgRespec('research', 3);
    return ok;
  });
}

/* ------------------------------------------------------------------ */
/* automation                                                           */
/* ------------------------------------------------------------------ */

export function autoPanel(g) {
  const autos = g.def.autos.filter((a) => a.kind !== 'prestige'); // prestige autos have their own config rows
  const list = h('div', { class: 'stack' });
  const rows = autos.map((a) => {
    const input = h('input', { type: 'checkbox', class: 'switch-input' });
    input.addEventListener('change', () => (g.state.auto[a.id].on = input.checked));
    const el = h('label', { class: 'row setting', hidden: true },
      h('span', { class: 'row-main' }, h('b', { text: a.name })),
      h('span', { class: 'switch' }, input, h('i', { class: 'switch-track' })),
    );
    list.append(el);
    return { a, el, input };
  });
  const allOn = h('button', { class: 'btn', type: 'button', text: 'Alle an', onClick: () => autos.forEach((a) => (g.state.auto[a.id].on = true)) });
  const allOff = h('button', { class: 'btn', type: 'button', text: 'Alle aus', onClick: () => autos.forEach((a) => (g.state.auto[a.id].on = false)) });
  const empty = h('p', { class: 'muted', text: 'Noch keine Autokäufer freigeschaltet.' });
  const el = h('div', { class: 'stack' }, empty, h('div', { class: 'btn-row' }, allOn, allOff), list);
  return {
    el,
    update() {
      let any = false;
      for (const r of rows) {
        const un = g.autoUnlocked(r.a.id);
        setHidden(r.el, !un);
        if (un) {
          any = true;
          if (r.input.checked !== g.state.auto[r.a.id].on) r.input.checked = g.state.auto[r.a.id].on;
        }
      }
      setHidden(empty, any);
    },
    get any() {
      return rows.some((r) => g.autoUnlocked(r.a.id));
    },
  };
}

/* ------------------------------------------------------------------ */
/* achievements                                                         */
/* ------------------------------------------------------------------ */

export function achievementGrid(g, { bonusText } = {}) {
  const head = h('div', { class: 'card ach-head' }, h('b', { class: 'ach-count' }), h('small', { class: 'ach-bonus' }));
  const grid = h('div', { class: 'ach-grid' });
  const tiles = g.def.achievements.map((a) => {
    const name = h('b', { text: a.name });
    const desc = h('small', { text: a.desc });
    const el = h('div', { class: 'ach' }, name, desc);
    grid.append(el);
    return { a, el, name, desc };
  });
  const [count, bonus] = [head.children[0], head.children[1]];
  return {
    el: h('div', { class: 'stack' }, head, grid),
    update() {
      txt(count, `${g.achCount()} / ${g.def.achievements.length} Erfolge`);
      txt(bonus, bonusText ? bonusText(g) : '');
      for (const { a, el, name, desc } of tiles) {
        const done = g.state.ach[a.id] !== undefined;
        setCls(el, 'done', g.hasAch(a.id));
        if (a.hidden) { // secret achievement: stays a riddle until earned
          txt(name, done ? a.name : '???');
          txt(desc, done ? a.desc : 'Geheim');
        }
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* offline summary                                                      */
/* ------------------------------------------------------------------ */

export function offlineSummaryNode(g, s) {
  const lines = [];
  lines.push(h('p', { text: `Du warst ${formatDuration(s.realSeconds)} weg.${s.capped ? ` Berechnet wurden ${formatDuration(s.seconds)} (Offline-Limit).` : ''}` }));
  const list = h('ul', { class: 'offline-list' });
  for (const c of g.def.currencies) {
    const before = s.before.cur[c.id];
    const after = s.after.cur[c.id];
    const delta = after.sub(before);
    if (delta.gt(0)) list.append(h('li', {}, h('b', { text: '+' + fmt(delta) }), ' ' + c.name));
  }
  for (const l of g.def.layers || []) {
    const d = s.after.layers[l.id] - s.before.layers[l.id];
    if (d > 0) list.append(h('li', {}, h('b', { text: '+' + d }), ' ' + (d > 1 ? l.plural || l.name : l.name)));
  }
  const ach = s.after.ach - s.before.ach;
  if (ach > 0) list.append(h('li', {}, h('b', { text: '+' + ach }), ` Erfolg${ach > 1 ? 'e' : ''}`));
  const ch = s.after.challenges - s.before.challenges;
  if (ch > 0) list.append(h('li', {}, h('b', { text: '+' + ch }), ` Challenge${ch > 1 ? 's' : ''}`));
  if (!list.children.length) list.append(h('li', { class: 'muted', text: 'Nichts Nennenswertes passiert.' }));
  return h('div', {}, ...lines, list);
}

export function showOfflineSummary(g, s) {
  openModal({
    title: 'Während du weg warst …',
    body: offlineSummaryNode(g, s),
    actions: [{ label: 'Weiter', kind: 'primary' }],
  });
}
