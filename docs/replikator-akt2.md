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
- **Kosten:** Sternsysteme (der *aktuelle* Bestand). Hinweis: Das senkt den Sternsystem-Bonus **nicht**, denn `globalParts` liest `systems.run`, `spend` verringert nur `amount`.
  Die Abwägung läuft gegen Expansions-Upgrades (am Ende von v1 alle gekauft) und gegen den Singularitäts-Takt: Eine Singularität setzt den Bestand zurück, deshalb wartet die Auto-Singularität, solange der nächste Sektor nahe ist (`holdSingularity`).
  Preis `10^(anker + mapCostOffset + mapCostStep * n)` mit `anker = mapAnchorSlope * log10(Sternsysteme-Bestwert)` beim Akt-II-Start (im Spielstand), siehe `tune.js` und `docs/LESSONS.md`. Erschlossene Sektoren überleben Ebene 1–3, nur der Galaxiensprung setzt die Karte zurück.
- **Erschließung (Reisezeit, Drossel):** Ein Anspruch startet eine Erschließung, der Preis wird sofort bezahlt, der Sektor zählt (Bonus, Story, Echo-Besetzung) erst bei der Ankunft. Immer nur eine zugleich,
  Dauer `mapTripBase * mapTripGrow^n` s (4 min für den ersten, ~30 min für den zehnten), läuft auch offline. Die Auto-Erkundung startet die nächste, sobald die laufende angekommen ist.
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

## Paket 3 – Mutationen (umgesetzt, `games/replikator/mutations.js`, `genome-view.js`)

**Entscheidung des Besitzers (ersetzt die erste Fassung „pro Replikation“):** Angebote laden nach **Spielzeit** (online und offline gleich), nicht pro Replikation.
Grund: Laden pro Replikation belohnt Mikro-Replikationen (der echte Spielstand hat eine schnellste Replikation von 1 s), das verbietet `docs/LESSONS.md`.

- **Freischaltung:** 3 erschlossene Sektoren, das erste Angebot ist sofort da. Danach ein Angebot alle `mutEvery` = 25 min Spielzeit (`* mutGrow` = 1,03 je gezogenem Angebot),
  höchstens `mutQueueMax` = 3 wartend; ist die Warteschlange voll, hält die Ladung an (nichts geht verloren, nichts wird bestraft).
- **Angebot:** 3 Karten aus dem Seed-RNG (`rep2.mut.rng`, abgeleitet vom Karten-Seed), nie eine Mutation, die schon im Genom ist, keine Doppelten. Seltenheit je Karte 70 / 25 / 5 (gewöhnlich / selten / Glücksfehler).
  Das Angebot wird gezogen, wenn es an die Spitze der Warteschlange rückt, und bleibt dann fest. Nehmen oder Verwerfen.
- **Genom:** 3 Plätze, +1 bei 6 und bei 10 Sektoren (`genomeSlotAt`), Galaxien-Archiv später (`mut.bonusSlots`), höchstens 6. Bei vollem Genom muss man eine Mutation zum Ersetzen wählen (die alte ist weg).
  Mutationen liegen in `state.rep2.mut` und überleben jeden Reset (auch den späteren Galaxiensprung).
- **15 Mutationen**, je Nutzen **und** Haken, Zahlen in `tune.js` (`mutFx`), Texte daraus gebaut. Wirkung nur über die vorhandenen Hooks (`globalParts` mit Namen, Layer-`mult`, `genCostDiv`, `bundleMult`, `tierMult`,
  `autoInterval`, Sektorpreis, Reisezeit, Nachbar-Schritt). Liste siehe unten bzw. `MUTATIONS` in `mutations.js`. **Sonnenhunger** (Befehle) und **Echo-Resonanz** kommen erst mit Paket 4 / 6.
- **Offline-Flag:** `game.offlineNow` (Engine, gesetzt von `runtime.simulateOffline` und vom Offline-Szenario der Sim) – nötig für Nachtschwärmer.
- **Auto-Genom** (`auto_genom`, Art `misc`, startet aus, ab 10 Sektoren oder der 5. gewählten Mutation; Schalter im Genom-Tab und in der Automatisierung): `mutChoose(g)` (def.js) bewertet jede Karte (und bei vollem Genom jede Ersetzung)
  mit `mutObjective` = `repObjective` + `mutExtra` (Angebotsrate, Reisezeit, Sektorpreis, Offline-Anteil von Nachtschwärmer; Geduldig mit vollem Faktor), nimmt den besten Zuwachs
  (>= `mutMinGain` bei freiem Platz, >= `mutSwapGain` beim Ersetzen) oder verwirft. Die Sim ruft dieselbe Funktion (`mutAutoGenom`).
