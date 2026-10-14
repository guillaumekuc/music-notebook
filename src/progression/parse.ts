// Reads progression code into rows of bars, then works out each chord's
// symbol and chord relationship (see index.ts for the syntax).

import {
  CHORD, QUALITIES, ROMANS, addedLabel, analyzeSuffix, buildSuffix, chordTones, mod12, normalizeAdded,
  parseNumeral, parseRoot, pitchClass, prettyChord, rootName, transpose,
  type Numeral, type Quality, type Root,
} from './theory';

export class ProgressionError extends Error {}

export const MIN_WIDTH = 200;
export const MAX_WIDTH = 4000;

export type BarLine = 'single' | 'double' | 'end' | 'repeatBegin' | 'repeatEnd';

// One slot of a bar. Slots share the bar evenly; `/` widens the one before.
export interface Slot {
  kind: 'chord' | 'hold' | 'nc';
  span: number;
  symbol?: string; // e.g. `C7`; missing when the root isn't known
  label?: string; // the CR, e.g. `m ♭III M (♭7)`
  sound?: Sound; // for chords
}

// What a chord sounds like, as pitch classes and semitones. A progression with
// no root sounds as if it started on C.
export interface Sound {
  root: number;
  tones: number[]; // semitones above the root
  bass: number;
}

export interface Bar {
  slots: Slot[];
  simile: boolean; // `%`: the previous bar again
  left: BarLine;
  right: BarLine;
  repeatCount?: number; // on a repeatEnd: `:|x3`
  ending?: number; // the 1st/2nd ending this bar is under
  endingStart?: boolean;
}

export interface Row {
  bars: Bar[];
  section?: string;
}

export interface Progression {
  width: number;
  rows: Row[];
  tempo: number; // quarter notes per minute
  barQuarters: number; // quarter notes in a bar
  // What the grid shows above it: the tempo and time when they were written.
  marks: { tempo?: number; time?: string };
}

export const DEFAULT_TEMPO = 100;

// A chord as worked out: what it relates to the next one with.
interface Resolved {
  root: Root | null;
  quality: Quality | null;
  pitch: number; // the sounding root, known even when `root` isn't
}

type ChordToken =
  | { kind: 'absolute'; root: Root; quality: Quality | null; added: string[]; text: string; bass: Root | null }
  | { kind: 'relative'; numeral: Numeral; sharp: boolean; quality: Quality; added: string[] };

