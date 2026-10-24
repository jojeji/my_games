// Merlin - Rückwärts durch die Zeit: game definition (data + hooks). Pure and DOM-free (runs in Node for tests/sim).
import { D, Decimal, ONE } from '../../engine/decimal.js';
import { prestigeAuto } from '../../engine/kit/game.js';
import { formatNumber } from '../../engine/format.js';
import { TUNE as T } from './tune.js';
import { ERAS, IDEAS } from './eras.js';
import { STORY, ideaStories, CHAPTERS } from './story.js';

const pow = (a, b) => Decimal.pow(a, b);
const era = (g) => g.state.mer.era;
const FINAL = ERAS.length - 1;
const lv = (g, id) => g.upgLevel(id);
const has = (g, id) => g.upgLevel(id) > 0;
const rule = (g, k, d = 1) => ERAS[era(g)].rules[k] ?? d;
const cleared = (g, k) => !!g.state.mer.eraDone[k];
const clearedCount = (g) => Object.keys(g.state.mer.eraDone).length;
const spellOn = (g, id) => g.spellActive(id);

/* ------------------------------------------------------------------ */
/* ideas (Anachronismen) aggregated effects                            */
/* ------------------------------------------------------------------ */

/** Product (mode 'mul') or sum (mode 'add') of one effect key over all planted ideas. */
/** Achievements that count for the production bonus (the 'Einunddreißig' keepsake does not). */
export const BONUSLESS_ACH = ['x31', 'knapp']; // keepsake / joke achievements: no production bonus
export const bonusAch = (g) => g.achCount() - BONUSLESS_ACH.filter((id) => g.state.ach[id] !== undefined).length;

export function ideaFx(g, key, mode = 'mul') {
  let v = mode === 'mul' ? 1 : 0;
  for (const i of IDEAS) {
    const x = i.fx[key];
    if (x === undefined || !has(g, i.id)) continue;
    if (mode === 'mul') v *= x;
    else v += x;
  }
  return v;
}

export const ideasOwned = (g) => IDEAS.filter((i) => has(g, i.id)).length;

/* ------------------------------------------------------------------ */
/* numbers shared between logic and UI                                  */
/* ------------------------------------------------------------------ */

export function jumpThreshold(g) {
  return T.eraThr[era(g)] * Math.pow(0.7, lv(g, 'e_erinnert'));
}

/** (1+x)^e, beyond `cap` the exponent halves. */
export function boost(x, e, cap) {
  if (x.lte(cap)) return x.add(1).pow(e);
  return D(cap + 1).pow(e).mul(x.div(cap).pow(e / 2));
}

/** Labeled global production multipliers (without time-limited spell effects). */
export function globalParts(g) {
  const s = g.state;
  const parts = [];
  parts.push(['Erinnerungen', boost(s.cur.mem.run, T.memBoostExp + 0.05 * lv(g, 'weitblick'), T.memBoostCap)]);
  if (s.cur.shards.run.gt(0)) parts.push(['Epochensplitter', s.cur.shards.run.add(1).pow(T.shardBoostExp)]);
  const rt = s.layers.rejuv.runTime;
  if (rt > 0) parts.push(['Reifung (Zeit seit Verjüngung)', pow(1 + rt / T.ripeTau, T.ripeExp)]);
  const nc = clearedCount(g);
  if (nc) parts.push(['Epochen-Erbe', pow(T.eraReward, nc)]);
  if (s.cur.eternity.total.gt(0)) parts.push(['Ewigkeit', s.cur.eternity.total.add(1).pow(T.eternityBoostExp)]);
  parts.push(['Erfolge', D(1 + 0.02 * bonusAch(g))]);
  if (has(g, 'fruehauf')) parts.push(['Frühaufsteher', D(2)]);
  if (lv(g, 'magnet')) parts.push(['Sandmagnet', pow(1.25, lv(g, 'magnet'))]);
  const ip = ideaFx(g, 'prod');
  if (ip !== 1) parts.push(['Anachronismen', D(ip)]);
  if (lv(g, 's_erbe')) parts.push(['Erbe der Epochen', pow(1.5, lv(g, 's_erbe'))]);
  if (lv(g, 'e_kreis')) parts.push(['Kreis der Zeit', pow(3, lv(g, 'e_kreis'))]);
  const er = rule(g, 'prod');
  if (er !== 1) parts.push(['Epochen-Besonderheit', D(er)]);
  return parts;
}

