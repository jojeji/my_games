# Protoplanet: Klang (Paket C)

Begriffe (Stimmung, Teppich, Flächenakkord, Einzelton, Kette): `games/protoplanet/GLOSSARY.md`, Abschnitt „Klang“. **Einzelton** heißt im Code `star` (`starEvery`, `starBus`); im Text nicht „Stern“ sagen: das ist der Protostern aus Kapitel 3 und die Wertung.

Generative Ambient-Musik und Effektklänge, komplett per WebAudio, keine Audiodateien. Eigene Klangwelt.

## Dateien
- `games/protoplanet/audio-score.js` – reine Logik (läuft in Node): Tonleitern, Akkordwahl, Zeitplanung (`createScore`), Drosselung (`createGate`), Tonwahl der Effekte, Spielzustand -> Musikparameter (`musicParams`, `dangerOf`, `sizeOf`). Eigener seedbarer Zufall (`engine/kit/rng.js`), nie der Physik-Zufall; die Physik liest nichts vom Klang.
- `games/protoplanet/audio.js` – WebAudio-Knoten. `createEngine(ctx, opts)` baut den Graphen gegen JEDEN Context (auch `OfflineAudioContext`); `createAudio({settings})` ist die Hülle für die Oberfläche (lazy `AudioContext`, Lautstärken, Pause, Sichtbarkeit).
- `T.audio` in `tune.js` – alle Zahlen: Tonleitern, Stimmungen je Kapitel, Grenzen der Parameter, Drosselung, Pegel.
- `tests/protoplanet-audio.test.mjs` – Tests der Logik. `tools/klang-protoplanet.mjs` – Messungen im Browser (Playwright, nicht Teil von `npm test`).

## Graph
```
Drone (2 Sägezahn leicht verstimmt + Quinte, Obertöne je Größe, Schwebungs-Zwillinge je Gefahr)
  -> Tiefpass (atmet per LFO 0,043 Hz) -> Lautstärke-LFO (0,027 Hz) -> droneLevel ─┐
Akkorde (je 3-5 Töne, Dreieck + Sinus, Hanning-Hüllkurve über 20-55 s) -> Tiefpass -> chordBus ─┼-> musicBus ─┐
Einzeltöne (Sinus + Oktave + Teilton 2,76, langer Ausklang, Stereo-Position zufällig) -> starBus ───┘            │
alles -> Sendebus -> ConvolverNode (erzeugte Impulsantwort 3,4 s, Rauschen mit exp. Abfall, nach hinten dunkler) -> musicBus
Effekte -> sfxBus (eigener kurzer Raum, 1,4 s)                                                              │
musicBus + sfxBus -> master (Ein-/Ausblenden) -> DynamicsCompressor (Limiter) -> post-Gain 0,85 -> Ziel
```
Dauerhaft ca. 12 Oszillatoren + 2 Convolver; Akkorde (6-10 Oszillatoren, 2 überlappen) und Einzeltöne (3) entstehen kurz vor ihrem Einsatz (`lookahead` 2,2 s, Pump alle 250 ms) und werden nach dem Ende getrennt. Keine ScriptProcessor.
Alle Pegel laufen über `setTargetAtTime`/Kurven, nichts springt. Lautstärke = `(Regler/100)^2 * Bus`.

## Stimmungen (`T.audio.moods`)
| Schlüssel | Name | Grundton | Tonleiter | Akkordwechsel | Einzeltöne | Helligkeit |
|---|---|---|---|---|---|---|
| select | Levelauswahl | D3 | Pentatonik Dur | 22-38 s | 9-20 s | 0,45 |
| 1 | Staubwolke | F3 | Lydisch | 18-34 s | 7-16 s | 0,50 |
| 2 | Jäger | E3 | Dorisch | 15-30 s | 8-18 s | 0,38 (dunkler, mehr Schwebung) |
| 3 | Protostern | G3 | Mixolydisch | 20-36 s | 7-15 s | 0,55 |
| 4 | Dunkelwolke | C3 | Phrygisch | 24-40 s | 12-26 s | 0,28 |
| 5 | Galaxie | A3 | Lydisch | 16-30 s | 5-12 s | 0,62 |