- **Laufdauer:** gemessen für alle 15 einzeln mit `tools/runlength-replikator.mjs` (Optimum nie unter 10 min, 30-s-/60-s-Läufe bei 0 %); abgesichert in `tests/sim-replikator-mutation-runlength.test.mjs`.
  Geduldig ist so gebaut, dass der Start eines Laufs der schwächste Punkt ist (x0,5 bis voll x3 nach 5 min).
- **Story:** Kapitel `a2m` „Kopierfehler“: Modal beim ersten Angebot (löst „mit allen Fehlern des Originals“ ein), Reaktion auf die erste Wahl, ein WR-0-Bericht je Mutation beim ersten Nehmen (`MUTATIONS[].report`),
  Meilensteine (Genom voll, erster Tausch, Glücksfehler, Platz 4/5, Verwerfen, Auto-Genom) und 8 kurze Beobachtungen 12 min nach je einem Angebot. Keine Lücke > 25 min bis zum 10. Sektor, nie zwei Einträge innerhalb einer Minute.
- UI: Tab „Genom“ (`extraTabs`, Punkt bei wartendem Angebot): Platz-Raster, Angebot mit „Nehmen“, Tausch-Dialog, Warteschlange und Restzeit, Auto-Genom-Schalter.

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

## Kalibrierung mit dem echten Spielstand

Fixture `tests/fixtures/replikator-end-v1.json` (Export vom 2026-10-27, Zustand ohne Erfolge/Protokoll):
- 86,9 h Gesamtzeit, davon **84,7 h offline (97,5 %)**. v1-Ende nach 13,7 h, danach 73 h reines Weiterlaufen ohne neue Ziele.
- Die Läufe werden immer länger (Replikation zuletzt 2,8 h, Expansion 8 h, Singularität 14 h): klassische Wand, wenn nichts mehr kommt.
- Größenordnungen gegenüber dem Sim-Ende von v1 (10,5 h): Sternsysteme gesamt 2,4e8 statt 3,9e5, Quantenkerne 5,4e4 statt 1,1e4, Materie-Bestwert 1e127 statt 1e53.

Folgerungen (verbindlich für Paket 2–5):
- **Kosten und Gewinne von Akt II dürfen nicht linear an v1-Währungen hängen.** Mit festen Sternsystem-Preisen erschließt dieser Spielstand die ganze Karte sofort.
  Kartenkosten deshalb relativ (z. B. Anteil des aktuellen Bestands oder in log-Skala), Saatkern-Gewinn mit kleinem Exponenten auf Quantenkerne.
- Zwei Testfälle für jedes Paket: frischer v1-Abschluss (Sim) **und** diese Fixture. Beide müssen Akt II mit ähnlichem Tempo erleben (Faktor ≤ 2).
- Die Fixture läuft durch `game.load()` + Migration und muss den Akt-II-Einstieg auslösen (Test).

## Technik

- `def.version = 4` (Paket 3), Migrationen `1 → 2`, `2 → 3`, `3 → 4`; ursprünglich `def.version = 2`, Migration `1 → 2` (neue Keys über `mergeDefaults`, alte Story-Flags bleiben).
- Neuer Spielzustand unter `state.rep2` (`rng`, `map`, `genome`, `offers`, `anomaly`, `galaxy`, `archive`, `echo`) via `def.extraState`.
- Replikator bleibt auf `mountStandardApp`; neue Tabs (Karte, Genom) über eine Erweiterung der Optionen (`extraTabs`) – generisch, damit andere Spiele sie nutzen können.
- Sim: `tools/simulate.mjs` bekommt Akt-II-Strategie (Karte, Genom, Befehle, Anomalien, Galaxienwahl) – **über dieselben Auto-Funktionen** aus `def.js`.
- Neue Pacing-Tests `tests/sim-replikator-akt2*.test.mjs`. Bestehende Tests bleiben grün.
- Nach Dateiänderungen `node tools/update-precache.mjs`, vor jedem Push `npm test`.

