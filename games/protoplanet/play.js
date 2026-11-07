// Ein laufender Level (DOM-frei): Welt + Ziel + Zurueckspulen + Zeitstufe + Strahl. Von der Oberflaeche UND vom Bot benutzt.
import { T } from './tune.js';
import { createWorld, step, eject, snapshot, restore } from './physics.js';
import { createRewind } from './rewind.js';
import { goalStatus } from './goals.js';
import { buildLevel } from './gen.js';

export function createPlay(level, saved = null) {
  const built = buildLevel(level);
  const goal = { ...(built.goal || {}), ...level.goal };
  const play = {
    level,
    goal,
    world: saved ? restore(saved.snap) : createWorld(built),
    status: 'running', // 'running' | 'won' | 'lost'
    rewindsLeft: saved ? saved.rewindsLeft : T.rewindLives,
    rewound: saved ? !!saved.rewound : false,
    timeScale: 1,
    invert: true, // true = Teilchen fliegt zum Finger, du vom Finger weg (Standard); false = Zielsteuerung
    beam: null, // Weltpunkt {x,y}, wenn der Strahl laeuft
    beamAcc: 0,
    acc: 0,
    progress: { done: false, frac: 0 },
    result: null,
    rewind: createRewind(),
  };
  play.rewind.tick(play.world);
  play.progress = goalStatus(play.world, goal);

  /** Ausstoss in Richtung (dx,dy) (Richtung des Teilchens). */
  play.eject = (dx, dy, frac = T.ejectFrac) => !!eject(play.world, dx, dy, frac);
  /** Ausstoss passend zu einem Fingerpunkt in Weltkoordinaten (Standard: Teilchen fliegt zum Finger, du vom Finger weg). */
  play.ejectAt = (wx, wy, frac = T.ejectFrac) => {
    const p = play.world.player;
    if (!p) return false;
    const s = play.invert ? 1 : -1;
    return play.eject(s * (wx - p.x), s * (wy - p.y), frac);
  };
  play.setBeam = (pt) => {
    if (pt && !play.beam) play.beamAcc = 1 / T.streamHz; // erster Strahl-Ausstoss sofort
    play.beam = pt ? { x: pt.x, y: pt.y } : null;
    if (!pt) play.beamAcc = 0;
  };
  play.stepOnce = () => {
    const w = play.world;
    if (play.beam) {
      play.beamAcc += T.dt;
      const every = 1 / T.streamHz;
      while (play.beamAcc >= every) {
        play.beamAcc -= every;
        play.ejectAt(play.beam.x, play.beam.y, T.streamFrac);
      }
    }
    step(w);
    play.rewind.tick(w);
    if (!w.player) {
      play.status = 'lost';
      play.beam = null;
      return;
    }
    if ((w.steps & 3) === 0) {
      play.progress = goalStatus(w, goal);
      if (play.progress.done) {
        play.status = 'won';
        play.beam = null;
        play.result = { time: w.t, ejected: w.stats.ejected / 1, rewound: play.rewound, ejects: w.stats.ejects };
      }
    }
  };
  /** n Physikschritte (Bot). */
  play.advanceSteps = (n) => {
    for (let i = 0; i < n && play.status === 'running'; i++) play.stepOnce();
  };
  /** Echte Zeit vergangen (Oberflaeche): rechnet Zeitstufe ein, gibt die Zahl der Schritte zurueck. */
  play.advance = (realDt) => {
    if (play.status !== 'running') return 0;
    play.acc += realDt * play.timeScale;
    let n = 0;
    while (play.acc >= T.dt && n < T.maxStepsPerFrame && play.status === 'running') {
      play.stepOnce();
      play.acc -= T.dt;
      n++;
    }
    if (n >= T.maxStepsPerFrame) play.acc = 0; // Geraet zu langsam: Spiel laeuft langsamer
    return n;
  };
  /** Nach einem Verlust zurueckspulen. */
  play.doRewind = () => {
    if (play.status !== 'lost' || play.rewindsLeft <= 0) return false;
    const snap = play.rewind.pick(play.world.t);
    if (!snap) return false;
    play.world = restore(snap);
    play.rewindsLeft--;
    play.rewound = true;
    play.status = 'running';
    play.beam = null;
    play.acc = 0;
    play.progress = goalStatus(play.world, goal);
    return true;
  };
  play.serialize = () => ({ snap: snapshot(play.world), rewindsLeft: play.rewindsLeft, rewound: play.rewound });
  return play;
}
