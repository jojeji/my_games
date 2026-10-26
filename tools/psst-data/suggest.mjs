// Candidate generation: which nouns make good Suchbegriffe and which words are likely Tabuwörter.
// Pure functions over the prepared source files (see prepare.mjs). Used by build.mjs.
import path from 'node:path';
import { RAW, readJson, sharesStem, pluralKey, blocked } from './lib.mjs';

export function loadSources() {
  const dir = path.join(RAW, 'prepared');
  const src = {
    freq: readJson(path.join(dir, 'freq.json'), null),
    cooc: readJson(path.join(dir, 'cooc.json'), null),
    ot: readJson(path.join(dir, 'ot.json'), null),
    kovah: readJson(path.join(dir, 'kovah.json'), null),
  };
  for (const [k, v] of Object.entries(src)) if (!v) throw new Error(`prepared source missing: ${k} (run node tools/psst-data/prepare.mjs)`);
  src.hub = computeHubs(src);
  return src;
}

const cnt = (src, w) => { const f = src.freq[w]; return f ? f[1] + f[2] : 0; };
const fpm = (src, w) => (src.freq[w] ? src.freq[w][0] : 0);

/** Is `w` (capitalised) used as a noun in the corpora? (rarely seen in lowercase) */
export function isNoun(src, w) {
  if (!/^[A-ZÄÖÜ][a-zäöüß]{2,}$/.test(w)) return false;
  const lc = w[0].toLowerCase() + w.slice(1);
  return cnt(src, w) >= 6 * cnt(src, lc) && !!src.ot[w];
}

function computeHubs(src) {
  // how many nouns have the word among their top-25 partners
  const hub = {};
  for (const [w, list] of Object.entries(src.cooc)) {
    if (!/^[A-ZÄÖÜ]/.test(w)) continue;
    for (const [t] of list.slice(0, 25)) hub[t] = (hub[t] || 0) + 1;
  }
  return hub;
}

// function words / fillers that OpenThesaurus lists as lemmas
const FUNC = new Set(('eine einen einem einer eines der die das den dem des und oder mit von zu zum zur im in am an auf aus bei nach vor ' +
  'über unter für gegen ohne um durch wie als wenn dann auch noch schon nur sehr man es sich wir sie ihr ich du er wird sind ist war ' +
  'hat haben wurde werden kann soll muss will beim einige wieder weitere mehr viele alle jede jeder jedes dieser diese dieses ' +
  'ihre ihren ihrem ihrer seine seinen seinem seiner sein viel gibt geht kommt macht lässt immer bereits etwa rund ca nicht kein ' +
  'keine keinen dabei dazu dafür davon darauf hier dort da so wo wer was wann warum ob weil dass bis seit während').split(' '));
// too generic to be a useful Tabuwort
const GENERIC = new Set(('Einrichtung Organisation Institut Institution Anstalt Ding Sache Teil Art Weise Mal Fall Stück Mensch Menschen Leute Person ' +
  'Mann Frau Jahr Jahre Zeit Tag Tage Woche Monat Stunde Minute Uhr Prozent Euro Million Seite Ende Anfang Grund Punkt Thema Frage ' +
  'Problem Möglichkeit Bereich Gruppe Form Stelle Platz Ort Raum Land Stadt Welt Leben Name Wort Satz Blick Besucher Eltern Kind ' +
  'Gericht Mitglied Rolle Ziel Zweck Gebiet Fläche Wert Nummer Zahl Stand Lage Situation Weg Zug Hand Kopf Auge Gelände Mittel ' +
  'Gegenstand Objekt Vorgang Prozess Ereignis Angelegenheit Sachverhalt Zustand Maßnahme Aktion Tätigkeit Handlung').split(' '));
// adjectives we accept as Tabuwörter (the corpus only gives inflected forms, OpenThesaurus lemmas are mixed)
export const ADJ = new Set(('kalt heiß warm kühl süß sauer scharf bitter salzig groß klein schnell langsam laut leise hoch tief rund eckig weich hart ' +
  'alt jung neu bunt gelb rot blau grün schwarz weiß braun grau lang kurz dick dünn schwer leicht nass trocken feucht teuer billig gefährlich ' +
  'stark schwach gesund krank lustig traurig müde wach hungrig durstig voll leer sauber schmutzig dunkel hell glatt rau spitz stumpf ' +
  'flüssig fest knusprig frisch lecker giftig wild zahm flauschig gemütlich romantisch sportlich elektrisch digital mobil ' +
  'glücklich böse brav froh sicher still ruhig schön hässlich klug dumm reich arm frei privat öffentlich').split(' '));

