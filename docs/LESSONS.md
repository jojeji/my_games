# Erkenntnisse aus Replikator und Merlin

Gesammeltes Wissen aus Entwicklung, Simulation und echtem Spielen. **Vor jedem neuen Spiel lesen** und beim Weiterentwickeln ergänzen
(kurz, mit Begründung, möglichst mit der Quelle: Sim, Spielstand, Screenshot).

## Spieldesign und Balancing

**Optimale Laufdauer messen, nicht raten.** Merlin: Prestige-Gewinn ∝ Wurzel, dazu ein harter Softcap pro Lauf → 12-Sekunden-Läufe
waren optimal. Ein echter Spieler hat das gefunden (2.539 Verjüngungen, Auto-Verjüngung auf 12 s). Folge: Quellen 5–8 nie gekauft,
Zauber bedeutungslos. Regel: Für jede Prestige-Ebene „Gewinn pro Sekunde über Laufdauer“ je Spielphase messen. Ziel 2–4 min
für die unterste Ebene. Softcaps *pro Lauf* drücken immer Richtung Mikro-Läufe. Wenn nötig, über die Gesamtmenge deckeln, nicht über den Einzellauf.

**Inhalt, den optimales Spiel überspringt, ist verschwendet.** Prüfen: Werden in jeder Phase alle Generatoren und Upgrades
tatsächlich genutzt? Passen Zauber- und Effektdauern in einen typischen Lauf?

**Spieler spielen überwiegend offline.** Echter Spielstand: 22,5 h offline, 1,8 h aktiv in 24 h. Offline-Fortschritt, Autokäufer
und Offline-Zusammenfassung sind Kernfeatures, keine Extras. Idle-Pacing (z. B. „alle 2 min für 20 s“) muss simuliert werden.

**Autokäufer:**
- Nach Nutzen kaufen, nie „das Günstigste“. Das ist meist das schwächste.
- Generatoren: Bündel-Boni (5/10/15 …) und Synergien in die Amortisation einrechnen und Sparen erlauben, sonst verhungern die oberen Stufen.
- Simulation und Spiel nutzen **dieselbe** Kauflogik, sonst stimmt das Balancing nur auf dem Papier.
- Neue Autokäufer starten **aus**. Der Schalter sitzt dort, wo der Autokäufer wirkt (nicht in einem Sammel-Panel versteckt). Beim Freischalten erscheint einmal ein Hinweis mit dem Ort des Schalters.

**Simulationen sind nötig, aber nicht hinreichend.** Ein gieriger Bot findet andere Optima als Menschen. Deshalb:
- ein Spieltest-Protokoll (lokal im Spielstand, exportierbar)
- früh nach exportierten Spielständen fragen
- Pacing-Tests (aktiv + idle) als Deploy-Sperre
- Zielwerte, die sich bewährt haben: 1. Prestige 3–6 min, 2. Ebene 25–60 min, Ende v1 ~10–15 h aktiv, Idle ≤ 2× aktiv, zweiter Durchgang (NG+) ≤ 40 %

**Spätes Spiel:** Jede Ebene muss die nächste spürbar beschleunigen, etwa über einen Bonus pro bisherigem Prestige. Keine einzelne Challenge als 8-Stunden-Wand.

## Mobile UI

- Keine Infos nur per Hover. Tap-Ziele ≥ 44 px. Kopfbereich ≤ ~15 % der Höhe. Prestige-Button einzeilig.
- Dichte Listen: 6–8 Generatoren pro Bildschirm.
- Alles Automatische sichtbar machen: Auto-Taps animieren wie manuelle, Ladungen als umbrechende Punkte statt Ausblenden.
- Story-Blasen deckend mit Hintergrund-Verlauf, Farben pro Figur. Gelesen-Markierung gilt pro Besuch des Tabs.
- Overlays dürfen das Spiel nicht blockieren (pointer-events nur auf den Blasen).
- Immer mit Playwright bei 390×844 **und** 360×740 prüfen, die Screenshots selbst ansehen, nicht nur Agenten-Berichten glauben.

