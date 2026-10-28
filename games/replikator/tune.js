// Balance constants for Replikator. Tweak here, then run `node tools/simulate.mjs`.
export const TUNE = {
  // Generator tiers: base price of the first purchase and price multiplier per 10 purchases.
  baseCost: [10, 100, 1e4, 1e6, 1e9, 1e13, 1e18, 1e24],
  costMult: [1e3, 1e4, 1e5, 1e6, 1e8, 1e10, 1e12, 1e15],

  // Prestige formulas: gain = floor(mult * (basis / threshold) ^ exp)
  repThreshold: 3e5,
  repExp: 0.4,
  expThreshold: 3e4,
  expExp: 0.4,
  singThreshold: 30,
  singUnlock: 800, // lifetime Sternsysteme needed to reveal the Singularität layer
  repSoftcap: { at: 1e7, pow: 0.5 },
  expSoftcap: { at: 1e5, pow: 0.5 },
  singSoftcap: { at: 300, pow: 0.4 },
  singExp: 0.5,

  // Boost exponents: (1 + currencyRun) ^ exp
  bpBoostExp: 0.3,
  sysBoostExp: 0.5,
  coreBoostExp: 0.5,
  // Soft caps: above these values a boost's exponent halves
  bpCap: 1e7,
  sysCap: 1e4,
  coreCap: 1e5,

  // Start matter after a reset (milestone id -> amount) and Brückenkopf levels
  startMatter: [
    ['rep1', 100],
    ['rep5', 1e4],
    ['rep15', 1e6],
    ['rep40', 1e8],
    ['ex2', 1e9],
    ['ex10', 1e12],
  ],
  bruckenkopf: [1e5, 1e8, 1e11],

  // Blueprint upgrade prices
  auto1: 4,
  auto2: 25,
  auto3: 150,
  auto4: 1500,
  docks: 20,
  dyson: 250,
  tickBase: 8,
  tickGrow: 1.8,
  resonanz: 80,
  buendel: 400,

  // Singularität: gain bonus +singEcho per previous Singularität (milestone s2); Kernverdichter upgrade
  singEcho: 0.2,
  kernverdichterMult: 1.5,
  kernverdichterCost: 400,

  // Auto-Challenges: abort after chTimeout s; retry a failed one when chPower() (def.js) grew by chRetryPower
  chTimeout: 600,
  chRetryPower: 0.3,
  chFreshSeconds: 30, // only start a challenge this soon after an Expansion (nothing is lost)

  // Objective of the upgrade autobuyers (def.js repObjective): horizon (s) of the production estimate and weights (decades of "strength")
  objHorizon: 60,
  objCostW: 1.0, // per decade of generator cost divisor
  objStartW: 0.3, // per decade of start matter
  objTierW: 0.5, // per unlocked generator tier beyond the fourth
  objAutoW: 0.3, // per Autokauf-Upgrade (and per halving of the autobuyer interval / 4)

  // Challenge goals (Materie reached within one replication run)
  chGoal: [1e16, 1e18, 1e20, 1e22, 1e16, 1e44, 1e50, 1e31],

  // Akt II - Galaxiekarte (games/replikator/map.js)
  mapRadius: 2, // hex disc: 19 cells
  // Sector price in Sternsysteme (spent from the current amount): 10^(anchor + mapCostOffset + mapCostStep * n), n = sectors claimed so far.
  // anchor = mapAnchorSlope * log10(Sternsysteme best) when Akt II starts (stored in the save). Measured with tools/simulate.mjs --act2 (see docs/LESSONS.md):
  // the active economy saturates at ~1e7 Sternsysteme per Singularität run (soft caps), whether the save finished version 1 after 11 h (best 1.6e6)
  // or sat idle for 70 h (best 9.4e7), so the price level must follow the banked stock only weakly (10th root). With the Erschliessung travel time as the main throttle, prices only have to keep a rich save from clearing its stock on day one - a linear anchor would lock the long save out.
  mapAnchorSlope: 0.1,
  mapAnchorFixed: null, // a number replaces the measured anchor (later galaxies)
  mapCostOffset: 4.5,
  mapCostStep: 0.27,
  // Erschliessung (travel time): seconds = mapTripBase * mapTripGrow^n for the (n+1)th sector, one at a time, runs offline too
  mapTripBase: 240,
  mapTripGrow: 1.25,
  // The Singularität (auto and sim player) waits while the next sector costs <= mapHoldReach * Sternsysteme stock, at most mapHoldMax s of run time
  mapHoldReach: 20,
  mapHoldMax: 86400,
  mapEchoEvery: 2, // the Echo takes one free cell per this many claimed sectors
  mapAdjStep: 0.5, // + this share of the effect exponent per same-type claimed neighbour ...
  mapAdjMax: 3, // ... at most this many neighbours count
  mapAutoAt: 6, // Auto-Erkundung unlocks with this many claimed sectors
  // Type mix of the 17 claimable cells and how many layouts are tried (the one with most same-type neighbours wins)
  mapMix: { haufen: 4, nebel: 3, pulsar: 3, loch: 2, ruine: 3, anomalie: 2 },
  mapTries: 8,
  // Effect of ONE sector without neighbours (x per sector): gain of Sternsysteme / Blaupausen / Quantenkerne, production
  mapBase: { haufen: 2, nebel: 2, pulsar: 2, loch: 1.5, ruine: 1.15, anomalie: 1.1 },

  // Akt II - Mutationen (games/replikator/mutations.js). Offers charge by PLAY TIME (online and offline equally), never per replication:
  // per-replication charging would reward micro-replications (docs/LESSONS.md).
  mutUnlockAt: 3, // claimed sectors; the first offer is there at once
  mutEvery: 1500, // seconds of play time per offer ...
  mutGrow: 1.03, // ... times this per offer so far (slowly growing)
  mutQueueMax: 3, // pending offers; when full the charge stops (nothing is lost, nothing punished)
  mutCards: 3,
  mutRarity: { gewoehnlich: 70, selten: 25, glueck: 5 }, // weights per card
  genomeSlots: 3, // slots at the start ...
  genomeSlotAt: [6, 10], // ... +1 at these claimed-sector counts (the galaxy archive adds more later), at most genomeMax
  genomeMax: 6,
  mutAutoAt: 10, // Auto-Genom unlocks with this many claimed sectors ...
  mutAutoTaken: 5, // ... or this many chosen mutations
  // Auto-Genom / sim: a card is taken when it raises the objective (log10) by at least mutMinGain; weights for effects repObjective cannot see
  mutMinGain: 0.02, // free slot
  mutSwapGain: 0.08, // with a full genome (the replaced mutation is lost, so the card has to be clearly better)
  mutOfferW: 1.0, // per decade of offer rate
  mutTripW: 1.0, // per decade of Erschliessung time (a longer trip is worse)
  mutMapCostW: 0.5, // per decade of sector price
  mutGainW: 1.0, // objective weight of a factor on ALL prestige gains (per decade)
  mutRipe: { systems: 300, cores: 1800 }, // run time (s) from which a gain factor > 1 on Sternsysteme / Quantenkerne works in full (linear before; keeps short runs from becoming optimal)
  mutOfflineShare: 0.6, // assumed share of play time spent offline (Nachtschwärmer)
  // Strength of every mutation (benefit and catch); texts in mutations.js are built from these numbers
  mutFx: {
    hyperaktiv: { prod: 2, trip: 0.75, gain: 0.8 },
    gigantismus: { top: 10, sys: 2.5, low: 0.5, trip: 1.12 },
    sparsam: { costDiv: 100, mapCost: 0.3, bundle: -0.1, bp: 0.6 },
    nostalgisch: { bp: 3.5, sys: 0.7 },
    schwarmgeist: { perSector: 0.1, mapCost: 1.4 },
    geduldig: { max: 4, min: 0.5, full: 300 }, // Blaupausen-Gewinn: min at the start of a run, max from `full` s on
    fehlerfreudig: { offers: 2.5, cores: 0.7 },
    gruendlich: { cores: 3, trip: 1.15 },
    nachtschwaermer: { off: 1.5, on: 0.85 },
    mosaik: { adj: 0.5, trip: 1.1 },
    kolonialist: { sys: 3, bp: 0.5, trip: 1.1 },
    buendelfieber: { bundle: 0.1, trip: 0.8, costDiv: 0.4, sys: 0.6 },
    glueckstreffer: { prod: 4, gain: 2.5, trip: 1.1 },
    ueberschuss: { gain: 2.5, prod: 0.6, mapCost: 1.7 },
    chimaere: { perSlot: 1.5, gainSlot: 1.3, offers: 0.5 },
  },
};

// Dev only: `TUNE_OVERRIDE='{"singExp":0.5}' node tools/simulate.mjs` for quick balance experiments (Node only).
if (typeof process !== 'undefined' && process.env && process.env.TUNE_OVERRIDE) {
  Object.assign(TUNE, JSON.parse(process.env.TUNE_OVERRIDE));
}
