// Chords for progression snippets: roots, triad qualities, added intervals
// and chord relationships (CRs).
//
// A CR is how one chord relates to the one before it, written as in Chordex:
// from-quality, the interval up from the previous root as a Roman numeral,
// to-quality. `m ♭III M` is "from a minor chord, up a minor third to a major
// chord". The qualities are the four triads: M major, m minor, d diminished,
// A augmented.

export type Quality = 'M' | 'm' | 'd' | 'A';
export const QUALITIES: Quality[] = ['M', 'm', 'd', 'A'];

// The interval names Chordex uses, by semitones above the previous root.
export const ROMANS = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♭V', 'V', '♭VI', 'VI', '♭VII', 'VII'];
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
// Semitones of each degree of the major scale.
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

export const mod12 = (n: number) => ((n % 12) + 12) % 12;

// A chord symbol as written, e.g. `F#m7b5` or `G7/B`. Shared with the chord
// charts in Markdown notes.
export const CHORD = /^[A-G][#b♯♭]?(?:maj|min|mi|dim|aug|sus|add|alt|m|M|ø|°|o|Δ|\+|-|6\/9|\d{1,2}|[#b♯♭](?=\d)|\([^)\s]*\))*(?:\/[A-G][#b♯♭]?)?$/;

// Flats and sharps for display: `Bb7(#9)` → `B♭7(♯9)`.
export const prettyChord = (chord: string) =>
  chord.replace(/(^|\/)([A-G])b/g, '$1$2♭').replace(/b(?=\d)/g, '♭').replace(/#/g, '♯');

const accidentalValue = (a: string) =>
  [...a].reduce((sum, c) => sum + (c === '#' || c === '♯' ? 1 : c === 'b' || c === '♭' ? -1 : c === '𝄫' ? -2 : 0), 0);

// --- Roots ---

// A spelled root: a letter (0 = C … 6 = B) and its accidental in semitones.
export interface Root {
  letter: number;
  accidental: number;
}

export const pitchClass = (r: Root) => mod12(MAJOR[r.letter] + r.accidental);

export function rootName(r: Root): string {
  const acc = r.accidental > 0 ? '♯'.repeat(r.accidental) : '♭'.repeat(-r.accidental);
  return LETTERS[r.letter] + acc;
}

// `A`, `Bb`, `F♯`; null if it isn't a note name.
export function parseRoot(text: string): Root | null {
  const m = text.match(/^([A-G])([#b♯♭]?)$/);
  return m ? { letter: LETTERS.indexOf(m[1]), accidental: accidentalValue(m[2]) } : null;
}

// --- Intervals ---

// A Roman numeral with an optional accidental: `bIII`, `♭VII`, `#IV`.
export interface Numeral {
  degree: number; // 0-based: 0 = I … 6 = VII
  semitones: number;
}

export function parseNumeral(text: string): Numeral | null {
  const m = text.match(/^([#b♯♭]?)(I|II|III|IV|V|VI|VII)$/);
  if (!m) return null;
  const degree = NUMERALS.indexOf(m[2]);
  return { degree, semitones: mod12(MAJOR[degree] + accidentalValue(m[1])) };
}

// The root a numeral leads to, spelled from the numeral: ♭III above A is C,
// ♯IV above C is F♯. A double accidental falls back to the plainer name.
export function transpose(from: Root, n: Numeral, sharp: boolean): Root {
  const letter = (from.letter + n.degree) % 7;
  const pc = mod12(pitchClass(from) + n.semitones);
  let accidental = mod12(pc - MAJOR[letter] + 6) - 6;
  if (Math.abs(accidental) <= 1) return { letter, accidental };
  const names = sharp ? ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] : ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  return parseRoot(names[pc])!;
}

// An interval added above a chord root: `7` (major 7th), `b7`, `bb7`, `9`, `#11`…
const ADDED = /^(bb|𝄫|[#b♯♭])?(2|3|4|5|6|7|9|11|13)$/;

export function normalizeAdded(text: string): string | null {
  const m = text.match(ADDED);
  if (!m) return null;
  const acc = (m[1] ?? '').replace(/♭/g, 'b').replace(/♯/g, '#').replace('𝄫', 'bb');
  return acc + m[2];
}

const addedNumber = (a: string) => Number(a.match(/\d+$/)?.[0] ?? 0);
const sortAdded = (list: string[]) =>
  [...new Set(list)].sort((a, b) => addedNumber(a) - addedNumber(b) || a.localeCompare(b));

// `(♭7, 9)` for a CR label.
export const addedLabel = (added: string[]) =>
  added.length ? ` (${sortAdded(added).map((a) => a.replace(/bb/, '𝄫').replace(/b/, '♭').replace(/#/, '♯')).join(', ')})` : '';

// --- Chord symbols ---

export interface Analysis {
  quality: Quality | null; // null when there is no third: sus and power chords
  added: string[];
}

// The extensions an upper number implies over a 7th chord.
const STACK: Record<string, string[]> = { '7': [], '9': ['9'], '11': ['9', '11'], '13': ['9', '13'] };

// The triad quality and added intervals of a chord symbol's suffix (what
// follows the root, without a slash bass). Null if it can't be read.
export function analyzeSuffix(suffix: string): Analysis | null {
  let s = suffix;
  let quality: Quality | null = 'M';
  const added: string[] = [];
  const take = (re: RegExp) => {
    const m = s.match(re);
    if (m) s = s.slice(m[0].length);
    return m;
  };

  if (take(/^(m7b5|m7♭5|mi7b5|-7b5|ø7?|Ø7?)/)) {
    quality = 'd';
    added.push('b7');
  } else if (take(/^(dim7|°7|o7)/)) {
    quality = 'd';
    added.push('bb7');
  } else if (take(/^(dim|°|o)/)) quality = 'd';
  else if (take(/^(aug|\+)/)) quality = 'A';
  else if (!/^(maj|M|Δ)/.test(s) && take(/^(min|mi|m|-)/)) quality = 'm';

  let m: RegExpMatchArray | null;
  while (s) {
    if ((m = take(/^\(?(?:maj|Δ)(7|9|11|13)?\)?/) ?? take(/^\(?M(7|9|11|13)\)?/))) added.push('7', ...STACK[m[1] ?? '7']);
    else if (take(/^(6\/9|69)/)) added.push('6', '9');
    else if ((m = take(/^(7|9|11|13)/))) added.push('b7', ...STACK[m[1]]);
    else if (take(/^6/)) added.push('6');
    else if (take(/^5/)) quality = null;
    else if ((m = take(/^sus(2|4)?/))) {
      quality = null;
      added.push(m[1] ?? '4');
    } else if ((m = take(/^add([#b♯♭]?\d{1,2})/))) {
      const a = normalizeAdded(m[1]);
      if (!a) return null;
      added.push(a);
    } else if (take(/^alt/)) added.push('b9', '#9', 'b13');
    else if ((m = take(/^\(([^)]*)\)/))) {
      for (const part of m[1].split(',')) {
        const a = normalizeAdded(part.trim().replace(/^add/, ''));
        if (!a) return null;
        added.push(a);
      }
    } else if ((m = take(/^([#b♯♭])(5|9|11|13)/))) added.push(normalizeAdded(m[1] + m[2])!);
    else return null;
  }
  return { quality, added: sortAdded(added) };
}

// A chord symbol suffix for a quality and its added intervals: M + ♭7 is `7`,
// M + 7 is `maj7`, d + ♭7 is `ø7`. Intervals with no usual name go in
// parentheses (or after `add` when there is no 7th).
export function buildSuffix(quality: Quality, addedList: string[]): string {
  const added = new Set(addedList);
  const has = (a: string) => added.delete(a);
  let base = { M: '', m: 'm', d: '°', A: '+' }[quality];
  let seventh = '';

  if (quality === 'd' && has('bb7')) seventh = '7';
  else if (quality === 'd' && has('b7')) {
    base = 'ø';
    seventh = '7';
  } else if (has('b7')) seventh = '7';
  else if (has('7')) seventh = quality === 'm' ? '(maj7)' : 'maj7';

  let sixth = '';
  if (seventh) {
    const top = added.has('13') ? '13' : added.has('11') && added.has('9') ? '11' : added.has('9') ? '9' : '';
    if (top && seventh !== '(maj7)') {
      for (const a of STACK[top]) added.delete(a);
      seventh = seventh.replace('7', top);
    }
  } else if (has('6')) {
    sixth = has('9') ? '6/9' : '6';
  }

  const rest = sortAdded([...added]).map(prettyAdded);
  let tail = '';
  if (rest.length) tail = seventh || sixth || rest.length > 1 ? `(${rest.join(',')})` : `add${rest[0]}`;
  return base + sixth + seventh + tail;
}

const prettyAdded = (a: string) => a.replace('bb', '𝄫').replace('b', '♭').replace('#', '♯');
