// Oberflaeche: Levelauswahl, Spielbildschirm (Canvas + Kopfleiste), Pausenmenue, Verlust-Dialog, Ergebnis, Einstellungen.
import { h, txt, setCls, setStyle, svgIcon } from '../../engine/ui/dom.js';
import { openModal, confirmDialog } from '../../engine/ui/modal.js';
import { createToaster } from '../../engine/ui/toast.js';
import { T } from './tune.js';
import { LEVELS, CHAPTERS, levelById, nextLevel } from './levels.js';
import { createPlay } from './play.js';
import { goalText, starsFor, fmtMass } from './goals.js';
import { createCamera, updateCamera, pinchStart, pinchMove, pinchEnd, screenToWorld } from './camera.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';

const ICON = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  hub: '<path d="M4 11l8-7 8 7M6 10v9h12v-9"/>',
  lock: '<rect x="6" y="11" width="12" height="9" rx="2"/><path d="M9 11V8a3 3 0 0 1 6 0v3"/>',
};
const TIME_LABEL = { 0.25: '×¼', 1: '×1', 4: '×4', 10: '×10' };

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmtPct = (x) => `${Math.round(x * 100)} %`;
const starText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

export function mountApp(root, progress) {
  const toasts = h('div', { class: 'pp-toasts' });
  const toast = createToaster(toasts, { max: 2 });

  /* ---------- Gerüst ---------- */
  const selectEl = h('section', { class: 'pp-select', 'aria-label': 'Levelauswahl' });
  const canvas = h('canvas', { class: 'pp-canvas', 'aria-label': 'Spielfeld' });
  const backBtn = h('button', { class: 'pp-icon-btn', type: 'button', 'aria-label': 'Zurück zur Levelauswahl' }, svgIcon(ICON.back));
  const pauseBtn = h('button', { class: 'pp-icon-btn', type: 'button', 'aria-label': 'Pause' }, svgIcon(ICON.pause));
  const goalTxt = h('div', { class: 'pp-goal-text' });
  const goalPct = h('span', { class: 'pp-goal-pct num' });
  const barFill = h('div', { class: 'pp-bar-fill' });
  const bar = h('header', { class: 'pp-bar' }, backBtn, h('div', { class: 'pp-goal' }, goalTxt, h('div', { class: 'pp-goal-row' }, h('div', { class: 'pp-bar-track' }, barFill), goalPct)), pauseBtn);
  const helpEl = h('div', { class: 'pp-help', hidden: true });
  const massEl = h('div', { class: 'pp-mass' });
  const timeBtn = h('button', { class: 'pp-time', type: 'button', 'aria-label': 'Zeitstufe' }, '×1');
  const gameEl = h('section', { class: 'pp-game', hidden: true }, canvas, bar, helpEl, massEl, timeBtn);
  root.append(selectEl, gameEl, toasts);

  const renderer = createRenderer(canvas);
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => renderer.resize());
    ro.observe(canvas);
  }
  addEventListener('resize', () => renderer.resize());

  /* ---------- Zustand ---------- */
  let screen = 'select';
  let level = null;
  let play = null;
  let cam = createCamera();
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
  const hintText = (hint) => (settings().aim && hint.textAim) || hint.text;
  const reduceMotion = () => {
    const v = settings().reduceMotion;
    if (v != null) return !!v;
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  };
  const vibe = (ms) => {
    if (!settings().vibrate) return;
    const t = performance.now();
    if (ms < 60 && t - lastVibe < 150) return;
    lastVibe = t;
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch {
      /* ohne Wirkung (z. B. iOS) */
    }
  };

  function persist() {
    if (screen === 'game' && play) {
      progress.setSnap(play.status === 'running' ? { levelId: level.id, play: play.serialize(), timeScale: play.timeScale } : null);
    }
    progress.save();
  }

  /* ---------- Levelauswahl ---------- */
  function renderSelect() {
    selectEl.replaceChildren();
    const snap = progress.state.snap;
    const head = h(
      'header',
      { class: 'pp-sel-head' },
      h('a', { class: 'pp-icon-btn', href: '../../', 'aria-label': 'Alle Spiele' }, svgIcon(ICON.hub)),
      h('h1', { text: 'Protoplanet' }),
      h('button', { class: 'pp-icon-btn', type: 'button', 'aria-label': 'Einstellungen', onClick: () => openSettings() }, svgIcon(ICON.gear)),
    );
    selectEl.append(head, h('p', { class: 'pp-sub', text: 'Du bist ein Staubkorn in einer jungen Sternscheibe. Bewegen kannst du dich nur, indem du Masse ausstößt.' }));
    if (snap && levelById(snap.levelId)) {
      const lv = levelById(snap.levelId);
      selectEl.append(h('button', { class: 'btn btn-primary btn-big pp-resume', type: 'button', onClick: () => openLevel(lv) }, `Weiterspielen · Level ${lv.id}`));
    }
    for (const ch of CHAPTERS) {
      const lvls = LEVELS.filter((l) => l.chapter === ch.id);
      const got = lvls.reduce((s, l) => s + progress.stars(l.id), 0);
      const tiles = h('div', { class: 'pp-tiles' });
      for (const lv of lvls) {
        const open = progress.unlocked(lv.id);
        const stars = progress.stars(lv.id);
        const running = snap && snap.levelId === lv.id;
        tiles.append(
          h(
            'button',
            { class: 'pp-tile' + (open ? '' : ' locked') + (stars ? ' done' : ''), type: 'button', 'aria-label': `Level ${lv.id} ${lv.title}${open ? '' : ' (gesperrt)'}`, onClick: () => openLevel(lv) },
            h('span', { class: 'pp-tile-n', text: String(lv.n) }),
            h('span', { class: 'pp-tile-t', text: lv.title }),
            open ? h('span', { class: 'pp-tile-s', text: starText(stars) }) : h('span', { class: 'pp-tile-lock' }, svgIcon(ICON.lock)),
            running ? h('span', { class: 'pp-tile-run', text: 'läuft' }) : null,
          ),
        );
      }
      selectEl.append(
        h('section', { class: 'pp-chapter' }, h('h2', { text: `Kapitel ${ch.id} · ${ch.name}` }), h('p', { class: 'pp-chapter-meta', text: `★ ${got} von ${lvls.length * 3}` }), tiles),
      );
    }
    selectEl.append(h('p', { class: 'pp-note', text: 'Weitere Kapitel folgen in späteren Updates.' }));
  }

  function showSelect() {
    persist();
    closePauseModal();
    screen = 'select';
    play = null;
    gameEl.hidden = true;
    selectEl.hidden = false;
    document.body.classList.remove('pp-playing');
    renderSelect();
    selectEl.scrollTop = 0;
  }

  function openLevel(lv) {
    if (!progress.unlocked(lv.id)) {
      const prev = LEVELS[LEVELS.findIndex((l) => l.id === lv.id) - 1];
      toast(`Schließe zuerst Level ${prev ? prev.id : ''} ab.`, { kind: 'warn' });
      return;
    }
    const snap = progress.state.snap;
    if (snap && snap.levelId === lv.id) startLevel(lv, snap);
    else startLevel(lv, null);
  }

  /* ---------- Spielbildschirm ---------- */
  function startLevel(lv, snap) {
    closePauseModal();
    level = lv;
    play = createPlay(lv, snap ? snap.play : null);
    play.invert = !settings().aim;
    play.timeScale = snap && snap.timeScale ? snap.timeScale : 1;
    timeIdx = Math.max(0, T.timeSteps.indexOf(play.timeScale));
    cam = createCamera();
    paused = false;
    endShown = false;
    beamUsed = false;
    timeChanged = false;
    pointer = null;
    lastAbsorbed = play.world.stats.absorbed;
    hintGone = false;
    screen = 'game';
    selectEl.hidden = true;
    gameEl.hidden = false;
    document.body.classList.add('pp-playing');
    if (!snap) progress.setSnap(null);
    renderer.resize();
    helpEl.textContent = lv.hint ? hintText(lv.hint) : '';
    helpEl.hidden = !lv.hint;
    setCls(helpEl, 'gone', false);
    lastTs = 0;
    hud();
    if (snap) pause(); // ein gesichertes Level wird pausiert fortgesetzt
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
    if (play.status !== 'running' || pauseModal) return;
    let leaving = false;
    pauseModal = modal({
      title: 'Pausiert',
      body: h('div', {}, h('p', { class: 'muted', text: `Level ${level.id} · ${level.title}` }), h('p', { text: goalText(play.goal) })),
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
            setTimeout(() => startLevel(level, null), 0);
          },
        },
        {
          label: 'Levelauswahl',
          onClick: () => {
            leaving = true;
            setTimeout(showSelect, 0);
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
    lastTs = 0;
  }

  function onLoss() {
    endShown = true;
    vibe(220);
    persist();
    const left = play.rewindsLeft;
    modal({
      title: 'Absorbiert',
      body: h(
        'div',
        {},
        h('p', { text: 'Ein größerer Körper hat dich absorbiert.' }),
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
                onClick: () => {
                  if (play.doRewind()) {
                    endShown = false;
                    setTimeout(pause, 0);
                  }
                },
              },
            ]
          : []),
        { label: 'Neu starten', kind: left > 0 ? '' : 'primary', onClick: () => setTimeout(() => startLevel(level, null), 0) },
        { label: 'Levelauswahl', kind: 'ghost', onClick: () => setTimeout(showSelect, 0) },
      ],
    });
  }

  function onWin() {
    endShown = true;
    vibe(60);
    const r = play.result;
    const st = starsFor(level, r);
    const fresh = progress.record(level.id, { time: r.time, ejected: r.ejected, eff: st.eff, fast: st.fast });
    progress.setSnap(null);
    progress.save();
    const info = progress.info(level.id);
    const nxt = nextLevel(level.id);
    const row = (ok, label, detail) => h('li', { class: ok ? 'ok' : 'no' }, h('span', { class: 'pp-star', text: ok ? '★' : '☆' }), h('span', {}, h('b', { text: label }), detail ? h('span', { class: 'muted', text: ' ' + detail }) : null));
    const body = h(
      'div',
      { class: 'pp-result' },
      h('div', { class: 'pp-result-stars', text: starText(st.count), 'aria-label': `${st.count} von 3 Sternen` }),
      h(
        'ul',
        { class: 'pp-result-list' },
        row(true, 'Geschafft', fresh.first ? '(neu)' : ''),
        row(st.eff, 'Effizienz', r.rewound ? 'zurückgespult, kein Stern in diesem Versuch' : `höchstens ${fmtPct(level.targets.eject)} ausgestoßen`),
        row(st.fast, 'Zeit', `höchstens ${fmtTime(level.targets.time)}`),
      ),
      h(
        'div',
        { class: 'pp-result-stats' },
        h('div', {}, h('span', { class: 'muted', text: 'Zeit' }), h('b', { text: fmtTime(r.time) }), h('span', { class: 'muted small', text: `Bestzeit ${fmtTime(info.bestTime)}${fresh.time ? ' (neu)' : ''}` })),
        h('div', {}, h('span', { class: 'muted', text: 'Ausgestoßen' }), h('b', { text: fmtPct(r.ejected) }), h('span', { class: 'muted small', text: `Bestwert ${fmtPct(info.bestEject)}${fresh.eject ? ' (neu)' : ''}` })),
      ),
    );
    modal({
      title: 'Level ' + level.id + ' · ' + level.title,
      body,
      dismissible: false,
      actions: [
        nxt
          ? { label: 'Weiter', kind: 'primary', onClick: () => setTimeout(() => startLevel(nxt, null), 0) }
          : { label: 'Levelauswahl', kind: 'primary', onClick: () => setTimeout(showSelect, 0) },
        { label: 'Nochmal', onClick: () => setTimeout(() => startLevel(level, null), 0) },
        ...(nxt ? [{ label: 'Levelauswahl', kind: 'ghost', onClick: () => setTimeout(showSelect, 0) }] : []),
      ],
    });
  }

  /* ---------- Kopfleiste ---------- */
  function hud() {
    if (!play) return;
    const g = play.progress;
    const pct = Math.floor(g.frac * 100);
    txt(goalTxt, goalText(play.goal));
    txt(goalPct, pct + ' %');
    setStyle(barFill, 'width', pct + '%');
    const p = play.world.player;
    txt(massEl, p ? `Masse ${fmtMass(p.m)}` : 'Masse 0,00');
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
    enabled: () => screen === 'game' && !paused && play && play.status === 'running' && !document.body.classList.contains('modal-open'),
    tap(x, y) {
      const w = toWorld(x, y);
      if (play.ejectAt(w.x, w.y)) return;
      setCls(massEl, 'flash', true);
      setTimeout(() => setCls(massEl, 'flash', false), 300);
    },
    beamStart(x, y) {
      pointer = { x, y };
      beamUsed = true;
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

  backBtn.addEventListener('click', () => showSelect());
  pauseBtn.addEventListener('click', () => pause());
  timeBtn.addEventListener('click', () => {
    if (!play || paused || play.status !== 'running') return;
    timeIdx = (timeIdx + 1) % T.timeSteps.length;
    play.timeScale = T.timeSteps[timeIdx];
    timeChanged = true;
    hud();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (screen === 'game' && play && play.status === 'running') pause();
      else persist();
    }
  });
  addEventListener('pagehide', () => persist());

  /* ---------- Schleife ---------- */
  function loop(ts) {
    requestAnimationFrame(loop);
    if (screen !== 'game' || !play) return;
    const now = ts / 1000;
    const dt = lastTs ? Math.min(0.1, now - lastTs) : 0;
    lastTs = now;
    frame++;
    emaDt += (dt - emaDt) * 0.05;
    // zu langsame Darstellung: nur jedes zweite Bild zeichnen (die Physik bleibt gleich)
    if (!slow && emaDt > 1 / 36 && dt > 0) {
      slow = true;
      slowSince = now;
    } else if (slow && now - slowSince > 4 && emaDt < 1 / 55) slow = false;

    if (!paused && play.status === 'running') {
      if (pointer && play.beam) {
        const w = toWorld(pointer.x, pointer.y);
        play.beam.x = w.x;
        play.beam.y = w.y;
      }
      play.advance(dt);
      const a = play.world.stats.absorbed;
      if (a > lastAbsorbed) {
        lastAbsorbed = a;
        vibe(18);
      }
    }
    updateCamera(cam, play.world, dt, now);
    if (!slow || frame % 2 === 0) renderer.draw({ world: play.world, cam, now, reduceMotion: reduceMotion(), aim: pointer && play.beam ? play.beam : null });
    if (frame % 4 === 0) hud();
    if (!endShown && play.status !== 'running') {
      hud();
      if (play.status === 'lost') onLoss();
      else if (play.status === 'won') onWin();
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
    const body = h(
      'div',
      { class: 'pp-settings' },
      sw('Zielsteuerung', 'Tippe, wohin du fliegen willst. Die Masse geht nach hinten raus.', () => settings().aim, (v) => {
        settings().aim = v;
        if (play) play.invert = !v;
        if (play && level && level.hint) helpEl.textContent = hintText(level.hint);
      }),
      sw('Vibration', 'Kurz beim Absorbieren, länger beim Verlust. Auf iOS ohne Wirkung.', () => settings().vibrate, (v) => (settings().vibrate = v)),
      sw('Weniger Bewegung', 'Kein Pulsieren, kein Parallax im Hintergrund. Standard folgt der Systemeinstellung.', reduceMotion, (v) => (settings().reduceMotion = v)),
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
    screen = 'select';
    play = null;
    gameEl.hidden = true;
    selectEl.hidden = false;
    document.body.classList.remove('pp-playing');
    renderSelect();
  }

  /* ---------- Start ---------- */
  requestAnimationFrame(loop);
  const snap = progress.state.snap;
  const snapLevel = snap && levelById(snap.levelId);
  if (snapLevel && progress.unlocked(snapLevel.id)) startLevel(snapLevel, snap);
  else {
    progress.setSnap(null);
    renderSelect();
  }
  return { startLevel, showSelect, get state() { return { screen, level, play, paused }; } };
}
