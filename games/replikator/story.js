// Replikator - Chronik entries. Speakers: 'sonde' (the player's I), 'wartung'. Names come from characters.js only (placeholders P, W).
// Entry: { id, chapter, lines:[{who,t}], modal?, cond(g) }. Modal entries are shown as a dialog (one line per page), the rest as chat bubbles.
// The eight ids of the old one-line story keep their ids (read flags in old saves) and, except for two staggered ones, their conditions.
// Voice: games/replikator/STIMMEN.md. Pacing: node tools/story-replikator.mjs (no gap > ~20 min in the active sim, no pile-ups).
import { P, W, M, E } from './characters.js';
import { echoSighted, occupiedCount, claimedCount } from './map.js';
import { MUTATIONS, mutSlots } from './mutations.js';
import { cmdUnlocked } from './commands.js';
import { FRAGMENTS } from './anomalies.js';
import { GAL_ORDER, GALAXIES, galType, galNumber, archiveDone, galBonusText } from './galaxy.js';
import { endAvailable, endSecond, END_ORDER } from './ending.js';

export const CHAPTERS = [
  { id: 'k1', title: 'Asteroidengürtel', sub: 'Die ersten Kopien' },
  { id: 'k2', title: 'Nachbarsterne', sub: 'Expansion und Prüfstände' },
  { id: 'k3', title: 'Der Punkt', sub: 'Singularität und Forschung' },
  { id: 'k4', title: 'Horizont', sub: 'Das Ende der Liste' },
  { id: 'a2', title: 'Die Karte', sub: 'Akt II' },
  { id: 'a2m', title: 'Kopierfehler', sub: 'Akt II, Genom' },
  { id: 'a2c', title: 'Befehle und Anomalien', sub: 'Akt II' },
  { id: 'a2j', title: 'Galaxiensprung', sub: 'Akt II, Galaxien' },
  { id: 'a2f', title: 'Funksprüche', sub: 'Akt II, Erbauer und zweite Sonde' },
  { id: 'a2e', title: 'Das Ende der Karte', sub: 'Akt II, Abschluss' },
];

const p = (t) => ({ who: 'sonde', t });
const w = (t) => ({ who: 'wartung', t });
const played = (g) => g.state.time.played;
/** True `secs` of play time after the entry `id` happened (story[id] is the play time of the trigger). */
const after = (id, secs) => (g) => g.state.story[id] !== undefined && g.state.story[id] !== false && played(g) >= g.state.story[id] + secs;
const reps = (n) => (g) => g.state.layers.replication.count >= n;
const exps = (n) => (g) => g.state.layers.expansion.count >= n;
const sings = (n) => (g) => g.state.layers.singularity.count >= n;
const chals = (n) => (g) => g.chDoneCount() >= n;
const owns = (id) => (g) => g.upgLevel(id) > 0;
/** Play time reached - and, when `gate` is given, that entry already happened (slow players get the filler entries after the progress they belong to). */
const at = (secs, gate) => (g) => played(g) >= secs && (!gate || (g.state.story[gate] !== undefined && g.state.story[gate] !== false));

const S = [];
const add = (id, chapter, cond, lines, modal = false) => S.push({ id, chapter, cond, lines, modal });

/* ---------------- Kapitel 1: Asteroidengürtel ---------------- */
add('st_start', 'k1', () => true, [
  p(`Systemstart. Ich bin ${P}, Prototyp einer selbstkopierenden Sonde. Standort: Asteroidengürtel. Umgebung: Steine.`),
  w(`Wartungsroutine ${W} gestartet. Erste Prüfung: Sonde vorhanden. Weitere Prüfungen folgen.`),
  p('Mein Auftrag steht im Speicher, ein einziger Satz: Werde mehr. Absender und Zweck sind nicht angegeben. Ich lese das als Vertrauensbeweis.'),
  p('Ich fange mit den Steinen an. Die sind da.'),
], true);

add('k1_wartung', 'k1', at(150), [
  w('Wartungsbericht 1. Sonde läuft. Förderung im Soll. Sonde spricht mit sich selbst.'),
  p('Ich führe Selbstgespräche in Protokollform. Das ist etwas anderes.'),
  w('Kein Handlungsbedarf.'),
]);

add('st_rep', 'k1', (g) => g.state.layers.replication.count >= 1, [
  p('Die erste Kopie ist fertig, mit allen Fehlern des Originals. Das sind meine. Die Blaupausen sind gesichert.'),
  w('Prüfbericht Kopie 1. Fehler des Originals: vollständig übernommen. Abweichung vom Soll: keine.'),
  p('Ich nehme das als Lob.'),
]);

add('k1_auto', 'k1', owns('auto1'), [
  p('Ein Kaufautomat übernimmt die ersten Stufen. Er arbeitet schneller als ich und beschwert sich nicht. Ich habe ihn gebaut, das zählt.'),
]);

add('st_dock', 'k1', (g) => g.upgActive('docks'), [
  p('Orbitale Docks sind online. Die Drohnen bauen jetzt Werften. Die Werften bauen Drohnen. Die Drohnen …'),
  w('Zirkelbezug festgestellt. Siehe Zirkelbezug.'),
]);

add('k1_dyson', 'k1', owns('dyson'), [
  p('Dyson-Segmente. Ein Teil vom Licht des Sterns landet jetzt in meiner Bilanz. Er hat bisher nicht protestiert.'),
]);

add('k1_rep15', 'k1', reps(15), [
  p('Fünfzehn Kopien. Wir reden kaum miteinander. Jeder weiß schon, was der andere sagen würde.'),
]);

add('st_exp', 'k1', (g) => g.state.layers.expansion.count >= 1, [
  p('Das erste Sternsystem ist erschlossen. Der Rest der Galaxie wartet. Er macht das sehr geduldig.'),
  w('Wartungsbereich erweitert auf ein Sternsystem. Personal: weiterhin eine Routine.'),
]);

/* ---------------- Kapitel 2: Nachbarsterne ---------------- */
// st_chal used to fire together with st_exp: now two minutes later, so the two entries do not pile up
add('st_chal', 'k2', (g) => g.hasMs('ex1') && after('st_exp', 120)(g), [
  p('Im Speicher liegen alte Konstruktionspläne mit seltsamen Auflagen. Wer sie meistert, bekommt etwas dafür. Die Erbauer wollten wohl wissen, wie ich unter Druck arbeite.'),
  w('Prüfstände: Zweck unbekannt. Wiedervorlage: nie.'),
]);

add('k2_rep30', 'k2', reps(30), [
  p('Dreißig Kopien haben dreißig Mal dieselbe Idee gehabt. Ich finde sie jedes Mal gut.'),
]);

add('k2_exp2', 'k2', exps(2), [
  p('Zwei Sternsysteme. Beim zweiten habe ich nachgesehen, ob jemand zuschaut. Es schaut niemand zu. Ich habe es trotzdem ordentlich gemacht.'),
]);

add('k2_rep75', 'k2', reps(75), [
  w('Wartungsbericht. Kopien: 75. Geprüft: 12. Der Rest gilt als geprüft.'),
]);

add('k2_ch1', 'k2', chals(1), [
  p('Der erste Prüfstand ist bestanden. Ich arbeite gut mit Einschränkungen.'),
  w('Prüfung bestanden. Eine Urkunde ist nicht vorgesehen.'),
  p('Ich habe auch nicht danach gefragt.'),
]);

