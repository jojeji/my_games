# Replikator – Akt II: Design-Spezifikation

Stand: 2026-10-27. Entscheidungen des Besitzers: voller Umfang (Fundament + Galaxiensprung + Karte + Mutationen + Sondenbefehle + Anomalien),
Ton „trocken-humorvoll mit leiser Melancholie“, echter Spielstand folgt als Export.
Alle Zahlen sind **Startwerte** und stehen in `games/replikator/tune.js`. Kalibriert wird per Simulation, nicht per Gefühl (siehe `docs/LESSONS.md`).

## Leitplanken (aus LESSONS.md abgeleitet)

1. **Entscheidungen statt Zahlen.** Der Spieler ist zu ~95 % offline. Neue Systeme erzeugen Entscheidungen, die *warten*
   (Mutationsangebote, Anomalien, Sektorwahl). Nichts verfällt offline, nichts bestraft Abwesenheit.
2. **Laufdauer messen.** Kein neuer Effekt darf Mikro-Läufe (< 1 min) optimal machen. `tools/runlength-replikator.mjs` prüft das, ein Test sichert es ab.
3. **Gleiche Logik in Spiel und Sim.** Jeder Autokäufer bzw. jede Auto-Entscheidung lebt in `def.js`, die Sim ruft dieselbe Funktion auf.
4. **Determinismus.** Zufall nur über einen Seed-RNG im Spielstand (`state.rep2.rng`), damit Sim und Tests reproduzierbar bleiben.
5. **Alter Spielstand startet direkt in Akt II.** Wer v1 beendet hat (`z_horizont` + 8 Challenges), sieht beim nächsten Laden den Einstieg. Migration `version 1 → 2`.
6. **Gestaffelte Einführung.** Beim Einstieg nicht alles auf einmal: Karte → Mutationen → Befehle → Anomalien → Galaxiensprung (siehe „Freischaltreihenfolge“).
7. **Neue Autokäufer starten aus**, Schalter dort, wo sie wirken, einmaliger Hinweis beim Freischalten.
8. Mobile: Tap-Ziele ≥ 44 px, keine Hover-Infos, Prüfung per Playwright bei 390×844 und 360×740.

## Paket 0 – Fundament (Learnings aus Merlin)

- **Upgrade-Autokäufer:** `auto_bpupg`/`auto_exupg` von `upgBuyAll` (günstigstes zuerst) auf `upgBuyBest(group, repObjective)` umstellen.
  `repObjective(g)` = log10 der Materie-Produktion (+ Gewichtung für Prestige-Gewinn-Upgrades wie `logistik`, `kernbau`, damit sie nicht wertlos erscheinen).
  Sim nutzt dieselbe Funktion. Pacing-Tests müssen weiter grün sein (ggf. Zielwerte neu begründen, nicht stillschweigend dehnen).
- **Laufdauer-Tool** `tools/runlength-replikator.mjs` nach Vorbild `runlength-merlin.mjs`: Snapshots in jeder Phase (früh/mittel/spät für Replikation,
  Expansion, Singularität), Gewinn pro Sekunde je fester Laufdauer. Ziel: Optimum der Replikation 2–5 min, Expansion ≥ 10 min.
  Hypothese (ungeprüft): Der Softcap pro Lauf (`repSoftcap`) drückt Richtung kurzer Läufe. Wenn ja: Reife-Faktor wie bei Merlin (`layer.postMult`).
  Test `tests/sim-replikator-runlength.test.mjs`.
- **Offline-Szenario** in `tools/simulate.mjs`: `--offline` (Spieler kommt alle 8 h für 2 min, dazwischen Offline-Catch-up wie im echten Spiel).
  Nur messen und ausgeben, kein harter Test in Paket 0.
- **Autokäufer-Hinweise:** beim Freischalten eines Autos einmalig ein Toast mit dem Ort des Schalters (falls die Engine das nicht schon kann: generisch in `standard-app.js`).
- **Kurz-Export** („nur Zustand“, ohne Spieltest-Protokoll) in den Einstellungen, generisch in der Engine.
- **Seed-RNG** `engine/kit/rng.js` (mulberry32 o. ä., Zustand als Zahl im Spielstand, `rngNext(state)`), mit Test.

