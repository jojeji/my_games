// Psst! entry point.
import { registerServiceWorker } from '../../engine/pwa.js';
import { createStore } from './store.js';
import { createPackStore } from './packs.js';
import { createFeedback, createWakeLock } from './audio.js';
import { mountPsst } from './ui.js';

const store = createStore();
const packs = createPackStore();
const feedback = createFeedback(() => store.settings());
const wake = createWakeLock();
const app = mountPsst({ root: document.getElementById('app'), store, packs, feedback, wake });
registerServiceWorker('../../sw.js');
window.psst = app; // handy for debugging in the console