## PWA und Deployment

- Jedes Spiel bekommt ein eigenes Manifest mit eigener `id`, `start_url` und `scope`, damit es eine eigene App auf dem Homescreen wird.
- Android: „bereits installiert, kann nicht geöffnet werden“ = hängende Installation. Lösung: App deinstallieren, Chrome schließen, neu installieren.
- iOS löscht `localStorage` nicht installierter Seiten → Export/Import ist Pflicht.
- Updates erst beim nächsten Start (Service Worker, network-first). Nutzern sagen: App schließen und neu öffnen.
- GitHub Pages: kostenlos nur mit öffentlichem Repo. Quelle: GitHub Actions. Die Umgebung `github-pages` hat Branch-Regeln (auf `main` bzw. „No restriction“ setzen). Standard-Branch: `main`.
- `main` = live. Arbeit auf dem Feature-Branch, erst nach Prüfung nach `main`.

## Story und Texte

- **Erst eine Stimmen-Bibel** (siehe `games/merlin/STIMMEN.md`), dann schreiben. Kumpel-Ton, du, kurze Sätze, höchstens eine Pointe pro Eintrag, Witze nie erklären.
- **Typische KI-Muster vermeiden:**
  - Dreier-Aufzählungen
  - Kalendersprüche und Aphorismen-Ketten
  - viele Gedankenstriche
  - „nicht X, sondern Y“
  - alle Figuren klingen gleich
- **Die Weltregel muss widerspruchsfrei sein** (Merlin: Wer rückwärts lebt, kennt unsere Vergangenheit *noch nicht*). Jede Zeile dagegen prüfen.
- **Ziel und Motivation der Hauptfigur in den ersten Zeilen.** Jede Mechanik braucht einen Grund in der Story (Merlin: Ideen = Gründe für „noch einmal“).
- **Setups mit Auflösung** (Zettel, Zimt-Krümel) statt Ahnungen, die die Figur nicht haben kann. Rätsel nicht vorzeitig auflösen.
- **Story in Spielreihenfolge lesen** (Sim-Transkript mit Zeitstempeln). Ziel: keine Story-Lücken > ~20 min, keine Häufungen beim Epochenwechsel.
- **Nach jeder Textänderung nach verwaisten Antworten suchen** (eine gestrichene Zeile, auf die die nächste noch antwortet).
- Namen nur an einer Stelle (`characters.js`), Story-Texte nutzen Platzhalter.
- **Einzeiler zur Chronik ausbauen (Replikator, 8 → 54 Einträge):**
  - Die alten IDs behalten, damit Lese-Flags gelten. Zwei Einträge mit demselben Auslöser (`st_exp`/`st_chal`, `st_sing`/`st_res`) per `after(id, Sekunden)` staffeln, sonst Häufung.
  - Für Lücken ≤ 20 min in 12 h Spielzeit braucht es etwa einen Eintrag alle 12 min. Das geht nur mit vielen kleinen Fortschritts-Auslösern (Kopien-/Expansions-/Kollaps-Zahlen, einzelne Forschungen, Materie-Schwellen) plus einigen Zeit-Füllern. Zeit-Füller an einen Fortschrittseintrag koppeln (`at(sekunden, gate)`), sonst stehen sie bei langsamer Spielweise vor dem, worauf sie sich beziehen.
  - Eintrag über eine **bestimmte** Challenge (`chDone('c_hand')`), nicht über „die n-te“: Die Reihenfolge ist je nach Spieler anders. Exklusive Forschungsäste in der Bedingung beide zulassen (`a_schmiede || b_entropie`).
  - Texte, die auf Figuren oder Orte zurückverweisen, brauchen eine Bedingung, die das Vorherige garantiert (der summende Punkt erst ab der ersten Singularität).
  - Tool: `node tools/story-replikator.mjs [--idle]` druckt das Transkript mit Zeitstempeln, größte Lücken und Häufungen; `tests/replikator-story.test.mjs` sichert ≤ 25 min Lücke und keine Häufung < 1 min ab.
