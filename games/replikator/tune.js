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
  // Reife der Singularität: Quantenkern-Gewinn x min(1, Laufzeit / secs)^pow (nach dem Softcap, floor = Untergrenze). Ohne sie sind 2-min-Läufe im fortgeschrittenen Spiel das Optimum
  // (der Softcap pro Lauf kappt lange Läufe, siehe docs/LESSONS.md); mit ihr liegt das Optimum bei ~secs.
  singRipe: { secs: 900, pow: 2, floor: 0.02 },

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
  mapTripBase: 360,
  mapTripGrow: 1.25,
  // The Singularität (auto and sim player) waits while the next sector costs <= mapHoldReach * Sternsysteme stock, at most mapHoldMax s of run time
  mapHoldReach: 20,
  mapHoldMax: 86400,
  mapEchoEvery: 2, // the Echo takes one free cell per this many claimed sectors
  mapAdjStep: 0.5, // + this share of the effect exponent per same-type claimed neighbour ...
  mapAdjMax: 3, // ... at most this many neighbours count
  mapAutoAt: 2, // Auto-Erkundung unlocks with this many claimed sectors (offline player: without it ~1 sector per visit, 10 sectors took 3 days at one visit per 8 h)
  // Type mix of the 17 claimable cells and how many layouts are tried (the one with most same-type neighbours wins)
  mapMix: { haufen: 4, nebel: 3, pulsar: 3, loch: 2, ruine: 3, anomalie: 2 },
  mapTries: 8,
  // Effect of ONE sector without neighbours (x per sector): gain of Sternsysteme / Blaupausen / Quantenkerne, production
  mapBase: { haufen: 2, nebel: 2, pulsar: 2, loch: 1.5, ruine: 1.15, anomalie: 1.1 },

  // Akt II - Sondenbefehle (games/replikator/commands.js). Unlock: the first Pulsar sector or cmdUnlockAt claimed sectors. Every number was measured with
  // tools/commands-replikator.mjs: the effects act on what limits Akt II (Erschliessung time, gains after the softcap), not on production (docs/LESSONS.md).
  cmdUnlockAt: 6,
  cmdAutoAt: 9, // Auto-Befehl unlocks with this many claimed sectors
  cmdPulsar: 0.12, // commands recharge (1 + this x pulsar exponent) times as fast; the exponent counts every claimed Pulsar incl. its neighbour bonus
  // Uebertakten: for `dur` s the Erschliessung runs `trip` times as fast and the prestige gains are x `gain` (after the softcap, ripening like all gain factors)
  uebertakten: { dur: 45, cd: 300, trip: 3, gain: 1.5 },
  // Sonnenwind-Ernte: instantly `share` x the Sternsysteme of the next Expansion (2: a smaller share lifts Sternsysteme but hardly the Quantenkerne behind them)
  sonnenwind: { cd: 900, share: 2 },
  // Tiefenscan: reveals the `reveal` nearest fogged cells and cuts `cut` x the duration of the running Erschliessung
  tiefenscan: { cd: 1800, cut: 0.3, reveal: 5 },

  // Akt II - Anomalien (games/replikator/anomalies.js): event cards that wait for the player. Sources: every Anomalie sector on arrival and one every
  // anoEvery + [0, anoSpread) s of play time (60-90 min). The sim starts a pending one when it is worth it, at the latest after anoPatience s.
  anoEvery: 3600,
  anoSpread: 1800,
  anoPatience: 1800,
  anoForce: null, // dev / measurement only (tools/anomalies-replikator.mjs): a type id = every anomaly is this type, 'none' = no anomalies
  anoMinLeft: 360, // Gezeitenwelle: start while an Erschliessung with at least this many s left is running
  anoSignalGain: 1.08, // every Signalfragment: all prestige gains x this (4 fragments exist)
  anoSectorW: 0.45, // the Auto-Erkundung values an Anomalie sector like this many decades of strength (it brings an anomaly)
  gezeitenwelle: { dur: 300, trip: 3 },
  zeitriss: { secs: 600 },
  spiegel: { cost: 0.5 },
  umkehr: { dur: 300, share: 1 },

  // Akt II - Galaxiensprung (games/replikator/galaxy.js, jump.js). Layer 4: Saatkerne = floor((Quantenkerne dieser Galaxie / jumpThreshold) ^ jumpExp); a small exponent keeps a long
  // save (many Quantenkerne) and a fresh finish close together (docs/replikator-akt2.md). No softcap per run: the jump needs jumpSectors sectors, so it cannot be done in micro-runs.
  jumpSectors: 10, // claimed sectors of the current galaxy (and the Echo seen) = the galaxy is "completed" (Archiv) and the jump is open
  jumpThreshold: 4,
  jumpExp: 0.25,
  jumpAutoTypes: 3, // Auto-Sprung unlocks with this many completed galaxy types
  // Sector price level of galaxies >= 2 (the first galaxy measures it from the save, see mapAnchorSlope): anchor = galAnchor + galAnchorStep * (n - 2)
  galAnchor: 0.75,
  galAnchorStep: 0,
  galTripBase: 1.6, // Erschliessungen in galaxies >= 2 take this much longer (farther away); the Archiv and the Saatkern-Upgrades bring it down again
  // Galaxy types: rules while you are in one (galaxy.js GALAXIES) and the permanent Archiv bonus of the first completion of each type
  galFx: {
    zwerg: { maxTier: 6, thrDiv: 100, sys: 0.5, trip: 0.5 },
    elliptisch: { growthPow: 1.5, sys: 3 },
    kollision: { period: 600, lo: 0.5, hi: 4 },
    leerraum: { offers: 2 },
    quasar: { prod: 1000, autoExp: 3, autoWait: 1200 }, // the generator autobuyers wait for autoExp Expansions in the galaxy or autoWait s (so an absent player is not stuck at the start)
  },
  galArchive: {
    spirale: { trip: 0.92 },
    zwerg: { costDiv: 10 },
    elliptisch: { sys: 1.5 },
    kollision: { slot: 1, cmd: 1.25 },
    leerraum: { slot: 1, offers: 1.25 },
    quasar: { prod: 10, cores: 1.5 },
  },
  // Akt II - Ende (games/replikator/ending.js): after all six galaxy types are in the Archiv the Echo question is decided. Verschmelzen: from the next map on the Echo's cells
  // (its first one and every `mapEchoEvery`th claim) are yours for nothing; they count as sectors but do not push up price and travel time. Abgrenzen: the Echo leaves the maps,
  // and as a permanent bonus the Erschliessung is faster and every gain bigger (after the softcap, ripening). The other ending is open `endSecondJumps` jumps after the first.
  endSecondJumps: 3,
  endFx: {
    merge: { startCell: true, startTypes: ['haufen', 'nebel', 'pulsar', 'loch'] },
    split: { trip: 0.8, gain: 1.5 },
  },

  // Saatkern-Upgrades (def.js group 'seed')
  seedFx: {
    kerne: [20, 200, 2000], // Quantenkerne at the start of every galaxy per level
    sterne: [1e4, 1e5, 1e6], // Sternsysteme at the start per level
    flug: 0.88, // trip time x this per level
    befehl: 1.3, // command recharge x this per level
    anomalie: 1.4, // anomaly frequency x this per level
    gewinn: 1.25, // all prestige gains x this per level (after the softcap, ripening)
  },

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
  mutCmdW: 0.6, // per decade of Sondenbefehl recharge speed (Sonnenhunger; measured: x2 = -17 % time to 10 sectors)
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
    sonnenhunger: { cmd: 2, bp: 0.5 },
  },
};

// Dev only: `TUNE_OVERRIDE='{"singExp":0.5}' node tools/simulate.mjs` for quick balance experiments (Node only).
if (typeof process !== 'undefined' && process.env && process.env.TUNE_OVERRIDE) {
  Object.assign(TUNE, JSON.parse(process.env.TUNE_OVERRIDE));
}