## Paket 1 – Chronik statt Einzeiler

- `def.chronicle = true`, Story im neuen Format `{id, chapter, lines:[{who,t}], modal?, cond}`. **IDs der 8 alten Einträge bleiben** (Lese-Flags im Spielstand).
- `games/replikator/characters.js` (einzige Stelle für Namen), `games/replikator/STIMMEN.md` (Stimmen-Bibel, vor dem Schreiben).
- Besetzung:
  - **Die Sonde** (Spieler-Ich, Kennung *R-1*): trocken, präzise, leicht selbstverliebt in Effizienz. Kurze Logbuchsätze.
  - **Wartungsroutine** (*WR-0*): schreibt Fehlerberichte über die Sonde, sehr knapp, unbeabsichtigt komisch („Abweichung toleriert.“).
  - **Missionsleitung** (Funksprüche der Erbauer, ab Akt II): Nachrichten mit Lichtlaufzeit, Zeitstempel immer älter. Warm, dann brüchig, am Ende eine automatische Bake.
  - **Das Echo** (ab Akt II): eine zweite *R-1*. Klingt wie die Sonde, nur einen Hauch älter und müder.
- Avatare ohne Fotos: schlichte SVG-Embleme pro Figur (Farbe + Symbol), über die vorhandene `avatar.js`-Fallback-Logik.
- Story-Blasen (`storyBubbles`) aktivieren. Ziel: keine Story-Lücke > ~20 min (Sim-Transkript prüfen).
- **Bobiverse-Abstand:** keine Namen/Begriffe aus der Buchreihe (Bob, GUPPI, Others/„Die Anderen“, Deltaner, Replikanten-Namenswitze).
- Setup, das Akt II einlöst: der vorhandene Satz „mit allen Fehlern des Originals“ bleibt sinngemäß erhalten.

## Akt II – Überblick

Einstieg = Ende v1. Die Sonde empfängt ein schwaches Signal aus der eigenen Galaxie, *mit der eigenen Kennung*. Die Galaxie ist nicht nur Zahl, sondern Karte.

### Freischaltreihenfolge
| Schritt | Bedingung | Neu |
|---|---|---|
| 1 | v1 beendet (`z_horizont` + 8 Challenges) | Tab **Karte** (Galaxie 1), Funkspruch #1 |
| 2 | 3 Sektoren erschlossen | **Mutationen** (erstes Angebot sofort) |
| 3 | erster Pulsar-Sektor ODER 6 Sektoren | **Sondenbefehle** |
| 4 | erster Anomalie-Sektor erschlossen | **Anomalien** |
| 5 | Echo-Sektor aufgedeckt + 10 Sektoren | **Galaxiensprung** (Ebene 4) |

## Paket 2 – Galaxiekarte

- Hex-Karte mit Radius 2 (19 Felder), Zentrum = Heimat (bereits erschlossen). Layout + Sektortypen pro Galaxie aus dem Seed-RNG.
- **Nebel des Unbekannten:** Typ eines Felds ist erst sichtbar, wenn ein Nachbar erschlossen ist. Erschließen nur neben eigenem Gebiet.
- **Kosten:** Sternsysteme (der *aktuelle* Bestand, das senkt den Sternsystem-Bonus bis zur nächsten Expansion – bewusste Abwägung).
  Kosten wachsen pro erschlossenem Sektor (`mapCostBase * mapCostGrow^n`). Erschlossene Sektoren überleben Ebene 1–3, nur der Galaxiensprung setzt die Karte zurück.
- **Sektortypen** (Effekte global oder gezielt, Nachbarn gleichen Typs verstärken: +50 % Effekt-Exponent pro Nachbar, max. 3):
  - Sternhaufen: Sternsystem-Gewinn ×
  - Nebel: Blaupausen-Gewinn ×
  - Pulsar: Produktion ×, Befehle laden schneller
  - Schwarzes Loch: Quantenkern-Gewinn ×
  - Ruine: einmalig Funkspruch-Fragment + kleiner Dauerbonus
  - Anomalie: erzeugt eine Anomalie (siehe Paket 4)
  - Echo: von der zweiten R-1 besetzt, nicht erschließbar (Story)
