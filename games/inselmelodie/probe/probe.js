// Mikrofon-Probe: prüft am echten Klavier, ob die Tonerkennung zuverlässig genug ist.
// Nutzt dieselben Module wie später das Spiel (pitch.js, tracker.js, notes.js).
import { detectPitch, rms } from '../pitch.js';
import { createTracker, TRACKER_DEFAULTS } from '../tracker.js';
import { nearest, noteName, sciName, calibrate, MITTEL_C } from '../notes.js';

const $ = (id) => document.getElementById(id);
const KEY = 'inselmelodie:probe';

const SEQS = [
  { id: 'scale', name: 'Tonleiter C bis C und zurück', notes: [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60] },
  { id: 'repeat', name: 'Wiederholungen (G G G E E E C C C)', notes: [67, 67, 67, 64, 64, 64, 60, 60, 60] },
  { id: 'haensel', name: '„Hänschen klein“, Anfang', notes: [67, 64, 64, 65, 62, 62, 60, 62, 64, 65, 67, 67, 67] },
  { id: 'black', name: 'Schwarze Tasten (Cis Dis Fis Gis B)', notes: [61, 63, 66, 68, 70] },
  { id: 'low', name: 'Tiefe Töne: C3 bis C4 (für später)', notes: [48, 50, 52, 53, 55, 57, 59, 60] },
  { id: 'high', name: 'Hohe Töne: C5 bis C6 (für später)', notes: [72, 74, 76, 77, 79, 81, 83, 84] },
];

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* egal */ }
}
const store = load();
store.settings = { gateFloor: TRACKER_DEFAULTS.gateFloor, minClarity: TRACKER_DEFAULTS.minClarity, onsetRatio: TRACKER_DEFAULTS.onsetRatio, ...store.settings };
store.offset ??= 0;
store.results ??= {};

let tracker = createTracker({ ...store.settings, offsetCents: store.offset });
let ctx = null;
let analyser = null;
let buf = null;
let nsdf = null;
let running = false;
let wakeLock = null;
const perf = { n: 0, ms: 0, max: 0, frames: 0, t0: 0 };
const log = [];
let cal = null; // {samples: []}
let seq = null; // {def, i, ok, wrong: [], miss}

const label = (m) => (m === MITTEL_C ? 'Mittel-C' : sciName(m));

async function start() {
  if (running) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    buf = new Float32Array(analyser.fftSize);
    nsdf = new Float32Array(1200);
    running = true;
    perf.t0 = performance.now();
    $('status').textContent = `Mikrofon an · ${ctx.sampleRate} Hz`;
    $('start').hidden = true;
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* nicht schlimm */ }
    requestAnimationFrame(frame);
  } catch (e) {
    $('status').textContent = 'Kein Mikrofon: ' + (e.message || e.name);
  }
}

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && running && !wakeLock) {
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* egal */ }
  }
  if (document.visibilityState === 'hidden') wakeLock = null;
});

function frame() {
  if (!running) return;
  analyser.getFloatTimeDomainData(buf);
  const t0 = performance.now();
  const p = detectPitch(buf, ctx.sampleRate, { nsdf });
  const level = rms(buf);
  const dt = performance.now() - t0;
  perf.n++; perf.ms += dt; perf.max = Math.max(perf.max, dt); perf.frames++;
  const f = { t: t0, rms: level, freq: p.freq, clarity: p.clarity };
  const ev = tracker.push(f);
  showLive(f);
  if (cal) calFrame(f);
  if (ev) onEvent(ev);
  requestAnimationFrame(frame);
}

function showLive(f) {
  const voiced = f.freq > 0 && f.clarity >= tracker.options.minClarity && f.rms >= tracker.gate;
  const lv = (x) => Math.min(100, Math.max(0, (Math.log10(Math.max(x, 1e-5)) + 4) * 25)); // -80 dB .. 0 dB
  $('level-bar').style.width = lv(f.rms) + '%';
  $('gate-mark').style.left = lv(tracker.gate) + '%';
  $('clarity').textContent = 'Klarheit ' + (f.clarity ? f.clarity.toFixed(2) : '–');
  if (!voiced) return;
  const { midi, cents } = nearest(f.freq, tracker.offset);
  $('note').textContent = noteName(midi);
  $('sci').textContent = `${label(midi)} · ${f.freq.toFixed(1)} Hz`;
  $('cents').textContent = `${cents > 0 ? '+' : ''}${cents.toFixed(0)} Cent`;
  const bar = $('cents-bar');
  const w = Math.min(50, Math.abs(cents));
  bar.style.width = w + '%';
  bar.style.left = cents < 0 ? 50 - w + '%' : '50%';
}

