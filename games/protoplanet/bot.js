// Bot: spielt mit derselben Physik (play.js) in Node. Handelt alle T.bot.every Schritte (0,25 s Spielzeit), Zeitstufe immer x1.
// Das Gehirn (Beute, Ausweichen, Plan) steht in brain.js und wird auch von den Jaegern benutzt (hunter.js).
import { T } from './tune.js';
import { createPlay } from './play.js';
import { think, pushFrac } from './brain.js';
import { planOrbit } from './orbit-bot.js';
import { rngNext } from '../../engine/kit/rng.js';

const B = T.bot;
const OB = { ...T.bot, maxFrac: T.orbit.plan.maxFrac }; // Kapitel 3: groessere Schuebe erlaubt

/** Spielergeschwindigkeit um (dvx,dvy) aendern: ein Ausstoss in die Gegenrichtung mit genau passendem Anteil. */
function push(play, dvx, dvy) {
  const mag = Math.hypot(dvx, dvy);
  if (mag < 1e-9) return 0;
  return play.eject(-dvx, -dvy, pushFrac(mag, play.world.grav ? OB : B)) ? 1 : 0;
}

export function createBot() {
  return { plan: null, noise: 4242 };
}

/** Menschen-Probe (nur Messung, T.bot.human = { angSd, magSd } > 0): ein Schub wird ungenau ausgefuehrt (Winkel- und Staerkefehler, deterministisch aus dem Bot-Zustand). */
function blur(a, st) {
  const H = T.bot.human;
  if (!H || !(H.angSd > 0 || H.magSd > 0)) return a;
  const gauss = () => {
    let u1;
    let u2;
    [u1, st.noise] = rngNext(st.noise);
    [u2, st.noise] = rngNext(st.noise);
    return Math.sqrt(-2 * Math.log(Math.max(1e-9, u1))) * Math.cos(2 * Math.PI * u2);
  };
  const ang = gauss() * H.angSd;
  const k = Math.max(0.2, 1 + gauss() * H.magSd);
  const c = Math.cos(ang);
  const sn = Math.sin(ang);
  return { ...a, dx: (a.dx * c - a.dy * sn) * k, dy: (a.dx * sn + a.dy * c) * k };
}

/** Eine Entscheidung. Gibt die Zahl der Tippen zurueck (zu Testzwecken). */
export function botAct(play, st) {
  const p = play.world.player;
  if (!p) return 0;
  // Gravitationslevels (Kapitel 3): Planer mit Vorwaertssimulation, sonst das gemeinsame Gehirn mit linearer Abfangrechnung
  const a = play.world.grav ? planOrbit(play.world, p, { goal: play.goal }, st) : think(play.world, p, { B, goal: play.goal }, st);
  if (!a) return 0;
  const b = blur(a, st);
  return push(play, b.dx, b.dy);
}

/** Ein Level mit dem Bot spielen. Gibt {solved, lost, time, ejected, ejects} zurueck. */
export function playLevel(level, { maxTime = B.maxTime, variant = 0 } = {}) {
  const play = createPlay(level);
  const st = createBot();
  const orbit = !!play.world.grav;
  const every = orbit ? Math.round(T.orbit.plan.every / T.dt) : B.every;
  play.advanceSteps(variant * (orbit ? T.orbit.plan.variantSteps : B.variantSteps)); // Variante = andere Entscheidungs-Phase (deterministisch): der Bot beginnt zu handeln, wenn die Welt schon ein paar Schritte alt ist
  while (play.status === 'running' && play.world.t < maxTime) {
    botAct(play, st);
    play.advanceSteps(orbit && st.wait ? Math.round(st.wait / T.dt) : every);
  }
  const w = play.world;
  return {
    solved: play.status === 'won',
    lost: play.status === 'lost',
    time: w.t,
    ejected: w.stats.ejected,
    ejects: w.stats.ejects,
    mass: w.player ? w.player.m : 0,
    play,
  };
}

export const median = (xs) => {
  if (!xs.length) return NaN;
  const a = xs.slice().sort((x, y) => x - y);
  const h = a.length >> 1;
  return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2;
};

/** Eine Familie mit den Parametern eines Levels ueber viele Seeds spielen. Gibt Kennzahlen zurueck. */
export function botBatch(level, seeds, opts) {
  const runs = seeds.map((seed) => {
    const r = playLevel({ ...level, seed }, opts);
    return { seed, solved: r.solved, lost: r.lost, time: r.time, ejected: r.ejected, mass: r.mass };
  });
  const ok = runs.filter((r) => r.solved);
  return {
    runs,
    n: runs.length,
    solved: ok.length,
    rate: ok.length / runs.length,
    medTime: median(ok.map((r) => r.time)),
    p90Time: ok.length ? ok.map((r) => r.time).sort((a, b) => a - b)[Math.min(ok.length - 1, Math.floor(ok.length * 0.9))] : NaN,
    medEject: median(ok.map((r) => r.ejected)),
    medMass: median(ok.map((r) => r.mass)),
  };
}
