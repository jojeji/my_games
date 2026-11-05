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
- **Statische Ebenen (Sporen, Mykorrhiza):** Kosten der Einheit k = `base · grow^(k^exp)` in **Nährstoffen gesamt seit dem letzten Reset der Zeile** (`state.myz.nAt`), nicht in den Nährstoffen "in der Hand". Grund: Eine Hyphen-Ausbreitung setzt die Nährstoffe auf 0; mit "in der Hand" müsste jede Einheit in einem einzigen Hyphen-Lauf erreicht werden und widerspräche dem Ausbreiten (Messung: der Bot musste zwischen Hyphen und Sporen wählen). Die Wahl der Gabel setzt die Basis zurück (kein Windfall von 3-5 Einheiten beim ersten Mal). Gewinn = so viele Einheiten wie bezahlbar ("max"-Modus). Die Einheiten werden nicht ausgegeben: Upgrades kosten Sporen (Vorrat), Kostenskala und Wirkung hängen an den Einheiten.
- **Wirkung der Sporen:** Nährstoffe × `(1 + a·Sporen)^pow` statt `per^Sporen`. Die exponentielle Form explodierte in der Sim mit den Resets darüber (49 Einheiten, 1e50 Nährstoffe/s nach 3 Tagen).
- **Mykorrhiza:** Zucker/s = `zPer · Einheiten · (Nährstoffe ohne Zucker und Schauer)^zRateExp`, Nährstoffe × `(1 + Zucker gesamt)^zExp`. Zucker wird von einem Reset der Zeile 3 (Fruchtkörper) gelöscht, nicht von Hyphen oder Mykorrhiza.
- **Meilensteine "Behalte …" der Äste** wirken ab dem **nächsten** Reset (der Reset, der die Einheit bringt, hat noch nichts behalten); die Texte sagen das ("ab dem nächsten Mal"). Dasselbe gilt für den Fruchtkörper-Meilenstein "Hyphen-Upgrades bleiben erhalten".
- **Fruchtkörper:** Basis = Hyphen, die seit dem letzten Fruchtkörper verdient wurden (`state.myz.hAtF`); verlangt `fUnits` Sporen oder Mykorrhiza (Einheiten-Rekord zählt nicht, der Ast wird beim Fruchtkörper zurückgesetzt).
- **Challenges** (Ziel = Hyphen, die im Challenge-Lauf verdient wurden, `goal.fn`): Dürre staucht nur den **Kern** der Nährstoff-Produktion (Hyphen, Upgrades, Fruchtkörper), nicht die Äste; sonst verhungert der aktive Ast (Einheiten brauchen Nährstoffe). Frost friert die Hyphen-Upgrades ein, Kahlschlag lässt Sporen/Mykorrhiza ruhen. Aufgeben ist jederzeit möglich. Der Bot startet die nächste Challenge direkt nach einem Fruchtkörper.
- **Exklusive Paare** (`h31a|h31b`, `s22a|s22b`, `m22a|m22b`, `f22a|f22b`): umwählbar, sobald die Ebene seit dem Kauf einmal prestigt wurde (Erstattung 100 %, `upgRechoose`).
- **Regenschauer:** Antippen addiert 180 s Schauer (Nährstoffe und Zucker ×`rainMult`); mehrere Schauer addieren ihre Zeit, die Wirkung läuft auch nach dem Besuch weiter (offline). Ladung +1 je 45 min Spielzeit (online wie offline), höchstens 3, Start mit einer. Meilenstein "Wolkenbruch" (4 Fruchtkörper) macht sie stärker, die Grenze wächst nie.
- **Netz-Ansicht:** Zeilen 4-6 (`l|z`, `w`, `r`) sind Silhouetten mit "?" (Vorfreude), das Gabel-B-Paar steht schon als "oder" im Baum.
- **Nicht in Paket 1:** Buyables (kommen mit Flechte/Waldnetz), zweiter Ast der Gabeln (`forkSecondOpen` ist in der Engine, wird von Paket 2 über `secondWhen` angeschlossen), Chronik, Hub-Eintrag.
