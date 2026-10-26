#!/usr/bin/env node
// Association check for the Psst! cards: how well do the 5 Tabuwörter match what people naturally associate with the Suchbegriff?
//
//   node tools/psst-data/assoc.mjs prepare   parse the raw downloads in $PSST_RAW (never in the repo) into $PSST_RAW/assoc/*.json
//   node tools/psst-data/assoc.mjs           score all cards, write games/psst/data/assoc-report.json, print a summary
//   node tools/psst-data/assoc.mjs --suggest additionally list strong missing words (candidates for assoc-swaps.txt)
//   node tools/psst-data/assoc.mjs --apply   write the swaps of tools/psst-data/assoc-swaps.txt into curated.json "fix" (never for the pack "start")
//
// Sources (see README.md and games/psst/data/QUELLEN.md): USF Free Association Norms (English, translated by hand, cached in
// $PSST_RAW/assoc/maps/) and ConceptNet 5.7 German edges (CC BY-SA 4.0). The raw norms are only a local check: they are not
// redistributed, the committed report contains single words only. SWOW-DE would be the better source, but its download needs a registration.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { HERE, DATA, RAW, readJson, sharesStem, redundant, blocked, stem, pluralKey } from './lib.mjs';
import { checkCard } from './check.mjs';

export const REPORT = path.join(DATA, 'assoc-report.json');
const AS = path.join(RAW, 'assoc');
export const TOP_N = 25;            // associations considered per Suchbegriff
export const MIN_FSG = 0.02;         // ignore associations named by fewer than ~2 % of the participants
export const MISSING_RANKS = 3;     // a "missing" word must be among the strongest associations
export const SUGGEST = { minFsg: 0.10, maxScore: 3 }; // --suggest: minimal strength (share of participants), card must have >= 2 weak words
export const MAX_SWAPS = 2;                          // at most two Tabuwörter per card are replaced
// too generic to be a good Tabuwort even if many people name it
const GENERIC = new Set(['essen', 'spaß', 'land', 'stadt', 'zeit', 'leute', 'mann', 'frau', 'ding', 'sache', 'name', 'welt', 'tier', 'tiere', 'ort', 'teil', 'art', 'gebäude', 'kind', 'person', 'gruppe', 'arbeit', 'job', 'leben', 'wasser', 'gut', 'groß', 'klein', 'schön', 'neu', 'alt']);

const norm = s => s.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss').replace(/[^a-z ]/g, '').trim();
const cnKey = s => s.toLowerCase().replace(/ß/g, 'ss').replace(/ /g, '_');

/** Do Tabuwort `t` and association `a` mean the same word (same stem, singular/plural, or one is a compound part of the other)? */
export function matches(t, a) {
  const x = norm(t), y = norm(a);
  if (!x || !y) return false;
  if (x === y) return true;
  const sx = stem(x), sy = stem(y);
  if (sx.length >= 3 && sx === sy) return true;
  if (pluralKey(x) === pluralKey(y)) return true;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  if (s.length >= 5 && !s.includes(' ') && !l.includes(' ') && (l.startsWith(s) || l.endsWith(s))) return true;
  return false;
}

// ---------------------------------------------------------------- prepare (raw downloads -> compact local files)
function allCardWords() {
  const words = new Set();
  for (const f of fs.readdirSync(path.join(DATA, 'packs'))) for (const c of readJson(path.join(DATA, 'packs', f), [])) words.add(c.w);
  return words;
}

