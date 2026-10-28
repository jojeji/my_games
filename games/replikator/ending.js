// Replikator Akt II - the ending (Paket 6). Pure and DOM-free. State: g.state.rep2.end.
//  - Akt II is complete when all six galaxy types are in the Archiv. Then the question about the Echo is open: Verschmelzen or Abgrenzen (a choice that cannot be skipped,
//    UI: ending-view.js). The game goes on afterwards (endless jumps, Auto-Sprung).
//  - Verschmelzen ('merge'): in every FUTURE map the cells of the Echo are yours for nothing (map.js: the first cell and one more per `mapEchoEvery` paid sectors).
//    Abgrenzen ('split'): the Echo leaves the maps; permanent bonus: Erschliessungen faster, every prestige gain bigger (after the softcap, ripening like all gain factors).
//  - The other ending opens `endSecondJumps` jumps after the first and adds its bonus (the bonuses stack: with both, the Echo is gone and its cells are still yours).
import { D } from '../../engine/decimal.js';
import { TUNE as T } from './tune.js';
import { GAL_ORDER, archiveCount } from './galaxy.js';
import { ripen } from './mutations.js';

export const ENDINGS = {
  merge: {
    id: 'merge',
    name: 'Verschmelzen',
    short: 'Die zwei Kopien werden eine.',
    // `after` = the sentence for the card in the choice dialog / the Archiv
    bonus: () => 'Ab der nächsten Galaxie gehören dir die Sektoren des Echos: der am Rand und einer je zwei erschlossene. Sie zählen als erschlossen und kosten nichts.',
    bonusShort: 'Die Echo-Sektoren jeder neuen Karte gehören dir',
  },
  split: {
    id: 'split',
    name: 'Abgrenzen',
    short: 'Jede geht ihren Weg.',
    bonus: () =>
      `Ab sofort dauern Erschließungen ×${n(T.endFx.split.trip)} so lang und alle Gewinne (Blaupausen, Sternsysteme, Quantenkerne) sind ×${n(T.endFx.split.gain)}. Das Echo verlässt die Karten.`,
    bonusShort: 'Erschließung schneller, alle Gewinne größer',
  },
};
export const END_ORDER = ['merge', 'split'];
const n = (x) => String(+Number(x).toFixed(2)).replace('.', ',');

/** Default `state.rep2.end` (merged into rep2State by map.js). */
export function endState() {
  return {
    picked: { merge: 0, split: 0 }, // play time of the choice (0 = not chosen)
    order: [], // chosen endings in order
    jumps0: 0, // jump count at the first choice (the second ending opens `endSecondJumps` jumps later)
  };
}

/** Migration 6 -> 7: Ende von Akt II (state.rep2.end comes through mergeDefaults; nothing to carry over). */
export function migrateToEnd(data) {
  data.v = 7;
  return data;
}

const E = (g) => g.state.rep2.end;
const act2 = (g) => !!g.state.rep2.act2;

/** All six galaxy types are in the Archiv: the story of Akt II is told to its end. */
export const endAvailable = (g) => act2(g) && archiveCount(g) >= GAL_ORDER.length;
export const endHas = (g, kind) => !!(E(g) && E(g).picked[kind] > 0);
export const endCount = (g) => (E(g) ? END_ORDER.filter((k) => E(g).picked[k] > 0).length : 0);
/** The first choice is open (the dialog is up until it is made). */
export const endPending = (g) => endAvailable(g) && endCount(g) === 0;
/** Jumps still needed before the other ending opens (0 = open or nothing to wait for). */
export const endJumpsLeft = (g) => (endCount(g) === 1 ? Math.max(0, T.endSecondJumps - (g.state.layers.jump.count - E(g).jumps0)) : 0);
/** The other ending, if it can be chosen now. */
export const endSecond = (g) => (endCount(g) === 1 && endJumpsLeft(g) === 0 ? END_ORDER.find((k) => !endHas(g, k)) : null);
/** What the dialog / the Archiv may offer right now: both for the first choice, the missing one for the second. */
export const endOptions = (g) => (endPending(g) ? END_ORDER.slice() : endSecond(g) ? [endSecond(g)] : []);

/** Make a choice. Returns false when it is not allowed (not open / already chosen). */
export function endChoose(g, kind) {
  if (!ENDINGS[kind] || !endOptions(g).includes(kind)) return false;
  const e = E(g);
  const second = endCount(g) === 1;
  e.picked[kind] = Math.max(0.001, g.state.time.played);
  e.order.push(kind);
  if (!second) e.jumps0 = g.state.layers.jump.count;
  g.plog('end', `Ende: ${kind}${second ? ' (zweites)' : ''}`);
  g.refresh();
  g.emit('ending', { kind, second });
  return true;
}

/** The decision of the sim's player: the first ending at once (`pick`), the other one when it opens. Returns the kind chosen or null. */
export function endPlay(g, pick = ['merge', 'split']) {
  const opts = endOptions(g);
  const kind = pick.find((k) => opts.includes(k));
  return kind && endChoose(g, kind) ? kind : null;
}

/* ------------------------------------------------------------------ */
/* Effects                                                              */
/* ------------------------------------------------------------------ */

/** Factor on the Erschliessung time (Abgrenzen). */
export const endTrip = (g) => (endHas(g, 'split') ? T.endFx.split.trip : 1);

/** Labeled factor on a prestige gain (after the softcap; above 1 it ripens with the run time like all gain factors). */
export function endGainParts(g, kind) {
  if (!endHas(g, 'split')) return [];
  const r = ripen(g, kind, T.endFx.split.gain);
  return r !== 1 ? [['Abgrenzung', D(r)]] : [];
}
export const endGain = (g, kind) => endGainParts(g, kind).reduce((a, [, v]) => a.mul(v), D(1));

/** Flags a new map takes over when it is generated (map.js): `merge` = free Echo cells, `split` = no Echo. */
export const endMapFlags = (g) => ({ merge: endHas(g, 'merge'), split: endHas(g, 'split') });