function onEvent(ev) {
  const entry = { t: Math.round(ev.t), midi: ev.midi, cents: Math.round(ev.cents), clarity: +ev.clarity.toFixed(2), rms: +ev.rms.toFixed(4), onset: ev.onset };
  if (seq && seq.i < seq.def.notes.length) {
    const want = seq.def.notes[seq.i];
    entry.want = want;
    entry.ok = ev.midi === want;
    if (entry.ok) {
      seq.ok++;
      seq.cents.push(ev.cents);
      (seq.perNote[ev.midi] ??= []).push(ev.cents);
      seq.i++;
      flash(`✓ ${noteName(ev.midi)}`, 'good');
    } else {
      const prev = seq.def.notes[seq.i - 1];
      seq.wrong.push({ got: ev.midi, want, maybeDouble: ev.midi === prev });
      flash(`gehört: ${noteName(ev.midi)} (${label(ev.midi)}), gesucht: ${noteName(want)}`, 'bad');
    }
    showSeq();
  }
  log.unshift(entry);
  if (log.length > 200) log.pop();
  const li = document.createElement('li');
  li.className = entry.ok === true ? 'ok' : entry.ok === false ? 'bad' : '';
  li.textContent = `${label(ev.midi)} ${entry.cents >= 0 ? '+' : ''}${entry.cents} ct · Kl ${entry.clarity} · ${ev.onset ? 'Anschlag' : 'Wechsel'}`;
  $('log').prepend(li);
  while ($('log').children.length > 30) $('log').lastChild.remove();
}

let flashTimer = 0;
function flash(text, cls) {
  const el = $('flash');
  el.textContent = text;
  el.className = 'small ' + cls;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { el.textContent = ' '; }, 1800);
}

// --- Kalibrierung ---------------------------------------------------------
function calStart() {
  if (!running) return flash('Erst das Mikrofon starten', 'bad');
  cal = { samples: [], t0: performance.now() };
  $('cal-out').textContent = 'Hört zu … spiel jetzt das Mittel-C, mehrmals.';
}
function calFrame(f) {
  if (f.freq <= 0 || f.clarity < 0.9 || f.rms < tracker.gate) return calTimeout();
  const c = 1200 * Math.log2(f.freq / 261.6256);
  if (Math.abs(c) > 150) return calTimeout(); // ein anderer Ton
  cal.samples.push({ freq: f.freq, midi: MITTEL_C });
  $('cal-out').textContent = `Hört zu … ${Math.min(100, Math.round(cal.samples.length / 1.2))} %`;
  if (cal.samples.length >= 120) calDone();
}
function calTimeout() {
  if (performance.now() - cal.t0 > 30000) {
    cal = null;
    $('cal-out').textContent = 'Kein Mittel-C gehört. Näher ans Klavier oder lauter spielen, dann noch einmal.';
  }
}
function calDone() {
  const off = calibrate(cal.samples);
  cal = null;
  store.offset = Math.round(off * 10) / 10;
  tracker.setOffset(store.offset);
  save();
  showCal();
}
function showCal() {
  const o = store.offset;
  const dir = o < 0 ? 'zu tief' : 'zu hoch';
  let txt = `Verstimmung: ${o > 0 ? '+' : ''}${o.toFixed(1)} Cent (${Math.abs(o) < 3 ? 'fast genau' : dir})`;
  if (Math.abs(o) > 50) txt += ' · stark verstimmt, Stimmen lohnt sich, die App kommt aber damit klar';
  $('cal-out').textContent = txt;
}

// --- Treffertest -----------------------------------------------------------
function seqStart(id) {
  const def = SEQS.find((s) => s.id === id) || SEQS[0];
  seq = { def, i: 0, ok: 0, wrong: [], miss: 0, cents: [], perNote: {}, t0: Date.now() };
  showSeq();
}
function seqStore() {
  if (!seq || (!seq.ok && !seq.wrong.length && !seq.miss)) return;
  store.results[seq.def.id] = {
    done: seq.i >= seq.def.notes.length,
    notes: seq.def.notes.length,
    ok: seq.ok,
    wrong: seq.wrong.length,
    doubles: seq.wrong.filter((w) => w.maybeDouble).length,
    miss: seq.miss,
    wrongNotes: seq.wrong.map((w) => `${sciName(w.want)}->${sciName(w.got)}`),
    perNote: Object.fromEntries(Object.entries(seq.perNote).map(([m, cs]) => [sciName(+m), Math.round(median(cs))])),
  };
  save();
}
function showSeq() {
  const { def, i } = seq;
  const done = i >= def.notes.length;
  $('target').textContent = done ? 'Geschafft!' : noteName(def.notes[i]);
  $('target-sci').textContent = done ? '' : label(def.notes[i]);
  const line = $('seq-line');
  line.replaceChildren(
    ...def.notes.map((m, k) => {
      const s = document.createElement('span');
      s.textContent = noteName(m);
      s.className = k < i ? 'done' : k === i ? 'now' : '';
      return s;
    }),
  );
  const extra = seq.wrong.filter((w) => w.maybeDouble).length;
  $('stats').innerHTML =
    `Richtig <b>${seq.ok}</b> von ${def.notes.length} · falsch gehört <b>${seq.wrong.length}</b>` +
    (extra ? ` (davon ${extra} vermutlich doppelt)` : '') +
    ` · nicht erkannt <b>${seq.miss}</b>`;
  seqStore();
}