async function prepare() {
  fs.mkdirSync(AS, { recursive: true });
  // USF Appendix A: CUE, TARGET, NORMED?, #G, #P, FSG, ... ; keep targets named by >= 2 participants
  const usfDir = path.join(RAW, 'usf');
  const usf = {};
  for (const f of fs.readdirSync(usfDir).filter(x => x.startsWith('Cue_Target_Pairs'))) {
    for (const line of fs.readFileSync(path.join(usfDir, f), 'latin1').split('\n')) {
      if (/^<|^CUE,/.test(line) || !line.includes(',')) continue;
      const p = line.split(',').map(s => s.trim());
      if (p.length < 6) continue;
      const g = +p[3], n = +p[4], fsg = parseFloat(p[5]);
      if (!(g > 0) || !(n > 0)) continue;
      (usf[p[0].toLowerCase()] ||= { g, t: [] }).t.push([p[1].toLowerCase(), fsg, n]);
    }
  }
  for (const c of Object.values(usf)) c.t.sort((a, b) => b[1] - a[1]);
  fs.writeFileSync(path.join(AS, 'usf.json'), JSON.stringify(usf));
  console.log(`USF: ${Object.keys(usf).length} cues`);

  // ConceptNet: German-German edges of the card words (hyponyms, i.e. IsA pointing at the word, are left out: huge lists, little signal)
  const keys = new Map([...allCardWords()].map(w => [cnKey(w), w]));
  const cn = {};
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(RAW, 'cn', 'cn.csv.gz')).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  const REL = { RelatedTo: 'R', Synonym: 'S', SimilarTo: 'S', PartOf: 'P', IsA: 'I' };
  let lines = 0;
  for await (const line of rl) {
    lines++;
    if (!line.includes('/c/de/')) continue;
    const p = line.split('\t');
    const rel = REL[p[1].slice(3)];
    if (!rel || !p[2].startsWith('/c/de/') || !p[3].startsWith('/c/de/')) continue;
    const a = p[2].split('/')[3], b = p[3].split('/')[3];
    const sym = rel === 'R' || rel === 'S';
    if (keys.has(a)) (cn[a] ||= []).push([b.replace(/_/g, ' '), rel]);
    if (sym && keys.has(b)) (cn[b] ||= []).push([a.replace(/_/g, ' '), rel]);
  }
  fs.writeFileSync(path.join(AS, 'cn.json'), JSON.stringify(cn));
  console.log(`ConceptNet: ${lines} assertions read, neighbours for ${Object.keys(cn).length} card words`);
}

// ---------------------------------------------------------------- hand-made translation tables (cached locally in $PSST_RAW/assoc/maps)
function loadMaps() {
  const dir = path.join(AS, 'maps');
  const cue = new Map();   // German Suchbegriff -> [English USF cue candidates]; "-" removes a mapping
  const de = new Map();    // English target -> [German words]
  const tgt = new Map();   // "cue>target" -> [German words] (sense fix for one cue, "-" = ignore)
  for (const f of fs.readdirSync(dir).sort()) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!line.trim() || line.startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i < 0) continue;
      const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
      const words = v.split(/[/|]/).map(s => s.trim()).filter(s => s && s !== '-');
      if (f.startsWith('cue-map')) { if (v === '-') cue.delete(k); else cue.set(k, v.split('|').map(s => s.trim()).filter(Boolean)); }
      else if (f.startsWith('cue-tgt')) tgt.set(k, words);
      else de.set(k, words);
    }
  }
  return { cue, de, tgt };
}

// ---------------------------------------------------------------- scoring
/**
 * Analysis of one card. `ctx` = { usf, cn, maps }.
 * Returns { covered, score, matched[], weak[], missing[{w, fsg}], assoc }; `assoc` (German words, strongest first) is for local use only.
 */
export function analyse(card, ctx) {
  const { usf, cn, maps } = ctx;
  const cands = maps.cue.get(card.w);
  const cueEn = cands && cands.find(c => usf[c] && usf[c].t.length >= 5);
  if (!cueEn) return { covered: false };
  const assoc = []; // [{ de: [German variants], fsg, rank }]
  usf[cueEn].t.slice(0, TOP_N).forEach(([en, fsg], i) => {
    if (fsg < MIN_FSG) return;
    const key = `${cueEn}>${en}`;
    const de = maps.tgt.has(key) ? maps.tgt.get(key) : maps.de.get(en);
    if (de && de.length) assoc.push({ en, de, fsg, rank: i });
  });
  const nb = (cn[cnKey(card.w)] || []).map(([w]) => w);
  const matched = [], weak = [];
  for (const t of card.t) {
    const hit = assoc.some(a => a.de.some(d => matches(t, d))) || nb.some(w => matches(t, w));
    (hit ? matched : weak).push(t);
  }
  // strongest associations (by USF rank) that are not on the card yet
  const missing = [];
  for (const a of assoc.filter(x => x.rank < MISSING_RANKS)) {
    if (a.de.some(d => card.t.some(t => matches(t, d)))) continue;
    const pick = a.de.find(d => !GENERIC.has(d.toLowerCase()) && !sharesStem(card.w, d) && !blocked(d) && !card.t.some(t => redundant(t, d)));
    if (!pick) continue;
    if (missing.some(m => matches(m.w, pick))) continue;
    missing.push({ w: pick, fsg: a.fsg, en: a.en });
  }
  return { covered: true, score: matched.length, matched, weak, missing, assoc, cueEn };
}

