// The ending of Myzel. ALL ending text lives here (story.js takes the lines for the Chronik entry `end_ring`, ui.js shows it as a dialog).
// Short, warm, dry. Shown once as a dialog when the fifth Hexenring closes (also when it happened while the app was closed); the game goes on afterwards (Nachspiel).
// Setups it resolves (STIMMEN.md): the old yew is not the last one (thirteen stumps, connected), the "Untermieter" is entered under family,
// Kurt sees the ring from above and finishes his sentence, the Hexen rumour stays.
import { T } from './characters.js';

const m = (t) => ({ who: 'myzel', t });
const t = (x) => ({ who: 'taxus', t: x });
const k = (x) => ({ who: 'kurt', t: x });

export const ENDING = {
  title: 'Der Ring schließt sich',
  lines: [
    m('Der fünfte Ring liegt. Unter dem Wald hängt jetzt alles an allem, auch die dreizehn Stümpfe im Osten. Ihre Wurzeln leben noch, schwach. Sie sind angeschlossen.'),
    t('Dreizehn. Ich führe seit Jahrhunderten Buch, diese Zeile hatte ich nie. Du bist kein Untermieter mehr, ich habe dich umgetragen.'),
    m('Wohin?'),
    t('Unter Familie. Die Spalte gab es nicht. Ich habe sie angelegt.'),
    k('Ein Kreis! Von oben! Ein ziemlich guter! Ich wollte nur kurz sagen–'),
    m('Ja?'),
    k('Dass du gut aussiehst.'),
    m('Ich kann es nicht nachprüfen. Ich glaube es ihm. Er hat keinen Grund zu lügen und keine Zeit.'),
    m('Die Zweibeiner werden weiter behaupten, Hexen hätten die Ringe ins Gras getanzt. Ich lasse sie. Es war Pilz, aber das Gerücht ist besser als die Wahrheit.'),
  ],
};

/** A line for the Hexenring view after the ending (Nachspiel). */
export const NACHSPIEL = {
  title: 'Nachspiel',
  text: `Der Kreis ist geschlossen. Jeder weitere Ring macht den Wald ein bisschen dichter. ${T} führt ein neues Buch. Die Zahlen laufen weiter.`,
};
