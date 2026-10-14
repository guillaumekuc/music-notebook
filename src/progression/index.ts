// Chord progression snippets, drawn as a bar grid. Each chord shows its symbol
// and its chord relationship (CR) to the chord before it; either can be
// written, and the other is worked out.
//
//   root A                      optional: the root the first chord relates to
//   width 700                   width in px
//   section A                   a label for the rows that follow
//   | Am | bIII.M | F  E7 :|    one row of bars; `|` separates bars, and
//                               ||  |]  |:  :|  :|:  :|x3 are bar lines
//   |: Dm |[1 E7 :|[2 Am |]     [1 [2 start 1st and 2nd endings
//
// In a bar: `C / / G` holds C for three slots; `%` repeats the previous bar;
// N.C. is no chord. A chord is a symbol (Am, Bb7, F#m7b5, G/B) or a CR:
// interval.quality(added), e.g. bIII.M, V.M(b7), bVI.M(7,9). The interval is
// a Roman numeral up from the previous root, the quality M m d A, and the
// added intervals 7 (major 7th), b7, 9, #11, ... The first chord of a
// progression with no root is I.<quality>, e.g. I.m(11).

import { parseProgression } from './parse';
import { renderProgression as draw, type RenderedProgression } from './render';

export { ProgressionError } from './parse';
export type { RenderedProgression } from './render';

export function renderProgression(code: string): RenderedProgression {
  return draw(parseProgression(code));
}