function ok(src, t) {
  if (FUNC.has(t.toLowerCase())) return false;
  if (GENERIC.has(t)) return false;
  if (/^[a-zäöüß]/.test(t)) {
    if (/^ge.+(en|t)$/.test(t) && t.length > 6) return false; // participles
    if (/(en|rn|ln)$/.test(t)) return !/^ge/.test(t);
    return ADJ.has(t);
  }
  return true;
}

/** If the noun looks like a plural of a more frequent singular, return the singular. */
function singular(src, t) {
  if (!/^[A-ZÄÖÜ]/.test(t)) return t;
  for (const x of ['nen', 'en', 'n', 'e', 'er']) {
    if (t.length - x.length < 3 || !t.endsWith(x)) continue;
    const sg = t.slice(0, -x.length);
    const cands = [sg, sg.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u')];
    if (x === 'er' || x === 'e' || x === 'en') {
      // Häuser -> Haus, Bälle -> Ball
      cands.push(sg.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/äu/g, 'au'));
      cands.push(sg.replace(/äu/, 'au').replace(/ä/, 'a').replace(/ö/, 'o').replace(/ü/, 'u'));
    }
    for (const c of cands) {
      if (x === 'er' && !/[äöü]/.test(sg)) continue;
      if (c !== t && src.ot[c] && cnt(src, c) >= 0.4 * cnt(src, t) && /^[A-ZÄÖÜ]/.test(c) && c.length >= 3) return c;
    }
  }
  return t;
}

function known(src, t) {
  const f = fpm(src, t);
  if (f <= 0) return 0;
  return Math.min(1, Math.log10(f + 1) / 1.7);
}

/** Pick the OpenThesaurus senses of W that the corpus supports. */
function pickSenses(src, W) {
  const e = src.ot[W];
  if (!e) return [];
  const co = new Map((src.cooc[W] || []).map(([t, s]) => [t, s]));
  const scored = e.senses.map(se => {
    let sc = 0;
    for (const k of ['s', 'o', 'u', 'a']) for (const t of se[k]) sc += (co.get(t) || 0);
    return { se, sc };
  });
  scored.sort((a, b) => b.sc - a.sc);
  const best = scored[0];
  if (!best) return [];
  if (best.sc <= 0) {
    // no corpus support: the sense with most relations
    return [e.senses.slice().sort((a, b) => (b.o.length + b.s.length + b.u.length) - (a.o.length + a.s.length + a.u.length))[0]];
  }
  return scored.filter(x => x.sc >= 0.5 * best.sc).slice(0, 2).map(x => x.se);
}

/** Ranked Tabuwort candidates [{t, score, why}] for Suchbegriff W (best first, stem clashes already removed). */
export function suggestTabu(src, W, { max = 14 } = {}) {
  const pool = new Map();
  const add = (t, score, why) => {
    if (!t || t === W) return;
    const e = pool.get(t) || { t, score: 0, why: new Set() };
    e.score += score; e.why.add(why);
    pool.set(t, e);
  };
  const co = (src.cooc[W] || []).filter(([t]) => src.ot[t] && /^[A-Za-zÄÖÜäöüß]+$/.test(t));
  const top = co.length ? co[0][1] : 1;
  co.slice(0, 40).forEach(([t, s], i) => add(t, 0.9 * (s / top) ** 0.7, 'c'));
  const senses = pickSenses(src, W);
  senses.forEach((se, si) => {
    const w = si === 0 ? 1 : 0.6;
    se.o.slice(0, 4).forEach((t, i) => add(t, w * 0.8 * known(src, t), 'o'));
    se.s.slice(0, 6).forEach(t => add(t, w * 0.7 * known(src, t), 's'));
    se.a.slice(0, 8).forEach(t => add(t, w * 0.55 * known(src, t), 'a'));
    se.u.slice(0, 8).forEach(t => add(t, w * 0.4 * known(src, t), 'u'));
  });
  const out = [];
  for (const e0 of pool.values()) {
    const t = singular(src, e0.t);
    const e = t === e0.t ? e0 : { ...e0, t };
    if (!src.ot[t] || blocked(t) || !ok(src, t)) continue;
    if (t.length < 3 || t.length > 16) continue;
    if (sharesStem(W, t)) continue;
    const k = known(src, t);
    if (k < 0.35) continue;
    const hub = src.hub[t] || 0;
    const score = e.score * (0.35 + 0.65 * k) / (1 + hub / 120);
    out.push({ t, score: Math.round(score * 1000) / 1000, why: [...e.why].join('') });
  }
  out.sort((a, b) => b.score - a.score);
  // diversity: no two chosen words may share a stem / be plural variants of each other
  const chosen = [];
  for (const c of out) {
    if (chosen.some(d => sharesStem(d.t, c.t) || pluralKey(d.t) === pluralKey(c.t))) continue;
    chosen.push(c);
    if (chosen.length >= max) break;
  }
  return chosen;
}