- **Alter Spielstand bekommt eine Chronik nachträglich:** Migration markiert alles bereits Gesehene als gelesen *und* gezeigt. Neue Einträge, deren Bedingung im Spielstand schon wahr ist, trägt `Game.storyBackfill()` still ein (kein Modal, keine Blase, ungelesen, mit dem Zeitstempel des Vorgängers, damit die Reihenfolge stimmt). Echter Spielstand (86 h, alles erreicht): 0 Modals, 0 Blasen, 45 ungelesene Einträge im Chronik-Tab.
- **Ohne Fotos:** Pro Figur ein SVG-Emblem (Farbe + Symbol, `avatar({ emblem, color })`). Es trägt die Figur genauso wie ein Portrait, solange Farbe und Seite im Chat konsequent bleiben.
- **Persönliche Easter Eggs** (Geschenk-Spiele): sparsam, ein bis zwei Zeilen, dort, wo sie zum Thema passen. Die Überraschung gehört ans Ende, nicht als Popup beim Start.

## Bilder und Figuren

- **Private Fotos nie ins Repo** (öffentlich). Nur stilisierte, KI-generierte Portraits, mit Einverständnis der Abgebildeten.
- **Bild-KI-Prompts:**
  - Stil zuerst festlegen, die Referenz nur für Merkmale nutzen („do not edit or reuse the photo“).
  - Die Gewichtung der Referenz senken, sonst kommt das Foto 1:1 zurück.
  - Altersstufen aus dem fertigen Bild ableiten, nicht aus dem Foto.
- **Avatar-Ringe werden von `overflow: hidden` abgeschnitten.** Der Blasen-Stapel braucht ein paar Pixel Innenabstand, sonst fehlt Figuren am Rand der halbe Ring (Screenshot 360×740 zeigte es).
- Portraits als WebP (512 + 160 px), runde Avatare mit Ring in der Figurenfarbe. Antippen öffnet eine Figurenkarte. Figuren erst zeigen, wenn man ihnen begegnet ist.

## Arbeitsweise

- **Orchestrierung:** Ein Orchestrator plant und prüft, Sonnet-Agenten implementieren. Kleine Fixes (wenige Zeilen) direkt.
- Jeden Agenten-Bericht gegen Code, Tests und Screenshots prüfen. Agenten übersehen Dinge oder melden Ungetestetes als erledigt.
- Vor dem Livegang: `npm test`, `node tools/update-precache.mjs`, Smoke-Test der Live-Seite.

## Nachtrag: Laufdauer-Rebalance Merlin (gemessen mit `tools/runlength-merlin.mjs`)
- Reiner Zahlen-Tausch in `tune.js` (Softcap weg, Reifung stärker, Exponent höher) hat **nicht** gereicht: Die Kurve „Gewinn/s über Laufdauer“ blieb fallend.
  Gelöst mit einem **Reife-Faktor auf den Prestige-Gewinn nach dem Softcap**: `min(1, Laufzeit/180 s)^1.5` (`layer.postMult`). Damit ist das Optimum 2–4 min, 12-s-Läufe bringen ~10–20 %.
- Bei Balancing-Änderungen an bestehende Spielstände denken: Einstellungen der Spieler, die nach der Änderung schädlich sind (hier Auto-Verjüngung 12 s), einmalig per `onLoad`-Hook anpassen und mit Hinweis melden.
- Autokäufer-Bug in der Praxis: Der „schnellste Amortisation“-Käufer hat nie für Quelle 5+ gespart, der Upgrade-Käufer „günstigstes zuerst“ hat nutzlose Upgrades gekauft. Neue Logik: Nutzen pro Kosten inkl. Bündel-Boni und Synergien, mit Sparen (`prodChoose`, `upgBuyBest`).
- Spieler-Buttons („Alles kaufen“) und Autokäufer brauchen **unterschiedliche** Logik: Der Autokäufer darf sparen, der Button muss sofort ausgeben,
  sonst wirkt er kaputt („kauft nichts“). Merlin: `prodSpendAll` (Button) vs. `prodBuyAll` (Autokäufer).
