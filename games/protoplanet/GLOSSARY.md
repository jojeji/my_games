# Protoplanet

Ruhiges Physik-Levelspiel fürs Handy: Ein Staubkorn in einer jungen Sternscheibe bewegt sich nur durch Ausstoß von Masse, absorbiert kleinere Körper und wird von größeren absorbiert. Spezifikation: `docs/protoplanet.md`.

## Welt

**Körper**:
Jeder Kreis im Spiel, auch der Spieler und ausgestoßene Teilchen. Hat Position, Geschwindigkeit und Masse; der Radius ist die Wurzel der Masse.
_Avoid_: Zelle, Mote, Blob, Kugel, Ball

**Spieler**:
Der Körper, den du steuerst. Startet in jedem Level mit Masse 1.
_Avoid_: Held, Avatar, Staubkorn (das ist nur Flavour)

**Masse**:
Die Größe eines Körpers (proportional zur Fläche). Entscheidet, wer wen absorbiert.
_Avoid_: Größe (nur umgangssprachlich in UI-Texten), Gewicht, Leben

**Teilchen**:
Ein Körper, der durch Ausstoß entstanden ist. Physikalisch ein normaler Körper.
_Avoid_: Projektil, Schuss, Tropfen

**Jäger**:
KI-Körper (`kind: 'hunter'`, ab Kapitel 2). Gleiche Physik wie der Spieler: Ausstoß kostet Masse, seine Teilchen sind normale, fressbare Körper. Jagt Kleineres (auch den Spieler), flieht vor Größerem (auch vor dem Spieler). Reagiert langsam (0,5–1,5 s), zielt ungenau, zögert manchmal, hat einen schlechteren Antrieb als du. Darstellung: gestrichelter Ring, Farbe wie immer relativ zum Spieler, Ausstoß warm und sichtbar. Stufen `easy` | `normal` | `hard` (`T.hunter`).
_Avoid_: Gegner, Feind, KI, Boss, Monster

**Brocken**:
Sehr großer, langsamer Körper (Tag `rock`, doppelter Warnring), seit Paket A 6–7 Startmassen, in Levels mit Ziel „Werde unangreifbar“ (1-6, 1-7), höchstens einer je Level. Eine Gefahr, die man nicht fressen muss, nur überholen oder meiden. Er wächst von allein, wenn etwas vorbeitreibt (Zeitdruck).
_Avoid_: Hindernis (so hießen die 1,1–1,3 großen Körper in P1), Felsen, Riese

**Massenleiter**:
Die Stufen der Körper eines Levels (Staub, Kleine, Mittlere, Große), jede etwa gleich viel Gesamtmasse, damit der Spieler Stufe für Stufe wächst (am Ende 7–28 Startmassen) und die Kamera herausfährt.
_Avoid_: Größenklassen, Level-Ups

**Strömung**:
Gemeinsame Bewegung einer Gruppe von Körpern in einem Level (Wirbel um die Mitte, gegenläufige Ringe, Schwarm, Kometen). Es gibt keine Kraft, nur Anfangsgeschwindigkeiten: Wirbel-Körper fliegen auf Tangenten und bleiben dabei in einem Ring.
_Avoid_: Wind, Fluss, Gravitation

**Komet**:
Kleiner, schneller Körper (Geschwindigkeit ~ 1) in einer lebendigen Welt; Beute, die schwer einzuholen ist.
_Avoid_: Meteor, Geschoss

**Attraktor**:
Ein Körper, der andere anzieht (ab Kapitel 2), z. B. ein Protostern. Steht still oder folgt einer festen Bahn; spürt selbst keine Gravitation.
_Avoid_: Sonne, Gravitationsquelle, Planet

**Arena**:
Der kreisförmige Rand in Kapitel 1 und 2 (R 26–56), an dem Körper abprallen.
_Avoid_: Wand, Spielfeld, Käfig

**Abdrift**:
Im offenen Raum (ab Kapitel 2) zu weit vom Zentrum entfernt. Erst Warnung, dann verloren.
_Avoid_: Out of bounds, Flucht

## Aktionen

**Ausstoß**:
Der Spieler gibt einen Teil seiner Masse als Teilchen ab und bewegt sich in die Gegenrichtung (Impulserhaltung). Durch Tippen ein einzelner Ausstoß, durch Halten ein Strahl. Kostet Masse nach der Raketengleichung: Preis je Geschwindigkeitsänderung = `ejectSpeed`.
_Avoid_: Schuss, Schub, Boost, Dash

**Strahl**:
Wiederholter kleiner Ausstoß, solange der Finger liegt.
_Avoid_: Dauerfeuer, Jet

**Absorbieren**:
Zwei Körper überlappen sich, Masse fließt vom kleineren zum größeren, bis sie sich nur noch berühren. Verschwindet der kleinere ganz, ist er absorbiert.
_Avoid_: Fressen (nur umgangssprachlich), Verschmelzen, Einsaugen