const median = (a) => {
  const s = a.slice().sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

// --- Bericht ---------------------------------------------------------------
function report() {
  const lines = [
    'Inselmelodie Mikrofon-Probe',
    `Datum: ${new Date().toISOString()}`,
    `Gerät: ${navigator.userAgent}`,
    `Abtastrate: ${ctx ? ctx.sampleRate : '-'} Hz`,
    `Verstimmung (Kalibrierung): ${store.offset} Cent`,
    `Grundrauschen RMS: ${tracker.floor.toExponential(2)}, Tor: ${tracker.gate.toExponential(2)}`,
    `Einstellungen: ${JSON.stringify(store.settings)}`,
    `Rechenzeit je Fenster: ${perf.n ? (perf.ms / perf.n).toFixed(2) : '-'} ms (max ${perf.max.toFixed(1)}), Bilder/s: ${perf.n ? ((perf.frames * 1000) / (performance.now() - perf.t0)).toFixed(0) : '-'}`,
    '',
    'Treffertests:',
  ];
  for (const s of SEQS) {
    const r = store.results[s.id];
    if (!r) continue;
    lines.push(`- ${s.name}: richtig ${r.ok}/${r.notes}${r.done ? '' : ' (abgebrochen)'}, falsch ${r.wrong} (doppelt? ${r.doubles}), nicht erkannt ${r.miss}`);
    if (r.wrongNotes.length) lines.push(`  falsch: ${r.wrongNotes.join(', ')}`);
    lines.push(`  Abweichung je Note (Cent nach Kalibrierung): ${Object.entries(r.perNote).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  }
  lines.push('', 'Letzte Meldungen (neueste zuerst):');
  for (const e of log.slice(0, 40)) {
    lines.push(`  ${sciName(e.midi)} ${e.cents}ct kl ${e.clarity} rms ${e.rms} ${e.onset ? 'A' : 'W'}${e.want !== undefined ? (e.ok ? ' ok' : ' FALSCH statt ' + sciName(e.want)) : ''}`);
  }
  return lines.join('\n');
}
async function copyReport() {
  const text = report();
  const ta = $('report-text');
  ta.value = text;
  ta.hidden = false;
  try {
    await navigator.clipboard.writeText(text);
    flash('Bericht kopiert – einfach in den Chat einfügen', 'good');
  } catch {
    ta.select();
    flash('Kopieren ging nicht automatisch: Text unten markieren und kopieren', 'bad');
  }
}

// --- Einstellungen ---------------------------------------------------------
function bindSlider(id, key) {
  const el = $(id);
  const out = el.nextElementSibling;
  el.value = store.settings[key];
  out.textContent = ' ' + el.value;
  el.addEventListener('input', () => {
    store.settings[key] = +el.value;
    out.textContent = ' ' + el.value;
    tracker = createTracker({ ...store.settings, offsetCents: store.offset });
    save();
  });
}

// --- Start -----------------------------------------------------------------
for (const s of SEQS) {
  const o = document.createElement('option');
  o.value = s.id;
  o.textContent = s.name;
  $('seq').append(o);
}
$('start').addEventListener('click', start);
$('cal').addEventListener('click', calStart);
$('seq').addEventListener('change', (e) => seqStart(e.target.value));
$('restart').addEventListener('click', () => seqStart($('seq').value));
$('miss').addEventListener('click', () => { if (seq) { seq.miss++; showSeq(); } });
$('report').addEventListener('click', copyReport);
bindSlider('s-gate', 'gateFloor');
bindSlider('s-clar', 'minClarity');
bindSlider('s-onset', 'onsetRatio');
if (store.offset) showCal();
seqStart('scale');

window.__probe = { get log() { return log; }, get seq() { return seq; }, get offset() { return store.offset; }, report };
