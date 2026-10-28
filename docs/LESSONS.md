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
- **Die aktive Ökonomie ist gedeckelt (Softcaps), Produktionsfaktoren bringen dort kaum Fortschritt:** Hyperaktiv x2,5 änderte (VOR dem Rebalance, siehe unten) Quantenkerne und Sternsysteme in 4 h aus der Datei um < 0,05 Dekaden, Gewinn-Faktoren (Überschuss, Mosaik, Kolonialist) bis 0,2. Die Karte bleibt durch die Reisezeit gedrosselt: 10 Sektoren nach 133-182 min (8 Seeds, frisch und Datei, Verhältnis 0,79-1,02), wie vor den Mutationen. Mutationen sind für Offline-Spieler vor allem eine Entscheidung und eine Zahl im Kopf, nicht der Pacing-Hebel.
- **Der Nutzen-Wert einer Karte schwankt mit dem Zeitpunkt** (Bündel- und Kostenwirkung hängen davon ab, wie viele Stufen gerade gekauft sind: Sparsam bewertete 1,38 / -0,39 / 0,54 Dekaden in drei Zuständen). Deshalb bei vollem Genom eine höhere Schwelle fürs Ersetzen (`mutSwapGain`), sonst tauscht der Auto-Genom hin und her.
- **Effekte, die repObjective nicht sieht**, brauchen eigene Terme (`mutExtra`: Angebotsrate, Reisezeit, Sektorpreis, Offline-Anteil), sonst nimmt die Auto sie nie. Zeitabhängige Faktoren (Geduldig) bewertet man mit dem vollen Faktor (`g.mutRef`), sonst sieht eine Karte direkt nach einer Replikation schlecht aus.
- **Offline-Effekte brauchen ein Flag der Engine** (`game.offlineNow`, gesetzt in `runtime.simulateOffline`): Nachtschwärmer x1,5 offline / x0,9 online. Der Auto-Wert nimmt einen angenommenen Offline-Anteil (60 %); ein aktiver Sim-Spieler verliert also 10 %.
- **Story-Lücken schließt man mit Ketten, nicht mit Zeit-Füllern:** Je Angebot ein kurzer Eintrag 12 min nach dem Ziehen (der nächste erst, wenn der vorige da ist), dazu ein Bericht je Mutation. Ergebnis: größte Lücke bis zum 10. Sektor 17 min (vorher 2 h 45), kein Abstand unter einer Minute (`calm`).
- **Playwright-Screenshots:** Story-Modale aus dem Test heraus nicht per Klick wegklicken (Mehrseiten-Dialoge laden nach), sondern `chronicle.shown` setzen und das Overlay entfernen; Toasts brauchen ~4,5 s, bis sie verschwinden. `fullPage`-Screenshots zeigen die sticky Kopfzeile mitten im Bild (Artefakt).

## Nachtrag: Mutationen-Rebalance (Replikator Akt II)
- **Produktionsfaktoren verpuffen hinter Softcaps im späten Spiel – Effekte dort ansetzen, wo der Fortschritt begrenzt ist.** Vorher: Hyperaktiv x2,5 und die Gewinn-Faktoren bewegten Sternsysteme/Quantenkerne um < 0,2 Dekaden und 10 Sektoren um < 6 % (Gewinn-Faktoren vor dem Softcap werden zur Wurzel). Fortschritt begrenzt hier: die Reisezeit der Erschließung (~133 von ~136-176 min bis zum 10. Sektor), dann Sektorpreise.
  Darum: Gewinn-Faktoren nach dem Softcap (`layer.postMult`, in `repObjective` voll gezählt), Erschließungsdauer/Sektorpreis als Nutzen oder Haken, stärkere Zahlen. Gemessen mit `tools/mutations-replikator.mjs` (Tabelle in `docs/replikator-akt2.md`). Reine Wirtschaftskarten bringen bei `dt10` nur ~-5 % (Reise-Boden), sind aber in den Gewinn-Dekaden sichtbar (+0,4 bis +1,1); Erschließungs-Haken (x1,1-x1,25) kosten 7-16 %.
