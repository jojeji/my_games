#!/usr/bin/env node
// Render PNG icons (192, 512, maskable 512, apple-touch 180) from a game's icon.svg using headless Chromium.
// Playwright is NOT a dependency of this repo. Install it somewhere (e.g. `npm i playwright` in a scratch dir),
// then run from that directory:   node /path/to/repo/tools/make-icons.mjs games/<id>/icons/icon.svg
// Chromium path: $CHROME_PATH or the default Playwright browser.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const svgPath = resolve(process.argv[2] || '');
if (!process.argv[2]) {
  console.error('Usage: node tools/make-icons.mjs <path/to/icon.svg>');
  process.exit(1);
}
const require = createRequire(join(process.cwd(), 'noop.js'));
const { chromium } = require('playwright');
const svg = readFileSync(svgPath, 'utf8');
const outDir = dirname(svgPath);
mkdirSync(outDir, { recursive: true });

const targets = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.8], // content scaled into the maskable safe zone
  ['apple-touch-icon.png', 180, 1],
];

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage();
for (const [name, size, scale] of targets) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Buffer.from(svg).toString('base64');
  const pad = ((1 - scale) / 2) * 100;
  await page.setContent(
    `<body style="margin:0;background:#070b14"><div style="position:absolute;inset:${pad}%"><img style="width:100%;height:100%;display:block" src="data:image/svg+xml;base64,${inner}"></div></body>`,
  );
  await page.waitForTimeout(100);
  await page.screenshot({ path: join(outDir, name), omitBackground: false });
  console.log('wrote', join(outDir, name));
}
await browser.close();
