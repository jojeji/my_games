// Myzel - Chronik entries. Speakers: 'myzel' (the player's I), 'taxus' (old yew), 'kurt' (dung beetle). Proper names come from characters.js only (placeholders T, K).
// Entry: { id, chapter, lines:[{who,t}], modal?, cond(g) }. Modal entries are dialogs (one line per page), the rest chat bubbles. Voice and world rules: STIMMEN.md.
//
// Pacing is told in VISITS, not minutes (the player looks in 5-10 times a day for a few minutes): the story is ONE chain. Every entry waits for
// its predecessor (`after`), for a spacing in play time (`gap`, so no two entries come at once) and for a piece of progress (`when`); a few
// entries also carry `wait`, a fallback after which they come anyway (their text is true either way). `tools/story-myzel.mjs` prints the
// transcript with the calendar time of every visit of the "Pendler" scenario, `tests/sim-myzel-story.test.mjs` asserts the rhythm.
import { T, K } from './characters.js';
import { ENDING } from './ending.js';

export const CHAPTERS = [
  { id: 'k1', title: 'Erde', sub: 'Der erste Tag' },
  { id: 'k2', title: 'Hüte', sub: 'Die Eibe' },
  { id: 'k3', title: 'Zwei Wege', sub: 'Flechte oder Fäulnis' },
  { id: 'k4', title: 'Der Wald', sub: 'Waldnetz und Ringe' },
  { id: 'k5', title: 'Der Ring', sub: 'Das Ende' },
  { id: 'k6', title: 'Nachspiel', sub: 'Danach' },
];

const m = (t) => ({ who: 'myzel', t });
const t = (x) => ({ who: 'taxus', t: x });
const k = (x) => ({ who: 'kurt', t: x });
const played = (g) => g.state.time.played;
const done = (g, id) => g.state.story[id] !== undefined && g.state.story[id] !== false;

/* ---- progress readers (monotonic: counts, milestones, flags - never a stock that a reset wipes) ---- */
const spreads = (n) => (g) => g.state.layers.h.count >= n;
const fruits = (n) => (g) => g.state.layers.f.count >= n;
const lichens = (n) => (g) => g.state.layers.l.count + g.state.layers.z.count >= n;
const forests = (n) => (g) => g.state.layers.w.count >= n;
const rings = (n) => (g) => g.state.layers.r.units >= n;
const years = (n) => (g) => g.state.myz.jr >= n;
const showers = (n) => (g) => g.state.myz.rain.n >= n;
const ms = (...ids) => (g) => ids.some((id) => g.hasMs(id));
const owns = (id) => (g) => g.upgLevel(id) > 0;
const chDone = (id) => (g) => g.chDone(id);
const forked = (f) => (g) => g.forkChoice(f) !== null;
const ended = (g) => g.state.myz.end > 0;
const any = (...fs) => (g) => fs.some((f) => f(g));
/** Variant text by the choice of fork A (s | m) or fork B (l | z). */
const byA = (s, mm) => (g) => (g.forkChoice('a') === 's' ? s : mm); // the CHOSEN branch (forkIs is true for both once the Waldnetz opened the second one)
const byB = (l, z) => (g) => (g.forkChoice('b') === 'l' ? l : z);

const S = [];
/**
 * One link of the chain. after = the predecessor's id, gap = play seconds after it, when = the progress condition,
 * wait = fallback seconds after the predecessor (ignored while an old save is backfilled: a text may not run ahead of the real progress).
 */
const link = (id, chapter, after, { gap = 2400, when = () => true, wait = null, modal = false } = {}, lines) =>
  S.push({
    id, chapter, modal, lines,
    cond: (g) => {
      const at = g.state.story[after];
      if (at === undefined || at === false) return false;
      if (played(g) < at + gap) return false;
      return when(g) || (wait !== null && !g._backfill && played(g) >= at + wait);
    },
  });
const MIN = 60;
const H = 3600;

/* ---------------- Kapitel 1: Erde (Tag 1) ---------------- */
S.push({
  id: 'st_start', chapter: 'k1', modal: true, cond: () => true,
  lines: [
    m('Kühl und feucht. Mehr kann ich über meine Lage noch nicht sagen. Augen habe ich keine, ich schmecke.'),
    m('Über mir liegt Laub und darüber ein Baum. Er schmeckt nach sehr alt. Ich möchte wissen, ob er allein ist.'),
    k('Hoppla! Hier liegt was. Ich wollte eigentlich nur kurz–'),
    m('Das war ein Käfer. Er ist weitergelaufen. Er schmeckte erdig und eilig.'),
    m('Ich fange mit dem an, was da ist. Nährstoffe gibt es überall. Ich bin nur noch nicht überall.'),
  ],
});