- Replikator, echter Spielstand: Ende von v1 (Story-Ende, alle 8 Challenges, alle Upgrades) nach 13,7 h Spielzeit, insgesamt 61,7 h,
  davon nur **~2 h aktiv**. Offline-Fortschritt mit voller Rate plus Autokäufer spielt das Spiel praktisch allein. Die Simulation (10,5 h aktiv) hat das nicht abgebildet.
  Für neue Spiele: Offline-Effizienz bewusst festlegen (z. B. 50 %, oder Boni, die nur aktiv wirken) und auch ein Szenario „fast nur offline“ simulieren.
- Gespeicherte Spielstände sind lang (Spieltest-Protokoll). In Chat-Nachrichten werden sie abgeschnitten. Auswertbar bleibt der Anfang (Zustand),
  das Protokoll geht verloren. Eine Kurzform-Export-Funktion („nur Zustand“) oder ein Datei-Export wäre besser.

## Nachtrag: Psst! Kartendaten mit Assoziationsnormen prüfen
- Freie Assoziationsnormen sind das richtige Maß für "Wörter, die ein Erklärer von selbst sagt". Die beste deutsche Quelle (SWOW-DE) verlangt Registrierung und ist CC BY-NC-ND. Brauchbar waren USF (Englisch, per Hand übersetzt) plus deutsche ConceptNet-Kanten. Abdeckung ca. 38 % der Karten, Personen, Filme und Orte fast nie.
- Automatisches Tauschen von Tabuwörtern nach den Normen verschlechtert Karten (Antonyme und Geschwisterwörter wie Hund/Katze, falscher Wortsinn nach der Übersetzung, z. B. "shot" = Impfung oder Schuss). Deshalb: Werkzeug schlägt vor, ein Mensch entscheidet (`assoc-swaps.txt`). Mehrdeutige Cues (Bank, Ring, Kran, Zecke, Cricket ...) vorher aussortieren, Übersetzungen pro Cue prüfen (`cue>target`).
- Vor jedem Einbau die Zuordnungsliste Suchbegriff -> englischer Cue -> Assoziationen von Hand lesen. Die Fehler stehen in den obersten 3 Wörtern, genau dort, wo die Vorschläge herkommen.

## Mehrspieler-Infrastruktur (Psst!)
- Cloudflare Worker `psst-room` läuft unter `https://psst-room.joeylauterbach.workers.dev`. Er wird über **Cloudflare Workers Builds** veröffentlicht (Git-Anbindung, Pfad `workers/psst-room`), ohne API-Token in GitHub.
- Getestet: zwei WebSocket-Clients im selben Raum, Nachricht in ~27 ms weitergeleitet, Verbindungsaufbau ~0,7 s (aus einem Cloud-Container gemessen).
- Free Plan: Durable Objects müssen SQLite-basiert sein (`new_sqlite_classes` in der Migration). Den Hibernation-WebSocket-API verwenden (`ctx.acceptWebSocket`), damit ruhende Räume nichts kosten.

