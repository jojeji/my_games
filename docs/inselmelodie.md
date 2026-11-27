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
| Grafik | KI-Bilder des Besitzers (Prompt und Dateiliste in `docs/inselmelodie-bilder.md`, alle 23 Motive geliefert) als WebP in `games/inselmelodie/img/`. SVG nur noch als Ersatz, falls ein Bild fehlt oder nicht lädt (wie die Porträts bei Merlin). |
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

## Vorschau (2026-11-27): Spielwelt ohne Klavier

Auf Wunsch des Besitzers vor dem Bericht der Mikrofon-Probe gebaut, damit er die Welt sehen und durchklicken kann (er hat selbst kein
Klavier; geübt wird bei der Schwester). Direkter Link `games/inselmelodie/`, **nicht im Hub** (`games.json`) und nicht im Precache.

- **Eingabe „Bildschirm-Tastatur“ (Standard der Vorschau)**: die Mini-Tastatur ist spielbar und klingt (Glockenspiel). Umschalter in den
  Einstellungen auf „Mikrofon (Klavier)“ nutzt `mic.js` (= Probe-Erkennung) mit Kalibrierung „Mittel-C finden“ vor der ersten Aufgabe.
  Im Mikrofon-Modus spielt die App während des Zuhörens keine Töne (ADR 0004); „Anhören“ schaltet die Erkennung so lange stumm.
- **Inhalt**: Inseln 0–3 vollständig (Rundgang, 8 Noten mit Inseltier, 3 Notenspiele, 12 Stücke), Insel 4 „Höhleninsel“ als „bald“.
  Schalter „Alle Inseln offen (Vorschau)“ steht an; ausgeschaltet öffnet eine Insel erst, wenn die vorige geschafft ist.
- **Farben je Tonname** (`music.js NOTE_COLORS`) passen zu den Tieren: C grün, D blau, E orange, F pink, **G gelb** (damit Chamäleon und
  Gecko über die Farbe unterscheidbar sind), A braun, H rot.
- **Fingernummern** nur in der C-Lage (C1 … G5); A, H, hohes C ohne Nummer, bis Lagenwechsel geplant sind (offener Punkt).
- **Notenspiel**: ohne Notennamen und ohne leuchtende Taste (sonst wird abgelesen statt gelesen); die Taste leuchtet erst nach einem Fehlgriff.
- **Sterne**: 0 Fehlgriffe = 3, bis 10 % (mind. 1) = 2, sonst 1. **Sammelstück** je geschaffter Insel (Muschel, Seestern, Schneckenhaus, Truhe).
- Geprüft mit Playwright bei 1280×800 (Ziel), 844×390 und 390×844 (hochkant: Hinweis „quer halten“, nutzbar, aber eng).
- Dateien: `music.js`, `world.js` (alle Inhalte und Sätze des Papageis), `session.js` (Wartemodus, Notenspiel, Fortschritt), `staff.js`
  (SVG-Notenzeile, eigener Violinschlüssel als Linie, da 𝄞 auf Android nicht sicher vorhanden ist), `keyboard.js`, `audio.js`, `mic.js`,
  `ui.js`, `main.js`. Tests: `tests/inselmelodie-world.test.mjs` (u. a. „jedes Stück nutzt nur bis dahin eingeführte Noten“).

## Fassung 2 (2026-11-27): Abenteuerkarte, Führung, Spielgefühl

Rückmeldung des Besitzers zur ersten Vorschau: zu statisch und lieblos, der Papagei überdeckte Text („darf überhaupt nicht
passieren“), nach einer geschafften Insel fehlte die Führung zur nächsten; gewünscht: verschiebbare Karte mit Pfad, Bootsfahrt,
mehr Energie, Animationen mit Liebe, Prüfung durch spielende Agenten in mehreren Runden. Umgesetzt und in drei Spieltest-Runden
(Sonnet-Agenten spielen per Playwright, Berichte eingearbeitet) geprüft:

- **Karte** (`mapgeo.js` DOM-frei + `map-view.js`): Welt größer als der Bildschirm (quer waagrecht, hochkant senkrecht scrollbar,
  Maus: ziehen + Rad), Seeweg als Catmull-Rom-Kurve durch Wegpunkte, geschaffter Teil gold, Wellen/Felsen/Möwen, ab und zu ein
  springender Delfin. Inselgröße folgt der Bildschirmhöhe, Abstände so, dass sich Inseln nie überlappen (Test). Oben/unten Zonen
  für Kopfleiste und Papagei/Knopf (`padTop/padBottom`), damit Inseln dort nicht liegen.
- **Boot und Hafen**: das Boot liegt im Hafen NEBEN der Insel (nie auf dem Schild, unter der Inselebene), legt beim Fahren ab,
  folgt dem Weg und legt an; Kamera folgt; Tippen aufs Wasser oder „Weiter üben“ beschleunigt die Fahrt.
- **Führung**: Inseln öffnen nacheinander (`allOpen` nur noch unter „Für Erwachsene“). Letzte Aufgabe einer Insel → Ergebnis →
  Sammelstück („Leinen los!“) → Karte → Bootsfahrt → Freischaltung (Schloss springt weg, Insel wird bunt, Funken). `p.revealed`
  merkt sich gezeigte Freischaltungen, `p.boat` den Hafen. Nach allen Inseln einmalige Abschlussfeier (`p.finale`), danach
  „Sterne sammeln“ = Aufgabe mit den wenigsten Sternen (`weakestTask`). Spielstand Version 2 (Migration setzt alte Vorschau-
  Spielstände auf geführt zurück, Sterne bleiben).
