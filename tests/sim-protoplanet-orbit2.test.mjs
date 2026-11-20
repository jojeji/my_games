// Deploy-Sperre fuer Protoplanet Kapitel 3 "Protostern", Teil 2 (3-5 Kometen, 3-6 Enges System). Kriterien: tests/helpers/protoplanet-sim.mjs.
import { simLevels } from './helpers/protoplanet-sim.mjs';

// 3-5 (rev 2): das Ziel wiegt nur 1,4-1,7, der Bot hoert nach dem Absorbieren auf (Endmasse ~4,7 statt 9): Mindest-Endmasse 4 statt 6, wie bei 3-7 (docs/protoplanet.md, "Nach dem Live-Gang: 3-5")
simLevels(['3-5', '3-6'], { endMass: { '3-5': 4 } });
