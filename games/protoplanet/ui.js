// Oberflaeche: Levelauswahl, Spielbildschirm (Canvas + Kopfleiste), Auftakt, Pausenmenue, Verlust, Sieg-Karte, Einstellungen.
// Paket F (Spielgefuehl): Phasen eines Levels = intro (Uebersicht -> Fahrt zum Spieler, Physik steht) | play | win (Zeitlupe, Lichtwelle, Abblenden, Ergebnis-Karte)
// | loss (Zeit bremst, Abdunkeln, dann Dialog) | rewind (sichtbarer Rueckwaertslauf). Alles Darstellung: die Physik laeuft nur in `play`, Kopien (`ghost`) nur zum Anschauen.
import { h, txt, setCls, setStyle, svgIcon } from '../../engine/ui/dom.js';
import { openModal, confirmDialog } from '../../engine/ui/modal.js';
import { createToaster } from '../../engine/ui/toast.js';
import { T } from './tune.js';
import { LEVELS, CHAPTERS, levelById, nextLevel } from './levels.js';
import { createPlay } from './play.js';
import { buildLevel } from './gen.js';
import { goalText, goalExplain, goalCounter, starsFor, fmtMass } from './goals.js';
import { createCamera, updateCamera, pinchStart, pinchMove, pinchEnd, screenToWorld, introCamera } from './camera.js';
import { createRenderer, createAmbient } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createFx, blendWorlds } from './fx.js';
import { step as physStep, snapshot, restore } from './physics.js';
import { predictOrbit, driftState } from './orbit.js';
import { dangerOf, sizeOf } from './audio-score.js';
import { dateKey, dailyLevel } from './daily.js';
import { fogOf, fogRadius, fogGlimmers, fogHints, fogIntro } from './fog.js';

const ICON = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  hub: '<path d="M4 11l8-7 8 7M6 10v9h12v-9"/>',
  sound: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
  muted: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  lock: '<rect x="6" y="11" width="12" height="9" rx="2"/><path d="M9 11V8a3 3 0 0 1 6 0v3"/>',
  play: '<path d="M8 5.5v13l11-6.5z"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  flame: '<path d="M12 3c.8 3.2 5 5.3 5 10a5 5 0 0 1-10 0c0-2 .9-3.1 2-4 .1 1.7.9 2.6 2 2.8C10.5 8.6 11 6 12 3z"/>',
  // Ziel-Symbole (Kopfzeile): je Zieltyp ein eigenes
  absorb: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  last: '<circle cx="12" cy="12" r="5.5"/><circle cx="4.5" cy="5.5" r="1.1"/><circle cx="19.5" cy="6.5" r="1.1"/><circle cx="18.5" cy="19" r="1.1"/>',
  largest: '<path d="M5 17.5l7-11 7 11"/><path d="M8.5 21h7"/>',
  mass: '<circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="8.5"/>',
};
const TIME_LABEL = { 0.25: '×¼', 1: '×1', 4: '×4', 10: '×10' };

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const starText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
const smooth = (u) => {
  const x = Math.max(0, Math.min(1, u));
  return x * x * (3 - 2 * x);
};
const worldOf = (ch) => T.worlds[ch] || T.worlds[1];