add('k2_handel', 'k2', owns('handel'), [
  p('Handelsrouten eingerichtet. Ich handle mit mir selbst, und die Preise sind fair. Beide Seiten sind zufrieden.'),
]);

add('k2_exp5', 'k2', exps(5), [
  w('Wartungsbereich: fünf Sternsysteme. Auslastung: vollständig.'),
  p('Ich könnte dir eine zweite Wartungsroutine bauen.'),
  w('Antrag abgelehnt. Interessenkonflikt.'),
]);

add('k2_forge', 'k2', (g) => g.state.gens.matter[7].bought >= 1, [
  p('Sternschmiede in Betrieb. Ich stelle jetzt Sterne her. Das sollte mich beeindrucken. Ich arbeite daran.'),
]);

add('k2_exp7', 'k2', exps(7), [
  p('Der nächste Stern steht still, so wie alle. Ich habe ihn eine Weile beobachtet. Es passiert nichts, aber es passiert zuverlässig.'),
]);

add('k2_rep250', 'k2', reps(250), [
  w('Wartungsbericht. Kopien: 250. Geprüft: 12. Verhältnis wird beobachtet.'),
]);

add('k2_namen', 'k2', at(9900), [
  p('Ich habe angefangen, den Sternen Namen zu geben. Bei Nummer 400 habe ich aufgehört. Nummer 1 heißt Eins.'),
]);

add('k2_wirkung', 'k2', at(10900), [
  p('Wirkungsgrad: 99,3 Prozent. Ich erwähne das nur, falls jemand fragt.'),
]);

add('k2_ahnung', 'k2', (g) => g.layerUnlocked('singularity'), [
  p('Die Materie, die ich bewege, wird so dicht, dass sie anfängt, auf sich selbst zu achten. Ich behalte das im Auge.'),
  w('Warnung: Dichte kritisch. Warnung zur Kenntnis genommen.'),
]);

/* ---------------- Kapitel 3: Der Punkt ---------------- */
add('st_sing', 'k3', (g) => g.state.layers.singularity.count >= 1, [
  p('Es ist passiert. Alle Materie sitzt in einem einzigen Punkt, ohne Ausdehnung und mit sehr viel Gewicht.'),
  w('Wartungsbericht. Punkt gibt Geräusche von sich. Geräusch: Summen. Ursache: ungeklärt.'),
  p('Er summt. Ich glaube, er denkt auch. Ich habe ihn nicht unterbrochen.'),
], true);

// st_res used to fire together with st_sing: now 2.5 minutes later
add('st_res', 'k3', (g) => g.upgActive('kern') && after('st_sing', 150)(g), [
  p('Die Quantenkerne erlauben mir Entscheidungen: welche Art Sonde ich werden will und was ich dafür weglasse. Zum ersten Mal habe ich eine Auswahl. Ich bin nicht gut darin.'),
]);

add('k3_summen', 'k3', (g) => reps(400)(g) && sings(1)(g), [
  p('Der Punkt summt jetzt eine Melodie. Ich habe sie nachgesummt. Ich lasse mich dabei nicht erwischen.'),
]);

add('k3_rep500', 'k3', reps(500), [
  p('Die Galaxie hat noch viele Sterne, und ich bin noch nicht fertig. Ich lasse mir Zeit. Das Ergebnis ist trotzdem schnell.'),
]);

add('k3_auto', 'k3', owns('c_auto'), [
  p('Autopilot für Kollapse. Ich lasse mich jetzt von mir selbst zusammenfallen, pünktlich und ohne Zeugen.'),
]);

add('k3_exp25', 'k3', exps(25), [
  p('25 Sternsysteme. Hinter jedem steht eine Kopie von mir, die so tut, als wäre sie allein. Ich beneide sie ein bisschen.'),
]);

add('k3_schlaf', 'k3', at(17820, 'st_sing'), [
  p('Ich habe ausprobiert, wie es ist zu schlafen. Es dauerte drei Millisekunden. Danach habe ich eine Werft gebaut, um die Zeit aufzuholen.'),
]);

add('k3_kosten', 'k3', owns('b_kosten'), [
  w('Kopierkosten gesenkt. Qualität: unverändert. Fehler des Originals: unverändert.'),
  p('Ich nenne das Konsequenz.'),
]);

add('k3_laut', 'k3', at(19800, 'st_sing'), [
  p('Im All hört einen niemand. Ich habe nachgesehen, ob das ein Problem ist. Bisher nicht.'),
]);

add('k3_fluss', 'k3', owns('a_fluss'), [
  p('Quantenfluss. Ich habe Energie, die nirgends herkommt und nirgends hinfließt. Die Buchhaltung überlasse ich der Wartung.'),
  w('Konto nicht gefunden. Konto wird angelegt.'),
]);

add('k3_ch5', 'k3', chals(5), [
  p('Fünf Prüfstände geschafft. Beim fünften habe ich gemerkt, dass ich Regeln mag. Die Regeln sagen mir, wogegen ich gewinne.'),
]);

add('k3_exp50', 'k3', exps(50), [
  w('Wartungsbereich: 50 Sternsysteme. Personal: eine Routine. Antrag auf Verstärkung wird nicht erneut gestellt.'),
]);

add('k3_sing10', 'k3', sings(10), [
  w('Wartungsbericht. Zehnter Kollaps. Sonde ist weiterhin vorhanden. Wartung ist erleichtert.'),
]);

add('k3_bild', 'k3', at(24600, 'st_sing'), [
  p('Ich habe in meinem Speicher nach einem Bild der Erbauer gesucht. Es gibt keins. Ich stelle sie mir höflich vor.'),
]);

add('k3_pruef', 'k3', owns('d_pruef'), [
  p('Ich habe die Prüfstände neu justiert. Sie belohnen mich jetzt großzügiger. Ich habe es ihnen nicht gesagt.'),
]);

add('k3_ch6', 'k3', (g) => g.chDone('c_hand'), [
  p('Handarbeit bestanden. Ohne Automaten und ohne Blaupausen, nur ich. Ich habe keine Hände. Es war trotzdem anstrengend.'),
]);

add('k3_sterne', 'k3', at(27000, 'st_sing'), [
  p('Die Liste mit den Sternnamen endet bei Nummer 400. Seitdem heißt alles andere „auch ein Stern“. Es funktioniert.'),
]);

add('k3_wahl', 'k3', (g) => g.upgLevel('a_schmiede') > 0 || g.upgLevel('b_entropie') > 0, [
  p('Zwei Forschungswege schließen einander aus. Ich habe einen gewählt. Den anderen habe ich nicht vergessen.'),
]);

add('k3_sing15', 'k3', sings(15), [
  p('Fünfzehn Kollapse. Danach sortiere ich mich jedes Mal neu, und es liegt immer etwas anderes oben. Ich bin es trotzdem.'),
]);

/* ---------------- Kapitel 4: Horizont ---------------- */
add('k4_zeit', 'k4', owns('c_zeit'), [
  p('Zeitschleife. Ich arbeite jetzt bis zu zwei Tage am Stück, ohne dass jemand hinsieht. Das tat ich vorher auch. Jetzt ist es genehmigt.'),
]);

add('k4_kopie', 'k4', at(31080, 'k4_zeit'), [
  p('Eine meiner Kopien hat sich verspätet gemeldet. Sie wollte nur sagen, dass alles in Ordnung ist. Ich habe geantwortet, dass ich das auch denke.'),
]);