## Nachtrag: Psst! Mehrspieler umgesetzt
- **Geheimhaltung braucht den Routing-Worker.** Der erste Relay-Worker verteilt jede Nachricht an alle: Karten an `to`-adressierte Geräte kommen bei allen auf dem Draht an (gemessen: 5 Karten-Frames bei Rater und Fernseher). Der Client filtert sie weg, das DOM bleibt sauber, aber nur der neue Worker hält sie auch aus dem Netz. Den `hostKey` deshalb nie über ein unbekanntes Relay senden.
- **Neuen Worker lokal testen geht**: `npm i wrangler` im Scratch-Verzeichnis, `wrangler dev --local` (workerd wird per npm geladen). Der Origin `http://localhost:8765` ist erlaubt, so läuft die komplette Browser-E2E ohne Deploy. `wrangler` legt `.wrangler/` im Worker-Ordner ab (in `.gitignore`).
- **Host-Reload ist ein Rennen**: Die Kartenpakete laden asynchron, die Gäste klopfen schon an. Ohne Sperre wurden sie als neue Lobby-Spieler angelegt und sahen die Lobby statt des Spiels. Jetzt ignoriert der Host Nachrichten, bis der Zustand geladen ist, und ruft die Geräte danach mit `host-hello` zurück.
- **Reload eines Gastes**: Der Host sieht den alten Socket noch als verbunden (kein `peer-leave` bei einem alten Relay, bei einem toten Socket auch beim neuen nicht sofort). Beitritt per Name übernimmt deshalb auch Plätze, die noch „online“ aussehen.
- **Erste gültige Aktion gewinnt** ohne Sperren: Jede Aktion trägt die ID der Karte bzw. des Buzzers, die der Absender gesehen hat (`ref`). Ein zweiter Tap hat eine veraltete `ref` oder trifft die falsche Phase und wird ignoriert.
- **Uhr**: Der Host sendet die Endzeit in Host-Zeit, Gäste rechnen mit dem Offset des Ping/Pong-Samples mit der kleinsten Laufzeit. Test mit absichtlich 7,8 s vorgehender Host-Uhr.
- **iOS-Sperrbildschirm**: Socket kann „offen“ aussehen und tot sein. Beim Zurückkehren sofort ein Ping, kommt in 2,5 s nichts, neuer Socket. Der Host baut beim Zurückkehren immer neu auf. Wake Lock zusätzlich in Lobby und Spiel.
- **CSS**: `.view > main { display:flex }` (Spezifität 0,1,1) überschreibt ein einfaches `.tv { display:grid }`; der Fernseher brauchte `.view > main.tv`.
- **Playwright**: `text=Raum erstellen` trifft auch die Überschrift „Neuen Raum erstellen“ (Teilstring). Für Buttons `getByRole('button', {name, exact:true})` nehmen.


## Nachtrag: Psst! Jeder gegen jeden und Teamgrößen
- **Ein Team mit einem Spieler ist kein Team**: Wenn es erklärt, rät niemand. Die Lobby warnte vorher nur; jetzt ist „jedes Team ≥ 2“ eine harte Regel (`host.check()`), bei genau 3 Spielern bietet die Lobby „Jeder gegen jeden“ an. Spieler ohne Team zählen als verfügbar (werden beim Start auf die kleinsten Teams verteilt), die Prüfung simuliert diese Verteilung.
- **Wächter-Rotation fair und ohne Zusatzzustand**: Wächter = Spieler `1 + (Runde mod (n−1))` Plätze nach dem Erklärer. Pro Runde ist jeder genau einmal Wächter, nie der Erklärer, und nach n−1 Runden kam jedes Paar (Erklärer, Wächter) genau einmal dran (Test für n = 3..6).
- **Jede Zähleinheit = ein „Team“**: Statt die Logik zu gabeln, ist in Jeder gegen jeden jeder Spieler ein Team mit einem Namen. Punkte, Statistik, Überspringer-Kontingent pro Spiel, Verlängerung und Speicherstand funktionieren dadurch unverändert.
- **Tests: `client.act()` meldet nur „gesendet“**, nicht „angenommen“. Rollenprüfungen deshalb über `host.intentFrom(id, …)` (liefert false) plus Zustandsvergleich über den Draht. Ein Gerät dauerhaft offline: `net.close()`; `room.drop()` verbindet sich von selbst wieder.
- **Sticky-Fußleiste mit Verlauf**: Ein Hinweistext in der halbtransparenten Zone liegt auf der Liste dahinter und ist unlesbar (Playwright-Screenshot der Lobby). Fußleisten mit Hinweis/Fehler bekommen einen deckenden Hintergrund.

