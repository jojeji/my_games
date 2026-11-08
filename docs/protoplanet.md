# Protoplanet (Spezifikation)

Fünftes Spiel der Seite und das erste, das **kein Inkrementalspiel** ist: ein ruhiges Physik-Levelspiel fürs Handy.
Du bist ein Staubkorn in einer jungen Sternscheibe. Bewegen kannst du dich nur, indem du Masse ausstößt. Kleinere Körper absorbierst du,
größere absorbieren dich. Jede Bewegung macht dich kleiner.

id `protoplanet`, Ordner `games/protoplanet/`. Architektur: `docs/adr/0003-protoplanet-echtzeit-physik-ausserhalb-der-idle-engine.md`.
Begriffe: `games/protoplanet/GLOSSARY.md` (verbindlich für Code, UI-Texte und Commits). Vorher `docs/LESSONS.md` lesen:
Mobile UI, PWA/Deploy und Arbeitsweise gelten. Die Abschnitte zu Prestige, Idle und Story gelten hier nicht.

## Rahmen des Besitzers (nicht verhandelbar)
1. **Eigenes Spiel im Genre** (Vorbild: Absorptions-/Ausstoß-Physikspiele). Name, Setting, Levels, Optik und Klang sind eigen.
   Keine Namen, Texte, Grafiken, Musik oder Levellayouts eines bestehenden Spiels nachbauen.
2. **Levelspiel mit Freischaltungen**. Kein Idle, kein Offline-Fortschritt, keine Upgrades, die dich dauerhaft größer oder schneller machen
   (sonst wird die Physik zum Grinden).
3. **Keine Story**: keine Erzählstimme, keine Figuren, keine Chronik. Einzeilige **Bedienhilfen** in den Lehrlevels sind UI und erlaubt.
4. **Handy hochkant**, Einhandbedienung, ein Level dauert 1–5 min, jederzeit pausierbar, beim Verlassen automatisch gesichert.

## Umfang und Pakete
| Paket | Inhalt |
|---|---|
| **P1** | Physik-Kern, Steuerung, Kamera, Zeitstufen, Pause, Zurückspulen, Speichern (inkl. Level-Schnappschuss), Kapitel 1 (ohne Gravitation, 3 Lehrlevels + 5 erzeugte), Levelauswahl, Ergebnis-Bildschirm, Einstellungen, Bot + Tests, Hub-Eintrag (`status: "soon"`), Manifest, Icons |
| **P2** (umgesetzt, wartet auf Abnahme) | Ziel-Mix + große Brocken in Kapitel 1 (1-6..1-8 umbauen), Zieltyp „Werde unangreifbar“, **KI-Gegner** (Jäger) und Kapitel 2 „Jäger“ |
| **P3** | Gravitation: Attraktoren (auch auf Bahnen), offener Raum mit Abdrift-Grenze, **Anziehung unter den Körpern** (nur ab Mindestmasse, weich, je Kapitel einstellbar), Kapitel 3 „Protostern“ |
| **P4** | Generative Ambient-Musik + Effektklänge (WebAudio, keine Dateien) |
| **P5** | Kapitel 4 „Dunkelwolke“ (begrenztes Sichtfeld), Kapitel 5 „Planetensystem“ (alles, große Levels), Tageslevel |

Planänderung nach dem zweiten Spielen (Besitzer, Runde Q28–Q35), ersetzt die alte P2/P3-Einteilung: siehe „Ausbau nach dem zweiten Spielen“.
Zwischen den Paketen spielt der Besitzer (direkter Link `games/protoplanet/`, der Hub zeigt bis zur Abnahme „Bald verfügbar“).
Erst nach der Abnahme von P1 bekommt der Hub-Eintrag `status: "playable"`.

## Physik (`physics.js`, DOM-frei, deterministisch)
Alle Zahlen stehen in `tune.js`; die Werte unten sind **Startwerte**, kalibriert wird mit dem Bot.

- **Körper**: `{ id, x, y, vx, vy, m, kind }` mit `kind` = `'player' | 'mote' | 'attractor'` (Attraktor erst ab P2). **Radius `r = sqrt(m)`**
  (Masse ∝ Fläche, der Faktor π entfällt). Mindestmasse `minMass` (0,0004): darunter verschwindet ein Körper.
- **Fester Zeitschritt** `dt = 1/120` s Spielzeit, semi-implizites Euler-Verfahren (stabil für Umlaufbahnen). Die Zeitstufe ändert nur die Zahl der Schritte pro Bildschirmbild,
  nie `dt`. Höchstens `maxStepsPerFrame` (z. B. 40) Schritte pro Bild: Ist das Gerät zu langsam, läuft das Spiel langsamer, die Physik bleibt gleich.
- **Kein Luftwiderstand.** Was fliegt, fliegt weiter.
- **Ausstoß** (`eject(world, dirX, dirY, frac)`): Der Spieler (Masse `m`, Geschwindigkeit `v`) stößt `dm = frac * m` aus (Tippen: `ejectFrac` 0,02).
  Das ausgestoßene Teilchen entsteht am Rand des Spielers in Richtung `d` mit Geschwindigkeit `v + ejectSpeed * d` (`ejectSpeed` 6 Welteinheiten/s, **Entscheidung des Besitzers: Ausstoß muss spürbar kosten**,
  1 Welteinheit = Radius des Spielers beim Start, also eine feste Geschwindigkeit unabhängig von der aktuellen Größe). Der Spieler bekommt `v' = v - dm/(m - dm) * ejectSpeed * d` (Impulserhaltung, exakt).
  **Raketengleichung:** für eine Geschwindigkeitsänderung Δv gilt `m1/m0 = exp(-Δv / ejectSpeed)` (ein einzelner Ausstoß exakt `u/(u+Δv)`): der **Preis je Δv hängt nur von `ejectSpeed` ab**, `ejectFrac` (0,028) bestimmt nur, wie groß ein Tipp ist (Δv ≈ 0,17). Richtwert: eine Kurskorrektur Δv 0,5 kostet ≈ 8 % der Masse. Ausstoß ist nur möglich, solange `m - dm >= minPlayerMass`. Ausgestoßene Teilchen sind normale Körper und können von jedem absorbiert werden (auch vom Spieler).
  Damit der Spieler sein eigenes Teilchen nicht sofort wieder schluckt, ignoriert er es für `ejectGrace` (0,3 s).
- **Dauerstrahl**: Halten länger als `holdDelay` (150 ms) stößt mit `streamHz` (10/s) je `streamFrac` (0,012) aus, Richtung folgt dem Finger.
- **Eigener Ausstoß** trägt `gf` = Spieler-id. Er zählt für das Ziel „Letzter Körper“ nie mit; schluckt ein Teilchen fremde Masse, wird `gf` gelöscht (es ist dann kein Ausstoß mehr). Der Renderer zeichnet eigenen Ausstoß hell mit Halo und Schweif (mindestens 2,8 px).
- **Absorbieren** (`absorb(a, b)`): Überlappen sich zwei Körper (`dist < rL + rS`), fließt Masse vom kleineren (S) zum größeren (L), bis sie sich gerade berühren.
  Mit `M = rL² + rS²` (Gesamtmasse) und `d = dist` ist der neue Radius des kleineren `rS' = (d - sqrt(2M - d²)) / 2`; ist `d² <= M`, wird S ganz absorbiert.
  `dm = rS² - rS'²` geht an L. L übernimmt den Impuls des übertragenen Anteils: `vL' = (mL vL + dm vS) / (mL + dm)`; S behält seine Geschwindigkeit.
  Gleich große Körper (Unterschied < 1e-9): der mit der kleineren `id` gilt als größer (deterministisch).
- **Kollisionssuche**: Gleichmäßiges Raster (Zellgröße ≈ 2 × größter Radius der Nicht-Attraktoren), Paare in fester Reihenfolge (nach `id`) abarbeiten, damit das Ergebnis deterministisch ist.
- **Rand (Kapitel 1)**: Kreisförmige Arena mit Radius `arenaR`. Körper, die den Rand berühren, werden elastisch gespiegelt (Geschwindigkeitskomponente nach außen umkehren).
  Der Rand ist sichtbar (sanft leuchtender Ring).
