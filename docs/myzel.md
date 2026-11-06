# Myzel – Das Netz unter dem Wald (Spezifikation)

Drittes Inkrementalspiel. Stil: **Prestige Tree** (ein Baum aus Prestige-Ebenen, jede mit eigener Währung, Upgrade-Raster,
Meilensteinen), aber für das Handy gebaut. Thema: ein Pilzgeflecht wächst von der Oberfläche in die Tiefe und verbindet am Ende den Wald.
id `myzel`, Ordner `games/myzel/`. Vorher `docs/LESSONS.md` lesen, alle Regeln dort gelten.

## Rahmen des Besitzers (nicht verhandelbar)
1. **Offline-Grenze fest 3 h.** Nicht einstellbar (Einstellung im UI für dieses Spiel ausblenden, `offlineCapSeconds` fest), keine Upgrades, die sie erhöhen.
   Innerhalb der 3 h läuft alles mit voller Rate inkl. Autos. Die Offline-Zusammenfassung sagt ehrlich: „7 h weg, 3 h gewachsen“.
2. **Mehrere Tage Inhalt**: Ende nach **5–7 Kalendertagen** im Szenario „Pendler“ (unten).
3. **Immer das Gefühl von Fortschritt**: messbar gemacht, siehe Fortschritts-Metrik. Keine Wände.
4. **Echte Weggabelungen** mit Folgen, später umwählbar (Respec).
5. Spielrhythmus des Besitzers: **5–10 Mal am Tag kurz reinschauen (2–5 min)**. Jeder Besuch muss etwas zu tun bieten.

## Leitplanken (aus LESSONS.md, hier konkret)
- Laufdauer pro Ebene messen (Werkzeug wie `tools/runlength-replikator.mjs`), Reife-Faktor `layer.postMult` statt Softcap pro Lauf, falls Mikro-Läufe optimal werden.
- Effekte dort ansetzen, wo der Fortschritt begrenzt ist; jede Wirkung bis zur Währung messen, die zählt.
- Spiel und Sim nutzen dieselbe Kauf-/Auto-Logik (`upgBuyBest` mit einem Objective, eigene Terme für Upgrades ohne Einkommenseffekt).
- Neue Autos starten **aus**, Schalter dort, wo sie wirken, einmaliger Hinweis (`engine/ui/auto-hints.js`).
- Deterministische Sim (fester Zeitschritt, Seed-RNG `engine/kit/rng.js`), Pacing-Tests als Deploy-Sperre.
- Kurz-Export (`exportString({short:true})`) in „Mehr“ anbieten.

## Die Ebenen (Baum, oben = Oberfläche, unten = Tiefe)
Zeile = Prestige-Tiefe. Prestige einer Ebene in Zeile r setzt alle Ebenen mit Zeile < r zurück (außer Meilensteine/Upgrades behalten es).
Zwei Ebenen können in derselben Zeile liegen (Gabel) – die Engine muss das können (Layer-Index = Zeile, Identität = id).

| Zeile | id | Name | Typ | Rolle |
|---|---|---|---|---|
| 0 | `n` | Nährstoffe | Grundwährung | wird produziert (Start 1/s), kein Generator-Kettensystem wie Replikator |
| 1 | `h` | Hyphen | normal (`gain = (N/req)^exp`) | erstes Prestige, 3×3 Upgrade-Raster, PT-typische Formeln („N ×f(H)“, „H ×f(N)“) |
| 2 | `s` | **Sporen** | statisch (jede Einheit kostet `base·grow^n` N, Gewinn = 1 je Tap bzw. so viele wie bezahlbar) | **Gabel A**, aktiv: starker Multiplikator je Spore, billiger Reset |
| 2 | `m` | **Mykorrhiza** | statisch | **Gabel A**, idle: jede Einheit erzeugt Zucker über die Zeit, Zucker gibt N-Multiplikator (wächst auch offline, also bis zur Grenze) |
| 3 | `f` | Fruchtkörper | normal aus H (verlangt S oder M) | Challenges (z. B. Dürre: N-Produktion ^0,5; Frost: keine H-Upgrades; Kahlschlag: Gabel A aus), Meilensteine automatisieren H |
| 4 | `l` | **Flechte** | normal aus F | **Gabel B**: wiederholbare Käufe (Buyables „Alge“, „Licht“) |
| 4 | `z` | **Fäulnis** | normal aus F | **Gabel B**: Opfer-Mechanik („Zersetzen“ wandelt S/M/F in Humus mit Multiplikator) |
| 5 | `w` | Waldnetz | normal aus F + Gabel B | Bäume verbinden (Buyables mit je eigener Wirkung). Meilensteine schalten den **zweiten Ast** beider Gabeln frei |
| 6 | `r` | Hexenring | statisch aus W | 5 Ringe = Ende („der Ring schließt sich“), danach Nachspiel (Zahlen laufen weiter) |

**Gabeln:** In Zeile 2 und 4 wählt man einen Ast (Dialog mit kurzer Beschreibung beider). Der andere Ast ist bis zum passenden Waldnetz-Meilenstein gesperrt,
dann spielbar und zum Gewählten synergistisch (so sieht der Spieler allen Inhalt, die Wahl prägt aber die ersten Tage).
**Respec**: jederzeit über den Knoten, Bestätigung, kostet: Ast-Ebene samt Upgrades auf 0 und ein Reset der Zeile darüber. Beide Äste müssen im Pendler-Szenario
in ähnlicher Zeit ans Ende kommen (Verhältnis ≤ 1,25), Sim mit beiden Wahlen.
Zusätzlich in jeder Ebene 1–2 **exklusive Upgrade-Paare** (`excl`), umwählbar beim nächsten Prestige dieser Ebene.

**Aktive Mechanik für kurze Besuche: Regenschauer.** Ladung +1 je 45 min Spielzeit (online und offline innerhalb der Grenze), max. 3. Antippen = 3 min Wachstumsschub.
Wird nie automatisch ausgelöst. Die Wirkung so ansetzen, dass ein Schauer pro Besuch messbar etwas bringt (Zeit bis zum nächsten Kauf/Unlock), nicht nur N/s, das hinter Exponenten verpufft.
Später (Meilenstein) wächst die Ladungsgrenze nicht – stattdessen stärkere Schauer. Der Schauer ist Bonus, nie Pflicht: das Pendler-Szenario ohne Schauer darf höchstens 15 % langsamer sein.

## Pacing-Ziele (gemessen in der Sim)
Szenarien in `tools/simulate-myzel.mjs`:
- `--active`: dauernd spielend (zeigt die reine Spielzeit-Länge).
- `--pendler` (Hauptszenario, Seed): Tag 7:00–23:00, Besuche alle 60–150 min (Seed), je 3 min aktiv (kauft, prestigt, tippt Schauer, schaltet neue Autos nach dem Hinweis ein); Nacht 8 h; Offline dazwischen über den echten `runtime.simulateOffline`-Pfad (mit 3-h-Grenze).
- `--selten`: alle 8 h ein Besuch (zur Info, kein Ziel, darf aber nie völlig stehen bleiben).

