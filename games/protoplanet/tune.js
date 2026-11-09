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
  chapterOpen: 5, // Paket F: ein Kapitel oeffnet sich, sobald im vorherigen so viele Levels geschafft sind (innerhalb eines Kapitels Level fuer Level)
  // --- Zeit ---
  timeSteps: [0.25, 1, 4, 10],
  // --- Kamera ---
  camSpan: 6.5, // Paket F: Nahbereich. sichtbare halbe Breite = camSpan * Spielerradius^camExp ...
  camExp: 0.78, //   ... Exponent < 1: der Koerper WAECHST auf dem Bildschirm (Staubkorn -> Riese), die Welt wird kleiner, die Kamera faehrt weich heraus
  camMin: 4, //   ... nicht unter camMin
  camMax: 66, //  ... nicht ueber camMax (Arenen bis R 56, Spieler bis ~30 Massen)
  camFollow: 5, // 1/s, exponentielles Nachziehen der Position
  camZoomRate: 2.2, // 1/s, Nachziehen des Zooms
  camGrowTau: 1.2, // s: Bezugsradius des Automatik-Zooms folgt dem WACHSENDEN Spieler zuegig ...
  camShrinkTau: 9, //   ... dem SCHRUMPFENDEN sehr traege (Schrumpfen durch Ausstoss soll sichtbar sein)
  camManualHold: 4, // s ohne Pinch, dann kehrt die Automatik zurueck
  camBigNear: 0, // Arena-Kapitel (Paket F): 0 = aus, groessere Koerper ausserhalb des Bildes zeigen nur die Randpfeile (kein Herauszoomen)
  // --- Eingabe ---
  tapSlop: 14, // px, Bewegung die noch als Tippen gilt
  // --- Auftakt (Paket F): Uebersicht der ganzen Welt, dann weiche Fahrt auf den Spieler; die Physik startet erst danach ---
  intro: { hold: 0.35, dur: 1.7, orbitDur: 2.6, reduced: 0.45, titleHold: 1.6 }, // s (hold = Uebersicht steht, dur = Gesamtdauer, titleHold = Titel bleibt nach dem Ende der Fahrt)
  // --- Darstellung ---
  dprMax: 2,
  glowSteps: 24, // Farbstufen der vorgezeichneten Glow-Sprites
  starCount: 70,
  // --- Effekte (Paket F, fx.js): reine Darstellung, eigener Zufall, nie in der Physik ---
  fx: {
    maxParticles: 320, // harte Obergrenze des Pools (Weniger Bewegung: reducedParticles)
    reducedParticles: 70,
    maxRings: 10,
    flowRate: [26, 70], // Teilchen/s des Hinueberfliessens (kleiner ... groesserer Happen in Pixeln)
    flowLife: [0.28, 0.5],
    flowPairs: 10, // hoechstens so viele ueberlappende Paare je Bild bekommen einen Strom
    breathGain: 4, // Anteil der Massezunahme (relativ zur eigenen Masse) -> Atmen
    breathTau: 0.32, // s
    breathScale: 0.11, // Skalierung des Spielers beim Atmen
    recoilTau: 0.13, // s
    recoilSquash: 0.17, // Stauchen in Schubrichtung
    ringLife: 0.6, // s, Ring bei eigener Aufnahme
    puffLife: [0.35, 0.7],
    dangerRatio: 0.97, // ab dieser Masse (relativ zum Spieler) ist ein Koerper eine Gefahr
    dangerT: 4.5, // s: so weit schaut der Gefahren-Hinweis (Kollisionskurs)
    dangerRange: 7, // Welteinheiten (+ 6 Spielerradien): nur Koerper darunter zaehlen
    dangerAttack: 6, // 1/s, Einblenden des Randgluehens
    dangerDecay: 1.6, // 1/s, Ausblenden
    dangerAlpha: 0.78, // Staerke des Randgluehens (Hoechstwert)
    winSlow: 0.22, // Zeitlupe nach dem Sieg (Geschwindigkeit der Kopie)
    winSlowT: 1.15, // s Zeitlupe ...
    winWaveT: 1.3, //   ... Lichtwelle ...
    winFadeT: 0.9, //   ... dann blendet die Welt aus, dann faehrt die Ergebnis-Karte ein
    starGap: 0.42, // s zwischen den Sternen der Ergebnis-Karte
    lossT: 1.0, // s Abdunkeln + Zeitbremse, dann der Dialog
    rewindT: 0.95, // s, Rueckwaertslauf der letzten Sekunden
    hudNear: 0.86, // Fortschritt, ab dem Balken und Zielzeile sanft pulsieren
    vibe: { absorb: 9, big: 24, eject: 5, danger: [14, 70, 14], loss: 260, win: [18, 60, 18, 60, 50] }, // ms bzw. Muster
    bigGain: 0.25, // Massezunahme (Anteil der eigenen Masse), ab der ein Happen als gross gilt
    dangerVibeGap: 7, // s Mindestabstand zweier Gefahr-Impulse
  },
  // Farbwelt je Kapitel (nur Darstellung): bg = Verlauf innen/aussen, accent = UI und Arena-Ring, neb = Nebelflecken [x, y, Groesse (Anteil der Breite), Farbe r,g,b, Alpha, Parallax].
  // Kontrast zum Groessencode der Koerper (kuehl = kleiner, warm = groesser) bleibt: Hintergruende sind dunkel und gedaempft.
  worlds: {
    select: { bg: ['#0d1630', '#04060e'], accent: '#6fe3ff', neb: [[0.2, 0.15, 0.9, '70,120,200', 0.14, 0.02], [0.85, 0.5, 0.8, '60,170,190', 0.1, 0.03], [0.3, 0.9, 1.0, '110,90,200', 0.1, 0.025]] },
    1: { name: 'Staubwolke', bg: ['#0c1a33', '#03060d'], accent: '#6fe3ff', neb: [[0.15, 0.2, 0.9, '60,130,200', 0.16, 0.02], [0.8, 0.45, 0.8, '50,175,185', 0.11, 0.035], [0.35, 0.85, 1.0, '80,110,210', 0.12, 0.025], [0.9, 0.9, 0.6, '70,190,170', 0.08, 0.05]] },
    2: { name: 'Jäger', bg: ['#1a1233', '#06040f'], accent: '#c3a2ff', neb: [[0.2, 0.25, 0.95, '120,80,200', 0.17, 0.02], [0.85, 0.6, 0.8, '170,90,190', 0.11, 0.035], [0.4, 0.9, 1.0, '80,90,210', 0.12, 0.025], [0.8, 0.1, 0.6, '150,110,230', 0.09, 0.05]] },
    3: { name: 'Protostern', bg: ['#231428', '#07040a'], accent: '#ffc27a', neb: [[0.2, 0.2, 1.0, '170,80,110', 0.15, 0.02], [0.85, 0.55, 0.85, '190,120,70', 0.1, 0.035], [0.3, 0.9, 1.0, '110,70,150', 0.12, 0.025], [0.85, 0.1, 0.6, '200,130,90', 0.08, 0.05]] },
  },
  // --- Kapitel 3 "Protostern" (Umlaufbahn-Modus, Paket B): Gravitation, offener Raum, Bahnvorschau ---
  orbit: {
    gm: 80, // Standardstaerke des Sterns (G x Masse): Kreisbahn r = 14 dauert ~37 s
    soft: 0.3, // Weichheit des Sternkerns in der Anziehung (verhindert 1/d^2-Spitzen)
    selfG: 2, // Staerke der Anziehung unter Koerpern bei selfGrav = 1: a = selfG x selfGrav x m_Quelle / (d^2 + ...)
    selfMin: 2, // nur Koerper ab dieser Masse ziehen an (der Spieler nie: er ist die Sonde, die Welt zieht)
    selfK: 6, // hoechstens so viele Quellen (die schwersten): Kosten bleiben begrenzt
    selfSoft: 1, // Weichheit der Anziehung unter Koerpern (zusaetzlich zur Radiensumme)
    cullFrac: 1.5, // Koerper hinter cullFrac x loseR verschwinden
    // Bahnvorschau (orbit.js): gepunktete Vorhersage der Spielerbahn nur unter der Sterngravitation
    preview: {
      revs: 1.25, // Umlaeufe voraus (bei gebundener Bahn)
      maxT: 60, // s, hoechstens so weit voraus (auch bei Fluchtbahn)
      stepFrac: 0.05, // Schritt = stepFrac / lokale Winkelgeschwindigkeit (Leapfrog, ~125 Schritte je Umlauf)
      dtMin: 0.02,
      dtMax: 0.25,
      maxPoints: 220, // Punkte der Linie (Schrittzahl wird sonst ausgeduennt)
      every: 0.1, // s echte Zeit zwischen zwei Neuberechnungen (nach einem Ausstoss sofort)
      starGap: 0.3, // Bahnpunkt gilt als "im Stern", wenn r < Sternradius + Spielerradius + starGap
    },
    camBias: 0.4, // Orbit-Kamera schaut um diesen Anteil des Weges zum Stern vom Spieler weg
    camBigNear: 0.8, // Orbit-Kamera: groessere Koerper halten den Zoom nur innerhalb dieses Vielfachen der Sichtweite offen (viele Koerper sind groesser als du: sonst zoomt sie immer heraus)
    camOrbit: 0.72, // ... und mindestens camOrbit x Apoapsis der aktuellen Bahn (die ganze Ellipse im Bild)
    camStar: 0.8, // Orbit-Kamera: sichtbare halbe Breite mindestens camStar x Abstand zum Stern (+ Sternradius), damit der Stern im Bild bleibt
    camIntro: 3.2, // s: Levelstart zeigt zuerst das ganze System, die Kamera faehrt dann auf den Spieler
    plan: {
      // Planer des Bots fuer Gravitationslevels (orbit-bot.js): Vorwaertssimulation von Kandidaten-Schueben
      every: 1.5, // s Spielzeit zwischen zwei Entscheidungen
      h: 0.5, // s Schrittweite der Vorhersage
      horizon: 40, // s Vorhersagehorizont
      mags: [0.1, 0.25, 0.5], // Kandidaten (Raster in allen Richtungen ausser vor/zurueck): Geschwindigkeitsaenderung
      lineMin: 0.012, // dichte Suche entlang der Flugrichtung: Staerken von lineMin bis lineMax im Faktor lineStep
      lineMax: 0.75,
      lineStep: 1.1,
      dirs: 24, // Kandidaten: Richtungen
      costK: 3, // Gewicht der Ausstosskosten (Masse) gegen den Gewinn
      costKGoal: 1.5, //   ... bei den Zielen `last` und `absorb` (Fertigwerden zaehlt mehr als Masse sparen)
      tau: 22, // s: Gewinne verblassen mit exp(-t / tau)
      near: 3.2, // Bahnbaender: ein Koerper wird nur geprueft, wenn sein Radienband das der Kandidatenbahn auf near x Radiensumme + margin beruehrt
      shapeWide: 0.12, // Formgewinn fuer Beinahe-Treffer: breiter Anteil (Breite wideW Radiensummen) ...
      wideW: 6,
      shapeNarrow: 0.35, //   ... und enger Anteil (Breite narrowW), jeweils als Anteil des Treffer-Gewinns
      narrowW: 1.5,
      finish: 0.5, // Ziel `absorb` / `last`: ein Zielkoerper ist mindestens so viel wert (Anteil der Spielermasse), auch wenn nur noch ein Rest uebrig ist
      onCourse: 0.12, // liegt die Untaetigkeit schon auf Abfangkurs (sichere Treffer ab diesem Anteil der Spielermasse), wird nicht gesucht
      refine: 2, // so viele (verschiedene) beste Kandidaten werden verfeinert ...
      climb: 6, //   ... mit so vielen Hangkletter-Runden (je 4 Auswertungen)
      margin: 0.5, // Sicherheitsabstand zu Groesseren (Welteinheiten) ...
      reactT: 0.3, //   ... plus so viele s x Relativgeschwindigkeit bei der Begegnung (der Planer reagiert nur alle `every` s)
      dangerRatio: 0.95, // ab dieser Masse (relativ zum Spieler nach dem Schub) gilt ein Koerper als Gefahr
      everyUrgent: 0.5, // s Spielzeit zwischen Entscheidungen, wenn ein Groesserer naht (naeher als alertGap in den naechsten alertT s)
      alertGap: 14,
      alertT: 10,
      starMargin: 1.5, // Abstand zur Sternoberflaeche, unter dem eine Bahn verworfen wird
      variantSteps: 90, // Bot-Variante v beginnt nach v x 90 Schritten (0,75 s) zu handeln
      maxFrac: 0.12,
      minGain: 0.015, // ein Schub lohnt, wenn er den Wert der Untaetigkeit um mindestens so viel (Anteil der Spielermasse) uebertrifft
    },
  },
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
      gates: { absorb: { gap: 0.07, max: 6 }, eject: { gap: 0.09, max: 7 }, beam: { gap: 0.22, max: 4 }, ui: { gap: 0.05, max: 8 }, time: { gap: 0.1, max: 5 }, warn: { gap: 2.5, max: 1 } },
      chainWin: 1.1, // s: Aufnahmen innerhalb dieses Fensters steigen als Arpeggio
      chainMax: 5,
      absorbLoIdx: 0, absorbHiIdx: 9, // Skalenindex-Bereich (ab root + 12) fuer kleine (hoch) bis grosse (tief) Happen
    },
  },
};
