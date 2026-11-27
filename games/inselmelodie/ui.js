// Oberfläche: Bildschirme der Inselkette. Logik liegt in session.js/world.js/music.js (DOM-frei).
// Layout-Regel: Der Papagei hat überall einen EIGENEN Platz im Layout (Spalte oder Zeile) und liegt nie über Inhalt.
import { h } from '../../engine/ui/dom.js';
import { confirmDialog } from '../../engine/ui/modal.js';
import { ISLANDS, islandById, findTask, say, NAME_IDEAS, ANIMALS, PRAISE, MAP_SAY, LINES } from './world.js';
import {
  createRun, noteGameNotes, record, islandOpen, islandDone, nextTask, taskDone, starsTotal, COLLECT,
  defaultProgress, islandShown, pendingReveal, weakestTask, allDone,
} from './session.js';
import { createStaff } from './staff.js';
import { createKeyboard } from './keyboard.js';
import { createMap } from './map-view.js';
import { initFx, burst, buzz, floatText, flyTo, kick, wait, setHaptics } from './fx.js';
import { noteName, sciName, calibrate, MITTEL_C } from './notes.js';
import { noteColor } from './music.js';

const IMG = (name) => `img/${name}.webp`;
const noteLabel = (midi) => (midi === 72 ? 'hohe C' : midi === 60 ? 'Mittel-C' : midi === 48 ? 'tiefe C' : noteName(midi));
/** Satz zum Fehlgriff. Gleicher Tonname in anderer Oktave wird eigens erklärt (sonst: „Das war ein C, wir suchen das C“). */
function wrongLine(m, want) {
  if (noteName(m) === noteName(want)) {
    return m > want
      ? `Fast! Das war ein ${noteName(m)}, aber zu hoch. Das ${noteLabel(want)} liegt weiter links.`
      : `Fast! Das war ein ${noteName(m)}, aber zu tief. Das ${noteLabel(want)} liegt weiter rechts.`;
  }
  return null;
}
const COLLECT_NAMES = { muschel: 'Muschel', seestern: 'Seestern', schneckenhaus: 'Schneckenhaus', truhe: 'Schatztruhe', kristall: 'Höhlenkristall', kompass: 'Kompass' };
const ARTIKEL = { muschel: 'eine', seestern: 'einen', schneckenhaus: 'ein', truhe: 'eine', kristall: 'einen', kompass: 'einen' };

/** Bild mit Ersatz: fehlt die Datei, bleibt ein farbiger Kreis mit Anfangsbuchstaben. */
function pic(name, cls = '', alt = '') {
  const im = h('img', { class: 'pic ' + cls, src: IMG(name), alt, draggable: false });
  im.addEventListener('error', () => {
    im.replaceWith(h('div', { class: 'pic fallback ' + cls, text: (alt || name).slice(0, 1).toUpperCase() }));
  }, { once: true });
  return im;
}

function starRow(n, max = 3, cls = '') {
  return h('span', { class: 'stars ' + cls, 'aria-label': `${n} von ${max} Sternen` },
    ...Array.from({ length: max }, (_, i) => h('span', { class: i < n ? 'st on' : 'st', text: '★' })));
}

