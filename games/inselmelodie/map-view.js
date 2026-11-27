// Abenteuerkarte: verschiebbare Meereswelt, geschwungener Seeweg, Boot mit Papagei, Reise und Freischaltung.
import { layoutMap, ease } from './mapgeo.js';
import { burst, buzz, wait } from './fx.js';

const IMG = (n) => `img/${n}.webp`;
const NS = 'http://www.w3.org/2000/svg';

const DECO_SVG = {
  wave: '<svg viewBox="0 0 60 20"><path d="M2 14 Q 12 4 22 14 T 42 14 T 58 10" /></svg>',
  rock: '<svg viewBox="0 0 60 40"><ellipse cx="30" cy="32" rx="28" ry="7" class="foam"/><path d="M8 32 C 10 16 22 8 32 12 C 44 6 54 20 52 32 Z" class="stone"/></svg>',
  gull: '<svg viewBox="0 0 40 16"><path d="M2 10 Q 10 0 20 10 Q 30 0 38 10" /></svg>',
};

/**
 * @param {HTMLElement} host
 * @param {{islands:any[], state:(isl,idx)=>{open:boolean,done:boolean,soon:boolean,have:number,max:number,revealed:boolean},
 *          boatAt:string, reached:string, audio:any, onTap:(isl,idx)=>void}} opt
 */