- **Insel**: Aufgaben als Trittsteine mit gepunktetem Weg, „Hier weiter“ an der nächsten.
- **Spielen**: Fortschritt als Boot, Serien-Flamme mit Lob alle 5 Treffer, Funken beim Treffer, sanftes Wackeln beim Fehlgriff,
  Vibration (Android, abschaltbar), Abschluss-Welle über alle Noten, Sterne einzeln mit Klang. Fehlgriff = Geisternote (immer nur
  eine), Satz des Papageis erklärt gleiche Note in falscher Oktave („zu hoch, weiter links“). „Anhören“ ist abbrechbar (eine
  Taste stoppt nur, wird nicht gewertet).
- **Notenspiel**: ohne Namen, Fingernummern und leuchtende Taste; jede Note schwimmt von rechts heran (Bläschen, Wellen), darf
  schon beim Heranschwimmen gespielt werden; 16 Noten.
- **Sterne fairer**: gezählt werden Noten mit Fehlgriff, nicht Tastendrücke. Stück: 0 → 3, bis 25 % → 2; Notenspiel: bis 1 → 3,
  bis 30 % → 2. Lob passend zur Fehlgriffzahl, Sätze in Varianten (`LINES` in world.js, reihum).
- **Layout-Regel**: der Papagei hat überall eine eigene Spalte/Zeile. `tools/ui-inselmelodie.cjs` spielt den Ablauf in
  beliebiger Größe durch und meldet verdeckte oder abgeschnittene Texte (geprüft: 1280×800, 1024×600, 844×390, 390×844, 360×740).
- **Album**: Tiere antippbar (Karte mit Note im Notensystem und Ton), Sammelstücke sagen, woher sie stammen.

### Spieltest Runde 3 (eingearbeitet)

- Hochkant verdeckten Blase/Papagei auf der Karte Inselnamen (die Prüfung hatte Karteninhalt unter den Leisten pauschal
  ausgenommen): Fokus jetzt mittig im freien Band zwischen den Leisten, die Blase klappt nach 6 s ein (Tippen auf den Papagei
  zeigt sie wieder), die Prüfung meldet die Insel mit dem Boot (`.island.here`) wieder, wenn eine Leiste sie verdeckt.
- Anlegen: Boot wippt, Spritzer, Vibration; „Weiter üben“ pulsiert nach der Freischaltung; Sätze sagen, was als Nächstes kommt.
- Sammelstück-Feier überlebt Neu laden (`p.collectShow`), Ergebnis-Knöpfe erst nach den Sternen, Fahrten zu besuchten Inseln
  schneller (`travel(id, {fast})`), Zurück nach „Fortschritt löschen“ führt zum Start.
- Notenspiel: drei **Notenfische** (Notenkopf mit Schwanzflosse und Auge, ohne Hals) schwimmen gestaffelt heran.
- Erstes Stück heißt „Lang und kurz“ (C in Vierteln, Halben, Ganzen statt 7× derselbe Wert).

## Fassung 3 (2026-11-27): Höhleninsel und Brückeninsel

Nach „fühlt sich schon gut an, gerne so weiter“ (Besitzer): die nächsten zwei Inseln, ohne neue Technik am Mikrofon
(weiterhin ein Ton gleichzeitig; Akkorde und beide Hände gleichzeitig warten auf den Bericht vom echten Klavier).

- **Notensystem** (`staff.js`): `staffLayout(midis)` wählt Violinschlüssel (nur ab Mittel-C), Bassschlüssel (nur darunter) oder
  beide Zeilen (Klaviersystem, Höhe 560 statt 400). `clefFor`: Mittel-C gehört zur rechten Hand (oben). Bassschlüssel als
  gezeichneter F-Schlüssel (Punkt + Bogen + zwei Punkte um die F-Linie). Hilfslinien allgemein über die Stufe relativ zur untersten Linie.
- **Fingersatz** (`music.js fingerOf`): rechts C4..G4 = 1..5, links C3..G3 = 5..1. Stücke ab der Höhle bleiben in diesen
  Fünf-Finger-Lagen (Test).
- **Höhleninsel**: Rundgang „Die linke Hand“ (Bassschlüssel, gespiegelte Hand, tiefes C), Lernen C3/D3/E3 → Notenspiel → „Tropfen“ →
  F3/G3 → Notenspiel → „Höhlenecho“, „Hänschen klein (links)“, „Ode an die Freude (links)“. Tierkarten der tiefen Töne mit eigenen
  Texten zur Lage im Bassschlüssel (gleiches Tier wie oben, nicht doppelt im Album).
- **Brückeninsel**: Rundgang „Zwei Zeilen, zwei Hände“, Notenspiel über beide Zeilen, „Wellenschaukel“, „Frage und Antwort“,
  „Hänschen klein mit Echo“, „Ode an die Freude (zwei Hände)“: die Melodie wandert zwischen den Händen, nie beide zugleich.
- **Karte**: 6 Inseln (`mapgeo.js`, `L` 3450); Sammelstücke Höhlenkristall und Kompass; Abschlussfeier nach der Brückeninsel
  (`p.finale` = Anzahl Inseln bei der letzten Feier: kommen Inseln dazu, gibt es am neuen Ende wieder eine Feier).
- **Bilder**: Platzhalter für Brückeninsel, Kristall, Kompass (Prompt in `docs/inselmelodie-bilder.md` „Nachlieferung“).