- **Gravitation (P2)**: Nur Körper mit `kind: 'attractor'` ziehen an: `a = G * mA / (d² + soft²)` in Richtung Attraktor. Attraktoren spüren selbst keine Gravitation;
  sie stehen still oder folgen einer **festen Bahn** (Kreisbahn um einen Punkt, Parameter Radius/Periode/Phase), ihre Geschwindigkeit wird aus der Bahn abgeleitet.
  Attraktoren absorbieren wie jeder Körper (meist sind sie größer). Wird ein Attraktor kleiner als der Spieler, kann der Spieler ihn absorbieren.
- **Offener Raum (P2)**: Kein Rand. Außerhalb von `driftWarnR` erscheint eine Warnung (Pfeil zur Mitte), außerhalb von `driftLoseR` ist das Level verloren.
- **Determinismus**: Kein `Math.random` in Physik, Generatoren und Bot, nur der Seed-Zufall aus `engine/kit/rng.js`. Gleicher Seed + gleiche Eingaben = gleicher Verlauf (in Node getestet).
  Kleinste Abweichungen zwischen Browsern bei `Math.sin/cos` sind erlaubt (kein Wettbewerb, das Zurückspulen arbeitet mit Schnappschüssen, nicht mit Wiederholung).
- **Leistung**: Ziel 60 fps mit bis zu ~200 Körpern auf einem Mittelklasse-Handy. Bei zu langsamer Darstellung zeichnet die Darstellung nur jedes zweite Bild (30 fps), die Physik ändert sich nicht.

## Steuerung (`input.js`)
- **Standard (Entscheidung des Besitzers nach dem ersten Spielen): Tippen stößt Masse zum Finger hin aus, du fliegst in die Gegenrichtung.** Das ist aufregender als Zielen.
  Einstellung „Zielsteuerung“ (`settings.aim`, aus): Tippe, wohin du fliegen willst, die Masse geht nach hinten raus. Lehrlevel 1-1 hat für beide Modi eine eigene Bedienhilfe (`hint.text` / `hint.textAim`).
- Halten = Dauerstrahl (siehe Physik), der Finger darf dabei wandern.
- Zwei Finger = Zoomen (Pinch); ein zweiter Finger bricht den Strahl ab und löst keinen Ausstoß aus.
- `touch-action: none` auf der Zeichenfläche, keine Seitenscroll- oder Zoomgesten des Browsers. Pointer Events (Maus und Touch gleich).
- Während Pause und auf Dialogen gibt es keinen Ausstoß.

## Kamera (`camera.js`)
- Folgt dem Spieler weich (exponentielles Nachziehen).
- Automatik-Zoom: Die sichtbare halbe Breite ist ≈ `camSpan` (12) × **Bezugsradius**, begrenzt durch `camMin/camMax` und die Arena. Der Bezugsradius `cam.rz` folgt dem Spielerradius **asymmetrisch**: wachsend zügig (`camGrowTau` 1,2 s, der Körper soll nicht aus dem Bild wachsen), schrumpfend sehr träge (`camShrinkTau` 9 s). Hätte der Zoom den Radius sofort verfolgt, sähe der eigene Körper immer gleich groß aus und das Schrumpfen durch Ausstoß wäre unsichtbar (Beobachtung des Besitzers).
  Liegt ein größerer Körper in der Nähe (Abstand < 2 × Sichtweite), zoomt sie so weit heraus, dass er sichtbar bleibt.
- Pinch-Zoom übersteuert die Automatik; nach `camManualHold` (4 s) ohne Pinch kehrt sie weich zur Automatik zurück.
- Körper außerhalb des Bildes, die größer als der Spieler sind und sich nähern, zeigen einen kleinen warmen Pfeil am Bildrand.

## Zeit
- **Zeitstufen** ×¼ → ×1 → ×4 → ×10, eine Taste unten rechts (≥ 44 px), Beschriftung = aktuelle Stufe, Tippen schaltet reihum. Jedes Level startet mit ×1.
- **Pause**: eigene Taste (oben rechts) und automatisch beim Verlassen der App (`visibilitychange`/`pagehide`). Ein gesichertes Level wird pausiert fortgesetzt.
- **Zurückspulen**: `rewind.js` hält einen Ringpuffer von Schnappschüssen (alle 0,5 s Spielzeit, die letzten 10 s). Wird der Spieler absorbiert (oder treibt er in P2 ab), erscheint
  ein Dialog: „Zurückspulen (noch n)“, „Neu starten“, „Levelauswahl“. Zurückspulen setzt auf den Schnappschuss ≥ 3 s vor dem Verlust zurück, pausiert.
  **3 Mal pro Level**; wer zurückspult, verliert den Effizienz-Stern für diesen Versuch. Neustart setzt alles zurück.

## Levels (`levels.js`, `gen.js`)
- Ein Level = `{ id, chapter, family, seed, params, goal, targets, hint? }`. Die Levels eines Kapitels sind **feste Seeds** von Levelfamilien
  (immer dasselbe Level), dazu von Hand gebaute Lehrlevels.
- **Levelfamilie** = Generator `family(params, rng) -> { bodies, arena?, attractors? }`. Grundregeln, die jeder Generator selbst sicherstellt:
  Der Spieler startet mit `m = 1` in der Mitte (Kapitel 1) bzw. auf einer stabilen Bahn (P2), in Reichweite gibt es kleinere Körper,
  kein größerer Körper ist bei geradliniger Vorhersage in den ersten 5 s näher als 3 Spielerradien, und die Masse der kleineren Körper reicht für das Ziel.
- **Kapitel 1 „Staubwolke“ (P1)**, 8 Levels:
  1. Lehre „Bewegen“ (von Hand): ein ruhender kleinerer Körper. Hilfe: „Tippe, wohin du fliegen willst.“ Ziel: absorbiere ihn.
  2. Lehre „Gefahr“ (von Hand): einige kleinere Körper, ein langsam treibender größerer (orange). Ziel `last`: erst ausweichen, an den kleinen wachsen, dann den orangen Körper schlucken (genug Futter eingeplant).
  3. Lehre „Strahl und Zeit“ (von Hand): verstreute kleine Körper, weite Wege, ein ruhender größerer. Hilfe: „Halte gedrückt für einen Strahl. Unten rechts läuft die Zeit schneller.“ Ziel `last`.
  4.–8. aus Familien: `wolke` (zufällige Wolke, Größenverteilung über `params`), `ziel` (ein markierter größerer Körper, Ziel: absorbiere ihn = „Jagd“, bleibt `absorb`),
     `strom` (Körper in einem kreisenden Band, langsam), `enge` (mehrere größere Körper eng beieinander, dazu kleine). **Zuordnung der Ziele (Entscheidung des Besitzers, unterschiedliche Ziele sind gewollt):** 1-1 und 1-5 `absorb`, alle anderen `last`.
     Reihenfolge und Parameter so, dass die Schwierigkeit steigt. Mit teurem Ausstoß sind die Arenen klein (R 13–20) und dicht, siehe „Nach dem ersten Spielen“.
- (Alte Einteilung vor der Planänderung Q28–Q35; Kapitel 2 ist jetzt „Jäger“, der Protostern wird Kapitel 3, siehe „Ausbau nach dem zweiten Spielen“.) **Kapitel „Protostern“**: ein Attraktor, Familien z. B. `orbit` (Körper auf Bahnen), Ziele „überlebe N Umläufe“, „Masse M“, „absorbiere den Zentralkörper“.
- **Kapitel 3 „Planetensystem“ (P2)**: mehrere Attraktoren, auch auf Bahnen (Doppelstern, Planeten um Stern).
- **Tageslevel (P2)**: Seed aus dem Datum (`JJJJMMTT`, lokale Zeit), Familie per Seed aus allen Familien der freigeschalteten Kapitel. Kein Server.
  Gezeigt werden Zeit und ausgestoßene Masse, die Bestwerte des Tages werden gespeichert, Sterne gibt es dort nicht.
- **Freischalten**: Ein Level schaltet das nächste frei, das letzte Level eines Kapitels das nächste Kapitel. Sterne sind nur Zusatz.

