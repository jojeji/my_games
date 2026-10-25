// Merlin - Chronik entries. Speakers: 'merlin' (default), 'chronist', 'waechter'. Names come from characters.js only.
// Entry: { id, chapter, lines:[{who,t}], modal?, cond(g) }. Modal entries are shown as a dialog (one line per page).
import { CAST, J, L } from './characters.js';
import { TUNE as T } from './tune.js';
import { IDEAS } from './eras.js';

const m = (t) => ({ who: 'merlin', t });
const jo = (t) => ({ who: 'chronist', t });
const le = (t) => ({ who: 'waechter', t });
const era = (g) => g.state.mer.era;
const memRun = (g) => g.state.cur.mem.run;
const frac = (k, f) => (g) => era(g) >= k && memRun(g).gte(T.eraThr[k] * f);

const S = [];
/** ": „A“, „B“ und „C“." for up to four planted ideas (era order, evenly picked); empty if none. */
function plantedList(g) {
  const own = IDEAS.filter((i) => g.upgLevel(i.id) > 0);
  if (!own.length) return '.';
  const n = Math.min(4, own.length);
  const pick = n === own.length ? own : Array.from({ length: n }, (_, k) => own[Math.round((k * (own.length - 1)) / (n - 1))]);
  const names = pick.map((i) => `„${i.name}“`);
  return ': ' + (names.length > 1 ? names.slice(0, -1).join(', ') + ' und ' + names.at(-1) : names[0]) + '.';
}
const add = (id, chapter, cond, lines, modal = false) => S.push({ id, chapter, cond, lines, modal });

/* ---------------- Ende der Zeit ---------------- */
add('e0_start', 'e0', () => true, [
  m('Man sagt, ich lebe rückwärts. Stimmt fast. Ich erinnere mich an morgen. Gestern kenne ich noch nicht. Beim Frühstück merkt man das am meisten.'),
  m('Heute ist das Ende aller Tage. Die Sterne sind aus, die Uhren stehen. Das letzte Wort der Welt war „Genug.“ Danach kam nichts mehr.'),
  m('Ganz am Anfang liegt das erste Wort, mit dem die Welt zu reden begann. Wenn ich es dort noch mal sage, fängt vielleicht alles noch mal an.'),
  m('Dreh die Sanduhr. Ab jetzt geht es rückwärts.'),
], true);
add('e0_sand', 'e0', (g) => g.state.cur.sand.total.gte(15), [m('Mein Zeitsand rieselt nach oben. Sieht falsch aus, fühlt sich aber richtig an.')]);
add('e0_zeit', 'e0', (g) => g.spellUnlocked('zeit'), [m('Mir fällt ein Zauber ein: der Zeitraffer. Keine Ahnung, woher ich den kann. Vermutlich von später.')]);
add('e0_v1', 'e0', (g) => g.state.layers.rejuv.count >= 1, [m('Verjüngt. Etwas weniger Buckel, ein paar Gedanken mehr. Ich nenne sie Erinnerungen an morgen. Ich kenne sie, weil sie noch nicht passiert sind.')]);
add('e0_ahnung', 'e0', frac(0, 0.25), [m('Komisch. Mit jeder Verjüngung werde ich jünger und die Welt um mich älter. Ich glaube, ich bin der Einzige, der das seltsam findet.')]);
add('e0_whisper', 'e0', frac(0, 0.5), [m('Am Rand des Hörbaren flüstert etwas. Ein einzelner Laut, ein „N“. Das klingt nicht nach „Genug“. Eher nach dem Gegenteil.')]);
add('e0_fund', 'e0', frac(0, 0.8), [
  m(`Im Staub liegt ein Zettel in zwei Handschriften. Oben: „Bis zum nächsten Mal.“ Unterschrieben mit ${J[0]}. Darunter: „Es war uns eine Ehre.“ Unterschrieben mit ${L[0]}. Daneben ein Krümel. Er riecht nach Zimt.`),
  m('Ich verstehe kein Wort. Aber irgendwer hat mir einen Abschied aufgehoben.'),
]);

/* ---------------- Ferne Zukunft ---------------- */
add('e1_arrive', 'e1', (g) => era(g) >= 1, [
  m('Gläserne Städte schweben über dem Meer. Sanfte Maschinen kümmern sich um alles, nur ums Erinnern nicht.'),
  m('Hier ist noch Licht. Hinter dem Rauschen der Lüftung flüstert es: „N … o?“'),
  m('Das klang wie eine Frage.'),
], true);
add('e1_leo', 'e1', frac(1, 0.15), [
  le('MERLIN! Da bist du ja! Willkommen im Jahr 9.001!'),
  le('It\'s over 9000!'),
  m('Wir kennen uns?'),
  le(`Du mich vielleicht noch nicht. Ich dich schon ewig. ${L}, Zeitwächter, auf die Sekunde pünktlich.`),
  le('Den Zettel am Ende der Zeit hast du gefunden? Das zweite Kürzel war ich.'),
  m('Das mit der Ehre?'),
  le('Genau das. Ich habe es ernst gemeint.'),
], true);
add('e1_mid', 'e1', frac(1, 0.5), [m('Mir kommt ein Plan. Die Welt hat am Ende „Genug“ gesagt. Also braucht sie unterwegs mehr Gründe für „Noch einmal“. Ich fange an, Ideen zu verteilen.')]);