const memGainMult = (g) =>
  Math.pow(1.2, lv(g, 'rueckwaerts')) * ideaFx(g, 'mem') * Math.pow(1.5, lv(g, 's_ernte')) * Math.pow(2, lv(g, 'e_ernte')) * rule(g, 'mem') * (cleared(g, 5) ? 1.2 : 1);

export const zeitMult = (g) => T.spells.zeit.mult + 2 * lv(g, 'zr_meister');
export const rueckSecs = (g) => T.spells.rueck.secs + 30 * lv(g, 'rb_meister') + (cleared(g, 1) ? 30 : 0);
const durMult = (g) => (1 + 0.2 * lv(g, 'lange')) * ideaFx(g, 'spellDur') * (has(g, 's_ahnung') ? 1.5 : 1) * rule(g, 'spellDur') * (cleared(g, 2) ? 1.1 : 1);
const cdMult = (g) => Math.pow(0.88, lv(g, 'zeitgefuehl')) * ideaFx(g, 'spellCd') * Math.pow(0.85, lv(g, 's_zeit')) * rule(g, 'spellCd');

export function synergyScale(g) {
  const base = 1 + ideaFx(g, 'syn', 'add') + rule(g, 'syn', 0) + (cleared(g, 4) ? 0.1 : 0) + 0.4 * lv(g, 'synstudium') + (has(g, 's_syn') ? 0.5 : 0);
  return base * (spellOn(g, 'prophe') ? T.spells.prophe.syn : 1);
}

function costDiv(g) {
  const mult = ideaFx(g, 'cost') * rule(g, 'cost') * (cleared(g, 3) ? 0.9 : 1);
  return D(Math.pow(1.25, lv(g, 'rabatt')) * (spellOn(g, 'still') ? T.spells.still.div : 1) / mult);
}

export function startSand(g) {
  const g0 = g.cache.prod?.quellen?.global || ONE;
  return D(T.startSand * Math.pow(4, lv(g, 'gepaeck')) * Math.pow(10, lv(g, 's_start'))).mul(g0.pow(0.3));
}

export function tapMax(g) {
  const base = T.tapCharges + 2 * lv(g, 'palast') + ideaFx(g, 'charges', 'add') + (cleared(g, 0) ? 1 : 0) + 5 * lv(g, 'e_tap') + (has(g, 's_tap2') ? 3 : 0) + (g.hasMs('j2') ? 1 : 0);
  return Math.floor(base * rule(g, 'charges'));
}
export const tapRegen = (g) => Math.max(T.tapRegenMin, T.tapRegen * Math.pow(0.88, lv(g, 'sanduhr')) * ideaFx(g, 'regen') * Math.pow(0.8, lv(g, 'e_tap')));
export const tapSeconds = (g) => T.tapSeconds + T.tapPerLevel * lv(g, 'gestern') + ideaFx(g, 'tapSec', 'add') + (cleared(g, 6) ? 1 : 0);
export function tapMult(g) {
  return rule(g, 'tap') * (spellOn(g, 'sturm') ? T.spells.sturm.tapMult : 1) * (has(g, 's_tap') ? 2 : 1);
}

/* ------------------------------------------------------------------ */
/* definition                                                          */
/* ------------------------------------------------------------------ */

const slotDefs = T.slotCost.map((c, i) => ({ name: ERAS[0].slots[i][0], desc: ERAS[0].slots[i][1], baseCost: c, costMult: T.slotRatio[i], rate: T.slotRate[i] * T.rateScale }));
const SYN = [
  [[1, 0.01]],
  [[2, 0.01]],
  [[3, 0.01], [0, 0.003]],
  [[4, 0.01]],
  [[5, 0.01], [1, 0.004]],
  [[6, 0.01]],
  [[7, 0.015], [3, 0.004]],
  [[0, 0.01], [2, 0.003]],
];
SYN.forEach((s, i) => (slotDefs[i].synergies = s.map(([from, per]) => ({ from, per }))));

