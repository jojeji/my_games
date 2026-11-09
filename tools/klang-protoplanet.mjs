// Protoplanet: Klang messen (Browser noetig, nicht Teil von npm test). Braucht Playwright (require('playwright')) und einen Server im Repo-Root:
//   python3 -m http.server 8767   (im Worktree-Root)
//   node tools/klang-protoplanet.mjs render [--out DIR]   -> 60 s je Kapitel offline rendern (WAV + Kennzahlen je 10-s-Fenster, Klick-Pruefung)
//   node tools/klang-protoplanet.mjs live  [--shots DIR]  -> echter Lauf (Levelauswahl, Level 1-2, stumm, Tab versteckt, Bildzeit mit/ohne Ton)
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire('/opt/node-tools/node_modules/');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const mode = args[0] || 'render';
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const BASE = opt('--base', 'http://localhost:8767');
const OUT = opt('--out', '/tmp/claude-0/-home-user-my-games/5b46cfd8-cae6-5bdd-9142-3293024acfc7/scratchpad/protoplanet-klang');
const SR = 44100;
mkdirSync(OUT, { recursive: true });

const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
const fmt = (x, n = 1) => x.toFixed(n);

/** Realer FFT-Spektralschwerpunkt (Hz) ueber ein Fenster, gemittelt ueber mehrere Rahmen. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]], [im[i], im[j]] = [im[j], im[i]];
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}
function centroid(x, from, to) {
  const N = 8192;
  const mag = new Float64Array(N / 2);
  let frames = 0;
  for (let s = from; s + N <= to; s += N) {
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    for (let i = 0; i < N / 2; i++) mag[i] += Math.hypot(re[i], im[i]);
    frames++;
  }
  let num = 0;
  let den = 0;
  for (let i = 1; i < N / 2; i++) {
    num += mag[i] * ((i * SR) / N);
    den += mag[i];
  }
  return den > 0 ? num / den : 0;
}

function wav(name, left, right) {
  const n = left.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), 46 + i * 4);
  }
  writeFileSync(`${OUT}/${name}`, buf);
}

/* ---------- Offline-Rendering ---------- */
async function render(browser) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${BASE}/games/protoplanet/index.html`);
  const results = [];
  const jobs = [
    { name: 'kapitel1.wav', mood: 1, seed: 11, scenario: true },
    { name: 'kapitel2.wav', mood: 2, seed: 22, scenario: true },
    { name: 'levelauswahl.wav', mood: 'select', seed: 33, scenario: false },
    { name: 'effekte-kapitel1.wav', mood: 1, seed: 44, scenario: false, sfx: true, musicVol: 0 },
  ];
  for (const job of jobs) {
    const b64 = await page.evaluate(
      async ({ job, SR }) => {
        const { createEngine } = await import('/games/protoplanet/audio.js');
        const ctx = new OfflineAudioContext(2, SR * 60, SR);
        const e = createEngine(ctx, { seed: job.seed, mood: job.mood, music: job.musicVol != null ? job.musicVol : 70, sfx: 80 });
        e.start(0);
        // Szenario: 0-24 s ruhig, 24-36 s Gefahr, 36-60 s Spieler waechst (Zeitstufe x4 ab 48 s)
        const at = (t) => (job.scenario ? (t < 24 ? { danger: 0, size: 0, timeScale: 1 } : t < 36 ? { danger: 0.9, size: 0.1, timeScale: 1 } : { danger: 0, size: Math.min(1, (t - 36) / 18), timeScale: t >= 48 ? 4 : 1 }) : { danger: 0, size: 0, timeScale: 1 });
        for (let t = 0; t < 60; t += 2) {
          e.setInput(at(t), t);
          e.pump(Math.min(60, t + 2));
        }
        if (job.sfx) {
          // jede Effektart mehrfach, eine Aufnahme-Kette, und ein Sturm von Aufnahmen (Drosselung)
          const s = e.sfx;
          s.levelStart({ t: 1 });
          for (let i = 0; i < 8; i++) s.absorb({ ratio: [0.002, 0.01, 0.05, 0.3][i % 4], t: 4 + i * 1.3 });
          for (let i = 0; i < 7; i++) s.absorb({ ratio: 0.02, t: 16 + i * 0.25 });
          for (let i = 0; i < 40; i++) s.absorb({ ratio: 0.02, t: 22 + i * 0.02 });
          for (let i = 0; i < 12; i++) s.eject({ t: 25 + i * 0.4 });
          for (let i = 0; i < 40; i++) s.eject({ stream: true, t: 31 + i * 0.1 });
          for (let i = 0; i < 4; i++) s.timeStep({ idx: i, t: 36 + i * 0.5 });
          s.ui({ t: 39 });
          s.rewind({ t: 41 });
          s.swallowed({ t: 45 });
          s.win({ t: 50 });
        }
        const buf = await ctx.startRendering();
        const l = buf.getChannelData(0);
        const r = buf.getChannelData(1);
        const out = new Uint8Array(l.length * 8);
        const dv = new DataView(out.buffer);
        for (let i = 0; i < l.length; i++) {
          dv.setFloat32(i * 8, l[i], true);
          dv.setFloat32(i * 8 + 4, r[i], true);
        }
        let s = '';
        for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
        return btoa(s);
      },
      { job, SR },
    );
    const raw = Buffer.from(b64, 'base64');
    const n = raw.length / 8;
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      L[i] = raw.readFloatLE(i * 8);
      R[i] = raw.readFloatLE(i * 8 + 4);
    }
    wav(job.name, L, R);
    const mono = new Float32Array(n);
    for (let i = 0; i < n; i++) mono[i] = (L[i] + R[i]) / 2;
    let peak = 0;
    let maxDiff = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      sumSq += mono[i] * mono[i];
      if (i) maxDiff = Math.max(maxDiff, Math.abs(mono[i] - mono[i - 1]));
    }
    const wins = [];
    for (let w = 0; w < 6; w++) {
      const a = w * 10 * SR;
      const b = a + 10 * SR;
      let ss = 0;
      let pk = 0;
      for (let i = a; i < b; i++) {
        ss += mono[i] * mono[i];
        pk = Math.max(pk, Math.abs(mono[i]));
      }
      wins.push({ rms: Math.sqrt(ss / (b - a)), peak: pk, cen: centroid(mono, a, b) });
    }
    // Pumpen/Spruenge: RMS in 0,5-s-Fenstern, groesster Sprung zum Nachbarfenster in dB (nur sinnvoll, wo Musik spielt)
    const hw = SR / 2;
    const r05 = [];
    for (let a = 0; a + hw <= n; a += hw) {
      let ss = 0;
      for (let i = a; i < a + hw; i++) ss += mono[i] * mono[i];
      r05.push(Math.sqrt(ss / hw));
    }
    let jump = 0;
    for (let i = 11; i < r05.length; i++) if (r05[i] > 1e-4 && r05[i - 1] > 1e-4) jump = Math.max(jump, Math.abs(db(r05[i]) - db(r05[i - 1])));
    results.push({ name: job.name, rms: Math.sqrt(sumSq / n), peak, maxDiff, jump, wins });
  }
  await page.close();
  console.log('Offline-Rendering (44,1 kHz, 60 s, Musik 70 %, Effekte 80 %)');
  for (const r of results) {
    console.log(`\n${r.name}: RMS ${fmt(db(r.rms))} dBFS, Spitze ${fmt(r.peak, 3)} (${fmt(db(r.peak))} dBFS), max. Sprung Abtastwert zu Abtastwert ${fmt(r.maxDiff, 4)}, max. Pegelsprung zwischen 0,5-s-Fenstern (ab 5 s) ${fmt(r.jump)} dB`);
    console.log('  Fenster   RMS dBFS   Spitze   Spektralschwerpunkt Hz');
    r.wins.forEach((w, i) => console.log(`  ${i * 10}-${i * 10 + 10} s   ${fmt(db(w.rms)).padStart(7)}   ${fmt(w.peak, 3)}   ${fmt(w.cen, 0).padStart(6)}`));
  }
  if (errors.length) console.log('FEHLER', errors);
  return results;
}

/* ---------- Live-Messung ---------- */
async function live(browser) {
  const shots = opt('--shots', OUT);
  mkdirSync(shots, { recursive: true });
  const report = {};
  for (const vp of [
    { w: 390, h: 844 },
    { w: 360, h: 740 },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: false });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`${BASE}/games/protoplanet/index.html`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('.pp-select');
    const tag = `${vp.w}x${vp.h}`;
    // Messschleife in der Seite: alle 40 ms RMS/Spitze des Master-Ausgangs
    const startMeter = () =>
      page.evaluate(() => {
        const a = window.__protoplanet.audio;
        if (!a.engine) throw new Error('Audio nicht entsperrt');
        if (!window.__an) window.__an = a.engine.attachAnalyser();
        const buf = new Float32Array(window.__an.fftSize);
        window.__meas = [];
        clearInterval(window.__mt);
        window.__mt = setInterval(() => {
          window.__an.getFloatTimeDomainData(buf);
          let ss = 0;
          let pk = 0;
          for (let i = 0; i < buf.length; i++) {
            ss += buf[i] * buf[i];
            pk = Math.max(pk, Math.abs(buf[i]));
          }
          window.__meas.push({ t: performance.now(), rms: Math.sqrt(ss / buf.length), pk });
        }, 40);
      });
    const stats = async (label) => {
      const m = await page.evaluate(() => window.__meas.splice(0));
      const rms = Math.sqrt(m.reduce((s, x) => s + x.rms * x.rms, 0) / Math.max(1, m.length));
      const pk = m.reduce((s, x) => Math.max(s, x.pk), 0);
      // Pegel je Sekunde -> groesster Sprung
      const sec = [];
      for (let i = 0; i + 25 <= m.length; i += 25) sec.push(Math.sqrt(m.slice(i, i + 25).reduce((s, x) => s + x.rms * x.rms, 0) / 25));
      let jump = 0;
      for (let i = 1; i < sec.length; i++) if (sec[i] > 1e-4 && sec[i - 1] > 1e-4) jump = Math.max(jump, Math.abs(db(sec[i]) - db(sec[i - 1])));
      return { label, rms, rmsDb: db(rms), pk, jump, n: m.length };
    };
    const rows = [];
    // 1) erste Geste entsperrt den Ton
    await page.screenshot({ path: `${shots}/auswahl-${tag}.png` });
    const before = await page.evaluate(() => ({ unlocked: window.__protoplanet.audio.unlocked, ctx: !!window.__protoplanet.audio.ctx }));
    await page.mouse.click(vp.w / 2, 40);
    await page.waitForTimeout(500);
    await startMeter();
    await page.waitForTimeout(16000);
    rows.push({ ...(await stats('Levelauswahl 16 s')), before });
    // 2) Level 1-2 ~32 s mit Eingaben
    await page.evaluate(async () => {
      const { levelById } = await import('/games/protoplanet/levels.js');
      window.__protoplanet.startLevel(levelById('1-2'), null);
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => (window.__meas = []));
    const box = await page.locator('.pp-canvas').boundingBox();
    const t0 = Date.now();
    let k = 0;
    while (Date.now() - t0 < 32000) {
      const ang = k * 2.4;
      await page.mouse.click(box.x + box.width / 2 + Math.cos(ang) * 120, box.y + box.height / 2 + Math.sin(ang) * 120);
      k++;
      await page.waitForTimeout(900);
    }
    rows.push(await stats('Level 1-2 32 s'));
    await page.screenshot({ path: `${shots}/level-${tag}.png` });
    // Pausenmenue
    await page.click('button[aria-label="Pause"]');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${shots}/pause-${tag}.png` });
    rows.push(await stats('Pausenmenue 1,5 s (Musik gedaempft)'));
    // Einstellungen aus dem Pausenmenue
    await page.click('text=Einstellungen');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${shots}/einstellungen-${tag}.png` });
    await page.click('.modal-actions >> text=Fertig');
    await page.click('.modal-actions >> text=Weiter');
    await page.waitForTimeout(800);
    // Tab versteckt
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(1000);
    await page.evaluate(() => (window.__meas = []));
    await page.waitForTimeout(1000);
    const hiddenState = await page.evaluate(() => window.__protoplanet.audio.ctx.state);
    rows.push({ ...(await stats('Tab versteckt (1 s nach Ausblenden)')), ctxState: hiddenState });
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(3500);
    await page.evaluate(() => (window.__meas = []));
    await page.waitForTimeout(2000);
    rows.push({ ...(await stats('zurueck (3,5-5,5 s nach Einblenden)')), ctxState: await page.evaluate(() => window.__protoplanet.audio.ctx.state) });
    // Zurueck zur Auswahl, Lautsprecher-Knopf
    await page.evaluate(() => window.__protoplanet.showSelect());
    await page.waitForTimeout(300);
    await page.click('.pp-sound');
    await page.waitForTimeout(1200);
    await page.evaluate(() => (window.__meas = []));
    await page.waitForTimeout(2500);
    rows.push(await stats('Ton aus (Lautsprecher-Knopf), 2,5 s'));
    await page.screenshot({ path: `${shots}/auswahl-stumm-${tag}.png` });
    await page.click('.pp-sound');
    await page.waitForTimeout(3000);
    await page.evaluate(() => (window.__meas = []));
    await page.waitForTimeout(2500);
    rows.push(await stats('Ton wieder an, 2,5 s'));
    report[tag] = { rows, errors };
    await ctx.close();
  }

  // Bildzeit: Level 1-2, mit Ton (entsperrt) gegen ohne (nie eine Geste)
  const frame = {};
  for (const withAudio of [false, true, false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/games/protoplanet/index.html`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('.pp-select');
    if (withAudio) await page.mouse.click(195, 40);
    await page.evaluate(async () => {
      const { levelById } = await import('/games/protoplanet/levels.js');
      window.__protoplanet.startLevel(levelById('1-2'), null);
    });
    await page.waitForTimeout(3000);
    const r = await page.evaluate(
      () =>
        new Promise((res) => {
          const ts = [];
          let last = performance.now();
          const end = last + 12000;
          const play = window.__protoplanet.state.play;
          let n = 0;
          const f = (t) => {
            ts.push(t - last);
            last = t;
            if (++n % 40 === 0 && play.world.player) play.ejectAt(Math.cos(n) * 5, Math.sin(n) * 5);
            if (t < end) requestAnimationFrame(f);
            else {
              ts.shift();
              ts.sort((a, b) => a - b);
              res({ mean: ts.reduce((s, x) => s + x, 0) / ts.length, p50: ts[Math.floor(ts.length * 0.5)], p95: ts[Math.floor(ts.length * 0.95)], max: ts[ts.length - 1], n: ts.length, ctx: window.__protoplanet.audio.ctx ? window.__protoplanet.audio.ctx.state : 'none' });
            }
          };
          requestAnimationFrame(f);
        }),
    );
    (frame[withAudio ? 'mit Ton' : 'ohne Ton'] ||= []).push(r);
    await ctx.close();
  }
  report.frame = frame;
  return report;
}

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  if (mode === 'render') await render(browser);
  else {
    const rep = await live(browser);
    for (const [tag, v] of Object.entries(rep)) {
      if (tag === 'frame') continue;
      console.log(`\n=== ${tag} ===`);
      for (const r of v.rows) console.log(`${r.label.padEnd(46)} RMS ${fmt(r.rmsDb).padStart(7)} dBFS   Spitze ${fmt(r.pk, 3)}   max. Sprung/s ${fmt(r.jump)} dB   n=${r.n}${r.ctxState ? '   ctx=' + r.ctxState : ''}${r.before ? '   vor der Geste: ' + JSON.stringify(r.before) : ''}`);
      console.log('Konsolenfehler:', v.errors.length ? v.errors : 'keine');
    }
    console.log('\nBildzeit Level 1-2 (ms je Bild, 12 s):');
    for (const [k, runs] of Object.entries(rep.frame)) for (const r of runs) console.log(`  ${k}: Mittel ${fmt(r.mean, 2)}  Median ${fmt(r.p50, 2)}  p95 ${fmt(r.p95, 2)}  max ${fmt(r.max, 1)}  (${r.n} Bilder, ctx=${r.ctx})`);
  }
} finally {
  await browser.close();
}