export function createMap(host, opt) {
  const scroll = document.createElement('div');
  scroll.className = 'map-scroll';
  host.append(scroll);
  let geo = null;
  let world = null;
  let boat = null;
  let gold = null;
  let boatLen = 0;
  let reachedLen = 0;
  const islandEls = {};
  let alive = true;
  let busy = false;

  function build() {
    const r = host.getBoundingClientRect();
    const portrait = r.height > r.width;
    geo = layoutMap({ w: Math.max(320, r.width), h: Math.max(320, r.height), padTop: portrait ? 110 : r.height < 460 ? 50 : 64, padBottom: portrait ? 180 : r.height < 460 ? 78 : 118 });
    scroll.classList.toggle('portrait', geo.portrait);
    world = document.createElement('div');
    world.className = 'world';
    world.style.width = geo.width + 'px';
    world.style.height = geo.height + 'px';
    world.style.backgroundImage = `url(${IMG('meer')})`;

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'route-svg');
    svg.setAttribute('width', geo.width);
    svg.setAttribute('height', geo.height);
    const mk = (cls, d) => {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('class', cls);
      p.setAttribute('d', d);
      svg.append(p);
      return p;
    };
    mk('route-shadow', geo.pathTo());
    mk('route', geo.pathTo());
    gold = mk('route-gold', '');
    world.append(svg);

    for (const d of geo.deco) {
      const el = document.createElement('div');
      el.className = 'deco deco-' + d.k;
      el.innerHTML = DECO_SVG[d.k];
      el.style.left = d.x + 'px';
      el.style.top = d.y + 'px';
      el.style.animationDelay = -((d.u * 7) % 5000) / 1000 + 's';
      world.append(el);
    }

    opt.islands.forEach((isl, idx) => {
      const at = geo.islands[isl.id];
      const st = opt.state(isl, idx);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'island';
      b.setAttribute('aria-label', isl.name);
      b.style.left = at.x + 'px';
      b.style.top = at.y + 'px';
      b.style.width = geo.islandSize + 'px';
      const img = document.createElement('img');
      img.className = 'isl-img';
      img.src = IMG(isl.img);
      img.alt = '';
      img.draggable = false;
      const name = document.createElement('span');
      name.className = 'isl-name';
      name.textContent = isl.name;
      const badge = document.createElement('span');
      badge.className = 'badge';
      b.append(img, name, badge);
      b.addEventListener('click', () => !busy && !dragged && opt.onTap(isl, idx));
      world.append(b);
      islandEls[isl.id] = { el: b, badge };
      paintIsland(isl, idx, st);
    });

    boat = document.createElement('div');
    boat.className = 'boat';
    boat.innerHTML = `<div class="boat-inner"><img src="${IMG('boot')}" alt="" draggable="false"><img class="boat-bird" src="${IMG('papagei-neutral')}" alt="" draggable="false"></div>`;
    const bs = Math.round(Math.max(64, Math.min(120, geo.islandSize * 0.6)));
    boat.style.width = boat.style.height = bs + 'px';
    boat.style.margin = `${-Math.round(bs * 0.73)}px 0 0 ${-Math.round(bs / 2)}px`;
    world.append(boat);

    scroll.replaceChildren(world);
    boatLen = geo.dockAt(opt.boatAt);
    reachedLen = geo.dockAt(opt.reached);
    placeBoat(boatLen, 1);
    gold.setAttribute('d', geo.pathTo(Math.max(reachedLen, boatLen)));
    focusLen(boatLen, false);
  }

  function paintIsland(isl, idx, st) {
    const { el, badge } = islandEls[isl.id];
    el.classList.toggle('locked', !st.open || !st.revealed);
    el.classList.toggle('soon', st.soon);
    el.classList.toggle('done', st.done);
    el.classList.toggle('here', isl.id === opt.boatAt && !st.done);
    badge.className = 'badge';
    if (st.soon) badge.textContent = 'bald';
    else if (!st.open || !st.revealed) { badge.textContent = '🔒'; badge.classList.add('lock'); }
    else if (st.max) badge.innerHTML = `<span class="st on">★</span> ${st.have}/${st.max}`;
    else badge.textContent = st.done ? '✓' : '';
    badge.hidden = !badge.textContent && !badge.innerHTML;
  }

  function placeBoat(len, dir) {
    const p = geo.pointAt(len);
    const flip = (dir ?? Math.sign(p.dx)) < 0 ? -1 : 1;
    boat.style.transform = `translate(${p.x}px, ${p.y}px)`;
    boat.firstChild.style.setProperty('--flip', flip);
  }

  function focusLen(len, smooth = true) {
    const p = geo.pointAt(len);
    const r = scroll.getBoundingClientRect();
    const left = geo.portrait ? 0 : p.x - r.width * 0.45;
    const top = geo.portrait ? p.y - r.height * 0.42 : 0;
    scroll.scrollTo({ left, top, behavior: smooth ? 'smooth' : 'instant' });
  }

  // Maus: Karte mit gedrückter Taste ziehen (Touch scrollt nativ mit Schwung)
  let drag = null;
  let dragged = false;
  scroll.addEventListener('pointerdown', (e) => {
    dragged = false;
    if (e.pointerType !== 'mouse') return;
    drag = { x: e.clientX, y: e.clientY, l: scroll.scrollLeft, t: scroll.scrollTop };
  });
  const onMove = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) dragged = true;
    scroll.scrollLeft = drag.l - dx;
    scroll.scrollTop = drag.t - dy;
  };
  const onUp = () => { drag = null; setTimeout(() => { dragged = false; }, 0); };
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);

  // ab und zu springt ein Delfin in der Nähe des Bootes
  const dolphinTimer = setInterval(() => {
    if (!alive || document.hidden || !geo) return;
    const p = geo.pointAt(boatLen + (Math.random() - 0.3) * 600);
    const d = document.createElement('img');
    d.className = 'dolphin';
    d.src = IMG('tier-d-delfin');
    d.alt = '';
    d.style.left = p.x + (geo.portrait ? 60 : 0) + 'px';
    d.style.top = p.y + (geo.portrait ? 0 : 90) + 'px';
    world.append(d);
    setTimeout(() => d.remove(), 2200);
  }, 9000);

  /** Boot fährt von seiner Anlegestelle zur Anlegestelle der Insel `toId`. */
  async function travel(toId) {
    busy = true;
    const from = boatLen;
    const to = geo.dockAt(toId);
    const dist = Math.abs(to - from);
    const dur = Math.max(1200, Math.min(3400, dist * 2.2));
    opt.audio.sfx.sail?.();
    boat.classList.add('sailing');
    const t0 = performance.now();
    let lastWake = 0;
    await new Promise((done) => {
      const step = (now) => {
        if (!alive) return done();
        const t = Math.min(1, (now - t0) / dur);
        boatLen = from + (to - from) * ease(t);
        const p = geo.pointAt(boatLen);
        placeBoat(boatLen, Math.sign(to - from) * Math.sign(p.dx || 1));
        if (boatLen > reachedLen) gold.setAttribute('d', geo.pathTo(boatLen));
        const r = scroll.getBoundingClientRect();
        if (geo.portrait) scroll.scrollTop += (p.y - r.height * 0.42 - scroll.scrollTop) * 0.12;
        else scroll.scrollLeft += (p.x - r.width * 0.45 - scroll.scrollLeft) * 0.12;
        if (now - lastWake > 70) {
          lastWake = now;
          const w = document.createElement('i');
          w.className = 'wake';
          w.style.left = p.x + 'px';
          w.style.top = p.y + 'px';
          world.append(w);
          setTimeout(() => w.remove(), 1200);
        }
        if (t < 1) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });
    boat.classList.remove('sailing');
    reachedLen = Math.max(reachedLen, boatLen);
    opt.audio.sfx.arrive?.();
    busy = false;
  }

  /** Insel freischalten: Schloss springt weg, Insel wird bunt, Funken. */
  async function reveal(isl, idx) {
    const { el } = islandEls[isl.id];
    el.classList.add('unlocking');
    await wait(450);
    paintIsland(isl, idx, { ...opt.state(isl, idx), revealed: true, open: true });
    burst(el, '#ffc21a', 22, 140);
    buzz(25);
    opt.audio.sfx.collect();
    await wait(700);
    el.classList.remove('unlocking');
    el.classList.add('here');
  }

  let resizeT = 0;
  const ro = new ResizeObserver(() => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (alive && !busy) build(); }, 150);
  });
  build();
  ro.observe(host);

  return {
    travel,
    reveal,
    get busy() { return busy; },
    focusIsland: (id, smooth) => focusLen(geo.dockAt(id), smooth),
    destroy() {
      alive = false;
      clearInterval(dolphinTimer);
      ro.disconnect();
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
    },
  };
}