const bundleCache = {};
const BASIC_KEEP = new Set(['fruehauf', 'gestern', 'zeitgefuehl', 'palast', 'rabatt', 'sanduhr']);
const keepMem = (id) => (g, L) => L === 2 && (has(g, 's_unv2') || (has(g, 's_unv1') && BASIC_KEEP.has(id)));
const memCost = (a, r) => (l, g) => Math.ceil(a * Math.pow(r, l) * Math.pow(T.memCostGrowth, g ? era(g) : 0));
const mem = (o) => ({ group: 'mem', layer: 1, currency: 'mem', keep: keepMem(o.id), ...o });
const shop = (o) => ({ group: 'shards', layer: 2, currency: 'shards', keep: (g, L) => L === 3 && has(g, 'e_wort'), ...o });
const eter = (o) => ({ group: 'eternity', layer: 3, currency: 'eternity', ...o });
const x = (n, d = 1) => '×' + n.toFixed(d).replace('.', ',').replace(/,0$/, '');
const pct = (v) => Math.round(v * 100) + ' %';

const memUpgrades = [
  mem({ id: 'fruehauf', name: 'Frühaufsteher', desc: 'Produktion ×2.', cost: 1, effect: (l) => (l ? 2 : 1), fmt: () => '×2' }),
  mem({ id: 'gestern', name: 'Erinnerung an Gestern', desc: 'Die Sanduhr zahlt 0,75 s mehr Produktion pro Stufe.', max: 4, cost: memCost(3, 5), fmt: (e, l) => `+${(T.tapPerLevel * l).toFixed(2).replace('.', ',')} s` }),
  mem({ id: 'zeitgefuehl', name: 'Zeitgefühl', desc: 'Zauber laden 12 % schneller pro Stufe.', max: 4, cost: memCost(60, 6), fmt: (e, l) => `×${Math.pow(0.88, l).toFixed(2).replace('.', ',')} Abklingzeit` }),
  mem({ id: 'palast', name: 'Gedächtnispalast', desc: 'Die Sanduhr fasst +2 Ladungen pro Stufe.', max: 4, cost: memCost(30, 5), fmt: (e, l) => `+${2 * l} Ladungen` }),
  mem({ id: 'gepaeck', name: 'Reisegepäck', desc: 'Startsand nach jeder Verjüngung ×4 pro Stufe.', max: 4, cost: memCost(100, 6), fmt: (e, l) => `×${Math.pow(4, l)}` }),
  mem({ id: 'rabatt', name: 'Mengenrabatt', desc: 'Quellen kosten 20 % weniger pro Stufe.', max: 5, cost: memCost(200, 6), fmt: (e, l) => `÷${Math.pow(1.25, l).toFixed(2).replace('.', ',')}` }),
  mem({ id: 'synstudium', name: 'Synergie-Studium', desc: 'Synergien wirken 40 % stärker pro Stufe.', max: 4, cost: memCost(500, 6), fmt: (e, l) => `+${pct(0.4 * l)}` }),
  mem({ id: 'rueckwaerts', name: 'Rückwärts-Rechnen', desc: 'Erinnerungen-Gewinn ×1,2 pro Stufe.', max: 5, cost: memCost(1500, 6), fmt: (e, l) => '×' + Math.pow(1.2, l).toFixed(2).replace('.', ',') }),
  mem({ id: 'lange', name: 'Lange Nächte', desc: 'Zauber wirken 20 % länger pro Stufe.', max: 4, cost: memCost(100, 5), fmt: (e, l) => `+${pct(0.2 * l)}` }),
  mem({ id: 'eulenpost', name: 'Eulenpost', desc: 'Quellen-Meilensteine kommen 20 % früher pro Stufe.', max: 2, cost: memCost(4000, 10), fmt: (e, l) => `−${pct(1 - Math.pow(0.8, l))}` }),
  sandMagnet(),
  mem({ id: 'sanduhr', name: 'Sanduhr-Meisterin', desc: 'Die Sanduhr lädt 12 % schneller pro Stufe.', max: 4, cost: memCost(40, 5), fmt: (e, l) => `×${Math.pow(0.88, l).toFixed(2).replace('.', ',')} Ladezeit` }),
  mem({ id: 'zr_meister', name: 'Zeitraffer-Meisterschaft', desc: 'Zeitraffer wirkt +2 stärker pro Stufe.', max: 4, cost: memCost(300, 5), show: (g) => g.spellUnlocked('zeit'), fmt: (e, l) => `×${T.spells.zeit.mult + 2 * l}` }),
  mem({ id: 'rb_meister', name: 'Rückblick-Meisterschaft', desc: 'Rückblick holt 30 s mehr Produktion pro Stufe.', max: 3, cost: memCost(400, 5), show: (g) => g.spellUnlocked('rueck'), fmt: (e, l) => `+${30 * l} s` }),
  mem({ id: 'weitblick', name: 'Weitblick', desc: 'Erinnerungen verstärken die Produktion stärker (+0,05 im Exponenten).', max: 3, cost: memCost(5000, 8), fmt: (e, l) => `+${(0.05 * l).toFixed(2).replace('.', ',')}` }),
];
function sandMagnet() {
  return mem({ id: 'magnet', name: 'Sandmagnet', desc: 'Produktion ×1,25 pro Stufe.', max: 6, cost: memCost(80, 4), fmt: (e, l) => '×' + Math.pow(1.25, l).toFixed(2).replace('.', ',') });
}

