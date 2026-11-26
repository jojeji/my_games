---
status: accepted
---

# Inselmelodie: Tonerkennung per Mikrofon im Browser, einstimmig, Wartemodus zuerst

Inselmelodie muss hören, welche Taste auf einem **alten akustischen Klavier** gespielt wird; Gerät ist ein Android-Tablet mit Chrome,
die Seite ist eine statische Web-App auf GitHub Pages ohne Laufzeitabhängigkeiten. Gewählt ist eine **eigene Tonhöhenerkennung im
Browser** (`getUserMedia` mit ausgeschalteter Echo-/Rausch-/Pegelregelung → `AnalyserNode` → McLeod Pitch Method in `pitch.js`) plus ein
**Notenverfolger** (`tracker.js`, Pegelsprung + stabile Tonhöhe = Anschlag), beide DOM-frei und mit künstlichen Klaviertönen in Node
getestet. Die erste Fassung erkennt **einen Ton gleichzeitig** und spielt im **Wartemodus**; während des Spielens gibt das Tablet
**keinen Ton** aus. Eine **Kalibrierung** (Mittel-C spielen, Median der Abweichung in Cent) gleicht die Verstimmung des Klaviers aus.
Bevor das Spiel gebaut wird, prüft eine **Probe-Seite** die Erkennung am echten Klavier.

## Considered Options

- **MIDI** (Web MIDI): exakt, mehrstimmig, aber das Klavier ist akustisch. Bleibt eine Option für spätere Geräte (Chrome auf Android kann Web MIDI, Safari nicht).
- **Bibliothek** (z. B. ml5/CREPE, Essentia.js, Pitchy): CREPE ist genauer bei schwierigem Klang, braucht aber ein Modell von mehreren MB
  und deutlich mehr Rechenzeit; Essentia.js ist groß (WASM). Die McLeod-Methode ist ~100 Zeilen, deterministisch testbar, schnell
  genug (1,2 ms je Fenster auf dem Desktop) und findet die Periode auch bei schwachem Grundton. Wechsel möglich, falls die Probe am echten Klavier scheitert.
- **FFT-Spitzensuche**: einfach, macht bei Klaviertönen (2. Teilton oft lauter als der Grundton) Oktavfehler.
- **Mehrstimmige Erkennung** (Akkorde, beide Hände): im Browser mit einem Tablet-Mikrofon unzuverlässig. Verschoben, bis die einstimmige Erkennung am echten Klavier erprobt ist.
- **Begleitmusik während des Spielens**: das Mikrofon hört sie mit. Echo-Unterdrückung des Browsers hilft teilweise, zerstört aber
  ausgehaltene Klaviertöne. Verschoben, als Versuch für später.

## Consequences

- Alles Hörbare (Anhören, Effekte) liegt **zwischen** den Spielphasen; der Notenverfolger wird währenddessen nicht gefüttert.
- Wiederholte gleiche Töne brauchen einen Pegelsprung (gemessen: einzeln erkannt ab 0,2 s Abstand). Sehr schnelle Tonwiederholungen sind erst im Tempomodus ein Thema.
- Verstimmung über ±50 Cent ist nur über eine **bekannte** gespielte Note messbar, deshalb ist die Kalibrierung an das Mittel-C gebunden.
  Ungleich verstimmte Klaviere (einzelne Töne schief) zeigt die Probe in „Abweichung je Note“; die Toleranz ist dann zu erhöhen.
- Die Tonerkennung ist reine Logik in Node: Änderungen werden mit `tests/inselmelodie-pitch.test.mjs` (künstliche Klaviertöne aus
  `tests/helpers/piano-synth.mjs`) abgesichert; im Browser mit einer WAV-Datei als Mikrofon (`--use-file-for-fake-audio-capture`).
