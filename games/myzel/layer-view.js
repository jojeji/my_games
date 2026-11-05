// Full-screen layer view: stock, rate / next goal, upgrade cards in two columns, milestones, challenges, autos, respec,
// and a sticky single-line prestige button at the bottom (thumb zone).
import { h, txt, setCls, setDisabled, setHidden } from '../../engine/ui/dom.js';
import { confirmDialog, openModal } from '../../engine/ui/modal.js';
import { progressBar, autoSwitch, autoConfigRow, doPrestige } from '../../engine/ui/kit-views.js';
import { formatNumber as fmt, formatDuration, formatPercent } from '../../engine/format.js';
import { nodeById } from './nodes.js';
import { holdRepeat } from '../../engine/ui/hold.js';
import { nParts, hGainParts, zRate, rainCast, rainCharges, rainNextIn, rainMult, ripeness, fRipeness, fMinRun, fGainParts, wGainParts, lRate, faRate, humus, humusGain, substrate, zersetzen, ringCost, ended, jrMul, bMinRun, wMinRun, lGainMult, zGainMult, gateMul } from './def.js';
import { ENDING, NACHSPIEL } from './ending.js';
import { TUNE as T } from './tune.js';

const UNIT = { s: 'Spore', m: 'Einheit', r: 'Ring' };
const cname = (g, id) => g.currencyById[id].name;
const BASIS_NAME = { h: 'Nährstoffe', s: 'Nährstoffe (gesamt)', m: 'Nährstoffe (gesamt)', f: 'Hyphen', l: 'Fruchtkörper (neu gebildet)', z: 'Fruchtkörper (neu gebildet)', w: 'Flechten und Fäulnis (neu)', r: 'Waldfäden (insgesamt)' };
const PRESTIGE_VERB = { h: 'Ausbreiten', s: 'Freisetzen', m: 'Verdichten', f: 'Fruchten', l: 'Wachsen lassen', z: 'Faulen lassen', w: 'Verbinden', r: 'Ring schließen' };

