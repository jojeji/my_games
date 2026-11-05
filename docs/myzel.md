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
- Die Fruchtkörper-Wirtschaft wächst nach dem Inhalt von Paket 1 explosiv (aktiv: 1e18-1e60 N/s je nach Laufdauer in 2 Tagen). Paket 2 (Flechte/Fäulnis, Waldnetz) muss sie über eigene Softcaps oder Reife-Faktoren auffangen und die Fruchtkörper-Upgrades (`pF11`, `pF12`, `f21`) vorher neu kalibrieren; im Paket-1-Inhalt selbst (bis zu 30 Fruchtkörper) bleibt es zahm.
- Die Challenges sind Zeit-Umwege (siehe oben): leicht zu schaffen, dafür vorhersehbar. In Paket 2 können sie mit mehr Kraft des Spielers anspruchsvoller werden (Ziel `chS` erhöhen, Zeit senken).
- Die Challenge-Anzeige im Kopf ("Dürre: Hyphen 8,07 K / 29,2 K · Zeit 1 Std 10 Min / 2 Std 30 Min") zeigt den Stand; ein Hinweis "zu schwer? aufgeben" fehlt noch.
- Der Sim-Bot nimmt immer die erste Challenge, die offen ist, und prestigt den Fruchtkörper, sobald der Gewinn >= max(1, 30 % des Bestands) ist; ein Mensch wird das anders tun.
