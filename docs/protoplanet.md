# Protoplanet (Spezifikation)

Fünftes Spiel der Seite und das erste, das **kein Inkrementalspiel** ist: ein ruhiges Physik-Levelspiel fürs Handy.
Du bist ein Staubkorn in einer jungen Sternscheibe. Bewegen kannst du dich nur, indem du Masse ausstößt. Kleinere Körper absorbierst du,
größere absorbieren dich. Jede Bewegung macht dich kleiner.

id `protoplanet`, Ordner `games/protoplanet/`. Architektur: `docs/adr/0003-protoplanet-echtzeit-physik-ausserhalb-der-idle-engine.md`.
Begriffe: `games/protoplanet/GLOSSARY.md` (verbindlich für Code, UI-Texte und Commits; enthält auch die Klang-Begriffe Stimmung, Teppich, Flächenakkord, Einzelton, Kette). Klang: `docs/protoplanet-klang.md`. Vorher `docs/LESSONS.md` lesen:
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
| **P3** (umgesetzt als **Paket B**, wartet auf Abnahme) | Gravitation: Attraktoren (auch auf Bahnen), offener Raum mit Abdrift-Grenze, **Anziehung unter den Körpern** (nur ab Mindestmasse, weich, je Kapitel einstellbar), Kapitel 3 „Protostern“ |
| **P4** (umgesetzt als Paket C, siehe `docs/protoplanet-klang.md`) | Generative Ambient-Musik + Effektklänge (WebAudio, keine Dateien) |
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
- **Gravitation (Kapitel 3, Paket B)**: Nur wenn die Welt `grav` hat. Ein Körper mit `kind: 'attractor'` (Protostern) zieht alle anderen an: `a = gm / (d² + soft²)` (`T.orbit.gm` 80, `soft` 0,3), `gm` ist von `m` getrennt (`m` bestimmt nur Radius und Absorption). Attraktoren spüren selbst nichts und **stehen still** (nach jeder Absorption bleibt `v = 0`; feste Kreisbahnen für Attraktoren sind im Datenmodell nicht umgesetzt, kein Level braucht sie). Der Attraktor absorbiert wie jeder Körper; der Spieler ist dann verloren (`lostTo = 'attractor'`). Integration: semi-implizites Euler (Kick dann Drift, eine Auswertung je Schritt), gemessen: Kreisbahn r 8/14/30 über 50 Umläufe Radius ±1 %, Energie < 1 %; eine Ellipse mit Periapsis 1,6 verliert in 50 Umläufen 2 % Energie (sehr tiefe Bahnen sind im Spiel ohnehin Sturzbahnen).
- **Anziehung unter den Körpern (`selfGrav` 0..1 je Level)**: Die `selfK` (6) schwersten Körper ab `selfMin` (2 Massen) ziehen alle anderen weich an, `a = selfG × selfGrav × m_Quelle / (d² + selfSoft² + (r_Quelle + r_Ziel)²)`. **Der Spieler zieht nie** (er ist die Sonde, die Welt zieht; sonst würden große Spieler die Beute einsammeln und der Bot müsste seine eigene Wirkung vorhersagen). Kosten: ≤ 6 × n Paare je Schritt.
- **Offener Raum (Kapitel 3)**: `arenaR = 0`, kein Rand. `warnR` (Warnung „Zu weit draußen“: roter Rand, Textchip, dezenter Ton, gedrosselt) und `loseR` (Spieler abgetrieben = verloren, `lostTo = 'drift'`); Körper hinter `1,5 × loseR` werden entfernt (ausgenommen Körper mit `tag`). Beides ist zurückspulbar.
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
- **Kapitel 1 „Staubwolke“ (P1)**, 8 Levels (**1-4..1-8 und Kapitel 2 sind seit Paket A neu gebaut, siehe „Paket A“; die Beschreibung hier ist die ursprüngliche Planung**):
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
- Tests (Deploy-Sperre, gesamt < ~20 s; die Abnahme des Bots hat sich mit Paket A geändert, siehe dort, die folgende Aufzählung nennt die alte Regel):
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

## Überarbeitung „rundes Spiel“ (Design-Review nach dem dritten Spielen, Entscheidungen des Orchestrators im Auftrag des Besitzers)
Rückmeldung des Besitzers: Richtung stimmt, aber Levels teils zu leicht und zu schnell vorbei, es fühlt sich nicht wie ein fertiges Spiel an,
Musik fehlt, und er will einen echten **Umlaufbahn-Modus** (Zentralkörper, man kreist und wandert auf Ellipsen). Freie Hand für die Weiterentwicklung.