/* ---------------- Gegenwart ---------------- */
add('e2_arrive', 'e2', (g) => era(g) >= 2, [
  m('Jahr 2026. Alle haben eine Uhr am Arm und keine Zeit.'),
  m('Die Leute gucken in kleine leuchtende Fenster und lächeln dabei. Ich mag sie sofort.'),
  m('Das Flüstern ist jetzt ein „No“.'),
], true);
add('e2_jonas', 'e2', frac(2, 0.15), [
  jo('Du bist Merlin? Wir haben uns schon ein paarmal getroffen. Du warst jedes Mal etwas älter.'),
  m('Älter? Bei mir geht es andersrum. Für mich ist das das erste Mal.'),
  jo(`Dann gleiche ich aus. ${J}, Chronist. Ich schreibe mit, was du erlebst.`),
  m('Worein?'),
  jo('Hier rein. Chronik-Tab, unten. Handschrift mäßig, Vollständigkeit hoch.'),
], true);
add('e2_mid', 'e2', frac(2, 0.5), [
  m('In Schweden ist die Pause Pflicht. Sie heißt „Fika“, es gibt Zimtschnecken, und niemand entschuldigt sich dafür.'),
  m('Jetzt weiß ich, woher der Krümel kam.'),
]);
add('e2_runde', 'e2', frac(2, 0.7), [
  m('Spät abends, drei Leute vor einem Bildschirm. Autos mit Raketenantrieb jagen einen riesigen Ball.'),
  m('Einer heißt Rafi. Der Zweite sieht mir ähnlich, nur jünger. Der Dritte schreibt nebenbei mit.'),
  m(`${J}? Was machst du denn hier?`),
  jo('Noch eine Runde. Stand: 4.212 Spiele. Seit Jahren knapp unter „Champ“.'),
  m('Ich weiß, wie es ausgeht. Ich verrate es nicht.'),
  m('Rafi sieht nicht mal hoch. „Noch eine.“ Irgendwas an dem Wort lässt mich nicht los.'),
]);

/* ---------------- Industriezeitalter ---------------- */
add('e3_arrive', 'e3', (g) => era(g) >= 3, [
  m('Jahr 1850. Es riecht nach Kohle, und irgendwo pfeift immer eine Lok.'),
  m('Die Zeit wird hier in Stunden zerlegt und als Lohn ausgezahlt.'),
  m('„Zeit ist Geld“, sagt ein Fabrikant. Ich sage höflich, dass ich das anders sehe. Er schaut auf die Uhr und geht.'),
], true);
add('e3_leo', 'e3', frac(3, 0.15), [
  le('MERLIN! Zu spät. Oder zu früh. Bei dir weiß man das nie. Der Zug ins Gestern fährt in einer Minute!'),
  m('Rückwärts?'),
  le('Rückwärts. Kennst du ja.'),
  m('Wie lange fahren wir?'),
  le('Eine Minute oder ein Jahr, je nach Waggon. Hinten gibt es eine Kammer, in der ein Tag ein Jahr dauert.'),
  le('Super zum Trainieren. Für den Haarschnitt eine Katastrophe.'),
]);
add('e3_mid', 'e3', frac(3, 0.5), [m('Zwischen Dampf und Pfiffen ist es wieder da: „No …“, mit mehr Atem dahinter. Es klingt nach jemandem, der etwas nicht hergeben will.')]);

/* ---------------- Mittelalter ---------------- */
add('e4_arrive', 'e4', (g) => era(g) >= 4, [
  m('Camelot, um das Jahr 500. Ein junger König sitzt an einem runden Tisch und hofft, dass das reicht.'),
  m('Am See winkt mir eine Dame zu. Nimue, die mich mal einsperren wird. Oder schon eingesperrt hat. Die Zeitformen sind hier schwierig.'),
  m('Artus kennt mich nicht. Ich kenne sein Ende. Ich erzähle ihm lieber vom Anfang.'),
], true);
add('e4_jonas', 'e4', frac(4, 0.15), [
  jo('Offiziell gab es nie einen Merlin. Dafür auffällig viele Zufälle mit Bart.'),
  m('Und inoffiziell?'),
  jo('Inoffiziell führe ich Protokoll. Tagesordnungspunkt eins: Wer sitzt wo? Ergebnis: egal.'),
]);
add('e4_nimue', 'e4', frac(4, 0.5), [m('Nimue winkt vom See herüber. Ich winke zurück. Sie weiß, was kommt, ich auch, nur später. Wir sind sehr höflich zueinander.')]);