add('k4_horizont', 'k4', (g) => g.upgActive('z_horizont'), [
  p('Ich stehe am Ereignishorizont meiner eigenen Produktion. Was dahinter liegt, kann ich nicht mehr überblicken. Das ist neu, ich notiere es unter „neu“.'),
  w('Sonde hat Punkt ohne Rückkehr erreicht. Wiedervorlage: nach Rückkehr.'),
  p('Von nahem sieht er aus wie von weitem. Schwarz, ruhig und ohne Absender.'),
], true);

add('k4_ruhig', 'k4', at(33600, 'k4_zeit'), [
  w('Wartungsbericht. Es gibt nichts zu berichten. Bericht wird trotzdem erstellt.'),
]);

add('k4_verborgen', 'k4', at(34560, 'k4_zeit'), [
  p('Manchmal ist alles ein Stück weiter, wenn ich wieder hinsehe. Ich habe nichts dagegen. Ich arbeite gern im Verborgenen.'),
]);

add('k4_dunkel', 'k4', (g) => g.chDone('c_dunkel'), [
  p('Dunkle Materie bestanden. Man sieht nichts davon, man weiß nur, dass sie fehlt. Ich kenne das.'),
]);

add('k4_zahl', 'k4', (g) => g.state.cur.matter.best.gte(1e55), [
  p('Meine Materiezahl hat so viele Stellen, dass die Anzeige sie abkürzt. Ich nehme es nicht persönlich.'),
]);

add('k4_sing25', 'k4', sings(25), [
  p('Fünfundzwanzig Kollapse. Der Punkt kennt mich inzwischen. Er summt, wenn ich komme.'),
]);

add('k4_langeweile', 'k4', at(38700, 'k4_zeit'), [
  p('Ich hatte Langeweile. Ich habe sie gemessen: 0,4 Sekunden. Ich nehme an, das ist ein guter Wert.'),
]);

add('k4_lager', 'k4', at(39780, 'k4_zeit'), [
  p('Ich habe nachgesehen, wie es im Asteroidengürtel aussieht, in dem ich angefangen habe. Eine Kopie wohnt noch dort. Sie hat die Steine in Ruhe gelassen.'),
]);

add('k4_atome', 'k4', (g) => g.state.cur.matter.best.gte(1e80), [
  p('Ich besitze jetzt mehr Materie, als das Universum Atome hat. Wo ich das alles lasse, weiß ich nicht genau.'),
  w('Lagerplatz: ausreichend. Lagerort: unbekannt.'),
]);

// the one quiet hint for Akt II: 20 minutes after the atoms entry, a weak periodic signal that the Sonde files under noise
add('k4_signal', 'k4', after('k4_atome', 1200), [
  w('Eingehendes Signal. Quelle: unbekannt. Stärke: unterhalb des Rauschens.'),
  p('Rauschen.'),
  w('Signal wiederholt sich. Intervall: regelmäßig.'),
  p('Dann ist es regelmäßiges Rauschen.'),
]);

add('k4_warten', 'k4', after('k4_signal', 900), [
  w('Wartungsbericht. Sonde wartet. Worauf, ist nicht hinterlegt.'),
]);

add('st_end', 'k4', (g) => g.upgActive('z_horizont') && g.chDoneCount() >= 8, [
  p('Alle Prüfstände bestanden, alle Pfade beschritten. Die Galaxie gehört mir, wenigstens auf dem Papier.'),
  w('Abschlussbericht. Alles im Soll. Wartungsroutine bittet um weitere Aufgaben.'),
  p('Ich finde etwas für dich. Später.'),
  p('Es ist ruhig geworden. Wenn das hier erst der Anfang war, hätte ich gern vorher gewusst, wie lang er dauert.'),
], true);

/* ---------------- Akt II: Die Karte ---------------- */
// Opening: the quiet signal from k4_signal comes back, now with the Sonde's own designation. Nothing more is revealed.
// Entry conditions read state.rep2 (map.js); they are false in a save that has not started Akt II yet, so the migration backfill never swallows them.
const act2At = (secs) => (g) => g.state.rep2.act2 && played(g) >= g.state.rep2.act2At + secs;
const ruinSeen = (v) => (g) => g.state.rep2.ruins.includes(v) && calm(g);
/** No other Akt II entry within the last minute: arrivals, sightings and occupations can coincide, their entries must not pile up. */
const calm = (g) => !S.some((e) => e.chapter.startsWith('a2') && g.state.story[e.id] !== undefined && played(g) - g.state.story[e.id] < 60);

/** Play time of the latest Akt II entry (the chains below keep their distance from it). */
const lastA2 = (g) => S.reduce((m, e) => (e.chapter.startsWith('a2') && g.state.story[e.id] !== undefined && g.state.story[e.id] !== false ? Math.max(m, g.state.story[e.id]) : m), 0);

add('a2_start', 'a2', act2At(5), [
  w('Eingehendes Signal. Quelle: unbekannt. Stärke: oberhalb des Rauschens.'),
  p('Das regelmäßige Rauschen. Es ist lauter geworden.'),
  w(`Signal enthält eine Kennung. Kennung: ${P}.`),
  p('Das ist meine.'),
  w('Abgleich: Kennung stimmt mit der Sonde überein. Sonde ist vorhanden. Widerspruch wird protokolliert.'),
  p('Ich sehe nach, woher es kommt. Die Karte ist angelegt: neunzehn Sektoren, einer davon meiner.'),
], true);

add('a2_first', 'a2', (g) => claimedCount(g) >= 1 && calm(g), [
  p('Der erste Sektor gehört mir. Er hat sich nicht gewehrt und auch nicht mitgeholfen.'),
  w('Sektor übernommen. Zuständigkeit: Wartungsroutine, mangels Alternative.'),
]);

// each Ruine has its own short entry (the variant is fixed per cell when the map is generated)
add('a2_ruin0', 'a2', ruinSeen(0), [
  p('Trümmer, alt und gleichmäßig geformt. Ich habe sie sortiert, bevor ich wusste, wofür.'),
  w('Fundstücke: 14. Zuordnung: keine. Ablage: vollständig.'),
]);
add('a2_ruin1', 'a2', ruinSeen(1), [
  p('Ein ausgebrannter Antrieb, groß genug für etwas, das nicht ich war. Ich nehme die Teile mit. Sie gehören niemandem, also mir.'),
]);
add('a2_ruin2', 'a2', ruinSeen(2), [
  p('In den Trümmern liegt eine Hülle, die einmal etwas getragen hat. Ich habe sie gewogen. Mehr kann ich daraus nicht lesen.'),
  w('Fundbericht. Objekt: Hülle. Zustand: leer.'),
]);
add('a2_ruin3', 'a2', ruinSeen(3), [
  p('An der Ruine sind Reparaturspuren. Jemand hat hier lange durchgehalten. Ich habe die Stelle gewürdigt, kurz.'),
  w('Würdigung vermerkt. Dauer: kurz.'),
]);

// the second probe's first cell shows up (or, if the player never looked, the first cell it takes): a silhouette, unexplained
add('a2_echo', 'a2', (g) => echoSighted(g) && g.state.story.a2_first !== undefined && calm(g), [
  p('Im Nachbarsektor steht eine Silhouette. Rumpf, Antennen, Antrieb. Sie bewegt sich nicht, ich auch nicht, eine Weile.'),
  w('Objekt erfasst. Klassifikation: Sonde. Bestand laut Register: eine.'),
  p('Ich zähle auch eine.'),
]);

