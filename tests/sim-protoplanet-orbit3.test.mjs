// Deploy-Sperre fuer Protoplanet Kapitel 3 "Protostern", Teil 3 (3-7 Planet). Kriterien: tests/helpers/protoplanet-sim.mjs.
// 3-7 (Ziel unangreifbar) endet im Median bei ~4,5 Massen: der Planet (2,6-3 Massen) ist der Massstab, nicht die Gesamtmasse der Welt.
import { simLevels } from './helpers/protoplanet-sim.mjs';

simLevels(['3-7'], { endMass: { '3-7': 3.5 } });