const shopUpgrades = [
  shop({ id: 's_unv1', name: 'Unvergessen I', desc: 'Behalte die Grundlagen-Erinnerungen (Frühaufsteher, Gestern, Zeitgefühl, Palast, Rabatt, Sanduhr) beim Epochensprung.', cost: 3 }),
  shop({ id: 's_unv2', name: 'Unvergessen II', desc: 'Behalte ALLE Erinnerungen-Upgrades beim Epochensprung.', cost: 14, requires: ['s_unv1'] }),
  shop({ id: 's_erbe', name: 'Erbe der Epochen', desc: 'Produktion ×1,5 pro Stufe.', max: 5, cost: (l) => Math.ceil(2 * Math.pow(2.3, l)), fmt: (e, l) => '×' + Math.pow(1.5, l).toFixed(2).replace('.', ',') }),
  shop({ id: 's_ernte', name: 'Reiche Ernte', desc: 'Erinnerungen-Gewinn ×1,5 pro Stufe.', max: 4, cost: (l) => Math.ceil(3 * Math.pow(2.6, l)), fmt: (e, l) => '×' + Math.pow(1.5, l).toFixed(2).replace('.', ',') }),
  shop({ id: 's_zeit', name: 'Gestundete Zeit', desc: 'Zauber laden 15 % schneller pro Stufe.', max: 3, cost: (l) => Math.ceil(4 * Math.pow(3, l)), fmt: (e, l) => `×${Math.pow(0.85, l).toFixed(2).replace('.', ',')}` }),
  shop({ id: 's_start', name: 'Sandvorrat', desc: 'Startsand ×10 pro Stufe.', max: 3, cost: (l) => 2 + l * 3, fmt: (e, l) => `×${Math.pow(10, l)}` }),
  shop({ id: 's_ahnung', name: 'Vorahnung', desc: 'Alle Zauber wirken 50 % länger.', cost: 6 }),
  shop({ id: 's_syn', name: 'Weberin der Zeit', desc: 'Synergien +50 %.', cost: 8 }),
  shop({ id: 's_bruecke', name: 'Brückenbauer', desc: 'Quellen-Meilensteine verdoppeln nicht ×2, sondern ×2,5.', cost: 15 }),
  shop({ id: 's_tap', name: 'Sandseele', desc: 'Die Sanduhr zahlt doppelt so viel.', cost: 5 }),
  shop({ id: 's_tap2', name: 'Tiefe Taschen', desc: 'Die Sanduhr fasst +3 Ladungen.', cost: 8 }),
  shop({ id: 's_auto', name: 'Zeitkompass', desc: 'Schaltet die Auto-Epochensprung-Option frei.', cost: 10 }),
];

const eternityUpgrades = [
  eter({ id: 'e_kreis', name: 'Kreis der Zeit', desc: 'Produktion ×3 pro Stufe.', max: 6, cost: (l) => Math.ceil(1 * Math.pow(1.9, l)), fmt: (e, l) => '×' + Math.pow(3, l) }),
  eter({ id: 'e_erinnert', name: 'Erinnerte Zukunft', desc: 'Epochen-Ziele (Erinnerungen) ×0,7 pro Stufe.', max: 3, cost: (l) => 3 + l * 4, fmt: (e, l) => `×${Math.pow(0.7, l).toFixed(2).replace('.', ',')}` }),
  eter({ id: 'e_ernte', name: 'Ewiger Rhythmus', desc: 'Erinnerungen-Gewinn ×2 pro Stufe.', max: 4, cost: (l) => 2 + l * 3, fmt: (e, l) => '×' + Math.pow(2, l) }),
  eter({ id: 'e_wort', name: 'Das Wort bleibt', desc: 'Der Epochensplitter-Laden bleibt über Zyklen erhalten.', cost: 6 }),
  eter({ id: 'e_erbe', name: 'Epochen-Gedächtnis', desc: 'Das Epochen-Erbe (abgeschlossene Epochen) bleibt über Zyklen erhalten.', cost: 5 }),
  eter({ id: 'e_ideen', name: 'Gesammelte Ideen', desc: 'Gepflanzte Anachronismen bleiben über Zyklen erhalten.', cost: 9 }),
  eter({ id: 'e_zwei', name: 'Zweiter Gedanke', desc: 'Anachronismen, die sich sonst ausschließen, dürfen beide gepflanzt werden.', cost: 12 }),
  eter({ id: 'e_tap', name: 'Ewiger Sand', desc: 'Sanduhr: +5 Ladungen und 20 % schnellere Ladung pro Stufe.', max: 2, cost: (l) => 4 + l * 5, fmt: (e, l) => `+${5 * l} Ladungen` }),
];

