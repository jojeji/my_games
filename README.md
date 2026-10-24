# Meine Spiele

Eine statische Webseite (GitHub Pages) mit mehreren Idle-/Incremental-Spielen, die sich eine gemeinsame Engine teilen.
Kein Build-Schritt, keine Laufzeit-Abhängigkeiten: reines HTML/CSS und native ES-Module.

- Hub: `index.html` (Liste aus `games.json`)
- Spiel 1: **Replikator** – selbstreplizierende Sonden erobern die Galaxie (3 Prestige-Ebenen, Challenges, Forschungsbaum, Erfolge)
- Spiel 2: **Merlin – Rückwärts durch die Zeit** – Merlin lebt rückwärts und reist vom Ende der Zeit zum ersten Wort (Sanduhr, Zauber, Quellen mit Synergien, 8 Epochen, Anachronismen, Chronik, Zyklus/NG+)
- Gebaut für das Smartphone (Hochformat), installierbar als App, funktioniert offline.

## Lokal starten

```sh
python3 -m http.server 8000   # dann http://localhost:8000/ öffnen
npm test                      # Unit-Tests (node --test)
npm run sim                   # Balance-Simulation von Replikator (Zeitleiste)
node tools/simulate-merlin.mjs --both --cycles 2   # Merlin: aktiv vs. idle, Zyklus 2
```

## Auf GitHub Pages veröffentlichen

1. Repository nach GitHub pushen (Branch `main`).
2. **Settings → Pages → Source: GitHub Actions** wählen.
3. Der Workflow `.github/workflows/pages.yml` testet, aktualisiert die Service-Worker-Version und deployt bei jedem Push auf `main`
   (oder manuell über „Run workflow“). Die Seite liegt dann unter `https://<user>.github.io/<repo>/`.

Alle Pfade sind relativ, die Seite funktioniert daher in jedem Unterverzeichnis.

## Als App installieren

Auf dem Handy die Seite öffnen → Browser-Menü „Zum Startbildschirm hinzufügen“ (iPhone: Teilen-Symbol). Jedes Spiel hat ein
eigenes Manifest und installiert sich als eigene App. Nach dem ersten Laden läuft es auch ohne Netz.

## Replikator spielen (Kurzanleitung)

1. **Generatoren**: Kaufe Bohrdrohnen; jede Stufe produziert die Stufe darunter. Alle 10 Käufe einer Stufe verdoppeln deren Ausbeute.
   Kaufen-Taste gedrückt halten = Schnellkauf, Zeile antippen = Details.
2. **Replikation** (nach ca. 5 Min; ab der 1. Expansion auch automatisch): Materie zurücksetzen → Blaupausen für Upgrades und einen Produktionsbonus.
3. **Expansion** (ca. 40 Min): Blaupausen zurücksetzen → Sternsysteme, dauerhafte Upgrades und **Challenges** (eingeschränkte Durchläufe mit Belohnung).
4. **Singularität** (ca. 3–4 Std; jede bisherige Singularität erhöht den Quantenkern-Gewinn): alles zurücksetzen → Quantenkerne für den **Forschungsbaum** (ein Pfad schließt den anderen aus; Neuverteilen möglich).
5. Meilensteine schalten Autokäufer (Replikation, Blaupausen-Upgrades, Expansion, Challenges, Expansions-Upgrades) und Starthilfen frei – so lässt sich das Spiel auch in kurzen Sitzungen spielen; Erfolge geben einen globalen Bonus.

Speichern: automatisch (alle 10 s und beim Verlassen). Unter **Mehr → Einstellungen** gibt es Export/Import als Text, Zahlenformat,
Offline-Limit und das Zurücksetzen.

## Merlin spielen (Kurzanleitung)

1. **Sanduhr wenden** (Antippen, gedrückt halten = Wiederholung): gibt Zeitsand, Ladungen laden sich auf. **Quellen** kaufen (Kaufen-Taste halten = Schnellkauf); jede Quelle stärkt andere (Synergien) und wird bei Meilensteinen (5, 10, 20 … Stück) verdoppelt.
2. **Zauber** (ab 300 Zeitsand): Zeitraffer, Rückblick, Stillstand, Sandsturm, Weissagung. Ab der 8. Verjüngung wirken sie automatisch (auch offline).
3. **Verjüngung** (ca. 4 Min): Zeitsand zurücksetzen → Erinnerungen für Upgrades und Produktionsbonus. Meilensteine schalten Automatik frei.
4. **Epochensprung** (ca. 35 Min, danach je 60–95 Min): in die frühere Epoche reisen (Ende der Zeit → Ferne Zukunft → Gegenwart → Industriezeitalter → Mittelalter → Antike → Steinzeit → Anbeginn). Jede Epoche hat eine Besonderheit, eigene Quellen-Namen und **Anachronismen** (Ideen pflanzen, oft Entweder-oder).
5. Am **Anbeginn** das Erste Wort sprechen (Ende, ca. 9 Std aktiv), dann **Zyklus**: neu beginnen für **Ewigkeit** (starke dauerhafte Boni, der zweite Durchgang dauert ca. 30 %).
6. **Chronik**: die Geschichte – mit Merlin, seinem Chronisten und dem Zeitwächter (Namen und Porträts: `games/merlin/characters.js`, Bilder in `games/merlin/img/`).

## Neues Spiel hinzufügen

```sh
node tools/new-game.mjs mein-spiel "Mein Spiel"
```

Das kopiert `games/_template`, setzt IDs/Namen/Manifest und trägt das Spiel in `games.json` ein. Danach `games/mein-spiel/def.js`
bearbeiten (Währungen, Generatoren, Upgrades, Prestige-Ebenen …), Icon anpassen (`node tools/make-icons.mjs …`, siehe Kommentar im Skript)
und `npm test` ausführen. Details zur Architektur: `CLAUDE.md`.

## Lizenz / Drittcode

`engine/vendor/break_infinity.js` (MIT, Lizenz liegt daneben) für große Zahlen.
