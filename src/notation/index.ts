// Music notation snippets, rendered with VexFlow (MIT). The text format wraps
// VexFlow's EasyScore note syntax in a few commands:
//
//   clef treble            treble, bass, alto, tenor, percussion
//   key G                  key signature (C, G, F#, Bb, Am, ...)
//   time 4/4               time signature
//   width 700              width in px; measures wrap onto new lines
//   voice C5/q, B4, A4, G4 | E4/h, C4
//
// Each `voice` line is one voice; `|` separates measures. Notes are written as
// they sound: the key signature decides which accidentals are drawn.

import {
  Accidental, Beam, Factory, Font, Renderer, VexFlow, VoiceMode,
  type StemmableNote, type Voice,
} from 'vexflow/core';
import bravuraUrl from '@vexflow-fonts/bravura/bravura.woff2?inline';
import academicoUrl from '@vexflow-fonts/academico/academico.woff2?inline';

export class NotationError extends Error {}

const CLEFS = ['treble', 'bass', 'alto', 'tenor', 'percussion', 'soprano', 'mezzo-soprano', 'baritone-c', 'baritone-f', 'subbass', 'french'];
const STAVE_HEIGHT = 140;
const TOP = 10;
const MIN_WIDTH = 200;
const MAX_WIDTH = 4000;

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

// --- Parsing ---

interface Notation {
  clef: string;
  key: string;
  time: string;
  width: number;
  // voices[v][m]: the EasyScore notes of voice v in measure m.
  voices: { line: number; measures: string[] }[];
}

function parse(code: string): Notation {
  const n: Notation = { clef: 'treble', key: 'C', time: '4/4', width: 700, voices: [] };
  code.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line === 'notation') return;
    const m = line.match(/^(\S+)\s*(.*)$/)!;
    const [cmd, arg] = [m[1].toLowerCase(), m[2].trim()];
    const fail = (msg: string) => {
      throw new NotationError(`Line ${i + 1}: ${msg}`);
    };
    switch (cmd) {
      case 'clef':
        if (!CLEFS.includes(arg)) fail(`Unknown clef: ${arg || '(none)'}. Use ${CLEFS.slice(0, 5).join(', ')}…`);
        n.clef = arg;
        break;
      case 'key':
        if (!VexFlow.hasKeySignature(arg)) fail(`Unknown key: ${arg || '(none)'}`);
        n.key = arg;
        break;
      case 'time':
        if (!/^(\d+\/\d+|C\|?)$/.test(arg)) fail(`Invalid time signature: ${arg || '(none)'}`);
        n.time = arg;
        break;
      case 'width': {
        const w = Number(arg);
        if (!Number.isFinite(w) || w < MIN_WIDTH || w > MAX_WIDTH) fail(`Width must be ${MIN_WIDTH}–${MAX_WIDTH}`);
        n.width = w;
        break;
      }
      case 'voice': {
        const measures = arg.split('|').map((s) => s.trim());
        while (measures.length > 1 && !measures[measures.length - 1]) measures.pop();
        if (!measures.some(Boolean)) fail('A voice needs some notes, e.g. voice C4/q, D4, E4, F4');
        n.voices.push({ line: i + 1, measures });
        break;
      }
      default:
        fail(`Unknown command: ${cmd}`);
    }
  });
  if (!n.voices.length) throw new NotationError('Add a voice, e.g. voice C4/q, D4, E4, F4');
  return n;
}

// --- Layout ---

// EasyScore's time signature for voices; "C" (common time) counts as 4/4.
const voiceTime = (time: string) => (time.startsWith('C') ? (time === 'C|' ? '2/2' : '4/4') : time);

const noteCount = (src: string) => (src ? src.split(',').length : 1);

interface Placed {
  index: number;
  x: number;
  y: number;
  width: number;
  lineStart: boolean;
}

