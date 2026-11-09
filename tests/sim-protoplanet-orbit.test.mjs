// Deploy-Sperre fuer Protoplanet Kapitel 3 "Protostern", Teil 1 (Lehrlevels 3-1..3-3 und 3-4 Staubguertel): der Bot (Planer mit Vorwaertssimulation, orbit-bot.js)
// loest die festen Seeds (mindestens 2 von 3 Varianten) und die Familie ueber 30 Zufalls-Seeds zu >= 80 %. Kriterien: tests/helpers/protoplanet-sim.mjs.
import { simLevels } from './helpers/protoplanet-sim.mjs';

simLevels(['3-1', '3-2', '3-3', '3-4']);
