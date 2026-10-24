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
const add = (id, chapter, cond, lines, modal = false) => S.push({ id, chapter, cond, lines, modal });

/* ---------------- Ende der Zeit ---------------- */
add('e0_start', 'e0', () => true, [
  m('Man sagt, ich lebe rückwärts. Das stimmt nicht ganz: Ich erinnere mich an Morgen und vergesse Gestern. Beim Frühstück fällt der Unterschied am meisten auf.'),
  m('Heute ist das Ende aller Tage. Die Sterne sind verstummt, die Uhren stehen still. Irgendwo ganz am Anfang liegt das erste Wort, mit dem die Welt zu sprechen begann. Ich will es dort noch einmal sagen. Dreh die Sanduhr – ab jetzt geht es rückwärts.'),
], true);
add('e0_sand', 'e0', (g) => g.state.cur.sand.total.gte(15), [m('Mein Zeitsand rieselt aufwärts. Es sieht falsch aus und fühlt sich richtig an.')]);
add('e0_zeit', 'e0', (g) => g.spellUnlocked('zeit'), [m('Ein Zauber fällt mir wieder ein: der Zeitraffer. Offenbar erinnert sich meine Zukunft daran. Praktisch.')]);
add('e0_v1', 'e0', (g) => g.state.layers.rejuv.count >= 1, [m('Verjüngt! Ein Jahr weniger auf dem Buckel und ein Gedanke mehr. Ich nenne sie Erinnerungen an morgen: Dinge, die ich weiß, weil sie noch nicht passiert sind.')]);
add('e0_whisper', 'e0', frac(0, 0.5), [m('Am Rand des Hörbaren flüstert etwas. Ein einzelner Laut, ein „N“, glaube ich. Ich verstehe ihn noch nicht.')]);
add('e0_fund', 'e0', frac(0, 0.8), [m(`Fundstück im Staub: ein Zettel in zwei Handschriften. Oben: „Wir sehen uns! – ${J[0]}.“ Darunter: „Wir haben uns gesehen! – ${L[0]}.“ Ich verstehe kein Wort. Das fühlt sich nach Zukunft an.`)]);

/* ---------------- Ferne Zukunft ---------------- */
add('e1_arrive', 'e1', (g) => era(g) >= 1, [
  m('Gläserne Städte schweben über dem Meer. Sanfte Maschinen kümmern sich um alles – nur nicht ums Erinnern. Hier ist noch Licht. Hinter dem Rauschen der Lüftung flüstert es: „N … n“.'),
], true);
add('e1_leo', 'e1', frac(1, 0.15), [
  le(`Merlin! Welch ein Auftritt – und das sage ich als Fachmann.`),
  m('Wir kennen uns?'),
  le(`Aus Ihrer Sicht noch nicht. Aus meiner schon mehrfach. ${L}, Zeitwächter. Die Tore hier quietschen übrigens nur, wenn jemand pünktlich ist.`),
  m('Dann quietscht es heute nicht.'),
  le('Es quietscht seit Ihrer Ankunft. Das ist ein Kompliment.'),
], true);
add('e1_mid', 'e1', frac(1, 0.5), [m('Die Maschinen hier verwalten alles und vergessen trotzdem. Man kann Erinnerung nicht automatisieren, nur verschenken.')]);

/* ---------------- Gegenwart ---------------- */
add('e2_arrive', 'e2', (g) => era(g) >= 2, [
  m('Jahr 2026. Überall Uhren, überall Eile, nirgends Zeit. Die Menschen starren in kleine leuchtende Fenster und lächeln dabei. Ich mag sie sofort. Das Flüstern ist jetzt fast ein „No“.'),
], true);
add('e2_jonas', 'e2', frac(2, 0.15), [
  jo('Sie sind Merlin? Ich habe Sie schon dreimal getroffen. Jedes Mal etwas jünger.'),
  m('Für mich ist das die erste Begegnung.'),
  jo(`Dann gleiche ich aus: Ich schreibe für Sie mit. ${J}, Chronist. Alles, was Sie mir erzählen, steht danach im Buch.`),
  m('Welches Buch?'),
  jo('Das, das Sie gerade lesen. Chronik-Tab, unten rechts. Ich führe es mit Hingabe und mäßiger Handschrift.'),
], true);
add('e2_mid', 'e2', frac(2, 0.5), [m('Alle haben Uhren und keine Zeit. Ich verschenke Pausen, so gut es geht. Man nennt das hier „Achtsamkeit“ und verkauft es in Kursen.')]);

