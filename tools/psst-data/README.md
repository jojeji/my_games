# Psst! Kartendaten (Werkzeuge)

Erzeugt `games/psst/data/packs.json` und `games/psst/data/packs/*.json`. Kein Runtime-Code, nur Node (>= 18), keine Abhängigkeiten.
Begriffe wie in `games/psst/GLOSSARY.md`: Karte = Suchbegriff + 5 Tabuwörter, Kartenpaket = benannte Sammlung.

## Dateien

| Datei | Zweck |
| --- | --- |
| `curated/*.txt` | Die Karten selbst (von Hand/KI geschrieben, teils mit automatischen Vorschlägen). Eine Karte pro Zeile. |
| `curated.json` | `drop` (Suchbegriffe ausschließen) und `fix` (einzelne Felder einer Karte überschreiben). |
| `../../games/psst/data/review-decisions.json` | Entscheidungen des Besitzers aus der Prüfseite (optional). |
| `prepare.mjs` | Wandelt die Rohdaten (Leipzig, OpenThesaurus, Kovah) in kompakte JSON-Dateien. |
| `suggest.mjs` | Kandidaten und Tabuwort-Vorschläge aus den vorbereiteten Rohdaten (Korpus-Kookkurrenz + Synonyme/Oberbegriffe). |
| `build.mjs` | Baut alle Kartenpakete, prüft jede Karte, bricht bei Verstößen ab. Deterministisch. |
| `check.mjs` | Qualitätsprüfung der fertigen Dateien (auch von `tests/psst-data.test.mjs` benutzt). |
| `import-review.mjs` | Fügt Export-Codes der Prüfseite in `review-decisions.json` ein. |
| `assoc.mjs` | Assoziationsprüfung: passen die 5 Tabuwörter zu dem, was Menschen zum Suchbegriff einfällt? Schreibt `games/psst/data/assoc-report.json` (siehe unten). |
| `assoc-swaps.txt` | Von Hand entschiedene Tabuwort-Tausch aus der Assoziationsprüfung, `assoc.mjs --apply` schreibt sie nach `curated.json`. |
| `lib.mjs` | Gemeinsame Helfer (Slug, Wortstamm-Vergleich, Blockliste). |

## Neu bauen

```sh
# 1. Rohdaten holen (einmalig; Ziel: $PSST_RAW, Standard: Scratchpad, NIE ins Repo)
RAW=${PSST_RAW:-/tmp/psst-raw}; export PSST_RAW=$RAW; mkdir -p $RAW/{ot,leipzig,kovah}
curl -o $RAW/ot/dump.tar.bz2 https://www.openthesaurus.de/export/openthesaurus_dump.tar.bz2
mkdir $RAW/ot/x && tar xjf $RAW/ot/dump.tar.bz2 -C $RAW/ot/x
mkdir -p $RAW/leipzig/m $RAW/leipzig/n
curl -o $RAW/leipzig/mixed1m.tar.gz https://downloads.wortschatz-leipzig.de/corpora/deu_mixed-typical_2011_1M.tar.gz
curl -o $RAW/leipzig/news1m.tar.gz  https://downloads.wortschatz-leipzig.de/corpora/deu_news_2023_1M.tar.gz
tar xzf $RAW/leipzig/mixed1m.tar.gz -C $RAW/leipzig/m --wildcards '*words.txt' '*co_s.txt'
tar xzf $RAW/leipzig/news1m.tar.gz  -C $RAW/leipzig/n --wildcards '*words.txt' '*co_s.txt'
(cd $RAW/kovah && npm pack taboo-data && mkdir x && tar xzf taboo-data-*.tgz -C x)

# 2. Rohdaten vorbereiten (schreibt $RAW/prepared/*.json)
node tools/psst-data/prepare.mjs

# 3. Kartenpakete bauen und prüfen
node tools/psst-data/build.mjs
node tools/psst-data/check.mjs
```

`build.mjs` braucht die vorbereiteten Rohdaten nur für Karten mit automatischen (`*`, `A+`) oder Kovah-Wörtern (`K+`) und für Hinweise zur Großschreibung.
Ohne sie bricht der Build bei solchen Karten ab. `check.mjs` und die Tests brauchen nur die fertigen Dateien.

## Zeilenformat in `curated/*.txt`

```
Suchbegriff | Tabuwort, Tabuwort, Tabuwort, Tabuwort, Tabuwort | Stufe | Themen | S
```

