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

## Paket 4 – Sondenbefehle und Anomalien (umgesetzt: `commands.js`, `anomalies.js`, `commands-view.js`)

**Vorab: Kartenboni nach dem Softcap.** Die Gewinn-Boni der Sektoren (`gainMult`) wirkten im Layer-`mult` vor dem Softcap und wurden zur Wurzel (dasselbe Problem wie bei den Mutationen). Jetzt in `layer.postMult`
(`def.js postGain` = Mutationen x Karte x Befehle x Signalfragmente), mit derselben Reifung (`ripen()` in `mutations.js`: Sternsysteme 5 min, Quantenkerne 30 min Laufzeit, Blaupausen ohne Reifung). `repObjective` wertet nach dem Softcap voll (`g.mutRef`).
Wirkung: Sternsysteme gesamt in 4 h aus der Datei ~ +1 Dekade, Quantenkerne +0,3; die Zeit bis 10 Sektoren ändert sich kaum (Reisezeit bleibt die Drossel). Kurze Expansions-Läufe werden dadurch **weniger** attraktiv (2-min-Lauf 85 % -> 33 % des Optimums, Test).

### Sondenbefehle (`def.spells`, Engine `spells.js`)
- **Freischaltung:** erster Pulsar-Sektor ODER 6 Sektoren (bleibt, `rep2.cmd.on`). Leiste (3 Knöpfe) im **Galaxie-Tab** direkt über der Karte, darunter Karten mit Details, Auto-Schalter und „Wirken“ (`spellBar`/`spellCards`); laufende Befehle zusätzlich als Statuszeile unter der Kopfzeile auf jedem Tab (`options.banner`). Toast beim manuellen Wirken.
- **Übertakten** (45 s, Abklingzeit 5 min): Erschließung x3 (zeitgewichtet über `hooks.tripSpeed`, auch bei den großen Offline-Schritten) und Gewinne x1,5 nach dem Softcap (mit Reifung).
- **Sonnenwind-Ernte** (sofort, 15 min): Sternsysteme = 2 x die der nächsten Expansion (zählen als verdient, also auch für die Singularität). Anteil 1 hob die Sternsysteme, aber kaum die Quantenkerne (Singularitäts-Formel + Softcap fressen es); bei 2 ist der Quantenkern-Effekt so groß wie bei Übertakten.
- **Tiefenscan** (sofort, 30 min): deckt die 5 Felder im Nebel auf, die dem Gebiet am nächsten sind (`seen`), und kürzt die laufende Erschließung um 30 % ihrer Dauer (höchstens bis 0).
- **Pulsar-Aufladung:** Abklingzeit = Basis / (1 + 0,12 x Pulsar-Exponent) / Sonnenhunger. Der Exponent zählt jeden Pulsar-Sektor mit seinem Nachbarbonus (3 Pulsare in einer Reihe ~ x1,7). Die Bonusliste im Galaxie-Tab zeigt es.
- **Sonnenhunger** (Mutation, selten, Nr. 16): Befehle laden x2 so schnell, Haken Blaupausen-Gewinn x0,5. Eigener WR-0-Bericht, Auto-Genom-Bewertung über `mutCmdW`.
- **Auto-Befehl** (`auto_befehl`, `misc`, startet aus, ab 9 Sektoren): `g.spellAutoRun()`. Neu in der Engine: optional `spell.autoWhen(g)` hält einen Auto-Cast zurück, der verpuffen würde (Übertakten/Tiefenscan nur bei laufender Erschließung mit genug Rest, Sonnenwind nur bei Expansions-Gewinn); manuelles Wirken ist nie blockiert.
  Offline wirken nur Auto-Casts. **Engine-Fix:** `Game.tick` zählt die Zauber jetzt VOR den Autos herunter; vorher verlor ein Auto-Cast im selben Tick `dt` Sekunden, bei Offline-Schritten von 19-115 s also die ganze Wirkung (Merlin-Tests unverändert grün).
  Die Sim wirkt über dieselbe Funktion (`player()` ruft `g.spellAutoRun()`, die Schalter pro Befehl gelten).

