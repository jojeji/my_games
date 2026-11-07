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
| **P2** | Gravitation (Attraktoren, auch auf Bahnen), offener Raum mit Abdrift-Grenze, Kapitel 2 und 3, Tageslevel |
| **P3** | Klänge (WebAudio, keine Dateien), Feinschliff nach den Spielerfahrungen des Besitzers. Ein generativer Ambient-Klangteppich ist eine Option für später. |

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
  Das ausgestoßene Teilchen entsteht am Rand des Spielers in Richtung `d` mit Geschwindigkeit `v + ejectSpeed * d` (`ejectSpeed` Startwert 6 Welteinheiten/s,
  1 Welteinheit = Radius des Spielers beim Start, also eine feste Geschwindigkeit unabhängig von der aktuellen Größe). Der Spieler bekommt `v' = v - dm/(m - dm) * ejectSpeed * d` (Impulserhaltung, exakt).
  Ausstoß ist nur möglich, solange `m - dm >= minPlayerMass`. Ausgestoßene Teilchen sind normale Körper und können von jedem absorbiert werden (auch vom Spieler).
  Damit der Spieler sein eigenes Teilchen nicht sofort wieder schluckt, ignoriert er es für `ejectGrace` (0,3 s).
- **Dauerstrahl**: Halten länger als `holdDelay` (150 ms) stößt mit `streamHz` (10/s) je `streamFrac` (0,008) aus, Richtung folgt dem Finger.
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
- Automatik-Zoom: Die sichtbare halbe Breite ist ≈ `camSpan` (12) × Spielerradius, begrenzt durch `camMin/camMax` und die Arena.
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
  2. Lehre „Gefahr“ (von Hand): einige kleinere Körper, ein langsam treibender größerer. Hilfe: „Warme Körper sind größer als du. Weich ihnen aus.“ Ziel: Masse M.
  3. Lehre „Strahl und Zeit“ (von Hand): verstreute kleine Körper, weite Wege. Hilfe: „Halte gedrückt für einen Strahl. Unten rechts läuft die Zeit schneller.“ Ziel: werde der größte Körper.
  4.–8. aus Familien: `wolke` (zufällige Wolke, Größenverteilung über `params`, Ziel: größter Körper), `ziel` (ein markierter größerer Körper, Ziel: absorbiere ihn),
     `strom` (Körper in einem kreisenden Band, Ziel: Masse M), `enge` (viele etwas größere, wenige kleinere Körper, Ziel: größter Körper). Reihenfolge und Parameter so, dass die Schwierigkeit steigt.
- **Kapitel 2 „Protostern“ (P2)**: ein Attraktor, Familien z. B. `orbit` (Körper auf Bahnen), Ziele „überlebe N Umläufe“, „Masse M“, „absorbiere den Zentralkörper“.
- **Kapitel 3 „Planetensystem“ (P2)**: mehrere Attraktoren, auch auf Bahnen (Doppelstern, Planeten um Stern).
- **Tageslevel (P2)**: Seed aus dem Datum (`JJJJMMTT`, lokale Zeit), Familie per Seed aus allen Familien der freigeschalteten Kapitel. Kein Server.
  Gezeigt werden Zeit und ausgestoßene Masse, die Bestwerte des Tages werden gespeichert, Sterne gibt es dort nicht.
- **Freischalten**: Ein Level schaltet das nächste frei, das letzte Level eines Kapitels das nächste Kapitel. Sterne sind nur Zusatz.

## Ziele und Wertung (`goals.js`)
- Zieltypen: `largest` (der Spieler ist größer als jeder andere Körper, Attraktoren eingeschlossen), `absorb` (Körper X existiert nicht mehr; wer ihn absorbiert hat, ist egal, die Generatoren sorgen dafür, dass realistisch nur der Spieler es kann),
  `mass` (Spielermasse ≥ M), ab P2 `absorbCenter` (der Zentral-Attraktor ist absorbiert) und `survive` (N Umläufe um den Attraktor überlebt, gezählt am Winkel).
- Verlieren: Spieler absorbiert (`m < minMass`) oder, ab P2, abgetrieben. Kein automatisches „Unlösbar“; Neustart ist immer im Pausenmenü.
- Oben eine schmale Zielzeile mit Fortschritt (z. B. „Werde der größte Körper · 42 %“, Fortschritt = eigene Masse / Masse des größten anderen Körpers).
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

## Umsetzung und Messungen

### P1 (Kern + Kapitel 1) — umgesetzt

**Was steht (alles unter `games/protoplanet/`):**
`tune.js` (alle Zahlen), `physics.js` (r = sqrt(m), fester Schritt 1/120, semi-implizites Euler, Ausstoß mit exakter Impulserhaltung, Absorbieren nach der Formel der Spezifikation, Paarvergleich bzw. Raster ab 40 Körpern mit fester Paarreihenfolge, elastische Kreis-Arena, `ejectGrace`),
`rewind.js` (Ringpuffer, Schnappschuss alle 0,5 s, 10 s), `goals.js` (`largest`, `absorb`, `mass`, Sterne), `gen.js` (Familien `wolke`, `ziel`, `strom`, `enge` + `checkRules`), `levels.js` (Kapitel 1, 3 Lehrlevels + 5 Familienlevels), `bot.js`,
`play.js` (**neu gegenüber der Dateiliste**: ein laufender Level = Welt + Ziel + Zurückspulen + Zeitstufe + Strahl; die Oberfläche UND der Bot benutzen dieselbe Klasse, so spielt der Bot exakt das, was der Mensch spielt), `state.js` (`createSaveStore` id `protoplanet`, Version 1, `snap`),
`camera.js` (DOM-frei, getestet), `render.js`, `input.js`, `ui.js` + `main.js`, `style.css`, `index.html`, `manifest.webmanifest` (eigene `id`/`start_url`/`scope`), `icons/`. Hub-Eintrag in `games.json` mit `"status": "soon"`.
Werkzeug `tools/sim-protoplanet.mjs`; Tests `tests/protoplanet-physics|gen|camera.test.mjs`, `tests/sim-protoplanet.test.mjs`.

**Bot-Messung** (`node tools/sim-protoplanet.mjs --seeds 40`, Seeds 1000–1039, Spielzeit in s, Ausstoß = Anteil der Startmasse 1; „Median“ über die gelösten Läufe):

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