## Ziele und Wertung (`goals.js`)
- Zieltypen: **`last` („Werde der letzte Körper“, in Kapitel 1 der Standard)**: gewonnen, wenn kein anderer Körper mehr existiert, dessen Masse ≥ `dustFrac` (0,03) × aktuelle Spielermasse ist. Alles darunter ist **Staub** und zählt nicht; der eigene Ausstoß zählt nie (siehe Physik). Zielzeile „Noch N Körper“ statt Prozent, der Balken zeigt die absorbierte Masse (aufgenommen / (aufgenommen + Masse der noch zählenden Körper)). `largest` (der Spieler ist größer als jeder andere Körper, Attraktoren eingeschlossen), `absorb` (Körper X existiert nicht mehr; wer ihn absorbiert hat, ist egal, die Generatoren sorgen dafür, dass realistisch nur der Spieler es kann),
  `mass` (Spielermasse ≥ M; seit P2 nutzen 1-6..1-8 und Kapitel 2 `largest` = „Werde unangreifbar“ und `mass` wieder), ab P2 `absorbCenter` (der Zentral-Attraktor ist absorbiert) und `survive` (N Umläufe um den Attraktor überlebt, gezählt am Winkel).
- Verlieren: Spieler absorbiert (`m < minMass`) oder, ab P2, abgetrieben. Kein automatisches „Unlösbar“; Neustart ist immer im Pausenmenü.
- Oben eine schmale Zielzeile mit Fortschritt (z. B. „Werde der größte Körper · 42 %“, Fortschritt = eigene Masse / Masse des größten anderen Körpers; bei `last` „Noch N Körper“).
- **Masseanzeige** unten links: zeigt Masseänderungen kurz (1,1 s) als Chip über dem Kasten (Ausstoß rot „−0,03“, Absorbieren grün „+0,12“, gleiche Vorzeichen werden summiert), ohne Layoutsprung (absolut positioniert).
- **Sterne** (je Level gespeichert, das Beste zählt):
  1. geschafft
  2. **Effizienz**: ausgestoßene Masse ≤ `targets.eject` (Anteil der Startmasse) und nicht zurückgespult
  3. **Zeit**: Spielzeit ≤ `targets.time`
  `targets` stehen je Level in `levels.js`; das Bot-Werkzeug schlägt Werte vor (Bot-Median × 1,3), nach der Abnahme mit echten Spielwerten nachjustieren.
- Ergebnis-Bildschirm: Sterne, Zeit, ausgestoßene Masse, Bestwerte, „Weiter“, „Nochmal“, „Levelauswahl“.

## Darstellung (`render.js`, Canvas 2D)
- Zeichenfläche bildschirmfüllend, `devicePixelRatio` berücksichtigt (höchstens 2), `requestAnimationFrame`.
- Dunkler Raum, leichter Sternenstaub als Hintergrund (Parallax, sehr dezent).
- Körper = glühende Kreise. Die **Farbe hängt von der Masse relativ zum Spieler ab** (`q = m / mSpieler`): kleiner (q < 0,9) kühl blau-grün, um 1 blass, größer (q > 1,1) warm orange-rot,
  stufenlos dazwischen. **Größere Körper haben zusätzlich einen dünnen, langsam pulsierenden Ring** (für Farbfehlsichtige).
  Der Spieler selbst hat eine eigene, helle Farbe. Der Zielkörper (`absorb`) ist markiert. Attraktoren (P2) sind Sterne mit Korona.
- Für Leistung: Glow-Sprites je Farbstufe vorab auf Offscreen-Canvas zeichnen und skaliert einsetzen, keine `shadowBlur` pro Körper.
- Einstellung „Weniger Bewegung“ schaltet Pulsieren und Parallax ab (Standard: folgt `prefers-reduced-motion`).

## Oberfläche (`ui.js`)
- **Spielbildschirm**: oben eine schmale Leiste (≤ 15 % Höhe): Zurück (zur Levelauswahl, mit Pause), Zielzeile, Pause. Unten rechts Zeittaste. Bedienhilfe als
  Einzeiler über der Zeittaste, verschwindet nach der ersten passenden Aktion.
- **Levelauswahl**: Kapitel als Abschnitte, Levels als Kacheln (Nummer, Sterne, gesperrt/offen), ab P2 das Tageslevel oben.
- **Pausenmenü**: Weiter, Neu starten, Levelauswahl, Einstellungen.
- **Einstellungen** (aus der Levelauswahl): Steuerung umkehren, Vibration (an; kurz beim Absorbieren eines Körpers, gedrosselt, länger beim Verlust; auf iOS ohne Wirkung),
  Weniger Bewegung, Export/Import (Text), Fortschritt löschen (mit Bestätigung, `confirmDialog`).
- Tap-Ziele ≥ 44 px, keine Hover-Infos. Mit Playwright bei 390×844 **und** 360×740 prüfen, Screenshots selbst ansehen.
- Wiederverwendet aus der Engine: `engine/ui/modal.js` (Dialoge), `engine/ui/toast.js`, `engine/ui/dom.js`, `engine/pwa.js`, `engine/save.js`, `engine/kit/rng.js`.

## Speichern (`state.js`)
- `createSaveStore({ id: 'protoplanet', version: 1 })` aus `engine/save.js` (Schlüssel `mg:protoplanet:save`, mit Sicherungskopie).
- Inhalt: `progress` (gelöste Levels, Sterne, Bestzeit, beste Ausstoßmasse je Level), `settings`, ab P2 `daily` (Datum, Bestwerte), und **`snap`**:
  der laufende Level als Schnappschuss (`levelId`, Körper, Spielzeit, Zeitstufe, verbleibende Zurückspul-Versuche, Statistik des Versuchs, Rewind-Puffer optional weglassen).
- Gespeichert wird bei Pause, beim Verlassen (`visibilitychange` hidden, `pagehide`), bei Levelende und nach Einstellungsänderungen. Kein Autosave pro Bild.
- Beim Start mit `snap`: direkt in den Level, pausiert. Spätere Formatänderungen: `version` erhöhen + Migration (CLAUDE.md-Konvention).

## Bot, Werkzeuge, Tests
- `bot.js` (DOM-frei, nutzt dieselbe `physics.js`): handelt alle 0,25 s Spielzeit. Wählt als Ziel den kleineren Körper mit dem besten Verhältnis Masse / (Abfangzeit + Ausstoßkosten),
  weicht Körpern aus, die größer sind und bei linearer Vorhersage näher als ein Sicherheitsabstand kommen, und stößt so wenig aus wie nötig. Läuft immer mit Zeitstufe ×1 (`dt` fest).
- `tools/sim-protoplanet.mjs [--level id] [--family f --seeds N] [--table] [--verbose]`: Lösungsquote, Median/Streuung der Spielzeit und der Ausstoßmasse, vorgeschlagene `targets`.
- Tests (Deploy-Sperre, gesamt < ~20 s):
  - `tests/protoplanet-physics.test.mjs`: Masse- und Impulserhaltung bei Ausstoß und Absorbieren, Absorptionsformel (berühren sich danach genau), Spiegelung am Rand, Determinismus (gleicher Seed + Eingaben = gleicher Zustand), Schnappschuss/Zurückspulen.
  - `tests/protoplanet-gen.test.mjs`: Grundregeln jeder Familie über viele Seeds (Startabstand, Masse reicht, keine Überlappung beim Start).
  - `tests/sim-protoplanet.test.mjs`: der Bot löst jedes feste Level; je Familie über ≥ 40 Seeds **≥ 95 % gelöst**, **Median-Spielzeit 1–5 min** (Lehrlevels kürzer erlaubt).
- Nach dem Anlegen/Ändern von Dateien `node tools/update-precache.mjs` (die Tests prüfen das).
- **Grenze der Sim:** Der Bot zielt präziser als ein Mensch auf dem Handy. Zeiten und Stern-Ziele nach echtem Spielen des Besitzers nachjustieren und die Erkenntnis in `docs/LESSONS.md` eintragen.

## Dateien
`games/protoplanet/`: `index.html`, `main.js` (Start, Bildschirmwechsel), `style.css` (eigenes Theme), `manifest.webmanifest` (eigene `id`, `start_url`, `scope`), `icons/`,
`tune.js`, `physics.js`, `rewind.js`, `gen.js`, `levels.js`, `goals.js`, `bot.js`, `state.js` (DOM-frei bis hier), `render.js`, `camera.js`, `input.js`, `ui.js`, `GLOSSARY.md`.
Kein Kopieren von `games/_template` nötig (das ist eine Idle-Vorlage), aber Manifest/Icons/`index.html` nach deren Muster.