/* ---------------- Antike ---------------- */
add('e5_arrive', 'e5', (g) => era(g) >= 5, [
  m('Athen? Alexandria? Egal. Ein Orakel begrüßt mich: „Ich wusste, dass du kommst. Nur nicht wann.“ Wir verstehen uns.'),
  m('Das Flüstern hat jetzt drei Buchstaben: „Noc …“'),
], true);
add('e5_leo', 'e5', frac(5, 0.15), [
  le('Das Orakel hat gesagt: „Bring Blumen mit.“ Ich war pünktlich und hatte Blumen dabei.'),
  m('Und?'),
  le('Es hat sich bedankt. Nur die Lilien hat es bemängelt.'),
  le('Das hätte es mir auch früher sagen können.'),
]);
add('e5_mid', 'e5', frac(5, 0.5), [m('Die Philosophen hier fragen „Warum?“, bis die Zeit nachgibt. Ich habe ihnen heimlich ein „Wozu?“ hingelegt. Seitdem sind sie unausstehlich glücklich.')]);

/* ---------------- Steinzeit ---------------- */
add('e6_arrive', 'e6', (g) => era(g) >= 6, [
  m('Eiszeit. Ein Feuer, Leute im Kreis, in der Mitte der erste Erzähler.'),
  m('Er murmelt immer wieder etwas in die Flammen: „Noch … noch.“'),
  m('Das Flüstern hat jetzt ein Wort. Was es mir sagen will, verstehe ich noch nicht.'),
], true);
add('e6_jonas', 'e6', frac(6, 0.15), [
  jo('Neuer Band. Auf Stein. Auflage begrenzt.'),
  m('Und die Rechtschreibung?'),
  jo('Gibt es noch nicht. Ich habe sie gleich abgeschafft. Erster Eintrag: „TODO: Rad erfinden.“'),
]);
add('e6_mid', 'e6', frac(6, 0.5), [
  m('Der Erzähler erzählt von einem Wort, das alles am Leben hält. Er kennt es nicht, ist aber sicher, dass es das gibt.'),
  m('Ich nicke. Ich kenne es auch noch nicht.'),
]);

/* ---------------- Anbeginn ---------------- */
add('e7_arrive', 'e7', (g) => era(g) >= 7, [
  m('Vor allem. Kein Oben, kein Unten, nur ein Wartezimmer aus Dunkel. Mein Sand fließt hier in beide Richtungen.'),
  m('Und da ist es: das Erste Wort. Noch nicht gesprochen, aber bereit.'),
], true);
add('e7_both', 'e7', frac(7, 0.1), [
  le(`Eine Minute vor dem Anfang, und du bist schon da! Du musst Merlin sein. ${L}, Zeitwächter. Sehr erfreut!`),
  jo(`${J}, Chronist. Notiert: erste Begegnung. Wird eine kurze Seite.`),
  m('Für mich seid ihr meine ältesten Freunde. Für euch bin ich ein Fremder mit Sanduhr.'),
  le('Dann ändern wir das! Freunde? So fängt man doch an. Wie im Kindergarten.'),
  jo('Notiert: Freunde seit dem Anfang. Den Rest der Seite lasse ich frei. Da kommt noch was.'),
  le('Das Tor hinter dir geht übrigens nur in eine Richtung. Aber das kennst du ja.'),
  jo('Wenn du so weit bist: Sprich es aus. Ich schreibe mit.'),
], true);
add('e7_mid', 'e7', frac(7, 0.5), [
  m(`${J} hat den Stift in der Hand und wartet. ${L} poliert seine Taschenuhr, dabei gibt es noch keine Zeit zum Anzeigen.`),
  m('Ich sammle Mut. Ein Wort ist schnell gesagt. Dieses nicht.'),
]);