const ideaUpgrades = IDEAS.map((i) => {
  const shards = i.id.endsWith('c') && i.era > 0;
  return {
    id: i.id, group: 'idea', layer: 2, era: i.era,
    currency: shards ? 'shards' : 'mem',
    name: i.name, desc: i.desc, text: i.text,
    cost: shards ? 1 + i.era : () => Math.ceil(T.ideaFrac * T.eraThr[i.era]),
    excl: i.excl ? [i.excl] : undefined,
    require: (g) => era(g) === i.era,
    show: (g) => era(g) >= i.era,
    keep: (g, L) => L === 3 && has(g, 'e_ideen'),
  };
});

const upgrades = [...memUpgrades, ...shopUpgrades, ...eternityUpgrades, ...ideaUpgrades];

/* ----------------------------- milestones ----------------------------- */
const rm = (at, name, desc) => ({ id: 'v' + at, layer: 'rejuv', at, name: `${at}. Verjüngung`, desc: `${name}: ${desc}` });
const milestones = [
  rm(1, 'Rückblick', 'Zauber freigeschaltet.'),
  rm(2, 'Quellenwächter', 'Quellen werden automatisch gekauft.'),
  rm(3, 'Stillstand', 'Zauber freigeschaltet.'),
  rm(4, 'Sanduhr-Automat', 'Die Sanduhr wird automatisch gewendet (auch offline).'),
  rm(5, 'Kreislauf', 'Verjüngung kann automatisch ausgelöst werden.'),
  rm(6, 'Sandsturm', 'Zauber freigeschaltet.'),
  rm(8, 'Zauberlehrling', 'Zauber können automatisch gewirkt werden.'),
  rm(10, 'Weissagung', 'Zauber freigeschaltet (sonst ab der Gegenwart).'),
  rm(12, 'Gedächtnishelfer', 'Erinnerungen-Upgrades werden automatisch gekauft.'),
  { id: 'j2', layer: 'jump', at: 2, name: '2 Epochensprünge', desc: 'Sanduhr: +1 Ladung.' },
  { id: 'j4', layer: 'jump', at: 4, name: '4 Epochensprünge', desc: 'Du hast Camelot erreicht – die Legende kennt dich jetzt.' },
  { id: 'j7', layer: 'jump', at: 7, name: '7 Epochensprünge', desc: 'Du stehst am Anfang aller Dinge.' },
];

