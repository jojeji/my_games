# Inselmelodie (Spezifikation)

Sechstes Spiel der Seite, **kein Inkrementalspiel**: ein Klavier-Übungsspiel für ein etwa 10-jähriges Mädchen, das gerade
Notenlesen lernt. Ein Android-Tablet liegt im Querformat auf dem Notenpult eines alten akustischen Klaviers und hört über das
Mikrofon zu. Die Spielerin reist mit einem Papagei über eine Inselkette; jede Insel ist ein Kapitel, auf jeder Insel lernt sie
neue Noten.

id `inselmelodie`, Ordner `games/inselmelodie/`. Begriffe: `games/inselmelodie/GLOSSARY.md` (verbindlich für Code, UI-Texte, Commits).
Architektur der Tonerkennung: `docs/adr/0004-inselmelodie-tonerkennung-per-mikrofon.md`. Bild-Prompt: `docs/inselmelodie-bilder.md`.
`docs/LESSONS.md` gilt für Mobile UI, PWA/Deploy und Arbeitsweise; Prestige, Idle und Story gelten hier nicht.

Entstanden aus einer Befragungsrunde mit dem Besitzer (2026-11-26). Alles unter „Rahmen“ und „Entscheidungen“ ist dort beschlossen.

## Rahmen des Besitzers (nicht verhandelbar)

1. **Ersatz für ein Abo-Lernprogramm, aber kein Nachbau.** Eigenes Konzept, eigene Welt, eigene Texte, keine Namen, Grafiken oder Abläufe
   einer bestehenden App. Kleiner persönlicher Übungsbegleiter statt Komplettkurs mit Hunderten Liedern.
2. **Akustisches Klavier, Erkennung über das Mikrofon.** Kein MIDI. Gerät: Android-Tablet mit Chrome, **Querformat**.
3. **Kein Lehrer.** Die App trägt den Lernweg selbst, inklusive Orientierung auf der Klaviatur, Fingernummern und Notenwerten.
4. **Kindgerecht, farbenfroh, ein durchgehendes Thema** (Inselkette) mit Kapiteln. Sie bedient alles allein.
5. **Kein Druck:** keine strafende Tagesserie, keine Zeitlimits in Stücken, kein Punktabzug im Wartemodus.
6. **Nur gemeinfreie oder frei lizenzierte Musik im Repo** (die Seite ist öffentlich). Melodien in eigener, vereinfachter Fassung setzen,
   nie fremde Arrangements abschreiben.
7. **Daten bleiben auf dem Tablet.** Kein Konto, kein Server, das Mikrofon wird nur lokal ausgewertet, nichts wird aufgenommen.

## Entscheidungen

