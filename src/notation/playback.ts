// Works out what a parsed piece sounds like: every note with its MIDI pitches,
// start and length in seconds. Repeats are played once.

import { lastDuration, type Piece, type Token } from './parse';
import { isRestToken, stateAt, tupletGroups } from './render';

export interface NoteEvent {
  start: number;
  duration: number;
  midi: number[];
}

// A moment to mark while playing, e.g. a progression bar starting.
export interface Cue {
  start: number;
  id: number;
}

export interface Performance {
  events: NoteEvent[];
  // Seconds from the first beat to the end of the last measure.
  length: number;
  cues?: Cue[];
}

const STEPS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const DEFAULT_BPM = 100;

// C4 = 60, as on the chromatic staff.
function midiOf(letter: string, accidentals: string, octave: number): number {
  const shift = (accidentals.match(/#/g)?.length ?? 0) - (accidentals.match(/b/g)?.length ?? 0);
  return (octave + 1) * 12 + STEPS[letter.toLowerCase()] + shift;
}

// Length in quarter notes: w or 1 is 4, h or 2 is 2, q or 4 is 1, 8 is ½ ...
function quarters(duration: string, dots: number): number {
  const n = ({ w: 1, h: 2, q: 4 } as Record<string, number>)[duration] ?? Number(duration);
  return (4 / n) * (2 - 2 ** -dots);
}

// A measure's length in quarter notes; "C" (common time) is 4/4.
function measureQuarters(time: string): number {
  if (time.startsWith('C')) return 4;
  const [beats, unit] = time.split('/').map(Number);
  return (beats * 4) / unit;
}

// Open strings of a tab tuning, string 1 first: E/5,B/4,... (written pitch).
function openStrings(tuning: string): number[] {
  return tuning.split(',').map((n) => {
    const [, letter, acc, octave] = n.match(/^([A-G])([#b]?)\/(\d)$/)!;
    return midiOf(letter, acc, Number(octave));
  });
}

interface Sound {
  midi: number[];
  quarters: number;
}

// What one note, chord or rest sounds like. `duration` is the length carried
// over from earlier notes, for EasyScore notes that don't give their own.
function sound(tok: Token, duration: string, strings: number[], percussion: boolean): Sound {
  if (tok.chroma) return { midi: tok.chroma.rest ? [] : tok.chroma.midi, quarters: quarters(tok.chroma.duration, tok.chroma.dots) };
  if (tok.tab) {
    const midi = tok.tab.rest ? [] : tok.tab.positions.flatMap((p) => (p.fret === 'x' || !strings[p.str - 1] ? [] : [strings[p.str - 1] + p.fret]));
    return { midi, quarters: quarters(tok.tab.duration, tok.tab.dots) };
  }
  const core = tok.core.replace(/\[[^\]]*\]/g, '');
  const pitches = core.split('/')[0];
  const dots = core.split('.').length - 1;
  const midi = isRestToken(tok) || percussion ? [] : [...pitches.matchAll(/([A-G])([#bn@d+]*)(\d+)/gi)]
    .map((m) => midiOf(m[1], m[2], Number(m[3])));
  return { midi, quarters: quarters(duration, dots) };
}

export function perform(piece: Piece): Performance {
  // Each voice's sounds, by measure.
  const voices = piece.staves.flatMap((staff, si) => {
    const strings = staff.kind === 'tab' ? openStrings(staff.tuning) : [];
    return staff.voices.map((voice) => {
      let duration = 'q';
      return voice.measures.map((measure, mi) => {
        const percussion = staff.kind === 'notation' && stateAt(piece, mi).clefs[si] === 'percussion';
        const scale = measure.tokens.map(() => 1);
        for (const g of tupletGroups(measure.tokens)) {
          for (let i = g.start; i <= g.end; i++) scale[i] = g.notesOccupied / g.numNotes;
        }
        return measure.tokens.map((tok, i) => {
          if (!tok.tab && !tok.chroma) duration = lastDuration(tok.core) ?? duration;
          const s = sound(tok, duration, strings, percussion);
          return { ...s, quarters: s.quarters * scale[i], tie: tok.tie };
        });
      });
    });
  });

  // Measures are as long as their time signature, so voices stay together,
  // but a short first or last measure (a pickup) is played as written.
  const starts: number[] = [];
  let at = 0;
  for (let m = 0; m < piece.measureCount; m++) {
    starts.push(at);
    const written = Math.max(0, ...voices.map((v) => (v[m] ?? []).reduce((sum, s) => sum + s.quarters, 0)));
    const full = measureQuarters(stateAt(piece, m).time);
    const edge = m === 0 || m === piece.measureCount - 1;
    at += !written ? full : edge ? written : Math.max(written, full);
  }

  const tempo = piece.tempo;
  const bpm = tempo?.bpm ?? DEFAULT_BPM;
  const perQuarter = 60 / (bpm * (tempo?.bpm ? quarters(tempo.duration, tempo.dots) : 1));

  const events: NoteEvent[] = [];
  for (const voice of voices) {
    // A note tied over from the one before lengthens it instead of sounding again.
    let tied: NoteEvent | null = null;
    voice.forEach((measure, m) => {
      let t = starts[m];
      for (const s of measure) {
        const same = tied && tied.midi.length === s.midi.length && tied.midi.every((n, i) => n === s.midi[i]);
        if (tied && same) tied.duration += s.quarters * perQuarter;
        else if (s.midi.length) {
          tied = { start: t * perQuarter, duration: s.quarters * perQuarter, midi: s.midi };
          events.push(tied);
        }
        if (!s.tie || !s.midi.length) tied = null;
        t += s.quarters;
      }
    });
  }
  events.sort((a, b) => a.start - b.start);
  return { events, length: at * perQuarter };
}
