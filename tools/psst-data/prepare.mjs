#!/usr/bin/env node
// Converts the raw downloads (Wortschatz Leipzig, OpenThesaurus SQL dump, Kovah/Taboo-Data) into compact JSON
// files in $PSST_RAW/prepared/. Run once after downloading (see README.md). Reads only; writes only into RAW.
import fs from 'node:fs';
import path from 'node:path';
import { RAW } from './lib.mjs';

const OUT = path.join(RAW, 'prepared');
fs.mkdirSync(OUT, { recursive: true });
const save = (n, o) => fs.writeFileSync(path.join(OUT, n), JSON.stringify(o));

// ---------------------------------------------------------------- OpenThesaurus
function parseTuples(line) {
  // "INSERT INTO `t` VALUES (..),(..);" -> array of arrays
  const rows = [];
  let i = line.indexOf('VALUES') + 6;
  const n = line.length;
  while (i < n) {
    while (i < n && line[i] !== '(') i++;
    if (i >= n) break;
    i++;
    const row = [];
    while (i < n) {
      const c = line[i];
      if (c === "'") {
        let s = ''; i++;
        while (i < n && line[i] !== "'") {
          if (line[i] === '\\') { i++; const e = line[i]; s += e === '0' ? '\0' : e === 'n' ? '\n' : e === 't' ? '\t' : e; }
          else s += line[i];
          i++;
        }
        i++; row.push(s);
      } else if (c === ',') i++;
      else if (c === ')') { i++; break; }
      else {
        let j = i;
        while (j < n && line[j] !== ',' && line[j] !== ')') j++;
        const tok = line.slice(i, j);
        row.push(tok === 'NULL' ? null : Number(tok));
        i = j;
      }
    }
    rows.push(row);
  }
  return rows;
}

function prepareOT() {
  const file = path.join(RAW, 'ot', 'x', 'openthesaurus_dump.sql');
  const rows = { synset: [], term: [], synset_link: [] };
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^INSERT INTO `(synset|term|synset_link)` VALUES/.exec(line);
    if (m) rows[m[1]].push(...parseTuples(line));
  }
  const visible = new Set(rows.synset.filter(r => r[3] && r[3].charCodeAt(0) === 1).map(r => r[0]));
  // term: id,version,language_id,level_id,normalized_word,original_id,synset_id,user_comment,word,normalized_word2
  const synTerms = new Map(); // synset -> [{w,lvl}]
  for (const r of rows.term) {
    const sid = r[6], word = r[8], lvl = r[3];
    if (!visible.has(sid) || !word) continue;
    if (!synTerms.has(sid)) synTerms.set(sid, []);
    synTerms.get(sid).push({ w: word, lvl });
  }
  // term_level ids: 2 ugs, 3 derb, 4 vulgär, 5 fachspr, 6 geh
  const links = { over: new Map(), under: new Map(), assoc: new Map() }; // synset -> Set(synset)
  const add = (m, a, b) => { if (!m.has(a)) m.set(a, new Set()); m.get(a).add(b); };
  // synset_link: id,version,eval,fact_count,link_type_id,synset_id,target_synset_id ; type 1 = Oberbegriff
  for (const r of rows.synset_link) {
    const [, , , , type, a, b] = r;
    if (!visible.has(a) || !visible.has(b)) continue;
    if (type === 1) { add(links.over, a, b); add(links.under, b, a); } // a has Oberbegriff b (verified in README test below)
    else if (type === 2) { add(links.assoc, a, b); add(links.assoc, b, a); }
  }
  const clean = w => /^[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß-]*[A-Za-zÄÖÜäöüß]$/.test(w) && !w.includes(' ');
  // words[lemma] = { lv, senses: [{ s, o, u, a }] }  (one sense per OpenThesaurus synset, so the build can pick the sense
  // the corpus supports and does not mix "Banane" the fruit with "Banane" = nonsense)
  const words = {};
  const ok = o => clean(o.w) && (!o.lvl || o.lvl === 2 || o.lvl === 6);
  for (const [sid, terms] of synTerms) {
    for (const t of terms) {
      if (!clean(t.w)) continue;
      const e = words[t.w] || (words[t.w] = { lv: 0, senses: [] });
      if (t.lvl) e.lv = Math.max(e.lv, t.lvl);
      const sense = { s: terms.filter(o => o.w !== t.w && ok(o)).map(o => o.w), o: [], u: [], a: [] };
      const pull = (m, key) => {
        for (const s2 of m.get(sid) || []) for (const o of synTerms.get(s2) || []) if (ok(o)) sense[key].push(o.w);
        sense[key] = [...new Set(sense[key])];
      };
      pull(links.over, 'o'); pull(links.under, 'u'); pull(links.assoc, 'a');
      e.senses.push(sense);
    }
  }
  save('ot.json', words);
  console.log('OpenThesaurus lemmas:', Object.keys(words).length, 'visible synsets:', visible.size);
}