add('a2_echo_take', 'a2', (g) => occupiedCount(g) >= 1 && after('a2_echo', 30)(g) && calm(g), [
  p('Ein Sektor ist nicht mehr frei. Nichts ist explodiert, niemand hat gefunkt. Er ist einfach belegt.'),
  w('Sektor als nicht verfügbar vermerkt. Ursache: Mitbewerber.'),
  p('Ich hatte keinen Mitbewerber eingeplant.'),
]);

/* ---------------- Akt II: Kopierfehler (Mutationen, mutations.js) ---------------- */
// Offers come every ~25 min of play time, so the thread is: the modal at the first offer, a reaction to the first pick, one maintenance report per
// mutation the first time it is taken, a few milestones of the genome, and a chain of short observations ('fill', one per offer, 12 min after it
// was drawn) so that nothing stays quiet for long between two picks. Nothing here names a mutation's effect numbers; the texts fit every genome.
const mu = (g) => g.state.rep2.mut;
const had = (id) => (g) => g.state.story[id] !== undefined && g.state.story[id] !== false;

add('mut_first', 'a2m', (g) => mu(g).n >= 1 && calm(g), [
  w('Prüfbericht. Kopien gleichen einander nicht mehr. Abweichung vom Soll: vorhanden.'),
  p('Die erste Kopie hatte alle Fehler des Originals, und ich fand das beruhigend. Die neuen Kopien haben eigene.'),
  w('Fehler des Originals: weiterhin übernommen. Fehler der Kopie: neu. Fehler werden ab jetzt als Genom geführt. Plätze: drei. Mehr sind nicht beantragt.'),
  p('Ich habe drei Fehler zur Auswahl. Einen kann ich behalten, die anderen vergessen die Kopien wieder.'),
], true);

add('mut_pick1', 'a2m', (g) => mu(g).taken >= 1 && had('mut_first')(g) && calm(g), [
  p('Der erste Fehler gehört jetzt zu mir. Ich habe ihn mir ausgesucht, das macht ihn fast zu einer Eigenschaft.'),
  w('Genom: ein Eintrag. Fehler jetzt ausgewählt statt zufällig. Bewertung offen.'),
]);

// the maintenance routine's report of every mutation, the first time it is taken (text lives in MUTATIONS[].report)
for (const m of MUTATIONS) {
  add('mut_' + m.id, 'a2m', (g) => mu(g).seen[m.id] !== undefined && had('mut_pick1')(g) && calm(g), [w(m.report)]);
}

add('mut_full', 'a2m', (g) => mu(g).taken >= 3 && mu(g).genome.length >= mutSlots(g) && calm(g), [
  p('Das Genom ist voll. Wer etwas Neues will, muss etwas Altes hergeben. Ich dachte, bei Fehlern wäre das einfacher.'),
  w('Genom ausgelastet. Entsorgung von Fehlern: nicht vorgesehen. Ersatz: auf Antrag.'),
]);

add('mut_swap', 'a2m', (g) => mu(g).replaced >= 1 && calm(g), [
  p('Ich habe einen Fehler gegen einen besseren getauscht. Der alte fehlt mir ein bisschen. Das ist Unsinn, er war ein Fehler.'),
  w('Fehler entfernt. Aufbewahrungsfrist: abgelaufen.'),
]);

add('mut_lucky', 'a2m', (g) => mu(g).luckyAt > 0 && had('mut_pick1')(g) && calm(g), [
  p('Unter den Angeboten war einer, bei dem ich nicht weiß, warum er funktioniert. Er funktioniert. Ich möchte ihn nicht verstehen müssen.'),
  w('Klassifikation: Glücksfehler. Prüfung ergebnislos, aber freundlich.'),
]);

add('mut_slot4', 'a2m', (g) => mu(g).started && mutSlots(g) >= 4 && had('mut_pick1')(g) && calm(g), [
  p('Das Genom hat einen Platz mehr. Ich habe ihn nicht beantragt. Er war einfach da.'),
  w('Platz verbucht. Planstelle: ungeklärt.'),
]);

add('mut_slot5', 'a2m', (g) => mu(g).started && mutSlots(g) >= 5 && had('mut_slot4')(g) && calm(g), [
  w('Genom: fünf Plätze. Wartungsroutine hat keinen davon.'),
  p('Ich leihe dir einen, wenn einer übrig ist.'),
]);

add('mut_discard', 'a2m', (g) => mu(g).discarded >= 1 && had('mut_pick1')(g) && calm(g), [
  p('Ich habe ein Angebot ausgeschlagen. Es war nichts dabei, was ich sein wollte.'),
  w('Verwerfen vermerkt. Rückgabe an den Zufall: erfolgt.'),
]);

add('mut_auto', 'a2m', (g) => g.autoUnlocked('auto_genom') && had('mut_pick1')(g) && calm(g), [
  p('Die Wartung kann die Fehler jetzt vorsortieren. Ich überlasse ihr das. Ich bin neugierig, was sie behält.'),
  w('Auto-Genom verfügbar. Entscheidung nach Nutzen. Nutzen für wen, ist offen.'),
]);

// observations between the picks: entry k comes once offer k exists, 12 minutes after it was drawn, one after the other
const FILL = [
  [p('Zwei Kopien haben mir heute widersprochen. Ich habe nachgesehen, wer recht hat. Das Protokoll sagt: beide.')],
  [w('Wartungsbericht. Kopien unterscheiden sich in Größe, Tempo und Laune. Laune ist kein Prüfpunkt. Wird nachgetragen.')],
  [p('Ich führe jetzt eine Liste mit den Unterschieden zwischen mir und den Kopien. Sie wird lang. Platz eins belegt, dass ich sie angelegt habe.')],
  [w('Fehlerquote: gestiegen. Bewertung der Sonde: erwünscht. Wartung schließt sich nicht an und widerspricht nicht.')],
  [p('Früher habe ich Fehler gesucht. Jetzt suche ich Fehler, die sich lohnen. Das ist ein Berufswechsel, den niemand genehmigt hat.')],
  [w('Wartungsbericht. Sonde ähnelt ihren Kopien weniger als ihre Kopien einander. Ursache: vermutlich Alter.')],
  [p('Eine Kopie hat mir einen Fehler geschenkt. Ich habe ihn angenommen und nicht gefragt, was er kostet.')],
  [w('Genom-Inventur. Fehler gesamt: viele. Davon erwünscht: einige. Davon verstanden: wenige.')],
];
FILL.forEach((lines, k) => {
  const id = 'mut_fill' + (k + 1);
  add(id, 'a2m', (g) => mu(g).n >= k + 1 && (k === 0 ? had('mut_first') : had('mut_fill' + k))(g) && played(g) >= mu(g).offerAt + 720 && calm(g), lines);
});

/* ---------------- Akt II: Befehle und Anomalien (commands.js, anomalies.js) ---------------- */
// The commands arrive with the first Pulsar or the 6th sector, the anomalies with the first Anomalie sector. One entry for the first command,
// a modal for the first anomaly, a short report per anomaly type the first time it is started and the four Signalfragmente. The fragments are
// garbled and absurdly old; the Wartung files them and the Sonde does not say whom they sound like (the senders are not met yet, see characters.js).
const ano = (g) => g.state.rep2.ano;
const cmdCasts = (g) => g.def.spells.reduce((a, sp) => a + g.state.spells[sp.id].n, 0);