**Diagnose (aus Code und Messwerten):**
1. **Die Welt steht still.** Fast alle Körper haben `v ≈ 0,03`, Brocken ruhen. Das war eine Folge der Bot-Abnahme (bewegte, wachsende Körper senkten die Quote). Ergebnis: kein Timing, keine Überraschung, kein Druck.
2. **Zu wenig Wachstum.** Der Spieler wächst von 1 auf ~3. Der Reiz des Genres ist die Verwandlung: vom Staubkorn zum größten Körper (10–40×), die Kamera fährt dabei heraus.
3. **Zu kurz.** Bot-Median 60–90 s, `mass`-Ziele enden nach wenigen Happen.
4. **Die Abnahme „95 % über Zufalls-Seeds“ hat die festen Levels weichgespült.** Sie ist für das Tageslevel richtig, für handverlesene Kapitel-Levels falsch.
5. Kein Klang, kaum Rückmeldung (Aufnahme, Sieg, Verlust, Übergänge), kein Auftakt und kein Abschluss eines Levels.

**Entscheidungen:**
- **Lebendige Welt:** Körper treiben mit echten Geschwindigkeiten (0,1–0,6), Strömungen, gegenläufige Bänder; auch Große bewegen sich. Dass Rivalen von selbst wachsen, ist gewollt (Zeitdruck).
- **Massenleiter:** Jedes normale Level hat Futter in geometrischen Stufen, sodass der Spieler am Ende 8–30 Startmassen hat; größere Arenen (R bis ~60), `camMax` entsprechend.
- **Dauer:** Lehrlevels kurz, normale Levels Bot-Median 2–4 min, Kapitel-Finale bis 6 min. Zeitstufen bleiben.
- **Schwierigkeit steigt je Kapitel sichtbar**; das letzte Level jedes Kapitels ist ein „Finale“. Jäger ab der Kapitelmitte `normal`, am Ende `hard`. Wenn der Bot das nicht schafft, wird der Bot besser, nicht das Level leichter.
- **Neue Abnahme:** feste Levels: der Bot löst den festen Seed in mindestens 2 von 3 Bot-Varianten (unterschiedliche Entscheidungs-Phase), Median der Zeit im Zielkorridor. Familien über 40 Zufalls-Seeds: ≥ 80 % (wird berichtet). Die 95 % gelten nur noch für Familien, die das Tageslevel benutzt (`daily: true`).
- **Kapitel 3 „Protostern“ = Umlaufbahn-Modus:** Zentralkörper, alles kreist, der Spieler startet auf einer Kreisbahn. Schub in/gegen Flugrichtung hebt/senkt die Bahn (Ellipsen). **Bahnvorschau** (gepunktete vorhergesagte Bahn des Spielers) ist Pflicht: ohne sie ist Bahnmechanik auf dem Handy Raten. Verlust: in den Stern fallen oder abtreiben.
- **Spielgefühl:** Level-Auftakt (Kamera fährt von der Übersicht auf den Spieler), sichtbares Hinüberfließen beim Absorbieren, Sieg- und Verlustmoment (kurze Zeitlupe, Lichtwelle), weiche Bildschirmwechsel, Farbwelt je Kapitel, Haptik.
- **Musik:** generativ per WebAudio, standardmäßig AN (nach der ersten Berührung), reagiert auf Gefahr und Größe; Effekte in der Tonart.
- Reihenfolge: (A) Levels/Balance Kapitel 1–2 ∥ (C) Klang → (B) Kapitel 3 Umlaufbahn → (F) Spielgefühl → (D) Kapitel 4/5 + Tageslevel, soweit die Qualität reicht.

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


### Paket A: lebendige, längere, schwerere Levels (Kapitel 1 und 2) — umgesetzt

Auftrag aus „Überarbeitung ‚rundes Spiel‘“ (Diagnose: Welt steht still, Spieler wächst nur 1 -> 3, Levels 60–90 s, Abnahme hat die festen Levels weichgespült). UI, Render, Eingabe und Kamera blieben unberührt (`camMax` 34 -> 66 in `tune.js`).

**1. Generator `welt` (`gen.js`).** Eine Familie für alle neuen Levels: `params = { R, goalType, mass?, slack?, groups[], hunters[], starter?, sep?, vMul? }`.
- **Massenleiter:** Gruppen mit wachsender Masse (`lad(k, v, top)` in `levels.js`: Staub 0,12–0,45, Kleine 0,5–0,9, Mittlere 1,1–1,9, wenige Große 2,2–3,4; k = 10 sind 36/16/9 Körper). Gesamtmasse der Körper 21 (2-6) bis 92, der Bot endet je nach Ziel bei 7–28 Startmassen.
- **Strömungen** je Gruppe: `swirl` (Tangenten um die Mitte, auch gegenläufige Ringe `rMin/rMax/dir`), `drift`, `bands`, `swarm`, `rand` (Kometen, v ~ 1). Der Spieler startet in Ruhe; mittlere Startgeschwindigkeit 0,16–0,26.
- **Grundregeln bleiben** (`checkRules`): nichts überlappt, kleinerer Körper in Reichweite, kein größerer Körper kommt in 5 s näher als 3 Radien (jetzt mit echter Geschwindigkeit je Körper beim Platzieren geprüft), Masse reicht fürs Ziel. Neu: **Starthilfe** (4 kleine, langsame Körper 3–7 vom Spieler) und **`sep`** (große Körper >= 1,4 und Jäger mindestens 10 voneinander entfernt).
- Hand-Level 1-1, 1-2, 1-3, 2-1 sind unverändert (kein `rev`). Die Altfamilien `wolke|ziel|strom|enge|brocken|jaeger` bleiben im Generator (Tageslevel) und werden mit ihren Alt-Parametern getestet.

