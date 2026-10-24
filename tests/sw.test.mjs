import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { build, ROOT } from '../tools/update-precache.mjs';

test('sw.js precache list and version are up to date (run `npm run sw`)', () => {
  const { sw } = build();
  assert.equal(readFileSync(join(ROOT, 'sw.js'), 'utf8'), sw);
});

test('every registered game has manifest, icons and entry page', () => {
  const games = JSON.parse(readFileSync(join(ROOT, 'games.json'), 'utf8'));
  for (const g of games) {
    for (const f of ['index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png']) {
      assert.ok(existsSync(join(ROOT, g.path, f)), g.id + '/' + f);
    }
    const m = JSON.parse(readFileSync(join(ROOT, g.path, 'manifest.webmanifest'), 'utf8'));
    assert.equal(m.start_url, './');
    assert.equal(m.scope, './');
    assert.ok(existsSync(join(ROOT, g.icon)));
  }
});

test('no root-absolute paths in html/css/js sources', () => {
  const files = ['index.html', 'hub.js', 'hub.css', 'games/replikator/index.html', 'games/replikator/main.js', 'games/replikator/style.css', 'games/replikator/manifest.webmanifest', 'games/merlin/index.html', 'games/merlin/main.js', 'games/merlin/style.css', 'games/merlin/manifest.webmanifest'];
  for (const f of files) {
    const t = readFileSync(join(ROOT, f), 'utf8');
    assert.ok(!/(?:href|src|start_url|scope)=?"?\s*:?\s*"\//.test(t), f);
  }
});
