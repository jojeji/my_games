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
  gridMinBodies: 24, // ab so vielen Koerpern Sweep statt Paarvergleich (Name aus der Rasterzeit)
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
  camMax: 66, //  ... nicht ueber camMax (Arenen bis R 56, Spieler bis ~30 Massen)
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
    margin: 0.5, // Sicherheitsabstand (Welteinheiten) zusaetzlich zur Radiensumme
    dangerRatio: 0.97, // ab dieser Masse (relativ zum Spieler) gilt ein Koerper als Gefahr
    feedRatio: 0.2, // nie in Richtung eines Koerpers ab dieser Masse (relativ zum Spieler) ausstossen, wenn es sich vermeiden laesst
    feedPenalty: 0.8, // beim Ausweichen: Zuschlag (in Geschwindigkeitsaenderung) fuer eine Richtung, deren Teilchen den Gegner fuettert
    feedHorizon: 8, // s: so weit schaut der Bot der Teilchenbahn (mit Randabprall) hinterher
    rivalMass: 1, // Ziel 'last': ab dieser Masse (absolut) ist ein zaehlender Koerper ein Rivale ...
    rivalW: 1, //   ... und zaehlt als Beute so viel mal mehr
    preyRatio: 0.75,
    catchRatio: 0.85, // neue Beute: Masse < catchRatio x (Spielermasse nach dem Ausstoss)
    keepRatio: 0.95, //   begonnene Jagd (Plan) wird bis zu diesem Verhaeltnis fortgesetzt (sonst kippt der Plan, weil der Ausstoss selbst schrumpft)

    lastRatio: 0.9, // Ziel 'last': ein zaehlender Koerper bis zu diesem Anteil der Spielermasse gilt als Beute // Beute: m < ratio * Spielermasse
    taus: [1.5, 2.5, 4, 6, 9, 13, 18, 26],
    tausFar: [38, 55], // nur wenn sonst nichts in Reichweite ist: weite Anfahrt (sonst steht der Bot in einer leeren Ecke)
    hunterW: 0, // (aus, 0) Beute-Gewicht eines Jaegers fuer den Spieler-Bot; gemessen: 3 ist schlechter
    rivalBoost: 1, // (aus, 1) Ziel largest/last: Beute ab halber Masse des groessten anderen Koerpers zaehlt so viel mal mehr; gemessen: 2-6 ist schlechter
    costK: 3, // Gewicht der Ausstosskosten (Masse) gegen den Gewinn
    timeBias: 5, // s, addiert zur Abfangzeit im Nenner
    aimSlack: 0.6, // Anteil der Treffer-Breite, der als Ziel-Toleranz gilt
    tapTol: 0.03, // Geschwindigkeitsfehler, unter dem nichts ausgestossen wird
    vmax: 1.2, // Bot beschleunigt nicht ueber diese Geschwindigkeit (Welteinheiten/s)
    maxFrac: 0.06, // groesster Anteil je Ausstoss des Bots
    variantSteps: 14, // Bot-Variante v beginnt nach v x 14 Schritten zu handeln (Pruefung: mehrere Phasen)
    maxTime: 600, // s Spielzeit, dann gilt das Level als nicht geloest
  },
  // --- Jaeger (KI-Koerper, hunter.js): gleiche Physik wie der Spieler, Gehirn = brain.js, aber begrenzt ---
  hunter: {
    // Parameter des gemeinsamen Gehirns (ueberschreiben T.bot): Jaeger jagen nur Kleineres und fliehen nur vor Groesserem (auch vor dem Spieler), kein Level-Ziel
    bot: { ejectSpeed: 3, sense: 8, horizon: 7, maxFrac: 0.05, feedRatio: 10, feedPenalty: 0, preyRatio: 0.75, dangerRatio: 0.97, costK: 5, playerW: 2, fleeGap: 3, fleeV: 0.45, tapTol: 0.04 },
    // Schwierigkeitsstufen: react = Reaktionszeit (s, je Jaeger aus dem Seed-Zufall), aimNoise = Winkelfehler (rad, ungefaehr 1 Sigma),
    // magNoise = Fehler der Schubstaerke (Anteil), hesitate = Wahrscheinlichkeit, eine Entscheidung auszulassen, vmax = Tempolimit (Welteinheiten/s)
    levels: {
      easy: { react: [1.1, 1.5], aimNoise: 0.3, magNoise: 0.25, hesitate: 0.3, bot: { vmax: 0.55, ejectSpeed: 2 } },
      normal: { react: [0.75, 1.2], aimNoise: 0.17, magNoise: 0.15, hesitate: 0.15, bot: { vmax: 0.75, ejectSpeed: 2.5 } },
      hard: { react: [0.55, 0.95], aimNoise: 0.1, magNoise: 0.1, hesitate: 0.08, bot: { vmax: 0.9, ejectSpeed: 3 } },
    },
  },
};