## Nachtrag: Replikator Paket 0 (Messungen mit `tools/runlength-replikator.mjs`, `tools/simulate.mjs --offline`)
- **Laufdauer Replikator ist gesund, die Hypothese „Softcap drückt zu Mikro-Läufen“ stimmte nicht.** Der Materie-Ertrag wächst mit hohem Polynomgrad in der Laufzeit (~t^6–9, 8 Stufen),
  Blaupausen pro Sekunde steigen deshalb bis mindestens 20 min Laufdauer; 15–60-s-Läufe liegen bei < 1 % des Optimums. Weil die Blaupausen zusätzlich in die Produktion zurückfließen,
  ist „Gewinn pro Sekunde im festen Fenster“ für die Replikation allein **kein** brauchbares Optimum (wächst immer mit L). Aussagekräftig ist die **Zeit bis zur nächsten Ebene**:
  früh/mitte/spät vor der ersten Expansion ist 3–5 min am schnellsten (1 min: 2–8× langsamer). Expansion: Sternsysteme/s Optimum 10–80 min, Singularität 15–30 min (2-min-Läufe nur 10–30 %).
  Ab ~12 Expansionen reicht eine einzige Replikation bis zur nächsten Expansion: die Replikation wird dann zur Durchgangsstation (keine Fehlentwicklung, aber wenig Spiel).
- **Der Standard der Auto-Replikation (`mult`, Wert 1) ist eifrig:** Ganzes Spiel in der Sim, nur der Replikations-Faktor variiert (Ende v1): Faktor 1 = 9,3 h, 4 = 6,3 h, 16 = 4,7 h.
  Wert 1 ist aber das, wogegen Pacing und Tests kalibriert sind; wer den Regler hochdreht, spielt schneller. Bei einer Balance-Änderung den Standard (z. B. 4) zusammen mit `tune.js` neu kalibrieren und
  alte Einstellungen per `onLoad` einmalig anpassen. Nicht in Paket 0 geändert.
- **Upgrade-Autokauf nach Nutzen statt „günstigstes zuerst“:** `repObjective` (def.js) bewertet Produktion (Taylor-Reihe der Generatorkette über 60 s, sieht Multiplikatoren auf hohe Stufen), Kostenteiler, Brückenkopf-Startmaterie,
  freigeschaltete Stufen, Autokauf-Upgrades und Prestige-Gewinn-Multiplikatoren (gewichtet über die Boost-Exponenten). Wichtig: Upgrades ohne direkten Einkommenseffekt (Docks, Dyson, Autokauf) brauchen einen eigenen Term,
  sonst sind sie für `upgBuyBest` wertlos und werden erst ganz am Schluss gekauft. Messung: kein Upgrade verhungert, Pacing im Zielkorridor (Ende v1 aktiv 10,4 h -> 12,2 h). Die Kostenteiler-Gewichtung
  (1,0 pro Dekade) kommt aus einem Experiment: ÷10 Generatorkosten bringt nach 10 min ~2 Dekaden mehr Materie.
- **Offline-Szenario** (`--offline`, alle 8 h für 2 min): erste Replikation nach 8 h, Expansion nach 24 h, Singularität nach 48 h, Ende v1 nach ~7,6 Tagen (23 Besuche, 46 min aktiv).
  Das ist die Untergrenze für „fast nur offline“: Ohne Autokäufer (kommen erst nach der ersten Expansion) bringt Abwesenheit am Anfang fast nichts.
- Die Engine kann Autokäufer-Hinweise schon (`auto-unlocked` + `state.auto[id].seen`); es fehlte nur der Toast in `standard-app.js` (jetzt `engine/ui/auto-hints.js`, auch für Merlin). Freischaltungen während der Abwesenheit
  kommen als Events der Offline-Zusammenfassung (der Bus ist dort stumm geschaltet).

## Nachtrag: Replikator Paket 2 (Galaxiekarte), gemessen mit `tools/simulate.mjs --act2` und `--fixture tests/fixtures/replikator-end-v1.json`
- **Die aktive Ökonomie sättigt bei ~1e7 Sternsystemen pro Singularitäts-Lauf** (Softcaps), egal wie der Spielstand dorthin kam: frischer v1-Abschluss (Bestwert 1,6e6) klettert in ~2,5 h auf 1,1e7, die echte Datei (Bestwert 9,4e7) liegt mit dem Sim-Spieler sofort bei 1,4e7. Die 9,4e7 entstanden nur durch 25-h-Läufe ohne Eingriff.
  Preise, die linear am Bestwert hängen, sperren die lange Datei aus; feste Preise räumen sie sofort ab. Gewählt: schwache Abhängigkeit (`mapAnchorSlope` 0,1).
