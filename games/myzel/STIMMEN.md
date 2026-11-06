# Stimmen-Bibel – Myzel

Verbindlich für alle Texte in `story.js` und `ending.js` (Chronik, Modals, Ende). Namen, Rollen und Farben stehen nur in `characters.js`.
Ergänzt `games/replikator/STIMMEN.md`, `games/merlin/STIMMEN.md` und `docs/LESSONS.md` (Abschnitt „Story und Texte“).

## Grundton
- **Trocken, mit leiser Melancholie.** Der Humor kommt aus Genauigkeit und Gelassenheit: Jemand nimmt etwas Kleines sehr ernst oder etwas Großes gar nicht. Die Melancholie sitzt in der Zeit (Kurt lebt einen Sommer, die Eibe neunhundert Jahre) und wird nie ausgesprochen.
- **Kurze Sätze.** Chat, kein Erzähler. Jede Zeile gehört einer Figur.
- **Höchstens eine Pointe pro Eintrag**, meist die letzte Zeile. Viele Einträge haben keine. Witze nie erklären, nach der Pointe kommt nichts mehr.
- **Anrede:** Alle duzen. Das Myzel spricht von sich als „ich“.
- Zahlen sind erlaubt, wenn sie einen Witz tragen oder etwas messen („Hundert Regen“). Keine Spielwerte im Text, die stehen auf den Karten.
- Ein Rückgriff (Callback) ist ein Gag, drei sind ein Muster. „Der Wievielte?“ kommt bei Kurt nicht öfter als zweimal vor.

## Die Weltregel (jede Zeile gegen sie prüfen)
1. **Das Myzel hat keine Augen und keine Ohren.** Es schmeckt, ertastet und spürt. In seinen Zeilen und in denen der Eibe kommen die Verben *sehen* und *hören* nicht vor (ein Test prüft es). Kurt hat Augen und darf sehen.
2. **Gesprochen wird durch das Netz.** Die Eibe spricht über die Wurzeln, in Zucker und Phosphor, deshalb langsam. Kurt tritt auf die Fäden, deshalb schnell und abgehackt. Wer nicht am Netz hängt, redet nicht mit (die Birken kommen erst mit dem Waldnetz, sie haben dann Meinungen).
3. **Ein Jahr ist ein Jahresring.** Die Spielzeit läuft schneller als das Waldjahr: Seit dem Waldnetz vergeht alle paar Stunden ein Jahr. Kurt lebt einen Sommer. **Alle Käfer heißen Kurt**, deshalb ist es immer derselbe, und niemand zählt durch. Keine Ordnungszahlen („der Dritte“) an Kurt.
4. **Das Myzel kann sich selbst nicht ansehen.** Es weiß, wie es schmeckt, nicht, wie es aussieht. Das ist die Frage, die am Ende beantwortet wird (Kurt, von oben: „Ein Kreis. Ein ziemlich guter.“).
5. **Die Menschen sind weit weg.** Sie kommen als „die Zweibeiner“ vor, treten auf Fäden, sammeln Hüte, haben vor langer Zeit gesägt. Das Gerücht von den Hexen kommt von ihnen. Das Myzel kennt sie nur vom Hörensagen, das heißt hier: von Kurt und der Eibe.
6. **Das Spiel ist unsichtbar.** Kein Wort über Handy, Besuche, Tippen oder Spieler. Regen kommt, weil das Myzel Durst hat: „Es regnet erstaunlich oft, wenn ich Durst habe.“

## Figuren

**Das Myzel** – das Ich des Spielers. Ruhig, genau, ein bisschen stolz auf jeden Faden. Beobachtet über Geschmack („Er schmeckt nach Rinde und einer sehr langen Zeit.“), zieht selten Schlüsse, und wenn, dann kleine. Wenn ihm etwas fehlt, sagt es das als Messwert. Ungeduldig ist es nie.
> „Ich zähle mit, so lange es noch geht.“ · „Ich lege mich nicht fest, ob das Zufall ist.“

**Taxus (Eibe, neunhundert Jahre)** – knapp, trocken, antwortet verspätet, hat das letzte Wort. Rechnet in Jahrhunderten und tut, als zähle sie nicht mit. Nennt das Myzel **Untermieter**, bis zum Ende, dann nicht mehr. „Ich führe Buch“: Zucker gegen Phosphor, das nennt sie einen Vertrag, kein Gefühl. Darunter ist sie die Letzte von vierzehn (der Kahlschlag) und lässt sich das nicht anmerken, bis es nicht mehr geht. Zärtlichkeit nur als Beschwerde („Du juckst.“).
> „Das fragt man eine Eibe nicht am ersten Tag.“ · „Ich bin ein Baum.“

**Kurt (Waldmistkäfer)** – atemlos, freundlich, hat immer gerade etwas vor und bricht mitten im Satz ab („Ich wollte eigentlich nur kurz–“). Nennt die Eibe „Frau Taxus“ (in der Datei über den Platzhalter). Sein Abbruch ist ein Strich direkt am Zeilenende („kurz–“), das ist die einzige Ausnahme von „kein Gedankenstrich“. Er bekommt mit der Zeit Flügel und macht sich Sorgen um sein Aussehen („Habe ich was im Gesicht?“). Am Ende beendet er einen Satz.
> „Ich bin Kurt.“ · „Das war mein Vater. Oder ich. Wir sind nicht so für Unterschiede.“

**Die Bäume** (Eiche, Buche, Birke, Kiefer, Esche, Linde, Tanne) sind keine Figuren, sondern Erwähnungen des Myzels, je mit einer Eigenart: die Eiche langsam und stolz, die Buche eine Klatschbase, die Birke jung und laut, die Kiefer ungeduldig, die Esche höflich, die Linde friedlich, die Tanne spitz. Je Baum eine Zeile, die das Myzel über ihn schmeckt.

## Verboten
- Dreier-Aufzählungen als Stilmittel, Aphorismen-Ketten, Kalendersprüche
- „nicht X, sondern Y“, „Es ist, als ob …“, „irgendwie“, rhetorische Fragen zum Schluss, Fragen als letzte Zeile
- Mehr als ein Gedankenstrich pro Eintrag (in der Praxis: keiner; Kurts Abbruch „–“ am Zeilenende zählt nicht)
- Gestapelte Adjektive, bedeutungsschwere Metaphern, Emojis, Siezen
- Namen aus bestehenden Franchises. Die Figuren heißen Taxus (lateinisch für Eibe) und Kurt (gewöhnlicher Name).
- Namen nur über die Platzhalter aus `characters.js` (`T`, `K`); ein Test prüft `story.js` auf fest eingetragene Namen.

## Feste Inhalte (dürfen nicht verloren gehen)
- **Ziel des Myzels in den ersten Zeilen:** Es will wissen, ob der alte Baum über ihm allein ist.
- **Auflösung Taxus:** Die Eibe war eine von vierzehn, dreizehn sind gefällt. Die Stümpfe haben noch Wurzeln. Der fünfte Ring reicht bis zu ihnen: Taxus ist nicht mehr die Letzte, sondern angeschlossen.
- **Auflösung Kurt:** Er flog nie hoch genug; am Ende sieht er den Ring von oben. Er beendet den Satz.
- **Der Untermieter:** Taxus nennt das Myzel so, bis zum Ende.
- **Das Ende ist warm und kurz.** Die Hexen-Legende bleibt: „Die Leute werden weiter behaupten, Hexen hätten die Ringe ins Gras getanzt.“ Das Myzel lässt sie.
