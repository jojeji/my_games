// Replikator game logic: the generic kit Game configured with this game's definition.
import { Game } from '../../engine/kit/game.js';
import { def } from './def.js';

export function createReplikator() {
  return new Game(def);
}

export { def };