**2. Level-Tabelle** (Messung: `node tools/sim-protoplanet.mjs --seeds 30`; „fest“ = fester Seed in 3 Bot-Varianten, Zeit in s / Endmasse; „30 Seeds“ = Test-Seeds 1000..1029; „150 fremde“ = Seeds 7000..7149, nicht zum Einstellen benutzt; Median-Zeit der Familie in s):

| Level | Name | Ziel | Charakter | Körper | R | fest: 3 Varianten (s / Endmasse) | 30 Seeds | 150 fremde (Median s) | Endmasse Median |
|---|---|---|---|---|---|---|---|---|---|
| 1-4 | Treibgut | Masse 14 | ruhiger Wirbel, 4 Stufen, v 0,2 | 68 | 36 | 169 / 145 / 174 (14) | 27/30 (171) | 144/150 = 96 % (154) | 14,0 |
| 1-5 | Wanderer | Zielkörper absorbieren | wandernder Zielkörper 3,2–3,6 (v 0,3) im schnelleren Treibgut | 60 | 34 | 141 / 152 / 146 (17–18) | 27/30 (144) | 130/150 = 87 % (154) | 15,8 |
| 1-6 | Gegenströme | unangreifbar | zwei gegenläufige Ringe, Brocken 6–7 im Außenring | 110 | 56 | 120 / 117 / 93 (7) | 27/30 (119) | 145/150 = 97 % (116) | 7,2 |
| 1-7 | Wirbel | unangreifbar | ein großer Wirbel (v 0,25), 2 Kometen, Brocken 6–7 | 67 | 44 | 131 / 132 / 131 (6,4) | 27/30 (140) | 132/150 = 88 % (135) | 7,3 |
| 1-8 | Kometenschwarm (Finale) | Masse 28 | größte Arena, 133 Körper, 3 Kometen | 133 | 50 | 246 / 218 / 248 (28) | 27/30 (261) | 126/150 = 84 % (244) | 28,1 |
| 2-2 | Verfolger | Masse 12 | ein leichter Jäger (easy, 1,5–1,8) verfolgt dich | 68 | 32 | 130 / 114 / 138 (12) | 27/30 (131) | 140/150 = 93 % (143) | 12,0 |
| 2-3 | Jagdzeit | Jäger absorbieren | Zielkörper ist ein normaler Jäger (1,4–1,8) | 81 | 36 | 157 / 165 / 155 (15–24) | 30/30 (172) | 143/150 = 95 % (130) | 15,0 |
| 2-4 | Konkurrenz | unangreifbar | Riesenjäger (normal, 8–9) | 100 | 46 | 131 / 139 / 145 (11–12) | 28/30 (131) | 133/150 = 89 % (145) | 9,4 |
| 2-5 | Rudel | Masse 14 | zwei normale Jäger (1,2–1,6) | 89 | 38 | 166 / 127 / 144 (14) | 27/30 (145) | 140/150 = 93 % (158) | 14,0 |
| 2-6 | Aufräumen | letzter Körper | kleine Arena, normaler + leichter Jäger | 43 | 28 | 250 / 274 / 266 (12–20) | 24/30 (257) | 130/150 = 87 % (263) | 18,2 |
| 2-7 | Revier | unangreifbar | zwei große Jäger (normal 6–7, **hard** 5,5–6,5) | 120 | 54 | 145 / 126 / 111 (9) | 27/30 (136) | 133/150 = 89 % (127) | 8,9 |
| 2-8 | Rudelführer (Finale) | Masse 22 | harter + normaler Jäger, dichtes Feld | 107 | 42 | 185 / 189 / 167 (22) | 27/30 (189) | 125/150 = 83 % (194) | 22,1 |

