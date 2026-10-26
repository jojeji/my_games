#!/usr/bin/env node
// Quality check for the Psst! card data. Used by build.mjs (fails on violations), by the tests and from the CLI:
//   node tools/psst-data/check.mjs            checks games/psst/data/packs.json + packs/*.json
import fs from 'node:fs';
import path from 'node:path';
import { DATA, sharesStem, redundant, blocked } from './lib.mjs';

export const SRC = ['ot', 'kovah', 'ai', 'mixed'];
export const TABU_COUNT = 5;

/** Problems of one card as an array of strings (empty = fine). */
export function checkCard(c) {
  const p = [];
  const at = `${c && c.id}`;
  if (!c || typeof c !== 'object') return ['not an object'];
  if (typeof c.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.id)) p.push(`${at}: id must be an ascii slug`);
  if (typeof c.w !== 'string' || c.w.trim() !== c.w || c.w.length < 2 || c.w.length > 32 || /\s{2,}/.test(c.w)) p.push(`${at}: bad Suchbegriff "${c.w}"`);
  if (c.w && c.w.split(" ").length > 5) p.push(`${at}: Suchbegriff has more than 5 words`);
  if (![1, 2, 3].includes(c.d)) p.push(`${at}: d must be 1, 2 or 3`);
  if (!SRC.includes(c.src)) p.push(`${at}: src must be one of ${SRC.join('/')}`);
  if (!Array.isArray(c.t) || c.t.length !== TABU_COUNT) { p.push(`${at}: needs exactly ${TABU_COUNT} Tabuwörter`); return p; }
  const seen = [];
  for (const t of c.t) {
    if (typeof t !== 'string' || !t.trim()) { p.push(`${at}: empty Tabuwort`); continue; }
    if (t.trim() !== t || /\s{2,}/.test(t) || t.length < 2 || t.length > 30) p.push(`${at}: bad Tabuwort "${t}"`);
    if (sharesStem(c.w, t)) p.push(`${at}: Tabuwort "${t}" shares a stem with "${c.w}"`);
    for (const o of seen) if (redundant(o, t)) p.push(`${at}: Tabuwörter "${o}" and "${t}" are duplicates`);
    seen.push(t);
    if (t === t.toUpperCase() && t.length > 6 && /[A-ZÄÖÜ]{7}/.test(t)) p.push(`${at}: Tabuwort "${t}" is all caps`);
  }
  for (const x of [c.w, ...c.t]) {
    const b = typeof x === 'string' && blocked(x);
    if (b) p.push(`${at}: "${x}" is on the blocklist (${b})`);
  }
  return p;
}

/** Cross-card checks: unique ids, same id => identical card in all packs. */
export function checkCards(cards) {
  const p = [];
  const byId = new Map();
  const byW = new Map();
  for (const c of cards) {
    p.push(...checkCard(c));
    const prev = byId.get(c.id);
    if (prev && JSON.stringify(prev) !== JSON.stringify(c)) p.push(`${c.id}: id used by two different cards ("${prev.w}" / "${c.w}")`);
    byId.set(c.id, c);
    const wl = c.w && c.w.toLowerCase();
    if (wl && byW.has(wl) && byW.get(wl) !== c.id) p.push(`${c.id}: Suchbegriff "${c.w}" duplicates card ${byW.get(wl)}`);
    byW.set(wl, c.id);
  }
  return p;
}

/** Loads packs.json + all pack files; returns { index, packs: {id: cards[]}, problems }. */
export function loadData(dataDir = DATA) {
  const problems = [];
  const index = JSON.parse(fs.readFileSync(path.join(dataDir, 'packs.json'), 'utf8'));
  const packs = {};
  if (index.version !== 1 || !Array.isArray(index.packs)) problems.push('packs.json: expected { version: 1, packs: [] }');
  const listed = new Set();
  for (const pk of index.packs || []) {
    for (const k of ['id', 'name', 'kind', 'icon', 'desc', 'count', 'file']) if (pk[k] === undefined || pk[k] === '') problems.push(`packs.json: pack ${pk.id} lacks ${k}`);
    if (!['difficulty', 'topic'].includes(pk.kind)) problems.push(`packs.json: pack ${pk.id} has bad kind`);
    if (pk.file !== `packs/${pk.id}.json`) problems.push(`packs.json: pack ${pk.id} file should be packs/${pk.id}.json`);
    listed.add(path.basename(pk.file || ''));
    const f = path.join(dataDir, pk.file || '');
    if (!fs.existsSync(f)) { problems.push(`packs.json: ${pk.file} missing`); continue; }
    const cards = JSON.parse(fs.readFileSync(f, 'utf8'));
    packs[pk.id] = cards;
    if (!Array.isArray(cards)) { problems.push(`${pk.file}: not an array`); continue; }
    if (cards.length !== pk.count) problems.push(`packs.json: count of ${pk.id} is ${pk.count}, file has ${cards.length}`);
    const ids = new Set();
    for (const c of cards) { if (ids.has(c.id)) problems.push(`${pk.file}: duplicate id ${c.id}`); ids.add(c.id); }
  }
  const dir = path.join(dataDir, 'packs');
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (!listed.has(f)) problems.push(`packs/${f} is not listed in packs.json`);
  return { index, packs, problems };
}

export function checkAll(dataDir = DATA) {
  const { index, packs, problems } = loadData(dataDir);
  const all = Object.values(packs).flat();
  problems.push(...checkCards(all));
  const unique = new Set(all.map(c => c.id));
  return { index, packs, problems, unique: unique.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const r = checkAll();
  if (r.problems.length) {
    console.error(`${r.problems.length} problem(s):`);
    for (const x of r.problems.slice(0, 200)) console.error('  ' + x);
    process.exit(1);
  }
  console.log(`OK: ${r.index.packs.length} packs, ${r.unique} unique cards`);
}