Ziele Pendler (Kalenderzeit seit Start):
- erste Hyphen im ersten Besuch (≤ 4 min), Gabel A am ersten Tag, Fruchtkörper Tag 2, Gabel B Tag 3, Waldnetz Tag 4, erster Hexenring Tag 5, **Ende Tag 5–7**.
- Je Ebene: Laufdauer-Optimum gemessen und dokumentiert, unterste Ebene 2–4 min bzw. automatisiert.

**Fortschritts-Metrik** (Pendler, Test): Ein Besuch zählt als „mit Fortschritt“, wenn etwas Neues passiert (Upgrade, Buyable, Meilenstein, neue Ebene, Challenge, Prestige mit ≥ 10 % mehr Bestand der Ebene).
- ≥ 90 % der Besuche mit Fortschritt,
- nie 3 Besuche in Folge ohne etwas *Neues* (neues Upgrade/Meilenstein/Ebene/Challenge),
- auch der erste Besuch nach der Nacht hat Fortschritt.

## Mobile UI
- Tab **Netz** = der Baum als SVG: Knoten (≥ 56 px) zeilenweise von oben nach unten, Hyphen-Linien als Verbindungen. Knoten zeigt Kürzel und Bestand (kompakt),
  Ring-Glühen = Prestige möglich, Punkt = kaufbares Upgrade. Gesperrte Knoten als schwache Silhouette mit „?“ (Vorfreude). Gabeln sichtbar als zwei Knoten nebeneinander.
- Antippen eines Knotens = Ebenen-Ansicht (Vollbild-Panel, Zurück oben links, Wischgeste optional): Bestand, Rate bzw. „nächste bei“, Upgrade-Karten zweispaltig (360 px!),
  jede Karte mit Name, Wirkung, **„Aktuell ×3,4“**, Kosten, Zustand. Meilensteine, Challenges, Buyables (holdRepeat). Prestige-Button einzeilig, unten in Daumenreichweite (sticky, deckender Hintergrund).
- Kopfzeile ≤ 15 %: Nährstoffe + /s, Regenschauer-Ladungen (Antippen = auslösen).
- Tabs: Netz, Chronik (Paket 3), Mehr (Statistik, Einstellungen ohne Offline-Regler, Export/Import inkl. Kurz-Export).
- Eigenes Farbthema (Waldboden dunkel, Myzel weiß-cremig, Akzent Biolumineszenz-Grün), eigenes Manifest (`id`, `start_url`, `scope`), Icons, Eintrag in `games.json` erst bei Livegang.
- Prüfen mit Playwright bei 390×844 und 360×740, Screenshots ansehen.

## Story (Paket 3)
Leichte Chronik wie Replikator (Engine `def.chronicle`), Ton trocken-humorvoll mit leiser Melancholie, Stimmen-Bibel zuerst (`games/myzel/STIMMEN.md`), Namen nur in `characters.js`.
Taktung in Besuchen statt Minuten: etwa ein Eintrag je ein bis zwei Besuche, Ketten statt Zeitpunkte.

## Pakete
1. **Fundament + Tage 1–2**: Engine-Erweiterungen (statische Ebenen, zwei Ebenen pro Zeile, feste Offline-Grenze, Gabel-Wahl/Respec, Regenschauer), Ebenen n, h, s|m, f (mit Challenges),
   Netz-UI + Ebenen-Ansicht, Sim mit drei Szenarien, Pacing- und Fortschritts-Tests für den vorhandenen Inhalt, Laufdauer-Messung. Spielbar, Inhalt reicht ~2 Tage.
2. **Tiefe**: l|z, w, r, zweiter Ast, Ende + Nachspiel, Pacing bis Tag 5–7, beide Gabel-Wahlen gemessen.
3. **Chronik + Feinschliff**: Stimmen, Story, Icons, Hub-Eintrag, LESSONS-Nachtrag.

## Umsetzung Paket 1: Entscheidungen und Abweichungen
Was beim Bauen festgelegt werden musste (die Spezifikation oben bleibt die Quelle der Wahrheit; hier steht, wo sie offen war oder angepasst wurde):
- **Nährstoffe sind reines Einkommen** (`def.income`, 1/s am Start, nie ausgegeben). Hyphen-Upgrades kosten Hyphen, Sporen-Upgrades Sporen, Mykorrhiza-Upgrades Zucker, Fruchtkörper-Upgrades Fruchtkörper (jede Währung hat ihren eigenen Autokauf `buyNode`).
- **Statische Ebenen (Sporen, Mykorrhiza):** Kosten der Einheit k = `base · grow^(k^exp)` in **Nährstoffen gesamt seit dem letzten Reset der Zeile** (`state.myz.nAt`), nicht in den Nährstoffen "in der Hand". Grund: Eine Hyphen-Ausbreitung setzt die Nährstoffe auf 0; mit "in der Hand" müsste jede Einheit in einem einzigen Hyphen-Lauf erreicht werden und widerspräche dem Ausbreiten. Die Wahl der Gabel setzt die Basis zurück (kein Windfall von 3-5 Einheiten beim ersten Mal). Gewinn = so viele Einheiten wie bezahlbar ("max"-Modus). Die Einheiten werden nicht ausgegeben: Upgrades kosten Sporen (Vorrat), Kostenskala und Wirkung hängen an den Einheiten.
- **Wirkung der Sporen:** Nährstoffe × `(1 + a·Sporen)^pow` statt `per^Sporen`. Die exponentielle Form explodierte in der Sim mit den Resets darüber (49 Einheiten, 1e50 Nährstoffe/s nach 3 Tagen).
- **Mykorrhiza:** Zucker/s = `zPer · Einheiten · (Nährstoffe ohne Zucker und Schauer)^zRateExp`, Nährstoffe × `(1 + Zucker gesamt)^zExp`. Zucker wird von einem Reset der Zeile 3 (Fruchtkörper) gelöscht, nicht von Hyphen oder Mykorrhiza.
- **Meilensteine "Behalte …" der Äste** wirken ab dem **nächsten** Reset (der Reset, der die Einheit bringt, hat noch nichts behalten); die Texte sagen das ("ab dem nächsten Mal"). Die Hyphen-Upgrades überstehen einen Fruchtkörper IMMER (sonst wäre die erste Challenge ein Neustart bei null), die Upgrades der Äste ab 4 Fruchtkörpern (`f_keepb`).
- **Fruchtkörper:** Basis = Hyphen, die seit dem letzten Fruchtkörper verdient wurden (`state.myz.hAtF`); verlangt `fUnits` Sporen oder Mykorrhiza. **Er braucht Zeit:** der Lauf muss mindestens `fMinRun` alt sein (6 h Spielzeit, der erste `fMinRun1` = 20 h) und der Gewinn reift (`ripeF` 8 h, der erste 30 h). Grund: Die Wirtschaft wächst nach dem ersten Fruchtkörper um Größenordnungen je Lauf, ein rein zahlenbasiertes Tor (Hyphen >= Schwelle) lag je nach Besuchsplan zwischen 11 und 26 h (Sporen) und machte aus "Fruchtkörper am Tag 2" ein Glücksspiel. Mit dem Zeittor ist der Zeitpunkt unabhängig vom Besuchsplan (Tag 2 bei allen 10 gemessenen Fällen).
- **Challenges** sind Zeit-Umwege mit einem Hyphen-Ziel: durchhalten (`chTime` 2,5 h / 2 h / 2 h Spielzeit) UND `chS · hRef` Hyphen verdienen (hRef = hyphen je reife Ausbreitung zum Zeitpunkt des letzten Fruchtkörpers). Ein reines Hyphen-Ziel war Wand für die Schwachen und Geschenk für die Starken (Größenordnungen Unterschied zwischen zwei Fruchtkörpern); die Zeit macht die Dauer vorhersehbar. Dürre staucht nur den **Kern** der Nährstoff-Produktion (Hyphen, Upgrades, Fruchtkörper), nicht die Äste; sonst verhungert der aktive Ast. Frost friert die Hyphen-Upgrades ein, Kahlschlag lässt Sporen/Mykorrhiza ruhen. Aufgeben ist jederzeit möglich. Der Bot startet die nächste Challenge direkt nach einem Fruchtkörper.
- **Exklusive Paare** (`h31a|h31b`, `s22a|s22b`, `m22a|m22b`, `f22a|f22b`): umwählbar, sobald die Ebene seit dem Kauf einmal prestigt wurde (Erstattung 100 %, `upgRechoose`).
- **Regenschauer:** Antippen addiert 180 s Schauer (Nährstoffe und Zucker ×`rainMult` 8); mehrere Schauer addieren ihre Zeit, die Wirkung läuft auch nach dem Besuch weiter (offline). Ladung +1 je 45 min Spielzeit (online wie offline), höchstens 3, Start mit einer. Meilenstein "Wolkenbruch" (3 Fruchtkörper) macht sie stärker (×10), die Grenze wächst nie.
- **Netz-Ansicht:** Zeilen 4-6 (`l|z`, `w`, `r`) sind Silhouetten mit "?" (Vorfreude), das Gabel-B-Paar steht schon als "oder" im Baum.
- **Nicht in Paket 1:** Buyables (kommen mit Flechte/Waldnetz), zweiter Ast der Gabeln (`forkSecondOpen` ist in der Engine, wird von Paket 2 über `secondWhen` angeschlossen), Chronik, Hub-Eintrag.