Alle zwölf neuen Levels: 3 von 3 Varianten lösen den festen Seed (Test verlangt 2 von 3), alle 30-Seed-Quoten >= 80 % (2-6 mit 24/30 genau an der Grenze, über 150 fremde Seeds 87 %), über fremde Seeds 83–97 %. Namen sind eindeutig, Ziele gemischt (Kapitel 1: absorb, last, last, mass, absorb, largest, largest, mass; Kapitel 2: absorb, mass, absorb, largest, mass, last, largest, mass). **Zeitkorridor:** Normale Levels 117–172 s (Ziel war 120–240 s: `largest`-Levels 1-6/1-7/2-4/2-7 und 2-2 liegen mit 116–145 s am unteren Rand), Finale 1-8 244–261 s (Ziel 240–360 s erreicht), **Finale 2-8 nur 189–194 s (Ziel 240–360 s verfehlt)**, `last` 2-6 257–263 s. Längere `largest`/Jäger-Levels haben die Quote unter 80 % gedrückt (siehe unten), deshalb nicht verlängert.

**3. Was die Messungen bestimmt hat (alle mit >= 48 Seeds, `--params/--tune` der Sim).**
- **Strömung `swirl` statt Drift/Bänder:** gemeinsame Drift stößt an den Rand und prallt zurück (Gegenverkehr, Zusammenstöße), Tangenten bleiben im Ring (Billard im Kreis). 1-4 mit Drift 8/16, mit `swirl` 15/16.
- **Das Hauptproblem ist der Lawinen-Rivale:** zwei, drei mittelgroße Körper verschmelzen früh (3 -> 9 -> 20+), fressen den Vorrat, der Spieler bleibt klein (Zeitlimit). Passiv wächst der größte Körper moderat (2,9 -> 6,5 in 240 s, Median). Die Lawine entsteht vor allem durch **frühes Verschmelzen großer Körper**: `sep` 10 hob die Bot-Quote von 63 auf 85 % (2-2 mit hartem Jäger), kleineres Tempo (0,2 statt 0,35) um ~15 Punkte. Verschwindende Teilchen (Ausstoß füttert Rivalen nicht mehr) brachte nur 17 -> 19 von 24: der Ausstoß ist weniger wichtig als vermutet. **Brocken fressen in einer lebendigen Welt alles** (5 -> 29 in 240 s, auch mit `rockKeep`): höchstens ein Brocken (6–7) und nur in `largest`-Levels; in Kapitel 2 keine.
- **Zielwahl:** `last` ist am schwersten (80–87 %, der Bot stößt mehr Masse aus, als er am Ende hat), `mass` mit hohem Wert am verlässlichsten (90–97 %). `largest` gegen Brocken/Jäger ab 8–9 Massen fällt unter 80 %: der Rivale wächst mit.
- **Jäger:** `hard` (vmax 1,15, ejectSpeed 3,5) senkte die Bot-Quote einer sonst 95-%-Welt auf 63 %; `hard` jetzt vmax 0,9, ejectSpeed 3, react 0,55–0,95 (`normal` vmax 0,75): ~83 %. Weniger Gier (`T.hunter.bot.costK` 5 statt 3) +9 Punkte, **Sichtweite `sense` 10 statt 8: -28 Punkte** (62 %). Probiert ohne Wirkung: Bot gewichtet Jäger höher (`hunterW` 3: schlechter, 23 statt 30 von 48). Die Jäger konkurrieren trotzdem spürbar: sie wachsen in 100 s von 1,8 auf 5–7 und fressen Futter.

**4. Bot (`brain.js`, gleiches Gehirn für Jäger).** Neu: (a) **Bahnvorhersage mit Randabprall** (`trajOf`: Positionen je 0,5 s für Beute, 0,25 s für Gefahren, die Relativbewegung ist je Abschnitt linear, der kleinste Abstand wird exakt gerechnet); (b) **Beute nach dem Ausstoß noch fressbar** (`catchRatio` 0,85 neu, begonnene Jagd bis `keepRatio` 0,95; vorher kippte der Plan, weil der Ausstoß den Bot kleiner macht, und der Bot gab nach jedem Schub das Ziel auf = der größte Einzelfehler: 1-8 52 -> 83 %, 1-5 71 -> 90 %, 1-6 79 -> 88 % bei je 48 Seeds); (c) `costK` 7 -> 3 (schnelleres Wachstum und kürzere Zeiten; 1,5 / 2,2 / 3 / 5 liegen innerhalb des Rauschens, 7 war in der lebendigen Welt schlechter, z. B. 1-8: 25 statt 34 von 48), `margin` 1,1 -> 0,5; (d) für `absorb` ebenfalls der dritte Durchgang („auch unrentable Beute“) und eine **weite Anfahrt** (`tausFar` 38/55 s, nur wenn nichts in Reichweite ist: sonst steht der Bot in der leeren Mitte); (e) Bot-Varianten (`playLevel(level, {variant})`, Phase 14 Schritte × v). Die vorausschauende Planung per Vorwärtssimulation von Kandidaten-Schüben wurde **nicht** umgesetzt (Aufwand gegen Zeit; die Bahnvorhersage und die Kauf-Regel haben die Fehler gefunden, die gemessen wurden). Verworfen nach Messung: `rivalBoost` (größte Rivalen bevorzugen), `hunterW`, andere Horizonte/Gefahrenschwellen (Rauschen ±5 Punkte). **Deterministisch** wie bisher (Cache der Bahnen hängt an Welt und Schrittzahl, keine Zufallszahl im Bot).