/* ---------------- Industriezeitalter ---------------- */
add('e3_arrive', 'e3', (g) => era(g) >= 3, [
  m('Jahr 1850. Ruß, Dampf, Trillerpfeifen. Man zerlegt die Zeit in Stunden und zahlt sie als Lohn aus. „Zeit ist Geld“, sagt ein Fabrikant. Ich widerspreche höflich: Geld ist nur ungeduldige Zeit.'),
], true);
add('e3_leo', 'e3', frac(3, 0.15), [
  le('Pünktlichkeit ist die Höflichkeit der Könige. Und der Eisenbahn. Kommen Sie, Merlin, der Zug ins Gestern fährt in einer Minute.'),
  m('Rückwärts?'),
  le('Rückwärts, mit Fliege. Das sind Sie ja gewöhnt, nur die Fliege ist neu.'),
]);
add('e3_mid', 'e3', frac(3, 0.5), [m('Das Flüstern hat ein „o“ bekommen: „No …“. Es klingt nach einem Menschen, der etwas nicht aufgeben will.')]);

/* ---------------- Mittelalter ---------------- */
add('e4_arrive', 'e4', (g) => era(g) >= 4, [
  m('Camelot, um das Jahr 500. Ein junger König sitzt an einem runden Tisch und hofft, dass das reicht. Eine Dame im See winkt mir zu: Nimue, die mich einmal einschließen wird. Oder schon eingeschlossen hat. Die Zeitformen sind hier schwierig.'),
  m('Artus erkennt mich nicht, ich ihn schon: Ich weiß, wie sein Ende aussieht. Ich verrate ihm lieber den Anfang.'),
], true);
add('e4_jonas', 'e4', frac(4, 0.15), [
  jo('Offiziell gab es nie einen Merlin. Dafür erstaunlich viele Zufälle mit Bart.'),
  m('Und inoffiziell?'),
  jo('Inoffiziell führe ich das Protokoll der Tafelrunde. Tagesordnungspunkt eins: Wer sitzt wo? Antwort: egal. Das ist ja der Witz.'),
]);
add('e4_nimue', 'e4', frac(4, 0.5), [m('Nimue winkt vom See herüber. Ich winke zurück. Sie weiß, was kommt, ich auch – nur später. Wir sind sehr höflich zueinander.')]);

/* ---------------- Antike ---------------- */
add('e5_arrive', 'e5', (g) => era(g) >= 5, [
  m('Athen? Alexandria? Egal. Ein Orakel begrüßt mich: „Ich wusste, dass du kommst. Leider nicht wann.“ Wir verstehen uns. Das Flüstern hat jetzt drei Buchstaben: „Noc …“'),
], true);
add('e5_leo', 'e5', frac(5, 0.15), [
  le('Das Orakel sagte: „Bring Blumen mit.“ Ich habe Blumen mitgebracht.'),
  m('Und?'),
  le('Es war sehr zufrieden. Es hat nur die Lilien bemängelt. Man kann eben nicht alles vorhersehen.'),
]);
add('e5_mid', 'e5', frac(5, 0.5), [m('Die Philosophen hier fragen „Warum?“, bis die Zeit nachgibt. Ich habe ihnen heimlich ein „Wozu?“ dazugelegt. Sie sind seitdem unausstehlich glücklich.')]);

