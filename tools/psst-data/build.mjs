#!/usr/bin/env node
// Builds games/psst/data/packs.json + packs/*.json from
//   tools/psst-data/curated/*.txt   hand/AI-written cards (see header in the files)
//   tools/psst-data/curated.json    drops + fixes
//   games/psst/data/review-decisions.json (optional)  decisions exported by games/psst/review
//   $PSST_RAW/prepared/*.json       Wortschatz Leipzig / OpenThesaurus / Kovah (see prepare.mjs), only needed for
//                                   cards that use the auto ("*", "A+") or Kovah ("K+") Tabuwörter
// Fails (exit 1) on any quality problem. Output is deterministic.
import fs from 'node:fs';
import path from 'node:path';
import { HERE, DATA, RAW, readJson, slug, sharesStem, redundant, blocked } from './lib.mjs';
import { checkCards } from './check.mjs';
import { loadSources, suggestTabu } from './suggest.mjs';

export const PACKS = [
  { id: 'start', name: 'Startpaket', kind: 'difficulty', icon: '🚀', desc: 'Die besten Karten zum Einsteigen: bekannte, lustige, eindeutige Alltagsbegriffe.' },
  { id: 'mix1', name: 'Mix leicht', kind: 'difficulty', icon: '🟢', desc: 'Bunte Mischung aus allen Themen, leicht zu erklären.' },
  { id: 'mix2', name: 'Mix mittel', kind: 'difficulty', icon: '🟡', desc: 'Bunte Mischung aus allen Themen, mittlere Schwierigkeit.' },
  { id: 'mix3', name: 'Mix schwer', kind: 'difficulty', icon: '🔴', desc: 'Bunte Mischung aus allen Themen, knifflige Begriffe.' },
  { id: 'essen', name: 'Essen & Trinken', kind: 'topic', icon: '🍕', desc: 'Speisen, Getränke, Obst, Gemüse und alles rund ums Essen.' },
  { id: 'tiere', name: 'Tierwelt', kind: 'topic', icon: '🦁', desc: 'Haustiere, Wildtiere, Insekten und Fabelwesen.' },
  { id: 'geo', name: 'Geografie', kind: 'topic', icon: '🌍', desc: 'Länder, Städte, Berge, Flüsse und Sehenswürdigkeiten.' },
  { id: 'sport', name: 'Sport', kind: 'topic', icon: '⚽', desc: 'Sportarten, Regeln, Begriffe und Ausrüstung.' },
  { id: 'film', name: 'Film & Serien', kind: 'topic', icon: '🎬', desc: 'Kino, Fernsehen, Serien, Märchen und Figuren.' },
  { id: 'personen', name: 'Berühmte Personen', kind: 'topic', icon: '⭐', desc: 'Stars, Erfinder, Sportler, Politiker und Figuren der Geschichte.' },
  { id: 'technik', name: 'Technik & Internet', kind: 'topic', icon: '💻', desc: 'Geräte, Apps, Internet und Technik im Alltag.' },
  { id: 'alltag', name: 'Beruf & Alltag', kind: 'topic', icon: '🏠', desc: 'Berufe, Haushalt, Feste, Reisen und der ganz normale Alltag.' },
];
const TOPICS = new Set(PACKS.filter(p => p.kind === 'topic').map(p => p.id));
const log = [];
const caseHints = [];

function parseCurated() {
  const dir = path.join(HERE, 'curated');
  const cards = [];
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.txt')).sort()) {
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((line, i) => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const where = `${f}:${i + 1}`;
      const parts = line.split('|').map(s => s.trim());
      if (parts.length < 3) throw new Error(`${where}: need "Suchbegriff | Tabuwörter | d | Themen | S"`);
      const [w, tabus, d, topics = '', flag = ''] = parts;
      const topicList = topics ? topics.split(',').map(s => s.trim()).filter(Boolean) : [];
      for (const t of topicList) if (!TOPICS.has(t)) throw new Error(`${where}: unknown topic ${t}`);
      cards.push({ w, tabus, d: Number(d), topics: topicList, start: flag.includes('S'), where });
    });
  }
  return cards;
}

let SRCS = null;
const sources = () => SRCS || (SRCS = loadSources());

// obvious typos / unwanted entries in the Kovah data
const KOVAH_TYPOS = { Hodgwarts: 'Hogwarts', 'Östereich': 'Österreich', 'Big Bang Thory': 'The Big Bang Theory', 'Leathal Weapon': 'Lethal Weapon',
  'Der talentierte Mr. Rippley': 'Der talentierte Mr. Ripley', 'Padme Amidalla': 'Padmé Amidala', 'Magarine': 'Margarine', Illtis: 'Iltis', Fesslungskünstler: 'Entfesselungskünstler' };
