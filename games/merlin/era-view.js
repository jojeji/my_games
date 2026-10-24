// Merlin: the "Epochen" tab - era card with goal + jump button, Anachronismen (planting ideas), Splitter-Laden, Zyklus.
import { h, txt, setHidden, setDisabled, setCls } from '../../engine/ui/dom.js';
import { holdRepeat } from '../../engine/ui/hold.js';
import { openModal } from '../../engine/ui/modal.js';
import { upgradeList, milestoneList, section, sectionTitle, progressBar, autoConfigRow } from '../../engine/ui/kit-views.js';
import { formatNumber as fmt } from '../../engine/format.js';
import { ERAS, IDEAS } from './eras.js';
import { jumpThreshold, ideasOwned } from './def.js';

const FINAL = ERAS.length - 1;

function ideaCard(g, idea, askPrestige) {
  const u = g.upgById[idea.id];
  const curName = g.currencyById[u.currency].name;
  const other = idea.excl ? IDEAS.find((i) => i.id === idea.excl) : null;
  const name = h('b', { class: 'upg-name', text: idea.name });
  const tag = h('span', { class: 'upg-lvl' });
  const quote = h('p', { class: 'idea-text', text: idea.text });
  const eff = h('p', { class: 'upg-eff', text: idea.desc });
  const note = h('p', { class: 'upg-note' });
  const btn = h('button', { class: 'btn btn-buy', type: 'button' });
  btn.addEventListener('click', () => g.upgBuy(idea.id));
  const el = h('div', { class: 'card upg idea' }, h('div', { class: 'upg-head' }, name, tag), quote, eff, note, btn);
  return {
    el,
    update() {
      const owned = g.upgLevel(idea.id) > 0;
      const cur = g.state.mer.era;
      const excluded = g.upgExcluded(u);
      txt(tag, owned ? 'Gepflanzt' : other ? 'Entweder / oder' : '');
      let n = '';
      if (!owned) {
        if (cur !== idea.era) n = 'Diese Epoche liegt hinter dir.';
        else if (excluded) n = `Gesperrt: du hast „${other.name}“ gewählt.`;
        else if (other) n = `Schließt „${other.name}“ aus.`;
      }
      txt(note, n);
      setHidden(note, !n);
      setCls(el, 'owned', owned);
      setCls(el, 'locked', !owned && (excluded || cur !== idea.era));
      setHidden(btn, owned);
      if (!owned) {
        txt(btn, `Pflanzen · ${fmt(g.upgCost(idea.id))} ${curName}`);
        setDisabled(btn, !g.upgCanBuy(idea.id));
      }
    },
  };
}

