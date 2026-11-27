// Die Inselkette als Daten (DOM-frei): Inseln, Inseltiere, Aufgaben, Stücke, Sätze des Begleiters.
// Platzhalter in Texten: {B} = Name des Begleiters (die Spielerin wählt ihn, im Code gibt es keinen festen Namen).
import { parseMelody, parseNote } from './music.js';

/** Inseltiere: Merkhilfe, Tonname = Anfangsbuchstabe. `where` = Lage im Notensystem, `key` = Taste auf dem Klavier. */
export const ANIMALS = {
  C4: {
    name: 'Chamäleon', img: 'tier-c-chamaeleon',
    where: 'Das C hängt unter den fünf Linien. Es hat eine eigene kleine Hilfslinie mitten durch den Bauch.',
    key: 'Das Mittel-C ist die weiße Taste links neben den zwei schwarzen Tasten in der Mitte des Klaviers.',
  },
  D4: {
    name: 'Delfin', img: 'tier-d-delfin',
    where: 'Das D hängt direkt unter der untersten Linie, wie ein Delfin unter der Wasseroberfläche.',
    key: 'Das D liegt zwischen den zwei schwarzen Tasten.',
  },
  E4: {
    name: 'Eule', img: 'tier-e-eule',
    where: 'Das E sitzt auf der untersten Linie. Die Linie geht mitten durch die Note.',
    key: 'Das E liegt rechts neben den zwei schwarzen Tasten.',
  },
  F4: {
    name: 'Flamingo', img: 'tier-f-flamingo',
    where: 'Das F steht im ersten Zwischenraum, zwischen der untersten und der zweiten Linie.',
    key: 'Das F liegt links neben den drei schwarzen Tasten.',
  },
  G4: {
    name: 'Gecko', img: 'tier-g-gecko',
    where: 'Das G klebt auf der zweiten Linie von unten. Um diese Linie dreht sich auch der Notenschlüssel.',
    key: 'Das G liegt zwischen der ersten und der zweiten der drei schwarzen Tasten.',
  },
  A4: {
    name: 'Affe', img: 'tier-a-affe',
    where: 'Das A hängt im zweiten Zwischenraum.',
    key: 'Das A liegt zwischen der zweiten und der dritten der drei schwarzen Tasten.',
  },
  H4: {
    name: 'Hummer', img: 'tier-h-hummer',
    where: 'Das H liegt auf der mittleren Linie.',
    key: 'Das H liegt rechts neben den drei schwarzen Tasten.',
  },
  C5: {
    name: 'Clownfisch', img: 'tier-c2-clownfisch',
    where: 'Das hohe C schwimmt im dritten Zwischenraum. Es ist auch ein C, nur acht Töne höher.',
    key: 'Das hohe C ist das nächste C rechts vom Mittel-C: wieder links neben zwei schwarzen Tasten.',
  },
  // Linke Hand im Bassschlüssel: dieselben Tiere (gleicher Tonname = gleiches Tier), eigene Lage. bass: nicht doppelt ins Album.
  C3: {
    name: 'Chamäleon', img: 'tier-c-chamaeleon', bass: true,
    where: 'Im Bassschlüssel wohnt das tiefe C im zweiten Zwischenraum von unten.',
    key: 'Das tiefe C ist das nächste C links vom Mittel-C, wieder links neben zwei schwarzen Tasten. Dein kleiner Finger (5) liegt darauf.',
  },
  D3: {
    name: 'Delfin', img: 'tier-d-delfin', bass: true,
    where: 'Das tiefe D liegt genau auf der mittleren Linie.',
    key: 'Das D liegt zwischen den zwei schwarzen Tasten. Hier spielt der Ringfinger (4).',
  },
  E3: {
    name: 'Eule', img: 'tier-e-eule', bass: true,
    where: 'Das tiefe E sitzt im dritten Zwischenraum, direkt über der mittleren Linie.',
    key: 'Das E liegt rechts neben den zwei schwarzen Tasten. Hier spielt der Mittelfinger (3).',
  },
  F3: {
    name: 'Flamingo', img: 'tier-f-flamingo', bass: true,
    where: 'Das tiefe F steht auf der Linie zwischen den zwei Punkten des Bassschlüssels. Darum heißt er auch F-Schlüssel.',
    key: 'Das F liegt links neben den drei schwarzen Tasten. Hier spielt der Zeigefinger (2).',
  },
  G3: {
    name: 'Gecko', img: 'tier-g-gecko', bass: true,
    where: 'Das tiefe G hängt im obersten Zwischenraum.',
    key: 'Das G liegt zwischen der ersten und zweiten der drei schwarzen Tasten. Hier spielt der Daumen (1).',
  },
};

