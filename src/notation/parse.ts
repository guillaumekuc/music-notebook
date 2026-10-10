// Parses the notation text format into a model the renderer lays out.
// See index.ts for the syntax.

export class NotationError extends Error {}

export const CLEFS = ['treble', 'bass', 'alto', 'tenor', 'percussion', 'soprano', 'mezzo-soprano', 'baritone-c', 'baritone-f', 'subbass', 'french'];
export const TUNINGS: Record<string, string> = {
  standard: 'E/5,B/4,G/4,D/4,A/3,E/3',
  dropd: 'E/5,B/4,G/4,D/4,A/3,D/3',
  dadgad: 'D/5,A/4,G/4,D/4,A/3,D/3',
  'open-g': 'D/5,B/4,G/4,D/4,G/3,D/3',
  'open-d': 'D/5,A/4,F#/4,D/4,A/3,D/3',
  'half-step-down': 'Eb/5,Bb/4,Gb/4,Db/4,Ab/3,Eb/3',
  bass: 'G/3,D/3,A/2,E/2',
  'bass-5': 'G/3,D/3,A/2,E/2,B/1',
  'standard-7': 'E/5,B/4,G/4,D/4,A/3,E/3,B/2',
  ukulele: 'A/4,E/4,C/4,G/4',
};

const DURATION = '(?:1|2|4|8|16|32|64|w|h|q)';
const DYNAMICS = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'sfz', 'sf', 'fz', 'fp', 'rfz'];
export const ARTICULATIONS: Record<string, string> = { '.': 'a.', '-': 'a-', '>': 'a>', '^': 'a^', '@': 'a@a' };

export type Bar = 'double' | 'end' | 'repeatBegin' | 'repeatEnd';

// One note, chord or rest, with what is attached to it.
export interface Token {
  // Notation staves: an EasyScore note. Tab staves: positions or a rest.
  core: string;
  tab?: { positions: { str: number; fret: number | 'x' }[]; rest: boolean; duration: string; dots: number; techniques: string };
  slurStarts: number;
  slurEnds: number;
  tuplet?: { numNotes?: number; notesOccupied?: number };
  tupletEnd: boolean;
  tie: boolean;
  articulations: string[];
  above: string[];
  below: string[];
  dynamics?: string;
}

export interface Measure {
  tokens: Token[];
}

export interface VoiceSrc {
  line: number;
  measures: Measure[];
  lyrics: string[][];
}

export interface Staff {
  kind: 'notation' | 'tab';
  clef: string;
  tuning: string;
  // A tab staff that also shows its notes in standard notation above it.
  withNotation: boolean;
  voices: VoiceSrc[];
  // Clef changes, by measure index.
  clefAt: Map<number, string>;
}

export interface Piece {
  key: string;
  time: string;
  width: number;
  tempo?: { duration: string; dots: number; bpm?: number; name?: string };
  staves: Staff[];
  keyAt: Map<number, string>;
  timeAt: Map<number, string>;
  barBegin: Map<number, Bar>;
  barEnd: Map<number, Bar>;
  measureCount: number;
}

export const MIN_WIDTH = 200;
export const MAX_WIDTH = 4000;

export interface Validators {
  hasKey(key: string): boolean;
}

const count = (s: string, c: string) => s.split(c).length - 1;