## Messungen Paket 1
Alles mit den Werten aus `games/myzel/tune.js`, deterministisch (fester Zeitschritt, Seed-Besuchsplan). Neu erzeugen: `node tools/simulate-myzel.mjs --pendler --fork s|m [--seed N] [--no-rain] [--verbose]`, `--active`, `--selten`, `node tools/runlength-myzel.mjs`. Zeiten = Kalenderzeit seit dem Start (Tag 1 beginnt 7:00; ab 23:00 acht Stunden Nacht, davon zählen 3 h). Die Pacing-Tests (`tests/sim-myzel-*.test.mjs`) laufen mit den Seeds 1-3.

### Pendler: Zeitpunkte je Gabel und Seed
Besuch alle 60-150 min (Seed), je 3 min Spiel, Nacht 8 h, Offline über den echten Pfad mit der 3-h-Grenze, Regenschauer an. "Inhalt komplett" = alle Meilensteine (inkl. Ast bis 9 Sporen bzw. 6 Mykorrhiza und 4 Fruchtkörper), alle drei Challenges, alle Upgrades von Hyphen, gewähltem Ast und Fruchtkörpern.

| Gabel | Seed | 1. Hyphen | Gabel gewählt | 1. Einheit | Fruchtkörper-Ebene | 1. Fruchtkörper | Dürre | Frost | Kahlschlag | Inhalt komplett | Besuche | mit Fortschritt | längste Folge ohne Neues |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| s | 1 | 120 s | 07:25 | 07:26 | 15:30 | 1d 02:04 | 1d 04:34 | 1d 10:10 | 2d 02:06 | 2d 08:27 | 25 | 23 (92 %) | 1 |
| s | 2 | 120 s | 07:00 | 07:01 | 14:45 | 1d 03:37 | 1d 06:07 | 1d 12:55 | 2d 02:00 | 2d 07:14 | 24 | 23 (96 %) | 1 |
| s | 3 | 120 s | 06:07 | 06:08 | 13:09 | 1d 03:21 | 1d 05:51 | 1d 11:45 | 2d 02:11 | 2d 09:21 | 25 | 24 (96 %) | 2 |
| s | 4 | 120 s | 04:02 | 05:23 | 07:57 | 1d 01:52 | 1d 04:22 | 1d 10:32 | 2d 02:19 | 2d 09:54 | 24 | 23 (96 %) | 2 |
| s | 5 | 120 s | 05:42 | 07:39 | 07:39 | 1d 04:27 | 1d 06:57 | 1d 14:27 | 2d 02:15 | 2d 07:51 | 24 | 23 (96 %) | 1 |
| m | 1 | 120 s | 07:25 | 07:25 | 1d 02:04 | 1d 02:04 | 1d 04:34 | 1d 10:10 | 2d 02:06 | 2d 06:12 | 24 | 22 (92 %) | 1 |
| m | 2 | 120 s | 07:00 | 07:00 | 1d 02:16 | 1d 02:16 | 1d 04:46 | 1d 11:31 | 2d 02:00 | 2d 06:11 | 23 | 22 (96 %) | 2 |
| m | 3 | 120 s | 06:07 | 06:07 | 1d 00:04 | 1d 03:21 | 1d 07:22 | 1d 13:22 | 2d 02:11 | 2d 07:50 | 24 | 23 (96 %) | 2 |
| m | 4 | 120 s | 04:02 | 04:02 | 15:26 | 1d 01:52 | 1d 06:23 | 1d 10:35 | 2d 02:19 | 2d 08:27 | 23 | 22 (96 %) | 2 |
| m | 5 | 120 s | 05:42 | 05:42 | 1d 00:04 | 1d 04:27 | 1d 07:34 | 1d 22:19 | 2d 02:15 | 2d 06:24 | 23 | 22 (96 %) | 1 |

