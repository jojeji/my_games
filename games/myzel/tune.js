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
  // ---- Fruchtkörper: a softcap on the gain of ONE run keeps the loop Hyphen -> F -> N -> Hyphen from exploding after the content of Paket 1.
  // Below fCapAt (the first three runs of the live game) nothing changes: saves of Paket 1 are not set back.
  fCapAt: 3000,
  fCapPow: 0.25,
  fEffAt: 5000, // the F upgrades see Fruchtkörper (total) compressed above this: x -> fEffAt * (x / fEffAt) ^ fEffPow
  fEffPow: 0.35,
  // ---- Gabel B (row 4): Flechte l | Fäulnis z. Both are normal layers from the Fruchtkörper earned since their last reset, with a TIME gate
  // (the first run longer, 'the first lichen needs half a day') and income buyables so that something is buyable between two prestiges.
  jrEvery: 2.5 * 3600, // a Jahresring every 2,5 h of play time once the Waldnetz is open ...
  jrBonus: 0.01, // ... worth +1 % on the Fruchtkörper and Waldfäden gain
  bStart: 12, // Flechten / Fäulnis granted when fork B is chosen
  forkBAt: 4, // Fruchtkörper (count) that offer fork B
  lReq: 80, // Fruchtkörper earned (since the last reset of the layer) for the first point
  lExp: 0.35,
  lMin1: 12 * 3600,
  lMin: 6.5 * 3600,
  // Alge (l): income of Flechten per second per level; also Fruchtkörper gain. Licht (l): income and gain multiplier.
  algeBase: 3, algeGrow: 1.5, algeRate: 0.0002, algeF: 0.05,
  lichtBase: 10, lichtGrow: 1.7, lichtL: 0.15,
  // Totholz (z): income of Fäulnis; Zersetzen turns stock into Humus: Humus = floor(mult * substrate ^ humusPow)
  totBase: 3, totGrow: 1.5, totRate: 0.0003,
  zScale: 0.6, // balance: Fäulnis (lumps and income) is worth this much of what the same effort gives Flechte
  humusPow: 0.5, humusSw: 0.1, humusZw: 0.3, humusZexp: 0.3,
  humusF: 0.06, // Fruchtkörper gain x (1 + Humus) ^ humusF
  humusInc: 0.1, // Fäulnis income x (1 + Humus) ^ humusInc
  // ---- Waldnetz (row 5): normal layer from what the fork-B layers earned since the last Waldnetz; trees = buyables
  wReq: 0.01, wExp: 0.25,
  wMin1: 10 * 3600,
  wMin: 7.5 * 3600,
  eicheBase: 4, eicheGrow: 1.45, eicheF: 0.1,
  bucheBase: 6, bucheGrow: 1.5, bucheB: 0.12,
  birkeBase: 10, birkeGrow: 1.55, birkeW: 0.1,
  kieferBase: 15, kieferGrow: 1.7, kieferGate: 0.015, kieferMax: 10, // gate times x (1 - kieferGate * level) for l, z, w
  escheBase: 40, escheGrow: 1.7, escheR: 0.03,
  lindeBase: 80, lindeGrow: 1.7, lindeI: 0.2,
  tanneBase: 25, tanneGrow: 1.6, tanneR: 0.2,
  wA2: 2, wB2: 4, // Waldnetz count that opens the second branch of fork A / fork B
  synA: 0.05, synB: 1.5,
  // ---- Hexenring (row 6): static, no reset; rings = ending
  rBase: 4, rGrow: 2.45, rExp: 1, // ring n costs rBase * rGrow^(n-1) Waldfäden (total) ...
  ringW: 3, // ... and needs n + ringW Waldnetze (the floor of the timeline: ring 1 after the 3rd)
  rings: 5, // the ring closes
  ringBonus: 0.15, // deep gains x (1 + ringBonus * rings)
  bHorizon: 12 * 3600, bScale: 20, gateW: 3, humW: 0.5, // autobuyer: income counted over this horizon relative to a typical lump; value of a shorter gate
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
