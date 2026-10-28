// Replikator Akt II - Sondenbefehle (engine spells, def.spells). Pure and DOM-free (runs in Node for tests and the sim).
//  - Unlock: the first Pulsar sector or `cmdUnlockAt` claimed sectors (stays unlocked, rep2.cmd.on).
//  - Übertakten: for a short time the Erschliessung flies faster and the prestige gains are higher (after the softcap).
//  - Sonnenwind-Ernte: instantly the Sternsysteme of (a share of) the next Expansion.
//  - Tiefenscan: reveals fogged cells and cuts a chunk off the running Erschliessung.
//  - Pulsar sectors make the commands recharge faster (cmdRate), the mutation Sonnenhunger too.
//  - Auto-Befehl (def.js `auto_befehl`) calls g.spellAutoRun(); `autoWhen` keeps an auto-cast from being wasted. The sim's player calls the very same function.
// Effects only act on what limits Akt II (docs/LESSONS.md): the Erschliessung time (tripSpeed hook, map.js mapTick), the gains after the softcap
// (def.js postGain) and the Sternsysteme stock; plain production would be swallowed by the softcaps.
import { D } from '../../engine/decimal.js';
import { formatNumber as fmt } from '../../engine/format.js';
import { TUNE as T } from './tune.js';
import { mutCmdRate, ripen } from './mutations.js';
import { galCmdRate } from './galaxy.js';
import { act2Active, claimedCount, ownedOfType, typeMult, tripOf, trimTrip, revealFog } from './map.js';

/** Default state.rep2.cmd (merged into rep2State by map.js). */
export const cmdState = () => ({ on: false, at: 0 });

const CM = (g) => g.state.rep2.cmd;

/** Unlocked for good once the first Pulsar sector or `cmdUnlockAt` sectors are claimed. */
export const cmdUnlocked = (g) => act2Active(g) && (CM(g).on || cmdCondition(g));
const cmdCondition = (g) => ownedOfType(g, 'pulsar') >= 1 || claimedCount(g) >= T.cmdUnlockAt;

/** hooks.onTick: remember the unlock (a later map reset must not take the commands away). */
export function cmdTick(g) {
  if (!act2Active(g) || CM(g).on || !cmdCondition(g)) return;
  CM(g).on = true;
  CM(g).at = g.state.time.played;
  g.refresh();
}

/** Sum of the Pulsar sectors' effect exponents (1 per sector + the neighbour bonus), 0 without a Pulsar. */
export function pulsarExp(g) {
  if (!ownedOfType(g, 'pulsar')) return 0;
  return Math.log(typeMult(g, 'pulsar').toNumber()) / Math.log(T.mapBase.pulsar);
}
/** How many times as fast the Pulsar sectors alone let the commands recharge. */
export const pulsarRate = (g) => 1 + T.cmdPulsar * pulsarExp(g);
/** How many times as fast the commands recharge (Pulsar sectors, the mutation Sonnenhunger). */
export const cmdRate = (g) => pulsarRate(g) * mutCmdRate(g) * galCmdRate(g);

/** Speed factor of the running Erschliessung from Übertakten for the next `dt` seconds (time weighted: correct for the large offline steps). */
export function cmdTripSpeed(g, dt) {
  const f = g.spellFrac('uebertakten', dt);
  return f ? 1 + (T.uebertakten.trip - 1) * f : 1;
}

/** Labeled factors on a prestige gain from commands ('blueprints' | 'systems' | 'cores'): Übertakten while it is active (ripening like every gain factor). */
export function cmdGainParts(g, kind) {
  if (!g.state.spells || !g.state.spells.uebertakten || !g.spellActive('uebertakten')) return [];
  const v = ripen(g, kind, T.uebertakten.gain);
  return v === 1 ? [] : [['Übertakten', D(v)]];
}
export const cmdGain = (g, kind) => cmdGainParts(g, kind).reduce((a, [, v]) => a.mul(v), D(1));

/** Sternsysteme the Sonnenwind-Ernte would bring now. */
export const sonnenwindAmount = (g) => g.prestigeGain('expansion').mul(T.sonnenwind.share).floor();
/** Seconds Tiefenscan would cut off the running Erschliessung now. */
export const scanCut = (g) => {
  const trip = tripOf(g);
  return trip ? Math.min(trip.left, T.tiefenscan.cut * trip.dur) : 0;
};

const mins = (s) => (s % 60 === 0 ? `${s / 60} Min.` : `${s} s`);
/** The def.spells entries. Cooldowns are base / cmdRate at the moment of the cast. */
export const COMMANDS = [
  {
    id: 'uebertakten',
    name: 'Übertakten',
    desc: 'Die Sonde läuft heiß: Erschließungen sind schneller unterwegs und jede Replikation, Expansion und Singularität bringt mehr.',
    lockText: 'erster Pulsar-Sektor oder 6 erschlossene Sektoren',
    unlock: cmdUnlocked,
    duration: () => T.uebertakten.dur,
    cooldown: (g) => T.uebertakten.cd / cmdRate(g),
    info: (g) => `Erschließung ×${T.uebertakten.trip}, Gewinne ×${String(T.uebertakten.gain).replace('.', ',')} für ${mins(T.uebertakten.dur)}`,
    // an auto-cast is worth it while an Erschliessung is under way that the window can actually speed up
    autoWhen: (g) => {
      const trip = tripOf(g);
      return !!trip && trip.left >= 0.7 * T.uebertakten.dur * T.uebertakten.trip;
    },
  },
  {
    id: 'sonnenwind',
    name: 'Sonnenwind-Ernte',
    desc: 'Die Sonde fängt den Sonnenwind ein und rechnet ihn in Sternsysteme um, so viel wie die nächste Expansion bringen würde.',
    lockText: 'erster Pulsar-Sektor oder 6 erschlossene Sektoren',
    unlock: cmdUnlocked,
    duration: () => 0,
    cooldown: (g) => T.sonnenwind.cd / cmdRate(g),
    cast: (g) => {
      const amount = sonnenwindAmount(g);
      if (amount.gte(1)) g.add('systems', amount);
    },
    info: (g) => `+${fmt(sonnenwindAmount(g))} Sternsysteme sofort (${T.sonnenwind.share}× die nächste Expansion)`,
    autoWhen: (g) => sonnenwindAmount(g).gte(1),
  },
  {
    id: 'tiefenscan',
    name: 'Tiefenscan',
    desc: 'Ein Ortungsimpuls tief in die Karte: Nebel lichtet sich, und die laufende Erschließung verkürzt sich.',
    lockText: 'erster Pulsar-Sektor oder 6 erschlossene Sektoren',
    unlock: cmdUnlocked,
    duration: () => 0,
    cooldown: (g) => T.tiefenscan.cd / cmdRate(g),
    cast: (g) => {
      revealFog(g, T.tiefenscan.reveal);
      trimTrip(g, scanCut(g));
    },
    info: (g) => `Deckt ${T.tiefenscan.reveal} Sektoren auf, Erschließung −${Math.round(T.tiefenscan.cut * 100)} % der Dauer`,
    // a cast pays when it can cut the full chunk off a running Erschliessung
    autoWhen: (g) => {
      const trip = tripOf(g);
      return !!trip && trip.left >= T.tiefenscan.cut * trip.dur;
    },
  },
];
