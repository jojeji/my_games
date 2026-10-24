// Merlin entry point: wires logic -> runtime -> UI.
import { createMerlin } from './logic.js';
import { createRuntime } from '../../engine/core.js';
import { registerServiceWorker } from '../../engine/pwa.js';
import { mountMerlin } from './ui.js';

const g = createMerlin();
const runtime = createRuntime(g);
const offline = runtime.load(); // may return an offline-progress summary
runtime.start();
mountMerlin({ root: document.getElementById('app'), runtime, offline });
registerServiceWorker('../../sw.js');
window.merlin = { game: g, runtime }; // handy for debugging in the console
