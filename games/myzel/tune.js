// Myzel - balance constants. Everything numeric that the pacing tests depend on lives here.
// Quick experiments:  TUNE_OVERRIDE='{"sBase":3e5}' node tools/simulate-myzel.mjs --pendler --fork s
const base = {
  // ---- Offline / Regenschauer ----
  offlineCap: 3 * 3600, // fixed (spec): nothing changes it
  rainEvery: 45 * 60, // seconds of play time per Regenschauer charge
  rainMax: 3,
  rainSecs: 180, // length of one shower
  rainMult: 8, // N production x during a shower
  rainMult2: 10, // after the Fruchtkörper milestone "Wolkenbruch"
  rainStart: 1, // charges in a fresh game
  // ---- Nährstoffe / Hyphen ----
  nBase: 1, // N per second at the start
  hReq: 40, // N (this run) for the first Hyphen
  hExp: 0.5,
  ripeSecs: 120, // 'Reife': Hyphen gain x min(1, run seconds / ripeSecs) ^ ripeExp, so Hyphen per second peak at about this run length
  ripeExp: 1.5,
  hBoostExp: 0.3, // free boost: N x (1 + Hyphen earned) ^ hBoostExp
  autoHTime: 180, // default of the auto-Hyphen (time mode)
  forkOpenH: 300, // Hyphen earned (total) that offers fork A
  // exponents of the formula upgrades (Hyphen = Hyphen earned since the last row-2 reset, Fruchtkörper = earned in total)
  pH12: 0.08, pH31a: 0.12, pH31b: 0.08, pF11: 0.8, pF12: 0.6, pF22a: 0.4, pF22b: 0.4,
  // ---- Sporen (static, active branch) ----
  sBase: 2e4, // N (total since the last row-2 reset) for the first Spore
  sGrow: 2,
  sExp: 1.3, // cost of unit k = sBase * sGrow ^ (k ^ sExp)
  sA: 1, // N x (1 + sA * Spores) ^ sPow
  sPow: 1,
  sFlutAt: 9, // Spores for the last milestone of the branch (Sporenflut)
  // ---- Mykorrhiza (static, idle branch) ----
  mBase: 8e3,
  mGrow: 12,
  mExp: 1.3,
  zPer: 0.2, // Zucker per second per Mykorrhiza = zPer * (N production without sugar and shower) ^ zRateExp
  zRateExp: 0.2,
  zExp: 0.3, // N x (1 + Zucker earned) ^ zExp
  mNetzAt: 6, // Mykorrhiza for the last milestone of the branch (Myzelnetz)
  zHorizon: 3600, // objective: Zucker that will have been made in this many seconds
  // ---- Fruchtkörper ----
  fReq: 18000, // Hyphen (earned since the last Fruchtkörper) for the first one
  fExp: 0.5,
  fMinRun1: 20 * 3600, // seconds of play before the very first Fruchtkörper can be formed ("the first fruit needs a day")
  fMinRun: 6 * 3600, // ... and between two Fruchtkörper
  ripeF: 8 * 3600, // 'Reife' of the Fruchtkörper: gain x min(1, run seconds / ripeF) ^ ripeFExp
  ripeF1: 30 * 3600, // the very first Fruchtkörper ripens longer ("the first fruit needs a day")
  ripeFExp: 1.5,
  fUnitsS: 5, // Sporen needed to be allowed to form Fruchtkörper
  fUnitsM: 5,
  // ---- challenges (goal: Hyphen earned in the challenge run) ----
  chTime: [2.5 * 3600, 2 * 3600, 2 * 3600], // a challenge is done when its time is up AND the Hyphen goal is reached
  chS: [0.3, 0.3, 1], // Hyphen goal = chS * (Hyphen of one ripe Ausbreitung when the last Fruchtkörper was formed)
  chDurrePow: 0.4,
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
