// Merlin - balance constants. Everything numeric that the pacing tests depend on lives here.
// Quick experiments:  TUNE_OVERRIDE='{"rejuvThreshold":3e4}' node tools/simulate-merlin.mjs --hours 14
const base = {
  // ---- Quellen (parallel producers) ----
  slotCost: [10, 90, 1000, 12000, 150000, 2.0e6, 3.0e7, 5.0e8],
  slotRatio: [1.12, 1.125, 1.13, 1.135, 1.14, 1.145, 1.15, 1.155],
  slotRate: [0.25, 1.8, 11, 66, 400, 2400, 15000, 95000],
  rateScale: 0.2, // multiplies all slot rates (balance knob)
  bundleAt: [10, 25, 50, 100, 150, 200, 250, 300, 400, 500],
  bundleMult: 2,
  // ---- Sanduhr (tap) ----
  tapBase: 8, // sand per tap at multiplier 1 (scales with the global multiplier)
  tapSeconds: 4, // a tap is worth this many seconds of production
  tapCharges: 5,
  tapRegen: 3, // seconds per charge
  // ---- layers ----
  rejuvThreshold: 12000, // Zeitsand (this run) for the first Erinnerung
  rejuvExp: 0.5,
  memBoostExp: 0.5, // production boost = (1 + Erinnerungen this era) ^ exp
  memBoostCap: 3000,
  shardBoostExp: 0.4,
  eraThr: [300, 800, 2200, 6000, 16000, 44000, 120000, 330000], // Erinnerungen (this era) to leave the era / speak the word (last)
  shardBase: 2.2, // Epochensplitter at exactly the threshold
  eraReward: 1.5, // production per cleared era
  eternityBoostExp: 0.9,
  cycleThreshold: 3, // Epochensplitter of the cycle
  cycleExp: 1.0,
  cycleBase: 1,
  // ---- ideas / costs ----
  ideaFrac: 0.12, // Erinnerungen cost of an idea as a fraction of the era threshold
  memCostGrowth: 1.0, // Erinnerungen-upgrade cost growth per era
  startSand: 25,
  // ---- spells ----
  spells: {
    zeit: { dur: 30, cd: 120, mult: 5 },
    rueck: { cd: 180, secs: 90 },
    still: { dur: 25, cd: 150, div: 4 },
    sturm: { dur: 20, cd: 150, tapMult: 2 },
    prophe: { dur: 45, cd: 200, syn: 2 },
  },
  autoTapInterval: 3,
};

let override = {};
try {
  if (typeof process !== 'undefined' && process.env && process.env.TUNE_OVERRIDE) override = JSON.parse(process.env.TUNE_OVERRIDE);
} catch {
  /* ignore */
}
export const TUNE = { ...base, ...override };