| Thema | Entscheidung |
|---|---|
| Darstellung | **Echte Noten im Notensystem**, laufen von rechts nach links. Balkenmodus (fallende Balken auf einer Tastatur) später als zusätzlicher Modus. |
| Hilfen | Farbige Notenköpfe (eine Farbe je Tonname), Tonname neben der Note, Fingernummer über der Note, Mini-Tastatur am unteren Rand mit leuchtender Zieltaste, Inseltier als Merkhilfe. Die Hilfen fallen in späteren Kapiteln schrittweise weg. |
| Spielmodus | **Wartemodus** (die Musik wartet auf den richtigen Ton) als Standard. Tempomodus (im Takt spielen) ist das spätere Ziel. |
| Notenwerte | Von Anfang an richtig dargestellt (Viertel, Halbe, Ganze) und kurz erklärt, bewertet wird aber zunächst nur die richtige Taste. |
| Falsche Note | Die gespielte Note erscheint kurz als **Geisternote** an ihrer Stelle im Notensystem, die gesuchte Taste leuchtet unten auf. Kein Fehlerton. |
| Kalibrierung | Einmalig beim ersten Start (unter einer Minute), jederzeit wiederholbar: Sie spielt das Mittel-C, die App merkt sich die Verstimmung. Ist zugleich die Übung „Mittel-C finden“. |
| Ton aus dem Tablet | Beim Spielen in der ersten Fassung **keine Begleitmusik** (das Mikrofon würde sie mithören). „Anhören“ vor dem Stück, Effektklänge und Animationen bei Erfolgen ja. Begleitmusik später als Versuch. |
| Klang | Im Browser synthetisiert (WebAudio, Glockenspiel-/Spieluhr-Charakter). Echte Klavier-Samples mit freier Lizenz erst später. |
| Welt | **Inselkette**: Inselkarte, jede Insel ein Kapitel, je neue Note ein **Inseltier** mit dem Tonnamen als Anfangsbuchstaben. Begleiter ist ein Papagei mit Segelboot, **den die Spielerin beim ersten Start selbst benennt**. |
| Grafik | Zuerst SVG (von uns gezeichnet). KI-Bilder des Besitzers (Prompt in `docs/inselmelodie-bilder.md`) ersetzen sie später als WebP, fehlende Bilder fallen auf das SVG zurück (wie die Porträts bei Merlin). |
| Belohnung | 1–3 Sterne je Stück (nach Fehlgriffen; Schwellen nach den ersten Tests), Sammelstücke (Muscheln, Tiere im Inselalbum). Tagesserie nur sanft, nichts geht verloren. |
| Ablauf | Großer Knopf **„Weiter üben“** führt zur nächsten sinnvollen Aufgabe, Inselkarte für freie Wahl daneben. Eine Übungseinheit ~10–15 min, dann „Für heute geschafft“, weiterspielen erlaubt. |
| Notenpult | Tablet 50–70 cm vor ihr: Notensystem ~⅓ der Bildhöhe, Bildschirm bleibt an (Wake Lock), Querformat fest. Beim Spielen keine Hand am Tablet nötig: Start und Weiter über einen gespielten Ton. |
| Spielstand | Nur auf dem Tablet (`engine/save.js`), Export/Import als Sicherung, ein Profil. |
| Moderne Lieder | Erste Fassung nur gemeinfrei, mit bewusst vielen bekannten Klassik-Häppchen. Später **„Eigene Lieder“**: Eingabe oder Notendatei-Import (MusicXML), gespeichert nur auf dem Tablet, nie im Repo. |

## Lernweg (erste Fassung = Inseln 0–3)

Jede Insel: neue Note(n) kennenlernen (Tier, Lage im Notensystem, Taste) → **Notenspiel** → 2–4 kurze **Stücke** mit genau diesen Noten.
Eine Note gleichzeitig, rechte Hand, Violinschlüssel. Zwei gleichzeitige Töne erst, wenn sie am echten Klavier erprobt sind.

| Insel | Inhalt | Inseltiere |
|---|---|---|
| 0 Orientierung | Klaviatur (Zweier-/Dreiergruppen der schwarzen Tasten), **Mittel-C finden** (= Kalibrierung), Fingernummern 1–5, Haltung (Bild) | Papagei |
| 1 | C D E (Finger 1–3), Viertel und Halbe | Chamäleon, Delfin, Eule |
| 2 | F G (Fünftonraum C), Ganze, Pause | Flamingo, Gecko |
| 3 | A H C' | Affe, Hummer, Clownfisch |
| später 4 | Bassschlüssel, linke Hand (C3–C4) | |
| später 5 | beide Hände abwechselnd | |
| später 6 | einfache Zweistimmigkeit, Tempomodus | |

Die Tier-Merkhilfe wird mit den anderen Hilfen ausgeblendet (sonst wird sie zum Umweg „erst Tier, dann Note“).

### Stücke (Entwurf, der Besitzer streicht und ergänzt)

Alle Melodien vor dem Setzen am Original prüfen (Tonumfang, gemeinfrei). Jede Insel bekommt außerdem eigene kleine Übungsstücke mit Inselnamen.