link('k1_faden', 'k1', 'st_start', { gap: 20 * MIN, when: spreads(1), wait: 90 * MIN }, [
  m('Der erste Faden hat sich gegabelt. Dann der nächste. Ich zähle mit, so lange es noch geht.'),
]);

link('k1_regen', 'k1', 'k1_faden', { gap: 45 * MIN, when: showers(2), wait: 2 * H }, [
  m('Wenn es regnet, schmeckt der Boden nach Himmel. Danach wachse ich schneller als sonst.'),
  m('Ich möchte mir nichts darauf einbilden. Es ist der Regen.'),
]);

link('k1_kurt', 'k1', 'k1_regen', { gap: 60 * MIN, when: spreads(3), wait: 2.5 * H }, [
  k(`Du! Der Boden mit dem Geschmack. Ich bin ${K}.`),
  m('Ich bin das Myzel.'),
  k('Schön. Ich muss los, ich habe einen Termin mit einem Blatt.'),
  m('Das Blatt liegt dort seit letztem Herbst. Es wird warten.'),
]);

link('k1_gestalt', 'k1', 'k1_kurt', { gap: 60 * MIN, when: spreads(6), wait: 3 * H }, [
  m('Ich weiß, wie ich schmecke. Wie ich aussehe, weiß ich nicht.'),
  k('Von hier siehst du aus wie Boden!'),
  m('Danke. Das ist eine Antwort, wenn auch keine gute.'),
]);

link('fork_a', 'k1', 'k1_gestalt', { gap: 40 * MIN, when: forked('a'), modal: true }, [
  m(byA(
    'Sporen. Ein Teil von mir wird Wind und fliegt. Die meisten landen im Nichts. Das ist Statistik.',
    'Wurzelspitzen. Wo ich eine finde, lege ich mich um sie und halte fest. Dafür bekomme ich Zucker.',
  )),
  k(byA('Kinder in den Wind? Ich winke dann mal.', 'Du hältst Händchen mit einem Baum? Ich sage nichts.')),
  m('Der alte Baum schmeckt jetzt deutlicher. Ich komme näher.'),
]);

link('k1_einheit', 'k1', 'fork_a', { gap: 60 * MIN, when: ms('s_keep1', 'm_keep1'), wait: 2 * H }, [
  m(byA(
    'Die erste Spore ist draußen. Ich habe sie nicht gespürt, nur ein bisschen weniger Nährstoff.',
    'Die erste Wurzelspitze ist umschlossen. Sie schmeckt nach Baum und ist aufdringlich süß.',
  )),
]);

link('k1_drei', 'k1', 'k1_einheit', { gap: 60 * MIN, when: ms('s_keep2', 'm_keep2'), wait: 2.5 * H }, [
  k(byA('Du wirfst ganz schön viel in die Luft. Ich habe einen Haufen davon gefressen.', 'Du sitzt jetzt an drei Wurzeln. Das sieht auf dem Boden aus wie Ordnung.')),
  m(byA('Das war nicht der Plan.', 'Das war der Plan.')),
]);

link('k1_geruch', 'k1', 'k1_drei', { gap: 60 * MIN, when: spreads(10), wait: 3 * H }, [
  m('Der Geschmack über mir wird stärker. Er schmeckt nach Rinde und einer sehr langen Zeit.'),
  m('Ich habe beschlossen, dass ich dorthin will. Der Weg ist noch nicht beschlossen.'),
]);

link('k1_hut', 'k1', 'k1_geruch', { gap: 60 * MIN, when: (g) => g.layerUnlocked('f'), wait: 3 * H }, [
  m('Etwas in mir will nach oben. Ich habe dem Teil gesagt, dass das einen Tag dauert.'),
  m('Er hat zugehört, aber nicht verstanden.'),
]);

link('k1_nacht', 'k1', 'k1_hut', { gap: 3 * H, when: () => true }, [
  m(`${K} sagt, jetzt sei Nacht. Ich habe keinen Unterschied bemerkt. Ich werde weiter darauf achten.`),
]);

