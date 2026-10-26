# Quellen und Lizenzen der Psst!-Kartendaten

Die Karten in `packs/*.json` sind abgeleitete Daten. Sie entstehen mit den Werkzeugen in `tools/psst-data/` aus offenen Sprachdaten
und eigenen Texten (siehe `docs/adr/0001-psst-kartendaten-aus-offenen-quellen.md`). Pro Karte steht im Feld `src`, woher die Tabuwörter kommen:

| `src` | Bedeutung |
| --- | --- |
| `ai` | Suchbegriff und Tabuwörter von Hand/KI geschrieben, Suchbegriff und Prüfhilfen (Häufigkeit, Wortstämme) aus den Quellen unten |
| `ot` | Tabuwörter automatisch aus Wortschatz Leipzig und OpenThesaurus vorgeschlagen |
| `kovah` | Tabuwörter aus Kovah/Taboo-Data |
| `mixed` | Mischung mehrerer Quellen oder vom Besitzer in der Prüfseite bearbeitet |

## Wortschatz Leipzig (CC BY 4.0)

Korpora `deu_mixed-typical_2011_1M` und `deu_news_2023_1M` der Leipzig Corpora Collection (Universität Leipzig, https://wortschatz.uni-leipzig.de/,
Download: https://downloads.wortschatz-leipzig.de/corpora/). Genutzt: Worthäufigkeiten (Schwierigkeit, Substantiv-Erkennung) und Satz-Kookkurrenzen
(Vorschläge für Tabuwörter). Lizenz: Creative Commons Attribution 4.0 (CC BY 4.0).

Quellenangabe: D. Goldhahn, T. Eckart & U. Quasthoff: Building Large Monolingual Dictionaries at the Leipzig Corpora Collection: From 100 to 200 Languages.
In: Proceedings of the 8th International Language Resources and Evaluation Conference (LREC 2012).

## OpenThesaurus (CC BY-SA 4.0 oder LGPL 2.1, hier: CC BY-SA 4.0)

OpenThesaurus, deutscher Thesaurus (Daniel Naber u. a., https://www.openthesaurus.de/, Export `openthesaurus_dump.tar.bz2`, Stand Oktober 2026).
Genutzt: Lemmaliste, Synonyme, Ober- und Unterbegriffe, Assoziationen als Kandidaten für Tabuwörter.
Lizenz: Creative Commons Attribution-ShareAlike 4.0 International (alternativ LGPL 2.1). Namensnennung: "OpenThesaurus, https://www.openthesaurus.de".

## Kovah/Taboo-Data (GPL-3.0-or-later)

Paket `taboo-data` 2.0.0 (https://github.com/Kovah/Taboo-Data, Autor: Kovah), deutsche Dateien `src/data/de/*.json`.
Genutzt: Tabuwörter ausgewählter Karten (hauptsächlich Personen, Tiere, Essen, Internet, Autos) in `tools/psst-data/curated/kovah.txt`, nach Prüfung, Auswahl und teils mit Korrekturen von Tippfehlern.
Lizenz: GNU General Public License v3.0 oder später.

## Lizenz der abgeleiteten Kartendateien

Weil CC BY-SA 4.0 (OpenThesaurus) und GPL-3.0 (Kovah) Weitergabe unter gleichen Bedingungen verlangen, stehen die abgeleiteten Kartendateien
(`games/psst/data/packs.json`, `games/psst/data/packs/*.json`) unter den jeweiligen Lizenzen der Quellen: Karten mit `src` = `kovah` oder `mixed` mit Kovah-Anteil unter
GPL-3.0-or-later, Karten mit OpenThesaurus-Anteil (`ot`, `mixed`) zusätzlich unter CC BY-SA 4.0. Reine eigene Texte (`ai`) enthalten keine
übernommenen Quelltexte und werden unter der Lizenz des Repositories bereitgestellt. Die Rohdaten selbst gehören nicht ins Repository und liegen nur lokal vor.

Die Originalkarten des Spiels "Tabu" (Hasbro) wurden nicht verwendet. Der Name "Tabu" ist eine Marke von Hasbro, deshalb heißt das Spiel "Psst!".