## Ausbau nach dem zweiten Spielen (Entscheidungen Q28–Q35)
Rückmeldung des Besitzers: es fehlen Gegner-KI, von Beginn an große Brocken, größere Levels später, ein Modus mit begrenzter Sicht,
generative Ambient-Musik, Levels, die enden, wenn einen keiner mehr fressen kann, und mehr Gravitation unter den Körpern.

**Kapitel** (je neue Mechanik ein Kapitel, innerhalb eines Kapitels werden die Levels zum Ende hin größer):
1. **Staubwolke** (Grundlagen, vorhanden; die letzten Levels mit großen Brocken)
2. **Jäger** (KI-Körper)
3. **Protostern** (Attraktor + Anziehung unter den Körpern)
4. **Dunkelwolke** (begrenztes Sichtfeld)
5. **Planetensystem** (alles zusammen, große Levels)
Danach das **Tageslevel** aus den Familien aller freigeschalteten Kapitel (Lösbarkeit über viele Seeds prüfen, nicht über 40 feste: der Generator ist auf neue Seeds nur zu 91–97 % lösbar, siehe unten).

**Ziel-Mix** (je Level eines; Abwechslung ist erwünscht):
- `last` „Werde der letzte Körper“: kleine, dichte Levels.
- `largest` **„Werde unangreifbar“**: kein anderer Körper (Attraktoren eingeschlossen) ist im Moment größer als der Spieler. Was ein Jäger später durch Fressen werden könnte, zählt nicht. Gut für große Levels mit Brocken, die man nur überholen muss.
- `mass` „Erreiche die Masse M“: Ernte zwischen Gefahren, die man nie fressen muss.
- `absorb` „Absorbiere den Zielkörper“: Jagd.
- ab Kapitel 3 `survive` „Überlebe N Umläufe“.
- **Grundsatz:** Große Gefahren und `last` vertragen sich nicht (mit teurem Ausstoß wächst man nicht weit genug). Brocken gehören in Levels mit `largest`/`mass`/`absorb`.

**Kapitel 1 (P2):** 1-1..1-5 bleiben unverändert. 1-6..1-8 werden umgebaut: je 1–2 **Brocken** mit 3–6 Startmassen (ruhend oder sehr langsam), Ziel `largest` oder `mass`.

**KI-Gegner „Jäger“ (P2, Kapitel 2):** `kind: 'hunter'`, dieselbe Physik wie der Spieler (Ausstoß kostet sie Masse, ihre Teilchen sind normale Körper und fressbar).
Gehirn = das des Bots (`bot.js`, gemeinsamer Kern), aber begrenzt: Reaktionszeit 0,5–1,5 s (Seed-Zufall), Zielfehler (Winkelrauschen), gelegentliches Zögern; jagen nur Kleineres (auch den Spieler), fliehen vor Größerem (auch vor dem Spieler).
Alle Grenzen und Schwierigkeitsstufen in `tune.js` (`T.hunter`). Darstellung: eigener Ring (z. B. gestrichelt), die Farbe zeigt wie immer die Größe relativ zum Spieler.
Deterministisch (Seed je Jäger aus dem Level-Seed). Der Bot (Spieler-Bot) muss Kapitel 2 mit denselben Kriterien lösen (≥ 95 %, Median 1–5 min).

**Gravitation unter den Körpern (P3, ab Kapitel 3; Kapitel 1 und 2 bleiben ohne):** nur Körper ab einer Mindestmasse ziehen an, weich (`soft²` im Nenner), Stärke je Kapitel/Level einstellbar; Kosten auf dem Handy begrenzen (nur die k schwersten Körper als Quellen oder Raster). Die Levels „leben“ (Klumpen wachsen von selbst) und werden mit dem Bot kalibriert.

**Dunkelwolke (P5, Kapitel 4):** Sichtkreis um den Spieler, Radius wächst mit seiner Größe, außen dunkel; größere Körper, die sich nähern, verraten sich am Rand durch ein schwaches **Pulsieren** (keine Überraschungs-Tode).

**Musik (P4):** generativ per WebAudio, keine Dateien: langsamer Klangteppich aus 2–3 Schichten + sanfte Töne einer Tonleiter; Absorbieren = Ton in der Tonart, Ausstoß = leises Rauschen;
reagiert aufs Spiel (dunkler, wenn ein Größerer nah ist; je Kapitel eine Tonart). Getrennte Lautstärken Musik/Effekte in den Einstellungen; Ton startet erst nach der ersten Berührung (iOS).

## Umsetzung und Messungen

### P1 (Kern + Kapitel 1) — umgesetzt

**Was steht (alles unter `games/protoplanet/`):**
`tune.js` (alle Zahlen), `physics.js` (r = sqrt(m), fester Schritt 1/120, semi-implizites Euler, Ausstoß mit exakter Impulserhaltung, Absorbieren nach der Formel der Spezifikation, Paarvergleich bzw. Raster ab 40 Körpern mit fester Paarreihenfolge, elastische Kreis-Arena, `ejectGrace`),
`rewind.js` (Ringpuffer, Schnappschuss alle 0,5 s, 10 s), `goals.js` (`largest`, `absorb`, `mass`, Sterne), `gen.js` (Familien `wolke`, `ziel`, `strom`, `enge` + `checkRules`), `levels.js` (Kapitel 1, 3 Lehrlevels + 5 Familienlevels), `bot.js`,
`play.js` (**neu gegenüber der Dateiliste**: ein laufender Level = Welt + Ziel + Zurückspulen + Zeitstufe + Strahl; die Oberfläche UND der Bot benutzen dieselbe Klasse, so spielt der Bot exakt das, was der Mensch spielt), `state.js` (`createSaveStore` id `protoplanet`, Version 1, `snap`),
`camera.js` (DOM-frei, getestet), `render.js`, `input.js`, `ui.js` + `main.js`, `style.css`, `index.html`, `manifest.webmanifest` (eigene `id`/`start_url`/`scope`), `icons/`. Hub-Eintrag in `games.json` mit `"status": "soon"`.
Werkzeug `tools/sim-protoplanet.mjs`; Tests `tests/protoplanet-physics|gen|camera.test.mjs`, `tests/sim-protoplanet.test.mjs`.

**Bot-Messung (Stand P1, vor den Änderungen unten: `ejectSpeed` 20, Ziele `largest`/`mass`, Arenen R 38–48)** (`node tools/sim-protoplanet.mjs --seeds 40`, Seeds 1000–1039, Spielzeit in s, Ausstoß = Anteil der Startmasse 1; „Median“ über die gelösten Läufe):

| Level | Familie | gelöst (40 Seeds) | Median s | p90 s | Median Ausstoß | festes Level (Seed): Zeit / Ausstoß |
|---|---|---|---|---|---|---|
| 1-1 Bewegen | von Hand | 1/1 | – | – | – | 3,5 s / 0,06 |
| 1-2 Gefahr | von Hand | 1/1 | – | – | – | 26 s / 0,10 |
| 1-3 Strahl und Zeit | von Hand | 1/1 | – | – | – | 16 s / 0,03 |
| 1-4 Wolke | `wolke` | 40/40 | 96 | 139 | 0,43 | 95 s / 0,43 (Seed 9) |
| 1-5 Beute | `ziel` | 40/40 | 86 | 170 | 1,03 | 78 s / 0,87 (Seed 2) |
| 1-6 Strom | `strom` | 39/40 | 106 | 149 | 0,80 | 102 s / 0,83 (Seed 36) |
| 1-7 Dichte Wolke | `wolke` | 40/40 | 96 | 154 | 0,42 | 91 s / 0,41 (Seed 9) |
| 1-8 Enge | `enge` | 39/40 | 67 | 159 | 0,47 | 70 s / 0,52 (Seed 7) |

Zur Absicherung gegen Überanpassung an die Test-Seeds: 100 Seeds ab 1000 gaben 96–100 % (`wolke` 99/100 und 100/100, `ziel` 100/100 nach der letzten Änderung, `strom` 98/100, `enge` 98/100), 150 andere Seeds (5000 + 7·i) 98–100 % bei Medianen 72–113 s. Die festen Seeds der Familienlevels wurden so gewählt, dass der Bot dort nahe am Familien-Median (Zeit und Ausstoß) spielt, nicht auf „leicht“ (Hilfsskript, nicht eingecheckt: Seeds 1–60 je Level probieren).
Die Tests laufen ≈ 8,5 s (`sim-protoplanet`), alle neuen Protoplanet-Tests zusammen < 10 s.
Physik-Leistung (Node, ein Kern, Desktop): 30 Körper 4 µs, 100 Körper 17 µs, 200 Körper 21 µs je Schritt (×10 bei 200 Körpern ≈ 26 ms Rechenzeit je Sekunde); auf einem Handy ist ein Faktor 5–10 zu erwarten, **nicht auf einem echten Gerät gemessen**.

