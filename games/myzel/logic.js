import { Game } from '../../engine/kit/game.js';
import { def } from './def.js';

export function createMyzel() {
  return new Game(def);
}
export { def };