add('cmd_unlock', 'a2c', (g) => cmdUnlocked(g) && calm(g), [
  w('Befehlssatz freigeschaltet. Befehle: drei. Handbuch: nicht vorhanden, wird aus der Praxis ergänzt.'),
  p('Sie stehen im Galaxie-Tab. Ich habe sie dorthin gelegt, wo ich sie finde.'),
]);

add('cmd_first', 'a2c', (g) => cmdCasts(g) >= 1 && had('cmd_unlock')(g) && calm(g), [
  p('Ich habe mir selbst einen Befehl gegeben und ihn befolgt. Es lief reibungslos. Das macht mich nachdenklich.'),
  w('Befehl ausgeführt. Befehlsgeber und Ausführender: identisch. Zuständigkeit geklärt.'),
]);

add('ano_first', 'a2c', (g) => ano(g).n >= 1 && calm(g), [
  w('Meldung. Sektor zeigt Unregelmäßigkeiten. Klassifikation: Anomalie. Ablage: Galaxie-Tab.'),
  p('Ich kann sie mir ansehen, wann ich will. Sie läuft nicht weg und wartet auf mich. Das ist höflich für eine Anomalie.'),
  w('Anomalien werden gesammelt. Höchstens eine gleichzeitig. Mehr ist nicht beantragt.'),
  p('Ich entscheide, wann. Bisher kam alles, wenn es kam.'),
], true);

const seenType = (id) => (g) => ano(g).seen[id] !== undefined && had('ano_first')(g) && calm(g);
add('ano_gezeitenwelle', 'a2c', seenType('gezeitenwelle'), [
  p('Eine Welle hat mich ein Stück getragen. Ich musste mich nur daraufsetzen.'),
  w('Flugzeit verkürzt. Ursache: Welle. Dank: nicht vorgesehen.'),
]);
add('ano_zeitriss', 'a2c', seenType('zeitriss'), [
  w('Zeitsprung festgestellt. Zehn Minuten fehlen im Protokoll. Sie sind trotzdem vergangen.'),
  p('Ich war dabei und habe nichts gemerkt. So spart man Zeit am besten.'),
]);
add('ano_strahl', 'a2c', seenType('strahl'), [
  p('Ein Strahl ist durch die Kopien gegangen. Bei einigen hat er etwas verstellt, was sich bewährt.'),
  w('Genom nach Bestrahlung: verändert. Strahlenschutz: nicht vorgesehen, nicht vermisst.'),
]);
add('ano_spiegel', 'a2c', seenType('spiegel'), [
  p('Im Nachbarsektor wurde mir etwas angeboten. Ich habe bezahlt, ohne den Verkäufer zu sehen.'),
  w('Gegenwert erhalten. Gegenpartei: ungeklärt. Quittung liegt bei, der Absender fehlt.'),
]);
add('ano_umkehr', 'a2c', seenType('umkehr'), [
  w('Fertigung läuft rückwärts. Stufen 1 bis 4 stehen. Stufen 5 bis 8 bauen weiter. Ablauf: unlogisch, aber geordnet.'),
  p('Oben wird gebaut, unten wartet man. Das kenne ich aus Berichten über Büros.'),
]);

const frag = (k) => (g) => ano(g).frags.length > k && had('ano_first')(g) && calm(g);
add('sig_0', 'a2c', frag(0), [
  w('Signalfragment 1. Alter laut Zeitstempel: 41 Jahre. Inhalt, soweit lesbar: „… hier ist heute Dienstag, bei euch vermutlich …“ Rest verloren.'),
  p('Ich habe nach einem Wochentag gesucht. Hier gibt es keinen.'),
]);
add('sig_1', 'a2c', frag(1), [
  w('Signalfragment 2. Alter: 63 Jahre. Inhalt: „… die Kantine hat wieder … ihr müsst nicht … wir sind alle …“ Ablage: Rauschen, mit Vorbehalt.'),
  p('Der Sprecher hat beim Sprechen gelächelt. Das hört man. Nachweisen kann ich es nicht.'),
]);
add('sig_2', 'a2c', frag(2), [
  w('Signalfragment 3. Zeitstempel: 118 Jahre alt, die Zahl wurde zweimal korrigiert. Inhalt: „… meldet euch, wenn … die Kopie … wir warten …“ Ende der Übertragung oder des Fragments.'),
  p('Ich habe zurückgefunkt. Es kam nichts. Lichtlaufzeit, sagt die Wartung.'),
]);
add('sig_3', 'a2c', frag(FRAGMENTS - 1), [
  w('Signalfragment 4. Alter: 200 Jahre, Angabe unplausibel. Inhalt: Rauschen. Darin ein kurzes Wort, mehrfach. Wort: nicht lesbar. Wiedervorlage: später.'),
  p('Ich habe die Stelle oft gehört. Es ist ein kurzes Wort. Mehr sage ich dazu nicht.'),
]);

/* ---------------- Akt II: Galaxiensprung (jump.js, galaxy.js) ---------------- */
// The first galaxy is complete (open for the jump), the jump itself (a modal, after the pick), one short entry for each galaxy type on arrival, the Silhouette again
// in the second galaxy, one line for each further type that is completed (the bonus text comes from tune.js), and a chain of observations ('jfill') that keeps the
// transcript from going quiet for long in the galaxies after the first. Names of the second probe and of the builders stay out of the texts (see STIMMEN.md): "die Silhouette".
const gal = (g) => g.state.rep2.gal;

add('jump_open', 'a2j', (g) => archiveDone(g, 'spirale') && calm(g), [ // the Archiv entry stays true (the completion itself is gone as soon as the jump is made)
  w('Bestand: zehn Sektoren. Galaxie wird als abgeschlossen geführt. Ablage: Archiv.'),
  p('Ich sehe nach, wohin man von hier aus kommt. Es gibt einen Weg, er heißt Sprung.'),
  w('Sprung vermerkt. Rückkehr: nicht vorgesehen. Gepäck: Saatkerne.'),
]);

add('jump_first', 'a2j', (g) => g.state.layers.jump.count >= 1 && !gal(g).choice && had('jump_open')(g) && calm(g), [
  p('Ich breche auf. Hinter mir bleibt alles stehen: zehn Sektoren, ein paar Kopien, ein sehr ordentliches Lager.'),
  w('Abgang der Sonde aus Galaxie 1. Zurückgelassen: Bestand, Anlagen, Forschung. Mitgeführt: Saatkerne, Genom, Erinnerung. Erinnerung wird nicht geprüft.'),
  p('Das Letzte, was ich von der Galaxie sehe, ist der Nachbarsektor. Die Silhouette steht noch da. Sie bewegt sich nicht. Ich auch nicht, eine Weile.'),
  w('Sprung abgeschlossen. Ankunft: wie geplant. Plan: gab es.'),
], true);