### Anomalien (`anomalies.js`, Zustand `rep2.ano`)
- **Quellen:** jeder Anomalie-Sektor bei der Ankunft (auch mehrere: `owed`, einer nach dem anderen) und alle 60-90 min Spielzeit (`anoEvery` 3600 + RNG x `anoSpread` 1800, Seed im Spielstand, abgeleitet vom Karten-Seed). Die Zeit lädt nur, solange nichts wartet oder läuft. **Freischaltung:** der erste Anomalie-Sektor.
- **Warten:** höchstens eine offene, nichts verfällt, nichts startet von selbst, auch offline nicht. **Auswahl:** gemischter Beutel, jeder Typ einmal pro Runde, nie zweimal hintereinander; Runde 1 beginnt fest mit Gezeitenwelle, Signalfragment, Zeitriss. Nicht zulässige Typen (Spiegel vor der Echo-Sichtung, Strahl ohne Genom, Umkehr ohne Singularität, Signal nach 4 Fragmenten) bleiben im Beutel.
- **Auto-Erkundung bewertet Anomalie-Sektoren** (`mapObjective`, `anoSectorW` 0,45 Dekaden), sonst wären sie die letzten der Karte (Produktion x1,1 ist wertlos) und die Anomalien kämen erst nach dem 10. Sektor.
- **Typen:**
  - **Gezeitenwelle** (5 min): Erschließung x3 (stapelt mit Übertakten: x9). Die Wirkung ist die Belohnung.
  - **Zeitriss** (sofort): 10 Minuten Spielzeit vergehen auf einen Schlag (`advance`, online: Nachtschwärmer bleibt aus), alles läuft mit (Reise, Angebote, Abklingzeiten, Automaten).
  - **Kosmischer Strahl** (sofort): zusätzliches Mutationsangebot, mindestens eine Karte „selten“ (`mutAddOffer`, kommt wie jedes andere in die Warteschlange; die Garantie hängt an der Nummer des Angebots).
  - **Spiegelangebot** (nur nach Echo-Sichtung): kostet 50 % der Sternsysteme, bringt ein Angebot mit mindestens einem Glücksfehler.
  - **Signalfragment** (sofort, 4 Varianten): Chronik-Eintrag + dauerhaft alle Gewinne x1,08 (nach dem Softcap, mit Reifung). Danach nicht mehr im Beutel.
  - **Umkehrfeld** (5 min): Stufen 1-4 produzieren nichts (`tierMult` x0), 5-8 bauen weiter an den unteren Stufen. Belohnung am Ende: 100 % der nächsten Singularität als Quantenkerne.
  Nur Spiegel und Umkehr haben einen Preis (steht auf der Karte), bei den anderen ist die Entscheidung der **Zeitpunkt** (Gezeitenwelle und Zeitriss lohnen bei langer Erschließung).
- **Entscheidung der Sim / einer späteren Auto:** `chooseAnomaly` (def.js) = `anoChoose`: Gezeitenwelle bei laufender Erschließung mit >= 6 min Rest, Zeitriss bei >= 8 min Rest, Strahl und Signal sofort, Spiegel wenn die Hälfte nichts Nötiges kostet (oder die Singularität gleich alles löscht), Umkehr direkt nach einer Replikation; nach `anoPatience` (30 min) wird jede startbare genommen. Keine Auto für Anomalien (sie sind die aktive Entscheidung).
- **UI:** Karte oben im Galaxie-Tab (wartend: Beschreibung, Wirkung, Preis, Starten; laufend: Wirkung, Restzeit, Balken), Punkt am Tab, Statuszeile unter der Kopfzeile, Toast bei neuer Anomalie und beim Ende.
- **Story** (Kapitel `a2c`): `cmd_unlock`, `cmd_first`, `ano_first` (Modal), je Typ ein kurzer Eintrag beim ersten Start, vier Signalfragmente (`sig_0..3`, von der Wartung abgelegt, Alter 41 / 63 / 118 / 200 Jahre, ohne Absender; siehe STIMMEN.md). Größte Lücke bis zum 10. Sektor 15 min, nie zwei Einträge innerhalb einer Minute (beide Starts, 4 Seeds).
- **Spielstand:** `def.version = 5`, Migration 4 -> 5 (`migrateToAno`: Seed aus dem Karten-Seed; `rep2.cmd`, `rep2.ano`, `state.spells` kommen über `mergeDefaults`). Die Fixture lädt sauber, startet Akt II und hat nichts offen.

### Pacing mit Befehlen und Anomalien
Entscheidung: die Pacing-Tests laufen **mit allem** (Befehle, Anomalien, Mutationen), Ziel ~2 h bis 10 Sektoren (1,5-3 h). Dafür `mapTripBase` 240 -> 360 s (Wachstum 1,25 unverändert).
Zeit bis 10 Sektoren (aktive Sim, Minuten seit Akt-II-Beginn, Seeds 1 / 2 / 3 / 7 / 9): mit allem frisch 119 / 112 / 149 / 130 / 133, Datei 110 / 117 / 143 / 150 / 124 (Verhältnis 0,87-1,08); erster Sektor nach 9 (frisch) bzw. 6 min (Datei).
Nur die Karte (Info, `runSim({ commands:false, anomalies:false })`): frisch 176 / 165 / 212 / 207 / 195, Datei 173 / 169 / 209 / 210 / 207.
Mit den Beschleunigern ist die Reisezeit nicht mehr die einzige Drossel: ab Sektor 8 begrenzen die Sektorpreise (Sternsysteme), daher bewegen dort Sonnenwind-Ernte und Spiegelangebot etwas.