function loadCards() {
  const byId = new Map();
  const inPack = new Map();
  for (const f of fs.readdirSync(path.join(DATA, 'packs')).sort()) {
    const pack = f.replace('.json', '');
    for (const c of readJson(path.join(DATA, 'packs', f), [])) {
      byId.set(c.id, c);
      if (!inPack.has(c.id)) inPack.set(c.id, new Set());
      inPack.get(c.id).add(pack);
    }
  }
  return { byId, inPack };
}

function context() {
  const need = ['usf.json', 'cn.json'].map(f => path.join(AS, f));
  for (const f of need) if (!fs.existsSync(f)) throw new Error(`${f} missing: run "node tools/psst-data/assoc.mjs prepare" (needs the raw downloads, see README.md)`);
  if (!fs.existsSync(path.join(AS, 'maps'))) throw new Error(`${path.join(AS, 'maps')} missing (hand-made translation tables, see README.md)`);
  return { usf: readJson(need[0]), cn: readJson(need[1]), maps: loadMaps() };
}

const NOUN = /^[A-ZÄÖÜ][a-zäöüß-]+$/;

/** Candidates worth a look: strong missing nouns on cards with at least two weak words (printed by --suggest, decided by a human). */
export function suggestions(card, a) {
  if (!a.covered || a.score > SUGGEST.maxScore || a.weak.length < 2) return [];
  return a.missing.filter(m => m.fsg >= SUGGEST.minFsg && NOUN.test(m.w));
}

/** assoc-swaps.txt: "Suchbegriff | alt > neu | alt > neu" (human decisions informed by --suggest). */
function readSwaps() {
  const f = path.join(HERE, 'assoc-swaps.txt');
  if (!fs.existsSync(f)) return [];
  const out = [];
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const [w, ...pairs] = line.split('|').map(x => x.trim());
    out.push({ w, line: i + 1, swaps: pairs.map(p => p.split('>').map(x => x.trim())) });
  });
  return out;
}

const pct = (n, d) => (d ? Math.round((100 * n) / d) + ' %' : '-');