/* ----------------------------- spells ----------------------------- */
const S = T.spells;
const spells = [
  {
    lockText: '300 Zeitsand gesammelt',
    id: 'zeit', name: 'Zeitraffer', icon: 'zeit', desc: 'Die Zeit läuft schneller: alle Quellen produzieren mehr.',
    unlock: (g) => g.state.cur.sand.total.gte(300),
    duration: (g) => S.zeit.dur * durMult(g),
    cooldown: (g) => S.zeit.cd * cdMult(g),
    info: (g) => `Produktion ×${zeitMult(g)}`,
  },
  {
    lockText: '1. Verjüngung',
    id: 'rueck', name: 'Rückblick', icon: 'rueck', desc: 'Du holst dir sofort einen Teil der Produktion der nächsten Sekunden.',
    unlock: (g) => g.hasMs('v1'),
    duration: () => 0,
    cooldown: (g) => S.rueck.cd * cdMult(g),
    cast: (g) => g.add('sand', g.cache.prod.quellen.total.mul(rueckSecs(g))),
    info: (g) => `+${rueckSecs(g)} s Produktion sofort`,
  },
  {
    lockText: '3. Verjüngung',
    id: 'still', name: 'Stillstand', icon: 'still', autoDefault: false, desc: 'Die Zeit hält den Atem an: Quellen werden billiger.',
    unlock: (g) => g.hasMs('v3'),
    duration: (g) => S.still.dur * durMult(g),
    cooldown: (g) => S.still.cd * cdMult(g),
    info: () => `Quellen kosten ÷${S.still.div}`,
  },
  {
    lockText: '6. Verjüngung',
    id: 'sturm', name: 'Sandsturm', icon: 'sturm', desc: 'Die Sanduhr füllt sich sofort und zahlt mehr.',
    unlock: (g) => g.hasMs('v6'),
    duration: (g) => S.sturm.dur * durMult(g),
    cooldown: (g) => S.sturm.cd * cdMult(g),
    cast: (g) => g.tapRefill(),
    info: () => `Sanduhr-Ertrag ×${S.sturm.tapMult}, alle Ladungen voll`,
  },
  {
    lockText: '10. Verjüngung oder die Gegenwart erreichen',
    id: 'prophe', name: 'Weissagung', icon: 'prophe', desc: 'Die Quellen sehen einander in die Zukunft: Synergien wirken stärker.',
    unlock: (g) => g.hasMs('v10') || era(g) >= 2,
    duration: (g) => S.prophe.dur * durMult(g),
    cooldown: (g) => S.prophe.cd * cdMult(g),
    info: () => `Synergien ×${S.prophe.syn}`,
  },
];

/* ----------------------------- autos ----------------------------- */
const autos = [
  { id: 'auto_buy', name: 'Quellen automatisch kaufen', desc: 'Kauft Quellen mit dem besten Verhältnis von Preis und Ertrag.', kind: 'gen', group: 'gen', unlock: (g) => g.hasMs('v2'), interval: () => 1.5, run: (g) => g.prodBuyAll('quellen') },
  { id: 'auto_tap', name: 'Sanduhr automatisch wenden', desc: 'Wendet die Sanduhr regelmäßig – auch in deiner Abwesenheit.', kind: 'misc', group: 'tap', unlock: (g) => g.hasMs('v4'), interval: () => T.autoTapInterval, run: (g) => g.tapDo(true) },
  { id: 'auto_spells', name: 'Zauber automatisch wirken', desc: 'Wirkt bereite Zauber (pro Zauber einstellbar im Zauber-Tab).', kind: 'misc', group: 'spells', unlock: (g) => g.hasMs('v8'), interval: () => 0.5, run: (g) => g.spellAutoRun() },
  { id: 'auto_mem', name: 'Erinnerungen-Upgrades automatisch kaufen', desc: 'Kauft das jeweils günstigste Upgrade.', kind: 'upg', group: 'mem', unlock: (g) => g.hasMs('v12'), interval: () => 2, run: (g) => g.upgBuyAll('mem') },
  prestigeAuto({ id: 'auto_rejuv', layer: 'rejuv', name: 'Automatisch verjüngen', desc: 'Verjüngt, sobald der Gewinn die Bedingung erfüllt.', unlock: (g) => g.hasMs('v5'), interval: () => 1, mode: 'time', value: 120, minGain: 1, modes: ['time', 'amount', 'mult'] }),
  prestigeAuto({ id: 'auto_jump', layer: 'jump', name: 'Automatisch zurückreisen', desc: 'Springt in die nächste Epoche, sobald der Gewinn die Bedingung erfüllt.', unlock: (g) => has(g, 's_auto'), interval: () => 1, mode: 'amount', value: 3, minGain: 1 }),
];