### Laufdauer in Akt II (Folgearbeit nach Paket 4)
Gemessen mit `takeAct2Snapshots` / `measureLayer` (`tools/runlength-replikator.mjs`): Quantenkerne/s je fester Singularitäts-Laufdauer, Snapshots Datei und frisch bei 0 / 5 / 10 Sektoren, Warten auf Sektoren (`holdSingularity`) aus und an.
VORHER (Prozent des Besten): 2-min-Läufe waren in fast allen Phasen das Optimum (Datei 0/5/10: 100 / 100 / 100 %, 10-min-Läufe nur 33-57 %; frisch 0: 2 min = 100 %). Ursache: der Softcap pro Lauf (`singSoftcap`) kappt lange Läufe, viele kurze schlagen einen langen.
Fix wie bei Merlin: **Reife-Faktor auf den Quantenkern-Gewinn nach dem Softcap** (`def.js singRipeness`, `tune.js singRipe`): min(1, Laufzeit / 900 s)^2 (Untergrenze 0,02), nur in Akt II (Version 1 war gesund, Pacing und Story hängen daran), die Bewertung sieht den vollen Wert.
NACHHER: Optimum 20-30 min (Datei) bzw. 30 min (frisch), 2-min-Läufe 1-12 % (Warten aus; Datei mit Warten an 24-40 %, dort hält die Karte feste kurze Läufe zurück), 10-min-Läufe 12-80 %. Expansion in Akt II war schon gesund (Optimum 20-40 min, 2 min 5-14 %).
Die in-game Auto-Singularität (Modus „Faktor 0,25“ aus dem Spielstand) läuft damit in 16-61-min-Läufen; eine einmalige Anpassung per `onLoad` war nicht nötig.
Tests: `tests/sim-replikator-runlength-akt2.test.mjs`.

### Offline-Spieler in Akt II (Folgearbeit nach Paket 4)
Szenario `node tools/simulate.mjs --offline --fixture tests/fixtures/replikator-end-v1.json --hours 400` (alle 8 h für 2 min, dazwischen echter Offline-Catch-up; der Spieler schaltet neue Autos nach dem Hinweis ein).
VORHER (Auto-Erkundung ab 6 Sektoren): 1 Sektor pro Besuch, Sektor 3 nach 16 h, 6 nach 40 h, 10 nach 72 h. NACHHER (`mapAutoAt` 2, Auto startet weiter aus, Hinweis-Toast beim Freischalten): 3 Sektoren nach 16 h (Besuch 3, der Spieler schaltet die Auto bei Besuch 3 ein), 6 nach 17 h, 10 nach 19 h.
Gewählt, weil es die einfachste Lösung ist: keine neue Mechanik (eine Route aus mehreren Erschließungen müsste die Preise im Voraus bezahlen), nur ein früherer Freischaltpunkt; die ersten zwei Sektoren bleiben Handarbeit. Tests: `tests/sim-replikator-offline-akt2.test.mjs`.

## Paket 5 – Ebene 4: Galaxiensprung (umgesetzt: `galaxy.js`, `jump.js`, `jump-view.js`)

**Ablauf.** Offen, wenn die Galaxie *abgeschlossen* ist: 10 erschlossene Sektoren und die Silhouette am Rand gesehen (`jumpReady`). Das schließt zugleich den Galaxie-**Typ** im Archiv ab (einmal pro Typ, `galaxyCheck`).
Der Sprung ist das Engine-Prestige von Layer 4 (`def.layers[jump]`, Währung **Saatkerne**, Basis `cores.run`, Gewinn `floor((Quantenkerne dieser Galaxie / 4)^0,25)`, kein Softcap pro Lauf: der Sprung braucht eine fertige Galaxie, Mikro-Läufe sind unmöglich).
Danach (`afterReset -> galJump`): Karte weg, zwei Galaxien zur Wahl (`gal.choice` im Spielstand, Dialog ohne Schließen-Knopf, kommt nach dem Neuladen wieder), nach der Wahl neue Karte mit neuem Seed, fester Preisanker `galAnchor`, das Echo sitzt wieder am Rand.
Auto-Sprung und Sim wählen mit `galPick` (nicht abgeschlossener Typ zuerst, dann feste Reihenfolge).

