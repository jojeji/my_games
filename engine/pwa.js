// Service worker registration + "install app" prompt capture.
let deferredPrompt = null;
const listeners = new Set();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    listeners.forEach((fn) => fn(true));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    listeners.forEach((fn) => fn(false));
  });
}

/** @param {string} swUrl path to the root sw.js, relative to the calling page (e.g. '../../sw.js') */
export function registerServiceWorker(swUrl) {
  if (!('serviceWorker' in navigator)) return;
  addEventListener('load', () => {
    navigator.serviceWorker.register(swUrl).catch((e) => console.warn('[sw] Registrierung fehlgeschlagen', e));
  });
}

export const canInstall = () => !!deferredPrompt;
export const onInstallAvailable = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const res = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return res.outcome === 'accepted';
}

export const isStandalone = () =>
  (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