/* ---------------- Steinzeit ---------------- */
add('e6_arrive', 'e6', (g) => era(g) >= 6, [
  m('Eiszeit. Ein Feuer, ein Kreis aus Gesichtern, der erste Erzähler. Er murmelt etwas Kurzes in die Flammen, immer wieder: „Noch … noch.“ Ich ahne, was das Verstummen war.'),
], true);
add('e6_jonas', 'e6', frac(6, 0.15), [
  jo('Ich habe eine Chronik begonnen. Auf Stein. Die Auflage ist begrenzt.'),
  m('Und die Rechtschreibung?'),
  jo('Gibt es hier noch nicht. Wunderbar. Ich habe sie sofort abgeschafft.'),
]);
add('e6_mid', 'e6', frac(6, 0.5), [m('Der Erzähler erzählt von einem Wort, das alle Dinge am Leben hält. Er kennt es nicht, aber er weiß, dass es existiert. Das ist mehr, als die meisten späteren Jahrhunderte von sich sagen können.')]);

/* ---------------- Anbeginn ---------------- */
add('e7_arrive', 'e7', (g) => era(g) >= 7, [
  m('Vor allem. Kein Oben, kein Unten, nur ein Wartezimmer aus Dunkel. Mein Sand fließt hier in beide Richtungen. Und da ist es: das Erste Wort. Nicht gesprochen, nur bereit.'),
], true);
add('e7_both', 'e7', frac(7, 0.1), [
  le('Eine Minute vor dem Anfang. Wir sind pünktlich!'),
  jo('Ich notiere: Nichts. Das wird eine kurze Seite.'),
  le('Merlin, das Tor hinter Ihnen führt nur in eine Richtung. Aber das kennen Sie ja.'),
  jo('Sprechen Sie es aus. Ich schreibe mit.'),
], true);

/* ---------------- Finale ---------------- */
add('finale', 'ende', (g) => g.state.mer.finished, [
  m('Ich stehe am Anfang, und er ist leiser, als ich dachte. Kein Knall. Nur ein Atemholen, das sich nicht traut.'),
  m('Jetzt verstehe ich das Flüstern. Das erste Wort war kein Befehl und keine Formel. Es war ein Wunsch: Das Universum, kaum geboren, wollte, dass es noch nicht aufhört.'),
  m('„Noch.“ Mehr hat es nie gesagt. Ich spreche es aus – und der Raum antwortet mit Licht.'),
  jo('Seite eins, erste Zeile: „Noch.“ Ich glaube, das hat gerade den Rest der Geschichte ausgelöst.'),
  le('Und die Tore quietschen. Alle gleichzeitig. Was für ein Applaus.'),
  m('Alle Ideen, die ich unterwegs gepflanzt habe, greifen ineinander: die Münze, das Lied, der Buchdruck, das Feuer. Die Welt, aus der ich kam, gibt es nur wegen dieser kleinen Verfrühungen. Ich habe nicht die Vergangenheit repariert. Ich war ihre Zukunft.'),
  m('Und dann merke ich, wie meine Hände faltig werden. Natürlich. Zeit ist ein Kreis. Am Ende wartet ein alter Mann auf einen Anfang. Fertig? Nein. Noch.'),
], true);

/* ---------------- Zweiter Kreis (NG+) ---------------- */
add('z_intro', 'zyklus', (g) => g.state.layers.cycle.count >= 1, [
  m('Wieder das Ende der Zeit, wieder still. Aber diesmal erinnere ich mich: an den Weg, an das Wort, an jeden Gedanken, den ich gepflanzt habe. Die Ewigkeit hat mir etwas mitgegeben.'),
  le('Willkommen zurück! Oder bereits? Ich verwechsle die Richtung ständig.'),
  m('Dieses Mal geht es schneller. Und vielleicht pflanze ich ein paar Ideen anders.'),
], true);
add('c2_a', 'zyklus', (g) => g.state.layers.cycle.count >= 1 && era(g) >= 2, [jo('Seite eins steht schon im Buch. Ich schreibe sie trotzdem noch einmal. Aus Gewohnheit, und weil „Noch.“ so schön aussieht.')]);
add('c2_b', 'zyklus', (g) => g.state.layers.cycle.count >= 1 && era(g) >= 5, [le('Es geht schneller, wenn man den Weg kennt. Leider kenne ich ihn nur vorwärts.')]);
add('c2_c', 'zyklus', (g) => g.state.layers.cycle.count >= 1 && era(g) >= 7, [m('Beim zweiten Mal höre ich das Wort schon von Weitem. Es ist nicht mehr leise. Nur geduldig.')]);

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
