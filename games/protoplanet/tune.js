// Protoplanet: ALLE Zahlen an einer Stelle (Physik, Steuerung, Kamera, Bot). Kalibriert mit tools/sim-protoplanet.mjs.
export const T = {
  // --- Physik ---
  dt: 1 / 120, // fester Zeitschritt in Sekunden Spielzeit (Zeitstufen aendern nur die Schrittzahl pro Bild)
  maxStepsPerFrame: 40, // ist das Geraet zu langsam, laeuft das Spiel langsamer, die Physik bleibt gleich
  minMass: 0.0004, // darunter verschwindet ein Koerper
  minPlayerMass: 0.08, // darunter stoesst der Spieler nichts mehr aus
  ejectFrac: 0.01, // Tippen: Anteil der aktuellen Spielermasse
  ejectSpeed: 20, // Welteinheiten/s relativ zum Spieler (1 Welteinheit = Radius des Spielers beim Start)
  ejectGrace: 0.3, // s, in denen der Spieler sein eigenes Teilchen ignoriert
  holdDelay: 0.15, // s bis aus dem Tippen ein Strahl wird
  streamHz: 10, // Ausstoesse pro Sekunde im Strahl
  streamFrac: 0.004, // Anteil je Strahl-Ausstoss
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
    preyRatio: 0.75, // Beute: m < ratio * Spielermasse
    taus: [1.5, 2.5, 4, 6, 9, 13, 18, 26],
    costK: 7, // Gewicht der Ausstosskosten (Masse) gegen den Gewinn
    timeBias: 5, // s, addiert zur Abfangzeit im Nenner
    aimSlack: 0.6, // Anteil der Treffer-Breite, der als Ziel-Toleranz gilt
    tapTol: 0.03, // Geschwindigkeitsfehler, unter dem nichts ausgestossen wird
    vmax: 1.8, // Bot beschleunigt nicht ueber diese Geschwindigkeit (Welteinheiten/s)
    maxFrac: 0.06, // groesster Anteil je Ausstoss des Bots
    maxTime: 600, // s Spielzeit, dann gilt das Level als nicht geloest
  },
};