/** "Alles kaufen" for the player: cheapest first, never a side of an exclusive pair (that is a choice). */
export function buyAllPlain(g, node) {
  let n = 0;
  for (let guard = 0; guard < 100; guard++) {
    let best = null;
    let bc = null;
    for (const u of g.def.upgrades) {
      if (u.node !== node || u.excl || g.upgMax(u) > 1 || !g.upgCanBuy(u.id)) continue;
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
      else if (!owned && !reqOk) {
        const missing = (u.requires || []).filter((r) => g.upgLevel(r) < 1);
        if (missing.length) n = 'Benötigt: ' + missing.map((r) => g.upgById[r].name).join(', ');
        else if (u.requiresAny && !u.requiresAny.some((r) => g.upgLevel(r) > 0)) n = 'Benötigt: ' + u.requiresAny.map((r) => g.upgById[r].name).join(' oder ');
        else n = u.reqText ? u.reqText(g) : 'Noch nicht freigeschaltet.';
      }
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

/** A buyable (many levels, hold the button to buy repeatedly): one full-width row. */
function buyableCard(ctx, id) {
  const { g } = ctx;
  const u = g.upgById[id];
  const name = h('b', { class: 'bc-name', text: u.name });
  const lvl = h('span', { class: 'bc-lvl num' });
  const desc = h('p', { class: 'bc-desc', text: u.desc });
  const cur = h('p', { class: 'bc-cur' });
  const buyTop = h('span', { class: 'buy-top' });
  const buyCost = h('span', { class: 'buy-cost num' });
  const buy = h('button', { class: 'btn btn-buy bc-buy', type: 'button' }, buyTop, buyCost);
  holdRepeat(buy, () => g.upgBuy(id));
  const el = h('div', { class: 'bc' }, h('div', { class: 'bc-main' }, h('div', { class: 'bc-head' }, name, lvl), desc, cur), buy);
  return {
    el,
    update() {
      const level = g.upgLevel(id);
      txt(lvl, level ? 'Stufe ' + level : '');
      const max = g.upgMax(u);
      const full = level >= max;
      txt(cur, (level ? 'Aktuell ' : 'Dann ') + u.fmt(u.effect(level || 1, g), level || 1, g));
      setCls(cur, 'is-owned', level > 0);
      setHidden(buy, full);
      if (!full) {
        txt(buyTop, level ? 'Stufe ' + (level + 1) : 'Kaufen');
        txt(buyCost, fmt(g.upgCost(id)) + ' ' + cname(g, u.currency));
        setDisabled(buy, !g.upgCanBuy(id));
      }
      setHidden(el, !g.upgVisible(u));
    },
  };
}

function upgradeGrid(ctx, node, title, hint) {
  const { g } = ctx;
  const buyables = g.def.upgrades.filter((u) => u.node === node && g.upgMax(u) > 1).map((u) => buyableCard(ctx, u.id));
  const cards = g.def.upgrades.filter((u) => u.node === node && !(g.upgMax(u) > 1)).map((u) => upgradeCard(ctx, u.id));
  const all = h('button', { class: 'btn btn-ghost lv-all', type: 'button', text: 'Alles kaufen', onClick: () => buyAllPlain(g, node) });
  const el = h('section', { class: 'lv-sec' },
    h('div', { class: 'lv-sec-head' }, h('h3', { class: 'section-title', text: title }), all),
    hint ? h('p', { class: 'muted small', text: hint }) : null,
    buyables.length ? h('div', { class: 'blist' }, ...buyables.map((c) => c.el)) : null,
    cards.length ? h('div', { class: 'ugrid' }, ...cards.map((c) => c.el)) : null);
  return {
    el,
    update() {
      buyables.forEach((c) => c.update());
      cards.forEach((c) => c.update());
      setDisabled(all, !g.def.upgrades.some((u) => u.node === node && !u.excl && g.upgMax(u) <= 1 && g.upgCanBuy(u.id)));
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
      const basisName = BASIS_NAME[layerId] || 'Nährstoffe';
      if (l.available && l.unavailableText && !l.available(g)) {
        txt(next, typeof l.unavailableText === 'function' ? l.unavailableText(g) : l.unavailableText);
        const gate = layerId === 'l' || layerId === 'z' ? bMinRun(g) : layerId === 'w' ? wMinRun(g) : layerId === 'f' ? fMinRun(g) : 0;
        bar.set(gate ? ls.runTime / gate : 0);
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
      const gate = layerId === 'l' || layerId === 'z' ? bMinRun(g) : layerId === 'w' ? wMinRun(g) : 0;
      txt(stats, gate ? `${ls.count ? `Durchläufe: ${ls.count} · ` : ''}Lauf: ${formatDuration(ls.runTime)} von ${formatDuration(gate)}${gateMul(g) < 1 ? ' (Kiefer)' : ''}` : ls.count ? `Durchläufe: ${ls.count} · Letzter Gewinn: +${fmt(ls.lastGain)} nach ${formatDuration(ls.lastTime)}` : layerId === 'h' ? `Aktueller Lauf: ${formatDuration(ls.runTime)} · Reife ${formatPercent(ripeness(g), 0)}` : layerId === 'f' ? `Aktueller Lauf: ${formatDuration(ls.runTime)} · Reife ${formatPercent(fRipeness(g), 0)}` : '');
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
        txt(goalLine, c.goal.line(g));
        txt(status, done ? 'Geschafft' : isActive ? 'Läuft' : 'Offen');
        setCls(card, 'owned', done);
        setCls(card, 'active', isActive);
        setHidden(bar.el, done);
        setHidden(prog, done || !isActive);
        if (isActive) {
          bar.set(g.chProgress(c));
          txt(prog, c.goal.text(g));
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
    h('p', { class: 'muted', text: `Jeder Schauer lässt das Netz ${Math.round(T.rainSecs / 60)} Minuten lang schneller wachsen (Nährstoffe und Zucker ×${fmt(T.rainMult)}). Eine Ladung kommt alle ${Math.round(T.rainEvery / 60)} Minuten Spielzeit, auch wenn du weg bist, höchstens ${T.rainMax}. Mehrere Schauer addieren ihre Zeit.` }),
    status, btn);
  return {
    el,
    update() {
      const c = rainCharges(g);
      pips.forEach((p, i) => setCls(p, 'full', i < c));
      const r = g.state.myz.rain;
      txt(status, r.t > 0 ? `Es regnet: noch ${formatDuration(r.t)} (×${fmt(rainMult(g))}).` : c >= T.rainMax ? 'Alle Ladungen sind voll.' : `Nächste Ladung in ${formatDuration(rainNextIn(g))}.`);
      setDisabled(btn, c < 1);
    },
  };
}
export function doRain(ctx) {
  const { g, toast } = ctx;
  if (rainCast(g)) toast(`Wachstumsschub: ×${fmt(rainMult(g))} für ${Math.round(T.rainSecs / 60)} Minuten.`, { kind: 'good', ms: 1800, title: 'Regenschauer' });
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

function respecButton(ctx, fork) {
  const { g } = ctx;
  const text = {
    a: 'Der Ast samt Upgrades und Meilensteinen wird auf 0 gesetzt, dazu Nährstoffe und Hyphen. Erstattet wird nichts. Danach wählst du neu.',
    b: 'Der Ast samt Upgrades, Stufen und Meilensteinen wird auf 0 gesetzt, dazu alles darüber: Nährstoffe, Hyphen, Sporen, Mykorrhiza, Zucker und Fruchtkörper (Bestand). Erstattet wird nichts. Danach wählst du neu.',
  }[fork];
  const btn = h('button', { class: 'btn btn-block btn-ghost', type: 'button', text: 'Gabelung neu wählen …' });
  btn.addEventListener('click', async () => {
    const ok = await confirmDialog(text, { title: 'Gabelung neu wählen', ok: 'Zurücksetzen', danger: true });
    if (ok && g.forkRespec(fork)) {
      ctx.closeLayer();
      ctx.askFork(fork);
    }
  });
  return { el: h('section', { class: 'lv-sec' }, btn), update() {} };
}

/** "The other branch opens with the Waldnetz": a hint card in the branch views. */
function secondBranchHint(ctx, fork) {
  const { g } = ctx;
  const note = h('p', { class: 'muted small second-note' });
  const need = { a: 'w_a2', b: 'w_b2' }[fork];
  return {
    el: h('section', { class: 'lv-sec' }, note),
    update() {
      const open = g.forkSecondOpen(fork);
      const m = g.msById[need];
      txt(note, open ? 'Der zweite Ast ist offen: beide Äste wirken, und sie verstärken sich.' : `Der andere Ast öffnet sich mit dem Waldnetz (${m.name}).`);
    },
  };
}

/** Zersetzen: the stock rots into Humus (with a confirmation: Fruchtkörper, Sporen and Zucker in the stock are gone). */
function zersetzenCard(ctx) {
  const { g } = ctx;
  const info = h('p', { class: 'muted' });
  const preview = h('p', { class: 'zers-preview' });
  const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Zersetzen' });
  btn.addEventListener('click', async () => {
    const n = humusGain(g);
    if (n < 1) return;
    const ok = await confirmDialog(`Der Vorrat an Fruchtkörpern, Sporen und Zucker (${fmt(g.get('f'))} F, ${fmt(g.get('s'))} S, ${fmt(g.get('z'))} Z) fault zu Humus: +${fmt(n)} Humus. Ausgegebenes bleibt, was im Vorrat liegt, ist danach weg.`, { title: 'Zersetzen', ok: 'Zersetzen', danger: true });
    if (ok && zersetzen(g)) ctx.toast(`+${fmt(n)} Humus`, { kind: 'good', ms: 1800, title: 'Zersetzt' });
  });
  const el = h('div', { class: 'card zers-card' }, h('b', { text: 'Zersetzen' }), info, preview, btn);
  return {
    el,
    update() {
      const n = humusGain(g);
      txt(info, 'Was im Vorrat liegt (Fruchtkörper, Sporen, Zucker), fault zu Humus. Humus wird nicht ausgegeben: er verstärkt Fruchtkörper, Fäulnis und Erzeugung dauerhaft.');
      txt(preview, n >= 1 ? `Jetzt zersetzen: +${fmt(n)} Humus (aus Substrat ${fmt(substrate(g))})` : 'Noch zu wenig im Vorrat.');
      setDisabled(btn, n < 1);
    },
  };
}

/** The five rings and the Nachspiel. */
function ringCard(ctx) {
  const { g } = ctx;
  const dots = Array.from({ length: T.rings }, () => h('i', { class: 'rdot' }));
  const row = h('div', { class: 'rdots', 'aria-hidden': 'true' }, ...dots);
  const count = h('b', { class: 'ring-count num' });
  const next = h('p', { class: 'ring-next' });
  const need = h('p', { class: 'muted small' });
  const bar = progressBar();
  const after = h('div', { class: 'ring-after card', hidden: true }, h('b', { text: NACHSPIEL.title }), h('p', { text: NACHSPIEL.text }));
  const again = h('button', { class: 'btn btn-ghost btn-block', type: 'button', text: 'Ende noch einmal lesen', hidden: true, onClick: () => ctx.showEnding() });
  const el = h('div', { class: 'card ring-card' }, h('div', { class: 'p-head' }, h('b', { text: 'Hexenringe' }), count), row, next, bar.el, need, after, again);
  return {
    el,
    update() {
      const k = g.state.layers.r.units;
      const done = ended(g);
      txt(count, `${k} / ${T.rings}${k > T.rings ? ' +' + (k - T.rings) : ''}`);
      dots.forEach((d, i) => setCls(d, 'on', i < k));
      const cost = ringCost(k, g);
      const w = g.state.cur.w.total;
      txt(next, `Ring ${k + 1} kostet ${fmt(cost)} Waldfäden (insgesamt, jetzt ${fmt(w)}).`);
      bar.set(Math.min(1, w.toNumber() / cost));
      const wc = g.state.layers.w.count;
      const needW = k + T.ringW;
      txt(need, wc >= needW ? 'Waldnetze reichen.' : `Dazu braucht der Wald ${needW} Waldnetze (jetzt ${wc}).`);
      setHidden(after, !done);
      setHidden(again, !done);
    },
  };
}

/** The Jahresringe: the net counts its age; a little steady bonus and a regular event. */
function jahresringCard(ctx) {
  const { g } = ctx;
  const count = h('b', { class: 'num' });
  const sub = h('p', { class: 'muted small' });
  const el = h('div', { class: 'card', hidden: true }, h('div', { class: 'p-head' }, h('b', { text: 'Jahresringe' }), count), sub);
  return {
    el,
    update() {
      const m = g.state.myz;
      setHidden(el, !m.jrAt);
      txt(count, String(m.jr));
      const left = Math.max(0, m.jrAt - g.state.time.played);
      txt(sub, `Je älter das Netz, desto mehr trägt es: Fruchtkörper- und Waldfäden-Gewinn ×${fmt(jrMul(g))}. Der nächste Ring in ${formatDuration(left)} Spielzeit (auch wenn du weg bist, bis zur Grenze von 3 Stunden).`);
    },
  };
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
    add(milestoneBlock(ctx, 'n'));
    add(jahresringCard(ctx));
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
    add(secondBranchHint(ctx, 'a'));
    add(respecButton(ctx, 'a'));
  } else if (id === 'm') {
    add(stockCard(ctx, {
      title: 'Mykorrhiza',
      value: (gg) => fmt(gg.state.layers.m.units),
      sub: [(gg) => `Zucker: ${fmt(gg.get('z'))} (+${fmt(zRate(gg))}/s)`, (gg) => `Insgesamt erzeugt: ${fmt(gg.state.cur.z.run)}`],
    }));
    add(prestigeInfo(ctx, 'm'));
    add(upgradeGrid(ctx, 'm', 'Zucker-Upgrades', 'Bezahlt mit Zucker. Das Netz erzeugt ihn auch, wenn du nicht da bist.'));
    add(milestoneBlock(ctx, 'm'));
    add(secondBranchHint(ctx, 'a'));
    add(respecButton(ctx, 'a'));
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
  } else if (id === 'l') {
    add(stockCard(ctx, {
      title: 'Flechten',
      value: (gg) => fmt(gg.get('l')),
      sub: [(gg) => `+${fmt(lRate(gg) * 3600)} pro Stunde (Algen)`, (gg) => `Fruchtkörper-Gewinn ×${fmt(fGainParts(gg).reduce((a, [, v]) => a * v, 1))} · Waldfäden-Gewinn ×${fmt(wGainParts(gg).reduce((a, [, v]) => a * v, 1))}`],
    }));
    add(prestigeInfo(ctx, 'l'));
    add(upgradeGrid(ctx, 'l', 'Flechten-Upgrades', 'Bezahlt mit Flechten. Alge und Licht kannst du halten, um mehrere Stufen zu kaufen. Die Upgrades erscheinen mit den Durchläufen und innerhalb eines Laufs.'));
    add(milestoneBlock(ctx, 'l'));
    add(autoSwitch(g, 'auto_l', { label: 'Flechte automatisch wachsen lassen', hint: 'Sobald sie reif ist.' }));
    add(autoSwitch(g, 'auto_bbuy', { label: 'Flechten- und Fäulnis-Upgrades automatisch kaufen', hint: 'Kauft, was am meisten bringt.' }));
    add(secondBranchHint(ctx, 'b'));
    add(respecButton(ctx, 'b'));
  } else if (id === 'z') {
    add(stockCard(ctx, {
      title: 'Fäulnis',
      value: (gg) => fmt(gg.get('fa')),
      sub: [(gg) => `+${fmt(faRate(gg) * 3600)} pro Stunde (Totholz)`, (gg) => `Humus: ${fmt(humus(gg))} · Fruchtkörper-Gewinn ×${fmt(fGainParts(gg).reduce((a, [, v]) => a * v, 1))}`],
    }));
    add(zersetzenCard(ctx));
    add(prestigeInfo(ctx, 'z'));
    add(upgradeGrid(ctx, 'z', 'Fäulnis-Upgrades', 'Bezahlt mit Fäulnis. Totholz kannst du halten, um mehrere Stufen zu kaufen.'));
    add(milestoneBlock(ctx, 'z'));
    add(autoSwitch(g, 'auto_z', { label: 'Fäulnis automatisch wachsen lassen', hint: 'Sobald sie reif ist.' }));
    add(autoSwitch(g, 'auto_zers', { label: 'Automatisch zersetzen', hint: 'Sobald der Humus um 10 % wüchse.' }));
    add(autoSwitch(g, 'auto_bbuy', { label: 'Flechten- und Fäulnis-Upgrades automatisch kaufen', hint: 'Kauft, was am meisten bringt.' }));
    add(secondBranchHint(ctx, 'b'));
    add(respecButton(ctx, 'b'));
  } else if (id === 'w') {
    add(stockCard(ctx, {
      title: 'Waldfäden',
      value: (gg) => fmt(gg.get('w')),
      sub: [(gg) => `Insgesamt: ${fmt(gg.state.cur.w.total)}`, (gg) => `Waldfäden-Gewinn ×${fmt(wGainParts(gg).reduce((a, [, v]) => a * v, 1))}`],
    }));
    add(prestigeInfo(ctx, 'w'));
    add(upgradeGrid(ctx, 'w', 'Bäume und Pfade', 'Bezahlt mit Waldfäden. Jeder Baum wirkt anders; halte den Knopf, um mehrere Stufen zu kaufen.'));
    add(milestoneBlock(ctx, 'w'));
    add(autoSwitch(g, 'auto_wbuy', { label: 'Baum-Upgrades automatisch kaufen', hint: 'Kauft den nützlichsten Baum.' }));
    add(autoSwitch(g, 'auto_w', { label: 'Waldnetz automatisch wachsen lassen', hint: 'Sobald es reif ist.' }));
  } else if (id === 'r') {
    add(stockCard(ctx, {
      title: 'Hexenring',
      value: (gg) => `${gg.state.layers.r.units} ${gg.state.layers.r.units === 1 ? 'Ring' : 'Ringe'}`,
      sub: [(gg) => `Jeder Ring: alle tiefen Gewinne +${fmt(T.ringBonus * 100)} %`],
    }));
    add(ringCard(ctx));
    add(milestoneBlock(ctx, 'r'));
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