// Packs measures into lines of the given width, each line justified to fill
// it. The first measure of a line also holds the clef and key signature.
// A piece that fits on one short line is drawn only as wide as it needs.
function layout(n: Notation, measureCount: number): { placed: Placed[]; width: number; height: number } {
  const keyWidth = VexFlow.keySignature(n.key).length * 11 + (n.key === 'C' || n.key === 'Am' ? 0 : 8);
  const lineStartExtra = 40 + keyWidth;
  const content = (m: number) => 30 + 34 * Math.max(...n.voices.map((v) => noteCount(v.measures[m] ?? '')));
  const inner = n.width - 20;

  const lines: number[][] = [[]];
  let used = 0;
  for (let m = 0; m < measureCount; m++) {
    const extra = (lines[lines.length - 1].length ? 0 : lineStartExtra) + (m === 0 ? 30 : 0);
    const w = content(m) + extra;
    if (used + w > inner && lines[lines.length - 1].length) {
      lines.push([]);
      used = 0;
      m--;
      continue;
    }
    lines[lines.length - 1].push(m);
    used += w;
  }

  const placed: Placed[] = [];
  let width = n.width;
  lines.forEach((line, li) => {
    const widths = line.map((m, j) => content(m) + (j === 0 ? lineStartExtra : 0) + (m === 0 ? 30 : 0));
    const total = widths.reduce((a, b) => a + b, 0);
    // The last line is only stretched when it is nearly full.
    const stretch = li < lines.length - 1 || total > inner * 0.7 ? inner / total : 1;
    if (lines.length === 1 && stretch === 1) width = Math.ceil(total) + 20;
    let x = 10;
    line.forEach((m, j) => {
      const width = widths[j] * stretch;
      placed.push({ index: m, x, y: TOP + li * STAVE_HEIGHT, width, lineStart: j === 0 });
      x += width;
    });
  });
  return { placed, width, height: TOP * 2 + lines.length * STAVE_HEIGHT };
}

// --- Rendering ---

export interface RenderedNotation {
  svg: SVGSVGElement;
  width: number;
  height: number;
}

// EasyScore draws every accidental as written; these are removed so they can
// be worked out from the key signature instead.
function stripAccidentals(_options: unknown, note: StemmableNote) {
  const n = note as unknown as { modifiers: { getCategory(): string }[] };
  n.modifiers = n.modifiers.filter((m) => m.getCategory() !== Accidental.CATEGORY);
}

// The first note EasyScore can't parse, to point at in an error message.
function unreadableNote(src: string): string | undefined {
  const probe = new Factory({ renderer: { elementId: null, width: 10, height: 10 } }).EasyScore();
  return src.split(',').map((t) => t.trim()).find((t) => t && !probe.parse(t).success);
}

export function renderNotation(code: string): RenderedNotation {
  const n = parse(code);
  const measureCount = Math.max(...n.voices.map((v) => v.measures.length));
  const { placed, width, height } = layout(n, measureCount);
  const time = voiceTime(n.time);

  const host = document.createElement('div');
  const renderer = new Renderer(host, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const factory = new Factory({ renderer: { elementId: null, width, height } });
  factory.setContext(renderer.getContext());
  const score = factory.EasyScore({ throwOnError: true });
  score.addCommitHook(stripAccidentals);
  score.set({ time });

  const beams: Beam[] = [];
  for (const p of placed) {
    const system = factory.System({ x: p.x, y: p.y, width: p.width, spaceBetweenStaves: 10 });
    const multi = n.voices.length > 1;
    const voices: Voice[] = [];
    n.voices.forEach((v, vi) => {
      const src = v.measures[p.index] ?? '';
      if (!src && vi > 0) return;
      try {
        // An empty measure gets a whole-bar rest.
        const notes = score.notes(src || 'B4/1/r', { clef: n.clef, stem: multi ? (vi % 2 ? 'down' : 'up') : 'auto' });
        beams.push(...Beam.generateBeams(notes, { maintainStemDirections: multi }));
        voices.push(score.voice(notes, { time }).setMode(VoiceMode.SOFT));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const bad = /error parsing/i.test(msg) ? unreadableNote(src) : undefined;
        const reason = bad ? `can't read “${bad}”`
          : /too many ticks/i.test(msg) ? `more beats than ${n.time} allows`
          : msg.replace(/^\[\w+\]\s*/, '');
        throw new NotationError(`Line ${v.line}, measure ${p.index + 1}: ${reason}`);
      }
    });
    Accidental.applyAccidentals(voices, n.key);

    const stave = system.addStave({ voices });
    if (p.lineStart) stave.addClef(n.clef).addKeySignature(n.key);
    if (p.index === 0) stave.addTimeSignature(n.time);
    if (p.index === measureCount - 1) stave.setEndBarType(3); // BarlineType.END
  }

  try {
    factory.draw();
  } catch (e) {
    throw new NotationError(e instanceof Error ? e.message : String(e));
  }
  const ctx = renderer.getContext();
  for (const beam of beams) beam.setContext(ctx).draw();

  const svg = host.querySelector('svg')!;
  return { svg, width, height };
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