- **Gewinn-Faktoren > 1 nach dem Softcap müssen mit der Laufzeit reifen**, sonst kippt das Laufdauer-Optimum bei gestapelten Karten auf 2 min (mehr Kerne je Lauf füttern die Produktion schneller, als ein langer Lauf einbringt): `ripen()` in `mutations.js` (Sternsysteme 5 min, Quantenkerne 30 min, linear), Haken < 1 wirken sofort, die Auto-Bewertung sieht den vollen Faktor. 15 % Reife genügten nicht (Optimum 20 min), 30 min stellte es auf 30 min.
- **Karten-Wert der Auto-Genom schwankt weiter mit dem Zeitpunkt** (Sparsam/Bündelfieber/Gigantismus/Mosaik: Standardabweichung 0,3-0,7 Dekaden über einen Lauf, weil `matterStrength` von den gekauften Stufen abhängt; Gewinn-/Reise-Karten sind stabil). Nicht behoben (bräuchte einen Zeit-Mittelwert über den Lauf); Folge: die Sim nimmt fast immer Bündelfieber und Geduldig. Bei Bedarf glätten, indem Bündel-/Kosteneffekte mit einer festen Stufenzahl bewertet werden.
- **Sektor-Preisstufe ist ein steiler Hebel:** `mapCostStep` 0,27 -> 0,33 macht aus 136 min >240 min (Preis statt Reise begrenzt, Streuung pro Seed 114-321 min). Für Mutations-Gefühl deshalb nicht an den Preisen drehen, sondern an der Reisedauer.