- **Echo-Besetzung:** Das Echo besetzt pro 2 eigenen Sektoren einen freien Randsektor (nie zeitbasiert, damit Offline nicht bestraft wird).
- **Auto-Erkundung** (später freigeschaltet, startet aus): erschließt den Sektor mit dem besten Nutzen/Kosten, dieselbe Funktion nutzt die Sim.
- UI: eigener Tab mit SVG-Hexraster, Antippen öffnet eine Sektorkarte (Typ, Effekt, Kosten, Nachbarboni, Button). Gesamtboni als Liste darunter.

## Paket 3 – Mutationen

- Jede Replikation lädt den **Kopierfehler-Zähler**. Bei `mutEvery` Replikationen (wächst langsam) entsteht ein **Angebot**: 3 Karten, eine wählen oder verwerfen.
  Offline werden bis zu 3 Angebote gesammelt (Warteschlange), danach lädt der Zähler nicht weiter. Nichts verfällt.
- **Genom:** 3 Plätze, +1 durch Meilensteine/Galaxien-Archiv (max 6). Eine Mutation ersetzen = alte geht verloren. Mutationen überleben alle Resets inkl. Galaxiensprung.
- Seltenheit: gewöhnlich / selten / „Glücksfehler“ (legendär). Jede Mutation hat **Nutzen und Haken**. Startliste (~15), Beispiele:
  - Hyperaktiv: Produktion ×3, Autokauf-Intervall ×2
  - Gigantismus: Sternschmiede ×10, Bohrdrohne und Schmelzer ×0,5
  - Sparsam: Generatorkosten ÷100, Bündelbonus −0,1
  - Nostalgisch: Blaupausen-Gewinn ×3, Sternsystem-Gewinn ×0,7
  - Schwarmgeist: Produktion +8 % pro erschlossenem Sektor, Sektorkosten ×1,5
  - Fehlerfreudig: Angebote doppelt so oft, Produktion ×0,8
  - Nachtschwärmer: Offline-Produktion ×1,5, Online ×0,9
  - Sonnenhunger: Befehle laden doppelt so schnell, Produktion ×0,7
  - Geduldig: Replikations-Gewinn bis ×3 mit Laufzeit (voll ab 5 min) – **nie** ein Effekt, der kurze Läufe belohnt
  - Echo-Resonanz (nur nach der Echo-Begegnung, selten): …
- **Auto-Genom** (spät, startet aus): nimmt das Angebot mit dem größten Zuwachs der Zielfunktion, sonst verwerfen.

## Paket 4 – Sondenbefehle und Anomalien

- **Sondenbefehle** über `def.spells` (Engine aus Merlin), Leiste im Generator-Tab:
  - Übertakten: Produktion ×10 für 30 s, Abklingzeit 5 min
  - Sonnenwind-Ernte: sofort Materie = 10 min Produktion, Abklingzeit 15 min
  - Tiefenscan: deckt ein Feld der Karte auf, Abklingzeit 30 min
  - Auto-Befehl per Meilenstein (startet aus). Offline wirken nur Auto-Befehle, wie bei Merlin.
- **Anomalien:** Ereigniskarten, die *warten*, bis du sie startest (max. 1 offen, Quelle: Anomalie-Sektoren + alle ~60–90 min Spielzeit per Seed-RNG).
  Kurze Regeländerung (3–10 min) mit Belohnung, Beispiele:
  - Gezeitenwelle: Generatorkosten ÷1e6 für 3 min
  - Zeitriss: sofort 10 min Produktion aller Ebenen
  - Kosmischer Strahl: sofortiges Mutationsangebot mit garantierter Seltenheit „selten“
  - Spiegelangebot (Echo): 50 % der Sternsysteme gegen eine Glücksfehler-Mutation
  - Signalfragment: Funkspruch + kleiner Dauerbonus
  - Umkehrfeld: Stufe 8 produziert Materie direkt, Stufe 1 nichts (5 min), Belohnung Quantenkerne