| Insel | Stück | Hinweis |
|---|---|---|
| 1 | nur eigene Übungsstücke | bekannte Lieder mit nur C D E gibt es kaum |
| 2 | „Hänschen klein“, „Kuckuck, Kuckuck“, „Ode an die Freude“ (Beethoven), „Jingle Bells“ (Refrain) | Fünftonraum C bis G |
| 3 | „Alle meine Entchen“, „Morgen kommt der Weihnachtsmann“, Brahms' Wiegenlied („Guten Abend, gut' Nacht“) | braucht A, H, C' |
| später | „Happy Birthday“ (in der EU seit 2017 gemeinfrei), „Für Elise“ (Anfang), „In der Halle des Bergkönigs“, „The Entertainer“ (Joplin), Cancan (Offenbach), Nussknacker, Habanera („Carmen“), „Summ, summ, summ“ | größerer Tonumfang, Vorzeichen oder linke Hand |

## Ausbaustufen

1. **Machbarkeitsprobe** (umgesetzt, siehe unten): Testseite für die Tonerkennung am echten Klavier. **Ohne erfolgreiche Probe wird nichts weiter gebaut.**
2. **Erste spielbare Fassung**: Inseln 0–3, Kalibrierung, Notenspiel, Wartemodus, 8–12 Stücke, Inselkarte, Sterne, Sammelstücke,
   Effektklänge und Animationen, Begleiter mit eigenem Namen. Hub-Eintrag `status: "soon"` bis zur Abnahme.
3. **Später**: Bassschlüssel und linke Hand, beide Hände, Tempomodus, Balkenmodus, Begleitmusik (Versuch), Klavier-Samples, „Eigene Lieder“.

## Machbarkeitsprobe (Stufe 1)

Seite `games/inselmelodie/probe/` (nicht im Hub, nicht im Precache; direkter Link). Ablauf: Mikrofon starten → Mittel-C 3–4-mal spielen
(Kalibrierung) → Treffertests (Tonleiter, Wiederholungen, „Hänschen klein“, schwarze Tasten, tiefe und hohe Töne für später) →
„Bericht kopieren“ und in den Chat einfügen. Einstellungen (Tor, Mindest-Klarheit, Anschlag-Sprung) sind Schieberegler, damit ein
Fehlbild sofort eingeordnet werden kann.

**Abnahme (am echten Klavier, Tablet auf dem Notenpult, normal gespielt):**
- Tonleiter und „Hänschen klein“: ≥ 95 % richtig, höchstens 1 Falschmeldung je Durchgang, keine verpasste Note, die nach normalem Anschlag nicht kam.
- Wiederholte gleiche Töne werden einzeln gemeldet.
- Gefühlte Verzögerung stört nicht (gemessen bei künstlichen Tönen: ~0,13 s nach dem Anschlag).
- Leise gespielte Töne werden erkannt, Sprechen im Raum erzeugt keine Notenmeldungen (bzw. selten genug, um im Wartemodus nicht zu stören).

### Gemessen (künstliche Klaviertöne, `tests/inselmelodie-pitch.test.mjs`, Browser mit Testdatei statt Mikrofon)

- C3–C6 ohne Oktavfehler, auch mit fast fehlendem Grundton (5 % Amplitude); reiner Sinus auf < 1 Cent genau.
- Verstimmung -60 Cent: ohne Kalibrierung jede Note einen Halbton daneben, mit Kalibrierung alle richtig (gemessene Verstimmung -57: die
  gespreizten Obertöne heben die Messung um einige Cent, die Kalibrierung nimmt das mit).
- Gleiche Note mehrfach: einzeln erkannt bis 0,2 s Abstand, bei 0,15 s verschmelzen die Anschläge (für den Wartemodus unkritisch).
- Meldung ~126 ms nach dem Anschlag (Fenster 2048 Werte + 2 stabile Fenster).
- Chromium (Desktop): 1,2 ms Rechenzeit je Fenster bei 60 Fenstern/s; Kalibrierung auf 3 Cent genau, danach alle Noten bei 1–2 Cent.
- **Noch nicht gemessen: echtes Klavier, echtes Tablet-Mikrofon, Raumgeräusche.** Das ist die Aufgabe der Probe.