## Nachtrag: Replikator Paket 4 (Sondenbefehle, Anomalien), gemessen mit `tools/commands-replikator.mjs`, `tools/anomalies-replikator.mjs`
- **Auch die Kartenboni fraßen die Softcaps.** Sektor-Gewinnboni im Layer-`mult` wurden zur Wurzel; nach dem Softcap (`postMult`, mit Reifung wie die Mutationen) sind Sternsysteme in 4 h ~ +1 Dekade, Quantenkerne +0,3, und kurze Expansions-Läufe verlieren (2-min-Lauf 85 % -> 33 % des Optimums). Regel: **jeder Gewinnfaktor gehört nach den Softcap und reift mit der Laufzeit.** Das Bewertungs-Flag `g.mutRef` gilt jetzt auch in `repObjective`.
- **Jeder neue Effekt wurde dort angesetzt, wo Akt II begrenzt ist:** Reisezeit (Übertakten x3, Tiefenscan -30 %, Gezeitenwelle x3, Zeitriss 10 min: je -15 bis -40 % bis zum 10. Sektor), Gewinne nach dem Softcap, Sternsysteme/Preise, Angebote. Produktion x2 wäre wieder verpufft und kam gar nicht erst vor.
- **Sonnenwind-Ernte mit 1 x Expansion hob die Sternsysteme (+0,43 Dekaden), aber die Quantenkerne kaum (+0,05):** Singularitäts-Formel (Wurzel, dann Softcap-Exponent 0,4) frisst den Rest. Mit 2 x +0,64 / +0,08 gemessen (Quantenkerne +0,17 allein bei 3,5 h Einzelmessung), erst dann spürbar. Einen Effekt auf eine **Zwischenwährung** immer bis zur Währung messen, die zählt.
- **Mit Beschleunigern begrenzen Preise.** Ohne Befehle ist die Reisezeit die Drossel (133 min bis zum 10. Sektor), mit allen Befehlen ~88 min; dort bremsen ab Sektor 8 die Sternsysteme. Zeitriss/Gezeitenwelle sparen deshalb im Mittel 3,4-3,6 statt der möglichen 10 min je Start.
- **Engine-Fehler, den erst die Offline-Rechnung zeigt:** `Game.tick` zählte Zauber NACH den Autos herunter, ein Auto-Cast verlor also `dt` im Cast-Tick. Online (0,05 s) unsichtbar, offline mit Schritten von 19-115 s ging die ganze Wirkung verloren. Jetzt: erst herunterzählen, dann Autos. Zeitlimitierte Effekte brauchen `spellFrac(id, dt)` (zeitgewichtet), nie `spellActive`.
- **Auto-Cast ohne Verschwendung:** `spell.autoWhen(g)` (Engine, optional). Ein Auto, das Tiefenscan ohne laufende Erschließung wirkt, verbrennt 30 min Abklingzeit. Manuelles Wirken bleibt unblockiert.
- **Ein Zeitsprung gehört nicht auf die Uhr des Sim-Spielers.** Erste Fassung der Sim zählte die 10 Minuten des Zeitrisses als verbrauchte Spielerzeit und maß +8 % (langsamer!); die Spielerzeit (`t`) darf sich nicht bewegen, nur `time.played`. Bei jedem „Zeit überspringen“ prüfen, welche Uhr die Messung benutzt.
- **Anomalie-Sektoren wären nie erschlossen worden:** Die Auto-Erkundung wählt nach `repObjective`, ein Sektor mit Produktion x1,1 liegt dabei hinten (Sektor 11-12). Ein Sektor, der ein Ereignis auslöst, braucht eigenen Wert im Ziel (`anoSectorW`), sonst kommt das Feature erst nach dem Ende des Abschnitts.
- **Beutel statt Würfel:** Anomalien ziehen aus einem gemischten Beutel (jeder Typ einmal pro Runde, Runde 1 fest: Gezeitenwelle, Signalfragment, Zeitriss). Mit reinem RNG hätten Signalfragmente (Story) in den ersten 2 h fehlen können. Nicht zulässige Typen bleiben im Beutel, damit sie nicht aus der Runde fallen.
- **Zusätzliche Angebote** (Strahl, Spiegel) laufen über die normale Warteschlange; die Seltenheits-Garantie hängt an der **Nummer** des später gezogenen Angebots (`mut.rare[n]`), nicht an dem, das gerade auf dem Tisch liegt.
- **Story-Tests mit künstlichem Spielstand:** `calm` (eine Minute Abstand) und die Karten-/Genom-Ketten schieben Einträge um Minuten nach hinten: in Unit-Tests 1200 s vorspulen, bevor man auf einen Chronik-Eintrag prüft.
- **Vorbestehend, nicht von Paket 4:** Im Spielzustand nach 10 Sektoren (echter Spielstand, auch im Commit davor gemessen) ist ein 2-min-Singularitätslauf das Optimum (Quantenkerne/s, wenn das Warten auf Sektoren aus ist); in den v1-Phasen nicht. Vor Paket 5 (Saatkerne aus Quantenkernen) prüfen.

## Nachtrag: Folgearbeiten nach Paket 4 (Laufdauer Akt II, Pacing, Offline)
- **Mikro-Läufe tauchen erst im späten Spielzustand auf.** Die v1-Phasen (`sing1`) zeigten ein Singularitäts-Optimum von 15-30 min, im Zustand nach Akt-II-Beginn (echter Spielstand UND frischer Abschluss, 0/5/10 Sektoren) war es 2 min: Der Softcap pro Lauf wird dort sofort erreicht. Immer auch die **spätesten Spielzustände** messen (`takeAct2Snapshots`), nicht nur die Phasen, in denen man gebaut hat. Fix: Reife-Faktor nach dem Softcap (`singRipe`, 900 s, Exponent 2: Exponent 1,5 ließ 2-min-Läufe noch bei 24-49 %), nur in Akt II, damit v1-Pacing und Story unberührt bleiben (ein globaler Faktor schob die Story-Lücken über 25 min).
- **Mit „Warten auf den nächsten Sektor“ an misst ein festes Laufdauer-Experiment die Karte, nicht die Laufdauer** (ein 2-min-Lauf wartet, bis der Sektor bezahlt ist): Optimum prüfen, Prozentwerte der kurzen Läufe nur mit Warten aus.
- **Quantenkerne im Zeitfenster sind klumpig**, sobald Läufe 1-2 h dauern: Messungen von Nebenwirkungen auf Quantenkerne brauchen lange Fenster oder den Gewinn im selben Zustand (`refGain`).
- **Pacing-Tests gehören in den Spielzustand, wie gespielt wird** (mit Befehlen, Anomalien, Mutationen). Ein neues Beschleuniger-Paket verschiebt das Ziel: Reisezeit 240 -> 360 s, statt die Grenzen zu weiten.
- **Offline-Spieler (97 % offline) braucht Ketten:** mit nur einer Erschließung gleichzeitig und Auto-Erkundung ab 6 Sektoren dauerten 10 Sektoren 3 Tage (1 Sektor pro Besuch alle 8 h). Die Auto früher freizuschalten (2 Sektoren, startet aus) macht daraus 19 h. Das Szenario `--offline --fixture` muss neue Autos nach dem Hinweis einschalten, sonst misst man einen Spieler, der den Hinweis ignoriert.