**5. Physik und Leistung.** `findPairs`: Sweep entlang x (Einfügesortierung, Paare in fester Reihenfolge (i, j), identisch zum Paarvergleich, Test bleibt) statt Map-Raster: 135 Körper 3–5× schneller (Profil: 149 -> 31 ms von 310 ms je 68 s Spielzeit). `T.gridMinBodies` 24. Alle Protoplanet-Tests zusammen 121 Tests, ~19 s Wanduhr (~51 s CPU, 4 Kerne).

**6. Neue Abnahme (Begründung).** Wie in „Überarbeitung ‚rundes Spiel‘“ entschieden: feste Levels sind handverlesene Aufgaben, kein Zufallstest; der Bot muss sie in 2 von 3 Varianten (Entscheidungs-Phase) lösen, sonst hätte ein einzelner Glückslauf die Level weichgespült; Zeitkorridor statt Mindestzeit-Median; Familien über 30 Zufalls-Seeds >= 80 % (jeder Test-Seed kostet ~1 s, 40 wären ~40 s); die 95 %-Regel gilt künftig nur für Familien mit `daily: true`. Neu „Welt lebt“ (mittlere Startgeschwindigkeit >= 0,08, Endmasse des Bots im Median >= 6) und „Stern-Ziele erreichbar“ (mindestens eine Variante je Ziel); Stern-Ziele = Bot-Median der Varianten × 1,3 (Zeit und Ausstoß). Test-Seeds 1000..1029 sind nicht die Seeds, mit denen die Levels gebaut wurden (feste Seeds aus 1..40 mit `--pick`), die 150 fremden Seeds (7000+) sind die ehrliche Gegenprobe: 83–97 %.

**7. Spielstand.** `SAVE_VERSION` 3, Migration `2` (`REBUILT_V3`): Sterne und Bestwerte der zwölf neuen Levels weg, `done` bleibt (Kapitel 2 bleibt offen), laufende Schnappschüsse dieser Level gehen weg; alle zwölf `rev: 3`, `snapValid` verwirft auch Schnappschüsse mit `rev` 2 (altes 1-6..1-8). Getestet mit einem echten Version-2-Spielstand (Ablage über `engine/save.js`).

**8. Browser (Playwright, 390×844, 1-5, 1-8, 2-5, 2-8, Bot spielt 20 s mit).** Screenshots gesehen: alle Körper sichtbar und bewegt, die Kamera fährt heraus (halbe Breite 36–52), Jäger mit gestricheltem Ring, 0 Konsolenfehler. Bildzeit in Headless-Chromium (Desktop-CPU, kein Handy!) mit 135 Körpern (1-8): Median 16,7 ms (60 fps), p99 16,8 ms, Maximum 33 ms; 2-8 (112 Körper) gleich. Nicht auf einem echten Handy gemessen.

**9. Offen / Hinweise.**
- Menschenzeiten und -Gefühl weiter unbekannt; die Levels sind für den Bot kalibriert. Besonders `last`-Levels (1-2/1-3 als Lehrlevel in 2 von 3 Varianten, 2-6) sind für den Bot grenzwertig.
- 1-2 (Hand-Lehrlevel, unverändert): die Bot-Variante 1 läuft in das Zeitlimit (2 von 3 Varianten lösen es); der Bot steht dort, ein Mensch nicht. Nicht angefasst (Lehrlevel, kein `rev`).
- Finale 2-8 (189–194 s) ist kürzer als das Ziel (240–360 s); längere Fassungen haben die Bot-Quote unter 80 % gedrückt.
- Stern-Ziele sind Bot-Werte × 1,3; für Menschen vermutlich zu streng beim Ausstoß (Bot stößt 3–24 Massen aus, in 1-8 14), nach dem Spielen nachjustieren.
- Die Messung hat ±5 Punkte Rauschen bei 48 Seeds; alle Parameterentscheidungen oben mit >= 48 Seeds, die Endwerte mit 150 fremden Seeds.


### Paket B: Kapitel 3 „Protostern“ (Umlaufbahn-Modus) — umgesetzt

Wunsch des Besitzers: ein Modus wie eine Umlaufbahn, mit einem Körper in der Mitte, um den man kreist und auf Ellipsen hin und her wandert. Klang-Begriffe: Glossar, Abschnitt „Klang“; Klang selbst: `docs/protoplanet-klang.md`.

