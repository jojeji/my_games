// Hub: reads games.json and renders one card per game (no hard-coded list).
import { h } from './engine/ui/dom.js';
import { registerServiceWorker } from './engine/pwa.js';

const list = document.getElementById('games');
const hint = document.getElementById('hint');

const hasSave = (id) => {
  try {
    return !!localStorage.getItem(`mg:${id}:save`);
  } catch {
    return false;
  }
};

async function main() {
  let games = [];
  try {
    const res = await fetch('games.json', { cache: 'no-cache' });
    games = await res.json();
  } catch (e) {
    hint.textContent = 'Spieleliste konnte nicht geladen werden. Bist du offline und hast die Seite noch nie geöffnet?';
    return;
  }
  for (const g of games) {
    const playable = g.status === 'playable';
    const action = playable
      ? h('a', { class: 'btn btn-primary', href: g.path, text: hasSave(g.id) ? 'Weiterspielen' : 'Spielen' })
      : h('span', { class: 'badge', text: 'Bald verfügbar' });
    list.append(
      h('li', { class: 'card game-card' + (playable ? '' : ' soon') },
        h('img', { src: g.icon, alt: '', width: 72, height: 72, loading: 'lazy' }),
        h('div', {}, h('h2', { text: g.title }), h('p', { text: g.description })),
        h('div', { class: 'game-actions' }, action),
      ),
    );
  }
  if (!games.length) hint.textContent = 'Noch keine Spiele eingetragen.';
}

main();
registerServiceWorker('sw.js');