## Messung der Mutationen (Rebalance, `tools/mutations-replikator.mjs`)

Jede Mutation allein im Genom (keine Angebote), aktive Sim, Start frisch UND echter v1-Spielstand, Seeds 1-3, 3,5 h Akt II. `dt10` = Zeit bis 10 Sektoren, `dBP/dSys/dQK` = Faktor auf den Gewinn
einer Replikation / Expansion / Singularität im selben Spielstand in Dekaden (nach den Softcaps, voller Faktor), `dSumme` = Sternsysteme + Quantenkerne gesamt. Nutzen = Haken neutralisiert, Haken = Nutzen neutralisiert.
Wichtig: Die Karte ist Reisezeit-begrenzt (Summe der Reisen ~133 min von ~136-176), deshalb bewegt nur die **Erschließungsdauer** `dt10` stark; Wirtschaftsfaktoren zeigen sich in den Gewinn-Dekaden
(und zuverlässig nur als ~-5 % bei dt10). Nachtschwärmer (Nutzen nur offline) wurde mit `--offline --hours 30` gemessen: Nutzen dSumme +0,24, Haken -0,05, beide +0,11. Fehlerfreudig/Chimäre: Angebotsrate (Intervall 25 min / 2,5 bzw. x2) rechnerisch,
Chimäre mit 4 besetzten Plätzen. Geduldig: Haken (Start des Laufs) im Referenzstand nicht sichtbar, dort Nutzen = voller Faktor.

### VORHER (Commit 2c93e7f, Faktoren vor dem Softcap)
```
Mutation        beide  dt10    dBP  dSys   dQK  dSumme| Nutzen dt10    dBP  dSys   dQK  dSumme| Haken  dt10    dBP  dSys   dQK  dSumme|
hyperaktiv         -2 %  +0.00 +0.00 +0.00  +0.16       |    -2 %  +0.00 +0.00 +0.00  +0.16       |    +0 %  +0.00 +0.00 +0.00  +0.00       |
gigantismus        -3 %  +0.00 +0.00 +0.00  +0.15       |    -4 %  +0.00 +0.00 +0.00  +0.22       |    +6 %  +0.00 +0.00 +0.00  -0.12       |
sparsam            +5 %  +0.00 +0.00 +0.00  -0.20       |    -4 %  +0.00 +0.00 +0.00  +0.14       |   +14 %  +0.00 +0.00 +0.00  -0.33       |
nostalgisch        +4 %  +0.20 -0.08 +0.00  -0.07       |    -3 %  +0.20 +0.00 +0.00  +0.10       |    +6 %  +0.00 -0.08 +0.00  -0.19       |
schwarmgeist       +9 %  +0.00 +0.00 +0.00  -0.12       |    +2 %  +0.00 +0.00 +0.00  +0.09       |   +11 %  +0.00 +0.00 +0.00  -0.20       |
geduldig           -0 %  +0.04 +0.00 +0.00  +0.12       | Nutzen    +1 %  +0.09 +0.00 +0.00  +0.13       | Haken    +0 %  -0.07 +0.00 +0.00  +0.04       |
fehlerfreudig      +1 %  +0.00 +0.00 +0.00  +0.03       |    +0 %  +0.00 +0.00 +0.00  +0.00       |    +1 %  +0.00 +0.00 +0.00  +0.03       |
gruendlich        +42 %  +0.00 +0.00 +0.12  -0.17       |    +1 %  +0.00 +0.00 +0.12  +0.08       |   +42 %  +0.00 +0.00 +0.00  -0.19       |
nachtschwaermer    -5 %  +0.00 +0.00 +0.00  +0.07       |    +0 %  +0.00 +0.00 +0.00  +0.00       |    -5 %  +0.00 +0.00 +0.00  +0.07       |
mosaik             -3 %  +0.05 +0.08 +0.00  +0.24       |    -4 %  +0.05 +0.08 +0.00  +0.21       |    +0 %  +0.00 +0.00 +0.00  -0.06       |
kolonialist        -6 %  -0.09 +0.24 +0.00  +0.35       |    -6 %  +0.00 +0.24 +0.00  +0.37       |    +1 %  -0.09 +0.00 +0.00  -0.10       |
buendelfieber      -5 %  +0.00 +0.00 +0.00  +0.31       |    -5 %  +0.00 +0.00 +0.00  +0.27       |    -2 %  +0.00 +0.00 +0.00  +0.07       |
glueckstreffer     -3 %  +0.00 +0.00 -0.12  +0.10       |    -4 %  +0.00 +0.00 +0.00  +0.21       |    -5 %  +0.00 +0.00 -0.12  -0.05       |
ueberschuss        -4 %  +0.13 +0.15 +0.12  +0.40       |    -5 %  +0.13 +0.15 +0.12  +0.40       |    -1 %  +0.00 +0.00 +0.00  -0.01       |
chimaere           -1 %  +0.00 +0.00 +0.00  +0.02       |    -1 %  +0.00 +0.00 +0.00  +0.02       |    +0 %  +0.00 +0.00 +0.00  +0.00       |
```