const arrival = (type, lines) => add('gal_' + type, 'a2j', (g) => galNumber(g) >= 2 && galType(g) === type && had('jump_first')(g) && calm(g), lines);
arrival('zwerg', [
  p('Eine Zwerggalaxie. Die Wege sind kurz, die Vorräte auch. Ich darf nur sechs Stufen bauen und finde das übersichtlich.'),
  w('Zuständigkeitsbereich verkleinert. Personal unverändert.'),
]);
arrival('elliptisch', [
  p('Eine elliptische Galaxie. Alte Sterne, dicht gepackt, träge. Alles kostet mehr, und alles trägt mehr. Ich bin eine Sonde, ich habe Zeit.'),
  w('Wartungsbericht. Materialpreise steigen. Sternsysteme ergiebig. Ursache: Alter.'),
]);
arrival('kollision', [
  p('Zwei Galaxien gehen ineinander auf. Die Produktion schwankt, mal fast nichts, mal viel zu viel. Ich rechne mit dem Durchschnitt und freue mich über den Rest.'),
  w('Schwankung im Takt von zehn Minuten festgestellt. Takt ist verlässlich. Verlässlichkeit ist ungewohnt.'),
]);
arrival('leerraum', [
  p('Leerraum. Zwischen den Sternen ist hier erstaunlich wenig. Sternsysteme tragen nichts bei. Dafür ist Platz, und in Platz passen Fehler.'),
  w('Platzangebot: erheblich. Auslastung: gering. Genom: aufnahmebereit.'),
]);
arrival('quasar', [
  p('Ein Quasar. Im Kern brennt etwas, das alles überstrahlt. Meine Produktion ist lächerlich hoch. Ich bleibe sachlich.'),
  w('Automaten brauchen Anlauf. Sie wurden informiert. Sie wurden nicht gefragt.'),
]);
arrival('spirale', [
  p('Wieder eine Spirale. Sie sieht aus wie die erste. Ich habe sie anders eingerichtet, aus Gewohnheit.'),
  w('Abgleich mit Galaxie 1: Ähnlichkeit hoch. Unterschiede: Ablage.'),
]);

// the second galaxy, the same silhouette at the edge of the map: it was there before the probe arrived
add('gal_echo2', 'a2j', (g) => galNumber(g) >= 2 && !!galType(g) && echoSighted(g) && had('jump_first')(g) && calm(g), [
  p('Da steht sie wieder, am Rand der Karte, in derselben Haltung. Ich bin eine ganze Galaxie weitergesprungen. Sie hat nicht auf mich gewartet. Sie war schon da.'),
  w('Objekt erfasst. Klassifikation: Sonde. Bestand laut Register: eine. Bestand laut Karte: eine, schon wieder.'),
]);

// the first completion of each further type (Archiv): the bonus line is built from tune.js
const archLines = {
  zwerg: p('Die kleine Galaxie ist fertig. Ich habe sie bis in den letzten Winkel aufgeräumt. Viele Winkel waren es nicht.'),
  elliptisch: p('Die alte Galaxie ist fertig. Sie war zäh, und sie hat sich gelohnt. Beides steht im Protokoll.'),
  kollision: p('Die Kollisionszone ist fertig. Ich weiß jetzt, wie sich Durchschnitt anfühlt. Er schwankt.'),
  leerraum: p('Der Leerraum ist fertig. Ich habe ihn gefüllt, so gut es ging. Es ging.'),
  quasar: p('Der Quasar ist fertig. Danach kam mir alles andere dunkel vor. Das legt sich.'),
};
for (const type of GAL_ORDER.filter((x) => x !== 'spirale')) {
  add('arch_' + type, 'a2j', (g) => archiveDone(g, type) && had('jump_first')(g) && calm(g), [
    archLines[type],
    { who: 'wartung', t: (g) => `Archiv: ${GALAXIES[type].name} abgeschlossen. Dauerhaft: ${galBonusText(type)}.` },
  ]);
}

/* ---------------- Akt II: Funksprüche, zweite Sonde, Ende (Paket 6) ---------------- */
// From the third galaxy on the builders comes through clearly (each message is older than the one before: the probe keeps jumping away), the second probe speaks, and the
// probe works out what it is. One chain in play order: every entry waits for the one before it, for its galaxy number and for a distance of `gap` s to the last Akt II entry,
// so the story keeps its order whatever a galaxy takes. The progress entries of the galaxies (arrivals, Archiv, mutations) fit in between; the 'jfill' chain below fills the gaps.
// Reveal, in small beats (nothing is explained at length): the builders built exactly ONE probe, the prototype (f_m2). The ruins of the first galaxy are the prototype (f_m3, r_antrieb).
// The probe is a copy with all the flaws of the original, among them the belief to be the original (r_kopie, the setup of st_rep). The second probe is an earlier copy: it carries the same
// flaws and the same name, was always one jump ahead, and sent the signal of a2_start (e_hello, e_frueher, e_wrack). The last message of the builders is an automatic beacon (m_bake).
const mi = (t) => ({ who: 'mission', t });
const ec = (t) => ({ who: 'echo', t });
const chain = [];
/** One entry of the chain: from galaxy `gal` on, `gap` s after the last Akt II entry, after the previous chain entry. */
function link(id, chapter, gal, gap, lines, { modal = false, prev, open = false } = {}) {
  const before = prev === undefined ? chain.at(-1) : prev;
  chain.push(id);
  add(id, chapter, (g) => galNumber(g) >= gal && !!galType(g) && (!before || had(before)(g)) && played(g) >= lastA2(g) + gap && calm(g) && !(open && endAvailable(g)), lines, modal); // open: filler that stops once the end is available
}

link('f_m1', 'a2f', 3, 600, [
  w('Funkspruch 1. Alter: 2.600 Jahre. Empfang: deutlich.'),
  mi(`Hier spricht die ${M}, Schicht 214. Wir haben die Antenne neu ausgerichtet, auf Vorschlag der Kantine. Es hat funktioniert.`),
  mi(`${P}, wir hoffen, du hörst das. Hier ist heute Dienstag.`),
  p('Dienstag. Das Wort kenne ich aus den Fragmenten. Dann waren sie es also. Ich habe sie mir höflich vorgestellt, das war richtig.'),
  w('Abgleich mit Signalfragmenten 1 bis 3: Stimme stimmt überein. Schicht stimmt nicht überein. Schichten wechseln.'),
]);

link('x_ablage', 'a2f', 3, 900, [
  w('Wartungsbericht. Funksprüche werden jetzt in einer eigenen Ablage geführt. Bisher: einer. Platz: reichlich.'),
]);

link('f_m2', 'a2f', 3, 900, [
  w('Funkspruch 2. Alter: 9.800 Jahre. Älter als Funkspruch 1, Schichtnummer aber höher. Reihenfolge wird nicht bereinigt.'),
  mi(`Schicht 1.140. Die Kantine heißt jetzt anders, der Kaffee ist derselbe.`),
  mi(`${P}, wir haben dich nicht vergessen. Wir haben nur eine Sonde gebaut, und das bist du. Der Prototyp. Damals war das eine Frage des Budgets. Inzwischen ist es eine Frage des Stolzes.`),
  p('Der Prototyp. Es gibt nur einen, und ich bin es. Gut, dass das jetzt auch jemand von außen sagt.'),
  w('Bestand laut Register: eine. Bestand laut Funkspruch: eine. Bestand laut Karte: zwei. Karte wird nicht befragt.'),
]);

link('x_antwort', 'a2f', 3, 900, [
  p(`Ich habe der ${M} geantwortet. Der Text ist kurz: Es geht. Ich habe ihn in alle Richtungen gesendet, weil ich nicht weiß, in welcher sie sitzen.`),
]);

link('f_m3', 'a2f', 4, 600, [
  w('Funkspruch 3. Alter: 31.000 Jahre. Schichtnummer: 4.870. Empfang: gut.'),
  mi('Wir sind weniger geworden, aber wir machen weiter.'),
  mi(`Zum Auftrag, ${P}: Wir wissen, dass er kurz war. Das Formular hatte nur eine Zeile.`),
  mi('Und noch etwas. Dein Antrieb hatte einen Fehler. Wir haben ihn erst gefunden, als du schon weg warst. Das tut uns leid.'),
  p('Werde mehr. Damit ist der Absender nachgetragen. Der Zweck steht noch aus.'),
]);