- **Ziele erfüllt (alle 10 Fälle, nicht nur die getesteten Seeds 1-3):** erste Hyphen nach 120 s im ersten Besuch (Ziel <= 4 min), Gabel auf Tag 1 (4-8 h), erste Einheit gleich danach, erster Fruchtkörper auf Tag 2 (24-29 h), Dürre 2,5 h später, Frost und Kahlschlag am Tag 2 bis in die Nacht, Inhalt komplett nach **2 Tagen und 6-10 Stunden** (54-58 h Kalenderzeit, rund 44 h Spielzeit). Etwas länger als die "~2 Tage" der Spezifikation, weil der letzte Fruchtkörper (Meilenstein 4) 3 × 6 h Reife nach dem ersten kommt; Paket 2 setzt dort an.
- **Verhältnis der Gabeln** bei "Inhalt komplett": 1,02-1,04 (Ziel <= 1,25). Beide Äste landen praktisch gleichzeitig, weil die späte Phase von den Zeittoren des Fruchtkörpers getaktet wird; vorher ist Mykorrhiza stabiler gegen den Besuchsplan, Sporen belohnen häufige Besuche (Sporen-Einheit 5 nach 7:39 bis 15:30 je nach Seed, Mykorrhiza erst am Tag 2).
- **Fortschritts-Metrik** (Besuche mit Neuem: Upgrade, Meilenstein, Ebene, Challenge, Gabelwahl, neuer Auto oder ein Prestige mit >= 10 % mehr Bestand der Ebene; Bestand statischer Ebenen = aktuelle Einheiten): 92-96 % der Besuche mit Fortschritt (Spalte oben, Ziel >= 90 %), nie mehr als 2 Besuche in Folge ohne etwas Neues (Ziel < 3), der erste Besuch nach jeder Nacht hat Fortschritt (getestet für beide Gabeln, Seeds 1-3). Schwächste Fälle: Seed 1 mit 23 von 25 Besuchen (92 %), die Lücken liegen in den Warte-Stunden des Fruchtkörpers.
- **Szenario "aktiv" (nur Spielzeit, dt 2 s):** Inhalt komplett nach 38 h Spielzeit (beide Gabeln); die Zeittore des Fruchtkörpers (20 h + 3 × 6 h) bestimmen den Takt, schneller spielen hilft nur bis dahin.
- **Szenario "selten" (ein Besuch alle 8 h, 3 min):** Gabel nach 16 h, erster Fruchtkörper nach 2 d 16 h, Ende der Challenges nach 4,3 (Sporen) bzw. 4,6 Tagen (Mykorrhiza); jeder der 30 Besuche hat Fortschritt, das Spiel bleibt nie stehen. Ein Ziel hat dieses Szenario nicht.
- **Regenschauer:** Ohne Schauer kommen die Schlüsselmomente (Gabel, erste Einheit, Fruchtkörper-Ebene, erster Fruchtkörper, drei Challenges) im Mittel **6 % später** (Seeds 1-3, beide Gabeln; einzelne Momente 0-36 %, eine Klippe durch die Nacht 63 %), "Inhalt komplett" im Mittel 2,6 % später (-2 % bis +7 % je Lauf). Das ist die Spezifikation: messbar (Test verlangt >= 3 % bei den Momenten), höchstens 15 %. Der Schauer wirkt auf Nährstoffe und Zucker (×8, nach "Wolkenbruch" ×10) für je 3 Minuten, Ladung +1 je 45 min, höchstens 3, er läuft nach dem Besuch weiter. Das Ende ist durch die Zeittore kaum vom Schauer abhängig, der frühe Teil (Gabel, Einheiten) schon.

### Laufdauer je Ebene (`tools/runlength-myzel.mjs`)
Snapshots aus dem Pendler (H-Phase: 4. Besuch; Ast-Phase: 2 Besuche nach der Gabel; F-Phase: 1 Besuch nach Öffnen der Fruchtkörper-Ebene), von dort feste Laufdauern desselben Fensters je Ebene, der aktive Spieler kauft mit denselben Funktionen wie die Autos. Gewinn pro Sekunde relativ zum besten Wert und Nährstoffe (log10) am Ende des Fensters.
- **Hyphen:** Optimum **2 Minuten** (= `ripeSecs`; 100 %) in allen Zuständen und beiden Gabeln. 10-s-Läufe 0-5 %, 30-s-Läufe 0-23 %, 1-min-Läufe 1-51 %, 3 min 23-73 %, 10 min 1-26 %. Die Auto-Ausbreitung steht auf 3 min (`autoHTime`). Kein Mikro-Lauf-Optimum (Lektion Merlin: Reife-Faktor `ripeness`, `min(1, t/120 s)^1,5`, nach dem Softcap).
- **Sporen/Mykorrhiza (Ast):** Einheiten pro Sekunde sind für Zyklen von 1 bis 40 min gleich (die Kosten bestimmen das Tempo), die Produktion am Ende des Fensters bei 1-min-Zyklen gleich der bei 40-min-Zyklen (Sporen 7,5 / 7,4; Mykorrhiza 8,5 / 8,5 log10 N/s), erst bei Zyklen ab 1,3 h fällt sie (Sporen: 6,2). Kein Vorteil für Mikro-Zyklen, aber auch keiner für Warten: der Ast lohnt sich bei jedem Besuch gleich.
- **Fruchtkörper:** Das Optimum ist die **Untergrenze** (6 h = `fMinRun`): 8 h bringen 0 % (Nährstoffe am Ende 1e33 statt 1e39 bzw. 1e49 statt 1e59), 24 h noch viel weniger. Die Wirtschaft wächst nach dem Inhalt von Paket 1 mit jedem Lauf um viele Größenordnungen, Warten kostet also viel; Mikro-Läufe gibt es nicht, das Zeittor verhindert sie.

### Offene Punkte (Paket 2)
*Stand nach Paket 2: die Fruchtkörper-Ökonomie ist gezähmt (Softcap + komprimierte Upgrades), die Challenge-Anzeige hat "Zu schwer? Aufgeben", die Pacing-Tests laufen mit den Seeds 1-5; offen bleibt der Hinweis zum Bot unten (ein Mensch spielt anders). Die ursprüngliche Liste:*
- Die Fruchtkörper-Wirtschaft wächst nach dem Inhalt von Paket 1 explosiv (aktiv: 1e18-1e60 N/s je nach Laufdauer in 2 Tagen). Paket 2 (Flechte/Fäulnis, Waldnetz) muss sie über eigene Softcaps oder Reife-Faktoren auffangen und die Fruchtkörper-Upgrades (`pF11`, `pF12`, `f21`) vorher neu kalibrieren; im Paket-1-Inhalt selbst (bis zu 30 Fruchtkörper) bleibt es zahm.
- Die Challenges sind Zeit-Umwege (siehe oben): leicht zu schaffen, dafür vorhersehbar. In Paket 2 können sie mit mehr Kraft des Spielers anspruchsvoller werden (Ziel `chS` erhöhen, Zeit senken).
- Die Challenge-Anzeige im Kopf ("Dürre: Hyphen 8,07 K / 29,2 K · Zeit 1 Std 10 Min / 2 Std 30 Min") zeigt den Stand; ein Hinweis "zu schwer? aufgeben" fehlt noch.
- Der Sim-Bot nimmt immer die erste Challenge, die offen ist, und prestigt den Fruchtkörper, sobald der Gewinn >= max(1, 30 % des Bestands) ist; ein Mensch wird das anders tun.