## Paket 5 – Ebene 4: Galaxiensprung

- Layer 4 `jump`, Name **Galaxiensprung**, Verb **Springen**, Währung **Saatkerne**, Basis `cores` (Quantenkerne im Lauf).
  Setzt Ebene 0–3 inkl. Forschung und Karte zurück (Mutationen bleiben). Gewinn `floor(mult * (cores/threshold)^exp)`, **kein Softcap pro Lauf**.
- **Galaxienwahl:** Nach dem Sprung werden 2 Galaxien zur Auswahl angeboten (Seed-RNG). Typen mit eigenen Regeln (über `g.rule()` bzw. Hooks):
  - Spirale (Standard, erste Galaxie)
  - Zwerggalaxie: nur 6 Stufen, Prestige-Schwellen ÷100, Sternsystem-Gewinn ×0,5 – schnell
  - Elliptisch: Kostenwachstum ×1,5, Sternsystem-Gewinn ×3
  - Kollisionszone: Produktion schwankt im 10-min-Takt (×0,5 … ×4, deterministisch über Spielzeit)
  - Leerraum: kein Sternsystem-Bonus, Mutationsangebote ×2
  - Quasar: Produktion ×1000, Generator-Autokäufer erst ab 3 Expansionen
- **Galaxien-Archiv:** erster Abschluss jedes Typs (Bedingung pro Galaxie, z. B. 12 Sektoren) gibt einen Dauerbonus und +1 Genom-Platz bei bestimmten Typen.
- **Saatkern-Upgrades** (neue Gruppe, Layer 4): Startbonus (Forschung behalten, Challenges behalten, Start-Quantenkerne), Kartenradius 3 ab Galaxie 4, Befehls-Stärke, Anomalie-Häufigkeit.
- Beschleunigung: Jeder Sprung muss den nächsten Durchlauf spürbar verkürzen (Ziel: Galaxie 2 ≤ 40 % der v1-Zeit, danach weiter fallend).

## Paket 6 – Echo, Funksprüche, Enden, Gesamtbalancing

- Story Akt II: Funkspruch-Reihe der Missionsleitung (Zeitstempel immer älter, letzte Nachricht eine automatische Bake), Begegnung mit dem Echo,
  Auflösung des „Originals“: **beide** halten sich für R-1. Keine vorzeitige Auflösung.
- **Ende Akt II** (nach dem Abschluss von 6 Galaxientypen): Wahl **Verschmelzen** (Echo-Sektoren werden deine, Dauerbonus A) oder **Abgrenzen** (Echo zieht weiter, Dauerbonus B).
  Beide Enden mit eigenem Erfolg, das andere ist im nächsten Durchgang wählbar.
- Gesamt-Pacing (aktiv), Startwerte für Tests: erster Galaxiensprung 2–4 h nach Akt-II-Beginn, Ende Akt II nach weiteren 12–18 h aktiv, Idle ≤ 2× aktiv,
  Offline-Szenario gemessen und dokumentiert. Laufdauer-Test für alle Ebenen.
- `docs/LESSONS.md` um die Erkenntnisse ergänzen.

## Technik

- `def.version = 2`, Migration `1 → 2` (neue Keys über `mergeDefaults`, alte Story-Flags bleiben).
- Neuer Spielzustand unter `state.rep2` (`rng`, `map`, `genome`, `offers`, `anomaly`, `galaxy`, `archive`, `echo`) via `def.extraState`.
- Replikator bleibt auf `mountStandardApp`; neue Tabs (Karte, Genom) über eine Erweiterung der Optionen (`extraTabs`) – generisch, damit andere Spiele sie nutzen können.
- Sim: `tools/simulate.mjs` bekommt Akt-II-Strategie (Karte, Genom, Befehle, Anomalien, Galaxienwahl) – **über dieselben Auto-Funktionen** aus `def.js`.
- Neue Pacing-Tests `tests/sim-replikator-akt2*.test.mjs`. Bestehende Tests bleiben grün.
- Nach Dateiänderungen `node tools/update-precache.mjs`, vor jedem Push `npm test`.
