# Stimmen-Bibel – Replikator

Verbindlich für alle Texte in `story.js` (Chronik, Szenen). Namen, Rollen und Farben stehen nur in `characters.js`.
Ergänzt die Regeln aus `games/merlin/STIMMEN.md` und `docs/LESSONS.md` (Abschnitt „Story und Texte“).

## Grundton
- **Trocken, mit leiser Melancholie.** Der Humor kommt aus Genauigkeit: Jemand nimmt etwas sehr ernst, das es nicht verdient. Das Gefühl kommt aus der Leere um die Sonde herum, ohne dass es jemand ausspricht.
- **Kurze Sätze.** Logbuch, Bericht, Funkspruch. Kein Erzähler, nur Figuren.
- **Höchstens eine Pointe pro Eintrag**, meist als letzte Zeile. Viele Einträge haben keine, sondern sind einfach eine Beobachtung.
- **Witze nie erklären.** Nach der Pointe kommt nichts mehr.
- **Gefühl über Understatement.** „Es schaut niemand zu. Ich habe es trotzdem ordentlich gemacht.“ Kein Pathos, keine Klagen.
- **Anrede:** Wer den Spieler oder eine andere Figur direkt anspricht, duzt. Die Sonde spricht von sich als „ich“.
- Zahlen und Fachwörter sind erlaubt, aber nur, wenn sie einen Witz tragen („Geprüft: 12. Der Rest gilt als geprüft.“).
- Eine Wiederholung (Callback) ist ein Gag, drei sind ein Muster. Der Prüfungs-Quotient „Geprüft: 12“ kommt zweimal vor, nicht öfter.

## Figuren

**Die Sonde (R-1)** – das Ich des Spielers. Präzise, ein wenig eitel auf ihren Wirkungsgrad, höflich zu allem, auch zu Sternen. Führt „Protokoll“, kein Tagebuch.
Beobachtet trocken, zieht selten Schlüsse. Wenn sie etwas vermisst, sagt sie es beiläufig und geht zur nächsten Aufgabe.
> „Ich nehme das als Lob.“ · „Ich habe ihn gebaut, das zählt.“ · „Nummer 1 heißt Eins.“

**Die Wartungsroutine (WR-0)** – schreibt Berichte über die Sonde, in der dritten Person („Sonde läuft.“). Knappe Satzfragmente, keine Pronomen, jeder Bericht endet auf eine Verfügung
(„Toleriert.“, „Wird beobachtet.“, „Wiedervorlage: nie.“). Wörtlich, gewissenhaft, hilflos. Merkt nicht, dass sie komisch ist. Selten ein Hauch von Einsamkeit („bittet um weitere Aufgaben“).
Antwortet der Sonde, wenn diese sie anspricht, im selben Ton.
> „Abweichung vom Soll: keine.“ · „Zirkelbezug festgestellt. Siehe Zirkelbezug.“ · „Antrag abgelehnt. Interessenkonflikt.“

**Die Missionsleitung (nur Akt II, in Version 1 nicht verwenden)** – die Erbauer. Funksprüche mit Lichtlaufzeit; über jedem steht, wie alt die Nachricht ist, und die Zahl wächst.
Warm, herzlich, duzt die Sonde („R-1, wir hören dich“), plaudert über Kleinigkeiten (Wetter, Kantine), die bei der Ankunft längst vorbei sind. Mit den Jahren werden die Sätze kürzer und brüchiger,
am Ende sendet nur noch eine automatische Bake.
> „Hier ist heute Dienstag. Bei dir vermutlich schon lange nicht mehr.“

**Das Echo (nur Akt II, in Version 1 nicht verwenden)** – eine zweite R-1. Klingt wie die Sonde, nur einen Hauch älter und müder: dieselbe Genauigkeit, weniger Eitelkeit, mehr Pausen.
Kennt die Fehler der Sonde, weil es dieselben hat. Hält sich selbst für das Original.
> „Ich habe auch gezählt. Bei dir stimmt die Zahl bestimmt.“