const song = (id, title, melody, extra = {}) => ({ id, kind: 'song', title, notes: parseMelody(melody), ...extra });
const learn = (note) => ({
  id: 'learn-' + note, kind: 'learn', note: parseNote(note), noteKey: note,
  title: note === 'C5' ? 'Neue Note: hohes C' : note === 'C3' ? 'Linke Hand: tiefes C' : note.endsWith('3') ? 'Linke Hand: ' + note[0] : 'Neue Note: ' + note[0],
});
const game = (id, notes, title = 'Notenspiel') => ({ id, kind: 'game', title, pool: notes.map(parseNote), count: 16 });

export const ISLANDS = [
  {
    id: 'i0', name: 'Palmeninsel', img: 'insel-palme', x: 13, y: 60,
    intro: 'Hier fängt alles an. Wir suchen zusammen das Mittel-C.',
    range: [60, 72],
    tasks: [
      {
        id: 'tour', kind: 'tour', title: 'Das Klavier kennenlernen',
        cards: [
          { title: 'Weiße und schwarze Tasten', text: 'Schau dir die schwarzen Tasten an: Sie kommen immer abwechselnd zu zweit und zu dritt. Daran erkennst du jede weiße Taste.', art: 'groups' },
          { title: 'Das Mittel-C', text: 'Such die zwei schwarzen Tasten in der Mitte des Klaviers. Die weiße Taste direkt links daneben ist das Mittel-C. Von hier aus geht unsere Reise los.', art: 'middlec' },
          { title: 'Deine Finger haben Nummern', text: 'Daumen 1, Zeigefinger 2, Mittelfinger 3, Ringfinger 4, kleiner Finger 5. Über den Noten steht klein, welcher Finger dran ist.', art: 'hand' },
          { title: 'So sitzt du gut', text: 'Setz dich so weit weg, dass deine Arme locker sind. Die Finger sind leicht gebogen, als hieltest du einen kleinen Ball.', art: 'ball' },
        ],
      },
      learn('C4'),
      song('erster-ton', 'Lang und kurz', 'C4 C4 C4:2 | C4:4 | C4:2 C4 C4 | C4:4', { own: true }),
    ],
  },
  {
    id: 'i1', name: 'Wasserfallinsel', img: 'insel-wasserfall', x: 33, y: 33,
    intro: 'Auf dieser Insel wohnen der Delfin und die Eule. Mit dem C hast du dann schon drei Töne.',
    range: [60, 72],
    tasks: [
      learn('D4'),
      learn('E4'),
      game('game-cde', ['C4', 'D4', 'E4']),
      song('wellenreiten', 'Wellenreiten', 'C4 D4 E4 D4 | C4 D4 E4:2 | E4 D4 C4 D4 | C4:4', { own: true }),
      song('moewenruf', 'Möwenruf', 'E4 E4 D4 D4 | C4 C4 D4:2 | E4 D4 E4 D4 | C4:4', { own: true }),
      song('ebbe-flut', 'Ebbe und Flut', 'C4:2 D4:2 | E4:2 D4:2 | C4 D4 E4 E4 | D4 D4 C4:2', { own: true }),
    ],
  },
  {
    id: 'i2', name: 'Vulkaninsel', img: 'insel-vulkan', x: 53, y: 63,
    intro: 'Hier ist es warm. Flamingo und Gecko warten schon. Danach kannst du fünf Töne, eine ganze Hand voll.',
    range: [60, 72],
    tasks: [
      learn('F4'),
      learn('G4'),
      game('game-cg', ['C4', 'D4', 'E4', 'F4', 'G4']),
      song('haenschen', 'Hänschen klein', 'G4 E4 E4:2 | F4 D4 D4:2 | C4 D4 E4 F4 | G4 G4 G4:2 | G4 E4 E4:2 | F4 D4 D4:2 | C4 E4 G4 G4 | C4:4', { trad: 'Volkslied' }),
      song('ode', 'Ode an die Freude', 'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4 D4 D4:2 | E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4 C4 C4:2', { trad: 'Ludwig van Beethoven' }),
      song('jingle', 'Jingle Bells', 'E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4 D4 | E4:4 | F4 F4 F4 F4 | F4 E4 E4 E4 | E4 D4 D4 E4 | D4:2 G4:2 | E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4 D4 | E4:4 | F4 F4 F4 F4 | F4 E4 E4 E4 | G4 G4 F4 D4 | C4:4', { trad: 'James Lord Pierpont' }),
    ],
  },
  {
    id: 'i3', name: 'Leuchtturminsel', img: 'insel-leuchtturm', x: 73, y: 30,
    intro: 'Vom Leuchtturm sieht man weit. Affe, Hummer und Clownfisch bringen dir die hohen Töne bei.',
    range: [60, 72],
    tasks: [
      learn('A4'),
      learn('H4'),
      learn('C5'),
      game('game-ca', ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'H4', 'C5']),
      song('entchen', 'Alle meine Entchen', 'C4 D4 E4 F4 | G4:2 G4:2 | A4 A4 A4 A4 | G4:4 | A4 A4 A4 A4 | G4:4 | F4 F4 F4 F4 | E4:2 E4:2 | D4 D4 D4 D4 | C4:4', { trad: 'Volkslied' }),
      song('weihnachtsmann', 'Morgen kommt der Weihnachtsmann', 'C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2 | G4 G4 F4 F4 | E4 E4 D4:2 | G4 G4 F4 F4 | E4 E4 D4:2 | C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2', { trad: 'Volkslied' }),
      song('wiegenlied', 'Wiegenlied', 'E4 E4 G4:2 | E4 E4 G4:2 | E4 G4 C5 H4 | A4:2 A4 G4 | D4 E4 F4 D4 | D4 E4 F4:2 | D4 F4 H4 A4 | G4 H4 C5:2', { trad: 'Johannes Brahms' }),
    ],
  },
  {
    id: 'i4', name: 'Höhleninsel', img: 'insel-hoehle', x: 0, y: 0,
    intro: 'In der Höhle klingt alles tiefer. Hier spielt deine linke Hand, im Bassschlüssel.',
    range: [48, 60],
    tasks: [
      {
        id: 'tour-bass', kind: 'tour', title: 'Die linke Hand',
        cards: [
          { title: 'Der Bassschlüssel', text: 'Tiefe Töne stehen in einer eigenen Notenzeile mit dem Bassschlüssel. Seine zwei Punkte umarmen eine Linie: das ist das F.', art: 'bass' },
          { title: 'Die linke Hand hat auch Nummern', text: 'Auch links ist der Daumen die 1 und der kleine Finger die 5. Weil die Hand gespiegelt ist, liegt der kleine Finger jetzt ganz links.', art: 'lefthand' },
          { title: 'Das tiefe C', text: 'Geh vom Mittel-C sieben weiße Tasten nach links. Da wohnt das tiefe C, wieder links neben zwei schwarzen Tasten. Darauf liegt dein kleiner Finger.', art: 'lowc' },
        ],
      },
      learn('C3'),
      learn('D3'),
      learn('E3'),
      game('game-bass-ce', ['C3', 'D3', 'E3'], 'Tiefsee-Spiel'),
      song('tropfen', 'Tropfen', 'C3 D3 E3 E3 | D3 C3 D3:2 | E3 E3 D3 D3 | C3:4', { own: true }),
      learn('F3'),
      learn('G3'),
      game('game-bass-cg', ['C3', 'D3', 'E3', 'F3', 'G3'], 'Höhlenfische'),
      song('hoehlenecho', 'Höhlenecho', 'C3 E3 G3:2 | G3 F3 E3:2 | D3 E3 F3 D3 | C3:4', { own: true }),
      song('haenschen-links', 'Hänschen klein (links)', 'G3 E3 E3:2 | F3 D3 D3:2 | C3 D3 E3 F3 | G3 G3 G3:2 | G3 E3 E3:2 | F3 D3 D3:2 | C3 E3 G3 G3 | C3:4', { trad: 'Volkslied' }),
      song('ode-links', 'Ode an die Freude (links)', 'E3 E3 F3 G3 | G3 F3 E3 D3 | C3 C3 D3 E3 | E3 D3 D3:2 | E3 E3 F3 G3 | G3 F3 E3 D3 | C3 C3 D3 E3 | D3 C3 C3:2', { trad: 'Ludwig van Beethoven' }),
    ],
  },
  {
    id: 'i5', name: 'Brückeninsel', img: 'insel-bruecke', x: 0, y: 0,
    intro: 'Über die Brücke reichen sich beide Hände die Melodie weiter. Oben spielt rechts, unten spielt links.',
    range: [48, 67],
    tasks: [
      {
        id: 'tour-grand', kind: 'tour', title: 'Zwei Zeilen, zwei Hände',
        cards: [
          { title: 'Zwei Zeilen zusammen', text: 'Beim Klavier stehen beide Notenzeilen übereinander. Oben der Violinschlüssel für die rechte Hand, unten der Bassschlüssel für die linke.', art: 'grand' },
          { title: 'Das Mittel-C wohnt dazwischen', text: 'Zwischen den beiden Zeilen hat das Mittel-C seine eigene kleine Hilfslinie. Es gehört zur rechten Hand: Dein rechter Daumen spielt es.', art: 'midc' },
          { title: 'Beide Hände liegen bereit', text: 'Die rechte Hand liegt mit dem Daumen auf dem Mittel-C, die linke mit dem kleinen Finger auf dem tiefen C. So erreichst du alle Töne, ohne zu rutschen.', art: 'hands' },
        ],
      },
      game('game-grand', ['C3', 'D3', 'E3', 'F3', 'G3', 'C4', 'D4', 'E4', 'F4', 'G4'], 'Oben oder unten?'),
      song('schaukel', 'Wellenschaukel', 'C4:2 C3:2 | E4:2 E3:2 | G4:2 G3:2 | C4:4', { own: true }),
      song('frage-antwort', 'Frage und Antwort', 'C4 D4 E4 F4 | G4:4 | G3 F3 E3 D3 | C3:4 | E4 F4 G4:2 | E3 D3 C3:2', { own: true }),
      song('haenschen-echo', 'Hänschen klein mit Echo', 'G4 E4 E4:2 | G3 E3 E3:2 | F4 D4 D4:2 | F3 D3 D3:2 | C4 E4 G4 G4 | C3 E3 G3 G3 | C4:4', { trad: 'Volkslied' }),
      song('ode-zwei', 'Ode an die Freude (zwei Hände)', 'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4 D4 D4:2 | E3 E3 F3 G3 | G3 F3 E3 D3 | C3 C3 D3 E3 | D3 C3 C3:2', { trad: 'Ludwig van Beethoven' }),
    ],
  },
];