export function buildEraTab(ctx) {
  const { g } = ctx;
  const parts = [];
  const stack = h('div', { class: 'stack' });
  const add = (v, wrap) => {
    parts.push(v);
    stack.append(wrap || v.el);
  };

  /* ---- era card ---- */
  const eyebrow = h('p', { class: 'era-eyebrow' });
  const title = h('h2', { class: 'p-title era-title' });
  const blurb = h('p', { class: 'muted' });
  const rule = h('p', { class: 'era-rule' });
  const perk = h('p', { class: 'era-perk muted small' });
  const goalText = h('p', { class: 'p-next' });
  const bar = progressBar();
  const jumpBtn = h('button', { class: 'btn btn-primary btn-big', type: 'button', onClick: () => askPrestige('jump') });
  const cycleBtn = h('button', { class: 'btn btn-primary btn-big', type: 'button', onClick: () => askPrestige('cycle') });
  const ideaHint = h('p', { class: 'upg-note' });
  const autoJump = autoConfigRow(g, 'auto_jump');
  const eraCard = h('div', { class: 'card prestige era-card' }, eyebrow, title, blurb, rule, perk, goalText, bar.el, jumpBtn, cycleBtn, ideaHint);
  parts.push({
    update() {
      const e = g.state.mer.era;
      const E = ERAS[e];
      txt(eyebrow, `Epoche ${e + 1} von ${ERAS.length} · ${E.year}${g.state.layers.cycle.count ? ` · Zyklus ${g.state.layers.cycle.count + 1}` : ''}`);
      txt(title, E.name);
      txt(blurb, E.blurb);
      txt(rule, 'Besonderheit: ' + E.ruleText);
      txt(perk, e < FINAL ? `Erbe beim Verlassen: Produktion ×1,5${E.perkText ? ' · ' + E.perkText : ''}` : 'Hier endet die Reise – und beginnt sie.');
      const thr = jumpThreshold(g);
      const have = g.state.cur.mem.run;
      const finished = g.state.mer.finished;
      txt(goalText, e < FINAL ? `Ziel: ${fmt(have)} / ${fmt(thr)} Erinnerungen in dieser Epoche` : finished ? 'Das Erste Wort ist gesprochen.' : `Das Erste Wort: ${fmt(have)} / ${fmt(thr)} Erinnerungen`);
      bar.set(finished ? 1 : Math.min(1, have.div(thr).toNumber()));
      // jump
      setHidden(jumpBtn, e >= FINAL);
      if (e < FINAL) {
        const can = g.canPrestige('jump');
        txt(jumpBtn, can ? `Eine Epoche zurückreisen · +${fmt(g.prestigeGain('jump'))} Splitter` : 'Epochensprung: Ziel noch nicht erreicht');
        setDisabled(jumpBtn, !can);
        const planted = IDEAS.some((i) => i.era === e && g.upgLevel(i.id) > 0);
        txt(ideaHint, can && !planted ? 'Tipp: Pflanze vorher einen Anachronismus – danach ist diese Epoche vorbei.' : '');
        setHidden(ideaHint, !(can && !planted));
      } else setHidden(ideaHint, true);
      // cycle
      setHidden(cycleBtn, !(e >= FINAL && finished));
      if (e >= FINAL && finished) {
        txt(cycleBtn, `Den Kreis schließen · +${fmt(g.prestigeGain('cycle'))} Ewigkeit`);
        setDisabled(cycleBtn, !g.canPrestige('cycle'));
      }
    },
  });
  stack.append(eraCard);
  add(autoJump);

  /* ---- ideas ---- */
  const ideaBox = h('div', { class: 'stack' });
  const ideaTitle = sectionTitle('Anachronismen', 'Ideen, die zu früh kommen');
  const ideaCards = IDEAS.map((i) => ({ i, c: ideaCard(g, i, null) }));
  ideaBox.append(h('p', { class: 'muted small', text: 'Pflanze Ideen in den Menschen dieser Epoche. Sie bleiben dauerhaft (in diesem Zyklus). Zwei Ideen schließen sich je gegenseitig aus – beide Wege sind gut.' }));
  for (const { c } of ideaCards) ideaBox.append(c.el);
  stack.append(ideaTitle, ideaBox);
  parts.push({
    update() {
      const e = g.state.mer.era;
      for (const { i, c } of ideaCards) {
        // current era always; earlier eras only when something was planted there
        const show = i.era === e || (i.era < e && g.upgLevel(i.id) > 0);
        setHidden(c.el, !show);
        if (show) c.update();
      }
      setHidden(ideaTitle, false);
      txt(ideaTitle.querySelector('small'), `${ideasOwned(g)} gepflanzt`);
    },
  });

  /* ---- shop (Epochensplitter) ---- */
  const shopTitle = sectionTitle('Splitter-Laden', 'dauerhaft bis zum Zyklus');
  const shopCur = h('p', { class: 'muted small' });
  const shopBox = h('div', { class: 'stack' }, shopCur);
  stack.append(shopTitle, shopBox);
  const shop = upgradeList(g, 'shards', { buyAllLabel: 'Alles kaufen' });
  shopBox.append(shop.el);
  parts.push({
    update() {
      const vis = g.state.layers.jump.count > 0 || g.state.cur.shards.total.gt(0);
      setHidden(shopTitle, !vis);
      setHidden(shopBox, !vis);
      if (!vis) return;
      txt(shopCur, `Epochensplitter: ${fmt(g.get('shards'))}`);
      shop.update();
    },
  });

  /* ---- Zyklus / Ewigkeit ---- */
  const eterTitle = sectionTitle('Ewigkeit', 'bleibt über Zyklen');
  const eterBox = h('div', { class: 'stack' });
  const eterCur = h('p', { class: 'muted small' });
  const eter = upgradeList(g, 'eternity', { buyAllLabel: 'Alles kaufen' });
  eterBox.append(eterCur, eter.el);
  stack.append(eterTitle, eterBox);
  parts.push({
    update() {
      const vis = g.state.layers.cycle.count > 0 || g.state.mer.finished || g.state.cur.eternity.total.gt(0);
      setHidden(eterTitle, !vis);
      setHidden(eterBox, !vis);
      if (!vis) return;
      txt(eterCur, `Ewigkeit: ${fmt(g.get('eternity'))} · Zyklen geschlossen: ${g.state.layers.cycle.count}`);
      eter.update();
    },
  });

  /* ---- journey (past eras) + milestones ---- */
  const journey = h('div', { class: 'stack' });
  const journeyRows = ERAS.map((E, i) => {
    const sub = h('small', { class: 'muted' });
    const el = h('div', { class: 'card journey-row', hidden: true }, h('b', { text: `${i + 1}. ${E.name}` }), h('small', { class: 'muted', text: E.year }), sub);
    journey.append(el);
    return { i, el, sub };
  });
  stack.append(section('Die Reise bisher', journey, { open: false }));
  parts.push({
    update() {
      const e = g.state.mer.era;
      for (const r of journeyRows) {
        setHidden(r.el, r.i > e);
        if (r.i > e) continue;
        const names = IDEAS.filter((x) => x.era === r.i && g.upgLevel(x.id) > 0).map((x) => x.name);
        txt(r.sub, r.i === e ? 'Aktuelle Epoche' : names.length ? 'Gepflanzt: ' + names.join(', ') : 'Nichts gepflanzt');
      }
    },
  });
  const ms = milestoneList(g, 'jump');
  stack.append(section('Meilensteine der Reise', ms.el, { open: false }));
  parts.push(ms);

  return { el: stack, update: () => parts.forEach((p) => p.update()) };
}
