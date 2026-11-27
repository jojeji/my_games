# Inselmelodie: Bilder (Prompt für eine Bild-KI)

Bis die Bilder da sind, zeichnet die App alles als SVG. Fertige Bilder kommen als WebP nach `games/inselmelodie/img/`
(Zuschneiden, Verkleinern, Umwandeln übernimmt der Agent); fehlt ein Bild, nimmt die App das SVG (wie die Porträts bei Merlin).

**Vorgehen:** alles im **selben Chat** erzeugen, zuerst den Papagei als Stilvorlage, dann jedes weitere Bild mit „im exakt gleichen Stil“.
Frontale 2D-Einzelbilder genügen; 3D-Renderings aus mehreren Blickwinkeln braucht die App nicht. Kein Text im Bild (Bild-KIs
schreiben schlecht, und alle Texte sind Teil der App). Dateien beim Hochladen mit der Nummer aus der Liste benennen.

```
Du erstellst Illustrationen für eine kindgerechte Klavier-Lern-App (Zielgruppe: 10-jähriges Mädchen).
Thema: eine fröhliche tropische Inselkette. Ein kleiner Papagei mit Segelboot begleitet durch die App.

STIL (für ALLE Bilder exakt gleich halten):
- Moderne, freundliche 2D-Kinderbuch-Illustration, weiche runde Formen, leichte Schattierung (kein Fotorealismus, kein 3D-Plastiklook)
- Kräftige, aber warme Farben: Türkis, Sonnengelb, Korallenrot, Palmengrün, Sandbeige
- Klare, gut lesbare Silhouette, auch klein (64 px) noch erkennbar
- Große, freundliche Augen, lächelnd, niemals gruselig

TECHNIK (sehr wichtig):
- Jedes Motiv als EIGENES Bild, quadratisch 1024×1024
- Transparenter Hintergrund (PNG); falls nicht möglich: einfarbig reinweiß, ohne Boden-Schatten
- Motiv zentriert, ringsum ca. 8 % Rand frei, nichts abgeschnitten
- KEIN Text, keine Buchstaben, keine Zahlen, keine Noten im Bild, kein Rahmen

Beginne nur mit Bild 1. Ich sage dann "weiter", und du erstellst das nächste im exakt gleichen Stil.

1. Der Papagei (Begleiter), Vorderansicht, neutral-freundlich, sitzt aufrecht
2. Derselbe Papagei: jubelt mit ausgebreiteten Flügeln
3. Derselbe Papagei: zeigt mit einem Flügel nach rechts (erklärt etwas)
4. Derselbe Papagei: staunt / "Oh!"-Gesicht
5. Derselbe Papagei: tröstet, legt den Flügel aufs Herz, sanftes Lächeln
6. Ein kleines Segelboot mit türkisem Segel, seitlich
7. Ein Chamäleon
8. Ein Delfin, springend
9. Eine Eule
10. Ein Flamingo
11. Ein Gecko
12. Ein Affe
13. Ein Hummer (freundlich, nicht bedrohlich)
14. Ein Clownfisch
15. Insel 1: winzige Sandinsel mit einer Palme (von schräg oben, ganze Insel sichtbar)
16. Insel 2: grüne Insel mit Bäumen und Wasserfall
17. Insel 3: Insel mit kleinem Vulkan (friedlich, rauchend)
18. Insel 4: Insel mit Leuchtturm
19. Insel 5: Insel mit Felsen und Höhle
20. Eine Schatztruhe, offen, mit glitzernden Muscheln
21. Drei verschiedene Muscheln einzeln (je ein Bild: Jakobsmuschel, Schneckenhaus, Seestern)
22. Ein goldener Stern mit Gesicht, strahlend

Zum Schluss, als einziges NICHT quadratisches Bild:
23. Meereshintergrund im Querformat 1920×1080, Draufsicht, ruhiges türkises Wasser mit sanften Wellen, ohne Inseln (die setze ich selbst darauf), NICHT transparent
```

Zuordnung Inseltiere: C Chamäleon (7), D Delfin (8), E Eule (9), F Flamingo (10), G Gecko (11), A Affe (12), H Hummer (13), hohes C Clownfisch (14).

## Stand (2026-11-26): alle 23 Motive geliefert

Erzeugt vom Besitzer mit ChatGPT nach dem Prompt oben, echte Transparenz, saubere Ränder, einheitlicher Stil. Abgelegt als WebP in
`games/inselmelodie/img/` (quadratische Motive 512 px, Qualität 86; Meer 1920×1080, Qualität 80; zusammen ~740 KB statt 18 MB PNG).
Die 1024-px-Originale liegen beim Besitzer, nicht im Repo; für größere Darstellungen (z. B. Begleiter im Vollbild) dort neu umwandeln.

| Datei | Motiv |
|---|---|
| `papagei-neutral/-jubel/-zeigt/-staunt/-troestet.webp` | Begleiter in fünf Stimmungen |
| `boot.webp` | Segelboot (Figur auf der Inselkarte) |
| `tier-c-chamaeleon`, `tier-d-delfin`, `tier-e-eule`, `tier-f-flamingo`, `tier-g-gecko`, `tier-a-affe`, `tier-h-hummer`, `tier-c2-clownfisch` | Inseltiere (Buchstabe = Tonname, `c2` = hohes C) |
| `insel-palme`, `insel-wasserfall`, `insel-vulkan`, `insel-leuchtturm`, `insel-hoehle` | Inseln (Zuordnung zu Insel 0–4 beim Bau der Karte) |
| `truhe`, `muschel`, `schneckenhaus`, `seestern`, `stern` | Sammelstücke und Sterne |
| `meer.webp` | Hintergrund der Inselkarte (nicht transparent) |

Chamäleon (C) und Gecko (G) sind beide grüne Echsen. Der Besitzer hat entschieden, dass beide so bleiben (2026-11-26). Beim Bau
darauf achten, dass die beiden immer mit Namen und Notenfarbe zusammen erscheinen, nie als Bild allein.

## Nachlieferung (2026-11-27): Höhle und Brücke

Für die Höhleninsel (linke Hand) und die neue Brückeninsel (beide Hände) fehlen drei Motive. Bis sie da sind, stehen
gezeichnete Platzhalter im Ordner (`insel-bruecke.webp`, `kristall.webp`, `kompass.webp`); echte Bilder ersetzen sie 1:1.
Im **selben Chat** wie die ersten Bilder weitermachen (gleicher Stil), sonst den Stil-Block oben noch einmal mitschicken:

```
Bitte noch drei Bilder im exakt gleichen Stil wie die bisherigen (2D-Kinderbuch-Illustration, weiche Formen,
warme kräftige Farben, transparenter Hintergrund, 1024×1024, Motiv zentriert mit 8 % Rand, KEIN Text):

24. Insel 6: zwei kleine Sandinseln mit je einer Palme, verbunden durch eine kleine Hängebrücke aus Holz und Seil (von schräg oben, beide Inseln ganz sichtbar)
25. Ein leuchtender Höhlenkristall: drei Kristallsäulen in Lila, Türkis und Rosa auf einem kleinen Stein, mit Glitzern
26. Ein alter Messing-Kompass mit roter Nadel, freundlich und glänzend
```

Dateinamen beim Hochladen: `24-insel-bruecke`, `25-kristall`, `26-kompass`.
