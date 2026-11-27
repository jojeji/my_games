#!/usr/bin/env node
// Inselmelodie: spielt einen typischen Ablauf im Browser durch, macht Bildschirmfotos und prüft das Layout.
//   node tools/ui-inselmelodie.cjs [--size 1280x800] [--out dir] [--url http://localhost:8765/games/inselmelodie/]
// Prüfung je Schritt: (1) Text wird von einem anderen Element verdeckt (Papagei, Bilder, andere Texte),
// (2) Text ragt über den Bildschirmrand, (3) Fehler in der Konsole. Exit 1 bei Befunden.
// Braucht einen laufenden Server im Repo-Wurzelordner, z. B. `python3 -m http.server 8765`.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i > 0 ? process.argv[i + 1] : d;
};
const [W, H] = arg('size', '1280x800').split('x').map(Number);
const OUT = arg('out', '/tmp/inselmelodie-ui');
const URL = arg('url', 'http://localhost:8765/games/inselmelodie/');
fs.mkdirSync(OUT, { recursive: true });

// Im Browser: Textelemente, die von etwas anderem überdeckt werden (Abtastung mit elementFromPoint)
function layoutProblems() {
  const sel = 'h1,h2,p,.bubble,.isl-name,.stone-title,.stone-sub,.btn,.pill,.chip,.set-row>span,.album-item span,.badge,.next-flag,.legend .lg';
  const out = [];
  const vw = innerWidth, vh = innerHeight;
  const vis = (el) => {
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) > 0.2;
  };
  for (const el of document.querySelectorAll(sel)) {
    if (!vis(el) || !el.textContent.trim()) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (el.closest('.map-scroll')) {
      // Kartentexte nur prüfen, wenn sie im sichtbaren Bereich liegen
      if (r.right < 0 || r.left > vw || r.bottom < 0 || r.top > vh) continue;
    } else if (r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1) {
      if (!el.closest('.trail,.album-body,.more-body,.animal-txt')) out.push(`ragt über den Rand: ${desc(el)} ${rect(r)}`);
    }
    const pts = [[0.5, 0.5], [0.15, 0.5], [0.85, 0.5], [0.5, 0.2], [0.5, 0.8]];
    let hidden = 0;
    let by = null;
    for (const [fx, fy] of pts) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
      const top = document.elementFromPoint(x, y);
      if (!top || el.contains(top) || top.contains(el)) continue;
      if (top.closest('.fx-layer,.confetti,.overlay') && !el.closest('.overlay')) continue;
      // Karte scrollt unter den Leisten durch: das ist nur dann ein Befund, wenn es die Insel ist, an der das Boot liegt
      if (el.closest('.map-scroll') && top.closest('.map-top,.map-bottom') && !el.closest('.island.here')) continue;
      hidden++;
      by = top;
    }
    if (hidden >= 2) out.push(`verdeckt: ${desc(el)} von ${desc(by)}`);
  }
  return out;
  function desc(e) { return e ? `${e.tagName.toLowerCase()}.${[...e.classList].join('.')} "${(e.textContent || e.alt || '').trim().slice(0, 30)}"` : '?'; }
  function rect(r) { return `[${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}]`; }
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: true });
  const p = await ctx.newPage();
  const errs = [];
  const findings = [];
  p.on('pageerror', (e) => errs.push('Seitenfehler: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push('Konsole: ' + m.text()));
  let n = 0;
  const shot = async (name, settle = 700) => {
    await p.waitForTimeout(settle);
    const file = path.join(OUT, `${String(++n).padStart(2, '0')}-${name}.png`);
    await p.screenshot({ path: file });
    const probs = await p.evaluate(layoutProblems);
    for (const pr of probs) findings.push(`${name}: ${pr}`);
    console.log(`${file}${probs.length ? '  !! ' + probs.length + ' Befund(e)' : ''}`);
  };
  const key = async (name) => {
    await p.evaluate((nm) => {
      const k = [...document.querySelectorAll('.kbd-host .kbd .key')].find((e) => e.getAttribute('aria-label') === nm);
      k.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    }, name);
    await p.waitForTimeout(160);
  };
  const playWanted = async (max = 80, wrongAt = -1) => {
    for (let i = 0; i < max; i++) {
      const want = await p.evaluate(() => {
        const g = document.querySelector('.staff .note.now');
        if (!g) return null;
        const name = g.querySelector('.name');
        return name ? name.textContent : null;
      });
      if (!want) break;
      if (i === wrongAt) { await key(want === 'C' ? 'D' : 'C'); await shot('fehlgriff', 250); }
      await key(want);
    }
  };
  const click = async (sel, opts) => { await p.locator(sel).first().click(opts); };

  await p.goto(URL);
  await p.evaluate(() => localStorage.clear());
  await p.goto(URL);
  await shot('start');
  await click('.chip');
  await click('text=Fertig');
  await p.waitForTimeout(2300);
  await shot('karte');
  await click('.island >> nth=0');
  await shot('palmeninsel');
  await click('.stone >> nth=0');
  for (let i = 1; i <= 4; i++) {
    await shot('rundgang-' + i);
    await click('.tour-nav .btn.primary');
  }
  await shot('neue-note-c');
  await key('C'); await key('C'); await key('C');
  await shot('neue-note-c-fertig');
  await click('text=Weiter');
  await shot('stueck-erster-ton');
  // Notennamen fehlen im Notenspiel; im Stück "Erster Ton" sind sie da
  await playWanted(20, 2);
  await shot('ergebnis', 2200);
  await click('.overlay .btn.primary');
  await shot('sammelstueck', 1200);
  await click('.overlay .btn.primary');
  await shot('karte-fahrt', 1500);
  await shot('karte-angekommen', 4500);
  await click('.island >> nth=1');
  await shot('wasserfallinsel', 3500);
  await click('.stone.next');
  await shot('neue-note-d');
  await key('E');
  await shot('neue-note-d-fehlgriff', 200);
  await key('D'); await key('D'); await key('D');
  await click('text=Weiter');
  await shot('neue-note-e');
  await key('E'); await key('E'); await key('E');
  await click('text=Weiter');
  await shot('notenspiel');
  await p.evaluate(() => window.__inselmelodie.progress.settings.help.names = true);
  await p.goBack(); await p.waitForTimeout(400);
  await p.goBack(); await p.waitForTimeout(600);
  await shot('karte-zurueck');
  await click('[aria-label=Album]');
  await shot('album');
  await p.goBack();
  await click('[aria-label=Einstellungen]');
  await shot('einstellungen');

  console.log('\nBefunde:', findings.length ? '\n  ' + findings.join('\n  ') : 'keine');
  console.log('Fehler:', errs.length ? '\n  ' + errs.join('\n  ') : 'keine');
  await b.close();
  process.exit(findings.length || errs.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
