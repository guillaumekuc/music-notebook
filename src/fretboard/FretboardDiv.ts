// Parses the fretboard text syntax and renders it to a canvas.
//
// TypeScript port of Vex.Flow.FretboardDiv from https://github.com/0xfe/fretboard.
// Original: Copyright Mohit Muthanna Cheppudira 2013, MIT License.
// Unlike the original it has no jQuery dependency: build() returns the canvas
// and only swaps it into the page when an element was given.

import paper from 'paper/dist/paper-core';
import { Fretboard, FretboardError, type FretboardOptions, type Light } from './Fretboard';

const error = (msg: string) => new FretboardError(msg);

const DIV_OPTIONS = ['width', 'height', 'strings', 'frets', 'start', 'start-text', 'tuning'] as const;
type DivOption = (typeof DIV_OPTIONS)[number];

const SHOW_OPTIONS = [
  'fret', 'frets', 'string', 'strings', 'text', 'color', 'note', 'notes', 'fill-color',
] as const;
type ShowOption = (typeof SHOW_OPTIONS)[number];
type ShowParams = Partial<Record<ShowOption, string>>;

const MAX_CANVAS_SIZE = 4000;

export class FretboardDiv {
  static DEBUG = false;

  options: Record<DivOption, string | null> = {
    width: '700',
    height: '150',
    strings: '6',
    frets: '17',
    start: '1',
    'start-text': null,
    tuning: 'standard',
  };

  lights: { params: ShowParams; line?: number }[] = [];
  scope: paper.PaperScope | null = null;
  fretboard: Fretboard | null = null;

  constructor(private readonly element: HTMLElement | null = null) {}

  setOption(key: string, value: string): void {
    if (!(DIV_OPTIONS as readonly string[]).includes(key)) throw error(`Invalid option: ${key}`);
    L(`Option: ${key}=${value}`);
    this.options[key as DivOption] = value;
  }

  show(line: string, lineNumber?: number): void {
    const params: ShowParams = {};
    // key=value pairs; values may be double-quoted to include spaces.
    const rest = line.replace(/(\S+?)\s*=\s*("[^"]*"|\S+)/g, (_, key: string, value: string) => {
      if (!(SHOW_OPTIONS as readonly string[]).includes(key)) throw error(`Invalid 'show' option: ${key}`);
      params[key as ShowOption] = value.replace(/^"(.*)"$/, '$1');
      return '';
    });
    if (rest.trim()) throw error(`Invalid 'show' option: ${rest.trim().split(/\s+/)[0]}`);

    L('Show: ', params);
    this.lights.push({ params, line: lineNumber });
  }

  parse(data: string): true {
    L('Parsing: ' + data);
    data.split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line === 'fretboard') return;

      try {
        let match = line.match(/^option\s+(\S+?)\s*=\s*(.+)$/);
        if (match) return this.setOption(match[1], match[2].trim());

        match = line.match(/^show\s+(.+)$/);
        if (match) return this.show(match[1], i + 1);

        throw error(`Unknown command: ${line.split(/\s+/)[0]}`);
      } catch (e) {
        if (e instanceof FretboardError) throw error(`Line ${i + 1}: ${e.message}`);
        throw e;
      }
    });
    return true;
  }

  private fretboardOptions(): Partial<FretboardOptions> {
    const o = this.options;
    const fb: Partial<FretboardOptions> = {
      strings: toInt(o.strings, 'strings'),
      end_fret: toInt(o.frets, 'frets'),
      start_fret: toInt(o.start, 'start'),
      tuning: o.tuning ?? 'standard',
    };
    if (o['start-text'] != null) fb.start_fret_text = o['start-text'];
    return fb;
  }

  private lightsCameraAction(): void {
    const fretboard = this.fretboard!;
    L(this.lights);
    for (const { params: light, line } of this.lights) {
      try {
        this.lightUpLine(fretboard, light);
      } catch (e) {
        if (e instanceof FretboardError && line != null) throw error(`Line ${line}: ${e.message}`);
        throw e;
      }
    }
  }

  private lightUpLine(fretboard: Fretboard, light: ShowParams): void {
    for (const param of extractFrets(light)) {
      if (light.color != null) param.color = light.color;
      if (light['fill-color'] != null) param.fillColor = light['fill-color'];
      L('Lighting up: ', param);
      if (light.text != null) {
        param.text = light.text;
        fretboard.lightText(param);
      } else {
        fretboard.lightUp(param);
      }
    }
  }

  build(code?: string): HTMLCanvasElement {
    this.parse(code ?? this.element?.textContent ?? '');

    const width = toInt(this.options.width, 'width');
    const height = toInt(this.options.height, 'height');
    if (width < 100 || width > MAX_CANVAS_SIZE) throw error(`Width must be between 100 and ${MAX_CANVAS_SIZE}: ${width}`);
    if (height < 50 || height > MAX_CANVAS_SIZE) throw error(`Height must be between 50 and ${MAX_CANVAS_SIZE}: ${height}`);
    L(`Creating canvas ${width}x${height}`);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.className = 'fretboard-canvas';

    const scope = new paper.PaperScope();
    scope.setup(canvas);
    this.scope = scope;
    try {
      this.fretboard = new Fretboard(scope, this.fretboardOptions());
      this.fretboard.draw();
      this.lightsCameraAction();
    } catch (e) {
      scope.project.remove();
      this.scope = null;
      throw e;
    }

    this.element?.replaceWith(canvas);
    return canvas;
  }

  destroy(): void {
    this.scope?.project.remove();
    this.scope = null;
    this.fretboard = null;
  }
}

function toInt(value: string | null, name: string): number {
  const str = (value ?? '').trim();
  if (!/^-?\d+$/.test(str)) throw error(`Invalid number for ${name}: ${value}`);
  return parseInt(str, 10);
}

function extractNumbers(str: string, name: string): number[] {
  return str.trim().split(/\s*,\s*/).map((n) => toInt(n, name));
}

function extractNotes(str: string): { fret: number; string: number }[] {
  return str.trim().split(/\s*,\s*/).map((note) => {
    const parts = note.match(/^(\d+)\/(\d+)$/);
    if (!parts) throw error(`Invalid note: ${note} (expected fret/string, e.g. 5/6)`);
    return { fret: parseInt(parts[1], 10), string: parseInt(parts[2], 10) };
  });
}

function extractFrets(light: ShowParams): Light[] {
  const fretStr = light.frets ?? light.fret;
  const stringStr = light.strings ?? light.string;
  const noteStr = light.notes ?? light.note;
  if (!(fretStr != null && stringStr != null) && noteStr == null) {
    throw error('No frets or strings specified on line');
  }

  const lights: Light[] = [];
  if (fretStr != null && stringStr != null) {
    const strings = extractNumbers(stringStr, 'string');
    for (const fret of extractNumbers(fretStr, 'fret')) {
      for (const string of strings) lights.push({ fret, string });
    }
  }
  if (noteStr != null) lights.push(...extractNotes(noteStr));
  return lights;
}

function L(...args: unknown[]): void {
  if (FretboardDiv.DEBUG) console.log('(Vex.Flow.FretboardDiv)', ...args);
}