/* ---------------- Kapitel 2: Hüte (Tag 2) ---------------- */
link('f_first', 'k2', 'k1_nacht', { gap: 45 * MIN, when: fruits(1), modal: true }, [
  m('Ein Hut ist durch die Erde gekommen. Ich spüre ihn nicht. Ich weiß es, weil ihn jemand bemerkt hat.'),
  t('Da steht ein Pilz an meinem Fuß.'),
  m('Der gehört mir.'),
  t('Dann bist du der Untermieter. Ich habe dich seit einer Weile in den Wurzeln. Ich dachte, es juckt.'),
  m('Ich bin das Myzel. Ich wollte fragen, ob du allein bist.'),
  t('Das fragt man eine Eibe nicht am ersten Tag.'),
]);

link('k2_vertrag', 'k2', 'f_first', { gap: 90 * MIN, when: fruits(1) }, [
  t('Ich mache dir ein Angebot. Du lieferst Phosphor, ich liefere Zucker. Ich führe Buch.'),
  m('Ich habe keinen Vorrat an Phosphor.'),
  t('Dann beeil dich.'),
]);

link('k2_durre', 'k2', 'k2_vertrag', { gap: 90 * MIN, when: any(chDone('durre'), fruits(3)), wait: 4.5 * H }, [
  m('Es war trocken. Ich habe gewartet, bis es vorbei war. Warten kann ich.'),
  t('Ich auch. Aber ich hatte Übung.'),
]);

link('k2_kurt2', 'k2', 'k2_durre', { gap: 90 * MIN, when: fruits(2), wait: 4.5 * H }, [
  k(`Hallo! Ich bin ${K}.`),
  m(`Ich kenne einen ${K}.`),
  k('Das war mein Vater. Oder ich. Wir sind nicht so für Unterschiede.'),
  t('Es gibt nur einen. Er kommt jeden Sommer wieder.'),
]);

link('k2_frost', 'k2', 'k2_kurt2', { gap: 90 * MIN, when: any(chDone('frost'), fruits(4)), wait: 4.5 * H }, [
  t('Frost. Ich lasse die Nadeln oben und die Gedanken unten. Das empfehle ich dir auch.'),
  m('Ich habe nur Gedanken.'),
  t('Dann halte sie fest.'),
]);

link('k2_wolke', 'k2', 'k2_frost', { gap: 90 * MIN, when: fruits(3), wait: 4.5 * H }, [
  m(`Der Regen hat gestern alles gewaschen und heute alles wachsen lassen. Es werden mehr Hüte an ihrem Fuß. ${T} hat nichts dazu gesagt. Ich werte das als Zustimmung.`),
]);

link('k2_kahl', 'k2', 'k2_wolke', { gap: 90 * MIN, when: any(chDone('kahl'), fruits(5)), wait: 4.5 * H }, [
  m('Am Rand, wo der Boden wärmer ist, fehlen Bäume. Ich schmecke Sägemehl, aber sehr altes.'),
  t('Da standen wir. Vierzehn Stück. Sie wollten Holz für ihre Bögen.'),
  m('Und du?'),
  t('Ich bin krumm gewachsen. Mit mir war kein Geschäft zu machen.'),
  m('Ich bin hier.'),
  t('Ich weiß. Du juckst.'),
]);

/* ---------------- Kapitel 3: Zwei Wege (Tag 3) ---------------- */
link('fork_b', 'k3', 'k2_kahl', { gap: 45 * MIN, when: forked('b'), modal: true }, [
  m(byB(
    'Flechte. Ich teile mich mit einer Alge, die Licht kann. Sie macht den Zucker, ich halte die Rinde zusammen.',
    'Fäulnis. Was reif ist, darf fallen. Ich esse, was übrig bleibt, und mache etwas daraus.',
  )),
  t(byB('Eine Alge. Mit der habe ich schon verhandelt. Sie redet nur über sich.', 'Das ist ein ehrliches Geschäft. Ich bin dafür.')),
  k(byB('Flechten! Die sehen aus wie Schimmel mit Manieren.', 'Moder! Da wohne ich.')),
  m('Zwei Wege, und ich nehme einen. Der andere bleibt zu, bis der Wald ihn öffnet.'),
]);

