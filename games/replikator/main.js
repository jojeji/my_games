// Replikator entry point: wires logic -> runtime -> standard mobile UI.
import { createReplikator } from './logic.js';
import { globalParts } from './def.js';
import { TUNE } from './tune.js';
import { CAST, metCast, lineText } from './characters.js';
import { createRuntime } from '../../engine/core.js';
import { mountStandardApp } from '../../engine/ui/standard-app.js';
import { registerServiceWorker } from '../../engine/pwa.js';
import { formatPercent } from '../../engine/format.js';

const g = createReplikator();
const runtime = createRuntime(g);
const offline = runtime.load(); // may return an offline-progress summary
runtime.start();

mountStandardApp({
  root: document.getElementById('app'),
  runtime,
  offline,
  options: {
    gameId: 'replikator',
    title: 'Replikator',
    primary: 'matter',
    chips: ['blueprints', 'systems', 'cores'],
    generators: { chain: 'matter', label: 'Generatoren' },
    multParts: globalParts,
    chronicle: { cast: CAST, figures: metCast, lineText, defaultWho: 'sonde' }, // Chronik tab, story modals and bubbles (story.js)
    bonusText: (game) => `Erfolgs-Bonus: +${formatPercent(0.02 * game.achCount(), 0)} auf alle Produktion`,
    layers: [
      {
        id: 'replication',
        label: 'Replikation',
        icon: 'replication',
        visible: (game) => game.state.cur.matter.best.gte(TUNE.repThreshold / 30),
        groups: [{ id: 'replication', title: 'Blaupausen-Upgrades' }],
      },
      {
        id: 'expansion',
        label: 'Expansion',
        icon: 'expansion',
        visible: (game) => game.state.cur.blueprints.total.gte(TUNE.expThreshold / 30),
        groups: [{ id: 'expansion', title: 'Expansions-Upgrades' }],
        challenges: true,
      },
      {
        id: 'singularity',
        label: 'Singularität',
        icon: 'singularity',
        groups: [
          {
            id: 'research',
            title: 'Forschung',
            research: true,
            branches: {
              '': { title: 'Grundlage' },
              A: { title: 'Pfad der Masse', sub: 'rohe Produktion' },
              B: { title: 'Pfad der Effizienz', sub: 'Kosten & Gewinne' },
              C: { title: 'Pfad der Automation', sub: 'weniger Klicks' },
              D: { title: 'Spezialforschung' },
            },
          },
        ],
      },
    ],
  },
});

registerServiceWorker('../../sw.js');
window.replikator = { game: g, runtime }; // handy for debugging in the console