- **Der Bestand der langen Datei ist ein Windfall** (6,6e7 = Vielfaches des Plateaus): Mit „Preis aus dem Bestand“ allein zahlt er die ersten ~6 Sektoren sofort. Gelöst durch die **Erschließung als Reisezeit** (ein Sektor zugleich, `4 min * 1,25^n`, läuft offline): aus dem Windfall wird eine Folge, und frische und lange Datei laufen fast gleich schnell, weil die Reisezeit die Hauptdrossel ist und der Preis nur noch das Abräumen am ersten Tag verhindert.
  Gemessen (aktiv, Minuten seit Akt-II-Start, 8 Seeds): frisch 1 / 3 / 6 / 10 Sektoren nach 7 / 18 / 48 / 136–171, lange Datei 4 / 15 / 45 / 133–239 (Verhältnis bei 10 Sektoren <= 1,8). Akt-II-Story: 6 Einträge in 4 h, nie zwei innerhalb einer Minute (`calm` in `story.js`), `node tools/story-replikator.mjs --act2 [--fixture ...]`.
- **Der Bestand verfällt mit jeder Singularität.** Dieselbe Regel gilt im Spiel und in der Sim: `holdSingularity` (map.js) lässt die Auto-Singularität und den Sim-Spieler warten, solange der nächste Sektor <= `mapHoldReach` x Bestand kostet (höchstens `mapHoldMax` Laufzeit); die Auto-Zeile zeigt „Wartet auf den nächsten Sektor“ (`prestigeAuto({hold, holdText})`, `autoDef.status`). `auto_map` steht vor den Prestige-Autos.
- **Sektorkosten senken den Sternsystem-Bonus nicht** (`globalParts` liest `systems.run`, `spend` nur `amount`); steht so in `docs/replikator-akt2.md`.
- **Layout-Streuung**: Dieselben Preise, anderer Seed ändern die Zeit bis 10 Sektoren stark, solange Preise bremsen (frühere Messung ohne Reisezeit: 47–278 min). Mit der Reisezeit als Hauptdrossel bleibt die Spanne klein. Pacing-Tests laufen mit festem Seed (`SIM_SEED`), Balance-Änderungen über mehrere Seeds prüfen (`TUNE_OVERRIDE`, `--seed N`).
- **Echo-Besetzung ohne Sackgassen**: Von 19 Feldern bleiben 17 frei; mit „jeder 2. Anspruch besetzt eins“ ist das Maximum exakt 12 Sektoren (n + floor((n-1)/2) <= 17), solange die Besetzung nie ein freies Feld abschneidet (`echoChoice`: Zusammenhangsprüfung; das Ziel einer laufenden Erschließung gilt als genommen). Test: 400 Seeds. Die Wahl hängt nur von Karten-Seed und Zähler ab.
- **Alter Spielstand und Backfill**: Akt-II-Einträge lesen `rep2.act2`, das erst nach `storyBackfill` gesetzt wird (`onLoad`-Reihenfolge). Seed migrierter Spielstände aus `time.created` (gleiche Datei, gleiche Karte).
- **Kopfzeile bei großen Zahlen (360 px)**: Der Standard-Header nutzt kompakte Chips (`formatCompact`, „65,7Mio“, Klasse `.hdr-chips.fit`, wrappt statt abzuschneiden); Merlin behält seine Chips (Vergleich 360/390 mit dem Stand davor: Layout identisch, die Abkürzung „1…“ bei 1e47 gab es schon vorher).
- **Tab-Leiste**: Mehr als 6 Tabs passen bei 360 px nicht. `mountStandardApp` faltet die Ebenen-Tabs in einen Tab „Ebenen“ (Segment-Schalter), sobald die Leiste sonst überläuft.
- **Karte oben**: Story-Blasen und Toasts steigen von unten auf; die Karte steht zuerst im Tab, der Statustext darunter, so verdeckt nur der Statusblock.

