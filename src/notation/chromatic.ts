// A chromatic staff after Klaus Lieber (1983): lines a whole step apart, six
// per octave (C D E F# G# A#), every C a bold line between the octaves. Notes
// are MIDI numbers (60 = C4): even numbers sit on lines, odd ones in spaces.
// Noteheads repeat that 6-6 pattern, solid on lines and hollow in spaces, so a
// half note is told from a quarter by its double stem (as in TwinNote).
//
// VexFlow does the rest (stems, beams, flags, dots, ties, tuplets). A note is
// given the VexFlow key whose staff position matches its own, and the stave
// places its middle line where VexFlow expects it (note line 3), so VexFlow's
// stem and beam rules work unchanged.

import { Dot, StaveModifier, StaveModifierPosition, StaveNote, Stem, type Factory, type Stave } from 'vexflow/core';
import type { Staff } from './parse';

const FONT = 'Academico';
const SOLID = ''; // noteheadBlack
const HOLLOW = ''; // noteheadHalf
const WHOLE_SOLID = ''; // noteheadWholeFilled
const WHOLE_HOLLOW = ''; // noteheadWhole

// A note's duration as a number: VexFlow keeps w, h and q as written.
const ALIASES: Record<string, string> = { w: '1', h: '2', q: '4' };
const durationOf = (note: StaveNote) => ALIASES[note.getDuration()] ?? note.getDuration();

export interface ChromaticGeometry {
  // Octaves shown, as in C4 = 60: low 3, high 5 shows C3 (48) to the C6 line.
  low: number;
  high: number;
  // MIDI numbers of the top line, bottom line and middle line.
  top: number;
  bottom: number;
  middle: number;
  lines: number;
}

export const octaveOf = (midi: number) => Math.floor(midi / 12) - 1;

export function geometry(low: number, high: number): ChromaticGeometry {
  const top = 12 * (high + 2);
  const bottom = 12 * (low + 1);
  const lines = (top - bottom) / 2 + 1;
  return { low, high, top, bottom, middle: top - (lines - 1), lines };
}

// The octaves a staff shows: its range, or else the octaves its notes are in.
export function staffGeometry(staff: Staff): ChromaticGeometry {
  if (staff.octaves) return geometry(...staff.octaves);
  const notes = staff.voices.flatMap((v) => v.measures.flatMap((m) => m.tokens.flatMap((t) => t.chroma?.midi ?? [])));
  if (!notes.length) return geometry(4, 4);
  return geometry(octaveOf(Math.min(...notes)), octaveOf(Math.max(...notes)));
}

// VexFlow's note line for a MIDI number: half a line per semitone, with the
// middle line of the staff on line 3.
const noteLine = (g: ChromaticGeometry, midi: number) => 3 + (midi - g.middle) / 2;

// The VexFlow key that sits on that line in the treble clef (C4 is line 0,
// and each letter is half a line).
function keyFor(g: ChromaticGeometry, midi: number): string {
  const step = 2 * noteLine(g, midi) + 28;
  const octave = Math.floor(step / 7);
  return `${'CDEFGAB'[step - octave * 7]}/${octave}`;
}

class ChromaticNote extends StaveNote {
  // Runs again whenever VexFlow rebuilds the note (e.g. a new stem direction).
  buildNoteHeads() {
    const heads = super.buildNoteHeads();
    if (!this.isRest()) {
      const whole = durationOf(this) === '1';
      for (const head of heads) {
        const onLine = Number.isInteger(head.getLine());
        head.text = whole ? (onLine ? WHOLE_SOLID : WHOLE_HOLLOW) : onLine ? SOLID : HOLLOW;
      }
    }
    return heads;
  }

