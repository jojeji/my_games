// Template game definition: one currency, 3 generator tiers, 2 upgrades, 1 prestige layer.
// Copy this folder with `node tools/new-game.mjs <id> "<Titel>"` and edit. See CLAUDE.md for the def schema.
import { D } from '../../engine/decimal.js';

export const def = {
  id: '__ID__',
  title: '__TITLE__',
  version: 1,
  currencies: [
    { id: 'coins', name: 'Münzen', layer: 0, start: 10 },
    { id: 'gems', name: 'Edelsteine', layer: 1, start: 0 },
  ],
  chains: [
    {
      id: 'coins',
      currency: 'coins',
      layer: 0,
      bundle: 10, // every 10 purchases ...
      bundleMult: 2, // ... multiply that tier's output by 2
      tiers: [
        { name: 'Sammler', desc: 'Sammelt Münzen.', baseCost: 10, costMult: 1e3 },
        { name: 'Händler', desc: 'Stellt Sammler ein.', baseCost: 100, costMult: 1e4 },
        { name: 'Bank', desc: 'Gründet Händler.', baseCost: 1e4, costMult: 1e5 },
      ],
    },
  ],
  layers: [
    {
      id: 'rebirth',
      name: 'Wiedergeburt',
      verb: 'Wiedergeboren werden',
      layer: 1,
      currency: 'gems',
      basis: 'coins', // gain is computed from coins earned this run
      formula: { threshold: 1e6, exp: 0.5 }, // floor(mult * (basis / threshold) ^ exp)
      blurb: 'Setzt Münzen und Generatoren zurück.',
    },
  ],
  upgrades: [
    { id: 'boost', group: 'rebirth', layer: 1, currency: 'gems', name: 'Glücksbringer', desc: 'Produktion ×2 pro Stufe.', max: 5, cost: (l) => 1 + l * 2, effect: (l) => D(2).pow(l), fmt: (e) => '×' + e.toString() },
    { id: 'cheap', group: 'rebirth', layer: 1, currency: 'gems', name: 'Mengenrabatt', desc: 'Generatoren kosten ÷10.', cost: 5 },
  ],
  milestones: [{ id: 'm1', layer: 'rebirth', at: 1, name: '1 Wiedergeburt', desc: 'Du hast es verstanden.' }],
  achievements: [{ id: 'a1', name: 'Anfänger', desc: 'Kaufe einen Sammler.', cond: (g) => g.state.gens.coins[0].bought >= 1 }],
  challenges: [],
  autos: [],
  hooks: {
    // Global multiplier applies to the final output (tier 0 -> currency).
    genGlobalMult: (g) => g.upgEffect('boost'),
    genCostDiv: (g) => (g.upgActive('cheap') ? D(10) : D(1)),
  },
};