link('k3_jahr', 'k3', 'fork_b', { gap: 90 * MIN, when: years(1), wait: 4.5 * H }, [
  m('Ein Jahr ist vergangen. Ich habe es an einem Ring bemerkt. Sonst war es wie immer.'),
  t('Ich zähle seit dreihundert Jahren nicht mehr mit. Bei dir fange ich vielleicht wieder an.'),
]);

link('k3_flug', 'k3', 'k3_jahr', { gap: 90 * MIN, when: any(years(3), fruits(5)), wait: 4.5 * H }, [
  k(`Frau ${T}! Boden! Ich habe Flügel! Seit heute früh. Ich wusste nicht, dass ich welche habe.`),
  m('Herzlichen Glückwunsch.'),
  k('Ich probiere sie aus. Wenn ich–'),
  t('Er kommt wieder. Sie kommen immer wieder, nur nie lange.'),
]);

link('k3_erste', 'k3', 'k3_flug', { gap: 90 * MIN, when: lichens(1), wait: 4.5 * H }, [
  m((g) => (g.forkChoice('b') === 'l'
    ? 'Die Flechte sitzt jetzt an der Rinde. Sie schmeckt nach Licht, falls Licht schmecken kann.'
    : `Was fällt, wird Humus. Er schmeckt nach Herbst, sagt ${K}. Ich kenne keinen.`)),
]);

link('k3_buch', 'k3', 'k3_erste', { gap: 90 * MIN, when: fruits(6), wait: 4 * H }, [
  t('Ich habe dein Konto geprüft. Du schuldest mir Phosphor.'),
  m('Ich habe geliefert.'),
  t('Das war ein anderes Konto.'),
]);

link('k3_zahlen', 'k3', 'k3_buch', { gap: 90 * MIN, when: years(7), wait: 4 * H }, [
  m('Ich habe aufgehört zu zählen. Es geht nicht mehr. Ich weiß nicht, wann es aufgehört hat.'),
]);

link('k3_stille', 'k3', 'k3_zahlen', { gap: 90 * MIN, when: ms('l_m2', 'z_m2'), wait: 4 * H }, [
  t('Du bist jetzt tiefer als meine Wurzeln.'),
  m('Ist das schlimm?'),
  t('Es ist kühl dort. Ich war nie dort.'),
]);

link('w_first', 'k3', 'k3_stille', { gap: 45 * MIN, when: forests(1), modal: true }, [
  m('Ich bin an eine Birke geraten. Dann an eine zweite. Der Wald ist größer, als er von hier unten schmeckt.'),
  m('Die Birke hat sofort angefangen zu erzählen. Ich habe fast nichts verstanden, es klang aber begeistert.'),
  t('Das ist die Jugend. Vierzig Jahre und schon eine Meinung.'),
]);

/* ---------------- Kapitel 4: Der Wald (Tag 4 bis 6) ---------------- */
link('k3_birke', 'k3', 'w_first', { gap: 90 * MIN, when: years(8), wait: 4 * H }, [
  m('Die Birke hat inzwischen alles erzählt, was sie weiß. Es war nicht viel, aber es ging schnell.'),
]);

link('k4_w2', 'k4', 'k3_birke', { gap: 90 * MIN, when: any(forests(2), ms('w_a2')) }, [
  m('Ich kann jetzt beides: Sporen schicken und Wurzeln halten. Ich dachte lange, ich müsste mich entscheiden.'),
  t('Das dachten alle. Ich auch, früher. Dann bin ich einfach stehen geblieben.'),
]);

link('k4_kiefer', 'k4', 'k4_w2', { gap: 90 * MIN, when: any(owns('t_kiefer'), forests(3)), wait: 4.5 * H }, [
  m('Die Kiefer hat sich gemeldet. Sie sagt, früher sei alles schneller gegangen.'),
  t('Das sagt sie seit zweihundert Jahren. Früher war es genauso langsam.'),
]);

link('k4_eiche', 'k4', 'k4_kiefer', { gap: 90 * MIN, when: any(owns('t_eiche'), forests(4)), wait: 4.5 * H }, [
  m('Die Eiche spricht in Jahrzehnten. Ich warte noch auf ihr Hallo.'),
]);

link('k4_jahre', 'k4', 'k4_eiche', { gap: 90 * MIN, when: years(10) }, [
  t('Zehn Jahre, seit du da bist.'),
  m('Ich dachte, es wären zehn Nächte.'),
  t('Für dich vielleicht.'),
]);

