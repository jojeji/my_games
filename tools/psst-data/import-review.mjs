#!/usr/bin/env node
// Merges review export codes (PSSTREVIEW1.<base64>) from games/psst/review into games/psst/data/review-decisions.json.
//   node tools/psst-data/import-review.mjs "PSSTREVIEW1...." ["PSSTREVIEW1...." ...]
//   node tools/psst-data/import-review.mjs < codes.txt          (one code per line / whitespace separated)
// A later code for the same pack replaces the earlier one. Afterwards run build.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { DATA, readJson } from './lib.mjs';

const PREFIX = 'PSSTREVIEW1.';
export function decodeCode(code) {
  const c = code.trim();
  if (!c.startsWith(PREFIX)) throw new Error('code must start with ' + PREFIX);
  const p = JSON.parse(Buffer.from(c.slice(PREFIX.length), 'base64').toString('utf8'));
  if (typeof p.pack !== 'string' || !Array.isArray(p.keep) || !Array.isArray(p.drop) || typeof p.edit !== 'object') throw new Error('malformed review payload');
  for (const [id, e] of Object.entries(p.edit)) {
    if (typeof e.w !== 'string' || !Array.isArray(e.t) || e.t.length !== 5) throw new Error(`edit ${id}: needs w and exactly 5 t`);
  }
  return p;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  let codes = process.argv.slice(2).flatMap(a => a.split(/\s+/)).filter(Boolean);
  if (!codes.length) codes = fs.readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
  const file = path.join(DATA, 'review-decisions.json');
  const doc = readJson(file, { version: 1, decisions: [] });
  for (const code of codes) {
    const p = decodeCode(code);
    doc.decisions = doc.decisions.filter(d => d.pack !== p.pack);
    doc.decisions.push(p);
    console.log(`pack ${p.pack}: ${p.keep.length} keep, ${p.drop.length} drop, ${Object.keys(p.edit).length} edit`);
  }
  doc.decisions.sort((a, b) => (a.pack < b.pack ? -1 : 1));
  fs.writeFileSync(file, JSON.stringify(doc, null, 1) + '\n');
}