## Umsetzung Paket 2: Entscheidungen und Abweichungen
Gabel B, Waldnetz, Hexenring mit Ende und Nachspiel, die zweiten Äste beider Gabeln, die gezähmte Fruchtkörper-Ökonomie. Die Spezifikation oben bleibt die Quelle der Wahrheit; hier steht, wo sie offen war oder angepasst wurde.
- **Zeittore statt Zahlentore für den Takt (wie bei den Fruchtkörpern).** Zeitleiste in Spielzeit: Fruchtkörper 6 h (der erste 20 h), **Flechte/Fäulnis 6,5 h (die erste 12 h)**, **Waldnetz 7,5 h (das erste 10 h)**. Die Reihenfolge ist Pflicht: Eine höhere Ebene setzt die Laufzeit der darunter zurück, also muss jede Ebene ein längeres Tor haben als die darunter (siehe LESSONS). Die Kiefer verkürzt die Tore der drei oberen Ebenen um bis zu 15 % (10 Stufen); der Bot kauft nur 2 Stufen, ohne Kiefer liegt das Ende am selben Besuch: die Zeitleiste hängt praktisch nur an den Toren und der Mindestzahl Waldnetze je Ring.
- **Gabel B** (Zeile 4) öffnet bei 4 Fruchtkörpern (`forkBAt`). Flechte und Fäulnis sind normale Ebenen mit der Basis "Fruchtkörper (gesamt) seit dem letzten Reset dieser Ebene" (`myz.fAt[id]`: beim Wählen und bei jedem Waldnetz neu gesetzt, damit die Vergangenheit kein Windfall ist), Gewinn `(Basis / 80)^0,35`. Beim Wählen gibt es 12 Flechten bzw. Fäulnis als Startsaat (sonst gäbe es die ersten 12 Stunden nichts zu kaufen). Ein Prestige der Zeilen 4 und 5 setzt Währungen, Einheiten und Laufzeiten zurück, **alle Upgrades bleiben** (`keep`); sonst würde jedes Waldnetz die Hyphen-Leiter und die ganze Flechte-Leiter neu verlangen.
- **Abweichung von der Spezifikation, Einkommen:** Die Spezifikation nennt Flechte "wiederholbare Käufe" und Fäulnis "Opfer-Mechanik". Beides allein gäbe nur beim Prestige (alle 6,5-12 h) etwas zu kaufen. Darum erzeugen die Buyables Einkommen: **Alge** (Flechten pro Stunde und Stufe, dazu Fruchtkörper-Gewinn), **Licht** (Erzeugung und Gewinn), **Totholz** (Fäulnis pro Stunde und Stufe). **Zersetzen** wandelt den Vorrat an Fruchtkörpern, Sporen und Zucker (nicht die Einheiten, sonst wäre es eine Farm) in **Humus**, der nicht ausgegeben wird und Fruchtkörper-Gewinn, Fäulnis-Gewinn und -Erzeugung vervielfacht. Beide Äste haben je 12 Upgrades (`LADDER`), davon ein exklusives Paar; auch das Waldnetz hat eins (Lichtung | Eichenhain).
- **Upgrade-Leitern erscheinen über die Zeit** (Auftrittsschwelle = Durchläufe der Ebene UND Stunden im Lauf, `TIER_AT`, `WLADDER`): so kommt zwischen zwei Prestiges etwas Neues, und die Leiter entfaltet sich über die Tage statt am ersten Besuch gekauft zu sein. Die Autokäufer sehen jeden Effekt (`deepScore`), ein Test erzwingt Nutzen > 0 für jedes Upgrade.
- **Waldnetz:** Gewinn `(Flechten + Fäulnis dieses Laufs / 0,01)^0,25` (kleiner Exponent: die Einkommens-Buyables laufen weg, das Waldnetz soll sie nicht weitertragen). Währung "Waldfäden". **Bäume** (Buyables): Eiche (Fruchtkörper-Gewinn), Buche (Flechten/Fäulnis Gewinn und Erzeugung), Birke (Waldfäden-Gewinn), Kiefer (kürzere Tore), Tanne (Ringkosten), Esche (jeder Ring wirkt stärker, ab dem 2. Waldnetz), Linde (Erzeugung, ab dem 4.); dazu acht "Pfade" (Einzel-Upgrades). **Meilensteine** öffnen die zweiten Äste: 2 Waldnetze = zweiter Ast der Gabel A, 4 = Gabel B. Beide Äste wirken dann zusammen; Sporen + Mykorrhiza geben Fruchtkörper-Gewinn `1 + 0,05 · min(S, M)`, Flechte + Fäulnis Waldfäden-Gewinn x1,5.
- **Hexenring:** statische Ebene (`layer.noReset`: der Ring setzt **nichts** zurück, neue Engine-Option). Ring n kostet `4 · 2,45^(n-1)` Waldfäden (gesamt) **und** verlangt n + 2 Waldnetze (Untergrenze der Zeitleiste, `ringW`): erster Ring frühestens nach dem 3. Waldnetz (Tag 5), der fünfte nach dem 7. Jeder Ring wirkt +15 % auf alle tiefen Gewinne. Ein Druck = ein Ring. Der 5. Ring setzt `myz.end`, löst das Ereignis `ending` und den Dialog aus (Text nur in `ending.js`), danach Nachspiel: weitere Ringe (Kosten steigen weiter), alle Meilensteine/Zahlen laufen weiter.
- **Jahresringe (neu, nicht in der Spezifikation):** ab Gabel B alle 2,5 h Spielzeit ein Jahresring (online und offline), +1 % Fruchtkörper- und Waldfäden-Gewinn, Toast. Ohne ihn lagen in den Tagen 3-6 Lücken von 3-5 Besuchen ohne etwas Neues; der Takt ist kürzer als drei Besuche. Ehrlich gesagt ist es ein gleichmäßiger Fortschritts-Tropfen; der Gewinn (+1 % je Ring, ~+40 % am Ende) ist klein und sichtbar im Kopf der Nährstoff-Ansicht.
- **Regenschauer-Meilensteine** "Regenzeit" (10/25/45/70/100 Schauer, je +1 auf die Stärke) und **Fruchtkörper-Meilensteine** (5, 6, 8 ... 20, je x1,08 Fruchtkörper-Gewinn): kleine, regelmäßige neue Dinge für die Metrik und für die langen Fruchtkörper-Zyklen.
- **Fruchtkörper-Ökonomie:** Softcap je Lauf ab 3000 (`formula.softcap`, Exponent 0,25) und Upgrades, die F ab 5000 komprimiert sehen (`Ft()`, Exponent 0,35). **Unterhalb davon ist alles wie in Paket 1**: der echte Spielstand liegt dort. Der Bot prestigt Fruchtkörper ab 2 % statt 30 % des Bestands (bei der ruhigen Wirtschaft sind 30 % nie erreichbar). Die F-Upgrades überleben die Zeile 4.
- **Autos** (alle starten aus, Hinweis-Toast mit Ort des Schalters): Fruchtkörper (nach dem 1. Flechte-/Fäulnis-Durchlauf), Flechte bzw. Fäulnis (2.), Flechten-/Fäulnis-Upgrades (3.), Zersetzen (3. Fäulnis), Baum-Upgrades (1. Waldnetz), Waldnetz (3.). Die Sim schaltet sie beim nächsten Besuch ein.
- **UI:** Knoten L / Fä / W / R sind echt (die Silhouetten aus Paket 1 öffnen sich nacheinander), Buyables als Zeilen mit großem Kaufknopf (halten = mehrere Stufen), Upgrade-Leitern als 2-spaltige Karten mit Auftritts-Hinweis ("Erscheint im Lauf, noch 51 Min"), Zersetzen mit Bestätigung, Hexenring-Karte mit fünf Ringen, Jahresringe und Regenzeit-Meilensteine in der Nährstoff-Ansicht, Gabel B mit Dialog und Respec (kostet den Ast und alles darüber), **Challenge-Banner mit "Zu schwer? Aufgeben"** (Bestätigung). Ende: ein kurzer, warmer Dialog (`ending.js`), jederzeit im Hexenring noch einmal lesbar.
- **Nicht in Paket 2:** Chronik, Stimmen, Hub-Änderung, Icons (Paket 3). Der Endtext ist ein Platzhalter an einer Stelle.