- Stufe 1 = leicht, 2 = mittel, 3 = schwer. Sie bestimmt das Mix-Paket (`mix1`/`mix2`/`mix3`).
- Themen (kommagetrennt, leer erlaubt): `essen tiere geo sport film personen technik alltag`. Eine Karte kommt in jedes genannte Themenpaket **und** in ihr Mix-Paket.
- `S` = Kandidat für das Startpaket (nur Stufe 1 und 2 werden übernommen).
- Tabuwörter: eigene Wörter stehen immer zuerst. Präfix `A+` füllt freie Plätze mit automatischen Vorschlägen (Leipzig/OpenThesaurus), `*` allein nimmt nur Vorschläge, `K+` füllt mit Kovah-Tabuwörtern. Beim Fehlen von Quellen oder zu wenig brauchbaren Wörtern bricht der Build ab.
- `src` wird automatisch gesetzt: `ai` (alles von Hand), `ot` (nur automatisch), `kovah` (nur Kovah), `mixed` (gemischt oder vom Besitzer bearbeitet).
- Ein Suchbegriff darf nur in **einer** Datei stehen. Die `id` ist der ASCII-Slug des Suchbegriffs und bleibt stabil.

## Qualitätsprüfung (`check.mjs`)

Genau 5 Tabuwörter; kein Tabuwort gleich/enthalten/enthaltend zum Suchbegriff oder mit gleichem Wortstamm (einfache deutsche Stammbildung, Komposita in beide Richtungen); keine Doppelten oder Singular/Plural-Varianten innerhalb einer Karte (auch "Marty" / "Marty McFly"); eindeutige `id`s (dieselbe `id` muss in allen Paketen dieselbe Karte sein); keine leeren oder zu langen Texte; Blockliste für anstößige Begriffe. Kovah-Promis werden nur über Auswahl in `curated/kovah.txt` übernommen (nur allgemein bekannte Personen).

## Prüfseite und Entscheidungen

`games/psst/review/index.html?pack=start` (Pakete: `start mix1 mix2 mix3 essen tiere geo sport film personen technik alltag`). Export-Code:

```
PSSTREVIEW1.<base64 (UTF-8) von {"pack":"start","keep":[ids],"drop":[ids],"edit":{"<id>":{"w":"...","t":["..",".."x5]}}}>
```

`node tools/psst-data/import-review.mjs "<Code>"` schreibt ihn nach `games/psst/data/review-decisions.json`:

```json
{ "version": 1, "decisions": [ { "pack": "start", "keep": ["ampel"], "drop": ["ei"], "edit": { "kuh": { "w": "Kuh", "t": ["Milch", "...", "...", "...", "..."] } } } ] }
```

`build.mjs` wendet an: `drop` entfernt die Karte aus **allen** Paketen, `edit` ersetzt Suchbegriff und Tabuwörter (die `id` bleibt, `src` wird `mixed`, die Prüfung läuft danach erneut), `keep` ist nur Protokoll.
Ein neuer Code für dasselbe Paket ersetzt den alten. Danach `build.mjs` ausführen und die erzeugten Dateien committen.

## Assoziationsprüfung (`assoc.mjs`)

Tabuwörter sollten die Wörter sein, die ein Erklärer von selbst sagen würde. Das messen freie Assoziationsnormen. Das Werkzeug bewertet jede Karte damit, markiert schwache Karten und schlägt Wörter vor.
Die Rohdaten liegen nur lokal (`$PSST_RAW`, nie im Repo). Eingecheckt wird nur der kleine Bericht mit einzelnen Wörtern, ohne Assoziationslisten und ohne Stärken.

```sh
# Rohdaten holen (nach $PSST_RAW, nie ins Repo): USF (8 Dateien, 11 MB) und ConceptNet (500 MB)
mkdir -p $PSST_RAW/usf $PSST_RAW/cn
for f in A-B C D-F G-K L-O P-R S T-Z; do curl -o $PSST_RAW/usf/Cue_Target_Pairs.$f http://w3.usf.edu/FreeAssociation/AppendixA/Cue_Target_Pairs.$f; done
curl -o $PSST_RAW/cn/cn.csv.gz https://s3.amazonaws.com/conceptnet/downloads/2019/edges/conceptnet-assertions-5.7.0.csv.gz

node tools/psst-data/assoc.mjs prepare      # Rohdaten (USF, ConceptNet) -> $PSST_RAW/assoc/*.json, einmalig, ca. 2 min
node tools/psst-data/assoc.mjs              # bewertet alle Karten, schreibt games/psst/data/assoc-report.json, druckt die Zusammenfassung
node tools/psst-data/assoc.mjs --suggest    # listet zusätzlich starke fehlende Wörter (Kandidaten für assoc-swaps.txt)
node tools/psst-data/assoc.mjs --apply      # schreibt die Tausche aus assoc-swaps.txt nach curated.json ("fix"), dann build.mjs, check.mjs, assoc.mjs
```

