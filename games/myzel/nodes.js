// Tree layout + view model for the Netz tab and the layer views (DOM-free, so the UI can ask "what state is this node in").
import { formatCompact } from '../../engine/format.js';

/** Row = prestige depth (top = surface). Two nodes in one row are a fork. */
export const NODES = [
  { id: 'n', row: 0, col: 0, short: 'N', name: 'Nährstoffe', layer: null },
  { id: 'h', row: 1, col: 0, short: 'H', name: 'Hyphen', layer: 'h' },
  { id: 's', row: 2, col: -1, short: 'S', name: 'Sporen', layer: 's', fork: 'a' },
  { id: 'm', row: 2, col: 1, short: 'M', name: 'Mykorrhiza', layer: 'm', fork: 'a' },
  { id: 'f', row: 3, col: 0, short: 'F', name: 'Fruchtkörper', layer: 'f' },
  // later packages: shown as silhouettes
  { id: 'l', row: 4, col: -1, short: '?', name: 'Flechte', teaser: true, fork: 'b' },
  { id: 'z', row: 4, col: 1, short: '?', name: 'Fäulnis', teaser: true, fork: 'b' },
  { id: 'w', row: 5, col: 0, short: '?', name: 'Waldnetz', teaser: true },
  { id: 'r', row: 6, col: 0, short: '?', name: 'Hexenring', teaser: true },
];
export const EDGES = [['n', 'h'], ['h', 's'], ['h', 'm'], ['s', 'f'], ['m', 'f'], ['f', 'l'], ['f', 'z'], ['l', 'w'], ['z', 'w'], ['w', 'r']];
export const nodeById = Object.fromEntries(NODES.map((n) => [n.id, n]));

/** Is any upgrade of this node buyable now (the "dot")? */
export function hasBuyable(g, id) {
  if (g.def.upgrades.some((u) => u.node === id && g.upgCanBuy(u.id))) return true;
  if (id === 'f' && g.state.layers.f.count >= 1 && !g.chActive()) return g.def.challenges.some((c) => g.chAvailable(c.id));
  return false;
}

/**
 * kind: 'open' (playable) | 'hidden' (silhouette with "?", will open) | 'choose' (fork on offer) | 'closed' (other branch of a fork,
 * locked) | 'teaser' (later package). glow = a prestige is possible, dot = something to buy.
 */
export function nodeInfo(g, id) {
  const n = nodeById[id];
  if (n.teaser) return { kind: 'teaser', glow: false, dot: false, stock: '', hint: 'Tiefer unten wächst noch etwas.' };
  const cur = (c) => g.state.cur[c].amount;
  let kind = 'open';
  let hint = '';
  if (id === 'h') {
    if (!g.layerUnlocked('h')) { kind = 'hidden'; hint = 'Sammle erst ein paar Nährstoffe.'; }
  } else if (n.fork) {
    const choice = g.forkChoice(n.fork);
    if (choice === null) {
      kind = g.forkOffered(n.fork) ? 'choose' : 'hidden';
      hint = kind === 'hidden' ? 'Das Netz gabelt sich, sobald genug Hyphen gewachsen sind.' : '';
    } else if (!g.forkIs(n.fork, id)) {
      kind = 'closed';
      hint = 'Dieser Ast bleibt zu, bis das Waldnetz ihn öffnet.';
    }
  } else if (id === 'f') {
    if (!(g.layerUnlocked('f') || g.state.layers.f.count > 0)) { kind = 'hidden'; hint = 'Verlangt Sporen oder Mykorrhiza.'; }
  }
  const open = kind === 'open';
  let stock = '';
  if (open) {
    if (id === 's' || id === 'm') stock = formatCompact(g.state.layers[id].units);
    else stock = formatCompact(cur(id));
  }
  return {
    kind,
    hint,
    stock,
    glow: (open && !!n.layer && g.canPrestige(n.layer)) || kind === 'choose',
    dot: open && hasBuyable(g, id),
  };
}