**Was überlebt** (Entscheidung): Genom/Mutationen, Akt II, Chronik, Befehle, Archiv, Saatkerne + Upgrades, Challenge-Abschlüsse (und ihre Belohnungen), Meilensteine, Erfolge, Ebenen-Zähler, Lebensdauer-Summen (`cores.total` = Quantenkern-Bonus bleibt).
**Was verschwindet:** Materie, Blaupausen, Sternsysteme, Quantenkerne, Generatoren, alle Blaupausen-/Expansions-Upgrades und die Forschung, Karte und Anomalie-Sektoren (laufende Anomalie endet, eine wartende bleibt). Die Meilenstein-„Behalten“-Regeln (`keepEx1/keepAll/keepEx`) gelten nur für Ebene 2/3; der Sprung behält nur, was ein Saatkern-Upgrade kauft.
Freigeschaltete Autos (Erkundung/Befehl/Genom) bleiben an den Sektor-Rekord (`gal.best`, `bestClaimed`) gebunden, ebenso die Genom-Plätze aus 6/10 Sektoren.

**Galaxientypen** (Regeln in `tune.js galFx`, Archiv-Bonus in `galArchive`; Texte werden daraus gebaut):
| Typ | Regel | Archiv-Bonus (dauerhaft) |
|---|---|---|
| Spirale (Galaxie 1) | keine | Erschließung ×0,92 |
| Zwerggalaxie | 6 Stufen, Schwellen ÷100, Sternsystem-Gewinn ×0,5, Erschließung ×0,5 | Generatorkosten ÷10 |
| Elliptisch | Kostenwachstum ×1,5, Sternsystem-Gewinn ×3 (nach dem Softcap, reift) | Sternsystem-Gewinn ×1,5 |
| Kollisionszone | Produktion 10-min-Takt ×0,5…×4 (`collisionFactor`, Mittel über den Tick: `game.tickDt`, offline exakt) | +1 Genom-Platz, Befehle ×1,25 |
| Leerraum | kein Sternsystem-Produktionsbonus, Angebote ×2 | +1 Genom-Platz, Angebote ×1,25 |
| Quasar | Produktion ×1000, Generator-Autos erst nach 3 Expansionen **oder 20 min** | Produktion ×10, Quantenkern-Gewinn ×1,5 |
Galaxien ab der 2. brauchen ×1,6 Reisezeit (`galTripBase`, „weiter weg“); Archiv und Upgrades holen es zurück. Das Angebot (zwei Typen, nie der verlassene, neue zuerst) zieht der Seed `gal.rng`.
Abweichung vom Entwurf: Quasar-Autos haben einen Zeit-Rückfall (20 min), sonst blieb der Offline-Spieler dort 4-15 h hängen (gemessen). Kartenradius 3 ab Galaxie 4: **nicht gebaut** (kein Nutzen für die 10-Sektoren-Bedingung, Zellen wären bei 360 px nur ~46 px breit).

**Saatkern-Upgrades** (Gruppe `seed`, Tab Ebenen > Sprung, kein „Alles kaufen“, bewusst **kein Autokäufer**: es sind die Entscheidungen des Sprungs; die Sim kauft nach `SEED_PLAN`):
Bauplan-Archiv 2 (BP-Upgrades bleiben), Sternenarchiv 5 (Expansions-Upgrades, braucht Bauplan), Forschungsspeicher 9 (Forschung, braucht Bauplan), Kernsaat 2/4/8 (Start 20/200/2000 QK, sofort und je Galaxie, als Geschenk), Sternensaat 2/4/9 (1e4/1e5/1e6 Sternsysteme),
Antriebsarchiv 3/5/9/15 (Erschließung ×0,88 je Stufe), Befehlsspeicher 3/6/11 (×1,3 Nachladen), Anomalie-Sog 3/6/11 (×1,4 Häufigkeit), Fruchtbare Saat 4/8/14/25 (Gewinne ×1,25, nach dem Softcap, reift).
**Auto-Sprung** (`auto_jump`, Prestige-Auto, startet aus, nach 3 abgeschlossenen Typen): springt und wählt über dieselbe Funktion wie die Sim (`jumpPlay`).

**Story** (Kapitel `a2j`): `jump_open` (Spirale fertig), `jump_first` (Modal nach der Wahl: Aufbruch, die Silhouette als Letztes, WR-0 bucht), 6 Ankünfte `gal_<typ>`, `gal_echo2` (die Silhouette steht wieder da: „Sie hat nicht auf mich gewartet. Sie war schon da.“), 5 Archiv-Zeilen `arch_<typ>` (Bonus aus `tune.js`),
10 Beobachtungen `jfill1..10` (je 16 min nach dem letzten Akt-II-Eintrag). Echo und Missionsleitung werden nicht benannt („die Silhouette“); keine Auflösung (Paket 6).