## Nachtrag: Replikator Paket 5 (Galaxiensprung), gemessen mit `tools/simulate.mjs --act2 --hours 24`, `tools/runlength-replikator.mjs`

- **Vorbedingungen, die der Sprung selbst zerstört, nie als Story-/Archiv-Auslöser nutzen.** `galaxyComplete` ist im selben Tick wieder falsch, in dem der Spieler (oder die Auto) springt; die Story-Bedingung `jump_open` las sie und kam erst zwei Galaxien später. Immer den dauerhaften Marker (Archiv) lesen.
- **Freischaltungen an Sektorzahlen müssen den Rekord lesen, nicht die aktuelle Karte** (`gal.best`): sonst sperrt der Sprung Auto-Erkundung, Auto-Befehl, Auto-Genom und die Genom-Plätze wieder zu. Ebenso Zähler aus der alten Karte (`ano.srcSeen`) beim Sprung nullen.
- **Saatkern-Gewinn aus einem Zähler, der pro Galaxie um drei Dekaden streut** (Quantenkerne: 190 bis 920 K, je nach Typ und Genom) braucht einen kleinen Exponenten (0,25) und eine niedrige Schwelle; mit 0,4 gab es 1 bis 38 Saatkerne pro Sprung. Fixture (5e4) und frischer Abschluss (1e4) liegen dann 1,5x auseinander.
- **Meilenstein-„Behalten“-Regeln gelten für ihre Ebene, nicht für höhere** (`L >= 2` ließ den Sprung alles behalten): Obergrenze setzen, den Sprung über Upgrades behalten lassen. Das macht die Wahl der Saatkern-Upgrades zur eigentlichen Entscheidung.
- **Die Reisezeit bleibt die Drossel** (10 Sektoren >= 1,5 h), also hängt die Galaxie-Dauer an `galTripBase` (x1,6 ab Galaxie 2), den Upgrades und dem Archiv, nicht an der Wirtschaft. Mit x1,3 lag das Akt-II-Ende bei 11,5 h, mit x1,6 bei 12,9 h (Ziel 12-18).
- **Auto-Sperren, die den Anlauf einer Regel erzwingen, bestrafen den Offline-Spieler** (Quasar: Generator-Autos erst nach 3 Expansionen -> ohne Generatoren gibt es keine Expansion -> 4-15 h Stillstand bis zum nächsten Besuch). Zeit-Rückfall (20 min) einbauen und im Offline-Szenario nachmessen.
- **Zeitabhängige Faktoren (Kollisionszone) über den Tick mitteln**, nicht am Tick-Ende abtasten: `game.tickDt` + Mittel über das Intervall; Test vergleicht einen 58-s-Schritt mit 0,1-s-Schritten.
- **Start-Geschenke (Kernsaat/Sternensaat) wirken sofort beim Kauf** (`upgrade.onBuy`) und bei jedem Sprung; sonst kaufte der Spieler sie nach dem Sprung und sah erst eine Galaxie später etwas.
- **Test-Fallen:** `canPrestige('jump')` ist falsch, solange eine Challenge läuft (`auto_chal` startet sie mit den gesetzten Meilensteinen); Tests, die bis „10 Sektoren“ laufen, dürfen den Sim-Sprung nicht einschalten (`jump:false` ist Standard), sonst ist die Bedingung im selben Tick wieder weg.

