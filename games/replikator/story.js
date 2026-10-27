// Replikator - Chronik entries. Speakers: 'sonde' (the player's I), 'wartung'. Names come from characters.js only (placeholders P, W).
// Entry: { id, chapter, lines:[{who,t}], modal?, cond(g) }. Modal entries are shown as a dialog (one line per page), the rest as chat bubbles.
// The eight ids of the old one-line story keep their ids (read flags in old saves) and, except for two staggered ones, their conditions.
// Voice: games/replikator/STIMMEN.md. Pacing: node tools/story-replikator.mjs (no gap > ~20 min in the active sim, no pile-ups).
import { P, W } from './characters.js';

export const CHAPTERS = [
  { id: 'k1', title: 'Asteroidengürtel', sub: 'Die ersten Kopien' },
  { id: 'k2', title: 'Nachbarsterne', sub: 'Expansion und Prüfstände' },
  { id: 'k3', title: 'Der Punkt', sub: 'Singularität und Forschung' },
  { id: 'k4', title: 'Horizont', sub: 'Das Ende der Liste' },
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

export const STORY = S;
