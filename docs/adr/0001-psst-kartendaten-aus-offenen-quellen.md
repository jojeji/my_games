# Psst!: Karten selbst geschrieben, mit offenen Sprachdaten geprüft

Eine frei nutzbare, geprüfte deutsche Tabu-Kartensammlung gibt es nicht. Die Originalkarten (Hasbro) sind geschützt, und die einzige freie Sammlung (Kovah/Taboo-Data, GPL-3.0) ist lückenhaft: Rund ein Drittel ihrer Karten hat kein oder nur ein verbotenes Wort. Ursprünglich wollten wir die Tabuwörter automatisch aus OpenThesaurus (CC BY-SA 4.0) und aus Wortpaaren der Korpora von Wortschatz Leipzig (CC BY) ableiten. Das war im Versuch unbrauchbar: Die Wortpaare kommen überwiegend aus Nachrichtentexten, daher etwa „Wetter → Klima, erwarten, rechnen“ und „Banane → Unsinn“, und für Alltagsdinge fehlen sie fast ganz. Deshalb sind die Karten KI-geschrieben (Sonnet) und werden mit offenen Quellen und von Menschen geprüft:

- 99 % aller Suchbegriffe und Tabuwörter sind im Leipziger Wortschatz belegt. Das sichert Rechtschreibung und Existenz, nicht die Auswahl.
- Regelprüfung im Build: genau 5 Tabuwörter, kein gemeinsamer Wortstamm, keine Dubletten, eine Sperrliste.
- 78 Personen-Karten stammen aus Kovah, bereinigt und ergänzt.
- Menschliche Prüfung: Das Startpaket wird vom Besitzer über `games/psst/review/` geprüft, alle Karten zusätzlich über „Karte melden“ im Spiel.

## Consequences

- Die Karten sind eine eigene Leistung und keine geprüfte Fremdbibliothek. Ihre Qualität entsteht durch Prüfung und Rückmeldungen, nicht durch die Quelle.
- Lizenzen: Die Personen-Karten aus Kovah stehen unter GPL-3.0. Quellen und Namensnennung stehen in `games/psst/data/QUELLEN.md`.
- Der Name „Tabu“ ist eine Marke (Hasbro), deshalb heißt das Spiel „Psst!“.