// `bIII.M(9)`, `V.M(b7)`, `I.m(11)`.
const RELATIVE = /^([#b♯♭]?(?:I|II|III|IV|V|VI|VII))\.([MmdA])(?:\(([^)]*)\))?$/;

function parseChord(text: string, fail: (msg: string) => never): ChordToken {
  const rel = text.match(RELATIVE);
  if (rel) {
    const numeral = parseNumeral(rel[1]);
    if (!numeral) fail(`Unknown interval "${rel[1]}"`);
    const added = (rel[3] ?? '').split(',').map((a) => a.trim()).filter(Boolean).map((a) => {
      return normalizeAdded(a) ?? fail(`Unknown added interval "${a}" in "${text}" (use 7, b7, 9, #11, ...)`);
    });
    return { kind: 'relative', numeral, sharp: /^[#♯]/.test(rel[1]), quality: rel[2] as Quality, added };
  }
  if (/^[#b♯♭]?(I|V)/.test(text) || text.includes('.')) {
    fail(`Can't read "${text}": a chord relationship is interval.quality, e.g. I.m, bIII.M or V.M(b7), with a quality of ${QUALITIES.join(' ')}`);
  }
  if (!CHORD.test(text)) fail(`Unknown chord "${text}"`);
  const m = text.match(/^([A-G][#b♯♭]?)(.*?)(?:\/([A-G][#b♯♭]?))?$/)!;
  const analysis = analyzeSuffix(m[2]);
  if (!analysis) fail(`Can't read the chord "${text}"`);
  return { kind: 'absolute', root: parseRoot(m[1])!, ...analysis, text, bass: m[3] ? parseRoot(m[3]) : null };
}

// Bar lines, longest first, with an optional ending (`[1`) after them.
const BAR_LINE = /(:\|:|:\|(?:x\d+)?|\|:|\|\||\|\]|\|)/;

function barLines(sep: string): { right: BarLine; left: BarLine; count?: number } {
  if (sep === ':|:') return { right: 'repeatEnd', left: 'repeatBegin' };
  if (sep.startsWith(':|')) return { right: 'repeatEnd', left: 'single', count: sep.length > 2 ? Number(sep.slice(3)) : undefined };
  if (sep === '|:') return { right: 'single', left: 'repeatBegin' };
  if (sep === '||') return { right: 'double', left: 'single' };
  if (sep === '|]') return { right: 'end', left: 'single' };
  return { right: 'single', left: 'single' };
}

export function parseProgression(code: string): Progression {
  let width = 700;
  let tempo = DEFAULT_TEMPO;
  let barQuarters = 4;
  const marks: Progression['marks'] = {};
  let start: Root | null = null;
  let section: string | undefined;
  const rows: Row[] = [];

  // Resolution state, carried across rows in written order.
  let prev: Resolved | null = null;
  let beforeEndings: Resolved | null = null;
  let ending: number | undefined;

  code.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    const fail = (msg: string): never => {
      throw new ProgressionError(`Line ${index + 1}: ${msg}`);
    };
    if (!line || line.startsWith('#') || line === 'progression') return;

    const word = line.split(/\s+/)[0];
    const rest = line.slice(word.length).trim();
    if (word === 'width') {
      const w = Number(rest);
      if (!Number.isFinite(w) || w < MIN_WIDTH || w > MAX_WIDTH) fail(`Width must be ${MIN_WIDTH}–${MAX_WIDTH}`);
      width = w;
      return;
    }
    if (word === 'tempo') {
      const t = Number(rest);
      if (!Number.isFinite(t) || t < 20 || t > 400) fail('Tempo must be 20–400 (quarter notes per minute)');
      tempo = t;
      marks.tempo = t;
      return;
    }
    if (word === 'time') {
      const m = rest.match(/^(\d+)\/(1|2|4|8|16)$/);
      if (!m || Number(m[1]) < 1) fail('Time must look like 4/4, 3/4 or 6/8');
      barQuarters = (Number(m![1]) * 4) / Number(m![2]);
      marks.time = rest;
      return;
    }
    if (word === 'root') {
      if (rows.length) fail('Put root before the first bar');
      start = parseRoot(rest) ?? fail(`Unknown root "${rest}" (use a note name like A, Bb or F#)`);
      return;
    }
    if (word === 'section') {
      if (!rest) fail('A section needs a name, e.g. section A');
      section = rest;
      return;
    }

    // A row of bars. Parts alternate: bar content, bar line, bar content, ...
    // Empty content (before a leading or after a trailing bar line) adds no bar.
    const parts = line.split(BAR_LINE);
    const bars: Bar[] = [];
    let left: BarLine = 'single';
    for (let i = 0; i < parts.length; i += 2) {
      const after = parts[i + 1] ? barLines(parts[i + 1]) : null;
      const tokens = parts[i].trim().split(/\s+/).filter(Boolean);
      if (!tokens.length) {
        const last = bars[bars.length - 1];
        if (after && last && last.right === 'single' && after.right !== 'single') {
          last.right = after.right;
          last.repeatCount = after.count;
        }
        if (after && after.left !== 'single') left = after.left;
        continue;
      }

      const bar: Bar = { slots: [], simile: false, left, right: after?.right ?? 'single', repeatCount: after?.count };
      left = after?.left ?? 'single';

      const endingMark = tokens[0].match(/^\[(\d+)$/);
      if (endingMark) {
        tokens.shift();
        const n = Number(endingMark[1]);
        if (n === 1 || beforeEndings === null) beforeEndings = prev;
        else prev = beforeEndings;
        ending = n;
        bar.endingStart = true;
      } else if (/^\[/.test(tokens[0])) fail(`Unknown ending "${tokens[0]}" (use [1, [2, ...)`);
      bar.ending = ending;

      if (tokens.length === 1 && tokens[0] === '%') {
        const previous = bars[bars.length - 1] ?? rows[rows.length - 1]?.bars.slice(-1)[0];
        if (!previous) fail('% repeats the previous bar, but this is the first one');
        bar.simile = true;
        bar.slots = previous.slots; // drawn as %, but played again
        prev = lastChord(previous) ?? prev;
      } else {
        for (const t of tokens) {
          if (t === '%') fail('% stands for a whole bar, on its own between bar lines');
          if (t === '/') {
            if (bar.slots.length) bar.slots[bar.slots.length - 1].span++;
            else bar.slots.push({ kind: 'hold', span: 1 });
            continue;
          }
          if (t === 'N.C.' || t === 'NC') {
            bar.slots.push({ kind: 'nc', span: 1 });
            continue;
          }
          const { slot, resolved } = resolve(parseChord(t, fail), prev, start);
          prev = resolved;
          resolvedSlots.set(slot, resolved);
          bar.slots.push(slot);
        }
      }

      // An ending lasts until the next bar line that isn't a plain one.
      if (bar.right !== 'single') ending = undefined;
      if (bar.right === 'end' || bar.right === 'double') beforeEndings = null;
      bars.push(bar);
    }
    if (!bars.length) fail('A row needs at least one bar');
    ending = undefined;
    rows.push({ bars, section });
    section = undefined;
  });

  if (!rows.length) throw new ProgressionError('No bars yet: write chords between bar lines, e.g. | Am | bIII.M | F |');
  return { width, rows, tempo, barQuarters, marks };
}

// The chord a bar ends on, for a `%` that repeats it.
const resolvedSlots = new WeakMap<Slot, Resolved>();
function lastChord(bar: Bar): Resolved | undefined {
  const chords = bar.slots.filter((s) => s.kind === 'chord');
  return chords.length ? resolvedSlots.get(chords[chords.length - 1]) : undefined;
}

// Works out a chord's symbol and CR from the chord before it (or, for the
// first chord, from the progression's root).
function resolve(token: ChordToken, prev: Resolved | null, start: Root | null): { slot: Slot; resolved: Resolved } {
  const slot: Slot = { kind: 'chord', span: 1 };
  const from = prev ? prev.root : start;
  const fromPitch = prev ? prev.pitch : start ? pitchClass(start) : 0;

  let root: Root | null;
  let semitones: number | null;
  if (token.kind === 'absolute') {
    root = token.root;
    semitones = from ? mod12(pitchClass(root) - pitchClass(from)) : null;
    slot.symbol = prettyChord(token.text);
  } else {
    root = from ? transpose(from, token.numeral, token.sharp) : null;
    semitones = token.numeral.semitones;
    if (root) slot.symbol = rootName(root) + buildSuffix(token.quality, token.added);
  }

  const to = token.quality ?? '?';
  const added = addedLabel(token.added);
  if (prev) {
    if (semitones !== null) slot.label = `${prev.quality ?? '?'} ${ROMANS[semitones]} ${to}${added}`;
  } else {
    // Nothing before it: the quality, after the interval up from the root.
    const interval = semitones ? `${ROMANS[semitones]} ` : '';
    slot.label = `${interval}${to}${added}`;
  }
  const pitch = token.kind === 'absolute' ? pitchClass(token.root) : mod12(fromPitch + token.numeral.semitones);
  const bass = token.kind === 'absolute' && token.bass ? pitchClass(token.bass) : pitch;
  slot.sound = { root: pitch, tones: chordTones(token.quality, token.added), bass };
  return { slot, resolved: { root, quality: token.quality, pitch } };
}
