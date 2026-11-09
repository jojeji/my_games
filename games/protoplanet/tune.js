// Protoplanet: ALLE Zahlen an einer Stelle (Physik, Steuerung, Kamera, Bot). Kalibriert mit tools/sim-protoplanet.mjs.
export const T = {
  // --- Physik ---
  dt: 1 / 120, // fester Zeitschritt in Sekunden Spielzeit (Zeitstufen aendern nur die Schrittzahl pro Bild)
  maxStepsPerFrame: 40, // ist das Geraet zu langsam, laeuft das Spiel langsamer, die Physik bleibt gleich
  minMass: 0.0004, // darunter verschwindet ein Koerper
  minPlayerMass: 0.08, // darunter stoesst der Spieler nichts mehr aus
  ejectFrac: 0.028, // Tippen: Anteil der aktuellen Spielermasse (bestimmt nur die Groesse eines Tippens, nicht den Preis je Geschwindigkeit)
  ejectSpeed: 6, // Welteinheiten/s relativ zum Spieler; Raketengleichung: m1/m0 = exp(-dv / ejectSpeed), also der PREIS je Geschwindigkeit
  dustFrac: 0.03, // Ziel 'last': Koerper unter diesem Anteil der Spielermasse sind Staub und zaehlen nicht
  ejectGrace: 0.3, // s, in denen der Spieler sein eigenes Teilchen ignoriert
  holdDelay: 0.15, // s bis aus dem Tippen ein Strahl wird
  streamHz: 10, // Ausstoesse pro Sekunde im Strahl
  streamFrac: 0.012, // Anteil je Strahl-Ausstoss
  gridMinBodies: 40, // ab so vielen Koerpern Raster statt Paarvergleich
  // --- Zurueckspulen ---
  rewindEvery: 0.5, // s Spielzeit zwischen Schnappschuessen
  rewindKeep: 10, // s Spielzeit, die der Ringpuffer haelt
  rewindBack: 3, // s vor dem Verlust
  rewindLives: 3, // Versuche je Level
  // --- Zeit ---
  timeSteps: [0.25, 1, 4, 10],
  // --- Kamera ---
  camSpan: 12, // sichtbare halbe Breite = camSpan * Spielerradius ...
  camMin: 6, //   ... nicht unter camMin
  camMax: 34, //  ... nicht ueber camMax
  camFollow: 5, // 1/s, exponentielles Nachziehen der Position
  camZoomRate: 2.2, // 1/s, Nachziehen des Zooms
  camGrowTau: 1.2, // s: Bezugsradius des Automatik-Zooms folgt dem WACHSENDEN Spieler zuegig ...
  camShrinkTau: 9, //   ... dem SCHRUMPFENDEN sehr traege (Schrumpfen durch Ausstoss soll sichtbar sein)
  camManualHold: 4, // s ohne Pinch, dann kehrt die Automatik zurueck
  camBigNear: 2, // groessere Koerper in diesem Vielfachen der Sichtweite halten den Zoom offen
  // --- Eingabe ---
  tapSlop: 14, // px, Bewegung die noch als Tippen gilt
  // --- Darstellung ---
  dprMax: 2,
  glowSteps: 24, // Farbstufen der vorgezeichneten Glow-Sprites
  starCount: 70,
  // --- Bot ---
  bot: {
    every: 30, // Physikschritte je Entscheidung (0,25 s)
    horizon: 9, // s Vorhersage fuer Gefahren
    margin: 1.1, // Sicherheitsabstand (Welteinheiten) zusaetzlich zur Radiensumme
    dangerRatio: 0.97, // ab dieser Masse (relativ zum Spieler) gilt ein Koerper als Gefahr
    feedRatio: 0.2, // nie in Richtung eines Koerpers ab dieser Masse (relativ zum Spieler) ausstossen, wenn es sich vermeiden laesst
    feedPenalty: 0.8, // beim Ausweichen: Zuschlag (in Geschwindigkeitsaenderung) fuer eine Richtung, deren Teilchen den Gegner fuettert
    feedHorizon: 8, // s: so weit schaut der Bot der Teilchenbahn (mit Randabprall) hinterher
    rivalMass: 1, // Ziel 'last': ab dieser Masse (absolut) ist ein zaehlender Koerper ein Rivale ...
    rivalW: 1, //   ... und zaehlt als Beute so viel mal mehr
    preyRatio: 0.75,
    lastRatio: 0.9, // Ziel 'last': ein zaehlender Koerper bis zu diesem Anteil der Spielermasse gilt als Beute // Beute: m < ratio * Spielermasse
    taus: [1.5, 2.5, 4, 6, 9, 13, 18, 26],
    costK: 7, // Gewicht der Ausstosskosten (Masse) gegen den Gewinn
    timeBias: 5, // s, addiert zur Abfangzeit im Nenner
    aimSlack: 0.6, // Anteil der Treffer-Breite, der als Ziel-Toleranz gilt
    tapTol: 0.03, // Geschwindigkeitsfehler, unter dem nichts ausgestossen wird
    vmax: 1.2, // Bot beschleunigt nicht ueber diese Geschwindigkeit (Welteinheiten/s)
    maxFrac: 0.06, // groesster Anteil je Ausstoss des Bots
    maxTime: 600, // s Spielzeit, dann gilt das Level als nicht geloest
  },
  // --- Jaeger (KI-Koerper, hunter.js): gleiche Physik wie der Spieler, Gehirn = brain.js, aber begrenzt ---
  hunter: {
    // Parameter des gemeinsamen Gehirns (ueberschreiben T.bot): Jaeger jagen nur Kleineres und fliehen nur vor Groesserem (auch vor dem Spieler), kein Level-Ziel
    bot: { ejectSpeed: 3, sense: 8, horizon: 7, maxFrac: 0.05, feedRatio: 10, feedPenalty: 0, preyRatio: 0.75, dangerRatio: 0.97, costK: 3, playerW: 2, fleeGap: 3, fleeV: 0.45, tapTol: 0.04 },
    // Schwierigkeitsstufen: react = Reaktionszeit (s, je Jaeger aus dem Seed-Zufall), aimNoise = Winkelfehler (rad, ungefaehr 1 Sigma),
    // magNoise = Fehler der Schubstaerke (Anteil), hesitate = Wahrscheinlichkeit, eine Entscheidung auszulassen, vmax = Tempolimit (Welteinheiten/s)
    levels: {
      easy: { react: [1.1, 1.5], aimNoise: 0.3, magNoise: 0.25, hesitate: 0.3, bot: { vmax: 0.55, ejectSpeed: 2 } },
      normal: { react: [0.75, 1.2], aimNoise: 0.17, magNoise: 0.15, hesitate: 0.15, bot: { vmax: 0.85, ejectSpeed: 2.5 } },
      hard: { react: [0.5, 0.9], aimNoise: 0.09, magNoise: 0.08, hesitate: 0.06, bot: { vmax: 1.15, ejectSpeed: 3.5 } },
    },
  },
  // --- Klang (audio-score.js = reine Logik, audio.js = WebAudio-Graph). Keine Dateien, alles generativ. ---
  audio: {
    volume: { music: 70, sfx: 80 }, // Standard in Prozent (Regler 0-100, Schritt 5); gemessen wird nach Kurve gain = (v/100)^curve
    curve: 2,
    busMusic: 0.8, // Pegel der Busse vor dem Limiter
    busSfx: 0.9,
    pauseDuck: 0.35, // Musikpegel im Pausenmenue (Anteil)
    lookahead: 2.2, // s, so weit voraus werden Klaenge geplant
    pumpMs: 250,
    scales: {
      pentaMajor: [0, 2, 4, 7, 9],
      pentaMinor: [0, 3, 5, 7, 10],
      lydian: [0, 2, 4, 6, 7, 9, 11],
      dorian: [0, 2, 3, 5, 7, 9, 10],
      mixolydian: [0, 2, 4, 5, 7, 9, 10],
      phrygian: [0, 1, 3, 5, 7, 8, 10],
    },
    // Stimmung je Kapitel (Schluessel = Kapitel-ID; 'select' = Levelauswahl). root = MIDI-Grundton, roots = erlaubte Akkord-Grundstufen (Skalenindex),
    // chordEvery / starEvery = Spanne in s, bright 0..1 = Grundhelligkeit, cutLo/cutHi = Grenzfrequenzen des Teppichs (Hz), drone/chord/star = Pegel der Schichten,
    // beat = Schwebung bei Gefahr. Neues Kapitel: einfach einen Eintrag ergaenzen (siehe docs/protoplanet-klang.md).
    moods: {
      select: { name: 'Levelauswahl', root: 50, scale: 'pentaMajor', roots: [0, 1, 2, 3, 4], chordEvery: [22, 38], starEvery: [9, 20], bright: 0.45, cutLo: 260, cutHi: 900, drone: 0.7, chord: 0.8, star: 0.8, beat: 0.5 },
      1: { name: 'Staubwolke', root: 53, scale: 'lydian', roots: [0, 1, 3, 4, 5], chordEvery: [18, 34], starEvery: [7, 16], bright: 0.5, cutLo: 280, cutHi: 1000, drone: 0.8, chord: 0.85, star: 0.9, beat: 0.6 },
      2: { name: 'Jäger', root: 52, scale: 'dorian', roots: [0, 2, 3, 4, 6], chordEvery: [15, 30], starEvery: [8, 18], bright: 0.38, cutLo: 220, cutHi: 800, drone: 0.9, chord: 0.8, star: 0.75, beat: 0.8 },
      3: { name: 'Protostern', root: 55, scale: 'mixolydian', roots: [0, 1, 3, 4, 5], chordEvery: [20, 36], starEvery: [7, 15], bright: 0.55, cutLo: 260, cutHi: 950, drone: 0.8, chord: 0.9, star: 0.9, beat: 0.6 },
      4: { name: 'Dunkelwolke', root: 48, scale: 'phrygian', roots: [0, 2, 3, 4], chordEvery: [24, 40], starEvery: [12, 26], bright: 0.28, cutLo: 180, cutHi: 650, drone: 1.0, chord: 0.7, star: 0.6, beat: 1.0 },
      5: { name: 'Galaxie', root: 57, scale: 'lydian', roots: [0, 1, 2, 4, 5], chordEvery: [16, 30], starEvery: [5, 12], bright: 0.62, cutLo: 300, cutHi: 1200, drone: 0.75, chord: 0.9, star: 1.0, beat: 0.5 },
    },
    // Grenzen der weichen Parameter (musicParams klemmt jeden Wert hierauf)
    limits: {
      droneCut: [120, 1800], droneGain: [0, 0.6], beatGain: [0, 0.35], upperGain: [0, 0.3], chordCut: [350, 4500], chordGain: [0, 0.5],
      starRate: [0.15, 3], tempo: [0.7, 1.4], lfoRate: [0.5, 2], wet: [0.15, 0.7], noteCount: [3, 5],
    },
    danger: { ratio: 0.97, range: 6, rangeR: 2.5 }, // ein Koerper ab 0,97 x Spielermasse; Gefahr 1 bei Beruehrung, 0 ab range + rangeR x Spielerradius Abstand
    sizeLog: 1.3, // Spielergroesse 0..1 = log10(m) / sizeLog
    smooth: { tau: 2.2, danger: 1.0 }, // s, Zeitkonstanten fuer Parameteraenderungen
    sfx: {
      // Drosselung je Art: gap = Mindestabstand (s), max = Anzahl je 1 s
      gates: { absorb: { gap: 0.07, max: 6 }, eject: { gap: 0.09, max: 7 }, beam: { gap: 0.22, max: 4 }, ui: { gap: 0.05, max: 8 }, time: { gap: 0.1, max: 5 } },
      chainWin: 1.1, // s: Aufnahmen innerhalb dieses Fensters steigen als Arpeggio
      chainMax: 5,
      absorbLoIdx: 0, absorbHiIdx: 9, // Skalenindex-Bereich (ab root + 12) fuer kleine (hoch) bis grosse (tief) Happen
    },
  },
};