const KOVAH_SKIP = new Set(['tot', 'Haare', 'Auto', 'Kabel', 'Pferd', 'zwei', 'Maus', 'Hund', 'Katze', 'Vogel', 'Fisch', 'Schwan', 'Fuchs', 'Eier', 'Huhn']);
function kovahWords(W) {
  const k = sources().kovah;
  for (const file of Object.values(k)) {
    for (const key of Object.keys(file)) {
      if (key === W || key.replace(/ \(.*\)$/, '') === W) {
        return file[key].map(s => s.trim()).map(s => KOVAH_TYPOS[s] || s).map(s => (['Steppen', 'Wolle'].includes(s) ? s : fixCase(s))).filter(s => s && !KOVAH_SKIP.has(s) && s.split(' ').length <= 3 && s.length <= 26);
      }
    }
  }
  return [];
}

function resolve(c) {
  const spec = c.tabus;
  const own = [];
  let auto = 0, kov = 0, mode = 'own';
  let list = spec;
  if (spec.startsWith('*')) { mode = 'auto'; list = spec.slice(1); }
  else if (spec.startsWith('A+')) { mode = 'autoFirst'; list = spec.slice(2); }
  else if (spec.startsWith('K+')) { mode = 'kovahFirst'; list = spec.slice(2); }
  // "a, b, c, d, e ; s1, s2": words after ";" are spares, only used when one of the first words is rejected
  const [main, spareList = ''] = list.split(';');
  const mine = main.split(',').map(s => s.trim()).filter(Boolean);
  const spares = spareList.split(',').map(s => s.trim()).filter(Boolean);
  const t = [];
  const ok = x => x && !sharesStem(c.w, x) && !t.some(y => redundant(y, x) || y.toLowerCase() === x.toLowerCase()) && !blocked(x);
  const issues = [], rejected = [];
  const push = (x, kind) => {
    if (t.length >= 5) { if (kind === 'o') issues.push(`${c.w}: surplus Tabuwort "${x}"`); return; }
    if (ok(x)) { t.push(x); if (kind === 'a') auto++; if (kind === 'k') kov++; }
    else if (kind === 'o') rejected.push(x);
    else if (kind === 's') issues.push(`${c.w}: spare Tabuwort "${x}" rejected`);
  };
  // own words come first; spares replace rejected ones; "*", "A+" fill the remaining slots with automatic suggestions, "K+" with Kovah words
  mine.forEach(x => push(x, 'o'));
  if (rejected.length) spares.forEach(x => { if (t.length < 5) push(x, 's'); });
  if (mode === 'kovahFirst') kovahWords(c.w).forEach(x => push(x, 'k'));
  if (mode === 'auto' || mode === 'autoFirst') suggestTabu(sources(), c.w).forEach(s => push(s.t, 'a'));
  if (rejected.length && t.length < 5) issues.push(`${c.w}: rejected [${rejected.join(', ')}] (stem clash/duplicate/blocklist); valid: ${t.join(', ')}`);
  else if (rejected.length) log.push(`replaced rejected [${rejected.join(', ')}] on ${c.w}`);
  let src = 'ai';
  if (auto && !kov && t.length === auto) src = 'ot';
  else if (kov && t.length === kov) src = 'kovah';
  else if (auto || kov) src = 'mixed';
  return { t, src, issues };
}

// hint at wrong capitalisation of single-word Tabuwörter with corpus statistics (noun = capital, verb/adjective = lowercase);
// only a hint because of homographs (Wolle/wolle, Summen/summen)
function fixCase(word) {
  if (!/^[A-Za-zÄÖÜäöüß]{4,}$/.test(word)) return word;
  let freq;
  try { freq = sources().freq; } catch { return word; }
  const cnt = w => (freq[w] ? freq[w][1] + freq[w][2] : 0);
  const up = word[0].toUpperCase() + word.slice(1), lo = word[0].toLowerCase() + word.slice(1);
  const ot = sources().ot;
  if (word === up && ot[lo] && !ot[up] && /(en|ln|rn)$/.test(word) && cnt(lo) >= cnt(up)) return lo; // "Springen" is not a noun lemma, "springen" is a verb
  if (word === up && cnt(lo) >= 6 * Math.max(cnt(up), 1) && cnt(lo) > 50) return lo;
  if (word === lo && cnt(up) >= 6 * Math.max(cnt(lo), 1) && cnt(up) > 50) return up;
  return word;
}

