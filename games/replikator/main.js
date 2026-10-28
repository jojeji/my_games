// Replikator entry point: wires logic -> runtime -> standard mobile UI.
import { createReplikator } from './logic.js';
import { globalParts } from './def.js';
import { TUNE } from './tune.js';
import { CAST, metCast, lineText } from './characters.js';
import { createRuntime } from '../../engine/core.js';
import { mountStandardApp } from '../../engine/ui/standard-app.js';
import { registerServiceWorker } from '../../engine/pwa.js';
import { formatPercent } from '../../engine/format.js';
import { buildGalaxyTab } from './map-view.js';
import { buildGenomeTab } from './genome-view.js';
import { statusBanner } from './commands-view.js';
import { anoPending, ANO_BY_ID } from './anomalies.js';
import { mutUnlocked, mutPending } from './mutations.js';
import { act2Active, claimable, canClaim, SECTOR } from './map.js';

const g = createReplikator();
const runtime = createRuntime(g);
const offline = runtime.load(); // may return an offline-progress summary
runtime.start();

const { app } = mountStandardApp({
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
    banner: statusBanner, // running Sondenbefehl / Anomalie with the time left, on every tab
    bonusText: (game) => `Erfolgs-Bonus: +${formatPercent(0.02 * game.achCount(), 0)} auf alle Produktion`,
    // Akt II: the Galaxie tab appears when the map exists; a dot says a sector is affordable
    extraTabs: [
      {
        id: 'galaxie',
        label: 'Galaxie',
        icon: 'galaxy',
        visible: (game) => act2Active(game),
        dot: (game) => !!anoPending(game) || claimable(game).some((i) => canClaim(game, i).ok),
        build: buildGalaxyTab,
      },
      // Paket 3: the Genom tab appears with the first mutation offer (3 sectors); a dot says an offer waits
      {
        id: 'genom',
        label: 'Genom',
        icon: 'genome',
        visible: (game) => mutUnlocked(game),
        dot: (game) => mutPending(game) > 0,
        build: buildGenomeTab,
      },
    ],
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

// arrival toasts only where no story entry tells the same news (the first sector, every Ruine, the first Echo occupation)
runtime.on('map-claim', ({ type, n }) => {
  if (n > 1 && type !== 'ruine') app.toast(`${SECTOR[type].name} erschlossen.`, { kind: 'good', title: 'Sektor ' + n });
});
runtime.on('mut-offer', ({ n }) => {
  if (n > 1 && !g.autoActive('auto_genom')) app.toast('Im Genom-Tab wartet ein neues Mutationsangebot.', { kind: 'info', title: 'Kopierfehler' });
});
// Paket 4: a new anomaly waits in the Galaxie tab (the first one has its story dialog), the end of a rule change says what it brought
runtime.on('anomaly', ({ type, n }) => {
  if (n > 1) app.toast(`${ANO_BY_ID[type].name} wartet im Galaxie-Tab.`, { kind: 'info', title: 'Anomalie' });
});
runtime.on('anomaly-start', ({ type, text }) => {
  if (text) app.toast(text, { kind: 'good', title: ANO_BY_ID[type].name });
});
runtime.on('anomaly-end', ({ type, text }) => app.toast(text || 'Vorbei.', { kind: 'good', title: ANO_BY_ID[type].name + ' vorbei' }));
runtime.on('spell', ({ id, auto }) => {
  if (!auto) app.toast(g.spellById[id].info(g), { kind: 'info', title: g.spellById[id].name, ms: 2200 });
});
runtime.on('echo-occupy', ({ n }) => {
  if (n > 1) app.toast('Das Echo hat einen weiteren Sektor besetzt.', { kind: 'info' });
});

registerServiceWorker('../../sw.js');
window.replikator = { game: g, runtime }; // handy for debugging in the console