**1. Physik und Werte** (`physics.js`, `tune.js T.orbit`; Beschreibung oben unter „Physik“). `gm` 80 (Kreisbahn r 14 = 37 s Umlauf, v 2,4), `soft` 0,3, Protostern r 3,5. Ein Schub Δv 0,25 hebt die Bahn von 14 auf ~20 und kostet ~4 % Masse. `selfG` 2, `selfMin` 2, `selfK` 6, der Spieler zieht nie. Offener Raum: `warnR` = 0,72 `loseR`. Schnappschuss: `g` und 12. Feld `gm` nur mit Gravitation (Kapitel 1/2 byte-gleich, Test). Zeitstufen: ×10 = 20 Schritte je Bild (< `maxStepsPerFrame` 40), gemessen stabil.

**2. Bahnvorschau** (`orbit.js predictOrbit`, `render.js`). Leapfrog mit Schritt 0,05/ω (~125 je Umlauf), 1,25 Umläufe, Punktabstand 9 px, verblassend, rot im Stern, bernstein jenseits `warnR`, Kreuz am Ende; sofort nach jedem Ausstoß, sonst alle 0,1 s (im Strahl 0,05 s). Kosten im Browser (10 s Lauf): Mittel 0,055–0,081 ms, Maximum 0,2 ms je Berechnung; im Node-Test < 1,5 ms (Grenze). Abweichung zur echten Bahn nach einem Umlauf < 2 % (Test für 4 Bahnen).

**3. Kamera/Darstellung.** Auftakt: Übersicht (Mitte = Stern) 3,2 s, Ring um den Spieler, dann langsam hinein; danach Zoom = max(Auto, 0,8 × Sternabstand + Sternradius, 0,72 × Apoapsis), Blick 40 % zum Stern hin, Marke am Rand wenn der Stern außerhalb liegt. Stern: Kern mit pulsierender Korona (aus bei „Weniger Bewegung“), Bahnringe, gestrichelte Warn-/Verlustgrenze, roter Randschein bei Abdrift. Klang: Stimmung 3 über `setScene`, neuer Effekt `warn`, Verlustklang auch für Stern/Abdrift.

**4. Level-Tabelle** (fest = fester Seed, 3 Bot-Varianten, Zeit s / Endmasse; 30 Seeds = 1000..1029; 150 fremde = 7000..7149, Median s):

| Level | Name | Ziel | Charakter | Körper | fest (Seed) | 30 Seeds | 150 fremde | Endmasse |
|---|---|---|---|---|---|---|---|---|
| 3-1 | Umlaufbahn | letzter Körper | Lehre: 4 Kleine auf Nachbarbahnen, Hilfe „Du kreist …“ | 5 | 114 / 114 / 119 (2,2) | – | – | 2,2 |
| 3-2 | Höher | Masse 2,1 | Lehre: Beute außen (r 19–25), Hilfe zu Schub vor/hinter dich (beide Steuerungen) | 5 | 170 / 231 / 170 (2,1) | – | – | 2,1 |
| 3-3 | Tiefer | Zielkörper „Funke“ | Lehre: Beute innen (r 8,5–12), Stern als Gefahr | 5 | 11 / 12 / 14 (1,6) | – | – | 1,6 |
| 3-4 | Staubgürtel | Masse 9 | Leiter in Spuren r 7–30 | 37 | 156 / 95 / 173 (Seed 1) | 29/30 (138) | 147/150 = 98 % (165) | 9,0 |
| 3-5 | Kometen | Zielkörper 2,2–2,6 | Leiter + 4 Kometen (Ellipsen) | 35 | 143 / 63 / 143 (Seed 5) | 30/30 (97) | 149/150 = 99 % (102) | 6–10,6 |
| 3-6 | Enges System | letzter Körper | kompakt r 8–22, nur prograd | 29 | 271 / 313 / 217 (Seed 1) | 29/30 (297) | 145/150 = 97 % (312) | 12–14,5 |
| 3-7 | Planet | unangreifbar | Planet 2,6–3 mit Eigenanziehung (`selfGrav` 0,15) | 31 | 111 / 108 / 105 (Seed 30) | 26/30 (76) | 127/150 = 85 % (57) | 5,8 |
| 3-8 | Gegenläufer | Masse 14 | größtes System, Gürtel gegenläufig r 33–42 | 68 | 198 / 174 / 135 (Seed 6) | 27/30 (169) | 140/150 = 93 % (179) | 14,0 |

