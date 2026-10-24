// Merlin - balance constants. Everything numeric that the pacing tests depend on lives here.
// Quick experiments:  TUNE_OVERRIDE='{"rejuvThreshold":3e4}' node tools/simulate-merlin.mjs --hours 14
const base = {
  // ---- Quellen (parallel producers) ----
  slotCost: [10, 150, 2500, 4e4, 7e5, 1.2e7, 2e8, 3.5e9],
  slotRatio: [1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5],
  slotRate: [0.2, 2.4, 36, 540, 8000, 1.2e5, 1.8e6, 2.7e7],
  rateScale: 1, // multiplies all slot rates (balance knob)
  bundleAt: [5, 10, 15, 20, 30, 40, 60, 80],
  bundleMult: 2,
  // ---- Sanduhr (tap) ----
  tapBase: 8, // sand per tap at multiplier 1 (scales with the global multiplier)
  tapSeconds: 1.5, // a tap is worth this many seconds of production
  tapPerLevel: 0.75,
  tapRegenMin: 1.5,
  tapCharges: 5,
  tapRegen: 4, // seconds per charge
  // ---- layers ----
  rejuvThreshold: 300000, // Zeitsand (this run) for the first Erinnerung
  rejuvExp: 0.5,
  softAt: 25, // Erinnerungen per Verjuengung above this grow only with ^softPow (keeps the cadence of runs stable)
  softPow: 0.3,
  ripeTau: 120, // 'Reifung': production x (1 + seconds since the last Verjuengung / ripeTau) ^ ripeExp
  ripeExp: 1.0,
  memBoostExp: 0.5, // production boost = (1 + Erinnerungen this era) ^ exp
  memBoostCap: 3000,
  shardBoostExp: 0.4,
  eraThr: [17414, 59620, 92640, 157017, 278813, 433230, 922240, 1500000], // Erinnerungen (this era) to leave the era / speak the word (last)
  shardBase: 2.2, // Epochensplitter at exactly the threshold
  eraReward: 1.5, // production per cleared era
  eternityBoostExp: 0.9,
  cycleThreshold: 3, // Epochensplitter of the cycle
  cycleExp: 1.0,
  cycleBase: 5,
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
