#!/usr/bin/env node
// Regenerates the VERSION and PRECACHE blocks in sw.js from the files on disk.
//   node tools/update-precache.mjs          rewrite sw.js
//   node tools/update-precache.mjs --check  exit 1 if sw.js is out of date (used by tests)
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = /\.(html|css|js|mjs|json|webmanifest|svg|png|jpg|jpeg|webp|ico|woff2?)$/i;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** All files that should be available offline, as URLs relative to the site root. */
export function collectFiles(root = ROOT) {
  const games = JSON.parse(readFileSync(join(root, 'games.json'), 'utf8'));
  const gameDirs = games.map((g) => g.path.replace(/\/$/, ''));
  const files = [];
  const top = ['index.html', 'hub.js', 'hub.css', 'games.json', 'manifest.webmanifest'];
  for (const f of top) if (existsSync(join(root, f))) files.push(f);
  for (const dir of ['icons', 'engine', ...gameDirs]) {
    if (!existsSync(join(root, dir))) continue;
    for (const p of walk(join(root, dir))) {
      const rel = relative(root, p).split(sep).join('/');
      if (EXT.test(rel) && !rel.endsWith('/LICENSE')) files.push(rel);
    }
  }
  const urls = ['./', ...gameDirs.map((d) => d + '/'), ...files];
  return { urls: [...new Set(urls)].sort(), files: [...new Set(files)].sort() };
}

export function build(root = ROOT) {
  const { urls, files } = collectFiles(root);
  const h = createHash('sha1');
  for (const f of files) {
    h.update(f);
    h.update(readFileSync(join(root, f)));
  }
  const version = h.digest('hex').slice(0, 10);
  const swPath = join(root, 'sw.js');
  let sw = readFileSync(swPath, 'utf8');
  sw = sw.replace(/\/\* <VERSION> \*\/[\s\S]*?\/\* <\/VERSION> \*\//, `/* <VERSION> */\nconst VERSION = '${version}';\n/* </VERSION> */`);
  const list = urls.map((u) => `  '${u}',`).join('\n');
  sw = sw.replace(/\/\* <PRECACHE> \*\/[\s\S]*?\/\* <\/PRECACHE> \*\//, `/* <PRECACHE> */\nconst PRECACHE = [\n${list}\n];\n/* </PRECACHE> */`);
  return { sw, swPath, version, urls };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { sw, swPath, version, urls } = build();
  const current = readFileSync(swPath, 'utf8');
  if (process.argv.includes('--check')) {
    if (current !== sw) {
      console.error('sw.js ist veraltet. Bitte `node tools/update-precache.mjs` ausführen.');
      process.exit(1);
    }
    console.log('sw.js ist aktuell (' + version + ')');
  } else {
    writeFileSync(swPath, sw);
    console.log(`sw.js aktualisiert: Version ${version}, ${urls.length} Einträge.`);
  }
}