export const islandById = (id) => ISLANDS.find((i) => i.id === id);
export function findTask(id) {
  for (const isl of ISLANDS) for (const t of isl.tasks) if (t.id === id) return { island: isl, task: t };
  return null;
}

/** Sätze des Begleiters. Kurz, du, ein Gedanke pro Satz. */
export const SAY = {
  hello: 'Hallo! Ich bin dein Papagei und segle mit dir über die Inseln. Wie soll ich heißen?',
  named: 'Super, ab jetzt heiße ich {B}. Komm, wir fahren zur ersten Insel!',
  renamed: 'Gefällt mir! Ab jetzt heiße ich {B}.',
  mapHint: 'Tipp eine Insel an, oder nimm einfach „Weiter üben“.',
  learnPlay: 'Spiel jetzt das {N} auf dem Klavier.',
  learnDone: 'Genau das war es! Das {N} kennst du jetzt.',
  songStart: 'Spiel die Noten von links nach rechts. Ich warte immer, bis der richtige Ton kommt.',
  wrong: 'Fast! Schau, wo dein Ton war, und such das {N}.',
  stars3: 'Wow, ohne einen einzigen Fehlgriff!',
  stars2: 'Richtig gut gespielt!',
  stars1: 'Geschafft! Nochmal spielen bringt mehr Sterne.',
  gameStart: 'Die Noten schwimmen heran! Spiel jede, sobald du sie erkennst. Diesmal ohne Namen.',
  islandDone: 'Diese Insel hast du geschafft! Die nächste wartet schon.',
  soon: 'Hier kommen wir später hin. Erst lernen wir die Töne der anderen Inseln.',
  doneToday: 'Für heute hast du richtig viel geschafft. Du darfst aber gern weiterspielen.',
};
/** Abwechselnde Sätze (eine Variante je Anlass, reihum, damit es nicht leiert). {N} = gesuchte Note. */
export const LINES = {
  perfect: ['Wow, ohne einen einzigen Fehlgriff!', 'Fehlerfrei! Das klang richtig schön.', 'Alles getroffen. Ich bin baff!'],
  almost: ['Fast perfekt, nur ein kleiner Wackler!', 'Fast fehlerfrei, super!'],
  good: ['Richtig gut gespielt!', 'Das wird immer sicherer!', 'Schön! Mit etwas Übung holst du alle Sterne.'],
  ok: ['Geschafft! Nochmal spielen bringt mehr Sterne.', 'Du hast durchgehalten, das zählt! Probier es gleich nochmal.'],
  wrong: ['Fast! Schau, wo dein Ton war, und such das {N}.', 'Knapp daneben. Das {N} ist gesucht.', 'Hoppla! Wo wohnt das {N}?', 'Nicht ganz. Such das {N} auf der Tastatur.'],
  gameWrong: ['Knapp daneben! Schau genau: Linie oder Zwischenraum?', 'Nicht ganz. Die richtige Taste leuchtet jetzt.', 'Hoppla! Lies die Note noch einmal.'],
  welcome: ['Schön, dass du wieder da bist!', 'Da bist du ja! Wollen wir weiter?', 'Ahoi! Die Inseln haben auf dich gewartet.'],
};

