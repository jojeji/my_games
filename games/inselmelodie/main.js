// Einstieg: Spielstand laden, Klang und Mikrofon anlegen, Oberfläche starten.
import { createSaveStore, mergeDefaults } from '../../engine/save.js';
import { registerServiceWorker } from '../../engine/pwa.js';
import { defaultProgress } from './session.js';
import { createAudio } from './audio.js';
import { createMic } from './mic.js';
import { mountApp } from './ui.js';

// Version 2: geführte Inselreise. Die erste Vorschau speicherte "alle Inseln offen" als Standard: zurücksetzen,
// damit Bootsfahrt und Freischaltung zu sehen sind (Sterne und Sammelstücke bleiben).
const MIGRATIONS = {
  1: (d) => {
    if (d.settings) d.settings.allOpen = false;
    d.revealed = ['i0'];
    d.boat = 'i0';
    return d;
  },
};
const store = createSaveStore({ id: 'inselmelodie', version: 2, migrations: MIGRATIONS });
const loaded = store.load();
const progress = mergeDefaults(defaultProgress(), loaded ? loaded.data : {});
const save = () => store.save(progress);

const app = mountApp(document.getElementById('app'), { progress, save, audio: createAudio(), mic: createMic() });
addEventListener('pagehide', save);
window.__inselmelodie = { app, progress, save };
registerServiceWorker('../../sw.js');