// ---------------------------------------------------------------- Leipzig
function prepareLeipzig() {
  const corpora = [
    { id: 'm', dir: path.join(RAW, 'leipzig', 'm', 'deu_mixed-typical_2011_1M'), prefix: 'deu_mixed-typical_2011_1M' },
    { id: 'n', dir: path.join(RAW, 'leipzig', 'n', 'deu_news_2023_1M'), prefix: 'deu_news_2023_1M' },
  ];
  const freq = {}; // word -> [mixedCount, newsCount]
  const totals = [0, 0];
  const idMaps = [];
  corpora.forEach((c, ci) => {
    const idToWord = new Map();
    for (const line of fs.readFileSync(path.join(c.dir, `${c.prefix}-words.txt`), 'utf8').split('\n')) {
      const p = line.split('\t');
      if (p.length < 3) continue;
      const cnt = +p[2];
      idToWord.set(+p[0], p[1]);
      totals[ci] += cnt;
      if (cnt >= 3) (freq[p[1]] || (freq[p[1]] = [0, 0]))[ci] = cnt;
    }
    idMaps.push(idToWord);
  });
  // keep only reasonably frequent words
  const keep = {};
  for (const [w, [a, b]] of Object.entries(freq)) {
    const f = (a / totals[0] + b / totals[1]) / 2 * 1e6;
    if (f >= 0.8) keep[w] = [Math.round(f * 100) / 100, a, b];
  }
  // sentence co-occurrences for kept words
  const cooc = {};
  corpora.forEach((c, ci) => {
    const idToWord = idMaps[ci];
    for (const line of fs.readFileSync(path.join(c.dir, `${c.prefix}-co_s.txt`), 'utf8').split('\n')) {
      const p = line.split('\t');
      if (p.length < 4) continue;
      const a = idToWord.get(+p[0]), b = idToWord.get(+p[1]);
      if (!a || !b || !keep[a] || !keep[b]) continue;
      const sig = +p[3];
      for (const [x, y] of [[a, b], [b, a]]) {
        const m = cooc[x] || (cooc[x] = {});
        m[y] = (m[y] || 0) + sig;
      }
    }
  });
  const coocOut = {};
  for (const [w, m] of Object.entries(cooc)) {
    coocOut[w] = Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 120).map(([k, v]) => [k, Math.round(v * 10) / 10]);
  }
  save('freq.json', keep);
  save('cooc.json', coocOut);
  console.log('Leipzig words kept:', Object.keys(keep).length, 'cooc entries:', Object.keys(coocOut).length);
}

// ---------------------------------------------------------------- Kovah
function prepareKovah() {
  const dir = path.join(RAW, 'kovah', 'x', 'package', 'src', 'data', 'de');
  const out = {};
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    out[f.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  save('kovah.json', out);
  console.log('Kovah files:', Object.keys(out).join(', '), 'cards:', Object.values(out).reduce((a, o) => a + Object.keys(o).length, 0));
}

const only = process.argv[2];
if (!only || only === 'ot') prepareOT();
if (!only || only === 'leipzig') prepareLeipzig();
if (!only || only === 'kovah') prepareKovah();
