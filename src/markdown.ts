import { Marked, type Tokens } from 'marked';
import DOMPurify from 'dompurify';
import { escapeHtml } from './util';
import { ATTACHMENTS_DIR } from './storage/types';

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n?---[ \t]*(?:\r?\n|$)/;

// Links in notes open in a new tab, so following one never leaves the app.
// Links between notes and attachment images are handled by the note view.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href') && !node.classList.contains('wikilink')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
  const src = node.tagName === 'IMG' ? node.getAttribute('src') : null;
  if (src?.startsWith(`${ATTACHMENTS_DIR}/`)) {
    let name = src.slice(ATTACHMENTS_DIR.length + 1);
    try {
      name = decodeURIComponent(name);
    } catch {
      // keep it as written
    }
    node.setAttribute('data-asset', name);
    node.removeAttribute('src');
  }
});

// --- Chord charts ---
// Consecutive lines like `| Dm7 | G7 | Cmaj7 % |` where every bar holds only
// chord symbols. A Markdown table always has a `|---|` row, so it never
// matches.

const CHORD = /^[A-G][#b♯♭]?(?:maj|min|mi|dim|aug|sus|add|alt|m|M|ø|°|o|Δ|\+|-|\d{1,2}|[#b♯♭](?=\d)|\([^)\s]*\))*(?:\/[A-G][#b♯♭]?)?$/;
const CHART_MARK = /^(%|\/|-|N\.C\.)$/;

function parseChartRow(line: string): string[][] | null {
  const bars = line.trim().slice(1, -1).split('|').map((bar) => bar.trim().split(/\s+/).filter(Boolean));
  const ok = bars.length > 0 && bars.every((bar) => bar.every((t) => CHORD.test(t) || CHART_MARK.test(t)));
  return ok && bars.some((bar) => bar.length) ? bars : null;
}

const prettyChord = (chord: string) => chord.replace(/(^|\/)([A-G])b/g, '$1$2♭').replace(/b(?=\d)/g, '♭').replace(/#/g, '♯');

interface ChordChartToken {
  type: 'chordChart';
  raw: string;
  rows: string[][][];
}

// --- Links between notes ---

interface WikiLinkToken {
  type: 'wikilink';
  raw: string;
  target: string;
  label: string;
}

// --- Renderer ---

// Code of the ```fretboard blocks in the note being rendered; the note view
// draws them into the placeholders.
let fretboardBlocks: string[] = [];

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    code({ text, lang }: Tokens.Code) {
      if (lang?.trim().toLowerCase() !== 'fretboard') return false;
      fretboardBlocks.push(text);
      return `<div class="fretboard-block" data-block="${fretboardBlocks.length - 1}"></div>\n`;
    },
    checkbox({ checked }: Tokens.Checkbox) {
      return `<input type="checkbox" class="task"${checked ? ' checked' : ''}> `;
    },
  },
  extensions: [
    {
      name: 'chordChart',
      level: 'block',
      start: (src: string) => src.match(/^ {0,3}\|/m)?.index,
      tokenizer(src: string): ChordChartToken | undefined {
        const m = src.match(/^(?: {0,3}\|[^\n]*\|[ \t]*(?:\n|$))+/);
        if (!m) return undefined;
        const rows = m[0].trimEnd().split('\n').map(parseChartRow);
        if (rows.some((r) => !r)) return undefined;
        return { type: 'chordChart', raw: m[0], rows: rows as string[][][] };
      },
      renderer(token) {
        const { rows } = token as unknown as ChordChartToken;
        const bar = (chords: string[]) =>
          `<div class="chart-bar">${chords.map((c) => `<span class="chord">${escapeHtml(prettyChord(c))}</span>`).join('')}</div>`;
        return `<div class="chord-chart">${rows.map((r) => `<div class="chart-row">${r.map(bar).join('')}</div>`).join('')}</div>\n`;
      },
    },
    {
      name: 'wikilink',
      level: 'inline',
      start: (src: string) => {
        const i = src.indexOf('[[');
        return i < 0 ? undefined : i;
      },
      tokenizer(src: string): WikiLinkToken | undefined {
        const m = src.match(/^\[\[([^[\]|\n]+)(?:\|([^[\]\n]+))?\]\]/);
        if (!m) return undefined;
        return { type: 'wikilink', raw: m[0], target: m[1].trim(), label: (m[2] ?? m[1]).trim() };
      },
      renderer(token) {
        const { target, label } = token as unknown as WikiLinkToken;
        return `<a href="#" class="wikilink" data-target="${escapeHtml(target)}">${escapeHtml(label)}</a>`;
      },
    },
  ],
});

export interface RenderedNote {
  html: string;
  fretboards: string[];
}

// Renders a Markdown note to sanitised HTML. Notes can arrive through share
// links, so the HTML is never trusted. Front matter is metadata, not content.
export function renderMarkdown(text: string): RenderedNote {
  fretboardBlocks = [];
  const html = marked.parse(text.replace(FRONT_MATTER, ''), { async: false });
  return { html: DOMPurify.sanitize(html), fretboards: fretboardBlocks };
}

// Ticks or unticks the index-th task list item, counting the way the
// renderer does (items in fenced code are not tasks).
export function setTask(text: string, index: number, checked: boolean): string {
  const lines = text.split('\n');
  let fence: string | null = null;
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const fenceMark = lines[i].match(/^ {0,3}(`{3,}|~{3,})/)?.[1];
    if (fenceMark) {
      if (!fence) fence = fenceMark[0];
      else if (fenceMark[0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const m = lines[i].match(/^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)[ xX](\](?:\s|$))/);
    if (m && n++ === index) {
      lines[i] = m[1] + (checked ? 'x' : ' ') + lines[i].slice(m[1].length + 1);
      return lines.join('\n');
    }
  }
  return text;
}

// The note's text without Markdown syntax, for list previews.
export function markdownExcerpt(text: string, length = 140): string {
  const plain = text
    .replace(FRONT_MATTER, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[\[([^[\]|]+)\|?([^[\]]*)\]\]/g, (_, target: string, label: string) => label || target)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/^\[[ xX]\]\s+/gm, '')
    .replace(/^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/gm, ' ')
    .replace(/[*_`~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > length ? `${plain.slice(0, length).trimEnd()}…` : plain;
}

export function wordCount(text: string): number {
  return text.replace(FRONT_MATTER, '').match(/\S+/g)?.length ?? 0;
}