**Neues Kapitel ergänzen:** in `T.audio.moods` einen Eintrag mit der Kapitel-ID anlegen (Felder siehe Kommentar in `tune.js`: `root` MIDI-Grundton, `scale` Name aus `T.audio.scales`, `roots` erlaubte Akkord-Grundstufen, `chordEvery`/`starEvery` Spannen in s, `bright`, `cutLo/cutHi`, Schichtpegel `drone/chord/star/beat`). Neue Tonleiter: Eintrag in `T.audio.scales`. Der Test `jedes Kapitel ... hat eine Stimmung` prüft alle `CHAPTERS`; ein fehlender Eintrag fällt sonst auf Kapitel 1 zurück.

## Parameter (weich, `musicParams`)
Eingaben: `danger` 0..1 (nächster Körper mit Masse >= 0,97 x deine, je näher desto höher, quadratisch), `size` 0..1 (log10 der Masse / 1,3), `timeScale` (x1/4 .. x10), `lift` -1..1 (Sieg + / Verlust -).
- Gefahr: Tiefpass zu, Teppich lauter, Schwebung (zwei Sinus mit 0,65 % Verstimmung), Akkorde leiser, weniger Einzeltöne.
- Größe: Obertöne im Teppich, bis zu 5 Akkordtöne, mehr Einzeltöne, mehr Hall.
- Zeitstufe: x1/4 Filter zu und Einzeltöne seltener; x4/x10 heller, Akkorde schneller (`tempo`), LFOs schneller.
- Sieg hellt auf, Verlust dunkelt ab. Zeitkonstanten 2,2 s (Gefahr 1 s). Alle Werte werden auf `T.audio.limits` geklemmt.

## Effekte
Absorbieren: Sinus (+ Oktave), Tonhöhe aus der Tonleiter, großer Happen = tiefer, länger, voller; Aufnahmen innerhalb von 1,1 s steigen als Arpeggio (Zickzack nach oben); Drosselung 70 ms Mindestabstand, höchstens 6/s. Ausstoß: leiser Rauschpuff (Strahl noch leiser, 4/s). Absorbiert-werden: dunkler Abwärtsglide + Rauschen. Sieg: aufsteigende 5-Ton-Figur. Zurückspulen: Rauschschweller, der abbricht, danach ein Ton. Zeitstufe: kurzer Ton je Stufe. UI-Knöpfe: sehr leiser Tick. Levelstart: weich einschwingender Dreiklang.

## Bedienung / Anbindung
- AudioContext entsteht erst bei der ersten Geste (`pointerdown/touchend/keydown/click` in der Capture-Phase), Musik ist danach ohne Zutun an (Standard Musik 70 %, Effekte 80 %).
- Einstellungen: Regler Musik und Effekte (0-100 %, Schritt 5, 44 px hoch), Schalter „Ton“; Lautsprecher-Knopf in der Levelauswahl (Kopfzeile) und im Pausenmenü. `settings.music/sfx/mute` im Spielstand (`mergeDefaults`, `SAVE_VERSION` unverändert).
- Pause: Musik auf 35 % gedämpft (`pauseDuck`), Tab versteckt: Master blendet in ~0,3 s aus, danach `ctx.suspend()`, beim Zurückkommen weich ein. Stumm: Busse auf 0, der Planer plant nichts.
- Debug: `window.__protoplanet.audio` (`.engine`, `.ctx`, `engine.attachAnalyser()`).

## Messungen
Alle Werte von `node tools/klang-protoplanet.mjs render|live` (headless Chromium, Musik 70 %, Effekte 80 %). Hören geht dort nicht: gemessen wird der Pegel am Master-Ausgang.

**Offline-Rendering, 60 s, 44,1 kHz** (WAV: `scratchpad/protoplanet-klang/`). Szenario: 0-24 s ruhig, 24-36 s Gefahr 0,9, danach wächst der Spieler, ab 48 s Zeitstufe x4.