// Splits on commas that are not inside quotes or [options].
function splitTokens(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') quoted = !quoted;
    else if (!quoted && c === '[') depth++;
    else if (!quoted && c === ']') depth--;
    else if (!quoted && depth === 0 && c === ',') {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((t) => t.trim()).filter(Boolean);
}

function parseToken(raw: string, kind: Staff['kind'], fail: (msg: string) => never): Token {
  const tok: Token = {
    core: '', slurStarts: 0, slurEnds: 0, tupletEnd: false, tie: false, articulations: [], above: [], below: [],
  };
  let t = raw.trim();

  const tuplet = t.match(/^\{(?:(\d+)(?::(\d+))?\s+)?/);
  if (tuplet) {
    tok.tuplet = { numNotes: tuplet[1] ? Number(tuplet[1]) : undefined, notesOccupied: tuplet[2] ? Number(tuplet[2]) : undefined };
    t = t.slice(tuplet[0].length);
  }

  // A "(" that isn't closed in this token starts a slur; chords close theirs.
  for (;;) {
    let m: RegExpMatchArray | null;
    if (t.startsWith('(') && count(t, '(') > count(t, ')')) {
      tok.slurStarts++;
      t = t.slice(1).trimStart();
    } else if ((m = t.match(/^_"([^"]*)"\s*/))) {
      tok.below.push(m[1]);
      t = t.slice(m[0].length);
    } else if ((m = t.match(/^"([^"]*)"\s*/))) {
      tok.above.push(m[1]);
      t = t.slice(m[0].length);
    } else if ((m = t.match(/^!([a-z]+)!\s*/))) {
      if (!DYNAMICS.includes(m[1])) fail(`Unknown dynamic: !${m[1]}!`);
      tok.dynamics = m[1];
      t = t.slice(m[0].length);
    } else if (t[0] in ARTICULATIONS && t.length > 1) {
      tok.articulations.push(ARTICULATIONS[t[0]]);
      t = t.slice(1);
    } else break;
  }

  for (;;) {
    if (t.endsWith('}')) tok.tupletEnd = true;
    else if (t.endsWith(')') && count(t, ')') > count(t, '(')) tok.slurEnds++;
    else if (t.endsWith('~')) tok.tie = true;
    else break;
    t = t.slice(0, -1).trimEnd();
  }
  if (!t) fail(`Missing note in “${raw}”`);
  tok.core = t;

  if (kind === 'tab') {
    const m = t.match(new RegExp(`^(r|\\((?:\\s*(?:\\d+|x)\\/\\d+)+\\s*\\)|(?:\\d+|x)\\/\\d+)(?:\\/(${DURATION}))?(\\.*)\\s*([hpsbv]*)$`, 'i'));
    if (!m) fail(`Can't read tab note “${t}”. Write fret/string, e.g. 5/3 or (0/1 2/2)/h`);
    const rest = m[1].toLowerCase() === 'r';
    const positions = rest ? [] : [...m[1].matchAll(/(\d+|x)\/(\d+)/gi)].map((p) => ({
      fret: p[1].toLowerCase() === 'x' ? 'x' as const : Number(p[1]),
      str: Number(p[2]),
    }));
    tok.tab = { positions, rest, duration: m[2] ?? '', dots: m[3].length, techniques: m[4].toLowerCase() };
  }
  return tok;
}

const hasDuration = (core: string) => new RegExp(`\\/${DURATION}(?=$|[./[])`).test(core);
const lastDuration = (core: string) => core.match(new RegExp(`\\/(${DURATION})(?=$|[./[])`))?.[1];

// Splits a voice into measures at bar lines: | || |] |: :| :|:
function splitMeasures(text: string, onBar: (index: number, begin?: Bar, end?: Bar) => void): string[] {
  const parts = text.split(/(:\|:|\|:|:\||\|\||\|\]|\|)/);
  const measures: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const content = parts[i].trim();
    const before = parts[i - 1];
    const after = parts[i + 1];
    const edge = (i === 0 && after !== undefined) || (i === parts.length - 1 && before !== undefined);
    if (!content && edge) continue;
    const index = measures.length;
    measures.push(content);
    const begin = before?.endsWith('|:') ? 'repeatBegin' : undefined;
    const end = after === '||' ? 'double' : after === '|]' ? 'end' : after?.startsWith(':|') ? 'repeatEnd' : undefined;
    if (begin || end) onBar(index, begin, end);
  }
  return measures;
}