**UI.** Segment „Sprung“ im Ebenen-Tab (Karte mit Galaxie, Fortschritt x/10, Archiv-Bonus des Typs, Saatkerne; Prestige-Panel; Upgrades), Chip SK im Kopf, Galaxie-Tab: Galaxie-Karte (Typ, Regeln) + Teaser „Galaxiensprung x von 10“ + Archiv-Liste (6 Typen). Auswahl-Dialog mit zwei Karten (Regeln, Archiv-Bonus, neu/abgeschlossen), geprüft bei 360×740 und 390×844 (scrollt, kein Überlauf).
Engine: `game.tickDt`, `upgrade.onBuy`, `upgradeList(buyAllLabel:null)` / Layer-Option `intro`, Icon `jump`.

**Spielstand:** `def.version = 6`, Migration 5 -> 6 (`migrateToJump`: Seed des Angebots aus dem Karten-Seed, Sektor-Rekord aus der Karte). Die Fixture lädt sauber (Galaxie 1, Spirale, nichts offen) und bekommt den Spirale-Abschluss beim ersten Tick.

### Messung (aktive Sim, Seed 7, dt 2; Stunden)
Zeit bis zum 10. Sektor je Galaxie (Reihenfolge der Sim: neue Typen zuerst, `GAL_PICK`), Saatkerne je Sprung:
| | G1 Spirale | G2 | G3 | G4 | G5 | G6 | Akt II Ende (6 Typen) |
|---|---|---|---|---|---|---|---|
| frisch (aktiv) | 2,17 | 3,09 Ellipt. | 1,16 Zwerg | 1,83 Quasar | 2,04 Leerr. | 1,58 Koll. | 12,9 h |
| echte Datei (aktiv) | 2,50 | 3,09 Ellipt. | 1,44 Zwerg | 2,10 Quasar | 1,97 Leerr. | 2,10 Koll. | 13-14 h |
| idle (2 min / 20 s) | 2,32 | 3,52 | 1,39 | 2,08 | 1,95 | 1,70 | 13,5 h |
| offline (8 h / 2 min, Datei) | 19,1 | 4,55 | 1,27 | 2,08 | 2,55 | 2,34 | 47,5 h (~2 Tage) |
Saatkerne je Sprung 6-50 (Spirale 6-13, Datei und frisch nah beieinander). Ohne jedes Saatkern-Upgrade (Ablation) werden G4/G5 3,2 h statt 1,8-2,0 h, das Archiv bleibt über 26 h offen: die Upgrades tragen ~35 % der Beschleunigung.
G2 liegt bei ~25 % der v1-Zeit (12,2 h aktiv), das Verhältnis frisch/Datei ist 1,0-1,2 (Sprung 1: 0,87). Nach dem 6. Typ spielt die Sim weiter; Galaxien werden dann bis unter 1 h schnell (mehr Saatkerne, Genom).
Offline: die Autos (Erkundung, Befehl, Genom, Sprung) tragen das Spiel, ab Galaxie 2 ist der Offline-Spieler so schnell wie der aktive (Quasar ohne Zeit-Rückfall: 4-15 h). Galaxie 1 braucht wie vorher ~19 h, weil die Autos erst bei 2/9/10 Sektoren freischalten.
Tests: `tests/replikator-jump.test.mjs`, `tests/sim-replikator-jump.test.mjs`, `tests/sim-replikator-runlength-galaxy.test.mjs`, Story-Tempo in `tests/replikator-story.test.mjs`.

### Laufdauer in Galaxie 2 (`takeGalaxySnapshots`, `tools/runlength-replikator.mjs`)
Nach der Wahl und nach 5 / 9 Sektoren: Replikation Optimum 10 min (15-30 s: 0-4 %), Expansion 10-40 min (2 min: 1-8 %), Singularität mit Warten 10-20 min, ohne Warten 30 min (2 min: 2-20 %). Kein Mikro-Lauf-Optimum; Reife (Singularität) und Gewinnfaktoren nach dem Softcap tragen dort wie in Galaxie 1.

## Paket 6 – Echo, Funksprüche, Enden, Gesamtbalancing (umgesetzt: `ending.js`, `ending-view.js`, Story-Kette in `story.js`)