link('k4_ring1', 'k4', 'k4_jahre', { gap: 90 * MIN, when: rings(1) }, [
  k('Da ist ein Bogen im Gras! Aus Hüten! Ein Stück Kreis!'),
  m('Ist das gut?'),
  k('Weiß nicht. Sieht rund aus. Ich stehe aber mitten drin.'),
  t('Die Zweibeiner nennen das einen Hexenring. Sie sagen, dort haben Hexen getanzt. Sie sind nicht oft draußen.'),
]);

link('k4_buche', 'k4', 'k4_ring1', { gap: 90 * MIN, when: any(owns('t_buche'), forests(4)), wait: 4.5 * H }, [
  m('Die Buche redet wie jemand, der sich beim Reden zuhört. Ich weiß jetzt, wer unter ihrem Laub wohnt und wer demnächst auszieht.'),
]);

link('k4_w3', 'k4', 'k4_buche', { gap: 90 * MIN, when: forests(3) }, [
  t('Du hängst jetzt an elf Bäumen. Ich habe nachgezählt.'),
  m('Du zählst doch nicht mit.'),
  t('Das war nur das eine Mal.'),
]);

link('k4_regen100', 'k4', 'k4_w3', { gap: 90 * MIN, when: any(showers(100), years(14)), wait: 4.5 * H }, [
  m('Hundert Regen. Es regnet erstaunlich oft, wenn ich Durst habe. Ich lege mich nicht fest, ob das Zufall ist.'),
]);

link('k4_stuempfe', 'k4', 'k4_regen100', { gap: 90 * MIN, when: rings(2), wait: 4.5 * H }, [
  t('Im Osten stehen Stümpfe. Dreizehn. Ich habe sie nie besucht.'),
  m('Haben sie noch Wurzeln?'),
  t('Das weiß ich nicht. Ich habe nicht gefragt.'),
  m('Ich frage für dich.'),
  t('Tu, was du willst. Ich bin ein Baum.'),
]);

link('k4_alge', 'k4', 'k4_stuempfe', { gap: 90 * MIN, when: forests(4), wait: 4.5 * H }, [
  m((g) => (g.forkChoice('b') === 'l'
    ? 'Die Alge hat mir Licht erklärt. Es ist offenbar etwas, das oben ist. Mehr hat sie nicht gesagt, sie sprach hauptsächlich über sich.'
    : 'Ich habe viel Humus gemacht. Der Wald nennt das Ordnung. Ich nenne es Hausarbeit.')),
]);

link('k4_kurt_hoch', 'k4', 'k4_alge', { gap: 90 * MIN, when: rings(3), wait: 4.5 * H }, [
  k('Ich war weit oben! Fast so hoch wie der Wipfel!'),
  m('Und?'),
  k('Man sieht– Moment, habe ich was im Gesicht?'),
  m('Ich kann nicht nachsehen.'),
  k('Stimmt. Egal. Ich muss weiter.'),
]);

link('k4_nahe', 'k4', 'k4_kurt_hoch', { gap: 90 * MIN, when: rings(4) }, [
  m('Der erste Stumpf. Sein Wurzelwerk lebt noch, schwach. Es schmeckt nach Eibe, genau wie sie.'),
  t('Ich sage dazu nichts. Ich bin ein Baum.'),
  m('Der Zucker, den du mir schickst, ist heute etwas mehr.'),
  t('Das ist Zufall.'),
]);

/* ---------------- Kapitel 5: Der Ring (Ende) ---------------- */
S.push({
  id: 'end_ring', chapter: 'k5', modal: true,
  cond: (g) => ended(g),
  lines: ENDING.lines, // ALL ending text lives in ending.js
});

/* ---------------- Kapitel 6: Nachspiel ---------------- */
link('n_kurt', 'k6', 'end_ring', { gap: 2 * H, when: () => true }, [
  k(`Hallo! Ich bin ${K}.`),
  m('Ich weiß.'),
  k('Ich soll was verpasst haben.'),
  m(`Der ${K} vor dir war über dem Ring, ganz oben. Er hat gesagt, dass ich gut aussehe.`),
  k('Dann stimmt das.'),
]);

link('n_taxus', 'k6', 'n_kurt', { gap: 3 * H, when: rings(7), wait: 12 * H }, [
  t('Das Buch ist voll. Ich habe ein neues angelegt.'),
  m('Wie heißt es?'),
  t('Später.'),
]);

export const STORY = S;
