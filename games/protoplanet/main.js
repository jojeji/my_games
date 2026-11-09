import { createProgress } from './state.js';
import { mountApp } from './ui.js';
import { registerServiceWorker } from '../../engine/pwa.js';

const progress = createProgress();
const app = mountApp(document.getElementById('app'), progress);
window.__protoplanet = app; // Hilfe fuer Tests im Browser
window.__protoplanetProgress = progress;
registerServiceWorker('../../sw.js');