**Erzählbogen** (Kapitel `a2f` Funksprüche, `a2e` Das Ende der Karte). Eine Kette in Spielreihenfolge (`link()` in `story.js`): jeder Eintrag wartet auf den vorigen, auf seine Galaxie-Nummer und auf Abstand zur letzten Akt-II-Meldung, so bleibt die Reihenfolge, egal wie lang eine Galaxie dauert; die Fortschrittseinträge und die `jfill`-Kette füllen dazwischen.
Auflösung in kleinen Schritten, nichts wird vorgetragen: ab Galaxie 3 kommt die Missionsleitung deutlich durch (Funksprüche 1 bis 5, Alter 2.600 / 9.800 / 31.000 / 64.000 / 190.000 Jahre, jede älter als die vorige; die Wartung bucht die Unstimmigkeit nur: "Reihenfolge wird nicht bereinigt").
Es wurde nur **eine** Sonde gebaut, der Prototyp (`f_m2`); die Ruinen der ersten Galaxie sind er (`f_m3`, `r_antrieb`, `e_wrack`); die Sonde ist eine Kopie mit "allen Fehlern des Originals", darunter der Annahme, das Original zu sein (`r_kopie`, Auflösung von `st_rep`).
Das Echo spricht ab Galaxie 5 (`e_hello`, Modal; das Signal aus `a2_start` war seins), ist früher gestartet, immer einen Sprung voraus, und blieb beim sterbenden Prototyp (`e_frueher`, `e_wrack`). Letzte Nachricht: eine automatische Bake (`m_bake`, Modal), das kurze Wort aus `sig_3` ist "Danke".
Die Wartung führt am Ende das Register (`end_merge` / `end_split`: Auflösung von "Ich finde etwas für dich. Später." und von "Bestand laut Register: eine / laut Karte: zwei"; Vorbereitung in `x_aufgaben`, `x_ablage2`). Missionsleitung ist ab `f_m1` bekannt (`CAST.mission.unlock`), das Echo hatte seit `a2_echo` eine Karte, seine Rolle wechselt mit der Story (`characters.js castInfo`, Option `chronicle.castInfo` der Standard-App).

**Ende von Akt II** (`ending.js`, Zustand `rep2.end { picked{merge,split}, order[], jumps0 }`, `def.version = 7`, Migration 6 -> 7 nur die Nummer): offen, wenn alle 6 Galaxientypen im Archiv sind (`endAvailable`). Danach spielt `m_bake`, dann kommt der **Entscheidungsdialog** (`ending-view.js mountEndingChoice`: nicht schließbar, im Spielstand verankert, kommt nach dem Neuladen wieder, wartet auf `m_bake` und auf andere Dialoge; Bestätigungsschritt vor dem Festlegen). Der Auto-Sprung wartet auf die Entscheidung (`hold: endPending`).
- **Verschmelzen:** auf jeder KÜNFTIGEN Karte gehören dir die Felder des Echos: das am Rand von Anfang an und eines je `mapEchoEvery` (2) bezahlte Sektoren (`map.js echoGrant`, dieselbe Wahl wie sonst die Besetzung, nie ein Sackgassen-Feld). Sie zählen als erschlossen (Boni, Sprung, 10 Sektoren), kosten nichts; Preis und Reisezeit der nächsten wachsen, als wären sie erschlossen (`T.endFx.merge.freeIndex` 1; mit 0 wäre der Bonus ~-55 % statt ~-35 %).
- **Abgrenzen:** das Echo verlässt die Karten (kein Felder-Besetzen, das Feld am Rand ist ein gewöhnlicher Sektor, die Silhouette muss für den Sprung nicht mehr gesehen werden); dauerhaft Erschließungen ×0,6 so lang und alle Gewinne ×2 (nach dem Softcap, reift wie alle Gewinnfaktoren, `endTrip/endGain`). Gilt sofort.
- **Das andere Ende** öffnet 3 Sprünge nach dem ersten (`endSecond`), Hinweis `end_again`, Knopf im Galaxie-Tab (Karte "Enden von Akt II"), eigener Epilog, **die Boni addieren sich**. Mit beiden: das Echo ist weg, seine Felder sind trotzdem deine. Erfolge `end_merge`, `end_split`, `end_both`. Das Spiel geht danach weiter (endlose Sprünge, Auto-Sprung).
- Kartenänderungen gelten erst ab der nächsten Karte (`applyEnding` nach `generateMap`, zieht keine RNG-Zahlen: alte Seeds geben dieselben Layouts); eine laufende Karte behält ihr Echo.

**Echo-Resonanz** (Mutation 17, selten, wird erst nach `e_hello` angeboten, `available(g)`): Gewinn von Blaupausen und Sternsystemen ×2,2, Erschließungen ×1,15 so lang. Bericht: "Kopie hallt nach. Gewinne kommen zweimal an, die Anflüge mit Verspätung. Ursprung des Halls: bekannt. Rückfrage: nicht beantragt."
Messung (`tools/mutations-replikator.mjs --only echoresonanz`): beide dt10 +8 %, dBP +0,34, dSys +0,34, dSumme +0,66; Nutzen allein +4 % / +0,64; Haken allein +17 % / -0,06.

