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
- **Persönliche Easter Eggs** (Geschenk-Spiele): sparsam, ein bis zwei Zeilen, dort, wo sie zum Thema passen. Die Überraschung gehört ans Ende, nicht als Popup beim Start.

## Bilder und Figuren

- **Private Fotos nie ins Repo** (öffentlich). Nur stilisierte, KI-generierte Portraits, mit Einverständnis der Abgebildeten.
- **Bild-KI-Prompts:**
  - Stil zuerst festlegen, die Referenz nur für Merkmale nutzen („do not edit or reuse the photo“).
  - Die Gewichtung der Referenz senken, sonst kommt das Foto 1:1 zurück.
  - Altersstufen aus dem fertigen Bild ableiten, nicht aus dem Foto.
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