## Messungen Paket 2
Alles mit den Werten aus `games/myzel/tune.js`, deterministisch (fester Zeitschritt, Seed-Besuchsplan). Neu erzeugen: `node tools/simulate-myzel.mjs --table --seeds 5` (80 s), `--pendler|--selten|--active --fork s|m --forkB l|z`, `node tools/runlength-myzel.mjs [--deep]`. Zeiten sind Kalendertage seit dem Start (Tag 1 = 0,0-1,0; "Tag 3" = 2,0-3,0 ...; Besuche 7:00-23:00 mit je 3 min, Nacht 8 h, Offline über den echten Pfad mit der 3-h-Grenze, Regenschauer an).

### Pendler: alle vier Kombinationen, Seeds 1-5 (Ziele: Gabel B Tag 3, Waldnetz Tag 4, erster Ring Tag 5, Ende Tag 5-7)
| Kombination (A,B) | Seed | Gabel B | 1. Flechte/Fäulnis (Waldnetz offen) | 1. Waldnetz | 1. Ring | **Ende** | Besuche mit Fortschritt, längste Folge ohne Neues |
|---|---|---|---|---|---|---|---|
| sl | 1 | 2.26 | 3.00 | 3.42 | 4.34 | 6.21 | 59/60 (98 %), 2 |
| sl | 2 | 2.26 | 3.01 | 3.49 | 4.47 | 6.28 | 57/59 (97 %), 2 |
| sl | 3 | 2.32 | 3.07 | 3.50 | 4.52 | 6.34 | 56/59 (95 %), 2 |
| sl | 4 | 2.35 | 3.15 | 3.60 | 4.56 | 6.37 | 57/60 (95 %), 2 |
| sl | 5 | 2.26 | 3.00 | 3.46 | 4.37 | 6.14 | 58/60 (97 %), 1 |
| sz | 1 | 2.26 | 3.00 | 3.42 | 4.34 | 6.21 | 59/60 (98 %), 2 |
| sz | 2 | 2.26 | 3.01 | 3.49 | 4.47 | 6.28 | 57/59 (97 %), 2 |
| sz | 3 | 2.32 | 3.07 | 3.50 | 4.52 | 6.34 | 58/59 (98 %), 2 |
| sz | 4 | 2.35 | 3.15 | 3.60 | 4.56 | 6.37 | 58/60 (97 %), 2 |
| sz | 5 | 2.26 | 3.00 | 3.46 | 4.37 | 6.14 | 59/60 (98 %), 1 |
| ml | 1 | 2.26 | 3.00 | 3.42 | 4.34 | 6.21 | 59/60 (98 %), 1 |
| ml | 2 | 2.26 | 3.01 | 3.49 | 4.47 | 6.28 | 57/59 (97 %), 2 |
| ml | 3 | 2.32 | 3.07 | 3.50 | 4.52 | 6.34 | 56/59 (95 %), 2 |
| ml | 4 | 2.35 | 3.15 | 3.60 | 4.56 | 6.37 | 57/60 (95 %), 2 |
| ml | 5 | 2.26 | 3.00 | 3.46 | 4.37 | 6.14 | 58/60 (97 %), 1 |
| mz | 1 | 2.26 | 3.00 | 3.42 | 4.34 | 6.21 | 59/60 (98 %), 1 |
| mz | 2 | 2.26 | 3.01 | 3.49 | 4.47 | 6.28 | 57/59 (97 %), 2 |
| mz | 3 | 2.32 | 3.07 | 3.50 | 4.52 | 6.34 | 58/59 (98 %), 2 |
| mz | 4 | 2.35 | 3.15 | 3.60 | 4.56 | 6.37 | 58/60 (97 %), 2 |
| mz | 5 | 2.26 | 3.00 | 3.46 | 4.37 | 6.14 | 59/60 (98 %), 1 |

- **Alle 20 Fälle erfüllen die Ziele:** Gabel B Tag 3 (2,26-2,35), Waldnetz offen Tag 4 (3,00-3,15, mit der ersten Flechte/Fäulnis), erstes Waldnetz 3,42-3,60, erster Ring Tag 5 (4,34-4,56), **Ende nach 6,14-6,37 Tagen** (Tag 7). Beide zweiten Äste sind vor dem Ende offen (Gabel A bei 4,0, Gabel B bei 4,9 Tagen).
- **Verhältnis der Kombinationen: 1,00** (je Seed, über alle 1,04; Ziel <= 1,25). Das ist kein Zufall: Die Zeitleiste hängt an den Zeittoren (Fruchtkörper 6 h, Flechte/Fäulnis 6,5 h, Waldnetz 7,5 h) und der Mindestzahl Waldnetze je Ring; die Äste unterscheiden sich in Stärke (Flechte: Waldfäden gesamt 254, Fäulnis 212), nicht im Zeitpunkt. Auch ein Spieler, der die Hinweis-Toasts ignoriert und keinen Auto einschaltet, kommt nur 2 % später (6d 08:55 statt 6d 05:03, Seed 1 s/l).
- **Fortschritts-Metrik** (Besuche mit Neuem: Upgrade, Meilenstein, Ebene, Challenge, Gabelwahl, neuer Auto, Jahresring, oder eine weitere Buyable-Stufe bzw. ein Prestige/Zersetzen mit >= 10 % mehr Bestand; Ereignisse der Abwesenheit zählen für den Besuch, der sie entdeckt): **95-100 % der Besuche mit Fortschritt** (Spalte), **nie mehr als 2 Besuche in Folge ohne etwas Neues** (Ziel <= 2), der erste Besuch nach jeder Nacht hat in allen 20 Fällen Fortschritt (Test). Ohne die Jahresringe waren es 3-5 Besuche Lücke (siehe LESSONS).
- **Regenschauer** (Seeds 1-5, alle Kombinationen, mit/ohne): das **Ende kommt im Mittel 0,7 % später ohne Schauer** (0-2,6 %, Ziel <= 15 %); die Schlüsselmomente aus Paket 1 (Gabel A, erste Einheit, Fruchtkörper, drei Challenges) im Mittel 12,7 % später (Spanne 0,80-1,92, Test verlangt 3-15 % im Mittel über Seeds 1-3). Der Schauer ist ein Bonus für die ersten beiden Tage, auf die Tiefe wirkt er kaum (Nährstoffe/Zucker sind dort nicht der Engpass).
- **Szenario "selten"** (ein Besuch alle 8 h, 3 min, 20 Tage): Gabel B nach 4d 16h, erster Ring 9d 08h, **Ende nach 12d 16h** (alle vier Kombinationen), danach noch 6 weitere Ringe in 7 Tagen (Nachspiel läuft); alle 60 Besuche haben Fortschritt, es steht nie still (die Autos der tiefen Ebenen laufen offline).
- **Szenario "aktiv"** (nur Spielzeit, dt 2 s): Ende nach 4d 14h (Sporen) bzw. 4d 18h (Mykorrhiza) Spielzeit; Gabel B nach 1d 19h bzw. 1d 23h.
- **Ökonomie** (aktiv, Ende nach 110 h): Nährstoffe/s 1e16 nach 48 h und 1e24 am Ende (in Paket 1 waren es 1e18-1e60 nach zwei Tagen), Fruchtkörper (gesamt) 2e4 nach 4 Läufen, 5e5 nach 12 (vorher 1e12-1e18 nach 8 Läufen). Der Softcap je Lauf (ab 3000) und die komprimierten F-Upgrades (ab 5000) ändern bis dorthin nichts: Spielstände aus Paket 1 liegen darunter.
- **Laufdauer der neuen Ebenen** (`tools/runlength-myzel.mjs --deep`, Gewinn/h bei 1 / 1,5 / 2 / 3 x Zeittor, 100 % = beste Dauer; Läufe in 40 bzw. 60 h):
  | Ebene | Tor | 1x | 1,5x | 2x | 3x |
  |---|---|---|---|---|---|
  | Flechte (eigene Währung inkl. Einkommen) | 6,5 h | 91 % | 100 % | 100 % | 97 % |
  | Fäulnis | 6,5 h | 100 % | 84 % | 85 % | 78 % |
  | Waldnetz (Waldfäden) Gabel s/l | 7,5 h | 100 % | 30 % | 25 % | 7 % |
  | Waldnetz Gabel m/z | 7,5 h | 100 % | 31 % | 28 % | 9 % |
  Das Tor ist die kürzeste mögliche Laufzeit, es gibt also **kein Mikro-Lauf-Optimum**; Warten lohnt nicht (Flechte bis +9 % wegen des Einkommens, das ohnehin läuft, Fäulnis und Waldnetz nie). Fruchtkörper: Tor 6 h (91 % bzw. 86 % der besten Dauer 8 h = reif), 12 h 52-62 %, 24 h 10-23 % (in Paket 1 war das Optimum der Boden, weil die Wirtschaft explodierte).