Alle fünf Familien-Levels über 30 Seeds ≥ 80 % (3-7 87 %), feste Seeds in 3 von 3 Varianten. Zeitkorridor normal 60–420 s, Finale bis 480 s: erfüllt. **Abweichungen:** 3-7 ist mit Median 57–76 s kurz (`largest` gegen einen Planeten; längere Fassungen kippen unter 80 %, siehe LESSONS) und endet im Median bei 3,5–4,5 Massen (Test verlangt dort 3,5 statt 6); Ziel `last` steht in 3-1 und 3-6 (kompaktes System, ohne Gegenläufer: die sind für den Bot nicht einzufangen), Gegenläufer sind Futter im Finale. Kometen nur in 3-5, Anziehung unter den Körpern nur in 3-7, sonst lösen sie Lawinen aus. Attraktoren auf festen Bahnen und `survive`/`absorbCenter` sind nicht umgesetzt. Stern-Ziele (Bot-Median × 1,3; Lehrlevels großzügiger) sind für Menschen vermutlich zu streng.

**5. Bahnplaner** (`orbit-bot.js`, `T.orbit.plan`): Entscheidung alle 1,5 s (0,5 s bei nahenden Größeren), Vorhersage aller Körper einmal (Leapfrog h 0,5 s, 40 s, mit Anziehung der schweren Körper), Kandidaten: dichte Suche vor/zurück (0,012…0,75, Faktor 1,1) + 24 Richtungen × 3 Stärken, Verfeinerung der zwei besten nach Potenzial (6 Hangkletter-Runden), Bewertung = Beute (Teilgewinn nach Absorptionsformel, Formgewinn für Beinahe-Treffer, `exp(−t/22)`) − `costK` × Ausstoßkosten; verworfen: Stern (+1,5), Abdrift, Größere (0,5 + 0,3 s × Relativtempo). Kosten ~0,33 s CPU je Lauf. Alte Kapitel behalten den alten Planer.

**6. Tests/Laufzeit.** `tests/protoplanet-orbit.test.mjs` (20 Tests: Bahnstabilität, Ellipse, Gravitation, Impuls, Stern absorbiert, Abdrift, Vorschau, selfGrav + Determinismus, Schnappschuss/Rewind, alte Schnappschüsse und Spielstand v3, Ziele, Klang, Kamera, Level, Generator über 125 Seeds, ruhige Welt), `tests/sim-protoplanet-orbit{,2,3,4}.test.mjs` (26 Bot-Tests, 14/10/9/20 s parallel). `protoplanet-gen.test.mjs` auf Kapitel 1/2 eingegrenzt. Ganzes `npm test` (alle Spiele) 281 s, 602 Tests.

**7. Browser** (Playwright, 390×844 und 360×740, Touch/CDP-frei per `startLevel`): 3-1 Übersicht + Hilfe + Vorschau, 3-2 nach Schub (Ellipse), 3-5/3-7/3-8 im Lauf, „Zu weit draußen“, „In den Stern gestürzt“, Levelauswahl mit drei Kapiteln; 0 Konsolenfehler. Bildzeit 3-8 (68 Körper, Headless, vsync 60): ×1 und ×10 Median 16,7 ms, p95 16,7, max 16,8; ×10 = 100 s Spielzeit je 10 s. Kein echtes Handy.

**8. Offen.** Gefühl und Schwierigkeit für Menschen unbekannt (Bahnmechanik ist ungewohnt: Lehrlevel 3-1 braucht den Bot 114 s). Gehört wurde der neue `warn`-Ton nicht. Preview zeigt nur die Sterngravitation, nahe Planeten lenken ab.


### Paket F: Spielgefühl — umgesetzt

Ziel (Besitzer: „fühlt sich noch nicht an wie ein fertiges Spiel“): sehen und spüren, nicht Physik. Geändert: `render.js`, `camera.js`, `ui.js`, `style.css`, neu `fx.js`, `tune.js` (`fx`, `worlds`, `intro`, `camExp`, `chapterOpen`), `audio.js` (`star`), `rewind.js` (`peek`, nur lesend), `state.js` (Freischalten), `levels.js` (`targets` only). Physik, Generatoren, Bot und Levelinhalte unverändert.