## Zeit

**Zeitstufe**:
Wie schnell die Spielzeit läuft: ×¼, ×1, ×4 oder ×10. Ändert nur, wie viele feste Physikschritte pro Bild gerechnet werden.
_Avoid_: Zeitraffer, Speed, Tempo

**Spielzeit**:
Die im Level vergangene Zeit in Physik-Sekunden (unabhängig von der Zeitstufe). Grundlage für den Zeit-Stern.
_Avoid_: Echtzeit, Laufzeit

**Zurückspulen**:
Nach einem Verlust einige Sekunden zurück auf einen Schnappschuss. 3 Mal pro Level, kostet den Effizienz-Stern.
_Avoid_: Undo, Rewind (im UI), Leben, Continue

**Schnappschuss**:
Der vollständige Zustand eines Levels (alle Körper, Spielzeit, Zähler). Dient dem Zurückspulen und dem Weiterspielen nach dem Schließen der App.
_Avoid_: Savestate, Checkpoint

## Levels

**Kapitel**:
Eine Gruppe von Levels mit gemeinsamer Mechanik: Staubwolke (Grundlagen, Brocken), Jäger (KI-Körper), später Protostern (Attraktor), Dunkelwolke (begrenztes Sichtfeld), Planetensystem (alles).
_Avoid_: Welt, Akt, Episode

**Level**:
Eine feste Aufgabe: Levelfamilie + Seed + Parameter + Ziel + Stern-Ziele.
_Avoid_: Stage, Mission, Runde

**Lehrlevel**:
Von Hand gebautes Level, das genau eine Bedienung beibringt und eine Bedienhilfe zeigt.
_Avoid_: Tutorial (im UI)

**Levelfamilie**:
Ein Generator, der aus Parametern und einem Seed ein Level baut und dabei Grundregeln der Lösbarkeit einhält.
_Avoid_: Leveltyp, Template, Vorlage

**Seed**:
Die Zahl, aus der der Seed-Zufall ein Level erzeugt. Gleicher Seed = gleiches Level.

**Tageslevel**:
Ein Level, dessen Seed aus dem heutigen Datum kommt. Für alle gleich, ohne Server.
_Avoid_: Daily Challenge, Tagesaufgabe

**Ziel**:
Was im Level zu erreichen ist: letzter Körper werden, unangreifbar werden, Körper X (Zielkörper, auch ein Jäger) absorbieren, Masse M erreichen, Zentralkörper absorbieren, N Umläufe überleben.
_Avoid_: Quest, Auftrag

**Letzter Körper**:
Ziel `last` („Werde der letzte Körper“): gewonnen, wenn kein anderer Körper mehr existiert, der noch zählt, also keiner mit Masse ≥ `dustFrac` × Spielermasse. Anzeige „Noch N Körper“. Der eigene Ausstoß zählt nie.
_Avoid_: Alles absorbieren, Aufräumen, Survivor

**Unangreifbar**:
Ziel `largest` („Werde unangreifbar“): im Moment ist kein anderer Körper größer als du, weder Brocken noch Jäger noch (später) ein Attraktor. Gleiche Masse zählt als größer. Anzeige „Noch N größere“ (Zahl der Körper mit Masse ≥ deiner), der Balken zeigt eigene Masse / Masse des größten anderen Körpers. Zählt nur den Augenblick: was ein Jäger später durch Fressen werden könnte, zählt nicht.
_Avoid_: Größter Körper (so hieß das Ziel in P1)

**Staub**:
Ein Körper mit Masse unter `dustFrac` (0,03) × Spielermasse. Zählt für „Letzter Körper“ nicht; die Grenze wandert mit der Spielermasse.
_Avoid_: Krümel, Rest

**Zielkörper**:
Der markierte Körper, den ein `absorb`-Ziel verlangt (gestrichelter gelber Ring, Rand-Pfeil, wenn außerhalb des Bildes).
_Avoid_: Beute (nur im Bot), Boss

**Stern**:
Wertung eines Levels: geschafft, Effizienz (wenig Ausstoß, nicht zurückgespult), Zeit. Schaltet nichts frei.
_Avoid_: Medaille, Punkte

**Bedienhilfe**:
Einzeiliger Hinweis zur Steuerung in Lehrlevels. Keine Story.
_Avoid_: Tipp, Erzähler

## Werkzeuge

**Bot**:
DOM-freier Spieler, der mit derselben Physik in Node Levels spielt; misst Lösungsquote und Dauer. Läuft in Varianten (andere Entscheidungs-Phase), damit ein fester Seed nicht von einem Glückslauf abhängt. Sein Gehirn (`brain.js`) teilen sich Bot und Jäger; der Jäger ist die begrenzte Fassung davon, der Bot der perfekte Spieler.
_Avoid_: KI, Gegner (der Gegner im Spiel heißt Jäger)