/** Lob bei Serien (wechselt, damit es nicht leiert). */
export const PRAISE = ['Super!', 'Weiter so!', 'Klasse!', 'Du bist richtig drin!', 'Wow!', 'Spitze!', 'So schön!', 'Ganz sicher!'];

/** Sätze auf der Karte. */
export const MAP_SAY = {
  start: 'Unsere erste Insel! Tipp drauf, dann legen wir an.',
  sail: 'Leinen los! Auf zur {I}!',
  arrived: 'Land in Sicht! Die {I} gehört jetzt dir. Tipp auf „Weiter üben“!',
  locked: 'Da kommen wir noch hin. Erst schaffen wir die {I}.',
  here: 'Tipp auf die {I}, dann geht es weiter.',
  sailTip: 'Leinen los! Auf zur {I}! Tipp aufs Wasser, dann segeln wir schneller.',
  finale: 'Jetzt spielst du mit beiden Händen! Bald kommen neue Inseln. Bis dahin kannst du überall Sterne sammeln.',
  allDone: 'Alle Inseln geschafft! Hol dir noch fehlende Sterne.',
};

export const NAME_IDEAS = ['Kiki', 'Coco', 'Pepe', 'Lori', 'Mango'];

export const say = (key, vars = {}) => SAY[key].replace(/\{(\w)\}/g, (_, k) => vars[k] ?? '');