| Datei | RMS | Spitze | größter Pegelsprung zw. 0,5-s-Fenstern (ab 5 s) | Spektralschwerpunkt je 10 s (Hz) |
|---|---|---|---|---|
| kapitel1 | -24,8 dBFS | 0,305 | 5,5 dB | 497, 469, 483, 338, 492, 507 |
| kapitel2 | -25,6 dBFS | 0,245 | 5,3 dB | 412, 386, 360, 321, 357, 448 |
| levelauswahl | -29,7 dBFS | 0,208 | 3,4 dB | 488, 496, 564, 533, 460, 466 |
| effekte-kapitel1 (nur Effekte, inkl. Aufnahme-Sturm) | -35,0 dBFS | 0,275 | (Einzelklänge, nicht aussagekräftig) | 687 ... 3268 |

Die Musik entwickelt sich hörbar (Schwerpunkt fällt in der Gefahrphase auf 321-338 Hz, steigt mit Größe/Zeitstufe wieder), nie Spitze nahe 1, größter Abtastwert-Sprung 0,02 (kein Knacken).

**Live (Chromium, 390x844 und 360x740, 0 Konsolenfehler):**
| Situation | RMS | Spitze |
|---|---|---|
| vor der ersten Geste | kein AudioContext | - |
| Levelauswahl 16 s | -28,9 / -28,4 dBFS | 0,175 / 0,144 |
| Level 1-2, 32 s mit Tippen | -26,0 / -25,9 dBFS | 0,27 / 0,28 |
| Pausenmenü (gedämpft) | -29,0 / -29,4 dBFS | 0,18 / 0,16 |
| Tab versteckt (1 s später) | -87 / -85 dBFS, `ctx` suspended | 0,000 |
| zurück (Einblenden, 3,5 s später) | -35 / -36 dBFS, `running` (noch am Einblenden, tau 0,5 s + Pegelrampe) | 0,06 |
| Ton aus (Lautsprecher-Knopf) | -180 dBFS (digitale Stille) | 0 |
| Ton wieder an | -30 / -27 dBFS | 0,12 / 0,17 |
Größter Pegelsprung zwischen Sekundenfenstern in Auswahl/Level: 3,4-7,3 dB (Beginn der Messung kurz nach dem Einblenden bzw. Wechsel zwischen Auswahl und Level, sonst unter 3 dB).

**Bildzeit** Level 1-2, 12 s, zweimal je Variante: ohne Ton und mit Ton (Context läuft, Musik + Effekte) jeweils Mittel/Median/p95 16,7 ms (720 Bilder, max 16,8 ms). Headless ist per vsync auf 60 Hz gedeckelt, der Test zeigt also: keine verlorenen Bilder durch den Klang; er misst NICHT die freie CPU-Reserve. Die Audio-Verarbeitung läuft im Audio-Thread; auf dem Hauptthread kommen nur der Pump (alle 250 ms) und ein Parameter-Update alle 6 Bilder hinzu. Echtes Gerät (iOS) ungeprüft.

## Offene Punkte
- Gehört wurde nichts: Pegel, Spektrum und Klickfreiheit sind gemessen, der Geschmack (Mischung, Hallanteil, Effekt-Lautstärke) braucht das Ohr des Besitzers; alles in `T.audio` einstellbar (`busMusic`, `busSfx`, `moods`).
- iOS: `latencyHint: 'playback'`, Entsperren per Geste und Wiederaufnahme per jeder Geste sind eingebaut, aber nicht auf einem iPhone getestet.
- Kapitel 3 hat seit Paket B Levels (Stimmung `3`, Mixolydisch, greift beim Start jedes 3-x-Levels über `audio.setScene(lv.chapter)`); Feintuning mit dem Ohr des Besitzers. Kapitel 4 und 5 haben Stimmungen, aber noch keine Level.
- Neu in Paket B: Effekt `warn` („Zu weit draußen“: leiser tiefer Doppelton, Drosselung 2,5 s + Sperre in der Oberfläche 3,5 s) und der Verlustklang `swallowed` auch für „In den Stern gestürzt“ und „Abgetrieben“; der Protostern zählt nicht für die Gefahr-Parameter der Musik (`dangerOf`).

Paket D: Stimmung 5 heißt jetzt „Planetensystem“ (lydisch, root 57); sie greift über `audio.setScene(lv.chapter)` (Kapitel 5 geprüft). Der Abschluss und das Tageslevel nutzen `sfx.star` (je Kapitel ein Stern, aufsteigend).
