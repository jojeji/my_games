// Deploy-Sperre fuer Protoplanet Kapitel 1, Teil 1 (Lehrlevels 1-1..1-3 und 1-4, 1-5): der Bot (games/protoplanet/bot.js, gleiche Physik wie das Spiel) loest die festen Seeds
// (mindestens 2 von 3 Varianten) und die Familien ueber 30 Zufalls-Seeds zu >= 80 %. Die Kriterien stehen in tests/helpers/protoplanet-sim.mjs.
// Die Bot-Tests sind auf mehrere Dateien verteilt, damit sie parallel laufen (node --test startet je Datei einen Prozess).
import { simLevels } from './helpers/protoplanet-sim.mjs';

simLevels(['1-1', '1-2', '1-3', '1-4', '1-5']);