/* ----------------------------- achievements ----------------------------- */
function buildAchievements() {
  const A = [];
  const add = (id, name, desc, cond, extra = {}) => A.push({ id, name, desc, cond, ...extra });
  add('tap1', 'Erste Drehung', 'Wende die Sanduhr zum ersten Mal.', (g) => g.state.tap.n >= 1);
  add('tap100', 'Sanduhr-Fan', 'Wende die Sanduhr 100-mal.', (g) => g.state.tap.n >= 100);
  add('tap1000', 'Sandmeister', 'Wende die Sanduhr 1.000-mal.', (g) => g.state.tap.n >= 1000);
  const anyQ = (n) => (g) => g.state.prod.quellen.some((p) => p.n >= n);
  add('q25', 'Kleine Sammlung', 'Besitze 25 Stück derselben Quelle.', anyQ(25));
  add('q100', 'Große Sammlung', 'Besitze 100 Stück derselben Quelle.', anyQ(100));
  add('q250', 'Sammelwut', 'Besitze 250 Stück derselben Quelle.', anyQ(250));
  add('qall', 'Vollständiger Haushalt', 'Besitze von jeder Quelle mindestens eine.', (g) => g.state.prod.quellen.every((p) => p.n >= 1));
  for (const [e, name] of [[3, 'Kleine Stunde'], [6, 'Sandburg'], [9, 'Sandstrand'], [12, 'Wüste'], [18, 'Dünenmeer'], [30, 'Sandsturm im All']]) {
    add('s' + e, name, `Besitze ${formatNumber(Decimal.pow(10, e))} Zeitsand auf einmal.`, (g) => g.state.cur.sand.best.gte(Decimal.pow(10, e)));
  }
  for (const [n, name] of [[1, 'Jünger!'], [10, 'Jungbrunnen'], [50, 'Ewig frisch']]) {
    add('r' + n, name, `Verjünge dich ${n}×.`, (g) => g.state.layers.rejuv.count >= n);
  }
  for (const [n, name, d] of [[1, 'Reisebeginn', 'Reise in die erste Epoche zurück.'], [4, 'Ritter der Zeit', 'Erreiche das Mittelalter.'], [7, 'Am Anfang aller Dinge', 'Erreiche den Anbeginn.']]) {
    add('j' + n, name, d, (g) => g.state.layers.jump.count >= n);
  }
  add('c1', 'Erster Zauber', 'Wirke einen Zauber.', (g) => g.def.spells.some((s) => g.state.spells[s.id].n > 0));
  add('c50', 'Zauberlehrling', 'Wirke 50 Zauber.', (g) => g.def.spells.reduce((a, s) => a + g.state.spells[s.id].n, 0) >= 50);
  add('call', 'Fünf Zauber', 'Schalte alle fünf Zauber frei.', (g) => g.def.spells.every((s) => g.spellUnlocked(s.id)));
  for (const [n, name] of [[1, 'Zu früh gedacht'], [5, 'Ideenstifter'], [12, 'Anachronist']]) {
    add('i' + n, name, `Pflanze ${n} Anachronismen${n > 1 ? '' : ''}.`.replace('Anachronismen', n === 1 ? 'Anachronismus' : 'Anachronismen'), (g) => ideasOwned(g) >= n);
  }
  add('x31', 'Einunddreißig', 'Einunddreißig Körner, nachgezählt.', (g) => g.state.story.epilog !== undefined); // keepsake: not counted for the bonus
  add('knapp', 'Knapp unter Champ', 'Verjünge dich 99-mal. Noch eine Runde, dann ist es rund.', (g) => g.state.layers.rejuv.count >= 99, { hidden: true });
  add('end', 'Das Erste Wort', 'Sprich das erste Wort.', (g) => g.state.mer.finished || g.state.layers.cycle.count >= 1);
  add('cyc1', 'Der Kreis schließt sich', 'Beginne einen zweiten Zyklus.', (g) => g.state.layers.cycle.count >= 1);
  add('t1', 'Dranbleiber', 'Spiele insgesamt 1 Stunde.', (g) => g.state.time.played >= 3600);
  add('t10', 'Geduld', 'Spiele insgesamt 10 Stunden.', (g) => g.state.time.played >= 36000);
  add('off1', 'Guter Schlaf', 'Lass 1 Stunde Offline-Fortschritt berechnen.', (g) => g.state.time.offline >= 3600);
  add('mem1k', 'Gutes Gedächtnis', 'Sammle insgesamt 1.000 Erinnerungen.', (g) => g.state.cur.mem.total.gte(1000));
  return A;
}