  // Ledger lines only beyond the staff's outer lines (VexFlow assumes five).
  drawLedgerLines() {
    if (this.isRest()) return;
    const stave = this.checkStave();
    const ctx = this.checkContext();
    const half = (stave.getNumLines() - 1) / 2;
    const lines = this.getKeyProps().map((p) => p.line);
    const glyph = this.getGlyphWidth();
    const up = this.getStemDirection() === Stem.UP;
    // Displaced chord notes sit beside the stem, right of it when it points up.
    const x = this.getNoteHeadBeginX() - 3 - (this.displaced && !up ? glyph : 0);
    const width = glyph + 6 + (this.displaced ? glyph : 0);
    ctx.save();
    this.applyStyle(ctx, { ...stave.getDefaultLedgerLineStyle(), ...this.getLedgerLineStyle() });
    const ledger = (line: number) => {
      const y = stave.getYForNote(line);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + width, y);
      ctx.stroke();
    };
    for (let line = 3 + half + 1; line <= Math.max(...lines); line++) ledger(line);
    for (let line = 3 - half - 1; line >= Math.min(...lines); line--) ledger(line);
    ctx.restore();
  }

  // Stems keep their usual length: VexFlow lengthens them to reach the middle
  // line, which on a staff of several octaves can be far away.
  getStemExtension() {
    return (Object.getPrototypeOf(StaveNote.prototype) as StaveNote).getStemExtension.call(this);
  }

  // A second stem for half notes, on the side away from the notehead.
  drawStem(options?: Parameters<StaveNote['drawStem']>[0]) {
    super.drawStem(options);
    if (durationOf(this) !== '2' || !this.hasStem()) return;
    const ctx = this.checkContext();
    const { topY, baseY } = this.getStemExtents();
    const x = this.getStemX() + 3.5 * this.getStemDirection();
    ctx.save();
    ctx.setLineWidth(Stem.WIDTH);
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, topY);
    ctx.stroke();
    ctx.restore();
  }
}

export interface ChromaticNoteSrc {
  midi: number[];
  rest: boolean;
  duration: string;
  dots: number;
}

// stem: 1 up, -1 down, 0 worked out from the notes.
export function chromaticNote(g: ChromaticGeometry, src: ChromaticNoteSrc, stem: number): StaveNote {
  const note = new ChromaticNote({
    // A rest sits on the middle line.
    keys: src.rest ? ['B/4'] : src.midi.map((n) => keyFor(g, n)),
    duration: src.duration,
    dots: src.dots,
    type: src.rest ? 'r' : undefined,
    clef: 'treble',
    autoStem: stem === 0,
  });
  if (stem !== 0) note.setStemDirection(stem);
  if (src.dots) Dot.buildAndAttach([note], { all: true });
  return note;
}

// The bold C lines, drawn over the stave's own lines.
class OctaveLines extends StaveModifier {
  static get CATEGORY() {
    return 'ChromaticOctaveLines';
  }

  draw() {
    const stave = this.checkStave();
    const ctx = this.checkContext();
    ctx.save();
    ctx.setStrokeStyle('#000');
    ctx.setLineWidth(2.2);
    for (let line = 0; line < stave.getNumLines(); line += 6) {
      const y = stave.getYForLine(line);
      ctx.beginPath();
      ctx.moveTo(stave.getX(), y);
      ctx.lineTo(stave.getX() + stave.getWidth(), y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// The octave numbers that take the place of a clef, one per octave.
class OctaveNumbers extends StaveModifier {
  static get CATEGORY() {
    return 'ChromaticOctaveNumbers';
  }

  constructor(private g: ChromaticGeometry) {
    super();
    const longest = Math.max(String(g.low).length, String(g.high).length);
    this.setWidth(9 * longest + 4);
  }

  draw() {
    const stave = this.checkStave();
    const ctx = this.checkContext();
    ctx.save();
    ctx.setFont(FONT, 15, 'bold');
    for (let octave = this.g.low; octave <= this.g.high; octave++) {
      // Halfway between the octave's C and the next one.
      const line = (this.g.top - 12 * (octave + 1)) / 2 - 3;
      ctx.fillText(String(octave), this.getX(), stave.getYForLine(line) + 5);
    }
    ctx.restore();
  }
}

export function chromaticStave(factory: Factory, g: ChromaticGeometry, x: number, width: number, lineStart: boolean): Stave {
  const stave = factory.Stave({ x, y: 0, width, options: { numLines: g.lines, leftBar: false } });
  const middleLine = (g.lines - 1) / 2;
  stave.getYForNote = (line: number) => stave.getYForLine(middleLine) - (line - 3) * stave.getSpacingBetweenLines();
  stave.addModifier(new OctaveLines(), StaveModifierPosition.ABOVE);
  if (lineStart) stave.addModifier(new OctaveNumbers(g), StaveModifierPosition.BEGIN);
  return stave;
}
