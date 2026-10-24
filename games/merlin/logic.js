import { Game } from '../../engine/kit/game.js';
import { def } from './def.js';

export function createMerlin() {
  return new Game(def);
}
export { def };
