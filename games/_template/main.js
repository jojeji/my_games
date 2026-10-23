import { createGame } from './logic.js';
import { createRuntime } from '../../engine/core.js';
import { mountStandardApp } from '../../engine/ui/standard-app.js';
import { registerServiceWorker } from '../../engine/pwa.js';

const g = createGame();
const runtime = createRuntime(g);
const offline = runtime.load();
runtime.start();

mountStandardApp({
  root: document.getElementById('app'),
  runtime,
  offline,
  options: {
    gameId: g.id,
    title: g.def.title,
    primary: 'coins',
    chips: ['gems'],
    generators: { chain: 'coins' },
    multParts: (game) => [['Glücksbringer', game.upgEffect('boost')]],
    layers: [{ id: 'rebirth', icon: 'replication', visible: (game) => game.state.cur.coins.best.gte(1e4), groups: [{ id: 'rebirth', title: 'Upgrades' }] }],
  },
});
registerServiceWorker('../../sw.js');