**Finale Zahlen (`tune.js`):** `dt` 1/120, `ejectFrac` 0,01, `ejectSpeed` 20, `streamFrac` 0,004, `streamHz` 10, `holdDelay` 0,15, `ejectGrace` 0,3, `minPlayerMass` 0,08, `minMass` 0,0004, Zurückspulen 3 Versuche / 3 s zurück / 0,5 s-Takt / 10 s Puffer, `camSpan` 12, `camMin` 6, `camMax` 34, `camManualHold` 4.
Bot: Entscheidung alle 30 Schritte (0,25 s), `costK` 7, `timeBias` 5, `vmax` 1,8, `preyRatio` 0,75, `dangerRatio` 0,97, `margin` 1,1, `horizon` 9 s, `maxFrac` 0,06.
Level-Parameter stehen als Daten in `levels.js` (Arena R 11 / 14 / 17 / 44 / 40 / 40 / 48 / 38, Körperzahlen 6–46, Hindernismassen 1,5 bis 4,4).

**Abweichungen von der Spezifikation (mit Begründung):**
1. **`ejectSpeed` 20 statt 6, `ejectFrac` 0,01 statt 0,02, `streamFrac` 0,004 statt 0,008.** Mit 6 kostet jeder Weg mehr Masse, als die kleinen Körper einbringen (der Bot spendete ein Vielfaches seiner Masse und verlor). Die Geschwindigkeitsänderung je Tippen ist jetzt 0,20 statt 0,12 Welteinheiten/s, ein Strahl liefert ≈ 0,8 Welteinheiten/s². Der Spielgefühl-Wert ist unbestätigt (nur Bot, kein Mensch).
2. **Große Arenen und viel Masse.** Mit 1-5-Minuten-Zielzeit für den Bot (und mit Ausstoß als Impuls: jedes Teilchen, das ein größerer Körper schluckt, stößt ihn an und füttert ihn) mussten die Familienlevels groß und mit viel Vorrat gebaut werden (Radien 38–48 Welteinheiten, die Kamera zeigt höchstens `camMax` = 34 halbe Breite). Hindernisse sind (fast) ruhend (`vBig` 0–0,05), um sie sind Streifen frei (`keepOut`, `bGap`: neue Generator-Parameter), weil sonst die Anstöße durch Ausstoß einen Hindernis-Körper anrollen lassen, der alles auffrisst.
3. **Tippen stößt beim Loslassen aus, nicht beim Aufsetzen** (damit ein zweiter Finger beim Pinch nie versehentlich ausstößt; Spezifikation: „ein zweiter Finger löst keinen Ausstoß aus“). Wischen vor `holdDelay` startet den Strahl sofort.
4. **Zielkörper statt „markierter Körper“** im Text (`Absorbiere den Zielkörper`). Fortschritt bei `absorb`: bis 50 % nach Masse (eigene Masse / Masse des Ziels), darüber nach Nähe (sonst steht der Balken im Lehrlevel 1 bei 99 %).
5. **Generator-Grundregeln** (`gen.js checkRules`): „näher als 3 Spielerradien“ ist als Abstand der Ränder ≥ 3 gelesen (Mitte − Radius des Körpers − 1 ≥ 3), „größer“ = m ≥ 1, „Reichweite“ = ein kleinerer (m < 0,9) Körper im Abstand ≤ 11. Die Massenregel lässt den größten bzw. Zielkörper selbst aus dem Vorrat heraus (`1 + Rest ≥ slack × Hindernis`, `slack` 1,4–2).
6. **Bot ist präziser als ein Mensch:** Er stößt mit genau passendem Anteil aus (Geschwindigkeitsänderung → Anteil, höchstens 6 %), nicht nur mit festen 1 %-Tippen. Ein Mensch erreicht dasselbe mit Halten (Strahl). Der Bot jagt eigene Teilchen nicht, zielt nie in Richtung eines großen Körpers, wenn das vermeidbar ist, und hält einen einmal gewählten Plan bis zum Treffer (kein Zickzack).
7. **Stern-Ziele** (`targets`): Bot-Ergebnis des festen Seeds × 1,3. Die **Lehrlevels haben großzügigere Untergrenzen** (Ausstoß ≤ 25 / 20 / 20 %, Zeit ≤ 20 / 60 / 60 s), weil der Bot dort in 3–26 s fertig ist, ein Anfänger aber deutlich länger braucht. Nach dem Spielen des Besitzers nachjustieren.
8. **Schwierigkeit steigt nach Parametern (Arena, Hindernismasse, Anzahl), nicht streng nach Bot-Zeit:** 1-8 „Enge“ hat den kleinsten Median (67 s). Reihenfolge: Wolke, Beute, Strom, Dichte Wolke (zwei Hindernisse), Enge (sechs Hindernisse nahe beieinander).
9. **`strom` ohne Gravitation:** Die Körper des „kreisenden Bandes“ fliegen auf Tangenten (Kapitel 1 hat keine Gravitation), prallen am Rand ab und zerlaufen mit der Zeit. Erst P2 kann echte Umlaufbahnen.
10. Der Rand zeichnet auch **Pfeile** für den Zielkörper außerhalb des Bildes (gelb), nicht nur für nahende größere Körper (orange).

**Bekannte Schwächen / offen:**
- Der Bot löst 96–100 % je Familie, nicht 100 %. Verlustursachen: ein Hindernis wird durch Teilchen angestoßen, rollt über seine Nachbarn und wird dabei so groß, dass der Spieler nie mehr größer wird (Zeitlimit), selten ein Zusammenstoß beim Ausweichen.
- **Nicht auf einem echten Gerät geprüft:** Griffigkeit/Gefühl der Steuerung, Leistung der Darstellung, Vibration, Installation als App. Geprüft sind nur Chromium-Emulation (390×844, 360×740, Touch über CDP: Tippen, Halten, Wischen, Pinch ohne Ausstoß) und die Simulation.
- Menschenzeiten sind unbekannt; der Bot ist die einzige Messung (Median 67–106 s je Familienlevel bei fehlerfreier Steuerung).
- Kein Klang (P3), kein Tageslevel, keine Gravitation (P2). Auf iOS bleibt Vibration ohne Wirkung.

### Nach dem ersten Spielen (Handy des Besitzers) — umgesetzt

Rückmeldung und Entscheidungen: (1) neues Ziel **Letzter Körper** (`last`) mit Staubgrenze, (2) **Ausstoß muss spürbar kosten** (Wege planen), (3) die **Kamera darf das Schrumpfen nicht verstecken**, (4) **Rückmeldung** bei Ausstoß/Absorbieren und gut sichtbare Teilchen. Bereits vorher geändert: Standardsteuerung = Masse fliegt zum Finger (`play.invert`, Einstellung `aim`).

**`tune.js` vorher → nachher:**

| Wert | P1 | jetzt | Grund |
|---|---|---|---|
| `ejectSpeed` | 20 | **6** | Preis je Δv (Raketengleichung `m1/m0 = exp(-Δv/ejectSpeed)`), ≈ 3× teurer |
| `ejectFrac` | 0,01 | **0,028** | ein Tipp gibt ≈ denselben Schub (Δv 0,17 statt 0,20), kostet ≈ 2,8 % statt 1 % |
| `streamFrac` | 0,004 | **0,012** | Strahl: gleicher Schub je Sekunde (≈ 0,7) |
| `dustFrac` | – | **0,03** | Staubgrenze des Ziels `last` |
| `camGrowTau` / `camShrinkTau` | – | **1,2 s / 9 s** | Zoom folgt dem Radius wachsend zügig, schrumpfend träge |
| Bot `vmax` | 1,8 | 1,2 | Weniger Δv je Beute (Ausstoß ist teuer) |
| Bot neu | – | `feedRatio` 0,2, `feedHorizon` 8, `feedPenalty` 0,8, `lastRatio` 0,9, `rivalMass`/`rivalW` 1/1 (aus) | siehe unten |