**Messung der Enden** (`node tools/ending-replikator.mjs`, aktive Sim, Enden von Anfang an in Kraft, Zeit in Stunden je Galaxie, Mittel über Seeds; Summe der Galaxien 1-4):
```
frischer Abschluss (Seeds 1/2/3)         Gal 1  Gal 2  Gal 3  Gal 4   Summe  vs. ohne
ohne                                      2.11   3.00   1.57   2.22    8.89   100 %
Verschmelzen                              1.32   1.68   1.05   1.48    5.53    62 %
Abgrenzen                                 1.30   1.75   1.14   2.14    6.34    71 %
beide                                     0.85   1.24   0.72   1.03    3.83    43 %
echter Spielstand (Seeds 1/2; Verschmelzen wirkt in Galaxie 1 nicht: die Karte war beim Laden schon da)
ohne                                      1.89   2.68   1.76   2.37    8.70   100 %
Verschmelzen                              1.97   1.72   0.98   1.22    5.88    68 %
Abgrenzen                                 1.18   1.72   1.26   1.33    5.49    63 %
beide                                     1.18   1.13   0.80   0.96    4.07    47 %
```
Beide Enden sparen etwa ein Drittel der Galaxie-Zeit, zusammen etwa die Hälfte; Streuung zwischen Galaxientypen ±10 % (Typen und Saatkern-Käufe ändern sich mit). Erste Fassung: Verschmelzen mit Startfeld und freiem Preisindex 43 %, Abgrenzen ×0,8 / ×1,5 nur 88 % (die Karte ist reisezeitbegrenzt, Gewinne helfen kaum): deshalb Reisezeit ×0,6 und Gewinne ×2.

**Gesamt-Pacing (Paket 6)**, Stunden seit Akt-II-Beginn (v1-Ende nach 11,5 h), `node tools/simulate.mjs --act2 --hours 40 --dt 2 [--idle] [--fixture ...]`, Seed 7, Spielstand = Sim nach `GAL_PICK`:
| | Sprung 1 | Sprung 2 | Sprung 3 | Sprung 4 | Sprung 5 | Ende Akt II (6. Typ, Wahl) | 2. Ende |
|---|---|---|---|---|---|---|---|
| aktiv, frisch | 2,2 | 5,3 | 6,4 | 8,3 | 10,8 | **12,4** | 14,3 |
| aktiv, Datei | 2,5 | 5,6 | 7,0 | 9,1 | 11,1 | **13,2** | 15,0 |
| idle (2 min / 20 s), frisch | 2,3 | 5,8 | 7,2 | 9,3 | 11,8 | **13,5** | 15,0 |
| idle, Datei | 2,5 | 5,9 | 7,4 | 9,9 | 12,1 | **14,2** | 18,0 |
| offline (8 h / 2 min), Datei | 24,0 | 32,0 | 40,0 | 42,6 | 45,1 | **48,0** (~2,0 Tage) | 56,0 |
(Stunden seit Akt-II-Beginn, gerundet; Sprung n = Verlassen der n-ten Galaxie.) Idle / aktiv = 1,09 (frisch) und 1,08 (Datei), Ziel <= 2. Das Ende von Akt II liegt bei 12,4-14,2 h aktiv/idle (Ziel 12-18), offline nach 2 Tagen.
Ein Sprung wartet in manchen Galaxien bis ~30 min auf die vierte Quantenkern-Einheit (Gewinn >= 1 Saatkern); das war schon vor Paket 6 so.
Story-Tempo bis zum ersten Epilog: größte Lücke 16 min (frisch und Datei), nie zwei Einträge innerhalb einer Minute (`tests/replikator-story.test.mjs`, 100 Einträge in Akt II).
Laufdauer-Tests (`tests/sim-replikator-runlength*.test.mjs`) bleiben grün; die Enden ändern keine Laufdauer-Hebel (Gewinnfaktoren reifen, Reisezeit ist ohnehin kein Laufdauer-Faktor).

Tests: `tests/replikator-ending.test.mjs` (Öffnung, beide Enden, zweites Ende nach 3 Sprüngen, Karten mit freien Echo-Feldern, Boni, Auto-Sprung-Sperre, Migration, Echo-Resonanz), `tests/replikator-story.test.mjs` (Setups, Reihenfolge, Galaxie-Tore, Tempo durch das Ende mit frisch und Datei, Epiloge und Erfolge).

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

- `def.version = 7` (Paket 6), Migrationen `1 → 2` ... `6 → 7`; ursprünglich `def.version = 2`, Migration `1 → 2` (neue Keys über `mergeDefaults`, alte Story-Flags bleiben).
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
geduldig           -0 %  +0.04 +0.00 +0.00  +0.12       |    +1 %  +0.09 +0.00 +0.00  +0.13       |    +0 %  -0.07 +0.00 +0.00  +0.04       |
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

## Messung der Sondenbefehle, Anomalien und Sonnenhunger (Paket 4)