function main() {
  const apply = process.argv.includes('--apply');
  const { byId, inPack } = loadCards();
  const ctx = context();
  const cards = {};
  const results = new Map();
  for (const c of [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const a = analyse(c, ctx);
    results.set(c.id, a);
    cards[c.id] = a.covered
      ? { score: a.score, covered: true, missing: a.missing.map(m => m.w), weak: a.weak }
      : { covered: false };
  }
  const report = {
    source: 'USF Free Association Norms (Nelson, McEvoy & Schreiber 1998), words translated DE<->EN by hand, plus ConceptNet 5.7 German edges (CC BY-SA 4.0); local check only',
    version: 1,
    cards,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report).replace(/,"([a-z0-9-]+)":\{/g, ',\n"$1":{').replace('"cards":{', '"cards":{\n') + '\n');

  // summary
  const covered = [...results.values()].filter(a => a.covered);
  console.log(`cards: ${byId.size}, covered by the norms: ${covered.length} (${pct(covered.length, byId.size)}), no data: ${byId.size - covered.length}`);
  const packs = [...new Set([...inPack.values()].flatMap(s => [...s]))].sort();
  console.log('score distribution (covered cards): pack  n_total n_covered | 0 1 2 3 4 5 | mean');
  for (const p of packs) {
    const ids = [...inPack].filter(([, s]) => s.has(p)).map(([id]) => id);
    const cov = ids.map(id => results.get(id)).filter(a => a.covered);
    const hist = [0, 0, 0, 0, 0, 0];
    cov.forEach(a => { hist[a.score]++; });
    const mean = cov.length ? (cov.reduce((s, a) => s + a.score, 0) / cov.length).toFixed(2) : '-';
    console.log(`  ${p.padEnd(9)} ${String(ids.length).padStart(4)} ${String(cov.length).padStart(4)} (${pct(cov.length, ids.length).padStart(5)}) | ${hist.join(' ')} | ${mean}`);
  }
  const weakest = [...results].filter(([, a]) => a.covered).map(([id, a]) => ({ id, a, c: byId.get(id) }))
    .sort((x, y) => x.a.score - y.a.score || y.a.missing.length - x.a.missing.length || (x.id < y.id ? -1 : 1));
  const show = ({ a, c }) => `${c.w.padEnd(18)} ${a.score}/5  [${c.t.join(', ')}]  fehlt: ${a.missing.map(m => `${m.w} (${Math.round(m.fsg * 100)}%)`).join(', ') || '-'}`;
  console.log('\n30 weakest cards:');
  weakest.slice(0, 30).forEach(x => console.log('  ' + show(x)));
  const startIds = [...inPack].filter(([, s]) => s.has('start')).map(([id]) => id);
  const startWeak = weakest.filter(x => startIds.includes(x.id));
  console.log('\n15 weakest cards of the Startpaket:');
  startWeak.slice(0, 15).forEach(x => console.log('  ' + show(x)));

  if (process.argv.includes('--suggest')) {
    console.log('\nsuggestions (strong missing nouns on cards with >= 2 weak words; decide by hand and list them in assoc-swaps.txt):');
    for (const [id, a] of results) {
      const sg = suggestions(byId.get(id), a);
      if (!sg.length || inPack.get(id).has('start')) continue;
      const c = byId.get(id);
      console.log(`  ${c.w} [${c.t.join(', ')}] weak: ${a.weak.join(', ')} -> ${sg.map(m => `${m.w} (${Math.round(m.fsg * 100)}%)`).join(', ')}`);
    }
  }

  if (apply) {
    const path0 = path.join(HERE, 'curated.json');
    const cj = readJson(path0, { version: 1, drop: [], fix: {} });
    cj.fix ||= {};
    const byW = new Map([...byId.values()].map(c => [c.w, c]));
    const errors = [];
    const changes = [];
    for (const { w, line, swaps } of readSwaps()) {
      const c = byW.get(w);
      const where = `assoc-swaps.txt:${line}`;
      if (!c) { errors.push(`${where}: unknown card "${w}"`); continue; }
      if (inPack.get(c.id).has('start')) { errors.push(`${where}: "${w}" is in the pack start (owner is reviewing it, not changed)`); continue; }
      if (swaps.length > MAX_SWAPS) { errors.push(`${where}: more than ${MAX_SWAPS} swaps`); continue; }
      const a = results.get(c.id);
      let t = c.t.slice();
      const done = [];
      for (const [from, to] of swaps) {
        if (t.includes(to) && !t.includes(from)) continue; // already applied
        if (!t.includes(from)) { errors.push(`${where}: "${from}" is not on the card ${w}`); continue; }
        if (!a.covered || !a.assoc.some(x => x.de.includes(to))) { errors.push(`${where}: "${to}" is not backed by the norms for ${w}`); continue; }
        const next = t.map(x => (x === from ? to : x));
        const bad = checkCard({ ...c, t: next, src: 'mixed' });
        if (bad.length) { errors.push(`${where}: ${bad.join('; ')}`); continue; }
        t = next;
        done.push(`${from} -> ${to}`);
      }
      if (done.length) { cj.fix[c.id] = { ...(cj.fix[c.id] || {}), t }; changes.push(`${w}: ${done.join('; ')}`); }
    }
    if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
    else {
      fs.writeFileSync(path0, JSON.stringify(cj, null, 2) + '\n');
      console.log(`\napplied ${changes.length} changed cards to curated.json (fix); now run build.mjs, check.mjs and assoc.mjs again`);
      changes.forEach(x => console.log('  ' + x));
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  if (process.argv[2] === 'prepare') await prepare();
  else main();
}
