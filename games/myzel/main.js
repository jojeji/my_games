// Myzel entry point: wires logic -> runtime -> UI.
import { createMyzel } from './logic.js';
import { createRuntime } from '../../engine/core.js';
import { registerServiceWorker } from '../../engine/pwa.js';
import { mountMyzel } from './ui.js';

const g = createMyzel();
const runtime = createRuntime(g);
const offline = runtime.load(); // may return an offline-progress summary
runtime.start();
mountMyzel({ root: document.getElementById('app'), runtime, offline });
registerServiceWorker('../../sw.js');
window.myzel = { game: g, runtime }; // handy for debugging in the console
