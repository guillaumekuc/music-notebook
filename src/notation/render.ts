// Lays out and draws a parsed piece with VexFlow.

import {
  Accidental, Articulation, BarlineType, Beam, Bend, Dot, Factory, Renderer, TabSlide, TabTie,
  Tuning, Tuplet, Vibrato, VexFlow, VoiceMode,
  type RenderContext, type Stave, type StemmableNote, type TabNote, type Voice,
} from 'vexflow/core';
import { NotationError, type Bar, type Piece, type Staff, type Token } from './parse';
import { chromaticNote, chromaticStave, staffGeometry } from './chromatic';

const TOP = 20;
const LINE_GAP = 30;
const NOTATION_HEIGHT = 110;
const LYRIC_HEIGHT = 18;
const TEXT_HEIGHT = 18;
const FONT = 'Academico';

const BAR_TYPE: Record<Bar, BarlineType> = {
  double: BarlineType.DOUBLE,
  end: BarlineType.END,
  repeatBegin: BarlineType.REPEAT_BEGIN,
  repeatEnd: BarlineType.REPEAT_END,
};

// Default tuplet ratios: 3 in the time of 2, 5 in the time of 4, ...
const TUPLET_OCCUPIED: Record<number, number> = { 2: 3, 3: 2, 4: 3, 5: 4, 6: 4, 7: 4, 9: 8 };

const keyAccidentals = (key: string) => VexFlow.keySignature(key).length;

// The voice time for a time signature; "C" (common time) counts as 4/4.
const voiceTime = (time: string) => (time.startsWith('C') ? (time === 'C|' ? '2/2' : '4/4') : time);

const range = (n: number) => [...Array(n).keys()];

// What applies at a measure: key, time and each staff's clef.
function stateAt(piece: Piece, m: number) {
  let key = piece.key;
  let time = piece.time;
  for (let i = 0; i <= m; i++) {
    key = piece.keyAt.get(i) ?? key;
    time = piece.timeAt.get(i) ?? time;
  }
  const clefs = piece.staves.map((s) => {
    let clef = s.clef;
    for (let i = 0; i <= m; i++) clef = s.clefAt.get(i) ?? clef;
    return clef;
  });
  return { key, time, clefs };
}