export function parseNotation(code: string, v: Validators): Piece {
  const piece: Piece = {
    key: 'C', time: '4/4', width: 700, staves: [], keyAt: new Map(), timeAt: new Map(),
    barBegin: new Map(), barEnd: new Map(), measureCount: 0,
  };
  let staff: Staff | null = null;
  const newStaff = (kind: Staff['kind'], clef: string): Staff => {
    staff = { kind, clef, tuning: TUNINGS.standard, withNotation: false, voices: [], clefAt: new Map() };
    piece.staves.push(staff);
    return staff;
  };
  const currentStaff = () => staff ?? newStaff('notation', 'treble');

  code.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line === 'notation') return;
    const fail: (msg: string) => never = (msg) => {
      throw new NotationError(`Line ${i + 1}: ${msg}`);
    };
    const m = line.match(/^(\S+)\s*(.*)$/)!;
    const [cmd, arg] = [m[1].toLowerCase(), m[2].trim()];
    const checkKey = (k: string) => v.hasKey(k) || fail(`Unknown key: ${k || '(none)'}`);
    const checkTime = (t: string) => /^(\d+\/\d+|C\|?)$/.test(t) || fail(`Invalid time signature: ${t || '(none)'}`);
    const checkClef = (c: string) => CLEFS.includes(c) || fail(`Unknown clef: ${c || '(none)'}. Use ${CLEFS.slice(0, 5).join(', ')}…`);

    switch (cmd) {
      case 'clef': {
        checkClef(arg);
        const s = currentStaff();
        if (s.kind === 'tab') fail('A tab staff has no clef');
        s.clef = arg;
        break;
      }
      case 'key':
        checkKey(arg);
        piece.key = arg;
        break;
      case 'time':
        checkTime(arg);
        piece.time = arg;
        break;
      case 'width': {
        const w = Number(arg);
        if (!Number.isFinite(w) || w < MIN_WIDTH || w > MAX_WIDTH) fail(`Width must be ${MIN_WIDTH}–${MAX_WIDTH}`);
        piece.width = w;
        break;
      }
      case 'tempo': {
        // tempo 120 | tempo q.=90 | tempo "Allegro" h=60 | tempo "Andante"
        const t = arg.match(/^(?:"([^"]*)")?\s*(?:(?:(w|h|q|8|16)(\.?)\s*=\s*)?(\d+))?$/);
        if (!t || (!t[1] && !t[4])) fail('Write a tempo like: tempo 120, tempo h=60 or tempo "Allegro" q=132');
        piece.tempo = { name: t[1], duration: t[2] ?? 'q', dots: t[3] ? 1 : 0, bpm: t[4] ? Number(t[4]) : undefined };
        break;
      }
      case 'staff': {
        const words = arg.split(/\s+/).filter(Boolean);
        const first = (words.shift() ?? 'treble').toLowerCase();
        if (first === 'tab') {
          const s = newStaff('tab', 'tab');
          for (const w of words) {
            const opt = w.match(/^tuning=(.+)$/i);
            if (w.toLowerCase() === 'notation') s.withNotation = true;
            else if (opt) {
              const tuning = TUNINGS[opt[1].toLowerCase()] ?? opt[1];
              if (!/^([A-G][#b]?\/\d)(,[A-G][#b]?\/\d)*$/.test(tuning)) {
                fail(`Unknown tuning: ${opt[1]}. Use ${Object.keys(TUNINGS).join(', ')}, or notes like E/5,B/4,G/4,D/4,A/3,E/3`);
              }
              s.tuning = tuning;
            } else fail(`Unknown tab staff option: ${w}. Use notation or tuning=…`);
          }
        } else {
          checkClef(first);
          if (words.length) fail(`Unknown staff option: ${words[0]}`);
          newStaff('notation', first);
        }
        break;
      }
      case 'voice': {
        const s = currentStaff();
        const texts = splitMeasures(arg, (index, begin, end) => {
          if (begin) piece.barBegin.set(index, begin);
          if (end) piece.barEnd.set(index, end);
        });
        if (!texts.some(Boolean)) fail('A voice needs some notes, e.g. voice C4/q, D4, E4, F4');
        let duration = 'q';
        const measures = texts.map((text, mi): Measure => {
          // Changes at the start of a measure: [key D] [time 3/4] [clef bass]
          let mm: RegExpMatchArray | null;
          while ((mm = text.match(/^\[(key|time|clef)\s+([^\]]*)\]\s*/i))) {
            const [what, value] = [mm[1].toLowerCase(), mm[2].trim()];
            if (what === 'key') piece.keyAt.set(mi, checkKey(value) && value);
            else if (what === 'time') piece.timeAt.set(mi, checkTime(value) && value);
            else if (s.kind === 'tab') fail('A tab staff has no clef');
            else s.clefAt.set(mi, checkClef(value) && value);
            text = text.slice(mm[0].length);
          }
          const tokens = splitTokens(text).map((t) => parseToken(t, s.kind, fail));
          // A duration carries over to the next notes, also across bar lines.
          for (const tok of tokens) {
            if (tok.tab) {
              if (tok.tab.duration) duration = tok.tab.duration;
              else tok.tab.duration = duration;
            } else if (hasDuration(tok.core)) {
              duration = lastDuration(tok.core)!;
            } else if (tok === tokens[0] && !tok.core.includes('/')) {
              const at = tok.core.indexOf('[');
              tok.core = at < 0 ? `${tok.core}/${duration}` : `${tok.core.slice(0, at)}/${duration}${tok.core.slice(at)}`;
            }
          }
          return { tokens };
        });
        s.voices.push({ line: i + 1, measures, lyrics: [] });
        piece.measureCount = Math.max(piece.measureCount, measures.length);
        break;
      }
      case 'lyrics': {
        const voice = (staff as Staff | null)?.voices.at(-1);
        if (!voice) fail('Lyrics go after the voice they belong to');
        voice!.lyrics.push(arg.split(/\s+/).filter((w) => w && w !== '|'));
        break;
      }
      default:
        fail(`Unknown command: ${cmd}`);
    }
  });

  if (!piece.staves.some((s) => s.voices.length)) throw new NotationError('Add a voice, e.g. voice C4/q, D4, E4, F4');
  for (const s of piece.staves) {
    if (!s.voices.length) throw new NotationError(`A ${s.kind === 'tab' ? 'tab' : s.clef} staff has no voice`);
  }
  return piece;
}
