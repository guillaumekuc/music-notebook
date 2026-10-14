// Draws a parsed progression as an SVG bar grid: one cell per bar, each chord
// with its symbol on top and its chord relationship underneath.

import type { Bar, BarLine, Progression, Slot } from './parse';

export interface RenderedProgression {
  svg: SVGSVGElement;
  width: number;
  height: number;
}

const NS = 'http://www.w3.org/2000/svg';
const FONT = "system-ui, 'Segoe UI', Helvetica, Arial, sans-serif";
const PAD = 10;
const ROW_HEIGHT = 72;
const SIZE = 18; // symbols and relationships alike
const ROW_GAP = 10;
const ENDING_ROOM = 18; // above a row, for ending brackets and repeat counts
const INK = '#222';
const GRID = '#bbb';
const SOFT = '#555';

let measurer: CanvasRenderingContext2D | null = null;
function textWidth(text: string, size: number, weight = 'normal'): number {
  measurer ??= document.createElement('canvas').getContext('2d')!;
  measurer.font = `${weight} ${size}px ${FONT}`;
  return measurer.measureText(text).width;
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderProgression(p: Progression): RenderedProgression {
  const svg = el('svg', { xmlns: NS });
  const add = <T extends SVGElement>(node: T) => (svg.append(node), node);

  // Centred text, shrunk to fit its width.
  const text = (s: string, cx: number, y: number, size: number, max: number, fill = INK, weight = 'normal') => {
    const fit = Math.max(7, Math.min(size, (size * max) / Math.max(1, textWidth(s, size, weight))));
    add(el('text', { x: cx, y, 'font-family': FONT, 'font-size': fit.toFixed(1), 'font-weight': weight, 'text-anchor': 'middle', fill }, s));
  };
  const line = (x1: number, y1: number, x2: number, y2: number, stroke = INK, w = 1) =>
    add(el('line', { x1, y1, x2, y2, stroke, 'stroke-width': w }));
  const dot = (cx: number, cy: number, r = 2) => add(el('circle', { cx, cy, r, fill: INK }));

  const sections = p.rows.map((r) => r.section).filter((s): s is string => !!s);
  const gutter = sections.length ? Math.max(28, ...sections.map((s) => textWidth(s, 13, 'bold') + 14)) + 8 : 0;
  const cols = Math.max(...p.rows.map((r) => r.bars.length));
  const cell = (p.width - 2 * PAD - gutter) / cols;
  const roomAbove = (bars: Bar[]) => (bars.some((b) => b.endingStart || b.repeatCount) ? ENDING_ROOM : 0);

  let y = PAD;
  let barIndex = 0; // across all rows, for highlighting during playback
  for (const row of p.rows) {
    y += roomAbove(row.bars);
    const top = y;
    const bottom = y + ROW_HEIGHT;
    const mid = (top + bottom) / 2;

    if (row.section) {
      const w = gutter - 8;
      add(el('rect', { x: PAD, y: top + 6, width: w, height: 24, rx: 3, fill: 'none', stroke: INK, 'stroke-width': 1.25 }));
      text(row.section, PAD + w / 2, top + 23, 13, w - 6, INK, 'bold');
    }

    row.bars.forEach((bar, i) => {
      const x = PAD + gutter + i * cell;
      add(el('rect', { x, y: top, width: cell, height: ROW_HEIGHT, fill: 'none', stroke: GRID, 'stroke-width': 1, 'data-bar': barIndex++ }));
      barLine(bar.left, x, 'left', top);
      barLine(bar.right, x + cell, 'right', top);

      if (bar.repeatCount) text(`×${bar.repeatCount}`, x + cell - 10, top - 5, 12, 30, INK, 'bold');
      if (bar.ending) {
        const by = top - 6;
        const next = row.bars[i + 1];
        const last = !next || next.ending !== bar.ending || next.endingStart;
        line(x + (bar.endingStart ? 2 : 0), by, x + cell - (last ? 2 : 0), by);
        if (bar.endingStart) {
          line(x + 2, by, x + 2, top - 1);
          add(el('text', { x: x + 6, y: by + 11, 'font-family': FONT, 'font-size': 11, fill: INK }, `${bar.ending}.`));
        }
      }

      // Room inside the bar lines that carry dots or thick strokes.
      const inset = (b: BarLine) => (b === 'single' ? 3 : 12);
      const x0 = x + inset(bar.left);
      const inner = cell - inset(bar.left) - inset(bar.right);
      if (bar.simile) return simile(x0 + inner / 2, mid);
      const total = bar.slots.reduce((n, s) => n + s.span, 0);
      let at = x0;
      for (const slot of bar.slots) {
        const w = (inner * slot.span) / total;
        drawSlot(slot, at + w / 2, w - 4, top);
        at += w;
      }
    });
    y = bottom + ROW_GAP;
  }

  function drawSlot(slot: Slot, cx: number, w: number, top: number) {
    if (slot.kind === 'hold') return text('/', cx, top + 43, SIZE, w, SOFT);
    if (slot.kind === 'nc') return text('N.C.', cx, top + 43, SIZE, w);
    if (slot.symbol) {
      text(slot.symbol, cx, top + 30, SIZE, w);
      if (slot.label) text(slot.label, cx, top + 58, SIZE, w);
    } else if (slot.label) {
      // Root-free: the relationship is all there is, so it takes the middle.
      text(slot.label, cx, top + 43, SIZE, w);
    }
  }

  function simile(cx: number, cy: number) {
    line(cx - 9, cy + 9, cx + 9, cy - 9, INK, 2.25);
    dot(cx - 7, cy - 5, 2.5);
    dot(cx + 7, cy + 5, 2.5);
  }

  // Bar lines drawn over the grid, at a bar's left or right edge.
  function barLine(kind: BarLine, x: number, side: 'left' | 'right', top: number) {
    if (kind === 'single') return;
    const bottom = top + ROW_HEIGHT;
    const dir = side === 'left' ? 1 : -1;
    const thick = (at: number) => line(at, top, at, bottom, INK, 3);
    const thin = (at: number) => line(at, top, at, bottom, INK, 1.25);
    if (kind === 'double') {
      thin(x);
      thin(x + dir * 3.5);
    } else if (kind === 'end') {
      thick(x + dir * 1.5);
      thin(x + dir * 6);
    } else {
      thick(x + dir * 1.5);
      thin(x + dir * 6);
      dot(x + dir * 10, top + ROW_HEIGHT / 2 - 7);
      dot(x + dir * 10, top + ROW_HEIGHT / 2 + 7);
    }
  }
  const width = p.width;
  const height = Math.ceil(y - ROW_GAP + PAD);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  return { svg, width, height };
}