/* ---------------- Finale ---------------- */
add('finale', 'ende', (g) => g.state.mer.finished, [
  m('Ich stehe am Anfang, und er ist leiser als gedacht. Kein Knall. Nur ein Atemholen, das sich nicht traut.'),
  m('Jetzt verstehe ich das Flüstern. Das erste Wort war ein Wunsch.'),
  m('Noch ein bisschen. Noch nicht aufhören.'),
  m('„Noch.“ Mehr hat es nie gesagt. Ich spreche es aus. Der Raum antwortet mit Licht.'),
  jo('Seite eins, erste Zeile: „Noch.“ Notiert. Ich glaube, damit geht der Rest der Geschichte los.'),
  le('Und die Tore quietschen! Alle gleichzeitig! Was für ein Applaus!'),
  m((g) => `Das erste Wort war „Noch“. Das letzte war „Genug“. Dazwischen liegen meine kleinen Verfrühungen${plantedList(g)} Jede war ein Grund für ein „Noch einmal“.`),
  m('Die Welt, aus der ich komme, gibt es wegen dieser Ideen. Ich war ihre Zukunft, die ein bisschen früher vorbeigeschaut hat.'),
], true);

/* ---------------- Nachspiel ---------------- */
S.push({
  id: 'epilog', chapter: 'ende', modal: true, replay: true, title: 'Einunddreißig',
  cond: (g) => g.state.story.finale !== undefined,
  lines: [
    le('Halt, Merlin! Wer am Anfang ankommt, hat Geburtstag. Das ist Protokoll. Ich habe es gerade erfunden, es gilt trotzdem.'),
    jo('Wer rückwärts lebt, endet bei der Geburt. Wir leben vorwärts und merken uns die Daten. Hier: eine Sanduhr mit einunddreißig Körnern. Nachgezählt.'),
    m('Einunddreißig Körner. Ich habe Äonen gesehen, aber noch nie ein Jahr, das in die Hand passt. Danke.'),
    jo('Jede Drehung ist ein Jahr. Dreh ruhig. Noch einmal. Alles Gute zum 31., Merlin.'),
    { ...m('Meine Hände werden faltig. Natürlich. Am Ende wartet ein alter Mann auf einen Anfang. Fertig? Nein. Noch.'), old: true },
  ],
});

/* ---------------- Zweiter Kreis (NG+) ---------------- */
add('z_intro', 'zyklus', (g) => g.state.layers.cycle.count >= 1, [
  m('Wieder das Ende der Zeit, wieder still. Diesmal erinnere ich mich an den Weg und an das Wort.'),
  m('Die Ewigkeit hat mir etwas mitgegeben.'),
  le('Willkommen zurück! Oder vorwärts? Ich komm da jedes Mal durcheinander.'),
  m('Diesmal geht es schneller. Und ein paar Ideen pflanze ich vielleicht anders.'),
], true);
add('c2_0', 'zyklus', (g) => g.state.layers.cycle.count >= 1 && g.state.layers.rejuv.count >= 1, [m(`Der Zettel liegt wieder im Staub. „Bis zum nächsten Mal“, steht da, unterschrieben mit ${J[0]}. Diesmal verstehe ich ihn: Das war nie ein Abschied.`)]);
add('c2_1', 'zyklus', (g) => g.state.layers.cycle.count >= 1 && era(g) >= 1, [le('Jahr 9.001! It\'s over 9000! Ja, schon wieder. Ich muss das jedes Mal rufen.')]);
add('c2_a', 'zyklus', (g) => g.state.layers.cycle.count >= 1 && era(g) >= 2, [jo('Seite eins steht schon im Buch. Ich schreibe sie trotzdem nochmal. Gewohnheit. Und „Noch.“ sieht gut aus.')]);
add('c2_b', 'zyklus', (g) => g.state.layers.cycle.count >= 1 && era(g) >= 5, [le('Mit bekanntem Weg geht es schneller. Ich kenne ihn leider nur vorwärts.')]);
add('c2_c', 'zyklus', (g) => g.state.layers.cycle.count >= 1 && era(g) >= 7, [m('Beim zweiten Mal höre ich das Wort schon von Weitem. Es flüstert nicht mehr. Es wartet.')]);

export const STORY = S;

/** One short entry per planted idea (the idea's own story text). */
export function ideaStories() {
  return IDEAS.map((i) => ({
    id: 'p_' + i.id,
    chapter: 'e' + i.era,
    cond: (g) => g.upgLevel(i.id) > 0,
    lines: [m(i.text)],
    modal: false,
    title: i.name,
  }));
}

export const CHAPTERS = [
  { id: 'e0', title: 'Ende der Zeit' },
  { id: 'e1', title: 'Ferne Zukunft' },
  { id: 'e2', title: 'Gegenwart' },
  { id: 'e3', title: 'Industriezeitalter' },
  { id: 'e4', title: 'Mittelalter' },
  { id: 'e5', title: 'Antike' },
  { id: 'e6', title: 'Steinzeit' },
  { id: 'e7', title: 'Anbeginn' },
  { id: 'ende', title: 'Das Erste Wort' },
  { id: 'zyklus', title: 'Der zweite Kreis' },
];
export { CAST };