function main() {
  const curatedJson = readJson(path.join(HERE, 'curated.json'), { version: 1, drop: [], fix: {} });
  const drop = new Set((curatedJson.drop || []).map(slug));
  const rows = parseCurated();
  const cards = new Map(); // id -> {card, topics, start}
  const errors = [];
  for (const c of rows) {
    const id = slug(c.w);
    if (drop.has(id)) { log.push(`dropped (curated.json): ${c.w}`); continue; }
    if (cards.has(id)) { errors.push(`${c.where}: duplicate Suchbegriff "${c.w}" (also ${cards.get(id).where})`); continue; }
    const r = resolve(c);
    errors.push(...r.issues.map(x => `${c.where}: ${x}`));
    const fix = (curatedJson.fix || {})[id];
    const t = r.t;
    for (const x of t) { const y = fixCase(x); if (y !== x) caseHints.push(`${c.w}: ${x} -> ${y}`); }
    if (t.length < 5 && !r.issues.length) errors.push(`${c.where}: "${c.w}" has only ${t.length} usable Tabuwörter (${t.join(', ')})`);
    const card = { id, w: c.w, t, d: c.d, src: r.src };
    if (fix) { Object.assign(card, fix); card.src = 'mixed'; }
    cards.set(id, { card, topics: c.topics, start: c.start, where: c.where });
  }

  if (errors.length) {
    console.error(`${errors.length} problem(s) in curated cards:`);
    errors.forEach(e => console.error('  ' + e));
    process.exit(1);
  }

  // owner review decisions
  const dec = readJson(path.join(DATA, 'review-decisions.json'), null);
  if (dec) {
    const list = Array.isArray(dec.decisions) ? dec.decisions : [];
    let dropped = 0, edited = 0;
    for (const d of list) {
      for (const id of d.drop || []) if (cards.delete(id)) dropped++;
      for (const [id, e] of Object.entries(d.edit || {})) {
        const x = cards.get(id);
        if (!x) continue;
        if (typeof e.w === 'string' && e.w.trim()) x.card.w = e.w.trim();
        if (Array.isArray(e.t)) x.card.t = e.t.map(s => String(s).trim());
        x.card.src = 'mixed';
        edited++;
      }
    }
    log.push(`review decisions applied: ${dropped} dropped, ${edited} edited`);
  }

  const all = [...cards.values()];
  const problems = checkCards(all.map(x => x.card));
  if (problems.length) {
    console.error(`${problems.length} quality problem(s):`);
    problems.forEach(p => console.error('  ' + p));
    process.exit(1);
  }

  // assemble packs
  const byPack = Object.fromEntries(PACKS.map(p => [p.id, []]));
  for (const { card, topics, start } of all) {
    byPack['mix' + card.d].push(card);
    for (const t of topics) byPack[t].push(card);
    if (start && card.d <= 2) byPack.start.push(card);
  }
  fs.mkdirSync(path.join(DATA, 'packs'), { recursive: true });
  for (const f of fs.readdirSync(path.join(DATA, 'packs'))) if (f.endsWith('.json')) fs.unlinkSync(path.join(DATA, 'packs', f));
  const index = { version: 1, packs: [] };
  for (const p of PACKS) {
    const list = byPack[p.id].slice().sort((a, b) => (a.id < b.id ? -1 : 1));
    fs.writeFileSync(path.join(DATA, 'packs', p.id + '.json'), JSON.stringify(list.map(c => ({ id: c.id, w: c.w, t: c.t, d: c.d, src: c.src })), null, 0).replace(/\},\{/g, '},\n{').replace(/^\[/, '[\n').replace(/\]$/, '\n]') + '\n');
    index.packs.push({ id: p.id, name: p.name, kind: p.kind, icon: p.icon, desc: p.desc, count: list.length, file: `packs/${p.id}.json` });
  }
  fs.writeFileSync(path.join(DATA, 'packs.json'), JSON.stringify(index, null, 2) + '\n');

  const srcCount = {};
  all.forEach(x => { srcCount[x.card.src] = (srcCount[x.card.src] || 0) + 1; });
  log.forEach(l => console.log(l));
  if (caseHints.length) console.log(`capitalisation hints (not applied; verify by hand): ${caseHints.length}\n  ` + caseHints.join('\n  '));
  console.log(`${all.length} unique cards; per pack: ` + index.packs.map(p => `${p.id}=${p.count}`).join(' '));
  console.log('per src: ' + JSON.stringify(srcCount));
}

main();