- **Spielstand aus Paket 1** (`tests/myzel-compat.test.mjs`, Fixture = echter Spielstand aus dem Paket-1-Code, Tag 2, beide Äste, Basiswerte vom Paket-1-Code): lädt über den echten Speicherpfad (Version 1 -> 2), jedes Upgrade, jeder Meilenstein, jede Challenge, Hyphen- und Fruchtkörper-Stand bleiben, Nährstoff-Produktion, Hyphen-Gewinn, Zucker-Rate und Fruchtkörper-Gewinn sind auf 1e-9 identisch zu Paket 1, und der Spielstand erreicht Fruchtkörper 3 und 4 sowie "Inhalt von Paket 1 komplett" **genauso früh oder früher** als unter Paket 1 (mit dem Bot von damals und dem neuen).
- **Tests:** 401 grün in 157 s (`npm test`), die Pacing-Tests (4 Kombinationen x Seeds 1-5) rechnen ~95 s.

## Umsetzung Paket 3: Chronik + Feinschliff
Stimmen-Bibel `games/myzel/STIMMEN.md` (zuerst geschrieben), Figuren `characters.js`, Chronik `story.js`, Endtext `ending.js`, Weg der Zeittore, Baum-Beschriftung. Die Spezifikation oben bleibt die Quelle der Wahrheit; hier steht, was offen war.
- **Welt und Ton:** Das Myzel ist das Ich des Spielers: alt, langsam, ohne Augen und Ohren, es schmeckt. Zwei Gegenüber: **Taxus**, eine neunhundertjährige Eibe (knapp, trocken, antwortet spät, nennt das Myzel "Untermieter", führt Buch über Zucker und Phosphor) und **Kurt**, ein Waldmistkäfer (atemlos, bricht Sätze ab, lebt einen Sommer; alle Käfer heißen Kurt). Die Bäume des Waldnetzes sind keine Figuren, sondern Zeilen des Myzels über ihre Eigenart. Weltregeln (Test): Myzel und Eibe sehen und hören nicht; gesprochen wird durch das Netz; ein Jahr = ein Jahresring; kein Wort über das Spiel (Handy, Besuch, Tippen). Der Regen kommt, "weil das Myzel Durst hat".
- **Bogen:** Ziel in den ersten Zeilen (ob der alte Baum allein ist). Tag 1: Käfer, Regen, "Wie sehe ich aus?" (Kurt: "Von hier siehst du aus wie Boden!"), Gabel A. Tag 2: erster Hut und die Eibe (Dialog), Vertrag, Dürre, Frost, Kahlschlag mit der Auflösung "Wir waren vierzehn". Tag 3: Gabel B, Jahre, Kurt bekommt Flügel, das Waldnetz mit der Birke (Dialog). Tag 4-6: Kiefer, Eiche, Buche, der erste Ring ("Hexenring" aus Kurts Sicht), die dreizehn Stümpfe im Osten, Kurt fliegt hoch und hat etwas im Gesicht, der erste Stumpf. Ende: die Stümpfe hängen am Netz, "Unter Familie", Kurt sieht den Ring von oben ("Ein Kreis. Ein ziemlich guter.") und beendet seinen Satz, das Hexen-Gerücht bleibt. Nachspiel: ein neuer Kurt, der nichts weiß; Taxus legt ein neues Buch an.
- **42 Einträge (40 bis zum Ende, 2 im Nachspiel), 6 Kapitel** (`k1` Erde, `k2` Hüte, `k3` Zwei Wege, `k4` Der Wald, `k5` Der Ring, `k6` Nachspiel), **6 Dialoge** (Start, Gabel A, erster Hut, Gabel B, erstes Waldnetz, Ende), der Rest Blasen. Je Gabel Varianten (Sporen/Mykorrhiza, Flechte/Fäulnis) als **ein** Eintrag mit Text als Funktion von `forkChoice`.
- **Taktung in Besuchen:** eine Kette (`link`): jeder Eintrag wartet auf den Vorgänger, auf einen Abstand (`gap`: 20-45 min am ersten Tag, danach 90 min bis 3 h) und auf monotonen Fortschritt (Zähler, Meilensteine, Herausforderungen, Jahre, Ringe, Waldnetze); ein paar Einträge haben einen Rückfall nach 4,5 h, dessen Text auch ohne den Fortschritt stimmt. Einträge, die auf Entscheidungen warten (Baum gekauft), haben ein `oder` mit einem Zähler.
- **Chronik-UI:** Tab Netz | Chronik | Mehr mit Ungelesen-Punkt, Figuren-Reihe (Karten mit Rolle und Bio, nach dem Ende neu), Blasen über dem Tab bzw. über dem Prestige-Button der Ebenenansicht (`body.lv-open .sb-layer`), Einstellungen für Blasen/Tempo in "Mehr". Das Ende ist ein Dialog (Chronik-Eintrag `end_ring`, Text aus `ending.js`), im Hexenring wieder lesbar.
- **Migration 2 -> 3 und Backfill:** `chronicle.backfill` aus der Migration, `hooks.onLoad` trägt alles Wahre still nach (kein Dialog, keine Blasen, ungelesen), die Kette läuft vom letzten Eintrag "jetzt" weiter; ein nie gezeigter Endtext kommt einmal. Test mit **echten Paket-2-Spielständen** (Tag 4, Ende; `tests/fixtures/myzel-p2.json`).
- **Entscheidungen am Ende:** `gateMul(g)` = Kiefer x Frühlicht, wirkt auf **alle** Tore (Fruchtkörper, Flechte, Fäulnis, Waldnetz; nicht auf die allerersten Läufe 20/12/10 h). Kiefer jetzt 8 Stufen x 2 % (Basis 2 Waldfäden, Faktor 1,4: die ersten Stufen kann man sich vom ersten Waldnetz leisten, vorher Basis 15, Faktor 1,7, nie bezahlbar), **Frühlicht** als dritter Weg in der Stufe von Lichtung | Eichenhain (x0,9 auf alle Tore, 8 Waldfäden, ab dem 1. Waldnetz, schließt beide aus; ein Spielstand, der Lichtung/Eichenhain besitzt, kann Frühlicht einfach nicht nehmen), zusammen **-24 %**. `gateW` (Wert der kürzeren Reifezeit im Ziel des Autokaufs) 3 -> 20. Die Auto-Zeitwerte der tiefen Ebenen (`gated()`) zählen in Toren.
- **Baum:** Beschriftungen mit Halo (`paint-order: stroke`), Linien beginnen unter dem Namen des Knotens: keine Linie kreuzt mehr einen Namen (Screenshots 390x844 und 360x740 vorher/nachher).
- **Nicht in Paket 3:** Hub-Änderungen, neue Icons, Stats-Panel-Umbau.