## Nachtrag: Replikator Paket 3 (Mutationen), gemessen mit `tools/simulate.mjs --act2 --verbose`, `tools/runlength-replikator.mjs`
- **Aufladen nach Spielzeit, nie pro Replikation.** Der echte Spielstand hat eine schnellste Replikation von 1 s: ein Zähler pro Replikation belohnt Mikro-Läufe. Angebote kommen alle ~25 min Spielzeit (online wie offline), höchstens 3 warten, danach hält die Ladung an. So entsteht eine Entscheidung, die wartet (kein Verfall, keine Strafe für Abwesenheit).
- **Mutationen verschieben die Laufdauer nicht** (alle 15 einzeln und eine Gruppe aus sechs gemessen, Replikation/Expansion/Singularität): Optimum unverändert bei >= 10 min, 30-s-Läufe bei 0 %. Der Schutz steckt in der Bauart: Kosten-/Bündel-/Gewinn-Faktoren wirken in jedem Lauf gleich, Geduldig hat den Start des Laufs als schwächsten Punkt.
- **Die aktive Ökonomie ist gedeckelt (Softcaps), Produktionsfaktoren bringen dort kaum Fortschritt:** Hyperaktiv x2,5 änderte Quantenkerne und Sternsysteme in 4 h aus der Datei um < 0,05 Dekaden, Gewinn-Faktoren (Überschuss, Mosaik, Kolonialist) bis 0,2. Die Karte bleibt durch die Reisezeit gedrosselt: 10 Sektoren nach 133-182 min (8 Seeds, frisch und Datei, Verhältnis 0,79-1,02), wie vor den Mutationen. Mutationen sind für Offline-Spieler vor allem eine Entscheidung und eine Zahl im Kopf, nicht der Pacing-Hebel.
- **Der Nutzen-Wert einer Karte schwankt mit dem Zeitpunkt** (Bündel- und Kostenwirkung hängen davon ab, wie viele Stufen gerade gekauft sind: Sparsam bewertete 1,38 / -0,39 / 0,54 Dekaden in drei Zuständen). Deshalb bei vollem Genom eine höhere Schwelle fürs Ersetzen (`mutSwapGain`), sonst tauscht der Auto-Genom hin und her.
- **Effekte, die repObjective nicht sieht**, brauchen eigene Terme (`mutExtra`: Angebotsrate, Reisezeit, Sektorpreis, Offline-Anteil), sonst nimmt die Auto sie nie. Zeitabhängige Faktoren (Geduldig) bewertet man mit dem vollen Faktor (`g.mutRef`), sonst sieht eine Karte direkt nach einer Replikation schlecht aus.
- **Offline-Effekte brauchen ein Flag der Engine** (`game.offlineNow`, gesetzt in `runtime.simulateOffline`): Nachtschwärmer x1,5 offline / x0,9 online. Der Auto-Wert nimmt einen angenommenen Offline-Anteil (60 %); ein aktiver Sim-Spieler verliert also 10 %.
- **Story-Lücken schließt man mit Ketten, nicht mit Zeit-Füllern:** Je Angebot ein kurzer Eintrag 12 min nach dem Ziehen (der nächste erst, wenn der vorige da ist), dazu ein Bericht je Mutation. Ergebnis: größte Lücke bis zum 10. Sektor 17 min (vorher 2 h 45), kein Abstand unter einer Minute (`calm`).
- **Playwright-Screenshots:** Story-Modale aus dem Test heraus nicht per Klick wegklicken (Mehrseiten-Dialoge laden nach), sondern `chronicle.shown` setzen und das Overlay entfernen; Toasts brauchen ~4,5 s, bis sie verschwinden. `fullPage`-Screenshots zeigen die sticky Kopfzeile mitten im Bild (Artefakt).