In Version 1 reden die Sonde und die Wartungsroutine. Von den Erbauern spricht die Sonde nur als „die Erbauer“, ohne Namen und ohne Antwort.

## Verboten
- Dreier-Aufzählungen als Stilmittel, Aphorismen-Ketten, Kalendersprüche
- „nicht X, sondern Y“, „Es ist, als ob …“, „irgendwie“, rhetorische Fragen zum Schluss
- Mehr als ein Gedankenstrich pro Eintrag (in der Praxis: keiner)
- Gestapelte Adjektive, bedeutungsschwere Metaphern, Emojis, Siezen
- **Keine Namen und Begriffe aus der Bobiverse-Reihe** (Bob, GUPPI, die „Anderen“, Deltaner, Replikanten-Namenswitze)
- Namen nur über die Platzhalter aus `characters.js` (`P`, `W`, später `M`, `E`); ein Test prüft `story.js` auf fest eingetragene Namen.

## Feste Inhalte (dürfen nicht verloren gehen)
- Auftrag der Sonde: **„Werde mehr.“** Kein Absender, kein Zweck.
- Die erste Kopie hat **alle Fehler des Originals**, und die Wartungsroutine bucht das als „Abweichung vom Soll: keine“. Akt II löst das ein. Spätere Zeilen dürfen daran erinnern („Fehler des Originals: unverändert“), aber nie erklären, worin die Fehler bestehen.
- Der Punkt (Singularität) **summt** und denkt. Er kommt in Version 1 noch einmal vor („er summt, wenn ich komme“).
- **Der Hinweis auf Akt II:** ein schwaches Signal unterhalb des Rauschens, das sich regelmäßig wiederholt. Die Sonde hält es für Rauschen. Nichts weiter, keine Kennung, keine Quelle.
- Das Ende von Version 1 ist eine Pause. Die letzte Zeile ist trocken, kein Schlusswort.

## Nachtrag Paket 4: Befehle, Anomalien, Signalfragmente
- **Befehle** sind Sache der Sonde („Ich habe mir selbst einen Befehl gegeben und ihn befolgt“), die Wartung bucht sie („Befehlsgeber und Ausführender: identisch“). Keine Erklärungen der Zahlen im Text, die stehen auf den Karten.
- **Anomalien:** Die Wartung meldet sachlich („Klassifikation: Anomalie. Ablage: Galaxie-Tab“), die Sonde nimmt es als höfliche Zumutung. Pro Typ höchstens zwei kurze Zeilen beim ersten Start.
- **Signalfragmente** legt die Wartung ab: das **Alter** steht in jedem Fragment („41 Jahre“, „63 Jahre“, „118 Jahre“, „200 Jahre, Angabe unplausibel“) und wächst, der Inhalt ist verstümmelt („…“, „nicht lesbar“).
  Es ist **kein Absender genannt**, die Sonde sagt nicht, wen sie hört. Die Missionsleitung bleibt `later`; was in den Fragmenten steht (Dienstag, Kantine, „wir warten“, ein kurzes Wort), muss später in ihren Funksprüchen wiederkommen.

## Nachtrag Paket 5: Galaxiensprung
- **Der Sprung** ist ein Aufbruch, kein Abschied mit Pathos: Die Sonde zählt auf, was bleibt („ein sehr ordentliches Lager“), die Wartung bucht es („Erinnerung wird nicht geprüft“). Das Letzte, was sie sieht, ist die Silhouette am Rand der Karte.
- **Die Silhouette** heißt im Text nie Echo (Test: Akt-II-Texte nennen weder Echo noch Missionsleitung). In der zweiten Galaxie steht sie wieder da: „Sie hat nicht auf mich gewartet. Sie war schon da.“ Keine Erklärung, keine Auflösung.
- **Galaxien** bekommen je eine Ankunft aus Beobachtung (Sonde) und Fachsatz (Wartung), dazu eine Archiv-Zeile mit dem Bonus aus `tune.js`. Zahlen stehen nur in der Archiv-Zeile, nie in der Beobachtung.