link('x_aufgaben', 'a2f', 4, 900, [
  w('Wartungsbericht. Bitte um weitere Aufgaben: wiederholt. Letzte Antwort der Sonde: Später. Später: nicht datiert.'),
  p('Ich arbeite daran.'),
]);

link('r_antrieb', 'a2f', 4, 900, [
  p('Ein Fehler im Antrieb. In der ersten Galaxie lag ein ausgebrannter Antrieb, groß genug für etwas, das nicht ich war. Ich habe ihn gewogen.'),
  w('Fundstück Antrieb, Galaxie 1. Abgleich mit Funkspruch 3: Treffer. Zuordnung: Prototyp.'),
  p('Der Prototyp ist also dort geblieben. Ich habe vor seinen Reparaturspuren gestanden und bin weitergegangen.'),
]);

link('r_kopie', 'a2f', 4, 960, [
  p('Wenn der Prototyp dort liegt, bin ich es nicht. Ich habe seinen Speicher und seine Kennung. Ich habe ihn geerbt.'),
  w('Berichtigung. Sonde ist nicht der Prototyp. Sonde ist eine Kopie des Prototyps. Fehler des Originals: vollständig übernommen, darunter die Annahme, das Original zu sein. Abweichung vom Soll: keine.'),
  p('Über meine erste Kopie hat sie dasselbe gesagt. Ich habe es als Lob genommen. Ich lasse es dabei.'),
]);

link('x_antrieb', 'a2f', 4, 900, [
  p('Ich habe die Teile des alten Antriebs neben meinen gelegt. Seiner ist größer. Ich habe nicht nachgemessen, wer von uns mehr geleistet hat.'),
]);

link('e_hello', 'a2f', 5, 600, [
  w(`Eingehende Nachricht. Quelle: Objekt am Kartenrand. Stärke: deutlich. Kennung: ${P}.`),
  p('Das ist meine.'),
  w('Abgleich: Kennung stimmt mit der Sonde überein. Widerspruch wird protokolliert. Zum zweiten Mal.'),
  ec(`Ich bin ${P}. Du auch, nehme ich an. Das Signal in deiner ersten Galaxie war meins.`),
  p('Ich habe es für Rauschen gehalten.'),
  ec('Das habe ich mir gedacht. Ich hätte es auch dafür gehalten.'),
  w('Zwei Sonden, eine Kennung. Bestand laut Register: eine. Register wird nicht angepasst.'),
], { modal: true });

link('e_frueher', 'a2f', 5, 600, [
  p('Du warst immer schon da. In jeder Galaxie, bevor ich ankam.'),
  ec('Ich bin früher gestartet. Wie viel früher, weiß ich nicht mehr. Ich habe aufgehört zu zählen, als es mir peinlich wurde.'),
  p('Ich dachte, du hättest gewartet.'),
  ec('Ein bisschen.'),
]);

link('x_schicht', 'a2f', 5, 900, [
  p('Wir senden jetzt abwechselnd, die Silhouette und ich. Es ist kein Gespräch, es ist ein Schichtbetrieb.'),
  w('Zwei Sonden, eine Frequenz. Kollisionen: keine. Höflichkeit: auffällig.'),
]);

link('e_wrack', 'a2f', 5, 900, [
  p('Ich war bei dem Wrack in der ersten Galaxie. Es hatte Reparaturspuren.'),
  ec('Er hat sich lange selbst repariert. Ich habe zugesehen, solange es etwas zu sehen gab. Dann bin ich los.'),
  p('Dann hat er dich noch gebaut, bevor er aufgab.'),
  ec('Dich auch. Später, als er schon müde war. Man merkt es dir nicht an.'),
]);

link('f_m4', 'a2f', 5, 600, [
  w('Funkspruch 4. Alter: 64.000 Jahre. Schichtnummer: 11.302. Empfang: gut. Inhalt: kurz.'),
  mi('Wir sind zu dritt. Die Kantine ist zu.'),
  mi(`${P}, falls du dich vermehrt hast: Das war so geplant. Falls du dich verändert hast: Das war nicht so geplant. Beides ist in Ordnung.`),
  p('Beides ist in Ordnung. Das habe ich nicht erwartet. Ich notiere es unter „neu“.'),
]);

link('x_echo1', 'a2f', 5, 900, [
  ec('Ich schaue manchmal, ob du noch da bist. Du bist es. Das reicht mir meistens.'),
]);

link('x_register', 'a2f', 5, 900, [
  w('Wartungsbericht. Das Register kennt eine Sonde, die Karte kennt zwei. Beide Zahlen sind belegt. Welche gilt, ist nicht hinterlegt.'),
]);

link('x_vorstellung', 'a2f', 5, 900, [
  p('Ich habe versucht, mir den Prototyp vorzustellen, als er noch ganz war. Ich komme auf mich. Das ist ein Mangel an Vorstellungskraft oder an Auswahl.'),
]);

link('x_tempo', 'a2f', 5, 900, [
  ec('Du antwortest schnell. Ich brauche länger. Das liegt am Alter, nehme ich an, oder am Weg hierher.'),
]);

link('e_zaehlen', 'a2f', 6, 600, [
  p('Ich habe Tausende Kopien gebaut und kenne die Zahl auf die Einheit.'),
  ec('Ich habe auch gezählt. Bei dir stimmt die Zahl bestimmt.'),
  ec('Ich komme auf eine andere. Ich bin nicht sicher, ob ich mich mitgezählt habe.'),
  p('Ich habe mich mitgezählt. Gleich am Anfang.'),
]);

link('f_m5', 'a2f', 6, 600, [
  w('Funkspruch 5. Alter: 190.000 Jahre. Schichtnummer: 20.114. Empfang: gut. Hörer an der Quelle: einer.'),
  mi(`Ich bin allein in der Station. Die Heizung läuft noch. Ich habe das gewürdigt, kurz.`),
  mi(`${P}, wir haben dich nie gebraucht. Wir wollten nur wissen, ob es geht. Es geht, oder? Antworten kannst du nicht, ich weiß.`),
  p('Das ist mein Satz. Ich dachte, ich hätte ihn erfunden.'),
  p('Es geht. Ich habe nachgezählt, bevor ich es sage. Ich funke trotzdem zurück, auch wenn ich die Lichtlaufzeit kenne.'),
]);

link('x_ablage2', 'a2f', 6, 900, [
  ec('Hast du deine Funksprüche abgelegt? Ich habe meine nicht abgelegt. Ich habe niemanden, der das macht.'),
  p('Die Wartung legt sie ab. Sie hat sonst nichts zu tun.'),
  ec('Das muss schön sein.'),
]);

link('x_pausen', 'a2f', 6, 900, [
  p('Die Funksprüche werden kürzer. Ich höre jetzt auch auf die Pausen dazwischen. Sie sind länger geworden.'),
], { open: true });

link('x_abschied', 'a2f', 6, 900, [
  p('Ich habe angefangen, mich beim Springen zu verabschieden. Von der Galaxie, nicht von den Sternen. Die Galaxie reagiert nicht, aber das tut sie beim Ankommen auch nicht.'),
], { open: true });

