// Vex Fretboard
//
// TypeScript port of https://github.com/0xfe/fretboard (src/fretboard.coffee).
// Original: Copyright Mohit Muthanna Cheppudira 2013, MIT License.
// Uses PaperJS.

import type paper from 'paper/dist/paper-core';

type PaperScope = InstanceType<typeof paper.PaperScope>;
type Point = InstanceType<typeof paper.Point>;

export class FretboardError extends Error {
  readonly code = 'FretboardError';

  constructor(message: string) {
    super(message);
    this.name = 'FretboardError';
  }
}

const error = (msg: string) => new FretboardError(msg);

export interface FretboardOptions {
  strings: number;
  start_fret: number;
  end_fret: number;
  tuning: string;
  color: string;
  marker_color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  marker_radius: number;
  font_face: string;
  font_size: number;
  font_color: string;
  nut_color: string;
  start_fret_text: string | number | null;
}

export interface Light {
  fret: number;
  string: number;
  color?: string;
  fillColor?: string;
  text?: string;
}

// Ratio between the lengths of two adjacent frets (twelfth root of two).
const FRET_RATIO = Math.pow(2, 1 / 12);

export class Fretboard {
  static DEBUG = false;

  readonly options: FretboardOptions;

  private x = 0;
  private y = 0;
  private width = 0;
  private height = 0;
  private nutWidth = 10;
  private startFret = 1;
  private endFret = 0;
  private stringSpacing = 0;
  private lightRadius = 0;
  private fretXs: number[] = [];

  constructor(private readonly paper: PaperScope, options: Partial<FretboardOptions> = {}) {
    const size = paper.view.viewSize;
    this.options = {
      strings: 6,
      start_fret: 1,
      end_fret: 22,
      tuning: 'standard',
      color: 'black',
      marker_color: '#aaa',
      x: 10,
      y: 20,
      width: size.width - 20,
      height: size.height - 40,
      marker_radius: 4,
      font_face: 'Arial',
      font_size: 12,
      font_color: 'black',
      nut_color: '#aaa',
      start_fret_text: null,
      ...options,
    };
    L('constructor: options=', this.options);
    this.reset();
  }

  reset(): void {
    L('reset()');
    const o = this.options;
    if (o.strings < 2) throw error(`Too few strings: ${o.strings}`);
    if (o.start_fret < 1) throw error(`Start fret must be at least 1: ${o.start_fret}`);
    if (o.end_fret <= o.start_fret) {
      throw error(`Start fret number must be lower than end fret number: ${o.start_fret} >= ${o.end_fret}`);
    }
    if (o.end_fret - o.start_fret < 3) throw error(`Too few frets: ${o.end_fret}`);

    this.x = o.x;
    this.y = o.y;
    this.width = o.width;
    this.startFret = o.start_fret;
    this.endFret = o.end_fret;

    // Leave room under the board for the start fret label.
    this.height = o.height - (this.startFret === 1 ? 0 : 10);
    if (this.width < 50 || this.height < 10) throw error('Fretboard is too small to draw');

    this.stringSpacing = this.height / (o.strings - 1);
    this.lightRadius = this.stringSpacing / 2 - 1;
    this.calculateFretPositions();
  }

  // Computes fret wire X offsets (relative to the left edge of the playing
  // area) for frets (start_fret - 1) .. end_fret using real fret spacing,
  // stretched so the visible range fills the available width.
  private calculateFretPositions(): void {
    const width = this.width - this.leftPad();
    const distanceFromNut = (fret: number) => 1 - Math.pow(FRET_RATIO, -fret);
    const first = distanceFromNut(this.startFret - 1);
    const last = distanceFromNut(this.endFret);

    this.fretXs = [];
    for (let fret = this.startFret - 1; fret <= this.endFret; fret++) {
      this.fretXs.push(((distanceFromNut(fret) - first) / (last - first)) * width);
    }
    L(`calculateFretPositions: width=${width}`, this.fretXs);
  }

  private leftPad(): number {
    return this.startFret > 1 ? 3 : this.nutWidth;
  }

  hasFret(num: number): boolean {
    const lowest = this.startFret === 1 ? 0 : this.startFret;
    return Number.isInteger(num) && num >= lowest && num <= this.endFret;
  }

  hasString(num: number): boolean {
    return Number.isInteger(num) && num >= 1 && num <= this.options.strings;
  }

  getFretX(num: number): number {
    return this.x + this.leftPad() + this.fretXs[num - (this.startFret - 1)];
  }

  getStringY(num: number): number {
    return this.y + (num - 1) * this.stringSpacing;
  }

