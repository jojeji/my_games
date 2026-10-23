#!/usr/bin/env node
// node tools/new-game.mjs <id> "<Titel>"
// Copies games/_template to games/<id>, rewrites ids/names/manifest and registers the game in games.json.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [id, title] = process.argv.slice(2);
if (!id || !title || !/^[a-z][a-z0-9-]*$/.test(id) || id.startsWith('_')) {
  console.error('Usage: node tools/new-game.mjs <id> "<Titel>"   (id: lowercase letters, digits, "-")');
  process.exit(1);
}
const src = join(root, 'games/_template');
const dst = join(root, 'games', id);
if (existsSync(dst)) {
  console.error(`games/${id} existiert bereits.`);
  process.exit(1);
}

const TEXT = /\.(html|js|css|json|webmanifest|svg)$/;
function copy(from, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const a = join(from, name);
    const b = join(to, name);
    if (statSync(a).isDirectory()) copy(a, b);
    else if (TEXT.test(name)) writeFileSync(b, readFileSync(a, 'utf8').replaceAll('__ID__', id).replaceAll('__TITLE__', title));
    else copyFileSync(a, b);
  }
}
copy(src, dst);

const regPath = join(root, 'games.json');
const reg = JSON.parse(readFileSync(regPath, 'utf8'));
reg.push({ id, title, description: 'Neues Spiel – Beschreibung in games.json anpassen.', path: `games/${id}/`, icon: `games/${id}/icons/icon.svg`, status: 'playable' });
writeFileSync(regPath, JSON.stringify(reg, null, 2) + '\n');

spawnSync(process.execPath, [join(root, 'tools/update-precache.mjs')], { stdio: 'inherit' });
console.log(`\nFertig: games/${id}/ angelegt und in games.json eingetragen.
Nächste Schritte: def.js bearbeiten, Icon (icons/icon.svg) anpassen und mit tools/make-icons.mjs PNGs erzeugen,
danach \`npm test\` und \`node tools/update-precache.mjs\`.`);