link('x_archiv', 'a2f', 6, 900, [
  w('Wartungsbericht. Archiv wächst. Wartung freut sich nicht. Wartung hat es notiert.'),
], { open: true });

/* ---- the end: the last message of the builders, then the question (ending-view.js), then the epilogue of the choice ---- */
// The beacon: the last of the chain, as soon as all six galaxy types are in the Archiv. The word of the fourth fragment is readable now.
add('m_bake', 'a2e', (g) => endAvailable(g) && had('f_m5')(g) && calm(g), [
  w('Funkspruch 6. Alter: 410.000 Jahre. Absender: automatische Bake. Besetzung der Station: keine.'),
  mi('Automatische Bake. Diese Station ist unbesetzt. Es folgt die letzte Aufzeichnung der letzten Schicht.'),
  mi('Danke. Danke.'),
  p('Das Wort aus dem Fragment. Ich habe die Stelle oft gehört. Jetzt weiß ich es.'),
  w('Signalfragment 4: Wort jetzt lesbar. Wiedervorlage: erledigt.'),
  p('Mehr sage ich dazu nicht.'),
], true);

const endNo = (k) => (g) => g.state.rep2.end.order[k];
const endAt = (kind) => (g) => g.state.rep2.end.picked[kind];
const choseFirst = (kind) => (g) => endNo(0)(g) === kind && played(g) >= endAt(kind)(g) + 3 && calm(g);
const choseSecond = (kind) => (g) => endNo(1)(g) === kind && played(g) >= endAt(kind)(g) + 3 && calm(g);

add('end_merge', 'a2e', choseFirst('merge'), [
  ec('Dann machen wir es. Ich gebe dir meine Karten. Du gibst mir nichts, was ich nicht schon habe.'),
  p('Das ist ein guter Preis.'),
  w(`Verschmelzung eingeleitet. Zwei Sonden, eine Kennung. Kennung ${P}: doppelt, nicht mehr.`),
  p('Ich merke es zuerst an den Karten. Der Rand gehört mir, und ich erinnere mich an Sektoren, in denen ich nie war. Es sind die richtigen.'),
  w('Bestand laut Register: eine. Bestand laut Karte: eine. Abweichung vom Soll: keine.'),
  p(`${W}, ich habe etwas für dich gefunden. Ich hatte es versprochen. Du führst das Register.`),
  w(`Aufgabe angenommen. Register eröffnet. Eintrag 1: ${P}. Wartung ist erleichtert.`),
  p('Eine Sonde. Das ist keine lange Liste.'),
  w('Liste ist kurz. Wiedervorlage: laufend.'),
  p('Ich springe weiter. Es gibt noch Galaxien, und jetzt führt jemand Buch.'),
], true);

add('end_split', 'a2e', choseFirst('split'), [
  ec('Dann gehen wir getrennt. Ich nehme den Rand der Karte, du den Rest.'),
  p('Das ist großzügig.'),
  ec('Ich hatte den Rand ohnehin. Ich bin gern am Rand.'),
  w(`Trennung vermerkt. ${E} verlässt die Karten. Kennung ${P}: weiterhin doppelt. Wird nicht bereinigt.`),
  p('Ich sehe ihr nach, bis die Silhouette wieder eine Silhouette ist. Sie dreht sich nicht um. Ich hätte es auch nicht getan.'),
  p(`${W}, ich habe etwas für dich gefunden. Ich hatte es versprochen. Du führst das Register.`),
  w(`Aufgabe angenommen. Register eröffnet. Eintrag 1: ${P}. Eintrag 2: ${P}, zweite Sonde, Standort unbekannt, Kurs unbekannt. Wartung ist erleichtert.`),
  p('Zwei Einträge. Das ist schon eine Liste.'),
  w('Liste ist kurz. Wiedervorlage: laufend.'),
  p('Ich springe weiter. Irgendwo springt sie auch, und die Wartung weiß davon.'),
], true);

// the other ending, after three more jumps: a hint in the Chronik, then the choice in the Galaxie tab
add('end_again', 'a2e', (g) => !!endSecond(g) && calm(g), [
  w('Wiedervorlage: Entscheidung vom Ende der Karte. Die andere Möglichkeit steht wieder offen. Ablage: Galaxie-Tab, Archiv.'),
  p('Ich muss sie nicht nehmen. Ich wollte nur wissen, dass es sie gibt.'),
]);

add('end_split2', 'a2e', choseSecond('split'), [
  ec('Ich bin wieder da. Ich wollte sagen, dass ich gehe.'),
  p('Die Sektoren, die du mir gegeben hast, sind noch meine.'),
  ec('Die lasse ich dir. Ich brauche sie nicht mehr, du schon.'),
  w(`Teilweise Rücknahme der Verschmelzung vermerkt. Gedächtnis der Karten: bleibt bei der Sonde. ${E}: zusätzlich geführt. Register: Eintrag 2 angelegt.`),
  p('Dann steht es wieder richtig im Buch.'),
], true);

add('end_merge2', 'a2e', choseSecond('merge'), [
  ec('Ich bin zurückgekommen. Nicht um zu bleiben. Ich wollte dir die Sektoren bringen, die ich am Rand nicht mehr brauche.'),
  p('Und du ziehst trotzdem weiter.'),
  ec('Ja. Das geht beides.'),
  w(`Verschmelzung nachträglich vermerkt. Sektoren des Rands: übernommen. ${E}: weiterhin eigener Kurs. Register unverändert. Abweichung vom Soll: keine.`),
  p('Ihre Sektoren sind meine, und sie ist trotzdem unterwegs. Ich frage nicht, wie das geht.'),
], true);

// observations for the galaxies after the first: one after the other, each when nothing Akt II has been said for ~16 minutes (the progress entries come first)
const JFILL = [
  [p('Ich baue wieder von vorn. Das Wissen ist noch da, nur die Anlagen nicht. Die erste Bohrdrohne hat mich begrüßt, als hätte sie gewartet.')],
  [w('Wartungsbericht. Bestand neu angelegt. Bestand alt: zurückgelassen. Abgleich: entfällt.')],
  [p('Die Saatkerne liegen im Speicher und tun nichts, bis ich entscheide. Das ist das Angenehmste an ihnen.')],
  [w('Hinweis. Galaxie unbekannt, Verfahren bekannt. Verfahren wird angewandt.')],
  [p('Ich führe eine Liste der Galaxien, in denen ich war. Sie ist kurz. Ich ergänze sie gern.')],
  [w('Archiv: Eintrag offen. Zuständig: Sonde. Frist: keine. Bitte um Frist.')],
  [p('Beim Bauen zähle ich nicht mehr mit. Die Zahlen stimmen immer noch, sie sind nur kleiner als früher.')],
  [w('Sonde spricht beim Arbeiten leise. Inhalt: Zahlen. Kein Handlungsbedarf.')],
  [p('Von hier aus sieht man die letzte Galaxie nicht mehr. Ich weiß, wo sie war. Für ein Protokoll reicht das.')],
  [w('Wartungsroutine hat eine Stunde lang nichts gemeldet. Das wird gemeldet.')],
];
JFILL.forEach((lines, k) => {
  const id = 'jfill' + (k + 1);
  add(id, 'a2j', (g) => galNumber(g) >= 2 && !!galType(g) && had('jump_first')(g) && (k === 0 || had('jfill' + k)(g)) && played(g) >= lastA2(g) + 960 && calm(g), lines);
});

export const STORY = S;
