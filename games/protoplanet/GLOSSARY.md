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

**Protostern**:
Der Zentralkörper in Kapitel 3 (`kind: 'attractor'`, Radius 3,5, Anziehungsstärke `gm`). Steht still in der Mitte, zieht alle anderen Körper mit a = gm / (d² + soft²) an und absorbiert, was ihn berührt: für den Spieler heißt das verloren („In den Stern gestürzt“). Zählt bei den Zielen „Unangreifbar“ und „Letzter Körper“ nicht als Körper. Darstellung: Kern mit pulsierender Korona, außerhalb des Bildes eine goldene Richtungsmarke am Rand.
_Avoid_: Sonne, Zentralkörper (nur in der Spezifikation), Gravitationsquelle

**Attraktor**:
Die technische Art des Protosterns (`kind: 'attractor'`): ein Körper, der andere anzieht, selbst keine Gravitation spürt und still steht (Attraktoren auf festen Bahnen sind für spätere Kapitel vorgesehen, aber nicht umgesetzt). Seine Stärke `gm` ist von seiner Masse getrennt (Masse = Größe und Absorption).
_Avoid_: Sonne, Planet

**Bahn**:
Die Kreis- oder Ellipsenbahn eines Körpers um den Protostern. Innen sind Körper schneller als außen. Schub in Flugrichtung hebt die Bahn auf der Gegenseite (Ellipse), Schub dagegen senkt sie. Eine **Spur** (Lane) ist eine Kreisbahn der Levelfamilie `orbit`, Spuren liegen 2 Einheiten auseinander; Körper in derselben Spur treffen sich nie.
_Avoid_: Orbit (nur im Code), Umlaufbahn (nur im Titel von 3-1), Trajektorie

**Bahnvorschau**:
Die gepunktete, verblassende Linie vom Spieler aus: seine vorhergesagte Bahn für etwa 1,25 Umläufe unter der Anziehung des Protosterns (ohne andere Körper), nach jedem Ausstoß sofort neu berechnet. Rot dort, wo die Bahn im Stern endet, bernstein jenseits der Warnschwelle.
_Avoid_: Flugbahn-Anzeige, Ghost, Trail

**Anziehung unter den Körpern**:
Schwere Körper (ab `selfMin` 2 Massen, höchstens die `selfK` schwersten) ziehen andere weich an, Stärke je Level über `selfGrav` 0..1. Der Spieler zieht nie. In Kapitel 1 und 2 gibt es sie nicht.
_Avoid_: Schwerkraft zwischen Körpern, N-Körper

**Planet**:
Im Level 3-7 der schwerste Körper (Tag `planet`, 2,6–3 Massen) mit eigener Anziehung; er fängt Kleineres ein und wächst, wenn man ihn gewähren lässt. Nur ein Name für diesen einen Körper, keine eigene Körperart.
_Avoid_: Riese, Gasplanet

**Arena**:
Der kreisförmige Rand in Kapitel 1 und 2 (R 26–56), an dem Körper abprallen. Kapitel 3 hat keine Arena (offener Raum, siehe Abdrift).
_Avoid_: Wand, Spielfeld, Käfig

**Abdrift**:
Im offenen Raum (Kapitel 3, kein Rand) zu weit vom Protostern entfernt. Ab `warnR` erscheint „Zu weit draußen“ (roter Rand, dezenter Ton), ab `loseR` ist der Spieler abgetrieben und verloren. Körper weit hinter `loseR` werden entfernt (Zielkörper und markierte Körper nicht).
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
Eine Gruppe von Levels mit gemeinsamer Mechanik: Staubwolke (Grundlagen, Brocken), Jäger (KI-Körper), Protostern (Umlaufbahn-Modus), später Dunkelwolke (begrenztes Sichtfeld), Planetensystem (alles).
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

**Bahnplaner**:
Der Bot für Gravitationslevels (`orbit-bot.js`): sagt die Bahnen aller Körper einmal je Entscheidung voraus und bewertet Kandidaten-Schübe (Richtungen × Stärken + „nichts tun“) per Vorwärtssimulation über 40 s; verfeinert die besten durch Hangklettern.
_Avoid_: KI, Autopilot

**Bot**:
DOM-freier Spieler, der mit derselben Physik in Node Levels spielt; misst Lösungsquote und Dauer. Läuft in Varianten (andere Entscheidungs-Phase), damit ein fester Seed nicht von einem Glückslauf abhängt. Sein Gehirn (`brain.js`) teilen sich Bot und Jäger; der Jäger ist die begrenzte Fassung davon, der Bot der perfekte Spieler.
_Avoid_: KI, Gegner (der Gegner im Spiel heißt Jäger)

## Klang
Spezifikation: `docs/protoplanet-klang.md`. Der Klang ist rein generativ (WebAudio, keine Dateien).

**Stimmung**:
Der Klangcharakter eines Kapitels (Grundton, Tonleiter, Helligkeit, Dichte), ein Eintrag je Kapitel in `T.audio.moods` (dazu `select` für die Levelauswahl). Wechselt mit dem Bildschirm, nicht mit dem Spielgeschehen.
_Avoid_: Mood (nur im Code), Thema, Soundtrack

**Teppich**:
Die dauerhafte unterste Klangschicht (Drone: zwei leicht verstimmte Sägezahnschwingungen plus Quinte, atmender Tiefpass). Wird bei Gefahr dunkler und lauter.
_Avoid_: Drone (nur im Code), Hintergrundmusik

**Flächenakkord**:
Ein langer, weich ein- und ausblendender Akkord (3–5 Töne, 20–55 s) über dem Teppich; die Akkordfolge bestimmt die Stimmung.
_Avoid_: Pad, Chord (nur im Code)

**Einzelton**:
Ein einzelner, langer, glockiger Ton der Tonleiter (Sinus mit Oktave und Teilton), zufällig im Stereobild, in Abständen von 5–26 s. Im Code `star` (`starEvery`, `starBus`): nicht mit dem **Protostern** oder mit den **Sternen** der Wertung verwechseln.
_Avoid_: Stern (Verwechslung mit Protostern und Wertung), Glöckchen, Sparkle

**Kette**:
Mehrere Aufnahmen innerhalb von 1,1 s, deren Töne als Arpeggio nach oben steigen (`chainWin`, `chainMax`).
_Avoid_: Combo, Streak