Werkzeuge: `tools/commands-replikator.mjs` (jeder Befehl allein mit Auto-Cast, Mutationen aus), `tools/anomalies-replikator.mjs` (jeder Typ allein, alle 15 min eine; „natur“ = echte Häufigkeit), `tools/mutations-replikator.mjs --only sonnenhunger`.
Aktive Sim, frisch UND echter Spielstand, Seeds 1-3, 3,5 h Akt II. `dt6/dt10` = Zeit bis 6 / 10 Sektoren, `dSys/dQK` = Gewinn im Fenster in Dekaden.

```
Befehl           dt6   dt10   dt12   dSys    dQK  Casts Min/Cast  t10 abs
ohne            +0 %   +0 %   +0 %  +0.00  +0.00      0      -        126
uebertakten     -3 %  -19 %  -22 %  +0.15  +0.11     32     +0.7      103
sonnenwind      +0 %   -2 %   +0 %  +0.64  +0.08     17     +0.3      123
tiefenscan      -3 %  -16 %  -19 %  +0.06  +0.02      5     +3.7      106
alle            -6 %  -30 %  -36 %  +0.65  +0.25     45     +0.8       88
```
```
Anomalie           dt6   dt10   dSys    dQK Starts  Min/St  Sys/St   QK/St  Angeb.  Mut.  t10 abs
ohne              +0 %   +0 %  +0.00  +0.00      0     -       -       -      +0.0  +0.0       96
gezeitenwelle    -19 %  -23 %  -0.05  +0.08      6    +3.6   -0.01  +0.013    +0.0  -0.5       74
zeitriss         -22 %  -40 %  +0.66  +0.48     11    +3.4   +0.06  +0.043    +2.8  +1.5       57
strahl            -1 %   -1 %  +1.04  +0.87     13    +0.1   +0.08  +0.068   +10.3  +5.5       95
spiegel           +5 %   +6 %  +1.85  +1.43     13    -0.4   +0.14  +0.111    +8.5  +4.7      102
signal            +4 %   +3 %  +0.25  +0.28     13    -0.2   +0.02  +0.022    +0.0  +0.2       99
umkehr            +5 %   +3 %  +0.16  +0.31     10    -0.3   +0.02  +0.032    +0.3  -0.2       99
natur            -17 %  -12 %  +0.17  +0.22      3    +3.7   +0.05  +0.066    +1.2  +0.5       84
```
```
Mutation        beide  dt10    dBP  dSys   dQK  dSumme| Nutzen dt10    dBP  dSys   dQK  dSumme| Haken  dt10    dBP  dSys   dQK  dSumme|
sonnenhunger      -15 %  -0.30 +0.00 +0.00  +0.22       |   -17 %  +0.00 +0.00 +0.00  +0.28       |    +2 %  -0.30 +0.00 +0.00  -0.12       |
```
Lesart: Übertakten und Tiefenscan sind der Zeit-Hebel (Tiefenscan ~3,7 min pro Cast, fünf Casts reichen für -16 %), Übertakten wirkt zusätzlich auf die Quantenkerne; die Sonnenwind-Ernte hebt Sternsysteme um das 4,4-Fache und über sie die Quantenkerne um 20 %, bewegt die Karte aber erst, wenn Preise bremsen.
Bei den Anomalien sind Gezeitenwelle und Zeitriss der Zeit-Hebel (3,4-3,6 min je Start; das Maximum von 10 min wird nur bei genug Restzeit erreicht), Strahl und Spiegel bringen Mutationen (Strahl +0,07 Dekaden Quantenkerne je Start, Spiegel +0,11 für die halben Sternsysteme, +6 % Kartenzeit),
das Umkehrfeld zahlt +0,03 Dekaden Quantenkerne je Start für 3 % Kartenzeit, das Signalfragment ist absichtlich klein (x1,08, vier Stück x1,36) und trägt die Story.
Sonnenhunger: Nutzen -17 % Kartenzeit, Haken -0,30 Dekaden Blaupausen, zusammen -15 % und +0,22 Dekaden Summe.
Laufdauer: Kartenboni und Befehle machen kurze Expansions-Läufe nicht besser (Test in `tests/sim-replikator-commands.test.mjs`). **Vorbestehend und offen:** im Spielzustand nach 10 Sektoren (echter Spielstand, auch im Commit vor Paket 4 gemessen) ist ein 2-min-Singularitätslauf bei abgeschaltetem Warten auf Sektoren das Optimum (Quantenkerne/s); in den v1-Phasen (`sing1`) trat das nicht auf.

Hinweis zu den Tabellen oben: gemessen vor der Singularitäts-Reife und vor `mapTripBase` 360. Die Quantenkern-Spalte ist seither grob: in einem 3,5-h-Fenster fallen nur 1-3 Singularitäten (Läufe von 1-2 h), ein einzelner Lauf verschiebt die Summe um eine Dekade. Aussagekräftig bleiben Kartenzeit und Sternsysteme; die Tests vergleichen nur diese.