### NACHHER
```
Mutation        beide  dt10    dBP  dSys   dQK  dSumme| Nutzen dt10    dBP  dSys   dQK  dSumme| Haken  dt10    dBP  dSys   dQK  dSumme|
hyperaktiv        -13 %  -0.08 -0.10 -0.10  -0.13       |   -22 %  +0.00 +0.00 +0.00  +0.21       |    +9 %  -0.08 -0.10 -0.10  -0.20       |
gigantismus        +6 %  +0.00 +0.40 +0.00  +0.54       |    -5 %  +0.00 +0.40 +0.00  +0.65       |   +11 %  +0.00 +0.00 +0.00  -0.13       |
sparsam            -5 %  -0.18 +0.00 +0.00  -0.06       |    -6 %  +0.00 +0.00 +0.00  +0.23       |   +11 %  -0.18 +0.00 +0.00  -0.41       |
nostalgisch        -3 %  +0.45 -0.15 +0.00  +0.09       |    -4 %  +0.45 +0.00 +0.00  +0.27       |    +9 %  +0.00 -0.15 +0.00  -0.25       |
schwarmgeist       -5 %  +0.00 +0.20 +0.00  +0.43       |    -5 %  +0.00 +0.20 +0.00  +0.40       |    +9 %  +0.00 +0.00 +0.00  -0.11       |
geduldig           -1 %  +0.50 +0.00 +0.00  +0.16       |    -5 %  +0.50 +0.00 +0.00  +0.20       |    +2 %  +0.00 +0.00 +0.00  -0.05       |
fehlerfreudig      -5 %  +0.00 +0.00 -0.15  -0.02       |    +0 %  +0.00 +0.00 +0.00  +0.00       |    -5 %  +0.00 +0.00 -0.15  -0.02       |
gruendlich        +13 %  +0.00 +0.00 +0.48  +0.05       |    -1 %  +0.00 +0.00 +0.48  +0.20       |    +9 %  +0.00 +0.00 +0.00  -0.12       |
nachtschwaermer    -0 %  -0.06 -0.07 -0.07  -0.18       |    +0 %  +0.00 +0.00 +0.00  +0.00       |    -0 %  -0.06 -0.07 -0.07  -0.18       |
mosaik             +4 %  +0.18 +0.28 +0.00  +0.52       |    -5 %  +0.18 +0.28 +0.00  +0.51       |    +7 %  +0.00 +0.00 +0.00  -0.07       |
kolonialist        +4 %  -0.25 +0.48 +0.00  +0.55       |    -5 %  +0.00 +0.48 +0.00  +0.69       |   +12 %  -0.25 +0.00 +0.00  -0.15       |
buendelfieber     -15 %  +0.00 -0.22 +0.00  +0.08       |   -24 %  +0.00 +0.00 +0.00  +0.37       |   +24 %  +0.00 -0.22 +0.00  -0.34       |
glueckstreffer     +4 %  +0.33 +0.40 +0.40  +0.89       |    -5 %  +0.33 +0.40 +0.40  +0.93       |    +7 %  +0.00 +0.00 +0.00  -0.07       |
ueberschuss        -4 %  +0.33 +0.40 +0.40  +0.91       |    -5 %  +0.33 +0.40 +0.40  +0.91       |   +16 %  +0.00 +0.00 +0.00  -0.25       |
chimaere           -5 %  +0.38 +0.46 +0.46  +1.07       |    -5 %  +0.38 +0.46 +0.46  +1.07       |    +0 %  +0.00 +0.00 +0.00  +0.00       |
```
