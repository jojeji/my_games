---
status: accepted
---

# Protoplanet: eigene Echtzeit-Physik im Spielordner statt der Idle-Engine

Protoplanet ist ein Echtzeit-Physikspiel (Ausstoß, Absorbieren, später Gravitation) mit 60 fps, Canvas und Touch-Zielen. Die bestehende Engine (`engine/core.js`, `engine/kit/`) ist für Inkrementalspiele gebaut: 50-ms-Schleife mit echtem `dt`, Offline-Aufholen, `Decimal`-Zahlen, DOM-Listen mit ~15 fps. Nichts davon passt: Ein Physikspiel braucht einen festen Zeitschritt (Determinismus, Bot, Zurückspulen), `requestAnimationFrame` und eine Zeichenfläche, und es gibt keinen Offline-Fortschritt. Gewählt ist deshalb eine eigene, DOM-freie Physik mit festem Zeitschritt (`dt = 1/120` s, Zeitstufen ändern nur die Schrittzahl pro Bild) und eine Canvas-2D-Darstellung, beides **im Spielordner** `games/protoplanet/`. Nach `engine/` wandert davon erst etwas, wenn ein zweites Spiel es wirklich braucht.

Weiter genutzt werden die game-agnostischen Teile: `engine/save.js` (Speichern, Sicherungskopie, Export/Import, Migrationen), `engine/kit/rng.js` (Seed-Zufall für Generatoren und Bot), `engine/pwa.js`, `engine/ui/modal.js`, `engine/ui/toast.js`, `engine/ui/dom.js`, der Hub und der gemeinsame Service Worker.

## Considered Options

- **Idle-Engine erweitern** (`createRuntime` mit festem Schritt): verworfen, weil Offline-Aufholen, Autosave-Takt und Render-Schleife dort fest verdrahtet sind und die drei laufenden Spiele mit echten Spielständen nicht gefährdet werden sollen.
- **Fremde Physik-/Spielbibliothek** (z. B. Matter.js, Phaser): verworfen. Die Physik ist klein (Kreise, Ausstoß, Absorbieren, Punktgravitation), eine Bibliothek würde den Determinismus und den Node-Bot erschweren, und die Seite hat bewusst keine Laufzeitabhängigkeiten außer `break_infinity.js`.
- **WebGL**: verworfen für v1. Canvas 2D reicht für ~200 glühende Kreise, wenn Glows als vorgezeichnete Sprites eingesetzt werden.

## Consequences

- Physik, Generatoren und Bot laufen in Node: Tests und eine Bot-Sim sichern Lösbarkeit und Dauer der Levels ab (Deploy-Sperre), wie die Pacing-Tests der Idle-Spiele.
- Das Zurückspulen arbeitet mit Schnappschüssen, nicht mit Wiederholung von Eingaben. Kleine Rechenunterschiede zwischen Browsern sind dadurch egal.
- `docs/LESSONS.md` gilt nur teilweise (Mobile UI, PWA, Arbeitsweise ja; Prestige/Idle/Story nein). Neue Erkenntnisse zu Echtzeit-Spielen kommen dort als eigener Nachtrag hinein.