Der Preis eines Wegs ist jetzt der Gegner: Ausstoß, den ein größerer Körper schluckt, füttert ihn und stößt ihn an (Impuls und Masse); in den kleinen Arenen prallen Teilchen vom Rand ab und treffen früher oder später irgendeinen Körper. Messung: Der Bot (Median) stößt über ein Level 3–5 Startmassen aus (nur ein kleiner Teil davon stammt aus der Anfangsmasse, der Rest ist Masse, die er vorher gefressen hat; die Ausstoß-Sterne sind deshalb in Masseneinheiten angegeben, nicht mehr in Prozent).

**Level neu kalibriert** (lieber verkleinert als Grenzen verschoben): Arena R 13–20 statt 38–48, 12–19 kleine Körper (sHi 0,85: kein Körper nahe der Spielermasse), Hindernisse 1,1–1,3 statt 3,8–4,4 (sonst wächst der Spieler nie so weit, dass er sie am Ende fressen kann: bei Preis ≈ Gewinn stagniert die Spielermasse bei ≈ 3), Hindernisse ruhend (`vBig` 0), `strom` ohne großen Körper und mit Bandgeschwindigkeit 0,1 (`vN` = neuer Parameter Streuung). Generator-Grundregel angepasst: der Mindestabstand gilt jetzt für alle Körper ab m ≥ 0,9 (vorher ≥ 1), sonst startet ein fast gleich großer Körper dicht am Spieler und der Bot weicht ihm minutenlang aus.

**Bot-Messung** (`node tools/sim-protoplanet.mjs`, Seeds 1000–1039, Spielzeit in s, Ausstoß in Startmassen):

| Level | Ziel | gelöst (40) | Median s | p90 s | Median Ausstoß | festes Level (Seed): Zeit / Ausstoß | `targets` |
|---|---|---|---|---|---|---|---|
| 1-1 Bewegen | absorb | 1/1 | – | – | – | 6,7 s / 0,07 | 0,25 / 20 s |
| 1-2 Gefahr | last | 1/1 | – | – | – | 91 s / 1,65 | 2,5 / 150 s |
| 1-3 Strahl und Zeit | last | 1/1 | – | – | – | 119 s / 1,79 | 2,5 / 180 s |
| 1-4 Wolke | last | 40/40 | 133,5 | 165,8 | 3,00 | 122 s / 3,04 (Seed 9) | 4,0 / 160 s |
| 1-5 Beute | absorb | 39/40 | 67,9 | 110,2 | 0,81 | 71 s / 0,78 (Seed 24) | 1,05 / 95 s |
| 1-6 Strom | last | 39/40 | 138,1 | 171,7 | 3,22 | 136 s / 3,01 (Seed 4) | 4,0 / 180 s |
| 1-7 Dichte Wolke | last | 38/40 | 148,5 | 186,5 | 3,43 | 144 s / 3,43 (Seed 17) | 4,5 / 190 s |
| 1-8 Enge | last | 39/40 | 158,0 | 208,5 | 5,06 | 161 s / 5,17 (Seed 5) | 6,75 / 210 s |

Gegenprobe (nicht zum Einstellen benutzt): je 150 Seeds ab 1000 und 150 Seeds 5000 + 7·i: gelöst 91–97 % (Wolke 143/150 und 142/150, Beute 143 und 143, Strom 143 und 146, Dichte Wolke 144 und 145, Enge 143 und 137), Mediane 64–167 s. **Das Kriterium „≥ 95 % je Familie“ gilt auf den 40 Test-Seeds (1-7 mit 38/40 genau an der Grenze), über viele Seeds liegt der Bot bei 92–97 %, Enge bei 91–95 %.** Die Beute-Familie hat mit 68 s Median wenig Luft über der 60-s-Grenze.

**Was die Fehlschläge sind:** Zeitlimit, weil ein Körper (Hindernis oder ein kleiner, der angestoßen wurde) viel Masse frisst und größer wird als der Spieler; der Bot schaut nicht in die Zukunft über 8 s hinaus. Gegenmittel im Bot (alle gemessen): Teilchenbahn mit Randabprall prüfen, nicht auf Körper ab 0,2 × Spielermasse zielen (`feedRatio`), beim Ausweichen seitlich statt vom Gegner weg ausweichen (`feedPenalty`: Ausstoß in Gegenrichtung füttert sonst den Gegner), Zielzwang `must` (jeder zählende Körper muss gefressen werden, auch mit Verlust), zweiter Durchgang erlaubt Füttern, damit der Bot nie stehen bleibt. **Probiert und verworfen:** Rivalen bevorzugen (`rivalW` ≥ 2: 81–93 % statt 94 %), `costK` 3 oder 12 (schlechter als 7), schnelleres Ranking negativer Gewinne (88 % statt 93 %).

**Abweichungen / Hinweise:**
1. Staubgrenze und eigener Ausstoß: `lastRemaining` (goals.js) ignoriert Körper mit `gf` = Spieler-id; ohne das blockiert ein Teilchen von 2,8 % der Masse (knapp unter 3 %) schon nach ein paar Tipps den Sieg, weil der Spieler durch Ausstoß schrumpft und seine alten Teilchen dann über der Grenze liegen.
2. `play.js`: Zieltyp vom Level, Parameter (value, slack) von der Familie (`{...built.goal, ...level.goal}`), `generate(..., goal)` prüft die Grundregeln mit dem Zieltyp des Levels.
3. Kamera-Zeitkonstanten laufen in **echter** Zeit (Bildzeit), nicht in Spielzeit: bei Zeitstufe ×10 schrumpft der Körper auf dem Bildschirm also schneller (gewollt: man sieht es).
4. Ausstoß-Stern in **Masseneinheiten** (Ergebnis: „höchstens 4,00 Masse ausgestoßen“), Bestwerte ebenso; `targets.eject` unverändert als Zahl der Startmassen (Spielstände mit alten Bestwerten bleiben lesbar, die Sterne alter Spielstände ändern sich nicht rückwirkend).
5. Menschenzeiten und -Gefühl weiter unbekannt. Der Besitzer sollte prüfen: ob ein Tipp (2,8 %) zu teuer oder zu billig wirkt (`ejectFrac`), ob die Levels zu eng sind, ob der Staub-Zähler verständlich ist.


### P2 (Jäger, Kapitel 2, Brocken, „Werde unangreifbar“) — umgesetzt

**Was steht:** `brain.js` (gemeinsames Gehirn: `think(w, p, {B, goal}, st)` gibt die gewünschte Geschwindigkeitsänderung zurück; `bot.js` ist jetzt nur noch „Gehirn + Ausstoß des Spielers“, das Verhalten des Bots für 1-1..1-5 ist **bit-identisch** zu P1: Zeit und Ausstoß der festen Level unverändert), `hunter.js` (Jäger), `physics.js` (`ejectFrom(w, body, …)`; `eject` ist der Spieler-Fall; `addBody` kennt `ai`; Schnappschuss-Zeilen haben eine 11. Spalte `ai`, alte mit 10 laden), `gen.js` (Familien `brocken` und `jaeger`, `rockKeep`, `buildLevel` macht aus `hunter: {seed, diff}` das Gehirn `ai`), `levels.js` (1-6..1-8 neu, Kapitel 2), `goals.js` (`goalExplain`, `goalCounter`, `largest`), `state.js` (Version 2), `render.js` (Jäger-Ring, Jäger-Ausstoß, Brocken-Ringe), `ui.js` (zwei Kapitel, Zähler, Pausentext), `tests/protoplanet-hunter.test.mjs`, `tests/helpers/protoplanet-sim.mjs`.

**1. „Werde unangreifbar“ (`largest`).** Bedingung: im Moment ist kein anderer Körper (auch kein Jäger, Brocken, später Attraktor, auch eigene Teilchen nicht) mit Masse ≥ der Spielermasse; gleiche Masse zählt als größer. Anzeige: **„Noch N größere“** (N = Zahl der Körper, die dich noch überragen; „Noch 1 größerer“) rechts neben dem Balken, der Balken zeigt eigene Masse / Masse des größten anderen Körpers (höchstens 99 %). Begründung: reine Prozent (so war es in P1: „größter Körper · 42 %“) sagen nur etwas über den einen größten Körper und verstecken die Mittelgroßen, die man ebenfalls überholen muss; die Zahl sagt konkret, was zu tun ist, und sinkt sichtbar in Schritten, der Balken zeigt trotzdem die Annäherung an den schwersten. Das Pausenmenü erklärt das Ziel in einem Satz („Kein anderer Körper ist größer als du, auch kein Jäger. Du musst die Brocken nicht fressen, nur überholen.“). 1-6 hat eine Bedienhilfe, die das Ziel erklärt.

