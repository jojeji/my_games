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