const isRestToken = (t: Token) => (t.tab ?? t.chroma)?.rest ?? /\/r(?=$|[./[])/.test(t.core);

// Rows of text a staff needs above and below it.
function textRows(s: Staff) {
  const tokens = s.voices.flatMap((v) => v.measures.flatMap((m) => m.tokens));
  return {
    above: Math.max(0, ...tokens.map((t) => t.above.length)),
    below: Math.max(0, ...tokens.map((t) => t.below.length + (t.dynamics ? 1 : 0))),
  };
}

// --- Layout ---

interface Placed {
  index: number;
  line: number;
  x: number;
  width: number;
  lineStart: boolean;
}

function tokenWidth(tok: Token, words: string[]): number {
  const accidentals = (tok.core.match(/[A-G](##|bb|#|b|n)/g) ?? []).length;
  const text = Math.max(0, ...words.map((w) => w.length * 7 + 8), ...tok.above.map((w) => w.length * 8 + 6));
  return Math.max(32 + accidentals * 10 + (tok.tab?.techniques.includes('b') ? 20 : 0), text);
}

// The lyric words sung on each note.
function lyricWords(piece: Piece): Map<Token, string[]> {
  const words = new Map<Token, string[]>();
  for (const staff of piece.staves) {
    for (const voice of staff.voices) {
      const tokens = singable(voice.measures.flatMap((m) => m.tokens));
      voice.lyrics.forEach((verse) => verse.forEach((w, i) => {
        if (tokens[i] && w !== '_') words.set(tokens[i], [...(words.get(tokens[i]) ?? []), w]);
      }));
    }
  }
  return words;
}

// Notes that take a lyric: not rests, and not the second note of a tie.
function singable(tokens: Token[]): Token[] {
  return tokens.filter((t, i) => !isRestToken(t) && !(i > 0 && tokens[i - 1].tie));
}

function layout(piece: Piece, words: Map<Token, string[]>) {
  const content = (m: number) => 30 + Math.max(...piece.staves.flatMap((s) => s.voices.map((v) =>
    (v.measures[m]?.tokens ?? []).reduce((sum, t) => sum + tokenWidth(t, words.get(t) ?? []), 0))));
  const extra = (m: number, lineStart: boolean) => {
    const now = stateAt(piece, m);
    const before = m > 0 ? stateAt(piece, m - 1) : null;
    let w = 0;
    if (lineStart) w += 40 + keyAccidentals(now.key) * 11 + 8;
    else if (before && before.key !== now.key) w += (keyAccidentals(now.key) + keyAccidentals(before.key)) * 11 + 8;
    if (!before || before.time !== now.time) w += 30;
    if (!lineStart && before && now.clefs.some((c, i) => c !== before.clefs[i])) w += 30;
    if (m === 0 && piece.tempo) w = Math.max(w, 60);
    return w;
  };

  const inner = piece.width - 20;
  const lines: number[][] = [[]];
  let used = 0;
  for (let m = 0; m < piece.measureCount; m++) {
    const current = lines[lines.length - 1];
    const w = content(m) + extra(m, !current.length);
    if (used + w > inner && current.length) {
      lines.push([]);
      used = 0;
      m--;
      continue;
    }
    current.push(m);
    used += w;
  }

  const placed: Placed[] = [];
  let width = piece.width;
  lines.forEach((line, li) => {
    const widths = line.map((m, j) => content(m) + extra(m, j === 0));
    const total = widths.reduce((a, b) => a + b, 0);
    // The last line is only stretched when it is nearly full; a piece that
    // fits on one short line is drawn only as wide as it needs.
    const stretch = li < lines.length - 1 || total > inner * 0.7 ? inner / total : 1;
    if (lines.length === 1 && stretch === 1) width = Math.ceil(total) + 20;
    let x = 10;
    line.forEach((m, j) => {
      placed.push({ index: m, line: li, x, width: widths[j] * stretch, lineStart: j === 0 });
      x += widths[j] * stretch;
    });
  });

  // Height of a line of staves; generous, as the drawing is trimmed after.
  const staffHeight = (s: Staff) => {
    const text = textRows(s);
    const lyrics = Math.max(0, ...s.voices.map((v) => v.lyrics.length)) * LYRIC_HEIGHT
      + (text.above + text.below) * TEXT_HEIGHT;
    const tab = s.kind === 'tab' ? 30 + s.tuning.split(',').length * 13 : 0;
    const notation = s.kind === 'notation' || s.withNotation ? NOTATION_HEIGHT : 0;
    const chromatic = s.kind === 'chromatic' ? NOTATION_HEIGHT + (staffGeometry(s).lines - 5) * 10 : 0;
    return tab + notation + chromatic + lyrics;
  };
  const lineHeight = piece.staves.reduce((h, s) => h + staffHeight(s), 0) + LINE_GAP;
  return { placed, lines: lines.length, width, lineHeight };
}

// --- Drawing ---

// A note of a voice, in order, for what spans notes: ties, slurs, lyrics.
interface Entry {
  token: Token;
  line: number;
  // The note in standard notation and on the tab staff, where drawn.
  notation?: StemmableNote;
  tab?: TabNote;
}

// The note marks and text attach to: notation if shown, else tab.
const mainNote = (e: Entry): StemmableNote | undefined => e.notation ?? e.tab;

export interface RenderedNotation {
  svg: SVGSVGElement;
  width: number;
  height: number;
}

type Drawable = { setContext(c: RenderContext): { draw(): void } };

// EasyScore draws every accidental as written; these are removed so they can
// be worked out from the key signature instead.
function stripAccidentals(_options: unknown, note: StemmableNote) {
  const n = note as unknown as { modifiers: { getCategory(): string }[] };
  n.modifiers = n.modifiers.filter((m) => m.getCategory() !== Accidental.CATEGORY);
}

// The first note EasyScore can't parse, to point at in an error message.
function unreadableNote(tokens: Token[]): string | undefined {
  const probe = new Factory({ renderer: { elementId: null, width: 10, height: 10 } }).EasyScore();
  return tokens.map((t) => t.core).find((c) => !probe.parse(c).success);
}

// Articulations written on a note.
function decorate(entry: Entry) {
  const note = mainNote(entry);
  if (!note) return;
  const { token } = entry;
  const stemUp = entry.notation ? entry.notation.getStemDirection() === 1 : false;
  for (const type of token.articulations) {
    const art = new Articulation(type);
    art.setPosition(type === 'a@a' || !entry.notation || !stemUp ? 'above' : 'below');
    note.addModifier(art, 0);
  }
}

// Groups of note indexes marked { ... } in a measure, with their ratio.
function tupletGroups(tokens: Token[]) {
  const groups: { start: number; end: number; numNotes?: number; notesOccupied?: number }[] = [];
  let open: (typeof groups)[number] | null = null;
  tokens.forEach((t, i) => {
    if (t.tuplet) open = { start: i, end: i, ...t.tuplet };
    if (t.tupletEnd && open) {
      open.end = i;
      groups.push(open);
      open = null;
    }
  });
  return groups.map((g) => {
    const numNotes = g.numNotes ?? g.end - g.start + 1;
    return { ...g, numNotes, notesOccupied: g.notesOccupied ?? TUPLET_OCCUPIED[numNotes] ?? 2 };
  });
}

export function renderPiece(piece: Piece): RenderedNotation {
  const words = lyricWords(piece);
  const { placed, lines, width, lineHeight } = layout(piece, words);
  // Room above the first line for its text and the tempo mark.
  const top = TOP + textRows(piece.staves[0]).above * TEXT_HEIGHT + (piece.tempo ? 20 : 0);
  const height = top + lines * lineHeight + 40;

  const host = document.createElement('div');
  const renderer = new Renderer(host, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();
  const factory = new Factory({ renderer: { elementId: null, width, height } });
  factory.setContext(ctx);
  const score = factory.EasyScore({ throwOnError: true });
  score.addCommitHook(stripAccidentals);

  // entries[staff][voice]: every note in order.
  const entries: Entry[][][] = piece.staves.map((s) => s.voices.map(() => []));
  // Drawn after everything else is formatted.
  const later: Drawable[] = [];
  const tabStaves = piece.staves.filter((s) => s.kind === 'tab').length;
  const notationStaves = piece.staves.length - tabStaves;
  const totalStaves = notationStaves + piece.staves.filter((s) => s.withNotation).length + tabStaves;

  for (const p of placed) {
    const { key, time, clefs } = stateAt(piece, p.index);
    const before = p.index > 0 ? stateAt(piece, p.index - 1) : null;
    const system = factory.System({ x: p.x, y: top + p.line * lineHeight, width: p.width, spaceBetweenStaves: 9 });
    const vTime = voiceTime(time);
    const staves: Stave[] = [];
    const lastMeasure = p.index === piece.measureCount - 1;

    piece.staves.forEach((staff, si) => {
      const clef = clefs[si];
      const multi = staff.voices.length > 1;
      const stemFor = (vi: number) => (multi ? (vi % 2 ? -1 : 1) : 0);
      // Space for text rows, in stave spaces (10px).
      const rows = textRows(staff);
      const lyricSpace = Math.max(0, ...staff.voices.map((v) => v.lyrics.length)) * 1.8 + rows.below * 1.8;
      const textSpace = si > 0 ? rows.above * 1.8 : 0;
      const notationVoices: Voice[] = [];
      const tabVoices: Voice[] = [];
      const tuning = staff.kind === 'tab' ? new Tuning(staff.tuning) : null;
      const chromatic = staff.kind === 'chromatic' ? staffGeometry(staff) : null;

      staff.voices.forEach((voice, vi) => {
        const tokens = voice.measures[p.index]?.tokens ?? [];
        if (!tokens.length && vi > 0) return;
        const stem = stemFor(vi);
        const measureEntries: Entry[] = [];
        let notationNotes: StemmableNote[] = [];
        const tabNotes: StemmableNote[] = [];

        try {
          if (staff.kind === 'notation') {
            // An empty measure gets a whole-bar rest.
            const src = tokens.length ? tokens.map((t) => t.core).join(', ') : 'B4/1/r';
            notationNotes = score.notes(src, { clef, stem: stem === 0 ? 'auto' : stem > 0 ? 'up' : 'down' });
            tokens.forEach((token, i) => measureEntries.push({ token, line: p.line, notation: notationNotes[i] }));
          } else if (chromatic) {
            for (const token of tokens.length ? tokens : [null]) {
              const c = token?.chroma ?? { midi: [], rest: true, duration: '1', dots: 0 };
              const note = chromaticNote(chromatic, c, stem);
              notationNotes.push(note);
              if (token) measureEntries.push({ token, line: p.line, notation: note });
            }
          } else {
            for (const token of tokens.length ? tokens : [null]) {
              const t = token?.tab ?? { positions: [], rest: true, duration: '1', dots: 0, techniques: '' };
              const tab = t.rest
                ? factory.GhostNote({ duration: t.duration, dots: t.dots })
                : factory.TabNote({ positions: t.positions, duration: t.duration, dots: t.dots });
              if (t.techniques.includes('b')) tab.addModifier(new Bend([{ type: Bend.UP, text: 'Full' }]), 0);
              if (t.techniques.includes('v')) tab.addModifier(new Vibrato(), 0);
              tabNotes.push(tab);
              let notation: StemmableNote | undefined;
              if (staff.withNotation) {
                const keys = t.rest ? ['B/4'] : t.positions.map((pos) => (pos.fret === 'x'
                  ? `${tuning!.getNoteForFret(0, pos.str)}/x2`
                  : tuning!.getNoteForFret(pos.fret, pos.str)));
                notation = factory.StaveNote({
                  keys, duration: t.duration, dots: t.dots, type: t.rest ? 'r' : undefined, clef: 'treble', autoStem: stem === 0,
                });
                if (stem !== 0) notation.setStemDirection(stem);
                if (t.dots) Dot.buildAndAttach([notation], { all: true });
                notationNotes.push(notation);
              }
              if (token) measureEntries.push({ token, line: p.line, notation, tab: t.rest ? undefined : tab as TabNote });
            }
          }

          for (const g of tupletGroups(tokens)) {
            const options = { numNotes: g.numNotes, notesOccupied: g.notesOccupied };
            // Tuplets change note lengths on both staves, but are drawn once.
            if (notationNotes.length) later.push(new Tuplet(notationNotes.slice(g.start, g.end + 1), options));
            if (tabNotes.length) {
              const tuplet = new Tuplet(tabNotes.slice(g.start, g.end + 1), options);
              if (!notationNotes.length) later.push(tuplet);
            }
          }
          if (notationNotes.length) later.push(...Beam.generateBeams(notationNotes, { maintainStemDirections: stem !== 0 }));
          measureEntries.forEach(decorate);

          const voiceOf = (notes: StemmableNote[]) => {
            // Soft, so a measure may be short (a pickup), but not too long.
            const v = factory.Voice({ time: vTime }).setMode(VoiceMode.SOFT);
            v.addTickables(notes);
            if (v.getTicksUsed().greaterThan(v.getTotalTicks())) throw new Error('too many ticks');
            return v;
          };
          if (notationNotes.length) notationVoices.push(voiceOf(notationNotes));
          if (tabNotes.length) tabVoices.push(voiceOf(tabNotes));
        } catch (e) {
          if (e instanceof NotationError) throw e;
          const msg = e instanceof Error ? e.message : String(e);
          const bad = /error parsing/i.test(msg) ? unreadableNote(tokens) : undefined;
          // Two notes with no comma between them are the usual mistake.
          const comma = bad && /\s/.test(bad.replace(/\([^)]*\)/g, '')) ? ' (missing comma?)' : '';
          const reason = bad ? `can't read “${bad}”${comma}`
            : /too many ticks/i.test(msg) ? `more beats than ${time} allows`
            : msg.replace(/^\[\w+\]\s*/, '');
          throw new NotationError(`Line ${voice.line}, measure ${p.index + 1}: ${reason}`);
        }
        entries[si][vi].push(...measureEntries);
      });

      if (notationVoices.length && chromatic) {
        // The staff is taller than five lines by this many line spaces.
        const extra = chromatic.lines - 5;
        const stave = chromaticStave(factory, chromatic, p.x, p.width, p.lineStart);
        system.addStave({ voices: notationVoices, stave, spaceAbove: textSpace, spaceBelow: lyricSpace + extra });
        if (!before || before.time !== time) stave.addTimeSignature(time);
        staves.push(stave);
      } else if (notationVoices.length) {
        const stave = system.addStave({ voices: notationVoices, spaceAbove: textSpace, spaceBelow: tabVoices.length ? 0 : lyricSpace });
        const staveClef = staff.kind === 'tab' ? 'treble' : clef;
        if (p.lineStart) stave.addClef(staveClef).addKeySignature(key);
        else {
          if (before && before.clefs[si] !== clef) stave.addClef(staveClef, 'small');
          if (before && before.key !== key) stave.addKeySignature(key, before.key);
        }
        if (!before || before.time !== time) stave.addTimeSignature(time);
        Accidental.applyAccidentals(notationVoices, key);
        staves.push(stave);
      }
      if (tabVoices.length) {
        const tabStave = factory.TabStave({ x: p.x, y: 0, width: p.width, options: { numLines: staff.tuning.split(',').length } });
        system.addStave({
          voices: tabVoices, stave: tabStave, spaceAbove: staff.withNotation ? 0 : textSpace, spaceBelow: lyricSpace,
        });
        if (p.lineStart) tabStave.addClef('tab');
        staves.push(tabStave);
      }
    });

    for (const stave of staves) {
      const begin = piece.barBegin.get(p.index);
      const end = piece.barEnd.get(p.index) ?? (lastMeasure ? 'end' : undefined);
      if (begin) stave.setBegBarType(BAR_TYPE[begin]);
      if (end) stave.setEndBarType(BAR_TYPE[end]);
    }
    if (p.index === 0 && piece.tempo && staves[0]) {
      const { name, duration, dots, bpm } = piece.tempo;
      // Above any chord symbols on the first notes.
      const text = piece.staves[0].voices.some((v) => v.measures[0]?.tokens.some((t) => t.above.length));
      staves[0].setTempo(bpm ? { name, duration, dots, bpm } : { name }, text ? -18 : 0);
    }
    if (totalStaves > 1) {
      if (p.lineStart) {
        system.addConnector('singleLeft');
        if (notationStaves === 2 && !tabStaves) system.addConnector('brace');
        else if (totalStaves > 2) system.addConnector('bracket');
      }
      if (!piece.barEnd.has(p.index) && !lastMeasure) system.addConnector('singleRight');
    }
  }

  spanNotes(entries, factory, later);

  try {
    factory.draw();
  } catch (e) {
    throw new NotationError(e instanceof Error ? e.message.replace(/^\[\w+\]\s*/, '') : String(e));
  }
  for (const item of later) item.setContext(ctx).draw();
  drawText(piece, entries, ctx);

  return trim(host, width, height);
}

// Ties, slurs and tab techniques, which join notes across measures and lines.
function spanNotes(entries: Entry[][][], factory: Factory, later: Drawable[]) {
  for (const voices of entries) {
    for (const list of voices) {
      // First and last note of each line, for slurs that cross a line break.
      const lineFirst = new Map<number, Entry>();
      const lineLast = new Map<number, Entry>();
      for (const e of list) {
        if (!lineFirst.has(e.line)) lineFirst.set(e.line, e);
        lineLast.set(e.line, e);
      }

      const slur = (a: Entry, b: Entry) => {
        const from = mainNote(a);
        const to = mainNote(b);
        if (a.line === b.line) {
          if (from && to && from !== to) factory.Curve({ from, to, options: {} });
          return;
        }
        const aEnd = lineLast.get(a.line)!;
        const bStart = lineFirst.get(b.line)!;
        factory.Curve({ from, to: aEnd === a ? undefined : mainNote(aEnd), options: {} });
        factory.Curve({ from: bStart === b ? undefined : mainNote(bStart), to, options: {} });
      };

      const open: Entry[] = [];
      list.forEach((e, i) => {
        const next = list[i + 1];
        for (let k = 0; k < e.token.slurStarts; k++) open.push(e);
        for (let k = 0; k < e.token.slurEnds; k++) {
          const start = open.pop();
          if (start) slur(start, e);
        }

        if (e.token.tie) {
          const sameLine = next && next.line === e.line;
          if (e.notation && !e.notation.isRest()) {
            const n = next?.notation;
            const keys = range(Math.min(e.notation.getKeys().length, n?.getKeys().length ?? 99));
            if (n && sameLine) factory.StaveTie({ from: e.notation, to: n, firstIndexes: keys, lastIndexes: keys });
            else {
              factory.StaveTie({ from: e.notation, firstIndexes: keys, lastIndexes: keys });
              if (n) factory.StaveTie({ to: n, firstIndexes: keys, lastIndexes: keys });
            }
          }
          if (e.tab && next?.tab) {
            const keys = range(Math.min(e.tab.getPositions().length, next.tab.getPositions().length));
            if (sameLine) later.push(new TabTie({ firstNote: e.tab, lastNote: next.tab, firstIndexes: keys, lastIndexes: keys }));
          }
        }

        // Hammer-on, pull-off and slide go to the next note.
        const tech = e.token.tab?.techniques ?? '';
        if (next && next.line === e.line && e.tab && next.tab) {
          const notes = { firstNote: e.tab, lastNote: next.tab, firstIndexes: [0], lastIndexes: [0] };
          if (tech.includes('h')) later.push(TabTie.createHammeron(notes));
          if (tech.includes('p')) later.push(TabTie.createPulloff(notes));
          if (tech.includes('s')) {
            const fret = (n: TabNote) => Number(n.getPositions()[0].fret) || 0;
            later.push(fret(next.tab) >= fret(e.tab) ? TabSlide.createSlideUp(notes) : TabSlide.createSlideDown(notes));
          }
          if ((tech.includes('h') || tech.includes('p')) && e.notation && next.notation) {
            factory.Curve({ from: e.notation, to: next.notation, options: {} });
          }
        }
      });
    }
  }
}

// Text is drawn once notes are placed, so each kind sits on one line across
// a line of music: chord symbols and text above the staff; then below it,
// text and dynamics, then lyrics.
function drawText(piece: Piece, entries: Entry[][][], ctx: RenderContext) {
  piece.staves.forEach((staff, si) => {
    const all = entries[si].flat();
    // Text above goes over the top staff, text below under the bottom one.
    const upper = (e: Entry): StemmableNote | undefined => e.notation ?? e.tab;
    const lower = (e: Entry): StemmableNote | undefined => (staff.kind === 'tab' ? e.tab : e.notation);

    // Top and bottom of the music on each line, from staff lines and notes.
    const tops = new Map<number, number>();
    const bottoms = new Map<number, number>();
    for (const e of all) {
      const up = upper(e);
      const down = lower(e);
      if (up) {
        const stave = up.checkStave();
        const box = up.getBoundingBox();
        const y = Math.min(stave.getYForLine(0) - 12, box ? box.getY() - 8 : Infinity);
        tops.set(e.line, Math.min(tops.get(e.line) ?? Infinity, y));
      }
      if (down) {
        const stave = down.checkStave();
        const box = down.getBoundingBox();
        const y = Math.max(stave.getYForLine(stave.getNumLines() - 1) + 24, box ? box.getY() + box.getH() + 16 : 0);
        bottoms.set(e.line, Math.max(bottoms.get(e.line) ?? 0, y));
      }
    }

    const headX = (note: StemmableNote) => ('getNoteHeadBeginX' in note
      ? (note as unknown as { getNoteHeadBeginX(): number }).getNoteHeadBeginX()
      : note.getAbsoluteX());
    const centerX = (note: StemmableNote) => ('getNoteHeadEndX' in note
      ? (headX(note) + (note as unknown as { getNoteHeadEndX(): number }).getNoteHeadEndX()) / 2
      : note.getAbsoluteX() + 5);
    const text = (t: string, x: number, y: number, size = 13, weight = 'normal', style = 'normal') => {
      ctx.save();
      ctx.setFont(FONT, size, weight, style);
      ctx.fillText(t, x, y);
      ctx.restore();
    };
    const width = (t: string, size = 13, weight = 'normal', style = 'normal') => {
      ctx.save();
      ctx.setFont(FONT, size, weight, style);
      const w = ctx.measureText(t).width;
      ctx.restore();
      return w;
    };

    // Lines with text below: lyrics start under it.
    const belowRows = new Map<number, number>();
    for (const e of all) {
      const n = e.token.below.length + (e.token.dynamics ? 1 : 0);
      belowRows.set(e.line, Math.max(belowRows.get(e.line) ?? 0, n));
    }

    for (const e of all) {
      const up = upper(e);
      if (up) {
        e.token.above.forEach((t, k) => text(t, headX(up), tops.get(e.line)! - k * TEXT_HEIGHT, 14));
      }
      const down = lower(e) ?? up;
      if (!down) continue;
      let row = 0;
      if (e.token.dynamics) {
        const w = width(e.token.dynamics, 15, 'bold', 'italic');
        text(e.token.dynamics, centerX(down) - w / 2, (bottoms.get(e.line) ?? 0) + row++ * TEXT_HEIGHT, 15, 'bold', 'italic');
      }
      for (const t of e.token.below) text(t, headX(down), (bottoms.get(e.line) ?? 0) + row++ * TEXT_HEIGHT, 13, 'normal', 'italic');
    }

    staff.voices.forEach((voice, vi) => {
      const list = entries[si][vi];
      const notes = list.filter((e, i) => !isRestToken(e.token) && !(i > 0 && list[i - 1].token.tie));
      voice.lyrics.forEach((verse, k) => verse.forEach((word, i) => {
        const note = notes[i] && lower(notes[i]);
        if (!note || word === '_') return;
        const line = notes[i].line;
        const y = (bottoms.get(line) ?? 0) + ((belowRows.get(line) ?? 0) + k) * LYRIC_HEIGHT;
        text(word, centerX(note) - width(word) / 2, y);
      }));
    });
  });
}

// Trims the drawing's height to what was drawn.
function trim(host: HTMLDivElement, width: number, height: number): RenderedNotation {
  const svg = host.querySelector('svg')!;
  Object.assign(host.style, { position: 'absolute', left: '-10000px', top: '0', visibility: 'hidden' });
  document.body.append(host);
  let used = height;
  try {
    const box = svg.getBBox();
    if (box.height > 0) used = Math.min(height, Math.ceil(box.y + box.height + 12));
  } finally {
    host.remove();
    host.removeAttribute('style');
  }
  svg.setAttribute('height', String(used));
  svg.setAttribute('viewBox', `0 0 ${width} ${used}`);
  svg.style.height = `${used}px`;
  return { svg, width, height: used };
}