**2. Brocken (1-6..1-8, `rev: 2`).** Familie `brocken`: 1–2 ruhende Brocken (`tag: 'rock'`, `vRock` 0,01, 3–6 Startmassen), `nMid` Mittelgroße 1,1–2,2 als Nahrungskette, `nSmall` kleine Körper, Ziel `largest` oder `mass` (Wert = 1 + `mFrac` × Summe der kleinen). Darstellung: großer Körper mit dickem Warnring plus zweitem, schwachem Ring. **Zuordnung:** 1-6 „Brocken“ `largest` (ein Brocken 3,6–4,2, R 17), 1-7 „Ernte“ `mass` (zwei Brocken 4,5–6, `mFrac` 0,4, R 18), 1-8 „Überholen“ `largest` (zwei Brocken 3,3–4, R 20, 24 kleine, 4 Mittelgroße). 1-1..1-5 sind unverändert (Parameter, Seeds, `targets`).
Zwei Erkenntnisse, die das Design bestimmen: (a) **Brocken müssen weit weg von der Beute liegen** (`rMin` 9, `rockKeep` 8: nichts anderes liegt näher als 8 Einheiten Randabstand), sonst frisst ein Brocken im Zentrum durch Zusammenstöße mit angestoßenen Körpern den Vorrat (4 → 10–25 Massen) und `largest` wird unlösbar (Bot 84–90 % statt 96–99 %). (b) Mit teurem Ausstoß wächst der Spieler an Beute unter 0,85 nie über ≈ 3; gegen einen Brocken von 3,6 braucht es **Mittelgroße (1,1–2,2)**, die man erst frisst, wenn man 1,5–2,9 hat (der Preis je Beute ist ein Anteil der eigenen Masse, der Gewinn nicht).

**3. Jäger (`kind: 'hunter'`).** Gleiche Physik: `ejectFrom` (Ausstoß kostet Masse nach der Raketengleichung, Impuls und Masse bleiben erhalten), Teilchen sind normale Körper (`gf` = id des Jägers, 0,3 s Schonfrist gegen das Wiederfressen), fressbar. Das Gehirn ist `brain.js` mit anderen Parametern (`T.hunter.bot` + Stufe), begrenzt durch:
- **Takt:** eine Entscheidung nur alle `react` s (Reaktionszeit je Jäger aus dem Seed-Zufall im Bereich der Stufe, ±15 % Jitter), nicht in jedem Physikschritt; die erste irgendwann in den ersten Sekunden (mehrere Jäger laufen nicht im Gleichschritt). Eine Entscheidung kostet ≈ 0,006 ms.
- **Fehler:** Zögern (`hesitate`: Wahrscheinlichkeit, eine Entscheidung auszulassen), Winkelrauschen (`aimNoise`, ≈ 1 Sigma in rad), Fehler der Schubstärke (`magNoise`), Tempolimit `vmax`.
- **Wahrnehmung und Verhalten:** Sichtweite `sense` 8 (Körper weiter weg gibt es für ihn nicht), jagt Beute < 0,75 × eigene Masse (**auch den Spieler**, Gewicht `playerW` 2, Kosten-Gewicht `costK` 3 statt 7 beim Bot), flieht vor Körpern ≥ 0,97 × eigene Masse (auch vor dem Spieler: weicht Kollisionen aus wie der Bot UND weicht aus, sobald ein Größerer näher als `fleeGap` 3 Randabstand kommt, bis `fleeV` 0,45 von ihm weg), kein Ziel (Level-Ziel gibt es nur für den Spieler-Bot).
- **Schlechterer Antrieb (wichtigste Stellschraube):** Abgasgeschwindigkeit `ejectSpeed` 2 / 2,5 / 3,5 (Stufe easy / normal / hard) statt 6 beim Spieler: jede Geschwindigkeit kostet den Jäger ein Vielfaches an Masse, er schrumpft beim Jagen und Fliehen, seine Teilchen sind langsam und stoßen andere Körper kaum an.
- **Determinismus:** Seed je Jäger aus dem Level-Seed (im Generator aus dem Seed-Zufall, in Hand-Leveln fest eingetragen), Zustand `{seed, diff, react, next, plan}` im Körper und damit im Schnappschuss (Zurückspulen, Speichern). Test: gleicher Level + gleiche Bot-Eingaben = identischer Schnappschuss, JSON-Schnappschuss mitten im Lauf setzt identisch fort.
- **Darstellung:** gestrichelter, langsam drehender Ring (Farbe relativ zur Spielermasse: warm = größer, kühl = kleiner, weiß = gleich), Ausstoß als warm-helles Teilchen mit Schweif (auch winzig), Rand-Pfeil wie bei jedem größeren Körper.

`tune.js` `T.hunter`: `bot` = `{ ejectSpeed 3, sense 8, horizon 7, maxFrac 0,05, feedRatio 10, feedPenalty 0, preyRatio 0,75, dangerRatio 0,97, costK 3, playerW 2, fleeGap 3, fleeV 0,45, tapTol 0,04 }` (ejectSpeed wird je Stufe überschrieben); `levels`:

| Stufe | `react` s | `aimNoise` rad | `magNoise` | `hesitate` | `vmax` | `ejectSpeed` |
|---|---|---|---|---|---|---|
| easy | 1,1–1,5 | 0,30 | 0,25 | 0,30 | 0,55 | 2 |
| normal | 0,75–1,2 | 0,17 | 0,15 | 0,15 | 0,85 | 2,5 |
| hard | 0,5–0,9 | 0,09 | 0,08 | 0,06 | 1,15 | 3,5 |

**Teilchen von Jägern und `last` (Entscheidung):** Der eigene Ausstoß des Spielers (`gf` = Spieler-id) zählt weiter nie; Teilchen eines Jägers zählen **nach den normalen Regeln** (zählen, sobald Masse ≥ `dustFrac` × Spielermasse). Geprüft, ob das unlösbare Situationen erzeugt: in 2-6 („Aufräumen“, `last` mit Jäger) blieb in 11 Fehlschlägen von 300 Seeds in keinem einzigen ein Jäger-Teilchen als zählender Körper übrig (ein Fehlschlag mit Jäger, 10 mit anderen Körpern; der Bot hat nie verloren, sondern ist ins Zeitlimit gelaufen). Grund: Teilchen eines Jägers sind bei `ejectSpeed` 2–3,5 und Massenanteilen unter 5 % meist kleiner als die Staubgrenze oder werden schnell von irgendetwas gefressen. Keine Ausnahme nötig; Test `Ziel 'last' mit Jaegern` hält die Regel fest.

**4. Kapitel 2 „Jäger“ (8 Levels, öffnet sich mit dem Schaffen von 1-8).** Ziele gemischt (absorb 2×, mass 3×, largest 2×, last 1×); die Levels werden zum Ende hin größer (R 13 → 23). Parameter in `levels.js`:

| Level | Ziel | Inhalt |
|---|---|---|
| 2-1 Der Jäger | absorb (Zielkörper = Jäger, „Absorbiere den Jäger“) | Lehrlevel von Hand: ein kleiner (0,55), langsamer Jäger (easy), 6 kleine Körper, R 13. Bedienhilfe: „Jäger stoßen selbst aus. Sie jagen Kleinere und fliehen vor Größeren.“ |
| 2-2 Verfolger | mass (`mFrac` 0,25) | ein größerer Jäger (1,5–1,8, easy) verfolgt dich, R 16, 18 kleine |
| 2-3 Jagdzeit | absorb | Jäger (1,1–1,4, easy) weit weg (≥ 14), R 20, 26 kleine |
| 2-4 Konkurrenz | largest | ein Riese-Jäger (2,6–3,2, easy), R 19, 26 kleine |
| 2-5 Rudel | mass (`mFrac` 0,22) | zwei Jäger (1,2–1,6, easy), R 17, 20 kleine |
| 2-6 Aufräumen | last | ein kleiner Jäger (0,4–0,6, easy), R 13, 13 kleine (`sLo` 0,2) |
| 2-7 Revier | largest | zwei große Jäger (2,4–3,0, easy), R 23, 34 kleine, Abstand ≥ 12 |
| 2-8 Rudelführer | mass (`mFrac` 0,28) | zwei Jäger (1,3–1,7, easy), ein Brocken 5–6 weit außen, 2 Mittelgroße, R 22, 28 kleine |