const ICONS = {
  back: '<path d="M15 5l-7 7 7 7" />',
  play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
  ear: '<path d="M6 10a6 6 0 1 1 12 0c0 3-2 4-3 5s-1 3-3 4M9 10a3 3 0 0 1 6 0" />',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  album: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 15l5-5 4 4 3-3 4 4"/>',
  check: '<path d="M5 13l4 4 10-10"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  piano: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 5v14M13 5v14M18 5v14"/><path d="M6 5v8h3V5M11 5v8h3V5M16 5v8h3V5" fill="currentColor"/>',
  note: '<circle cx="8" cy="17" r="3" fill="currentColor"/><path d="M11 17V4l8 3"/>',
  fish: '<path d="M3 12c4-6 11-6 15 0-4 6-11 6-15 0zM18 12l3-3v6z"/><circle cx="8" cy="11" r="1" fill="currentColor"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
};
const icon = (k) => {
  const s = h('span', { class: 'ico', 'aria-hidden': 'true' });
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>`;
  return s;
};

export function mountApp(root, { progress: p, save, audio, mic }) {
  let cleanup = null;
  let wake = null;
  const stack = [];
  initFx(document.body, { vibrate: p.settings.haptics });

  const B = () => p.birdName || 'Papagei';
  const sayB = (k, v = {}) => say(k, { B: B(), ...v });
  const fill = (t, v) => t.replace(/\{(\w)\}/g, (_, k) => v[k] ?? '');
  const turns = {};
  /** nächste Variante eines Satzes (reihum) */
  const pick = (k, v = {}) => { const arr = LINES[k]; const i = (turns[k] = ((turns[k] ?? -1) + 1) % arr.length); return fill(arr[i], v); };

  function setScreen(node, cls, dir = 'fwd') {
    cleanup?.();
    cleanup = null;
    root.replaceChildren(h('div', { class: `screen ${cls || ''} enter-${dir}` }, node));
  }
  function go(fn, ...args) {
    audio.sfx.tap();
    stack.push([fn, args]);
    history.pushState({ d: stack.length }, '');
    fn(...args);
  }
  function back() {
    if (stack.length > 1) history.back();
    else showMap();
  }
  function home() {
    stack.length = 0;
    stack.push([showMap, []]);
    history.pushState({ d: 1 }, '');
    showMap();
  }
  addEventListener('popstate', () => {
    if (!p.birdName) { stack.length = 0; stack.push([showWelcome, []]); showWelcome(); return; }
    if (stack.length > 1) stack.pop();
    const [fn, args] = stack[stack.length - 1] || [showMap, []];
    fn(...args);
  });

  async function keepAwake(on) {
    try {
      if (on && !wake) wake = await navigator.wakeLock?.request('screen');
      if (!on && wake) { await wake.release(); wake = null; }
    } catch { /* nicht schlimm */ }
  }

  /** Papagei mit Sprechblase. Die Blase steht NEBEN (row) oder ÜBER (col) dem Vogel, nie über fremdem Inhalt. */
  function parrot(mood, text, cls = '') {
    const bubble = h('div', { class: 'bubble', text });
    const img = pic('papagei-' + mood, 'bird', B());
    const box = h('div', { class: 'parrot ' + cls }, img, bubble);
    box.say = (t, m) => {
      bubble.textContent = t;
      kick(bubble, 'in', 400);
      if (m && img.tagName === 'IMG') img.src = IMG('papagei-' + m);
      if (m) kick(box, 'hop', 600);
    };
    img.addEventListener('click', () => { kick(box, 'hop', 600); audio.sfx.tap(); });
    return box;
  }

  function topbar({ title, onBack = back, right = [] }) {
    return h('header', { class: 'topbar' },
      onBack ? h('button', { class: 'icon-btn', 'aria-label': 'Zurück', onClick: () => { audio.sfx.tap(); onBack(); } }, icon('back')) : h('span'),
      h('h1', { text: title }),
      h('div', { class: 'right' }, ...right.filter(Boolean)));
  }
  const starPill = () => h('span', { class: 'pill star-pill' }, h('span', { class: 'st on', text: '★' }), h('b', { text: String(starsTotal(p)) }));

  // ---- Eingabe: Bildschirm-Tastatur oder Mikrofon -------------------------
  async function listen(kbdHost, range, handler, { labels }) {
    const touch = p.settings.input !== 'mic';
    const kbd = createKeyboard(kbdHost, {
      lo: range[0], hi: range[1], labels, playable: touch,
      onKey: (m) => { audio.note(m); handler(m); },
    });
    if (!touch) {
      const err = await mic.start(p.calib.offset);
      if (err) kbdHost.prepend(h('div', { class: 'mic-err', text: err + ' In den Einstellungen kannst du auf die Bildschirm-Tastatur umstellen.' }));
      mic.onNote = handler;
      kbdHost.classList.add('listening');
    }
    const prev = cleanup;
    cleanup = () => { prev?.(); if (!touch) mic.stop(); mic.setContext(null); keepAwake(false); };
    keepAwake(true);
    return kbd;
  }

  // ---- Start: Papagei benennen ---------------------------------------------
  function showWelcome(rename = false) {
    const pr = parrot('neutral', rename ? `Wie soll ich ab jetzt heißen? Gerade heiße ich ${B()}.` : say('hello'), 'big row');
    const input = h('input', { class: 'name-input', type: 'text', maxLength: 14, placeholder: 'Name für den Papagei', value: rename ? p.birdName : '', autocomplete: 'off', enterKeyHint: 'done' });
    const ok = h('button', { class: 'btn primary big', text: 'Fertig', onClick: done });
    async function done() {
      const n = input.value.trim().replace(/\s+/g, ' ').slice(0, 14);
      if (!n) { kick(input, 'shake', 400); input.focus(); return; }
      input.blur();
      p.birdName = n;
      save();
      audio.sfx.collect();
      burst(pr.querySelector('.bird'), '#ffc21a', 24, 160);
      pr.say(sayB(rename ? 'renamed' : 'named'), 'jubel');
      ok.disabled = true;
      await wait(1900);
      if (rename) back(); else home();
    }
    input.addEventListener('keydown', (e) => e.key === 'Enter' && done());
    const title = h('div', { class: 'logo' }, ...[...'Inselmelodie'].map((c, i) => h('span', { text: c, style: { animationDelay: i * 0.06 + 's' } })));
    setScreen(h('div', { class: 'welcome' },
      title,
      pr,
      h('div', { class: 'name-box' },
        input,
        h('div', { class: 'chips' }, ...NAME_IDEAS.map((n) => h('button', { class: 'chip', text: n, onClick: () => { input.value = n; audio.sfx.tap(); kick(input, 'flash', 400); } }))),
        ok)), 'welcome-screen');
  }

  // ---- Inselkarte -------------------------------------------------------------
  function islandStars(isl) {
    let have = 0, max = 0;
    for (const t of isl.tasks) if (t.kind === 'song' || t.kind === 'game') { max += 3; have += p.tasks[t.id]?.stars || 0; }
    return { have, max };
  }

  let greeted = false;
  function showMap() {
    const host = h('div', { class: 'map-host' });
    const coach = parrot('zeigt', '', 'map-coach row');
    const finished = allDone(p);
    const nx = nextTask(p) || weakestTask(p);
    const fresh = !Object.keys(p.tasks).length;
    const goLabel = fresh ? 'Los geht’s' : finished ? 'Sterne sammeln' : 'Weiter üben';
    const goBtn = h('button', { class: 'btn primary big go' }, icon('play'), h('span', { class: 'go-txt' }, goLabel, h('small', { text: nx ? nx.task.title : '' })));
    goBtn.hidden = !nx;
    setScreen(h('div', { class: 'map-wrap' },
      host,
      h('header', { class: 'map-top' },
        h('div', { class: 'logo small', text: 'Inselmelodie' }),
        h('div', { class: 'right' },
          starPill(),
          h('button', { class: 'icon-btn', 'aria-label': 'Album', onClick: () => go(showAlbum) }, icon('album')),
          h('button', { class: 'icon-btn', 'aria-label': 'Einstellungen', onClick: () => go(showMore) }, icon('gear')))),
      h('div', { class: 'map-bottom' }, coach, goBtn)), 'map-screen', 'fade');

    const pending = pendingReveal(p);
    const map = createMap(host, {
      islands: ISLANDS,
      boatAt: p.boat,
      reached: p.revealed[p.revealed.length - 1] || 'i0',
      audio,
      state: (isl, idx) => ({
        open: islandOpen(p, idx), soon: !!isl.soon, done: islandDone(p, isl),
        revealed: islandShown(p, idx), ...islandStars(isl),
      }),
      onTap: (isl, idx) => tapIsland(isl, idx),
    });
    cleanup = () => map.destroy();

    const here = islandById(p.boat);
    let line = fresh ? MAP_SAY.start : finished ? MAP_SAY.allDone : fill(MAP_SAY.here, { I: (nx?.island || here).name });
    if (!greeted && !fresh) line = pick('welcome') + ' ' + line;
    greeted = true;
    coach.say(line);

    async function sailTo(isl) {
      if (p.boat === isl.id) return;
      coach.say(fill(MAP_SAY.sailTip, { I: isl.name }), 'zeigt');
      await map.travel(isl.id, { fast: true });
      p.boat = isl.id;
      save();
    }
    async function tapIsland(isl, idx) {
      if (map.busy) return;
      if (isl.soon) { coach.say(sayB('soon'), 'staunt'); buzz(20); return; }
      if (!islandShown(p, idx)) {
        coach.say(fill(MAP_SAY.locked, { I: ISLANDS[idx - 1].name }), 'staunt');
        buzz(20);
        return;
      }
      await sailTo(isl);
      go(showIsland, isl.id);
    }
    goBtn.addEventListener('click', async () => {
      if (map.busy) { map.hurry(); return; }
      if (!nx) return;
      await sailTo(nx.island);
      stack.push([showIsland, [nx.island.id]]);
      history.pushState({ d: stack.length }, '');
      go(showTask, nx.task.id);
    });

    // Hochkant: die Blase klappt nach einer Weile ein (Inseln bleiben frei), Tippen auf den Papagei zeigt sie wieder
    const bubble = coach.querySelector('.bubble');
    let tuckT = 0;
    const tuck = () => { clearTimeout(tuckT); tuckT = setTimeout(() => coach.classList.add('tucked'), 6000); };
    coach.addEventListener('click', () => { coach.classList.remove('tucked'); tuck(); });
    const say0 = coach.say;
    coach.say = (t, m) => { coach.classList.remove('tucked'); say0(t, m); tuck(); };
    tuck();
    void bubble;

    if (p.collectShow) {
      // die Feier des Sammelstücks wurde (z. B. durch Neu laden) verpasst: zuerst nachholen, die Fahrt folgt danach
      showCollect(p.collectShow);
    } else if (pending) {
      (async () => {
        await wait(700);
        coach.say(fill(MAP_SAY.sailTip, { I: pending.name }), 'jubel');
        await map.travel(pending.id);
        p.boat = pending.id;
        p.revealed.push(pending.id);
        save();
        await map.reveal(pending, ISLANDS.indexOf(pending));
        audio.sfx.unlock();
        coach.say(fill(MAP_SAY.arrived, { I: pending.name }), 'jubel');
        await wait(1200);
        goBtn.classList.add('pulse');
      })();
    } else if (finished && p.finale !== ISLANDS.length) {
      p.finale = ISLANDS.length;
      save();
      setTimeout(() => showFinale(), 600);
    }
  }

  /** Alle Inseln geschafft: einmalige Feier. */
  function showFinale() {
    audio.sfx.collect();
    setTimeout(() => audio.sfx.win(), 500);
    const overlay = h('div', { class: 'overlay' },
      h('div', { class: 'result card pop-in finale' },
        h('h2', { text: 'Alle Inseln geschafft!' }),
        h('div', { class: 'finale-row' }, ...Object.values(COLLECT).map((c, i) => pic(c, 'finale-pic spin-in', COLLECT_NAMES[c]))),
        parrot('jubel', fill(MAP_SAY.finale, {}), 'row'),
        h('button', { class: 'btn primary big', text: 'Juhu!', onClick: () => overlay.remove() })),
      confetti());
    root.append(overlay);
    overlay.querySelectorAll('.finale-pic').forEach((el, i) => { el.style.animationDelay = i * 0.18 + 's'; setTimeout(() => burst(el, '#ffc21a', 14, 90), 400 + i * 180); });
  }

  // ---- Insel: Aufgaben als Pfad aus Trittsteinen -----------------------------
  function taskIcon(t) {
    if (t.kind === 'learn') return pic(ANIMALS[t.noteKey].img, 'stone-pic', ANIMALS[t.noteKey].name);
    return h('span', { class: 'stone-ico k-' + t.kind }, icon({ tour: 'piano', song: 'note', game: 'fish' }[t.kind]));
  }

  function showIsland(id) {
    const isl = islandById(id);
    const nextId = isl.tasks.find((t) => !taskDone(p, t.id))?.id;
    const stones = isl.tasks.map((t, i) => {
      const rec = p.tasks[t.id];
      const sub = t.kind === 'song' ? (t.own ? 'Inselstück' : t.trad) : t.kind === 'game' ? 'Noten erkennen' : t.kind === 'learn' ? ANIMALS[t.noteKey].name : 'Rundgang';
      const state = rec ? 'done' : t.id === nextId ? 'next' : 'todo';
      return h('button', { class: `stone ${state} k-${t.kind}`, style: { '--i': i }, onClick: () => go(showTask, t.id) },
        h('span', { class: 'stone-disc' }, taskIcon(t), rec ? h('span', { class: 'stone-check' }, icon('check')) : null),
        h('span', { class: 'stone-title', text: t.title }),
        h('span', { class: 'stone-sub', text: sub }),
        t.kind === 'song' || t.kind === 'game' ? starRow(rec?.stars || 0) : h('span', { class: 'stars-gap' }),
        state === 'next' ? h('span', { class: 'next-flag', text: 'Hier weiter' }) : null);
    });
    const done = islandDone(p, isl);
    const msg = done ? 'Alles geschafft hier! Für mehr Sterne kannst du jedes Stück nochmal spielen.' : isl.intro;
    const { have, max } = islandStars(isl);
    setScreen(h('div', { class: 'island-view' },
      topbar({ title: isl.name, onBack: home, right: [h('span', { class: 'pill' }, h('span', { class: 'st on', text: '★' }), ` ${have}/${max}`)] }),
      h('div', { class: 'island-body' },
        h('div', { class: 'island-side' }, pic(isl.img, 'isl-big', isl.name), parrot(done ? 'jubel' : 'neutral', msg, 'col')),
        h('div', { class: 'trail' }, ...stones))), 'island-screen');
    drawTrail(root.querySelector('.trail'));
  }

  /** Gepunkteter Weg hinter den Trittsteinen (nach dem Layout gemessen, folgt Umbrüchen und Drehen). */
  function drawTrail(trail) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'trail-line');
    trail.prepend(svg);
    const draw = () => {
      const tr = trail.getBoundingClientRect();
      const pts = [...trail.querySelectorAll('.stone-disc')].map((d) => {
        const r = d.getBoundingClientRect();
        return [r.left - tr.left + trail.scrollLeft + r.width / 2, r.top - tr.top + trail.scrollTop + r.height / 2];
      });
      svg.setAttribute('width', trail.scrollWidth);
      svg.setAttribute('height', trail.scrollHeight);
      let d = '';
      pts.forEach(([x, y], i) => {
        if (!i) { d = `M${x},${y}`; return; }
        const [px, py] = pts[i - 1];
        const mx = (px + x) / 2, my = (py + y) / 2 - 24;
        d += ` Q${mx},${my} ${x},${y}`;
      });
      svg.innerHTML = `<path d="${d}" />`;
    };
    requestAnimationFrame(draw);
    const ro = new ResizeObserver(draw);
    ro.observe(trail);
    const prev = cleanup;
    cleanup = () => { prev?.(); ro.disconnect(); };
  }

  function showTask(taskId) {
    const { task } = findTask(taskId);
    if (p.settings.input === 'mic' && !p.calib.done && task.kind !== 'tour') return showCalibrate(() => showTask(taskId));
    if (task.kind === 'tour') return showTour(task);
    if (task.kind === 'learn') return showLearn(task);
    return showPlay(task);
  }

  /** Nach einer Aufgabe: Insel geschafft -> Sammelstück -> Karte (dort fährt das Boot weiter). Sonst nächste Aufgabe der Insel. */
  function afterTask(taskId, res) {
    if (res?.collect) return showCollect(res.collect);
    const { island, task } = findTask(taskId);
    const i = island.tasks.indexOf(task);
    const nx = [...island.tasks.slice(i + 1), ...island.tasks.slice(0, i)].find((t) => !taskDone(p, t.id));
    if (nx) {
      stack[stack.length - 1] = [showTask, [nx.id]];
      showTask(nx.id);
    } else back();
  }

  // ---- Rundgang (Insel 0) ---------------------------------------------------
  function tourArt(kind) {
    const box = h('div', { class: 'tour-art art-' + kind });
    if (kind === 'groups' || kind === 'middlec') {
      const kbBox = h('div', { class: 'tour-kbd' + (innerWidth < 700 ? ' few-labels' : '') });
      box.append(kbBox);
      const kb = createKeyboard(kbBox, { lo: 48, hi: 83, labels: kind === 'middlec', playable: true, onKey: (m) => { audio.note(m); if (kind === 'middlec' && m === 60) { burst(kbBox.querySelector('.key.target'), noteColor(60), 16); buzz(15); } } });
      if (kind === 'groups') {
        kb.mark([49, 51, 61, 63, 73, 75], 'g2');
        kb.mark([54, 56, 58, 66, 68, 70, 78, 80, 82], 'g3');
        box.append(h('div', { class: 'legend' }, h('span', { class: 'lg g2', text: 'zwei' }), h('span', { class: 'lg g3', text: 'drei' })));
      } else kb.setTarget(60);
    } else if (kind === 'hand' || kind === 'lefthand') {
      box.innerHTML = handSvg(kind === 'lefthand');
      if (kind === 'lefthand') box.append(h('div', { class: 'legend' }, h('span', { class: 'lg g3', text: 'linke Hand' })));
    } else if (kind === 'lowc' || kind === 'hands') {
      const kbBox = h('div', { class: 'tour-kbd' + (innerWidth < 700 ? ' few-labels' : '') });
      box.append(kbBox);
      const kb = createKeyboard(kbBox, { lo: kind === 'lowc' ? 36 : 48, hi: kind === 'lowc' ? 71 : 67, labels: true, playable: true, onKey: (m) => { audio.note(m); if (kind === 'lowc' && m === 48) { burst(kbBox.querySelector('.key.target'), noteColor(48), 16); buzz(15); } } });
      if (kind === 'lowc') { kb.setTarget(48); kb.mark([60], 'mcb'); }
      else { kb.mark([48, 50, 52, 53, 55], 'lh'); kb.mark([60, 62, 64, 65, 67], 'rh'); }
      box.append(h('div', { class: 'legend' }, ...(kind === 'lowc'
        ? [h('span', { class: 'lg lc', text: 'tiefes C' }), h('span', { class: 'lg g2', text: 'Mittel-C' })]
        : [h('span', { class: 'lg g3', text: 'linke Hand' }), h('span', { class: 'lg g2', text: 'rechte Hand' })])));
    } else if (kind === 'bass' || kind === 'grand' || kind === 'midc') {
      const sh = h('div', { class: 'staff-host tour-staff' });
      box.append(sh);
      const notes = kind === 'bass' ? [{ midi: 53, beats: 1 }] : kind === 'midc' ? [{ midi: 60, beats: 1 }] : [{ midi: 48, beats: 2 }, { midi: 60, beats: 2 }, { midi: 55, beats: 2 }, { midi: 67, beats: 2 }];
      createStaff(sh, { notes, help: { colors: true, names: true, fingers: true }, single: kind !== 'grand', layout: kind === 'midc' ? 'grand' : undefined });
    } else {
      box.append(pic('papagei-zeigt', 'tour-bird', B()));
    }
    return box;
  }

  /** Hand mit Fingernummern; gespiegelt = linke Hand (Daumen rechts). */
  function handSvg(mirror) {
    const F = [[40, 120, 1, -35], [92, 40, 2, -6], [137, 28, 3, 0], [182, 40, 4, 6], [222, 70, 5, 12]];
    const fx = (x) => (mirror ? 300 - x - 36 : x);
    return `<svg viewBox="-40 -10 380 240" class="hand">
      <rect x="70" y="110" width="160" height="100" rx="40" class="palm"/>
      ${F.map(([x, y, n, r]) => {
        const X = fx(x);
        const R = mirror ? -r : r;
        return `<g class="fing" style="--d:${n * 0.12}s" transform="rotate(${R} ${X + 18} ${y + 60})"><rect x="${X}" y="${y}" width="36" height="${n === 1 ? 70 : 100}" rx="18" class="finger"/><text x="${X + 18}" y="${y + 34}">${n}</text></g>`;
      }).join('')}
    </svg>`;
  }

  function showTour(task) {
    let i = 0;
    const view = h('div', { class: 'tour-card' });
    const dots = h('div', { class: 'dots' });
    const prev = h('button', { class: 'btn', text: 'Zurück', onClick: () => { if (i > 0) { i--; render(-1); audio.sfx.tap(); } } });
    const next = h('button', { class: 'btn primary', onClick: () => {
      audio.sfx.tap();
      if (i < task.cards.length - 1) { i++; render(1); return; }
      const res = record(p, task.id, 0);
      save();
      audio.sfx.win();
      afterTask(task.id, res);
    } });
    function render(dir = 0) {
      const c = task.cards[i];
      view.replaceChildren(tourArt(c.art), h('div', { class: 'tour-txt' }, h('h2', { text: c.title }), h('p', { text: c.text })));
      if (dir) kick(view, dir > 0 ? 'slide-l' : 'slide-r', 450);
      dots.replaceChildren(...task.cards.map((_, k) => h('span', { class: k === i ? 'on' : '' })));
      prev.disabled = i === 0;
      next.textContent = i < task.cards.length - 1 ? 'Weiter' : 'Los geht’s';
    }
    render();
    setScreen(h('div', { class: 'tour' }, topbar({ title: task.title }), view, h('div', { class: 'tour-nav' }, prev, dots, next)), 'tour-screen');
  }

  // ---- Neue Note kennenlernen ----------------------------------------------
  function showLearn(task) {
    const a = ANIMALS[task.noteKey];
    const label = noteLabel(task.note);
    const need = 3;
    let got = 0;
    const countNum = h('b', { class: 'count-num', text: `0/${need}` });
    const count = h('div', { class: 'count', 'aria-label': 'Treffer' }, ...Array.from({ length: need }, () => h('span')), countNum);
    const coach = parrot('zeigt', sayB('learnPlay', { N: label }), 'row coach');
    const staffHost = h('div', { class: 'staff-host single' });
    const kbHost = h('div', { class: 'kbd-host' });
    const cont = h('button', { class: 'btn primary big', text: 'Weiter', hidden: true });
    const animal = pic(a.img, 'animal', a.name);
    const card = h('div', { class: 'animal-card', style: { '--c': noteColor(task.note) } },
      animal,
      h('div', { class: 'animal-txt' },
        h('h2', {}, h('span', { class: 'big-letter', text: noteName(task.note) }), ` wie ${a.name}`),
        h('p', { text: a.where }),
        h('p', { text: a.key })));
    setScreen(h('div', { class: 'learn' },
      topbar({ title: task.title }),
      h('div', { class: 'learn-body' }, card, h('div', { class: 'learn-right' }, staffHost, h('div', { class: 'coach-row' }, coach, count, cont))),
      kbHost), 'learn-screen');
    const help = { ...p.settings.help, names: true, colors: true, fingers: true };
    const staff = createStaff(staffHost, { notes: [{ midi: task.note, beats: 1 }], help, single: true });
    let kb = null;
    const isl = findTask(task.id).island;
    let res = null;
    cont.addEventListener('click', () => afterTask(task.id, res));
    listen(kbHost, isl.range, onNote, { labels: p.settings.help.names }).then((k) => { kb = k; kb.setTarget(task.note); });
    mic.setContext({ want: task.note, lo: isl.range[0], hi: isl.range[1] });
    function onNote(m) {
      if (got >= need) return;
      if (m === task.note) {
        got++;
        count.children[got - 1].classList.add('on');
        countNum.textContent = `${got}/${need}`;
        staff.pop(0);
        kb?.flash(m, 'good');
        burst(staff.head(0), noteColor(m), 14);
        kick(animal, 'hop', 600);
        buzz(12);
        if (got === need) {
          res = record(p, task.id, 0);
          save();
          if (p.settings.input === 'mic') mic.stop();
          audio.sfx.win();
          burst(animal, noteColor(m), 26, 170);
          coach.say(sayB('learnDone', { N: label }), 'jubel');
          cont.hidden = false;
          kick(cont, 'pop-in', 500);
        } else coach.say(got === 1 ? 'Ja! Noch zweimal.' : 'Super, noch einmal!', 'jubel');
      } else {
        staff.ghost(m);
        staff.shake();
        kb?.flash(m, 'bad');
        buzz(35);
        coach.say(wrongLine(m, task.note) || `Das war ein ${noteName(m)}. Wir suchen das ${label}.`, 'staunt');
      }
    }
  }

  // ---- Stück / Notenspiel im Wartemodus ---------------------------------------
  function showPlay(task) {
    const isGame = task.kind === 'game';
    const notes = isGame ? noteGameNotes(task.pool, task.count, Date.now() & 0xffffffff) : task.notes;
    const run = createRun(notes, { lenient: isGame });
    const help = { ...p.settings.help };
    if (isGame) { help.names = false; help.keys = false; help.fingers = false; } // im Notenspiel wird gelesen, nicht abgelesen
    const isl = findTask(task.id).island;
    const voyage = h('div', { class: 'voyage', 'aria-hidden': 'true' },
      h('div', { class: 'voyage-sea' }, h('div', { class: 'voyage-done' })),
      pic('boot', 'voyage-boat', ''), pic(isl.img, 'voyage-goal', ''));
    const streakChip = h('span', { class: 'pill streak', hidden: true });
    const stars = starPill();
    const listenBtn = isGame ? null : h('button', { class: 'btn small', onClick: hear }, icon('ear'), h('span', { class: 'lbl-wide', text: 'Anhören' }));
    const coach = parrot('neutral', isGame ? sayB('gameStart') : sayB('songStart'), 'col coach');
    const staffHost = h('div', { class: 'staff-host' });
    const kbHost = h('div', { class: 'kbd-host' });
    setScreen(h('div', { class: 'play' },
      topbar({ title: task.title, right: [streakChip, listenBtn, stars] }),
      voyage,
      h('div', { class: 'stage' }, h('div', { class: 'coach-col' }, coach), staffHost),
      kbHost), 'play-screen');
    if (isGame) staffHost.classList.add('water');
    const staff = createStaff(staffHost, { notes, help, reveal: isGame ? 3 : 0, fish: isGame });
    staffHost.classList.add('lay-' + staff.layout.kind);
    let kb = null;
    let missHere = 0;
    let streak = 0;
    let praise = 0;
    listen(kbHost, isl.range, onNote, { labels: p.settings.help.names && !isGame }).then((k) => { kb = k; showTarget(); });
    function showTarget() {
      kb?.setTarget(help.keys || missHere > 0 ? run.want : null);
      mic.setContext({ want: run.want, lo: isl.range[0], hi: isl.range[1] });
    }
    function setVoyage() {
      const f = run.index / notes.length;
      voyage.style.setProperty('--f', f);
    }
    let playing = false;
    let hearTimer = 0;
    const listenLbl = listenBtn?.querySelector('.lbl-wide');
    function stopHear() {
      if (!playing) return;
      clearTimeout(hearTimer);
      audio.stop();
      playing = false;
      listenBtn.classList.remove('on');
      if (listenLbl) listenLbl.textContent = 'Anhören';
      staff.setIndex(run.index);
      showTarget();
      coach.say(sayB('songStart'), 'neutral');
      if (p.settings.input === 'mic') mic.mute(400);
    }
    function hear() {
      if (playing) return stopHear();
      playing = true;
      listenBtn.classList.add('on');
      if (listenLbl) listenLbl.textContent = 'Stopp';
      if (p.settings.input === 'mic') mic.mute(1e9);
      const dur = audio.playMelody(notes, { onNote: (i) => { staff.setIndex(i); staff.pop(i); kb?.setTarget(notes[i].midi); } });
      hearTimer = setTimeout(stopHear, dur * 1000 + 300);
    }
    function onNote(m) {
      if (playing) { stopHear(); return; } // eine Taste beendet nur das Vorspielen, sie wird nicht gewertet
      if (run.done) return;
      const r = run.input(m);
      if (r.result === 'hit') {
        const head = staff.head(r.index);
        staff.clearGhost();
        burst(head, noteColor(m), 12, 70);
        staff.pop(r.index);
        kb?.flash(m, 'good');
        buzz(10);
        staff.setIndex(run.index);
        if (missHere === 0) streak++;
        missHere = 0;
        setVoyage();
        if (streak >= 3) {
          streakChip.hidden = false;
          streakChip.textContent = `🔥 ${streak}`;
          kick(streakChip, 'bump', 300);
        }
        if (streak > 0 && streak % 5 === 0) {
          audio.sfx.streak(streak / 5);
          const sr = staffHost.getBoundingClientRect();
          floatText({ x: sr.left + sr.width * 0.62, y: sr.top + sr.height * 0.5 }, `Serie ${streak}!`, '#c25e00', 'big');
          coach.say(PRAISE[praise++ % PRAISE.length], 'jubel');
        } else if (run.index === Math.floor(notes.length / 2)) coach.say('Halb geschafft!', 'jubel');
        showTarget();
        if (run.done) finish();
      } else if (r.result === 'miss') {
        missHere++;
        streak = 0;
        streakChip.hidden = true;
        staff.ghost(m);
        staff.shake();
        kb?.flash(m, 'bad');
        buzz(35);
        showTarget();
        coach.say(isGame ? pick('gameWrong') : wrongLine(m, r.want) || pick('wrong', { N: noteLabel(r.want) }), 'staunt');
      }
    }
    async function finish() {
      if (p.settings.input === 'mic') mic.stop();
      const st = run.stars();
      const res = record(p, task.id, st);
      save();
      stars.querySelector('b').textContent = String(starsTotal(p));
      staff.wave();
      coach.say('Geschafft!', 'jubel');
      await wait(900);
      showResult(task, st, run.misses, res);
    }
  }

  function showResult(task, nStars, misses, res) {
    audio.sfx.win();
    const row = starRow(0, 3, 'big');
    const total = starPill();
    const coach = parrot('jubel', pick(misses === 0 ? 'perfect' : nStars === 3 ? 'almost' : nStars === 2 ? 'good' : 'ok'), 'row');
    const again = h('button', { class: 'btn', text: 'Nochmal', onClick: () => { overlay.remove(); showTask(task.id); } });
    const next = h('button', { class: 'btn primary', text: res.collect ? 'Belohnung abholen' : 'Weiter', onClick: () => { overlay.remove(); afterTask(task.id, res); } });
    const overlay = h('div', { class: 'overlay' },
      h('div', { class: 'result card pop-in' },
        h('div', { class: 'result-top' }, h('h2', { text: task.title }), total),
        row,
        h('p', { class: 'muted', text: misses === 0 ? 'Alle Noten auf Anhieb getroffen' : misses === 1 ? '1 Note mit Fehlgriff' : `${misses} Noten mit Fehlgriff` }),
        coach,
        h('div', { class: 'row' }, again, next)),
      confetti());
    root.append(overlay);
    for (const b of [again, next]) { b.disabled = true; b.classList.add('wait-in'); }
    setTimeout(() => { for (const b of [again, next]) { b.disabled = false; b.classList.remove('wait-in'); kick(b, 'pop-in', 500); } }, 600 + nStars * 420);
    [...row.children].forEach((s, i) => {
      if (i >= nStars) return;
      setTimeout(() => {
        s.classList.add('on', 'pop');
        audio.sfx.star(i);
        burst(s, '#ffc21a', 10, 60);
        buzz(15);
      }, 450 + i * 420);
    });
  }

  function confetti() {
    const box = h('div', { class: 'confetti', 'aria-hidden': 'true' });
    const cols = ['#4fae2f', '#2b86d9', '#f08c12', '#e2559c', '#e2b616', '#dc3f2c'];
    for (let i = 0; i < 40; i++) {
      box.append(h('i', { style: { left: (i * 97) % 100 + '%', background: cols[i % cols.length], animationDelay: (i % 10) * 0.11 + 's', '--r': (i * 47) % 360 + 'deg' } }));
    }
    return box;
  }

  function showCollect(item) {
    audio.sfx.collect();
    buzz(30);
    const img = pic(item, 'collect-pic spin-in', COLLECT_NAMES[item]);
    const overlay = h('div', { class: 'overlay' },
      h('div', { class: 'result card pop-in' },
        h('h2', { text: 'Insel geschafft!' }),
        h('div', { class: 'collect-glow' }, img),
        h('p', { text: `Du bekommst ${ARTIKEL[item]} ${COLLECT_NAMES[item]} für dein Inselalbum.` }),
        h('button', { class: 'btn primary big', onClick: () => { p.collectShow = null; save(); overlay.remove(); home(); } }, icon('map'), ' Leinen los!')),
      confetti());
    root.append(overlay);
    setTimeout(() => burst(img, '#ffc21a', 26, 170), 600);
  }

  // ---- Album -------------------------------------------------------------------
  function showAlbum() {
    const hint = h('p', { class: 'album-hint bubble', text: 'Tipp ein Tier an, dann erzählt es dir, wo seine Note wohnt.' });
    const items = Object.values(COLLECT).map((c) => {
      const have = p.collect.includes(c);
      const from = ISLANDS.find((i) => COLLECT[i.id] === c);
      return h('button', { class: 'album-item' + (have ? '' : ' missing'), onClick: (e) => {
        audio.sfx.tap();
        kick(e.currentTarget, 'hop', 600);
        if (have) burst(e.currentTarget.querySelector('.album-pic'), '#ffc21a', 12, 80);
        hint.textContent = have ? `${COLLECT_NAMES[c]}: gefunden auf der ${from.name}.` : `Das gibt es, wenn du die ${from.name} schaffst.`;
        kick(hint, 'in', 400);
      } }, pic(c, 'album-pic', COLLECT_NAMES[c]), h('span', { text: have ? COLLECT_NAMES[c] : '?' }));
    });
    const animals = Object.entries(ANIMALS).filter(([, a]) => !a.bass).map(([k, a]) => {
      const have = taskDone(p, 'learn-' + k);
      return h('button', { class: 'album-item' + (have ? '' : ' missing'), disabled: !have, onClick: () => showAnimal(k) },
        pic(a.img, 'album-pic', a.name), h('span', { text: have ? `${k === 'C5' ? 'hohes C' : k[0]} · ${a.name}` : '?' }));
    });
    setScreen(h('div', { class: 'album' },
      topbar({ title: 'Inselalbum', right: [starPill()] }),
      h('div', { class: 'album-body' },
        h('h2', { text: 'Sammelstücke' }), h('div', { class: 'album-grid' }, ...items), hint,
        h('h2', { text: 'Inseltiere' }), h('div', { class: 'album-grid' }, ...animals))), 'album-screen');
  }

  /** Tierkarte aus dem Album: Merkhilfe zum Nachlesen, mit der Note im Notensystem. */
  function showAnimal(k) {
    const a = ANIMALS[k];
    const midi = { C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, H4: 71, C5: 72 }[k];
    audio.note(midi);
    const staffBox = h('div', { class: 'staff-host mini' });
    const overlay = h('div', { class: 'overlay', onClick: (e) => { if (e.target === overlay) overlay.remove(); } },
      h('div', { class: 'result card pop-in animal-modal', style: { '--c': noteColor(midi) } },
        h('div', { class: 'result-top' }, h('h2', {}, h('span', { class: 'big-letter', text: k === 'C5' ? 'hohes C' : k[0] }), ` wie ${a.name}`),
          h('button', { class: 'icon-btn', 'aria-label': 'Schließen', onClick: () => overlay.remove() }, icon('close'))),
        h('div', { class: 'animal-modal-body' }, pic(a.img, 'animal', a.name), staffBox),
        h('p', { text: a.where }), h('p', { text: a.key })));
    root.append(overlay);
    createStaff(staffBox, { notes: [{ midi, beats: 1 }], help: { colors: true, names: true, fingers: true }, single: true });
  }

  // ---- Einstellungen -----------------------------------------------------------
  function toggle(label, get, set) {
    const b = h('button', { class: 'switch', role: 'switch', 'aria-label': label });
    const sync = () => { b.setAttribute('aria-checked', String(get())); b.classList.toggle('on', get()); };
    b.addEventListener('click', () => { set(!get()); save(); sync(); audio.sfx.tap(); });
    sync();
    return h('div', { class: 'set-row' }, h('span', { text: label }), b);
  }
  function showMore() {
    const seg = h('div', { class: 'seg' },
      ...[['touch', 'Bildschirm-Tastatur'], ['mic', 'Mikrofon (Klavier)']].map(([v, l]) =>
        h('button', { class: p.settings.input === v ? 'on' : '', text: l, onClick: () => { p.settings.input = v; save(); showMore(); } })));
    const calInfo = p.calib.done ? `Verstimmung gemessen: ${p.calib.offset > 0 ? '+' : ''}${p.calib.offset.toFixed(0)} Cent` : 'Noch nicht kalibriert';
    setScreen(h('div', { class: 'more' },
      topbar({ title: 'Einstellungen' }),
      h('div', { class: 'more-body' },
        h('section', { class: 'card' },
          h('h2', { text: 'Wie hört die App zu?' }), seg,
          h('p', { class: 'muted', text: p.settings.input === 'mic' ? 'Das Tablet hört über das Mikrofon, was du auf dem Klavier spielst. Beim Spielen macht die App selbst keine Töne.' : 'Du spielst auf der Tastatur am Bildschirm. Gut zum Ausprobieren ohne Klavier.' }),
          p.settings.input === 'mic' ? h('div', { class: 'row' }, h('span', { class: 'muted', text: calInfo }), h('button', { class: 'btn', text: 'Kalibrieren', onClick: () => go(showCalibrate, null) })) : null),
        h('section', { class: 'card' },
          h('h2', { text: 'Hilfen' }),
          toggle('Farbige Noten', () => p.settings.help.colors, (v) => (p.settings.help.colors = v)),
          toggle('Notennamen', () => p.settings.help.names, (v) => (p.settings.help.names = v)),
          toggle('Fingernummern', () => p.settings.help.fingers, (v) => (p.settings.help.fingers = v)),
          toggle('Taste aufleuchten lassen', () => p.settings.help.keys, (v) => (p.settings.help.keys = v))),
        h('section', { class: 'card' },
          h('h2', { text: 'Sonstiges' }),
          toggle('Töne und Effekte', () => p.settings.sound, (v) => { p.settings.sound = v; audio.enabled = v; }),
          toggle('Vibration', () => p.settings.haptics, (v) => { p.settings.haptics = v; setHaptics(v); }),
          h('div', { class: 'row' }, h('button', { class: 'btn', text: `${B()} umbenennen`, onClick: () => go(showWelcome, true) }))),
        h('details', { class: 'card adults' },
          h('summary', { text: 'Für Erwachsene' }),
          toggle('Alle Inseln offen (zum Ausprobieren)', () => p.settings.allOpen, (v) => (p.settings.allOpen = v)),
          h('div', { class: 'row' }, h('button', { class: 'btn danger', text: 'Fortschritt löschen', onClick: async () => {
            if (await confirmDialog('Alle Sterne, Sammelstücke und der Name des Papageis werden gelöscht.', { ok: 'Löschen', danger: true })) {
              Object.assign(p, defaultProgress());
              save();
              stack.length = 0;
              stack.push([showWelcome, []]);
              history.replaceState({ d: 1 }, '');
              greeted = false;
              showWelcome();
            }
          } })),
          h('p', { class: 'muted small' }, 'Vorschau-Fassung. ', h('a', { href: 'probe/', text: 'Mikrofon-Probe öffnen' }))))), 'more-screen');
  }

  // ---- Kalibrierung -------------------------------------------------------------
  function showCalibrate(then) {
    const coach = parrot('zeigt', 'Spiel das Mittel-C ein paar Mal hintereinander. Ich höre genau hin, wie dein Klavier klingt.', 'row');
    const meter = h('div', { class: 'cal-meter' }, h('div', { class: 'bar' }));
    const out = h('p', { class: 'muted', text: '' });
    const kbHost = h('div', { class: 'kbd-host' });
    const done = h('button', { class: 'btn primary big', text: 'Weiter', hidden: true, onClick: () => (then ? then() : back()) });
    setScreen(h('div', { class: 'calib' }, topbar({ title: 'Mittel-C finden' }), h('div', { class: 'calib-body' }, coach, meter, out, done), kbHost), 'calib-screen');
    const kb = createKeyboard(kbHost, { lo: 48, hi: 84, labels: false, playable: false });
    kb.setTarget(MITTEL_C);
    const samples = [];
    mic.onFrame = (f) => {
      if (samples.length >= 120) return;
      if (f.freq <= 0 || f.clarity < 0.9) return;
      const c = 1200 * Math.log2(f.freq / 261.6256);
      if (Math.abs(c) > 150) { out.textContent = 'Das klingt nach einem anderen Ton. Such das C links neben den zwei schwarzen Tasten.'; return; }
      samples.push({ freq: f.freq, midi: MITTEL_C });
      meter.firstChild.style.width = (samples.length / 120) * 100 + '%';
      if (samples.length === 120) {
        const off = calibrate(samples);
        p.calib = { offset: Math.round(off), done: true };
        save();
        mic.onFrame = null;
        mic.stop();
        audio.sfx.win();
        coach.say(Math.abs(off) > 50 ? `Gefunden! Dein Klavier ist etwas ${off < 0 ? 'tiefer' : 'höher'} gestimmt als normal, das merke ich mir.` : 'Gefunden! Jetzt kenne ich dein Klavier.', 'jubel');
        out.textContent = `Verstimmung: ${off > 0 ? '+' : ''}${off.toFixed(0)} Cent (${sciName(MITTEL_C)})`;
        done.hidden = false;
      }
    };
    mic.start(0).then((err) => { if (err) out.textContent = err; });
    cleanup = () => { mic.onFrame = null; mic.stop(); };
  }

  // ---- Start ---------------------------------------------------------------------
  audio.enabled = p.settings.sound;
  document.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  stack.length = 0;
  if (!p.birdName) {
    stack.push([showWelcome, []]);
    history.replaceState({ d: 1 }, '');
    showWelcome();
  } else {
    stack.push([showMap, []]);
    history.replaceState({ d: 1 }, '');
    showMap();
  }
  return { showMap, showIsland, showTask, get progress() { return p; } };
}