## Messungen Paket 3
Alles mit `games/myzel/tune.js`, deterministisch. Neu erzeugen: `node tools/simulate-myzel.mjs --table --seeds 5` (70 s), `TUNE_OVERRIDE='{"gateW":0}' ... --table` (Spieler, der die Zeittor-Karten ignoriert), `node tools/story-myzel.mjs [--fork s|m] [--forkB l|z] [--seed N]`.

### Zeittore vorher/nachher (Pendler, Ende in Tagen; Mittel über die vier Kombinationen, sie sind bis auf die zweite Stelle gleich)
| Seed | vorher (Paket 2) | Ignorierer (`gateW` 0) | guter Spieler (Paket 3) | Differenz |
|---|---|---|---|---|
| 1 | 6,21 | 6,21 | 5,62 | -9,4 % |
| 2 | 6,28 | 6,28 | 5,60 | -10,8 % |
| 3 | 6,34 | 6,34 | 6,01 | -5,2 % |
| 4 | 6,37 | 6,37 | 6,01 | -5,7 % |
| 5 | 6,14 | 6,14 | 5,66 | -7,9 % |
| Mittel | 6,27 | 6,27 | 5,78 | **-7,8 %** |
- Alle 20 Fälle (4 Kombinationen x Seeds 1-5) enden an **Tag 5-7** (5,60-6,01), Gabel B Tag 3 (2,26-2,35), Waldnetz offen Tag 4 (3,00-3,15), erster Ring Tag 5 (4,28-4,44), beide zweiten Äste vor dem Ende. Fortschritts-Metrik: 94-100 % der Besuche mit Fortschritt, nie mehr als 2 Besuche in Folge ohne etwas Neues, erster Besuch nach der Nacht immer mit Fortschritt (die Pacing-Tests laufen unverändert grün). Verhältnis der Kombinationen 1,00.
- Der gute Bot kauft Frühlicht beim ersten Waldnetz und die 8 Kiefer-Stufen verteilt über die Waldnetze 2-7 (3 Stufen schon beim 2.): `gateMul` am Ende 0,756 (-24 %). Der Ignorierer kauft nichts davon und liegt exakt beim Wert von Paket 2 (das Spiel danach ist unverändert).
- **Warum nur -8 % beim Ende:** 55 % der Pendler-Zeit liegen vor dem ersten Waldnetz (erste Läufe 20 h Fruchtkörper, 12 h Flechte/Fäulnis, 10 h Waldnetz), dort wirkt kein Baum. Der Rabatt trifft die letzten sieben Waldnetze und wirkt mit den ersten Stufen schon ab dem 2.; zur Kontrolle (Seed 1): Frühlicht x0,5 statt x0,9, also gut -50 % auf die Tore, bringt -13 %. Mehr Gewicht hieße früher ansetzen und das Spiel vorher schneller machen (Zielzeiten!), das ist hier bewusst nicht geschehen.
- Waldfäden insgesamt: 200-250 bis zum Ende (Ringe zählen die Gesamtmenge, Ausgeben kostet keinen Ring). Alle acht Kiefer-Stufen kosten zusammen etwa 70, Frühlicht 8.

### Chronik-Rhythmus (Pendler, Kombinationen s/l und m/z, Seeds 1-5, bis zum Ende; `tools/story-myzel.mjs`)
- **40 Einträge bis zum Ende** (davon 6 Dialoge; dazu 2 im Nachspiel) in **55-57 Besuchen**: 0,72 Einträge je Besuch (ein Eintrag je 1,4 Besuche); von 556 Besuchen haben 193 keinen, 326 einen, 37 zwei neue Einträge, nie drei.
- **Längste Folge von Besuchen ohne neuen Eintrag: 2-3** (Ziel <= 3; Läufe ohne Eintrag am Stück: 1 Besuch 119 mal, 2 Besuche 31 mal, 3 Besuche 4 mal), **nie zwei Dialoge in einem Besuch**, der erste Besuch beginnt mit dem Start-Dialog.
- Einträge je Kalendertag (Tag 1-6, Min-Max über die Läufe): 11 | 5-6 | 4-6 | 5-6 | 7-9 | 5-6 (Tag 6 enthält das Ende und das Nachspiel). Schlüsselmomente: Gabel-A-Dialog Tag 1, erster Hut Tag 2, Gabel-B-Dialog Tag 3, erstes Waldnetz Tag 4.
- Kette in Reihenfolge, alle Einträge erreicht (bis auf die letzte Nachspiel-Zeile, die auf den siebten Ring wartet), Test `tests/sim-myzel-story.test.mjs`.
- Vor dem Abstimmen (Rückfälle 3 h): Folgen von 4-6 Besuchen ohne Eintrag und 3 Einträge in einem Besuch; siehe LESSONS.

### Echte Spielstände (Paket 2)
- **Tag 4** (3,9 Tage, 2 Waldnetze, 12 Jahresringe): lädt über Migration 2 -> 3, 28 Einträge still nachgetragen (ungelesen, kein Dialog, keine Blase), die Kette steht an der Stelle des Fortschritts (nächster Eintrag: Kiefer); Nährstoff-Produktion, alle Gewinne und das Waldnetz-Tor stimmen auf 1e-9 mit den Paket-2-Zahlen.
- **Ende** (6,3 Tage): 41 Einträge still nachgetragen, der nie gezeigte Endtext kommt **einmal** als Dialog, mit `endShown` kein Dialog.
- **Tests:** `npm test` grün (siehe Commit), neue Dateien `myzel-story`, `myzel-gates`, `sim-myzel-story`.
