// Oberfläche: Bildschirme der Inselkette. Logik liegt in session.js/world.js/music.js (DOM-frei).
import { h } from '../../engine/ui/dom.js';
import { confirmDialog } from '../../engine/ui/modal.js';
import { ISLANDS, islandById, findTask, say, NAME_IDEAS, ANIMALS } from './world.js';
import { createRun, noteGameNotes, record, islandOpen, islandDone, nextTask, taskDone, starsTotal, COLLECT, defaultProgress } from './session.js';
import { createStaff } from './staff.js';
import { createKeyboard } from './keyboard.js';
import { noteName, sciName, calibrate, MITTEL_C } from './notes.js';
import { noteColor, valueName } from './music.js';

const IMG = (name) => `img/${name}.webp`;
const noteLabel = (midi) => (midi === 72 ? 'hohe C' : noteName(midi));

/** Bild mit Ersatz: fehlt die Datei, bleibt ein farbiger Kreis mit Anfangsbuchstaben. */
function pic(name, cls = '', alt = '') {
  const im = h('img', { class: 'pic ' + cls, src: IMG(name), alt, draggable: false });
  im.addEventListener('error', () => {
    const f = h('div', { class: 'pic fallback ' + cls, text: (alt || name).slice(0, 1).toUpperCase() });
    im.replaceWith(f);
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
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  check: '<path d="M5 13l4 4 10-10"/>',
  piano: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 5v14M13 5v14M18 5v14"/><path d="M6 5v8h3V5M11 5v8h3V5M16 5v8h3V5" fill="currentColor"/>',
  note: '<circle cx="8" cy="17" r="3" fill="currentColor"/><path d="M11 17V4l8 3"/>',
  fish: '<path d="M3 12c4-6 11-6 15 0-4 6-11 6-15 0zM18 12l3-3v6z"/><circle cx="8" cy="11" r="1" fill="currentColor"/>',
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

  const B = () => p.birdName || 'Papagei';
  const sayB = (k, v = {}) => say(k, { B: B(), ...v });

  function setScreen(node, cls) {
    cleanup?.();
    cleanup = null;
    root.replaceChildren(h('div', { class: 'screen ' + (cls || '') }, node));
  }
  function go(fn, ...args) {
    stack.push([fn, args]);
    history.pushState({ d: stack.length }, '');
    fn(...args);
  }
  function back() {
    if (stack.length > 1) history.back();
    else showMap();
  }
  addEventListener('popstate', () => {
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

  function parrot(mood, text, cls = '') {
    const bubble = h('div', { class: 'bubble in', text });
    const box = h('div', { class: 'parrot ' + cls }, pic('papagei-' + mood, 'bird', 'Papagei'), bubble);
    box.say = (t, m) => {
      bubble.textContent = t;
      bubble.classList.remove('in');
      void bubble.offsetWidth;
      bubble.classList.add('in');
      if (m) {
        const im = box.querySelector('.bird');
        if (im && im.tagName === 'IMG') im.src = IMG('papagei-' + m);
        box.classList.remove('hop');
        void box.offsetWidth;
        box.classList.add('hop');
      }
    };
    return box;
  }

  function topbar({ title, onBack = back, right = [] }) {
    return h('header', { class: 'topbar' },
      onBack ? h('button', { class: 'icon-btn', 'aria-label': 'Zurück', onClick: onBack }, icon('back')) : h('span'),
      h('h1', { text: title }),
      h('div', { class: 'right' }, ...right));
  }

  // ---- Eingabe: Bildschirm-Tastatur oder Mikrofon -------------------------
  /** Startet die Eingabe für eine Aufgabe. handler(midi) bekommt jeden Anschlag. */
  async function listen(kbdHost, range, handler, { labels }) {
    const touch = p.settings.input !== 'mic';
    const kbd = createKeyboard(kbdHost, {
      lo: range[0], hi: range[1], labels, playable: touch,
      onKey: (m) => { audio.note(m); handler(m); },
    });
    if (!touch) {
      const err = await mic.start(p.calib.offset);
      if (err) {
        kbdHost.prepend(h('div', { class: 'mic-err', text: err + ' Du kannst in den Einstellungen auf die Bildschirm-Tastatur umstellen.' }));
      }
      mic.onNote = handler;
      kbdHost.classList.add('listening');
    }
    const prev = cleanup;
    cleanup = () => { prev?.(); if (!touch) mic.stop(); keepAwake(false); };
    keepAwake(true);
    return kbd;
  }

  // ---- Start: Papagei benennen ---------------------------------------------
  function showWelcome(rename = false) {
    const pr = parrot('neutral', rename ? `Wie soll ich ab jetzt heißen? Gerade heiße ich ${B()}.` : say('hello'), 'big');
    const input = h('input', { class: 'name-input', type: 'text', maxLength: 14, placeholder: 'Name für den Papagei', value: rename ? p.birdName : '', autocomplete: 'off' });
    const ok = h('button', { class: 'btn primary big', text: 'Fertig', onClick: done });
    function done() {
      const n = input.value.trim().replace(/\s+/g, ' ').slice(0, 14);
      if (!n) { input.focus(); input.classList.add('shake'); setTimeout(() => input.classList.remove('shake'), 400); return; }
      p.birdName = n;
      save();
      audio.sfx.collect();
      pr.say(sayB('named'), 'jubel');
      ok.disabled = true;
      setTimeout(() => (rename ? back() : (stack.length = 0, go(showMap))), 1800);
    }
    input.addEventListener('keydown', (e) => e.key === 'Enter' && done());
    setScreen(h('div', { class: 'welcome' },
      h('div', { class: 'title-art' }, h('span', { class: 'logo', text: 'Inselmelodie' })),
      pr,
      h('div', { class: 'name-box' },
        input,
        h('div', { class: 'chips' }, ...NAME_IDEAS.map((n) => h('button', { class: 'chip', text: n, onClick: () => { input.value = n; audio.sfx.tap(); } }))),
        ok)), 'welcome-screen');
  }

  // ---- Inselkarte -------------------------------------------------------------
  function islandStars(isl) {
    let have = 0;
    let max = 0;
    for (const t of isl.tasks) {
      if (t.kind === 'song' || t.kind === 'game') { max += 3; have += p.tasks[t.id]?.stars || 0; }
    }
    return { have, max };
  }

  function showMap() {
    const map = h('div', { class: 'map' });
    map.style.backgroundImage = `url(${IMG('meer')})`;
    const route = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    route.setAttribute('class', 'route');
    route.setAttribute('viewBox', '0 0 100 100');
    route.setAttribute('preserveAspectRatio', 'none');
    const pts = ISLANDS.map((i) => `${i.x},${i.y}`).join(' ');
    route.innerHTML = `<polyline points="${pts}" />`;
    map.append(route);
    ISLANDS.forEach((isl, idx) => {
      const open = islandOpen(p, idx);
      const { have, max } = islandStars(isl);
      const done = islandDone(p, isl);
      const btn = h('button', {
        class: 'island' + (open ? '' : ' locked') + (isl.soon ? ' soon' : '') + (done ? ' done' : ''),
        style: { left: isl.x + '%', top: isl.y + '%' },
        'aria-label': isl.name,
        onClick: () => (open ? go(showIsland, isl.id) : bird.say(isl.soon ? sayB('soon') : `Erst die ${ISLANDS[idx - 1].name} schaffen, dann geht es hierher.`, 'staunt')),
      },
      pic(isl.img, 'isl-img', isl.name),
      h('span', { class: 'isl-name', text: isl.name }),
      isl.soon ? h('span', { class: 'badge', text: 'bald' })
        : !open ? h('span', { class: 'badge lock' }, icon('lock'))
          : max ? h('span', { class: 'badge' }, h('span', { class: 'st on', text: '★' }), ` ${have}/${max}`) : done ? h('span', { class: 'badge' }, icon('check')) : null);
      map.append(btn);
    });
    const at = islandById(p.boat) || ISLANDS[0];
    map.append(h('div', { class: 'boat', style: { left: at.x + 8 + '%', top: at.y - 11 + '%' } }, pic('boot', '', 'Boot')));
    const bird = parrot('zeigt', sayB('mapHint'), 'map-bird');
    const nx = nextTask(p);
    setScreen(h('div', { class: 'map-wrap' },
      map,
      h('header', { class: 'map-top' },
        h('div', { class: 'logo small', text: 'Inselmelodie' }),
        h('div', { class: 'right' },
          h('span', { class: 'pill' }, h('span', { class: 'st on', text: '★' }), ' ' + starsTotal(p)),
          h('button', { class: 'icon-btn', 'aria-label': 'Album', onClick: () => go(showAlbum) }, icon('album')),
          h('button', { class: 'icon-btn', 'aria-label': 'Einstellungen', onClick: () => go(showMore) }, icon('gear')))),
      bird,
      h('div', { class: 'rotate-hint', text: 'Am schönsten ist es quer: dreh das Gerät einmal.' }),
      nx ? h('button', { class: 'btn primary big go', onClick: () => go(showIsland, nx.island.id, nx.task.id) }, icon('play'), h('span', {}, 'Weiter üben', h('small', { text: nx.task.title }))) : null), 'map-screen');
  }

  // ---- Insel ----------------------------------------------------------------
  function taskIcon(t) {
    if (t.kind === 'learn') return pic(ANIMALS[t.noteKey].img, 'task-pic', ANIMALS[t.noteKey].name);
    return h('span', { class: 'task-ico k-' + t.kind }, icon({ tour: 'piano', song: 'note', game: 'fish' }[t.kind]));
  }

  function showIsland(id, autoTask) {
    const isl = islandById(id);
    if (autoTask) { // "Weiter üben": direkt in die Aufgabe, die Insel liegt im Zurück-Stapel
      stack[stack.length - 1] = [showIsland, [id]];
      return go(showTask, autoTask);
    }
    const list = h('div', { class: 'tasks' }, ...isl.tasks.map((t) => {
      const rec = p.tasks[t.id];
      const sub = t.kind === 'song' ? (t.own ? 'Eigenes Inselstück' : t.trad) : t.kind === 'game' ? 'Noten erkennen' : t.kind === 'learn' ? ANIMALS[t.noteKey].name : 'Rundgang';
      return h('button', { class: 'task' + (rec ? ' done' : ''), onClick: () => go(showTask, t.id) },
        taskIcon(t),
        h('span', { class: 'task-txt' }, h('b', { text: t.title }), h('small', { text: sub })),
        t.kind === 'song' || t.kind === 'game' ? starRow(rec?.stars || 0) : rec ? h('span', { class: 'ok' }, icon('check')) : h('span'));
    }));
    setScreen(h('div', { class: 'island-view' },
      topbar({ title: isl.name, right: [h('span', { class: 'pill' }, h('span', { class: 'st on', text: '★' }), ` ${islandStars(isl).have}/${islandStars(isl).max}`)] }),
      h('div', { class: 'island-body' },
        h('div', { class: 'island-left' }, pic(isl.img, 'isl-big', isl.name), parrot('neutral', isl.intro, 'side')),
        list)), 'island-screen');
  }

  function showTask(taskId) {
    const { task } = findTask(taskId);
    if (p.settings.input === 'mic' && !p.calib.done && task.kind !== 'tour') return showCalibrate(() => showTask(taskId));
    if (task.kind === 'tour') return showTour(task);
    if (task.kind === 'learn') return showLearn(task);
    return showPlay(task);
  }

  /** Nach einer Aufgabe: die nächste noch offene Aufgabe derselben Insel, sonst zurück zur Insel. */
  function afterTask(taskId) {
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
      const kb = createKeyboard(box, { lo: 48, hi: 83, labels: false, playable: true, onKey: (m) => audio.note(m) });
      if (kind === 'groups') {
        kb.mark([49, 51, 61, 63, 73, 75], 'g2');
        kb.mark([54, 56, 58, 66, 68, 70, 78, 80, 82], 'g3');
      } else kb.setTarget(60);
    } else if (kind === 'hand') {
      box.innerHTML = `<svg viewBox="0 0 300 220" class="hand">
        <rect x="70" y="110" width="160" height="100" rx="40" class="palm"/>
        ${[[40, 120, 1, -35], [92, 40, 2, -6], [137, 28, 3, 0], [182, 40, 4, 6], [222, 70, 5, 12]].map(([x, y, n, r]) =>
          `<g transform="rotate(${r} ${x + 18} ${y + 60})"><rect x="${x}" y="${y}" width="36" height="${n === 1 ? 70 : 100}" rx="18" class="finger"/><text x="${x + 18}" y="${y + 34}">${n}</text></g>`).join('')}
      </svg>`;
    } else {
      box.append(pic('papagei-zeigt', 'tour-bird', 'Papagei'));
    }
    return box;
  }

  function showTour(task) {
    let i = 0;
    const view = h('div', { class: 'tour-card' });
    const dots = h('div', { class: 'dots' });
    const prev = h('button', { class: 'btn', text: 'Zurück', onClick: () => { if (i > 0) { i--; render(); } } });
    const next = h('button', { class: 'btn primary', onClick: () => {
      if (i < task.cards.length - 1) { i++; render(); return; }
      record(p, task.id, 0);
      save();
      audio.sfx.win();
      afterTask(task.id);
    } });
    function render() {
      const c = task.cards[i];
      view.replaceChildren(tourArt(c.art), h('div', { class: 'tour-txt' }, h('h2', { text: c.title }), h('p', { text: c.text })));
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
    const count = h('div', { class: 'count' }, ...Array.from({ length: need }, () => h('span')));
    const bird = parrot('zeigt', sayB('learnPlay', { N: label }), 'side small');
    const staffHost = h('div', { class: 'staff-host single' });
    const kbHost = h('div', { class: 'kbd-host' });
    const cont = h('button', { class: 'btn primary big', text: 'Weiter', hidden: true, onClick: () => afterTask(task.id) });
    const card = h('div', { class: 'animal-card', style: { '--c': noteColor(task.note) } },
      pic(a.img, 'animal', a.name),
      h('div', { class: 'animal-txt' },
        h('h2', {}, h('span', { class: 'big-letter', text: noteName(task.note) }), ` wie ${a.name}`),
        h('p', { text: a.where }),
        h('p', { text: a.key })));
    setScreen(h('div', { class: 'learn' },
      topbar({ title: task.title }),
      h('div', { class: 'learn-body' }, card, h('div', { class: 'learn-right' }, staffHost, h('div', { class: 'learn-row' }, bird, count, cont))),
      kbHost), 'learn-screen');
    const help = { ...p.settings.help, names: true, colors: true, fingers: true };
    const staff = createStaff(staffHost, { notes: [{ midi: task.note, beats: 1 }], help, single: true });
    const isl = findTask(task.id).island;
    listen(kbHost, isl.range, onNote, { labels: p.settings.help.names }).then((kb) => {
      kb.setTarget(task.note);
      staff.kb = kb;
    });
    function onNote(m) {
      if (got >= need) return;
      if (m === task.note) {
        got++;
        count.children[got - 1].classList.add('on');
        staff.pop(0);
        staff.kb?.flash(m, 'good');
        if (got === need) {
          record(p, task.id, 0);
          save();
          if (p.settings.input === 'mic') mic.stop();
          audio.sfx.win();
          bird.say(sayB('learnDone', { N: label }), 'jubel');
          cont.hidden = false;
        } else bird.say(got === 1 ? 'Ja! Noch zweimal.' : 'Super, noch einmal!', 'jubel');
      } else {
        staff.ghost(m);
        staff.kb?.flash(m, 'bad');
        bird.say(`Das war ein ${noteName(m)}. Wir suchen das ${label}.`, 'staunt');
      }
    }
  }

  // ---- Stück / Notenspiel im Wartemodus ---------------------------------------
  function showPlay(task) {
    const isGame = task.kind === 'game';
    const notes = isGame ? noteGameNotes(task.pool, task.count, Date.now() & 0xffffffff) : task.notes;
    const run = createRun(notes);
    const help = { ...p.settings.help };
    if (isGame) { help.names = false; help.keys = false; } // im Notenspiel wird gelesen, nicht abgelesen
    const isl = findTask(task.id).island;
    const prog = h('div', { class: 'prog' }, h('div', { class: 'bar' }));
    const counter = h('span', { class: 'pill', text: `0/${notes.length}` });
    const listenBtn = isGame ? null : h('button', { class: 'btn small', onClick: hear }, icon('ear'), ' Anhören');
    const bird = parrot('neutral', isGame ? sayB('gameStart') : sayB('songStart'), 'side small');
    const staffHost = h('div', { class: 'staff-host' });
    const kbHost = h('div', { class: 'kbd-host' });
    setScreen(h('div', { class: 'play' },
      topbar({ title: task.title, right: [listenBtn, counter].filter(Boolean) }),
      prog,
      h('div', { class: 'stage' }, staffHost, bird),
      kbHost), 'play-screen');
    const staff = createStaff(staffHost, { notes, help });
    let kb = null;
    let missHere = 0;
    listen(kbHost, isl.range, onNote, { labels: p.settings.help.names && !isGame }).then((k) => {
      kb = k;
      showTarget();
    });
    function showTarget() {
      if (!kb) return;
      kb.setTarget(help.keys || missHere > 0 ? run.want : null);
    }
    let playing = false;
    function hear() {
      if (playing) return;
      playing = true;
      listenBtn.classList.add('on');
      if (p.settings.input === 'mic') mic.mute(1e9);
      const dur = audio.playMelody(notes, { onNote: (i) => { staff.setIndex(i); staff.pop(i); kb?.setTarget(notes[i].midi); } });
      setTimeout(() => {
        playing = false;
        listenBtn.classList.remove('on');
        staff.setIndex(run.index);
        showTarget();
        if (p.settings.input === 'mic') mic.mute(400);
      }, dur * 1000 + 300);
    }
    function onNote(m) {
      if (playing || run.done) return;
      const r = run.input(m);
      if (r.result === 'hit') {
        staff.pop(r.index);
        kb?.flash(m, 'good');
        staff.setIndex(run.index);
        missHere = 0;
        prog.firstChild.style.width = (run.index / notes.length) * 100 + '%';
        counter.textContent = `${run.index}/${notes.length}`;
        if (run.index === Math.floor(notes.length / 2)) bird.say('Halb geschafft!', 'jubel');
        showTarget();
        if (run.done) finish();
      } else if (r.result === 'miss') {
        missHere++;
        staff.ghost(m);
        kb?.flash(m, 'bad');
        showTarget();
        bird.say(sayB('wrong', { N: noteLabel(r.want) }), 'staunt');
      }
    }
    function finish() {
      if (p.settings.input === 'mic') mic.stop();
      const stars = run.stars();
      const res = record(p, task.id, stars);
      save();
      setTimeout(() => showResult(task, stars, run.misses, res), 500);
    }
  }

  function showResult(task, stars, misses, res) {
    audio.sfx.win();
    const row = starRow(0, 3, 'big');
    const bird = parrot('jubel', sayB(stars === 3 ? 'stars3' : stars === 2 ? 'stars2' : 'stars1'), 'result-bird');
    const overlay = h('div', { class: 'overlay' },
      h('div', { class: 'result card pop-in' },
        h('h2', { text: task.title }),
        row,
        h('p', { class: 'muted', text: misses === 0 ? 'Kein Fehlgriff' : misses === 1 ? '1 Fehlgriff' : `${misses} Fehlgriffe` }),
        bird,
        h('div', { class: 'row' },
          h('button', { class: 'btn', text: 'Nochmal', onClick: () => { overlay.remove(); showTask(task.id); } }),
          h('button', { class: 'btn primary', text: 'Weiter', onClick: () => { overlay.remove(); if (res.collect) showCollect(res.collect, task.id); else afterTask(task.id); } }))),
      confetti());
    root.append(overlay);
    [...row.children].forEach((s, i) => {
      if (i < stars) setTimeout(() => { s.classList.add('on', 'pop'); audio.sfx.star(i); }, 500 + i * 450);
    });
  }

  function confetti() {
    const box = h('div', { class: 'confetti', 'aria-hidden': 'true' });
    const cols = Object.values({ a: '#4fae2f', b: '#2b86d9', c: '#f08c12', d: '#e2559c', e: '#e2b616', f: '#dc3f2c' });
    for (let i = 0; i < 36; i++) {
      box.append(h('i', { style: { left: (i * 97) % 100 + '%', background: cols[i % cols.length], animationDelay: (i % 9) * 0.12 + 's', '--r': (i * 47) % 360 + 'deg' } }));
    }
    return box;
  }

  const COLLECT_NAMES = { muschel: 'Muschel', seestern: 'Seestern', schneckenhaus: 'Schneckenhaus', truhe: 'Schatztruhe' };
  function showCollect(item, taskId) {
    audio.sfx.collect();
    const overlay = h('div', { class: 'overlay' },
      h('div', { class: 'result card pop-in' },
        h('h2', { text: 'Neues Sammelstück!' }),
        pic(item, 'collect-pic spin-in', COLLECT_NAMES[item]),
        h('p', { text: `${COLLECT_NAMES[item]} für dein Inselalbum. ${say('islandDone')}` }),
        h('button', { class: 'btn primary big', text: 'Weiter', onClick: () => { overlay.remove(); afterTask(taskId); } })),
      confetti());
    root.append(overlay);
  }

  // ---- Album -------------------------------------------------------------------
  function showAlbum() {
    const items = Object.values(COLLECT).map((c) => {
      const have = p.collect.includes(c);
      return h('div', { class: 'album-item' + (have ? '' : ' missing') }, pic(c, 'album-pic', COLLECT_NAMES[c]), h('span', { text: have ? COLLECT_NAMES[c] : '?' }));
    });
    const animals = Object.entries(ANIMALS).map(([k, a]) => {
      const have = taskDone(p, 'learn-' + k);
      return h('div', { class: 'album-item' + (have ? '' : ' missing') }, pic(a.img, 'album-pic', a.name), h('span', { text: have ? `${k === 'C5' ? 'hohes C' : k[0]} · ${a.name}` : '?' }));
    });
    setScreen(h('div', { class: 'album' },
      topbar({ title: 'Inselalbum', right: [h('span', { class: 'pill' }, h('span', { class: 'st on', text: '★' }), ' ' + starsTotal(p))] }),
      h('div', { class: 'album-body' },
        h('h2', { text: 'Sammelstücke' }), h('div', { class: 'album-grid' }, ...items),
        h('h2', { text: 'Inseltiere' }), h('div', { class: 'album-grid' }, ...animals))), 'album-screen');
  }

  // ---- Einstellungen -----------------------------------------------------------
  function toggle(label, get, set) {
    const b = h('button', { class: 'switch', role: 'switch' });
    const sync = () => { b.setAttribute('aria-checked', String(get())); b.classList.toggle('on', get()); };
    b.addEventListener('click', () => { set(!get()); save(); sync(); });
    sync();
    return h('label', { class: 'set-row' }, h('span', { text: label }), b);
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
          toggle('Alle Inseln offen (Vorschau)', () => p.settings.allOpen, (v) => (p.settings.allOpen = v)),
          h('div', { class: 'row' }, h('button', { class: 'btn', text: `${B()} umbenennen`, onClick: () => go(showWelcome, true) })),
          h('div', { class: 'row' }, h('button', { class: 'btn danger', text: 'Fortschritt löschen', onClick: async () => {
            if (await confirmDialog('Alle Sterne, Sammelstücke und der Name des Papageis werden gelöscht.', { ok: 'Löschen', danger: true })) {
              Object.assign(p, defaultProgress());
              save();
              stack.length = 0;
              showWelcome();
            }
          } })),
          h('p', { class: 'muted small' }, 'Vorschau-Fassung. ', h('a', { href: 'probe/', text: 'Mikrofon-Probe öffnen' }))))), 'more-screen');
  }

  // ---- Kalibrierung -------------------------------------------------------------
  function showCalibrate(then) {
    const bird = parrot('zeigt', 'Spiel das Mittel-C ein paar Mal hintereinander. Ich höre genau hin, wie dein Klavier klingt.', 'side');
    const meter = h('div', { class: 'cal-meter' }, h('div', { class: 'bar' }));
    const out = h('p', { class: 'muted', text: '' });
    const kbHost = h('div', { class: 'kbd-host' });
    const done = h('button', { class: 'btn primary big', text: 'Weiter', hidden: true, onClick: () => (then ? then() : back()) });
    setScreen(h('div', { class: 'calib' }, topbar({ title: 'Mittel-C finden' }), h('div', { class: 'calib-body' }, bird, meter, out, done), kbHost), 'calib-screen');
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
        bird.say(Math.abs(off) > 50 ? `Gefunden! Dein Klavier ist etwas ${off < 0 ? 'tiefer' : 'höher'} gestimmt als normal, das merke ich mir.` : 'Gefunden! Jetzt kenne ich dein Klavier.', 'jubel');
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