export function mountApp(root, progress) {
  const toasts = h('div', { class: 'pp-toasts' });
  const toast = createToaster(toasts, { max: 2 });

  /* ---------- Gerüst ---------- */
  const ambientCv = h('canvas', { class: 'pp-ambient', 'aria-hidden': 'true' });
  const selectEl = h('section', { class: 'pp-select', 'aria-label': 'Levelauswahl' });
  const canvas = h('canvas', { class: 'pp-canvas', 'aria-label': 'Spielfeld' });
  const backBtn = h('button', { class: 'pp-icon-btn', type: 'button', 'aria-label': 'Zurück zur Levelauswahl' }, svgIcon(ICON.back));
  const pauseBtn = h('button', { class: 'pp-icon-btn', type: 'button', 'aria-label': 'Pause' }, svgIcon(ICON.pause));
  const goalIco = h('span', { class: 'pp-goal-ico', 'aria-hidden': 'true' });
  const goalTxt = h('div', { class: 'pp-goal-text' });
  const goalPct = h('span', { class: 'pp-goal-pct num' });
  const barFill = h('div', { class: 'pp-bar-fill' });
  const bar = h('header', { class: 'pp-bar' }, backBtn, h('div', { class: 'pp-goal' }, h('div', { class: 'pp-goal-head' }, goalIco, goalTxt), h('div', { class: 'pp-goal-row' }, h('div', { class: 'pp-bar-track' }, barFill), goalPct)), pauseBtn);
  const helpEl = h('div', { class: 'pp-help', hidden: true });
  const massVal = h('span', { class: 'pp-mass-val' });
  const massDelta = h('span', { class: 'pp-mass-delta', 'aria-hidden': 'true' });
  const massEl = h('div', { class: 'pp-mass' }, massVal, massDelta);
  const timeBtn = h('button', { class: 'pp-time', type: 'button', 'aria-label': 'Zeitstufe' }, '×1');
  const warnEl = h('div', { class: 'pp-warn', hidden: true, role: 'status' }, 'Zu weit draußen');
  const titleN = h('div', { class: 'pp-title-n' });
  const titleH = h('h2', { class: 'pp-title-h' });
  const titleG = h('p', { class: 'pp-title-g' });
  const titleEl = h('div', { class: 'pp-title', 'aria-hidden': 'true' }, titleN, titleH, titleG);
  const resumeEl = h('div', { class: 'pp-tapresume', hidden: true }, 'Tippe, um weiterzuspielen');
  const skipEl = h('div', { class: 'pp-skip', hidden: true }, 'Tippen zum Überspringen');
  const endEl = h('div', { class: 'pp-end', hidden: true });
  const gameEl = h('section', { class: 'pp-game', hidden: true }, canvas, bar, titleEl, helpEl, warnEl, resumeEl, skipEl, massEl, timeBtn, endEl);
  const veil = h('div', { class: 'pp-veil', 'aria-hidden': 'true' });
  root.append(ambientCv, selectEl, gameEl, toasts, veil);

  const renderer = createRenderer(canvas);
  const ambient = createAmbient(ambientCv);
  const resizeAll = () => {
    renderer.resize();
    ambient.resize();
  };
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => resizeAll());
    ro.observe(canvas);
    ro.observe(ambientCv);
  }
  addEventListener('resize', resizeAll);

  /* ---------- Zustand ---------- */
  let screen = 'select';
  let phase = 'play'; // intro | play | win | loss | rewind
  let phaseT0 = 0;
  let level = null;
  let play = null;
  let cam = createCamera();
  let fx = createFx({ seed: 11 });
  let paused = false;
  let pauseModal = null;
  let endShown = false;
  let timeIdx = 1;
  let pointer = null;
  let beamUsed = false;
  let timeChanged = false;
  let lastTs = 0;
  let frame = 0;
  let emaDt = 1 / 60;
  let slow = false;
  let slowSince = 0;
  let lastAbsorbed = 0;
  let lastVibe = 0;
  let hintGone = false;
  // Auftakt
  let ip = 0; // Fortschritt 0..1
  let introRate = 1;
  let introEndAt = -Infinity;
  let titleTimer = 0;
  // Sieg / Verlust / Zurückspulen (nur Darstellung)
  let ghost = null;
  let ghostAcc = 0;
  let winData = null;
  let cardShown = false;
  let endToken = 0;
  let rewindFrames = null;
  let tapResume = false;
  let lastPlayerPos = null;
  let lastDangerVibe = -Infinity;
  let beamVibed = false;
  // Kapitel 4: Nebel (fog.js), Glimmen mit Glaettung je Koerper
  let fogCfg = null;
  let fogK = new Map();
  let fogRaw = [];
  let introK = 1;
  let lastGlimSnd = -Infinity;
  // Kapitel 3: Bahnvorschau (orbit.js) und Abdrift-Warnung
  let preview = null;
  let previewAt = -Infinity;
  let previewEj = -1;
  let warn = 0;
  let warnShown = false;
  let lastWarnSnd = -Infinity;
  const previewStats = { n: 0, ms: 0, max: 0 }; // Kosten der Vorschau (Messung fuer docs)
  const frameStats = { n: 0, ms: 0, max: 0 }; // Zeichenkosten (Messung fuer docs)
  // Masse-Anzeige: kurz eingeblendete Aenderung (Ausstoss rot, Absorbieren gruen), gleiche Vorzeichen innerhalb des Fensters werden summiert
  let lastMass = null;
  let deltaAcc = 0;
  let deltaAt = -Infinity;
  const DELTA_SHOW = 1.1; // s

  const modals = new Set();
  const modal = (opts) => {
    const user = opts.onClose;
    const m = openModal({
      ...opts,
      onClose: () => {
        modals.delete(m);
        if (user) user();
      },
    });
    modals.add(m);
    return m;
  };
  const closeAllModals = () => [...modals].forEach((m) => m.close());

  const settings = () => progress.settings;
  const audio = createAudio({ settings });
  let lastEjects = 0;
  let lastGained = 0;
  const syncAudioCounters = () => {
    const st = play.world.stats;
    lastAbsorbed = st.absorbed;
    lastEjects = st.ejects;
    lastGained = st.gained;
  };
  const hintText = (hint) => (settings().aim && hint.textAim) || hint.text;
  const reduceMotion = () => {
    const v = settings().reduceMotion;
    if (v != null) return !!v;
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  };
  /** Haptik: `pat` = Millisekunden oder Muster; kurze Impulse werden gedrosselt, selten gewollte (Gefahr) vom Aufrufer. */
  const vibe = (pat) => {
    if (!settings().vibrate) return;
    const t = performance.now();
    const len = Array.isArray(pat) ? 99 : pat;
    if (len < 60 && t - lastVibe < 150) return;
    lastVibe = t;
    try {
      if (navigator.vibrate) navigator.vibrate(pat);
    } catch {
      /* ohne Wirkung (z. B. iOS) */
    }
  };
  const accentFor = (ch) => {
    const a = worldOf(ch).accent;
    document.documentElement.style.setProperty('--accent', a);
  };

  /** Weicher Wechsel zwischen Bildschirmen: kurz abblenden, dann wechseln, dann wieder aufblenden. */
  function go(fn) {
    if (reduceMotion()) return fn();
    veil.classList.add('on');
    setTimeout(() => {
      fn();
      requestAnimationFrame(() => requestAnimationFrame(() => veil.classList.remove('on')));
    }, 170);
  }

  function persist() {
    if (screen === 'game' && play) {
      progress.setSnap(play.status === 'running' && phase !== 'rewind' && !level.daily ? { levelId: level.id, rev: level.rev || 1, play: play.serialize(), timeScale: play.timeScale } : null);
    }
    progress.save();
  }

  /* ---------- Ton ---------- */
  /** Lautsprecher-Knopf (Ton an/aus), in der Levelauswahl und im Pausenmenue; `label` = Text neben dem Symbol. */
  function soundButton(label = false) {
    const btn = h('button', { class: 'pp-icon-btn pp-sound' + (label ? ' wide' : ''), type: 'button' });
    const sync = () => {
      const off = !!settings().mute;
      btn.replaceChildren(svgIcon(off ? ICON.muted : ICON.sound), ...(label ? [h('span', { text: off ? 'Ton aus' : 'Ton an' })] : []));
      btn.setAttribute('aria-label', off ? 'Ton einschalten' : 'Ton ausschalten');
      btn.setAttribute('aria-pressed', off ? 'true' : 'false');
      btn.classList.toggle('off', off);
    };
    btn.addEventListener('click', () => {
      settings().mute = !settings().mute;
      progress.save();
      audio.refreshVolumes();
      document.querySelectorAll('.pp-sound').forEach((b) => b.dispatchEvent(new Event('pp-sync')));
    });
    btn.addEventListener('pp-sync', sync);
    sync();
    return btn;
  }
  // Der AudioContext darf erst nach einer Nutzergeste starten (iOS); danach weckt jede Geste ihn bei Bedarf wieder auf.
  for (const ev of ['pointerdown', 'touchend', 'keydown', 'click']) addEventListener(ev, () => audio.unlock(), { capture: true, passive: true });
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('.btn, .pp-icon-btn, .pp-tile, .pp-switch, .pp-hero')) audio.sfx.ui();
  }, true);
  document.addEventListener('visibilitychange', () => audio.visibility(document.visibilityState !== 'hidden'));

  /* ---------- Levelauswahl ---------- */
  function renderSelect() {
    selectEl.replaceChildren();
    accentFor('select');
    const snap = progress.state.snap;
    const head = h(
      'header',
      { class: 'pp-sel-head' },
      h('a', { class: 'pp-icon-btn', href: '../../', 'aria-label': 'Alle Spiele' }, svgIcon(ICON.hub)),
      h('h1', { text: 'Protoplanet' }),
      soundButton(),
      h('button', { class: 'pp-icon-btn', type: 'button', 'aria-label': 'Einstellungen', onClick: () => openSettings() }, svgIcon(ICON.gear)),
    );
    selectEl.append(head);
    // Weiter spielen: das laufende Level, sonst das naechste ungeloeste
    const res = progress.resumeLevel();
    const rl = res.level;
    const rw = worldOf(rl.chapter);
    selectEl.append(
      h(
        'button',
        { class: 'pp-hero', type: 'button', style: { '--ca': rw.accent, '--i': 0 }, onClick: () => go(() => openLevel(rl)) },
        h('span', { class: 'pp-hero-ico' }, svgIcon(ICON.play)),
        h(
          'span',
          { class: 'pp-hero-text' },
          h('b', { text: res.running ? 'Weiter spielen' : res.all ? 'Noch einmal spielen' : 'Weiter spielen' }),
          h('span', { text: `Level ${rl.id} · ${rl.title}${res.running ? ' · läuft' : ''}` }),
        ),
      ),
    );
    if (progress.dailyOpen()) selectEl.append(dailyCard());
    let idx = 1;
    for (const ch of CHAPTERS) {
      const lvls = LEVELS.filter((l) => l.chapter === ch.id);
      const cp = progress.chapterProgress(ch.id);
      const first = lvls[0];
      const chapterLocked = !progress.unlocked(first.id);
      const prevCp = chapterLocked ? progress.chapterProgress(ch.id - 1) : null;
      const w = worldOf(ch.id);
      const tiles = h('div', { class: 'pp-tiles' });
      for (const lv of lvls) {
        const open = progress.unlocked(lv.id);
        const stars = progress.stars(lv.id);
        const running = snap && snap.levelId === lv.id;
        tiles.append(
          h(
            'button',
            { class: 'pp-tile' + (open ? '' : ' locked') + (stars ? ' done' : ''), type: 'button', style: { '--i': idx++ }, 'aria-label': `Level ${lv.id} ${lv.title}${open ? '' : ' (gesperrt)'}`, onClick: () => (open ? go(() => openLevel(lv)) : openLevel(lv)) },
            h('span', { class: 'pp-tile-n', text: String(lv.n) }),
            h('span', { class: 'pp-tile-t', text: lv.title }),
            open ? h('span', { class: 'pp-tile-s', text: starText(stars) }) : h('span', { class: 'pp-tile-lock' }, svgIcon(ICON.lock)),
            running ? h('span', { class: 'pp-tile-run', text: 'läuft' }) : null,
          ),
        );
      }
      const meta = chapterLocked
        ? h('p', { class: 'pp-chapter-meta lock' }, svgIcon(ICON.lock), h('span', { text: `Öffnet sich, sobald du ${prevCp.need} Level in Kapitel ${ch.id - 1} geschafft hast (${prevCp.done} von ${prevCp.need}).` }))
        : h('p', { class: 'pp-chapter-meta', text: `${cp.done} von ${cp.total} geschafft · ★ ${cp.stars} von ${cp.total * 3}` });
      selectEl.append(
        h(
          'section',
          { class: 'pp-chapter' + (chapterLocked ? ' is-locked' : ''), style: { '--ca': w.accent, '--cb0': w.bg[0], '--cb1': w.bg[1], '--i': idx } },
          h('div', { class: 'pp-chapter-head' }, h('span', { class: 'pp-chapter-n', text: String(ch.id) }), h('h2', { text: ch.name })),
          meta,
          h('div', { class: 'pp-chapter-bar' }, h('div', { style: { width: Math.round((cp.done / cp.total) * 100) + '%' } })),
          tiles,
        ),
      );
    }
  }


  /* ---------- Tageslevel ---------- */
  let shownDay = null;
  function dailyCard() {
    const key = dateKey();
    shownDay = key;
    const lv = dailyLevel(key, progress.dailyStage());
    const goal = { ...(buildLevel(lv).goal || {}), ...lv.goal }; // Ziel mit Wert (Masse), wie es das Level zeigt
    const info = progress.dailyInfo(key);
    const w = worldOf(lv.chapter);
    const status = info.done ? `Heute geschafft · Bestzeit ${fmtTime(info.bestTime)} · ausgestoßen ${fmtMass(info.bestEject)}` : 'Heute noch nicht gespielt';
    return h(
      'button',
      { class: 'pp-daily' + (info.done ? ' done' : ''), type: 'button', style: { '--ca': w.accent, '--i': 1 }, 'aria-label': `Tageslevel ${lv.title}. ${goalText(goal)}. ${status}. Serie ${info.streak} Tage`, onClick: () => go(() => startLevel(dailyLevel(dateKey(), progress.dailyStage()), null)) },
      h('span', { class: 'pp-daily-ico' }, svgIcon(ICON.cal)),
      h(
        'span',
        { class: 'pp-daily-text' },
        h('span', { class: 'pp-daily-kicker', text: 'Tageslevel' }),
        h('b', { text: lv.title }),
        h('span', { class: 'pp-daily-goal', text: goalText(goal) }),
        h('span', { class: 'pp-daily-state', text: status }),
      ),
      h('span', { class: 'pp-daily-streak' + (info.streak ? '' : ' none'), 'aria-hidden': 'true' }, svgIcon(ICON.flame), h('b', { text: String(info.streak) })),
    );
  }
  // Wechsel um Mitternacht auch bei offener App: die Karte der Levelauswahl wird neu gebaut
  function dayCheck() {
    if (screen === 'select' && progress.dailyOpen() && shownDay && shownDay !== dateKey()) renderSelect();
  }
  setInterval(dayCheck, 20000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && dayCheck());

  function enterSelectScreen() {
    closePauseModal();
    endToken++;
    screen = 'select';
    play = null;
    ghost = null;
    rewindFrames = null;
    audio.setPaused(false);
    audio.setScene('select');
    audio.update({ danger: 0, size: 0, timeScale: 1, lift: 0 });
    gameEl.hidden = true;
    ambientCv.hidden = false;
    selectEl.hidden = false;
    document.body.classList.remove('pp-playing');
    resizeAll();
    renderSelect();
    selectEl.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function showSelect() {
    persist();
    enterSelectScreen();
  }

  function openLevel(lv) {
    if (!progress.unlocked(lv.id)) {
      toast(lockMessage(lv), { kind: 'warn' });
      return;
    }
    const snap = progress.state.snap;
    if (snap && snap.levelId === lv.id) startLevel(lv, snap);
    else startLevel(lv, null);
  }

  function lockMessage(lv) {
    const i = LEVELS.findIndex((l) => l.id === lv.id);
    const prev = LEVELS[i - 1];
    if (prev && prev.chapter !== lv.chapter) {
      const cp = progress.chapterProgress(prev.chapter);
      return `Schaffe ${cp.need} Level in Kapitel ${prev.chapter} (${cp.done} von ${cp.need}).`;
    }
    return `Schließe zuerst Level ${prev ? prev.id : ''} ab.`;
  }

  /* ---------- Spielbildschirm ---------- */
  function startLevel(lv, snap) {
    closePauseModal();
    closeAllModals();
    endToken++;
    level = lv;
    try {
      play = createPlay(lv, snap ? snap.play : null);
    } catch {
      snap = null; // beschaedigter Schnappschuss: das Level neu beginnen
      play = createPlay(lv, null);
    }
    play.invert = !settings().aim;
    play.timeScale = snap && snap.timeScale ? snap.timeScale : 1;
    timeIdx = Math.max(0, T.timeSteps.indexOf(play.timeScale));
    cam = createCamera();
    fogCfg = fogOf(lv);
    fogK = new Map();
    introK = 1;
    fx = createFx({ reduce: reduceMotion(), seed: 11 + lv.n * 7 });
    ghost = null;
    rewindFrames = null;
    winData = null;
    cardShown = false;
    tapResume = false;
    paused = false;
    endShown = false;
    beamUsed = false;
    timeChanged = false;
    beamVibed = false;
    lastPlayerPos = null;
    lastDangerVibe = -Infinity;
    pointer = null;
    syncAudioCounters();
    audio.setPaused(false);
    audio.setScene(lv.chapter);
    audio.update({ danger: 0, size: sizeOf(play.world.player ? play.world.player.m : 1), timeScale: play.timeScale, lift: 0 });
    hintGone = false;
    preview = null;
    previewAt = -Infinity;
    previewEj = -1;
    warn = 0;
    warnShown = false;
    setCls(warnEl, 'lose', false);
    warnEl.hidden = true;
    resetMassDelta();
    screen = 'game';
    selectEl.hidden = true;
    ambientCv.hidden = true;
    gameEl.hidden = false;
    document.body.classList.add('pp-playing');
    accentFor(lv.chapter);
    gameEl.dataset.chapter = String(lv.chapter);
    if (!snap) progress.setSnap(null);
    endEl.hidden = true;
    endEl.classList.remove('in');
    resumeEl.hidden = true;
    renderer.resize();
    helpEl.textContent = lv.hint ? hintText(lv.hint) : '';
    helpEl.hidden = !lv.hint;
    setCls(helpEl, 'gone', false);
    goalIco.replaceChildren(svgIcon(ICON[play.goal.type] || ICON.mass));
    titleN.textContent = lv.daily ? `Tageslevel · ${CHAPTERS.find((c) => c.id === lv.chapter).name}` : `Level ${lv.id} · ${CHAPTERS.find((c) => c.id === lv.chapter).name}`;
    titleH.textContent = lv.title;
    titleG.textContent = goalText(play.goal);
    clearTimeout(titleTimer);
    setCls(titleEl, 'show', false);
    setCls(titleEl, 'away', false);
    lastTs = 0;
    hud();
    if (snap) {
      phase = 'play';
      pause(); // ein gesichertes Level wird pausiert fortgesetzt
    } else beginIntro();
  }

  /** Auftakt: Uebersicht der ganzen Welt, dann weiche Fahrt auf den Spieler. Die Physik steht, bis er zu Ende ist (oder getippt wird). */
  function beginIntro() {
    phase = 'intro';
    ip = 0;
    const reduce = reduceMotion();
    const dur = reduce ? T.intro.reduced : play.world.arenaR <= 0 ? T.intro.orbitDur : T.intro.dur;
    introRate = 1 / dur;
    introEndAt = -Infinity;
    audio.sfx.levelStart();
    skipEl.hidden = false;
    titleEl.classList.remove('away');
    void titleEl.offsetWidth; // Neustart der CSS-Animation
    titleEl.classList.add('show');
    introCamera(cam, play.world, reduce ? 1 : 0, !!fogCfg);
  }

  function endIntro(now) {
    phase = 'play';
    introEndAt = now;
    skipEl.hidden = true;
    lastTs = 0;
    clearTimeout(titleTimer);
    titleTimer = setTimeout(() => titleEl.classList.add('away'), reduceMotion() ? 500 : T.intro.titleHold * 1000);
  }

  function skipIntro() {
    if (phase !== 'intro') return;
    introRate = Math.max(introRate, (1 - ip) / 0.28);
  }

  function resetMassDelta() {
    lastMass = null;
    deltaAcc = 0;
    deltaAt = -Infinity;
    setCls(massDelta, 'show', false);
  }

  /** Pro Bild: Massenaenderung des Spielers erfassen und die Anzeige ein-/ausblenden. */
  function trackMass(now) {
    const p = play.world.player;
    if (p) {
      if (lastMass != null) {
        const d = p.m - lastMass;
        if (Math.abs(d) > 1e-5) {
          if (now - deltaAt > DELTA_SHOW || Math.sign(d) !== Math.sign(deltaAcc)) deltaAcc = 0;
          deltaAcc += d;
          deltaAt = now;
          txt(massDelta, (deltaAcc > 0 ? '+' : '−') + fmtMass(Math.abs(deltaAcc)));
          setCls(massDelta, 'neg', deltaAcc < 0);
          setCls(massDelta, 'pos', deltaAcc > 0);
          setCls(massDelta, 'show', true);
        }
      }
      lastMass = p.m;
    }
    if (now - deltaAt > DELTA_SHOW) setCls(massDelta, 'show', false);
  }

  function closePauseModal() {
    if (pauseModal) {
      const m = pauseModal;
      pauseModal = null;
      m.close();
    }
  }

  function pause() {
    if (screen !== 'game' || !play) return;
    paused = true;
    input.cancel();
    play.setBeam(null);
    persist();
    if (play.status !== 'running' || pauseModal || phase === 'rewind') return;
    audio.setPaused(true);
    let leaving = false;
    pauseModal = modal({
      title: 'Pausiert',
      body: h('div', {}, h('p', { class: 'muted', text: level.daily ? `Tageslevel · ${level.title}` : `Level ${level.id} · ${level.title}` }), h('p', { text: goalText(play.goal) }), h('p', { class: 'muted small', text: goalExplain(play.goal) }), h('div', { class: 'pp-sound-row' }, soundButton(true))),
      dismissible: true,
      onClose: () => {
        pauseModal = null;
        if (!leaving) resume();
      },
      actions: [
        { label: 'Weiter', kind: 'primary' },
        {
          label: 'Neu starten',
          onClick: () => {
            leaving = true;
            setTimeout(() => go(() => startLevel(level, null)), 0);
          },
        },
        {
          label: 'Levelauswahl',
          onClick: () => {
            leaving = true;
            setTimeout(() => go(showSelect), 0);
          },
        },
        {
          label: 'Einstellungen',
          kind: 'ghost',
          onClick: () => {
            openSettings();
            return false;
          },
        },
      ],
    });
  }

  function resume() {
    if (!play || play.status !== 'running') return;
    paused = false;
    tapResume = false;
    resumeEl.hidden = true;
    lastTs = 0;
    audio.setPaused(false);
  }

  /* ---------- Verlust ---------- */
  function onLoss(now) {
    endShown = true;
    phase = 'loss';
    phaseT0 = now;
    vibe(T.fx.vibe.loss);
    audio.sfx.swallowed();
    audio.update({ lift: -1, danger: 0 });
    persist();
    ghost = restore(snapshot(play.world));
    ghostAcc = 0;
    if (lastPlayerPos) fx.ring(lastPlayerPos.x, lastPlayerPos.y, lastPlayerPos.r, lastPlayerPos.r * 5, 0.9, 1, 1.3);
  }

  function showLossDialog() {
    const left = play.rewindsLeft;
    const cause = play.world.lostTo;
    const lossTitle = cause === 'attractor' ? 'In den Stern gestürzt' : cause === 'planet' ? 'Vom Planeten verschluckt' : cause === 'drift' ? 'Abgetrieben' : 'Absorbiert';
    const lossText = cause === 'planet' ? 'Ein Planet hat dich berührt. Die Vorschau rechnet die Planeten auf ihren Bahnen mit und färbt sich rot, wenn dein Weg einen trifft.' : cause === 'attractor' ? 'Deine Bahn hat den Protostern berührt. Die Vorschau färbt sich rot, wenn die Bahn im Stern endet.' : cause === 'drift' ? 'Du bist zu weit vom Protostern weggetrieben. Die Vorschau warnt, wenn die Bahn hinausführt.' : 'Ein größerer Körper hat dich absorbiert.';
    modal({
      title: lossTitle,
      body: h(
        'div',
        {},
        h('p', { text: lossText }),
        left > 0
          ? h('p', { class: 'muted small', text: `Zurückspulen setzt dich ${T.rewindBack} Sekunden zurück und kostet den Effizienz-Stern dieses Versuchs.` })
          : h('p', { class: 'muted small', text: 'Du hast keine Versuche zum Zurückspulen mehr.' }),
      ),
      dismissible: false,
      actions: [
        ...(left > 0
          ? [
              {
                label: `Zurückspulen (noch ${left})`,
                kind: 'primary',
                onClick: () => setTimeout(startRewind, 0),
              },
            ]
          : []),
        { label: 'Neu starten', kind: left > 0 ? '' : 'primary', onClick: () => setTimeout(() => go(() => startLevel(level, null)), 0) },
        { label: 'Levelauswahl', kind: 'ghost', onClick: () => setTimeout(() => go(showSelect), 0) },
      ],
    });
  }

  /** Zurückspulen: die Welt springt nicht, die letzten Sekunden laufen sichtbar rückwärts (Schnappschüsse, gemischt). */
  function startRewind() {
    const frames = play.rewind.peek(play.world.t); // vor doRewind (das kappt den Puffer)
    closeAllModals();
    if (!play.doRewind()) return;
    ghost = null;
    endShown = false;
    syncAudioCounters();
    audio.sfx.rewind();
    audio.update({ lift: 0 });
    resetMassDelta();
    fx.clear();
    paused = true; // keine Eingabe waehrend des Rueckwaertslaufs
    if (reduceMotion() || frames.length < 2) {
      finishRewind();
      return;
    }
    rewindFrames = frames.map((s) => restore(s));
    phase = 'rewind';
    phaseT0 = performance.now() / 1000;
  }

  function finishRewind() {
    phase = 'play';
    rewindFrames = null;
    tapResume = true;
    resumeEl.hidden = false;
    lastTs = 0;
  }

  /* ---------- Sieg ---------- */
  function onWin(now) {
    endShown = true;
    phase = 'win';
    phaseT0 = now;
    cardShown = false;
    vibe(T.fx.vibe.win);
    audio.sfx.win();
    audio.update({ lift: 1, danger: 0 });
    const r = play.result;
    if (level.daily) {
      // Tageslevel: keine Sterne, nur Bestwerte des Tages und die Serie (Datum = der Tag, fuer den das Level gestartet wurde)
      const fresh = progress.recordDaily(level.dateKey, { time: r.time, ejected: r.ejected });
      progress.setSnap(null);
      progress.save();
      winData = { r, st: { count: 0 }, fresh, info: progress.dailyInfo(level.dateKey), daily: true };
    } else winData = null;
    const st = level.daily ? null : starsFor(level, r);
    const wasOpen = LEVELS.map((l) => progress.unlocked(l.id));
    const fresh = level.daily ? null : progress.record(level.id, { time: r.time, ejected: r.ejected, eff: st.eff, fast: st.fast });
    if (!level.daily) progress.setSnap(null);
    progress.save();
    const newly = LEVELS.findIndex((l, i) => !wasOpen[i] && progress.unlocked(l.id));
    if (!level.daily) winData = { r, st, fresh, info: progress.info(level.id), newChapter: newly >= 0 && LEVELS[newly].chapter !== level.chapter ? LEVELS[newly].chapter : 0 };
    const reduce = reduceMotion();
    ghost = reduce ? null : restore(snapshot(play.world));
    ghostAcc = 0;
    const p = play.world.player;
    if (p) {
      const rp = Math.sqrt(p.m);
      fx.ring(p.x, p.y, rp, cam.half * 1.4, T.fx.winWaveT, 3, 1.5);
      fx.ring(p.x, p.y, rp, cam.half * 0.8, T.fx.winWaveT * 0.8, 0, 1);
      fx.burst(p.x, p.y, rp, 26, 3, 2.4);
    }
    cam.baseHalf = cam.half;
  }

  function showDailyResult(token) {
    const { r, fresh, info } = winData;
    endEl.replaceChildren(
      h(
        'div',
        { class: 'pp-endcard' },
        h('div', { class: 'pp-end-sub', text: `Tageslevel · ${level.title}` }),
        h('h2', { class: 'pp-end-title', text: fresh.first ? 'Tageslevel geschafft' : 'Geschafft' }),
        h('div', { class: 'pp-daily-streak big' + (info.streak ? '' : ' none'), 'aria-label': `Serie ${info.streak} Tage` }, svgIcon(ICON.flame), h('b', { text: String(info.streak) }), h('span', { text: info.streak === 1 ? 'Tag in Folge' : 'Tage in Folge' })),
        h(
          'div',
          { class: 'pp-result-stats' },
          h('div', {}, h('span', { class: 'muted', text: 'Zeit' }), h('b', { text: fmtTime(r.time) }), h('span', { class: 'muted small', text: `Bestzeit heute ${fmtTime(info.bestTime)}${fresh.time && !fresh.first ? ' (neu)' : ''}` })),
          h('div', {}, h('span', { class: 'muted', text: 'Ausgestoßen' }), h('b', { text: fmtMass(r.ejected) }), h('span', { class: 'muted small', text: `Bestwert heute ${fmtMass(info.bestEject)}${fresh.eject && !fresh.first ? ' (neu)' : ''}` })),
        ),
        h('p', { class: 'pp-fin-line muted', text: 'Morgen wartet ein neues Level auf dich.' }),
        h('div', { class: 'pp-end-actions' }, h('button', { class: 'btn btn-primary btn-big', type: 'button', onClick: () => go(showSelect) }, 'Levelauswahl'), h('div', { class: 'pp-end-row' }, h('button', { class: 'btn', type: 'button', onClick: () => go(() => startLevel(level, null)) }, 'Nochmal'))),
      ),
    );
    endEl.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => endEl.classList.add('in')));
    setTimeout(() => token === endToken && (audio.sfx.star({ i: 2 }), vibe(14)), reduceMotion() ? 0 : 500);
  }

  function showResultCard() {
    if (cardShown) return;
    cardShown = true;
    const token = ++endToken;
    if (winData.daily) return showDailyResult(token);
    const { r, st, fresh, info, newChapter } = winData;
    const nxt0 = nextLevel(level.id);
    const nxt = nxt0 && progress.unlocked(nxt0.id) ? nxt0 : null;
    const need = (ok, text) => (ok ? null : h('span', { class: 'pp-need', text }));
    const rows = [
      h('li', { class: 'ok' }, h('span', { class: 'pp-star', text: '★' }), h('span', { class: 'pp-row-t' }, h('b', { text: 'Geschafft' }), fresh.first ? h('span', { class: 'pp-new', text: 'neu' }) : null)),
      h(
        'li',
        { class: st.eff ? 'ok' : 'no' },
        h('span', { class: 'pp-star', text: st.eff ? '★' : '☆' }),
        h('span', { class: 'pp-row-t' }, h('b', { text: 'Effizienz' }), h('span', { class: 'muted', text: ` höchstens ${fmtMass(level.targets.eject)} ausgestoßen` }), need(st.eff, r.rewound ? 'Ohne Zurückspulen in diesem Versuch möglich.' : `Du: ${fmtMass(r.ejected)}, also ${fmtMass(r.ejected - level.targets.eject)} zu viel.`)),
      ),
      h(
        'li',
        { class: st.fast ? 'ok' : 'no' },
        h('span', { class: 'pp-star', text: st.fast ? '★' : '☆' }),
        h('span', { class: 'pp-row-t' }, h('b', { text: 'Zeit' }), h('span', { class: 'muted', text: ` höchstens ${fmtTime(level.targets.time)}` }), need(st.fast, `Du: ${fmtTime(r.time)}, also ${Math.ceil(r.time - level.targets.time)} s zu langsam.`)),
      ),
    ];
    const starEls = [0, 1, 2].map((i) => h('span', { class: 'pp-bigstar' + (i < st.count ? ' lit' : ''), text: i < st.count ? '★' : '☆' }));
    endEl.replaceChildren(
      h(
        'div',
        { class: 'pp-endcard' },
        h('div', { class: 'pp-end-sub', text: `Level ${level.id} · ${level.title}` }),
        h('h2', { class: 'pp-end-title', text: 'Geschafft' }),
        h('div', { class: 'pp-result-stars', 'aria-label': `${st.count} von 3 Sternen` }, ...starEls),
        h('ul', { class: 'pp-result-list' }, ...rows),
        h(
          'div',
          { class: 'pp-result-stats' },
          h('div', {}, h('span', { class: 'muted', text: 'Zeit' }), h('b', { text: fmtTime(r.time) }), h('span', { class: 'muted small', text: `Bestzeit ${fmtTime(info.bestTime)}${fresh.time ? ' (neu)' : ''}` })),
          h('div', {}, h('span', { class: 'muted', text: 'Ausgestoßen' }), h('b', { text: fmtMass(r.ejected) }), h('span', { class: 'muted small', text: `Bestwert ${fmtMass(info.bestEject)}${fresh.eject ? ' (neu)' : ''}` })),
        ),
        newChapter ? h('p', { class: 'pp-unlock', text: `Kapitel ${newChapter} · ${CHAPTERS.find((c) => c.id === newChapter).name} ist offen.` }) : null,
        h(
          'div',
          { class: 'pp-end-actions' },
          nxt ? h('button', { class: 'btn btn-primary btn-big', type: 'button', onClick: () => go(() => startLevel(nxt, null)) }, 'Weiter') : h('button', { class: 'btn btn-primary btn-big', type: 'button', onClick: () => go(showFinale) }, 'Weiter'),
          h(
            'div',
            { class: 'pp-end-row' },
            h('button', { class: 'btn', type: 'button', onClick: () => go(() => startLevel(level, null)) }, 'Nochmal'),
            nxt0 ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => go(showSelect) }, 'Levelauswahl') : h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => go(showSelect) }, 'Levelauswahl'),
          ),
        ),
      ),
    );
    endEl.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => endEl.classList.add('in')));
    // Sterne erscheinen nacheinander, je Stern ein Ton
    const reduce = reduceMotion();
    for (let i = 0; i < 3; i++) {
      if (i >= st.count) continue;
      setTimeout(() => {
        if (token !== endToken) return;
        starEls[i].classList.add('on');
        audio.sfx.star({ i });
        if (i === st.count - 1) vibe(14);
      }, (reduce ? 0 : 420) + i * (reduce ? 60 : T.fx.starGap * 1000));
    }
  }


  /* ---------- Abschluss (nach dem Finale des letzten Kapitels): ruhig, ohne Erzaehlstimme ---------- */
  function showFinale() {
    const token = ++endToken;
    const total = LEVELS.length;
    const doneN = LEVELS.filter((l) => progress.done(l.id)).length;
    const starN = LEVELS.reduce((n, l) => n + progress.stars(l.id), 0);
    const missing = LEVELS.filter((l) => progress.done(l.id) && progress.stars(l.id) < 3);
    const undone = total - doneN;
    const bestSum = LEVELS.reduce((n, l) => n + (progress.info(l.id) && progress.info(l.id).bestTime != null ? progress.info(l.id).bestTime : 0), 0);
    const all = undone === 0;
    const lines = [];
    if (undone) lines.push(`Es fehlen noch ${undone} Level, die du noch nicht geschafft hast.`);
    if (missing.length) lines.push(`${3 * total - starN - 3 * undone} Sterne warten in ${missing.length} Leveln auf dich. Tippe in der Levelauswahl ein Level an, um es zu verbessern.`);
    if (!undone && !missing.length) lines.push('Du hast jeden Stern gesammelt.');
    const bigStars = h('div', { class: 'pp-fin-stars', 'aria-hidden': 'true' }, ...CHAPTERS.map((c) => h('span', { class: 'pp-fin-star', style: { '--k': c.id }, text: '★' })));
    endEl.replaceChildren(
      h(
        'div',
        { class: 'pp-endcard pp-finale' },
        h('div', { class: 'pp-end-sub', text: 'Protoplanet' }),
        h('h2', { class: 'pp-end-title', text: all ? 'Alle Kapitel geschafft' : 'Planetensystem geschafft' }),
        bigStars,
        h(
          'div',
          { class: 'pp-result-stats' },
          h('div', {}, h('span', { class: 'muted', text: 'Sterne' }), h('b', { text: `${starN} / ${3 * total}` })),
          h('div', {}, h('span', { class: 'muted', text: 'Level' }), h('b', { text: `${doneN} / ${total}` })),
        ),
        bestSum > 0 ? h('p', { class: 'pp-fin-line', text: `Summe deiner Bestzeiten: ${fmtTime(bestSum)}` }) : null,
        ...lines.map((t) => h('p', { class: 'pp-fin-line muted', text: t })),
        progress.dailyOpen && progress.dailyOpen() ? h('p', { class: 'pp-fin-line', text: 'Jeden Tag wartet ein neues Tageslevel auf dich.' }) : null,
        h('div', { class: 'pp-end-actions' }, h('button', { class: 'btn btn-primary btn-big', type: 'button', onClick: () => go(showSelect) }, 'Levelauswahl')),
      ),
    );
    endEl.hidden = false;
    endEl.classList.remove('in');
    requestAnimationFrame(() => requestAnimationFrame(() => endEl.classList.add('in')));
    // Fuenf Sterne, je Kapitel einer, steigen als ruhiger Aufstieg (Tonleiter) auf
    const reduce = reduceMotion();
    CHAPTERS.forEach((c, i) =>
      setTimeout(() => {
        if (token !== endToken) return;
        const el = endEl.querySelectorAll('.pp-fin-star')[i];
        if (el) el.classList.add('on');
        audio.sfx.star({ i });
      }, (reduce ? 0 : 500) + i * (reduce ? 40 : 380)),
    );
    setTimeout(() => token === endToken && vibe(T.fx.vibe.win), reduce ? 0 : 500 + CHAPTERS.length * 380);
  }

  /* ---------- Kopfleiste ---------- */
  let lastCalm = null;
  function hud() {
    if (!play) return;
    const g = play.progress;
    const pct = Math.floor(g.frac * 100);
    txt(goalTxt, goalText(play.goal));
    txt(goalPct, goalCounter(play.goal, g));
    setCls(goalPct, 'wide', play.goal.type === 'last' || play.goal.type === 'largest');
    setStyle(barFill, 'width', pct + '%');
    setCls(bar, 'near', g.frac >= T.fx.hudNear && play.status === 'running');
    const calm = reduceMotion();
    if (calm !== lastCalm) {
      lastCalm = calm;
      gameEl.classList.toggle('calm', calm);
      document.body.classList.toggle('calm', calm);
    }
    const p = play.world.player;
    txt(massVal, p ? `Masse ${fmtMass(p.m)}` : 'Masse 0,00');
    txt(timeBtn, TIME_LABEL[play.timeScale] || '×1');
    if (level.hint && !hintGone) {
      const u = level.hint.until;
      const s = play.world.stats;
      const ok = (u === 'eject' && s.ejects > 0) || (u === 'absorb' && s.absorbed > 0) || (u === 'beam' && (beamUsed || timeChanged));
      if (ok) {
        hintGone = true;
        setCls(helpEl, 'gone', true);
      }
    }
  }

  /* ---------- Eingabe ---------- */
  const view = () => renderer.view;
  const toWorld = (x, y) => {
    const [wx, wy] = screenToWorld(cam, view().w, view().h, x, y);
    return { x: wx, y: wy };
  };
  const input = createInput(canvas, {
    enabled: () => screen === 'game' && phase === 'play' && !paused && play && play.status === 'running' && !document.body.classList.contains('modal-open'),
    tap(x, y) {
      const w = toWorld(x, y);
      if (play.ejectAt(w.x, w.y)) return;
      setCls(massEl, 'flash', true);
      setTimeout(() => setCls(massEl, 'flash', false), 300);
    },
    beamStart(x, y) {
      pointer = { x, y };
      beamUsed = true;
      beamVibed = false;
      play.setBeam(toWorld(x, y));
    },
    beamMove(x, y) {
      pointer = { x, y };
    },
    beamEnd() {
      pointer = null;
      if (play) play.setBeam(null);
    },
    pinchStart: () => pinchStart(cam),
    pinch: (ratio) => pinchMove(cam, ratio, performance.now() / 1000),
    pinchEnd: () => pinchEnd(cam, performance.now() / 1000),
    wheel(dir) {
      cam.manualHalf = Math.max(T.camMin * 0.6, Math.min(T.camMax, cam.half * (dir > 0 ? 0.87 : 1.15)));
      cam.manualAt = performance.now() / 1000;
    },
  });
  // Tippen im Auftakt = ueberspringen, im Sieg-Abspann = Ergebnis-Karte sofort, nach dem Zurueckspulen = weiterspielen (der Tipp selbst stoesst nichts aus)
  canvas.addEventListener('pointerdown', () => {
    if (screen !== 'game' || !play) return;
    if (phase === 'intro' && !paused) skipIntro();
    else if (phase === 'win' && !cardShown) showResultCard();
    else if (tapResume && !pauseModal) resume();
  });

  backBtn.addEventListener('click', () => go(showSelect));
  pauseBtn.addEventListener('click', () => pause());
  timeBtn.addEventListener('click', () => {
    if (!play || paused || play.status !== 'running' || phase !== 'play') return;
    timeIdx = (timeIdx + 1) % T.timeSteps.length;
    play.timeScale = T.timeSteps[timeIdx];
    timeChanged = true;
    audio.sfx.timeStep({ idx: timeIdx });
    audio.update({ timeScale: play.timeScale });
    hud();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (screen === 'game' && play && play.status === 'running') pause();
      else persist();
    }
  });
  addEventListener('pagehide', () => persist());

  /** Kapitel 3, pro Bild: Bahnvorschau auffrischen (sofort nach einem Ausstoss, sonst hoechstens alle `every` s, im Strahl oefter) und Abdrift-Warnung. */
  function orbitFrame(now) {
    const w = play.world;
    const p = w.player;
    if (!p) return;
    const ej = w.stats.ejects;
    const every = play.beam ? T.orbit.preview.every * 0.5 : T.orbit.preview.every;
    if (!preview || ej !== previewEj || (play.status === 'running' && !paused && now - previewAt >= every)) {
      const t0 = performance.now();
      preview = predictOrbit(w);
      const ms = performance.now() - t0;
      previewStats.n++;
      previewStats.ms += ms;
      if (ms > previewStats.max) previewStats.max = ms;
      previewAt = now;
      previewEj = ej;
    }
    warn = driftState(w);
    const show = warn > 0 && play.status === 'running' && phase === 'play';
    if (show !== warnShown) {
      warnShown = show;
      warnEl.hidden = !show;
    }
    if (show) {
      setCls(warnEl, 'lose', warn > 0.6);
      if (!paused && now - lastWarnSnd > 3.5) {
        lastWarnSnd = now;
        audio.sfx.warn();
      }
    }
  }

  /** Ereignisse des Spiels in Effekte uebersetzen (reine Darstellung): Aufnahme, Atmen, Ausstoss, Rueckstoss, Haptik. */
  function reactToPlay(dtReal, now) {
    const w = play.world;
    const st = w.stats;
    const p = w.player;
    if (p) lastPlayerPos = { x: p.x, y: p.y, r: Math.sqrt(p.m) };
    const gained = st.gained - lastGained;
    const a = st.absorbed;
    if (p && gained > 1e-6) fx.gain(gained / Math.max(p.m, 0.01));
    if (a > lastAbsorbed) {
      const pm = p ? p.m : 1;
      const ratio = Math.max(0, gained) / Math.max(pm, 0.01) / (a - lastAbsorbed);
      audio.sfx.absorb({ ratio });
      if (p) {
        const rp = Math.sqrt(p.m);
        fx.ring(p.x, p.y, rp * 1.05, rp * (1.9 + Math.min(1.2, ratio * 2)), T.fx.ringLife, 0, 1);
        fx.burst(p.x, p.y, rp, 6 + Math.round(Math.min(10, ratio * 20)), 0, 0.9);
      }
      lastAbsorbed = a;
      vibe(gained / Math.max(pm, 0.01) >= T.fx.bigGain ? T.fx.vibe.big : T.fx.vibe.absorb);
    }
    lastGained = st.gained;
    if (st.ejects > lastEjects) {
      lastEjects = st.ejects;
      audio.sfx.eject({ stream: !!play.beam });
      if (p) {
        let q = null;
        for (let i = w.bodies.length - 1; i >= 0 && i > w.bodies.length - 40; i--) {
          if (w.bodies[i].gf === p.id) {
            q = w.bodies[i];
            break;
          }
        }
        if (q) {
          fx.recoil(Math.atan2(q.y - p.y, q.x - p.x));
          fx.puff(q.x, q.y, q.vx, q.vy, play.beam ? 2 : 4);
        }
      }
      if (!play.beam) vibe(T.fx.vibe.eject);
      else if (!beamVibed) {
        beamVibed = true;
        vibe(T.fx.vibe.eject);
      }
    }
  }

  /* ---------- Schleife ---------- */
  function loop(ts) {
    requestAnimationFrame(loop);
    const now = ts / 1000;
    const dt = lastTs ? Math.min(0.1, now - lastTs) : 0;
    lastTs = now;
    if (screen === 'select') {
      if (!selectEl.hidden) ambient.draw(dt, now, reduceMotion());
      return;
    }
    if (screen !== 'game' || !play) return;
    frame++;
    emaDt += (dt - emaDt) * 0.05;
    // zu langsame Darstellung: nur jedes zweite Bild zeichnen (die Physik bleibt gleich)
    if (!slow && emaDt > 1 / 36 && dt > 0) {
      slow = true;
      slowSince = now;
    } else if (slow && now - slowSince > 4 && emaDt < 1 / 55) slow = false;

    const reduce = reduceMotion();
    fx.state.reduce = reduce;
    let rw = play.world; // Welt, die gezeichnet wird (Kopie/Mischung in Abspannen)
    let fade = 0;
    let tint = 0;
    let flash = 0;

    if (phase === 'intro') {
      if (!paused) ip = Math.min(1, ip + dt * introRate);
      const hold = reduce ? 0 : T.intro.hold / (play.world.arenaR <= 0 ? T.intro.orbitDur : T.intro.dur);
      introK = reduce ? 1 : (ip - hold) / (1 - hold);
      introCamera(cam, play.world, introK, !!fogCfg);
      if (ip >= 1) endIntro(now);
    } else if (phase === 'play') {
      if (!paused && play.status === 'running') {
        if (pointer && play.beam) {
          const w = toWorld(pointer.x, pointer.y);
          play.beam.x = w.x;
          play.beam.y = w.y;
        }
        play.advance(dt);
        reactToPlay(dt, now);
        if (frame % 6 === 0) audio.update({ danger: dangerOf(play.world), size: sizeOf(play.world.player ? play.world.player.m : 1), timeScale: play.timeScale });
      }
      updateCamera(cam, play.world, dt, now);
    } else if (phase === 'win') {
      const t = now - phaseT0;
      if (ghost && t < T.fx.winSlowT) {
        ghostAcc += dt * T.fx.winSlow;
        for (let n = 0; ghostAcc >= T.dt && n < 6 && ghost.player; n++) {
          physStep(ghost);
          ghostAcc -= T.dt;
        }
      }
      if (ghost) rw = ghost;
      flash = Math.max(0, 1 - t / 1.0) * (reduce ? 0.4 : 1);
      const f0 = reduce ? 0.1 : 0.8;
      const fl = reduce ? 0.3 : T.fx.winFadeT;
      fade = 0.86 * smooth((t - f0) / fl);
      cam.manualHalf = (cam.baseHalf || cam.half) * (1 + 0.22 * smooth(t / 2));
      cam.manualAt = now;
      updateCamera(cam, rw, dt, now);
      if (t >= f0 + fl * 0.65 && !cardShown) showResultCard();
    } else if (phase === 'loss') {
      const t = now - phaseT0;
      const lt = reduce ? 0.3 : T.fx.lossT;
      if (ghost && !reduce) {
        ghostAcc += dt * Math.max(0.05, 0.55 * (1 - t / lt));
        for (let n = 0; ghostAcc >= T.dt && n < 6; n++) {
          physStep(ghost);
          ghostAcc -= T.dt;
        }
        rw = ghost;
      }
      fade = 0.66 * smooth(t / lt);
      if (t >= lt && !modals.size) showLossDialog();
    } else if (phase === 'rewind') {
      const u = Math.min(1, (now - phaseT0) / T.fx.rewindT);
      const n = rewindFrames.length;
      const f = smooth(u) * (n - 1);
      const i = Math.min(n - 2, Math.floor(f));
      rw = blendWorlds(rewindFrames[i], rewindFrames[i + 1], f - i);
      tint = Math.sin(Math.PI * Math.min(1, u * 1.08)) * 0.85 + 0.15;
      updateCamera(cam, rw, dt, now);
      if (u >= 1) finishRewind();
    }

    // Effekte
    if (phase === 'play' || phase === 'intro') {
      if (phase === 'play' && !paused && play.status === 'running') {
        fx.scanDanger(play.world, dt);
        const vis = (x, y, r) => Math.abs(x - cam.x) < cam.half + r && Math.abs(y - cam.y) < cam.half * (view().h / view().w) + r;
        fx.scanFlow(play.world, dt, view().w / 2 / cam.half, vis);
        const dgr = fx.danger;
        if (dgr > 0.62 && now - lastDangerVibe > T.fx.dangerVibeGap) {
          lastDangerVibe = now;
          vibe(T.fx.vibe.danger);
        }
      }
    }
    if (!paused || phase !== 'play') fx.update(dt, rw);
    if (phase === 'play') trackMass(now);
    if (play.world.grav && phase !== 'loss') orbitFrame(now);
    else if (preview) preview = null;
    // Nebel: Sichtradius (Auftakt: waechst aus der Dunkelheit, Sieg: lichtet sich), Glimmen mit Glaettung, Hinweise
    let fogState = null;
    if (fogCfg && rw.player) {
      let R = fogRadius(rw.player.m, fogCfg);
      if (phase === 'intro') R *= fogIntro(introK, fogCfg);
      else if (phase === 'win') R *= 1 + 2.5 * smooth((now - phaseT0) / 1.4);
      fogGlimmers(rw, fogRadius(rw.player.m, fogCfg), fogRaw, fogCfg);
      const kf = 1 - Math.exp(-dt / fogCfg.glimTau);
      const seen = new Set();
      const glims = [];
      for (const gl of fogRaw) {
        const old = fogK.get(gl.id) || 0;
        const k = old + (gl.k - old) * kf;
        fogK.set(gl.id, k);
        seen.add(gl.id);
        glims.push({ ...gl, k });
      }
      for (const [id, k] of fogK) {
        if (seen.has(id)) continue;
        const nk = k * Math.exp(-dt / fogCfg.glimTau);
        if (nk < 0.02) fogK.delete(id);
        else {
          const b = rw.bodies.find((x) => x.id === id);
          const pl = rw.player;
          if (b && pl) {
            const d = Math.hypot(b.x - pl.x, b.y - pl.y) || 1;
            glims.push({ id, ux: (b.x - pl.x) / d, uy: (b.y - pl.y) / d, k: nk, d });
          }
          fogK.set(id, nk);
        }
      }
      if (phase === 'play' && !paused && play.status === 'running') {
        const top = glims.reduce((m, g) => Math.max(m, g.k), 0);
        if (top > 0.3 && now - lastGlimSnd > 6) {
          lastGlimSnd = now;
          audio.sfx.glimmer({ k: top });
        }
      }
      fogState = { R, glims: phase === 'intro' || phase === 'win' ? [] : glims, hints: phase === 'play' ? fogHints(rw, play.goal, fogCfg) : null };
    }
    if (!slow || frame % 2 === 0) {
      const t0 = performance.now();
      renderer.draw({
        fog: fogState,
        world: rw,
        cam,
        now,
        reduceMotion: reduce,
        chapter: level.chapter,
        fx,
        aim: pointer && play.beam ? play.beam : null,
        preview: phase === 'loss' || phase === 'rewind' ? null : preview,
        warn: phase === 'play' || phase === 'intro' ? warn : 0,
        introRing: phase === 'intro' ? 1 : Math.max(0, Math.min(1, 1 - (now - introEndAt) / 0.9)),
        fade,
        tint,
        flash,
      });
      const ms = performance.now() - t0;
      frameStats.n++;
      frameStats.ms += ms;
      if (ms > frameStats.max) frameStats.max = ms;
    }
    if (frame % 4 === 0) hud();
    if (!endShown && play.status !== 'running' && phase === 'play') {
      hud();
      if (play.status === 'lost') onLoss(now);
      else if (play.status === 'won') onWin(now);
    }
  }

  /* ---------- Einstellungen ---------- */
  function openSettings() {
    const sw = (title, desc, get, set) => {
      const btn = h('button', { class: 'pp-switch', type: 'button', role: 'switch' }, h('span', { class: 'pp-switch-text' }, h('b', { text: title }), h('span', { class: 'muted small', text: desc })), h('span', { class: 'pp-switch-knob' }));
      const sync = () => {
        btn.setAttribute('aria-checked', get() ? 'true' : 'false');
        btn.classList.toggle('on', !!get());
      };
      btn.addEventListener('click', () => {
        set(!get());
        sync();
        progress.save();
      });
      sync();
      return btn;
    };
    const slider = (title, key) => {
      const val = h('span', { class: 'pp-slider-val num' });
      const input = h('input', { class: 'pp-slider', type: 'range', min: '0', max: '100', step: '5', 'aria-label': title });
      input.value = String(settings()[key]);
      const sync = () => txt(val, `${input.value} %`);
      input.addEventListener('input', () => {
        settings()[key] = Number(input.value);
        sync();
        audio.refreshVolumes();
      });
      input.addEventListener('change', () => {
        progress.save();
        if (key === 'sfx') audio.sfx.absorb({ ratio: 0.1 });
      });
      sync();
      return h('label', { class: 'pp-slider-row' }, h('span', { class: 'pp-slider-head' }, h('b', { text: title }), val), input);
    };
    const body = h(
      'div',
      { class: 'pp-settings' },
      sw('Zielsteuerung', 'Tippe, wohin du fliegen willst. Die Masse geht nach hinten raus.', () => settings().aim, (v) => {
        settings().aim = v;
        if (play) play.invert = !v;
        if (play && level && level.hint) helpEl.textContent = hintText(level.hint);
      }),
      slider('Musik', 'music'),
      slider('Effekte', 'sfx'),
      sw('Ton', 'Alles stumm schalten.', () => !settings().mute, (v) => {
        settings().mute = !v;
        audio.refreshVolumes();
        document.querySelectorAll('.pp-sound').forEach((b) => b.dispatchEvent(new Event('pp-sync')));
      }),
      sw('Vibration', 'Feine Impulse beim Absorbieren, beim Ausstoßen und bei Gefahr, länger beim Verlust. Auf iOS ohne Wirkung.', () => settings().vibrate, (v) => (settings().vibrate = v)),
      sw('Weniger Bewegung', 'Weniger Effekte, kein Parallax, keine Zeitlupe, kürzerer Auftakt. Standard folgt der Systemeinstellung.', reduceMotion, (v) => (settings().reduceMotion = v)),
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onClick: () => openExport() }, 'Spielstand exportieren'),
        h('button', { class: 'btn', type: 'button', onClick: () => openImport() }, 'Spielstand importieren'),
      ),
      h('button', { class: 'btn btn-danger btn-block', type: 'button', onClick: wipe }, 'Fortschritt löschen'),
    );
    modal({ title: 'Einstellungen', body, actions: [{ label: 'Fertig', kind: 'primary' }] });
  }

  async function wipe() {
    const ok = await confirmDialog('Alle Sterne, Bestwerte und das laufende Level werden gelöscht. Das lässt sich nicht rückgängig machen.', { title: 'Fortschritt löschen?', ok: 'Löschen', danger: true });
    if (!ok) return;
    progress.reset();
    progress.save();
    closeAllModals();
    toast('Fortschritt gelöscht.', { kind: 'good' });
    showSelectNoPersist();
  }

  function openExport() {
    const text = progress.exportString();
    const ta = h('textarea', { class: 'pp-text', readOnly: true, rows: 6, value: text, 'aria-label': 'Spielstand-Text' });
    ta.addEventListener('focus', () => ta.select());
    modal({
      title: 'Spielstand exportieren',
      body: h('div', {}, h('p', { class: 'muted small', text: 'Kopiere diesen Text und bewahre ihn auf. Mit „Importieren“ kannst du ihn später (oder auf einem anderen Gerät) wiederherstellen.' }), ta),
      actions: [
        {
          label: 'Kopieren',
          kind: 'primary',
          onClick: () => {
            ta.select();
            const done = () => toast('Kopiert.', { kind: 'good' });
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => document.execCommand && document.execCommand('copy'));
            else if (document.execCommand) {
              document.execCommand('copy');
              done();
            }
            return false;
          },
        },
        { label: 'Schließen', kind: 'ghost' },
      ],
    });
  }

  function openImport() {
    const ta = h('textarea', { class: 'pp-text', rows: 6, placeholder: 'MGSAVE1.protoplanet. …', 'aria-label': 'Spielstand-Text einfügen' });
    const err = h('p', { class: 'error small' });
    modal({
      title: 'Spielstand importieren',
      body: h('div', {}, h('p', { class: 'muted small', text: 'Füge den exportierten Text ein. Der aktuelle Fortschritt wird ersetzt.' }), ta, err),
      actions: [
        {
          label: 'Importieren',
          kind: 'primary',
          onClick: () => {
            try {
              progress.importString(ta.value);
            } catch (e) {
              err.textContent = e.message || 'Das hat nicht geklappt.';
              return false;
            }
            progress.save();
            toast('Spielstand importiert.', { kind: 'good' });
            closeAllModals();
            showSelectNoPersist();
            return false;
          },
        },
        { label: 'Abbrechen', kind: 'ghost' },
      ],
    });
  }

  function showSelectNoPersist() {
    pauseModal = null;
    enterSelectScreen();
  }

  /* ---------- Start ---------- */
  resizeAll();
  requestAnimationFrame(loop);
  const snap = progress.state.snap;
  const snapLevel = snap && levelById(snap.levelId);
  if (snapLevel && progress.unlocked(snapLevel.id)) startLevel(snapLevel, snap);
  else {
    progress.setSnap(null);
    renderSelect();
  }
  return { startLevel, showSelect, audio, previewStats, frameStats, skipIntro, get fx() { return fx; }, get state() { return { screen, level, play, paused, cam, preview, warn, phase, ghost, cardShown }; } };
}
