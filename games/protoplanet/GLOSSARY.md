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

**Attraktor**:
Ein Körper, der andere anzieht (ab Kapitel 2), z. B. ein Protostern. Steht still oder folgt einer festen Bahn; spürt selbst keine Gravitation.
_Avoid_: Sonne, Gravitationsquelle, Planet

**Arena**:
Der kreisförmige Rand in Kapitel 1, an dem Körper abprallen.
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
Eine Gruppe von Levels mit gemeinsamer Mechanik: Staubwolke (ohne Gravitation), Protostern (ein Attraktor), Planetensystem (mehrere Attraktoren).
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
Was im Level zu erreichen ist: letzter Körper werden, Körper X absorbieren, größter Körper werden, Masse M erreichen, Zentralkörper absorbieren, N Umläufe überleben.
_Avoid_: Quest, Auftrag

**Letzter Körper**:
Ziel `last` („Werde der letzte Körper“): gewonnen, wenn kein anderer Körper mehr existiert, der noch zählt, also keiner mit Masse ≥ `dustFrac` × Spielermasse. Anzeige „Noch N Körper“. Der eigene Ausstoß zählt nie.
_Avoid_: Alles absorbieren, Aufräumen, Survivor

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
DOM-freier Spieler, der mit derselben Physik in Node Levels spielt; misst Lösungsquote und Dauer.
_Avoid_: KI, Gegner (Gegner-KI ist ein späteres Paket und heißt dann anders)