**Quellen und Stand.** SWOW-DE (Small World of Words, Deutsch, 5.877 Cues, arXiv 2604.19620) wäre die beste Quelle, aber der Download auf `https://smallworldofwords.org/en/project/research` verlangt Name und E-Mail,
die Lizenz ist CC BY-NC-ND 3.0 (keine Weitergabe, keine Bearbeitungen). Deshalb wurde SWOW-DE nicht benutzt. Stattdessen:

1. **USF Free Association Norms** (Nelson, McEvoy & Schreiber 1998, Englisch, `http://w3.usf.edu/FreeAssociation/AppendixA/Cue_Target_Pairs.*`, frei herunterladbar). Per Hand übersetzt (siehe unten).
2. **ConceptNet 5.7** (CC BY-SA 4.0, `https://s3.amazonaws.com/conceptnet/downloads/2019/edges/conceptnet-assertions-5.7.0.csv.gz`), nur deutsch-deutsche Kanten `RelatedTo`, `Synonym`, `SimilarTo`, `PartOf`, `IsA` (Oberbegriffe).
   Die deutschen Kanten sind lexikalisch (Wiktionary), keine Alltagsassoziationen. Sie zählen nur als zusätzlicher Treffer für Karten, die die USF-Normen abdecken (Messung: 19 % der Tabuwörter stehen unter den ConceptNet-Nachbarn, bei vertauschten Karten 0,3 %).

**Übersetzung (lokal, nicht im Repo).** Unter `$PSST_RAW/assoc/maps/` liegen die handgemachten Tabellen: `cue-map-*.txt` (`Suchbegriff = englischer USF-Cue | Alternative`, `-` entfernt eine Zuordnung),
`en2de-*.txt` (`english = Deutsch/Deutsch2`, Kleinschreibung = kein Substantiv) und `cue-tgt-*.txt` (`cue>target = Deutsch`, korrigiert den Sinn eines Worts nur für einen Cue, `-` ignoriert es).
Mehrdeutige Suchbegriffe (Bank, Schloss, Birne, Fliege, Zug, Tor, Ring, Stein, Kran, Zecke ...) sind bewusst nicht zugeordnet, sie gelten als "keine Daten". Ohne diese Tabellen kann der Bericht nicht neu berechnet werden, die Tests brauchen sie nicht.

**Bewertung pro Karte.**
- `covered`: der Suchbegriff hat einen eindeutigen USF-Cue. Sonst `{ "covered": false }` = keine Daten (nicht schlecht). Personen, Filme, Orte und Zusammensetzungen fehlen meist.
- `score` (0..5): wie viele der 5 Tabuwörter unter den Assoziationen stehen (USF, höchstens 25 Antworten, mindestens ca. 2 % der Teilnehmer, übersetzt; dazu ConceptNet-Nachbarn). Gleich ist: gleicher Wortstamm, Singular/Plural, Wortteil eines Kompositums (mindestens 5 Buchstaben).
- `weak`: Tabuwörter ohne Treffer. Das ist ein Hinweis, kein Urteil: Normen von Amerikanern aus den 1970ern, übersetzt, kennen z. B. keine Marken und Fernsehsendungen.
- `missing` (höchstens 3): eine der 3 häufigsten Assoziationen, die nicht auf der Karte steht, nicht den Wortstamm des Suchbegriffs teilt, nicht zu allgemein ist (Essen, Zeit, Spaß ...) und die Regeln von `check.mjs` einhält. Oft das erste Wort, das ein Erklärer sagt.

**Anwenden.** Nichts wird automatisch getauscht. `--suggest` zeigt starke Kandidaten, die Entscheidung (höchstens 2 Tausche pro Karte) steht in `assoc-swaps.txt`. `--apply` prüft: Karte existiert, nicht im Paket `start`,
altes Wort steht auf der Karte, neues Wort ist durch die Normen belegt, `check.mjs`-Regeln. Danach `build.mjs`, `check.mjs` und `assoc.mjs` (Bericht neu). Das Paket `start` wird nie geändert, dort liefert nur der Bericht Hinweise.

**Prüfseite.** `games/psst/review/` zeigt pro Karte "Assoziationen: 3/5" (oder "keine Daten"), gestrichelte Tabuwörter ohne Treffer und "Häufig genannt, fehlt:" mit einem Knopf "übernehmen" (ersetzt das letzte schwache Tabuwort, landet als normale Bearbeitung im Export, "Original wiederherstellen" nimmt es zurück).
"Reihenfolge" wechselt zwischen Originalreihenfolge und "Schwächste zuerst" (Standard in allen Paketen außer `start`). Das Exportformat ist unverändert.
