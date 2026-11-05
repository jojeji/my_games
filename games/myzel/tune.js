// Myzel - balance constants. Everything numeric that the pacing tests depend on lives here.
// Quick experiments:  TUNE_OVERRIDE='{"sBase":3e5}' node tools/simulate-myzel.mjs --pendler --fork s
const base = {
  // ---- Offline / Regenschauer ----
  offlineCap: 3 * 3600, // fixed (spec): nothing changes it
  rainEvery: 45 * 60, // seconds of play time per Regenschauer charge
  rainMax: 3,
  rainSecs: 180, // length of one shower
  rainMult: 5, // N production x during a shower
  rainMult2: 8, // after the Fruchtkörper milestone "Wolkenbruch"
  rainStart: 1, // charges in a fresh game
  // ---- Nährstoffe / Hyphen ----
  nBase: 1, // N per second at the start
  hReq: 40, // N (this run) for the first Hyphen
  hExp: 0.5,
  ripeSecs: 120, // 'Reife': Hyphen gain x min(1, run seconds / ripeSecs) ^ ripeExp, so Hyphen per second peak at about this run length
  ripeExp: 1.5,
  hBoostExp: 0.3, // free boost: N x (1 + Hyphen earned) ^ hBoostExp
  autoHTime: 180, // default of the auto-Hyphen (time mode)
  forkOpenH: 60, // Hyphen earned (total) that offers fork A
  // exponents of the formula upgrades (Hyphen = Hyphen earned since the last row-2 reset, Fruchtkörper = earned in total)
  pH12: 0.08, pH31a: 0.12, pH31b: 0.08, pF11: 0.8, pF12: 0.6, pF22a: 0.4, pF22b: 0.4,
  // ---- Sporen (static, active branch) ----
  sBase: 2e4, // N (total since the last row-2 reset) for the first Spore
  sGrow: 4,
  sExp: 1.3, // cost of unit k = sBase * sGrow ^ (k ^ sExp)
  sPer: 2.2, // N x sPer ^ Spores
  // ---- Mykorrhiza (static, idle branch) ----
  mBase: 3e4,
  mGrow: 5,
  mExp: 1.3,
  zPer: 1, // Zucker per second per Mykorrhiza = zPer * (N production without sugar and shower) ^ zRateExp
  zRateExp: 0.5,
  zExp: 0.35, // N x (1 + Zucker earned) ^ zExp
  zHorizon: 3600, // objective: Zucker that will have been made in this many seconds
  // ---- Fruchtkörper ----
  fReq: 2000, // Hyphen (earned since the last Fruchtkörper) for the first one
  fExp: 0.5,
  fUnitsS: 3, // Sporen needed to be allowed to form Fruchtkörper
  fUnitsM: 3,
  // ---- challenges (goal: Hyphen earned in the challenge run) ----
  chK: [0.8, 1.2, 1.8], // challenge goals in units of fReq (Hyphen earned in the challenge run)
  chDurrePow: 0.5,
  // ---- upgrade costs ----
  costScaleH: 1,
  costScaleS: 1,
  costScaleM: 1,
  costScaleF: 1,
};

let override = {};
try {
  if (typeof process !== 'undefined' && process.env && process.env.TUNE_OVERRIDE) override = JSON.parse(process.env.TUNE_OVERRIDE);
} catch {
  /* ignore */
}
export const TUNE = { ...base, ...override };