  getFretCenter(fret: number, string: number): Point {
    if (!this.hasFret(fret)) throw error(`Invalid fret: ${fret}`);
    if (!this.hasString(string)) throw error(`Invalid string: ${string}`);

    // Open strings sit on the nut.
    const x = fret === 0
      ? this.x + this.nutWidth / 2
      : (this.getFretX(fret) + this.getFretX(fret - 1)) / 2;

    return new this.paper.Point(x, this.getStringY(string));
  }

  private drawNut(): void {
    L('drawNut()');
    const path = new this.paper.Path.Rectangle({
      rectangle: new this.paper.Rectangle(this.x, this.y - 5, this.nutWidth, this.height + 10),
      radius: 2,
    });
    path.strokeColor = new this.paper.Color(this.options.nut_color);
    path.fillColor = new this.paper.Color(this.options.nut_color);
  }

  private showStartFret(): void {
    L('showStartFret()');
    const center = this.getFretCenter(this.startFret, 1);
    const text = this.options.start_fret_text ?? this.startFret;
    this.renderText(new this.paper.Point(center.x, this.y + this.height + 20), String(text));
  }

  private drawLine(from: Point, to: Point): void {
    const path = new this.paper.Path.Line(from, to);
    path.strokeColor = new this.paper.Color(this.options.color);
  }

  private drawString(num: number): void {
    const y = this.getStringY(num);
    this.drawLine(new this.paper.Point(this.x, y), new this.paper.Point(this.x + this.width, y));
  }

  private drawFret(num: number): void {
    const x = this.getFretX(num);
    this.drawLine(new this.paper.Point(x, this.y), new this.paper.Point(x, this.y + this.height));
  }

  private drawMarkers(): void {
    L('drawMarkers()');
    const drawCircle = (center: Point) => {
      const path = new this.paper.Path.Circle(center, this.options.marker_radius);
      path.strokeColor = new this.paper.Color(this.options.marker_color);
      path.fillColor = new this.paper.Color(this.options.marker_color);
    };

    // Single dots sit between the two middle strings; double dots one
    // string spacing either side of that.
    const middleY = this.y + (Math.floor(this.options.strings / 2) - 0.5) * this.stringSpacing;
    const markerX = (fret: number) => this.getFretCenter(fret, 1).x;

    for (const fret of [3, 5, 7, 9, 15, 17, 19, 21]) {
      if (fret > 0 && this.hasFret(fret)) drawCircle(new this.paper.Point(markerX(fret), middleY));
    }

    for (const fret of [12, 24]) {
      if (fret > 0 && this.hasFret(fret)) {
        drawCircle(new this.paper.Point(markerX(fret), middleY - this.stringSpacing));
        drawCircle(new this.paper.Point(markerX(fret), middleY + this.stringSpacing));
      }
    }
  }

  private renderText(
    point: Point,
    value: string,
    color = this.options.font_color,
    size = this.options.font_size,
  ): void {
    new this.paper.PointText({
      point,
      content: value,
      justification: 'center',
      fontFamily: this.options.font_face,
      fontSize: size,
      fillColor: color,
    });
  }

  lightText(options: Light): void {
    const opts = { color: 'white', fillColor: '#666', ...options };
    L('lightText: ', opts);

    const point = this.getFretCenter(opts.fret, opts.string);
    const path = new this.paper.Path.Circle(point, this.lightRadius);
    path.strokeColor = new this.paper.Color(opts.color);
    path.fillColor = new this.paper.Color(opts.fillColor);

    if (opts.text != null) {
      // Nudge the baseline down so the text is vertically centred.
      const textPoint = point.add(new this.paper.Point(0, this.options.font_size * 0.35));
      this.renderText(textPoint, opts.text, opts.color);
    }
    this.paper.view.update();
  }

  lightUp(options: Light): void {
    const color = options.color ?? '#666';
    const fillColor = options.fillColor ?? color;
    L('lightUp: ', options);

    const point = this.getFretCenter(options.fret, options.string);
    const path = new this.paper.Path.Circle(point, Math.max(this.lightRadius - 2, 1));
    path.strokeColor = new this.paper.Color(color);
    path.fillColor = new this.paper.Color(fillColor);
    this.paper.view.update();
  }

  draw(): void {
    L('draw()');
    for (let num = 1; num <= this.options.strings; num++) this.drawString(num);
    for (let num = this.startFret; num <= this.endFret; num++) this.drawFret(num);

    if (this.startFret === 1) {
      this.drawNut();
    } else {
      this.showStartFret();
    }

    this.drawMarkers();
    this.paper.view.update();
  }
}

function L(...args: unknown[]): void {
  if (Fretboard.DEBUG) console.log('(Vex.Flow.Fretboard)', ...args);
}