/* ----------------------------- definition ----------------------------- */
export const def = {
  id: 'merlin',
  title: 'Merlin – Rückwärts durch die Zeit',
  version: 1,
  currencies: [
    { id: 'sand', name: 'Zeitsand', short: 'Sand', layer: 0, start: 0 },
    { id: 'mem', name: 'Erinnerungen', short: 'Erinn.', layer: 1, start: 0 },
    { id: 'shards', name: 'Epochensplitter', short: 'Splitter', layer: 2, start: 0 },
    { id: 'eternity', name: 'Ewigkeit', short: 'Ewigkeit', layer: 3, start: 0 },
  ],
  chains: [],
  producers: [
    {
      id: 'quellen',
      currency: 'sand',
      layer: 0,
      bundleAt: T.bundleAt,
      bundleMult: T.bundleMult,
      label: (g, i) => {
        const [name, desc] = ERAS[era(g)].slots[i];
        return { name, desc };
      },
      slots: slotDefs,
    },
  ],
  tap: {
    currency: 'sand',
    start: T.tapCharges,
    max: tapMax,
    regen: tapRegen,
    gain: (g) => {
      const global = g.cache.prod.quellen.global;
      const byProd = g.prodIncome('sand').mul(tapSeconds(g));
      const base = global.mul(T.tapBase);
      return (byProd.gt(base) ? byProd : base).mul(tapMult(g));
    },
  },
  spells,
  layers: [
    {
      id: 'rejuv', name: 'Verjüngung', plural: 'Verjüngungen', verb: 'Verjüngen', layer: 1, currency: 'mem', basis: 'sand',
      formula: { threshold: T.rejuvThreshold, exp: T.rejuvExp, softcap: { at: T.softAt, pow: T.softPow } }, mult: memGainMult,
      blurb: 'Setzt Zeitsand und Quellen zurück. Du erhältst Erinnerungen an morgen.',
    },
    {
      id: 'jump', name: 'Epochensprung', plural: 'Epochensprünge', verb: 'Eine Epoche zurückreisen', layer: 2, currency: 'shards', basis: 'mem',
      formula: { threshold: jumpThreshold, exp: 0.5 }, mult: (g) => T.shardBase * ideaFx(g, 'shard'),
      available: (g) => era(g) < FINAL,
      blurb: 'Reise in die nächste, frühere Epoche. Zeitsand, Quellen und Erinnerungen werden zurückgesetzt.',
    },
    {
      id: 'cycle', name: 'Zyklus', plural: 'Zyklen', verb: 'Den Kreis schließen', layer: 3, currency: 'eternity', basis: 'shards',
      formula: { threshold: T.cycleThreshold, exp: T.cycleExp }, mult: () => T.cycleBase,
      available: (g) => g.state.mer.finished,
      unlockWhen: (g) => g.state.mer.finished,
      blurb: 'Beginne die Reise erneut, am Ende der Zeit. Du erhältst Ewigkeit für dauerhafte Verstärkungen.',
    },
  ],
  upgrades,
  milestones,
  challenges: [],
  achievements: buildAchievements(),
  autos,
  chapters: CHAPTERS,
  chronicle: true,
  story: [...STORY, ...ideaStories()],
  extraState: () => ({ mer: { era: 0, eraDone: {}, finished: false } }),
  settingsDefaults: { confirm: { rejuv: false, jump: true, cycle: true }, goldHourglass: false },
  hooks: {
    prodGlobalMult: (g) => globalParts(g).reduce((a, [, v]) => a.mul(v), ONE),
    prodLiveMult: (g, dt) => {
      const f = g.spellFrac('zeit', dt);
      return f ? D(1 + (zeitMult(g) - 1) * f) : ONE;
    },
    prodCostDiv: (g) => costDiv(g),
    prodSynergyScale: synergyScale,
    prodBundleMult: (g) => T.bundleMult + (has(g, 's_bruecke') ? 0.5 : 0),
    prodBundleAt: (g, p) => {
      const l = lv(g, 'eulenpost');
      if (!l) return p.bundleAt;
      return bundleCache[l] || (bundleCache[l] = [...new Set(p.bundleAt.map((t) => Math.max(2, Math.ceil(t * Math.pow(0.8, l)))))]);
    },
    upgradeExclusionOff: (g) => has(g, 'e_zwei'),
    offlineCapBonusHours: () => 0,
    onTick: (g) => {
      const m = g.state.mer;
      if (!m.finished && m.era === FINAL && g.state.cur.mem.run.gte(jumpThreshold(g))) {
        m.finished = true;
        g.emit('finale', {});
      }
    },
    afterReset: (g, L) => {
      const m = g.state.mer;
      if (L === 2) {
        m.eraDone[m.era] = true;
        m.era = Math.min(FINAL, m.era + 1);
      } else if (L === 3) {
        m.era = 0;
        m.finished = false;
        if (!has(g, 'e_erbe')) m.eraDone = {};
      }
      g.refresh();
      const start = startSand(g);
      if (g.get('sand').lt(start)) g.grant('sand', start.sub(g.get('sand')));
    },
  },
};