1. **Kamera:** `camSpan` 12 → 6,5, `half = camSpan × r^0,78` (`camExp`), `camMin` 4, `camBigNear` 0 (Arena-Kapitel zoomen für Größere nicht mehr heraus). Spieler füllt am Start ≈ 15 % der Breite, bei m 28 sind es 43 px Radius statt konstant. Randpfeile: Größe nach Masse, Beschriftung „×2,4“, Deckkraft nach Nähe, bis 5, auch nicht nahende innerhalb 2,2 Sichtweiten (Brocken/nahende 4). Orbit-Kamera (Apoapsis) unverändert funktional. Camera-Tests angepasst/ergänzt.
2. **Auftakt:** Übersicht → smoothstep-Fahrt 1,7 s (0,35 s Halt; Kapitel 3 2,6 s, „Weniger Bewegung“ 0,45 s ohne Fahrt), Titel + Ziel groß, danach wandern sie nach oben und blenden aus; Tippen überspringt (0,28 s), Physik startet erst danach; Klang `levelStart`.
3. **Absorbieren:** Strom (Leuchtteilchen vom Kleineren zum Größeren bei Überlappung mit dem Spieler), Atmen (Skalierung 11 % + Aufleuchten), Ring + Funken bei eigener Aufnahme, Haptik; beim Gefressenwerden warme Teilchen. **Gefahren-Hinweis:** `dangerScan`, Größere auf Kollisionskurs bis 4,5 s voraus, Randglühen aus ihrer Richtung (bis 0,78 Alpha, kein Blinken), Doppelimpuls höchstens alle 7 s.
4. **Ausstoß:** Rückstoß (Stauchen 17 % in Schubrichtung, 0,13 s), weiche Abgas-Funken, Teilchen mit zweiteiligem Schweif und Halo; Haptik 5 ms (im Strahl nur beim Start).
5. **Sieg:** Kopie der Welt läuft 1,15 s in Zeitlupe (0,22), Lichtwelle + Ringe, Ausblenden (0,86), Ergebnis-Karte fährt ein, Sterne nacheinander (0,42 s Abstand, Ton `star` je Stern), „Weiter“ 56 px, Bestwerte, je fehlendem Stern „Du: …, also … zu viel / zu langsam“, Hinweis auf neues Kapitel. **Verlust:** Zeitbremse auf Kopie, Abdunkeln (0,66), Ring, nach 1,0 s der Dialog. **Zurückspulen:** 0,95 s Rückwärtslauf aus den Schnappschüssen (`blendWorlds`, kühle Tönung), danach Pause mit „Tippe, um weiterzuspielen“ (kein Dialog).
6. **Übergänge:** `go()` = 170 ms Abblenden/Aufblenden zwischen Auswahl, Level, Neustart, Ergebnis; Dialoge poppen ein, Karten der Auswahl steigen gestaffelt auf.
7. **Farbwelt:** `T.worlds` je Kapitel (Verlauf vorgezeichnet je Größe, 3–4 Nebelflecken mit Parallax, Akzentfarbe als `--accent` für UI und Arena-Ring): 1 blau/türkis, 2 violett, 3 dunkles Purpur/Bernstein. Körper-Sprites mit Schattenseite. Größen-Farbcode unverändert, Hintergründe dunkel und gedämpft.
8. **Auswahl:** großer Knopf „Weiter spielen“, Kapitel-Karten mit Farbwelt, Fortschrittsbalken, Sterne, gesperrte Kapitel nennen „Öffnet sich, sobald du 5 Level in Kapitel N geschafft hast (x von 5)“, treibende Körper als Hintergrund. **Freischalten:** `T.chapterOpen` 5 (oder das Finale des vorigen Kapitels, damit alte Spielstände offen bleiben); innerhalb Level für Level. `SAVE_VERSION` bleibt 3.
9. **Stern-Ziele:** Bot-Median × 2 (Zeit) / × 1,8 (Ausstoß), Lehrlevels (1-1..1-3, 2-1, 3-1..3-3) behalten das Größere aus alt/neu. Beispiele: 1-4 340 s / 13,25, 1-8 495 s / 24,05, 2-6 535 s / 33,35. Abnahmetests unverändert grün.
10. **HUD:** Zielsymbol je Typ (Fadenkreuz, Punkte, Gipfel, Ringe), Balken/Prozent pulsieren ab 86 %, Masse-Chip und Zeittaste gleiche Optik (Akzentrand), Kopfzeile ≈ 7 % der Höhe.
11. **Haptik:** Aufnahme 9 ms, großer Happen (≥ 25 % der eigenen Masse) 24 ms, Ausstoß 5 ms, Gefahr [14,70,14], Verlust 260 ms, Sieg [18,60,18,60,50]; kurze Impulse ≥ 150 ms Abstand, abschaltbar.
12. **Leistung (Headless-Chromium, Desktop, vsync 60, 6 s):** 1-8 (133 Körper) ×1 und ×10: Median 16,7 ms, p95 16,7–16,8, max 16,8; 3-8 (69 Körper) ebenso. Zeichenzeit im Mittel 0,3–0,46 ms (nur JS). Pool max 320 Partikel (Weniger Bewegung 70), bis 10 Ringe, Stromteilchen nur bei ≤ 10 überlappenden Paaren. **Kein echtes Handy gemessen.**

Prüfung: Playwright 390×844 und 360×740, Bildfolgen in `scratchpad/protoplanet-f/`; frischer Spielstand → 1-1 per CDP-Touch gewonnen → Karte → „Weiter“ → 1-2 startet (Auftakt); Spielstand mit Schnappschuss lädt pausiert; 0 Konsolenfehler.