## Nachtrag: Replikator Akt II als Ganzes (Paket 6), gemessen mit `tools/simulate.mjs --act2`, `tools/ending-replikator.mjs`, `tools/story-replikator.mjs --act2 --end`
- **Ein Bonus auf einer reisezeitbegrenzten Karte muss die Reisezeit oder die Zahl der Sektoren treffen.** Abgrenzen mit Gewinn ×1,5 und Reise ×0,8 brachte nur -12 % Galaxie-Zeit, mit Reise ×0,6 und Gewinn ×2 -29 %. Die Enden messen, indem man sie von Anfang an erzwingt (`runSim({ endForce })`) und die Galaxien vergleicht; Streuung durch Galaxientypen ±10 %, also mehrere Seeds und Summen über 4 Galaxien.
- **Freie Felder sind stärker als ihr Preis aussieht:** Zählen sie nicht für Preis und Reisezeit der nächsten Sektoren, spart Verschmelzen 57 % (Gewinn dort, wo der Zeitbedarf exponentiell wächst), zählen sie voll, 38 %. Immer die Staffel (`mapTripGrow^n`) mitrechnen, nicht die Zahl der Sektoren.
- **Erzählbogen über viele Stunden: eine Kette statt Zeitpunkte.** Jeder Eintrag wartet auf den vorigen, auf seine Galaxie-Nummer und auf Abstand zur letzten Meldung; so bleibt die Reihenfolge bei langen und kurzen Galaxien. Füller, die einen späteren Auftritt vorbereiten (Wartung bittet um Aufgaben, das Echo hat niemanden, der Funksprüche ablegt), tragen die Auflösung und füllen zugleich Lücken. Messung der Story-Zeit nie mit der Sim-Uhr: Zeitrisse verschieben die Spielzeit (`played`) gegenüber der Sim-Zeit um 10 min je Start.
- **Entscheidungen mit Dialog gehören in den Spielstand, nicht ins UI:** Der Zustand "alle sechs Typen, noch kein Ende" ist die Bedingung; der Dialog wartet auf die Geschichte davor und auf andere Dialoge. Auto-Sprung und Sim halten an (`hold`), sonst springt man an der Entscheidung vorbei.
- **Spielstand-Ordnung bei neuen Mutationen:** Karten, die erst nach einem Story-Ereignis erscheinen dürfen, brauchen einen Filter in der Ziehung (`available(g)`), auch bei Extra-Angeboten (Strahl, Spiegel); dann bleiben alte Seeds vor dem Ereignis unverändert.
- **Der Sprung wartet bis 30 min auf Quantenkerne** (Saatkern-Gewinn >= 1 braucht 4 Quantenkerne dieser Galaxie): ein toter Abschnitt zwischen Archiv und Sprung, den die Story-Füller überbrücken müssen. Besser eine Auto-Singularität, die das fördert, falls es Spieler stört.
- **Akt II insgesamt:** Ende 12,4 h aktiv (frisch), 13,2 h (Datei), idle 1,1x, offline 2 Tage; Laufdauer-Optimum in allen Ebenen >= 10 min. Wiederkehrende Ursache für unbrauchbare Boni: Produktionsfaktoren verpuffen hinter Softcaps, wirksam sind Reisezeit, Zahl der Sektoren und Gewinne nach dem Softcap.
- **Engine:** `lc.short` + Icon für die Segmente des gefalteten Ebenen-Tabs (4 volle Namen passen bei 360 px nicht), `layer.unavailableText` im Prestige-Panel (die Basis-Bedingung ist nicht die Hauptzeile, wenn die Ebene aus anderem Grund zu ist), `chronicle.castInfo` für Rolle/Bio, die sich mit der Story ändern.
