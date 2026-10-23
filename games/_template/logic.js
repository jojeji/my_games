import { Game } from '../../engine/kit/game.js';
import { def } from './def.js';

export const createGame = () => new Game(def);
export { def };
