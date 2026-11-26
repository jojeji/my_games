# Inselmelodie

Klavier-Übungsspiel fürs Tablet im Querformat: Das Tablet hört über das Mikrofon, was auf einem akustischen Klavier gespielt wird.
Die Spielerin reist über eine Inselkette und lernt dabei Noten lesen. Spezifikation: `docs/inselmelodie.md`.

## Welt

**Inselkette**:
Die Welt des Spiels, gezeigt als Inselkarte. Jede Insel ist ein Kapitel des Lernwegs.
_Avoid_: Level-Auswahl, Kurs, Weltkarte

**Insel**:
Ein Kapitel: führt neue Noten ein und enthält Notenspiel und Stücke dazu. Nummeriert ab 0 (Orientierung).
_Avoid_: Kapitel (nur in Doku), Level, Lektion

**Inseltier**:
Merkhilfe für eine Note: ein Tier, dessen Name mit dem Tonnamen beginnt (C = Chamäleon, D = Delfin, E = Eule, F = Flamingo,
G = Gecko, A = Affe, H = Hummer, hohes C = Clownfisch). Wird mit den anderen Hilfen ausgeblendet.
_Avoid_: Maskottchen, Figur

**Begleiter**:
Der Papagei mit Segelboot, der durch die App führt und kurze Sätze sagt. Die Spielerin gibt ihm beim ersten Start einen Namen;
im Code gibt es keinen festen Namen.
_Avoid_: Maskottchen, Lehrer, Avatar

**Sammelstück**:
Belohnung im Thema (Muschel, Tier im Inselalbum), freigeschaltet durch geschaffte Stücke.
_Avoid_: Trophäe, Erfolg, Achievement

## Musik

**Note**:
Ein Zeichen im Notensystem: Tonhöhe + Notenwert. Intern ist die Tonhöhe eine MIDI-Nummer (60 = Mittel-C).
_Avoid_: Ton (das ist der Klang), Taste

**Ton**:
Was das Mikrofon hört: eine Frequenz mit Klarheit und Pegel.
_Avoid_: Note, Signal

**Taste**:
Die Klaviertaste. In der Mini-Tastatur der App leuchtet die gesuchte Taste auf.
_Avoid_: Knopf, Key

**Tonname**:
Deutscher Name ohne Oktave: C, D, E, F, G, A, **H** (B ist das erniedrigte H). Kinder sehen nur den Tonnamen, Erwachsene in der Probe
zusätzlich die wissenschaftliche Oktave (C4).
_Avoid_: Notenname, B für H

**Mittel-C**:
Das C in der Mitte des Klaviers (C4, MIDI 60, ~261,6 Hz), links neben den zwei schwarzen Tasten in der Mitte. Bezugspunkt für Orientierung und Kalibrierung.
_Avoid_: eingestrichenes c (nur in Doku), C1

**Notenwert**:
Dauer einer Note (Ganze, Halbe, Viertel). Wird dargestellt, im Wartemodus aber nicht bewertet.
_Avoid_: Länge, Rhythmus (das ist die Folge der Notenwerte)

**Fingernummer**:
1 = Daumen bis 5 = kleiner Finger, klein über der Note, solange die Hilfen an sind.
_Avoid_: Fingersatz (nur für die ganze Folge)

**Stück**:
Eine Melodie, die gespielt wird, mit 1–3 Sternen. Gemeinfrei oder eigene Übungsstücke.
_Avoid_: Song, Lied (nur im UI-Text für Volkslieder), Level

**Notenspiel**:
Kurzes Spiel ohne Melodie (1–2 min): einzelne Noten erscheinen, sie spielt sie, bevor sie ankommen.
_Avoid_: Quiz, Training, Minispiel

## Spielmodi und Hilfen

**Wartemodus**:
Die Noten bleiben stehen, bis der richtige Ton kommt. Standard für die erste Fassung.
_Avoid_: Übungsmodus, Pause

**Tempomodus**:
Die Noten laufen im Takt weiter, Zeitpunkt wird bewertet. Später.
_Avoid_: Spielmodus, Echtzeit

**Balkenmodus**:
Fallende Balken auf einer Tastatur statt Noten. Später, zusätzlich zur Notendarstellung.
_Avoid_: Synthesia-Modus

**Hilfen**:
Farbige Notenköpfe, Tonname neben der Note, Fingernummer, leuchtende Taste in der Mini-Tastatur, Inseltier. Fallen mit dem Fortschritt weg.
_Avoid_: Tipps, Cheats

**Geisternote**:
Kurz angezeigte graue Note an der Stelle des falsch gespielten Tons, damit der Abstand zur gesuchten Note sichtbar wird.
_Avoid_: Fehlernote, rote Note

**Fehlgriff**:
Ein gemeldeter Ton, der nicht die gesuchte Note ist. Zählt nur für die Sterne.
_Avoid_: Fehler, Leben, Strafe

**Anhören**:
Die App spielt das Stück vor (synthetisierter Klang), nie während sie selbst spielt.
_Avoid_: Vorspielen, Demo

## Tonerkennung

**Fenster**:
Ein Ausschnitt des Mikrofonsignals (2048 Werte, ~43 ms), etwa 60-mal pro Sekunde ausgewertet.
_Avoid_: Frame (nur im Code), Puffer

**Klarheit**:
Wie eindeutig ein Fenster einen Ton hat (0–1, Höhe der Spitze der normalisierten Autokorrelation). Unter `minClarity` gilt das Fenster als kein Ton.
_Avoid_: Konfidenz, Qualität

**Anschlag**:
Ein erkanntes Ereignis „eine Taste wurde gespielt“. Genau einer je gespielter Taste, auch bei gleichen Tönen hintereinander. Ausgelöst durch einen Pegelsprung
(oder, gebunden gespielt, durch einen stabilen Tonwechsel) und eine stabile Tonhöhe.
_Avoid_: Onset (nur im Code), Treffer (Treffer = richtiger Anschlag)

**Tor**:
Mindestpegel, ab dem ein Fenster als Ton zählt: Vielfaches des Grundrauschens.
_Avoid_: Schwelle (unspezifisch), Gate

**Verstimmung**:
Wie weit das Klavier insgesamt von der Normalstimmung (A = 440 Hz) abweicht, in Cent (100 Cent = ein Halbton). Ergebnis der Kalibrierung.
_Avoid_: Offset (nur im Code), Stimmung

**Kalibrierung**:
Messen der Verstimmung: Sie spielt das Mittel-C, der Median der Abweichungen wird gespeichert.
_Avoid_: Stimmen (das macht der Klavierstimmer), Einrichtung

**Probe**:
Die Testseite `games/inselmelodie/probe/`, mit der geprüft wird, ob die Tonerkennung am echten Klavier reicht.
_Avoid_: Demo, Prototyp