`normal` und `hard` kommen in keinem Level vor: gegen den Bot sinken die Quoten dort auf 80–90 % (siehe LESSONS), sie sind für spätere Kapitel und Menschen da (`levels.js`-Parameter `diff`/`hDiffs`, Tageslevel).

**5. Bot-Tabelle (alle Level)** (`node tools/sim-protoplanet.mjs`, `tools/…` plus Hilfsskripte; Spalten: festes Level (Seed): Zeit/Ausstoß; 40 Test-Seeds ab 1000; 300 **andere** Seeds ab 7000, die zum Einstellen nicht benutzt wurden):

| Level | Ziel | fest (Seed): Zeit s / Ausstoß | 40 Seeds ab 1000: gelöst | Median s | p90 s | Median Ausstoß | 300 Seeds ab 7000: gelöst | Median s |
|---|---|---|---|---|---|---|---|---|
| 1-1 Bewegen | absorb | 6.7 / 0.07 | (Lehrlevel) | – | – | – | – | – |
| 1-2 Gefahr | last | 91.1 / 1.65 | (Lehrlevel) | – | – | – | – | – |
| 1-3 Strahl und Zeit | last | 119.0 / 1.79 | (Lehrlevel) | – | – | – | – | – |
| 1-4 Wolke | last | 122 / 3.04 (9) | 40/40 | 134 | 166 | 3.00 | 278/300 (92.7 %) | 134 |
| 1-5 Beute | absorb | 71 / 0.78 (24) | 39/40 | 68 | 110 | 0.81 | 280/300 (93.3 %) | 66 |
| 1-6 Brocken | largest | 79 / 0.41 (59) | 39/40 | 69 | 101 | 0.36 | 293/300 (97.7 %) | 70 |
| 1-7 Ernte | mass | 71 / 0.52 (6) | 40/40 | 77 | 121 | 0.61 | 296/300 (98.7 %) | 79 |
| 1-8 Überholen | largest | 66 / 0.48 (47) | 39/40 | 63 | 90 | 0.49 | 289/300 (96.3 %) | 70 |
| 2-1 Der Jäger | absorb | 9.0 / 0.19 | (Lehrlevel) | – | – | – | – | – |
| 2-2 Verfolger | mass | 60 / 0.32 (24) | 40/40 | 63 | 82 | 0.41 | 292/300 (97.3 %) | 61 |
| 2-3 Jagdzeit | absorb | 54 / 0.88 (36) | 39/40 | 67 | 160 | 1.07 | 290/300 (96.7 %) | 58 |
| 2-4 Konkurrenz | largest | 70 / 0.31 (7) | 39/40 | 68 | 110 | 0.35 | 290/300 (96.7 %) | 68 |
| 2-5 Rudel | mass | 58 / 0.44 (16) | 39/40 | 61 | 90 | 0.54 | 290/300 (96.7 %) | 59 |
| 2-6 Aufräumen | last | 132 / 3.45 (18) | 38/40 | 130 | 174 | 3.50 | 289/300 (96.3 %) | 129 |
| 2-7 Revier | largest | 61 / 0.38 (6) | 38/40 | 68 | 122 | 0.45 | 291/300 (97.0 %) | 67 |
| 2-8 Rudelführer | mass | 85 / 0.96 (51) | 40/40 | 90 | 116 | 0.96 | 291/300 (97.0 %) | 85 |

Alle 40-Seed-Zeilen erfüllen die Test-Kriterien (≥ 38/40, Median 60–300 s), jedes feste Level wird mit 3 Sternen gelöst. **Über 300 fremde Seeds liegen alle Familienlevels aus P2 bei 96,3–98,7 %** (die P1-Level 1-4/1-5 bei 92,7/93,3 %, wie schon in P1 gemessen); die Mediane liegen teils knapp unter 60 s (2-3, 2-5: 58/59 s), auf den Test-Seeds darüber. Gegenprobe zur Obergrenze: in einer Zwischenfassung von 2-7 erreichte der Bot mit regungslosen Jägern 96 %, mit aktiven 89 %; die Jäger kosten also ein paar Punkte, der Rest ist das Level selbst (Mehrspieler-Chaos durch angestoßene Körper).

**6. Spielstände (Entscheidung):** `SAVE_VERSION` 1 → 2. Migration `1 -> 2` löscht Sterne und Bestwerte von **1-6..1-8** (andere Levels mit anderem Ziel; Sterne eines Levels zu behalten, das man nie gespielt hat, wäre falsch) und einen laufenden Schnappschuss dieser Levels. Folge: wer 1-8 schon geschafft hatte, spielt die drei neuen Levels, bevor sich Kapitel 2 öffnet (Freischalten nach „das Level davor geschafft“). Fortschritt und Sterne von 1-1..1-5, Einstellungen und der Schnappschuss von 1-1..1-5 bleiben. Zusätzlich trägt `snap` jetzt `rev` (Fassung des Levels, `level.rev`, fehlt = 1); `snapValid` verwirft beim Laden jeden Schnappschuss, dessen Level es nicht mehr gibt oder dessen Fassung nicht passt (zweite Sicherung, auch für spätere Umbauten); `startLevel` fängt einen beschädigten Schnappschuss ab und beginnt neu. Alte Schnappschuss-Zeilen (10 Spalten) laden (`ai` = null). Getestet in Node (echte Version-1-Ablage über `engine/save.js`) und im Browser (Version-1-Spielstand mit Schnappschuss von 1-7 -> Levelauswahl, mit Schnappschuss von 1-4 -> pausiert fortgesetzt).

**7. Leistung:** 60 s Spielzeit in Node: 1-4 (14 Körper) 34 ms, 2-5 (26 Körper, 2 Jäger) 23 ms, 2-8 (33 Körper) 18 ms (2–5 µs je Schritt); die Jäger-Entscheidungen sind dagegen vernachlässigbar. Nicht auf einem echten Handy gemessen.

**8. Abweichungen und Hinweise:**
1. Die Spezifikation sagt „Gehirn = das des Bots, nur begrenzt“. Reaktionszeit, Rauschen und Zögern allein reichten nicht (der Jäger fraß so gut wie der Bot und wuchs auf 5–15 Massen); dazu kamen Sichtweite, schlechterer Antrieb und eine eigene Flucht. Alles in `T.hunter`, nichts im Code festgelegt.
2. Die Levels nutzen praktisch nur die Stufe `easy` (Bot-Quote); für Menschen ist das nicht zwingend leicht: die Jäger jagen aktiv (`costK` 3, `playerW` 2). **Ob das für Menschen zu schwer oder zu leicht ist, weiß nur der Besitzer.**
3. Stern-Ziele wie in P1 (Bot × 1,3, Lehrlevel großzügig); die Ausstoß-Ziele liegen in den neuen Levels mit 0,4–1,25 Massen (2-6 `last`: 4,5) deutlich unter denen von Kapitel 1, weil der Bot dort kaum ausstößt (Beute 1,1–2,2, ruhende Brocken).
4. 1-4 und 1-5 bleiben bei 92,7/93,3 % über fremde Seeds (P1), die Test-Seeds sind dort 40/40 und 39/40.
5. Familien `strom` und `enge` kommen in keinem Level mehr vor (waren 1-6/1-8), bleiben im Generator (für das Tageslevel) und werden in `tests/protoplanet-gen.test.mjs` mit ihren P1-Parametern geprüft; ihre Bot-Quote wird nicht mehr automatisch gemessen.
6. Der Bot hat im Gehirn einen dritten Durchgang („auch unrentable Beute“, nur für `largest`/`mass`), weil er sonst bis zu 100 s still stand; er ist für `last`/`absorb` ausgeschaltet (1-1..1-5 unverändert).
7. Browser: Playwright 390×844 und 360×740, Touch über CDP; Levelauswahl mit zwei Kapiteln, 1-6 (Hilfe, „Noch 5 größere“, Pausentext), 1-7 (Brocken), 2-1 (Hilfe, Jäger-Ring), 2-5 (zwei Jäger, Jäger-Ausstoß), Ergebnis-Bildschirm; alle Tap-Ziele ≥ 44 px, 0 Konsolenfehler. Nicht auf einem echten Gerät geprüft.
