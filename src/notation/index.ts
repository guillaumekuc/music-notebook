// Music notation snippets, rendered with VexFlow (MIT). Notes are written in
// VexFlow's EasyScore syntax; this format adds measures, staves, tab and the
// marks EasyScore leaves to code:
//
//   clef treble                 treble, bass, alto, tenor, percussion
//   key G                       key signature (C, G, F#, Bb, Am, ...)
//   time 4/4                    time signature
//   tempo "Allegro" q=132       tempo mark
//   width 700                   width in px; measures wrap onto new lines
//   staff bass                  starts another staff (a grand staff with two)
//   staff tab notation          a tab staff, with notation worked out above
//   voice C5/q, B4 | E4/h~, E4  `|` separates measures; ||  |]  |:  :| bars
//   lyrics Hel- lo world        one word per note of the voice above
//
// On a note: C4/h~ tie · (C4/8, D4, E4) slur · {C5/8, D5, E5} triplet ·
// prefixes . - > ^ @ (staccato, tenuto, accent, marcato, fermata),
// "Am7" text above, _"text" below, !mf! dynamics. At the start of a measure:
// [key D] [time 3/4] [clef bass]. Tab notes are fret/string, e.g. 5/3,
// (0/1 2/2)/h, r for a rest, then h p s b v for hammer-on, pull-off, slide,
// bend and vibrato.

import { Font, VexFlow } from 'vexflow/core';
import bravuraUrl from '@vexflow-fonts/bravura/bravura.woff2?inline';
import academicoUrl from '@vexflow-fonts/academico/academico.woff2?inline';
import { parseNotation } from './parse';
import { renderPiece, type RenderedNotation } from './render';

export { NotationError } from './parse';
export type { RenderedNotation } from './render';

// --- Fonts ---

let fonts: Promise<void> | null = null;

// The music font must be loaded before anything is measured or drawn.
export function loadNotationFonts(): Promise<void> {
  fonts ??= Promise.all([
    Font.load('Bravura', bravuraUrl, { display: 'block' }),
    Font.load('Academico', academicoUrl, { display: 'swap' }),
  ]).then(() => VexFlow.setFonts('Bravura', 'Academico'));
  return fonts;
}

export function renderNotation(code: string): RenderedNotation {
  return renderPiece(parseNotation(code, { hasKey: (k) => VexFlow.hasKeySignature(k) }));
}

// A copy of the drawing that renders anywhere: the music fonts are embedded,
// since an exported file (or an <img>) can't use the page's fonts.
export function standaloneSvg(svg: SVGSVGElement): string {
  const ns = 'http://www.w3.org/2000/svg';
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', ns);
  const style = document.createElementNS(ns, 'style');
  style.textContent =
    `@font-face{font-family:"Bravura";src:url(${bravuraUrl}) format("woff2")}` +
    `@font-face{font-family:"Academico";src:url(${academicoUrl}) format("woff2")}`;
  clone.prepend(style);
  return new XMLSerializer().serializeToString(clone);
}
