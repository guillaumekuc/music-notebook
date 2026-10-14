import './style.css';
import './library.css';
import { FretboardDiv } from './fretboard';
import { EXAMPLES } from './examples';
import { Library, type SnippetInit } from './storage/library';
import { FolderSync, sanitizeName } from './storage/folderSync';
import type { SnippetType } from './storage/types';
import { setTask, wordCount } from './markdown';
import { loadNotationFonts, performNotation, renderNotation, standaloneSvg } from './notation';
import { Player } from './audio/synth';
import { performProgression, renderProgression } from './progression';
import { NoteView } from './ui/noteView';
import { attachMarkdownEditor } from './ui/markdownEditor';
import { Sidebar } from './ui/sidebar';
import { SnippetMeta } from './ui/snippetMeta';
import { icons } from './ui/icons';
import { toast } from './ui/toast';
import { download } from './util';

const RENDER_DELAY_MS = 200;
const NEW_SNIPPET_CODE: Record<SnippetType, string> = {
  fretboard: 'fretboard\noption frets=12\n',
  markdown: '',
  notation: 'clef treble\ntime 4/4\nvoice C5/q, B4, A4, G4 | E4/h, C4\n',
  progression: 'root A\n| I.m | bIII.M | bVII.M | IV.M |\n',
};
// Share links carry the code in the hash, with a prefix per type.
const SHARE_PREFIX: Record<SnippetType, string> = { fretboard: 'code', markdown: 'md', notation: 'notation', progression: 'prog' };
const CODE_LABEL: Record<SnippetType, string> = { fretboard: 'Fretboard code', markdown: 'Markdown', notation: 'Notation code', progression: 'Progression code' };
const DRAFT_NAME: Record<SnippetType, string> = {
  fretboard: 'Shared snippet',
  markdown: 'Shared note',
  notation: 'Shared notation',
  progression: 'Shared progression',
};
// How the preview and the code are laid out, chosen per snippet type.
const VIEWS = ['stacked', 'side', 'preview'] as const;
type View = (typeof VIEWS)[number];
const DEFAULT_VIEW: Record<SnippetType, View> = { fretboard: 'stacked', notation: 'stacked', progression: 'stacked', markdown: 'stacked' };
const viewKey = (type: SnippetType) => `music-notebook:view:${type}`;
// Where the Markdown view was kept before every type had one.
const OLD_NOTE_VIEW_KEY = 'music-notebook:note-view';
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="app-header">
    <button type="button" id="library-toggle" class="btn only-narrow" aria-label="Open library">${icons.library} Library</button>
    <div>
      <h1>Music Notebook</h1>
      <p>Quick musical notes: fretboard diagrams, notation and Markdown, rendered as you type.</p>
    </div>
  </header>

  <div class="workspace">
    <aside class="sidebar" id="sidebar" aria-label="Snippet library"></aside>
    <div class="backdrop" id="backdrop"></div>

    <main class="layout">
      <section class="panel" aria-labelledby="preview-title">
        <div class="panel-head">
          <h2 id="preview-title">Preview</h2>
          <div class="actions">
            <label class="field">View
              <select id="view">
                <option value="stacked">Stacked</option>
                <option value="side">Side by side</option>
                <option value="preview">Preview only</option>
              </select>
            </label>
          </div>
          <div class="actions" data-for="fretboard notation progression">
            <button type="button" id="play" class="btn" data-for="notation progression" title="Play (Ctrl+Space)"></button>
            <label class="field">Scale
              <select id="scale">
                <option value="1">1×</option>
                <option value="2" selected>2×</option>
                <option value="3">3×</option>
                <option value="4">4×</option>
              </select>
            </label>
            <label class="field"><input type="checkbox" id="transparent" /> Transparent</label>
            <button type="button" id="save-svg" class="btn">Save SVG</button>
            <button type="button" id="save-png" class="btn btn-primary" title="Ctrl+Shift+S">Save PNG</button>
          </div>
          <div class="actions" data-for="markdown">
            <button type="button" id="save-md" class="btn">Save .md</button>
          </div>
        </div>
        <div class="stage" id="stage" data-for="fretboard notation progression"></div>
        <div class="note" id="note" data-for="markdown"></div>
        <p class="status" id="status" role="status" aria-live="polite"></p>
      </section>

      <section class="panel" aria-label="Code">
        <div class="snippet-meta" id="snippet-meta"></div>
        <textarea id="code" class="code" spellcheck="false" autocapitalize="off" autocomplete="off"
          aria-label="Code"></textarea>
        <div class="code-foot">
          <label class="field">
            <select id="examples" aria-label="New snippet from example">
              <option value="">New from example…</option>
              ${EXAMPLES.map((e, i) => `<option value="${i}">${e.name}</option>`).join('')}
            </select>
          </label>
          <button type="button" id="copy-link" class="btn btn-small">Copy share link</button>
        </div>

        <details class="reference" data-for="fretboard">
          <summary>Syntax reference</summary>
          <div class="reference-body">
            <h3>Options</h3>
            <pre>option width=700        canvas width in px
option height=150       canvas height in px
option strings=6        number of strings
option start=1          first fret shown (1 draws the nut)
option frets=17         last fret shown
option start-text=5fr   label under the first fret when start &gt; 1</pre>
            <h3>Showing notes</h3>
            <pre>show fret=3 string=6                one note
show frets=3,5,7 strings=6,5        every fret × string combination
show notes=10/1,9/3                 fret/string pairs
show fret=5 string=1 text=A         labelled circle
show fret=5 string=1 text="5 fr"    quote values containing spaces
show ... color=red fill-color=white outline and fill colour</pre>
            <p>Strings are numbered from the top (1 = high E). Fret 0 marks an open string on the nut.
              Lines starting with <code>#</code> are comments.</p>
          </div>
        </details>
        <details class="reference" data-for="notation">
          <summary>Notation reference</summary>
          <div class="reference-body">
            <h3>Settings</h3>
            <pre>clef treble              treble, bass, alto, tenor, percussion
key G                    C, G, D, F, Bb, F#, Am, Em, …
time 3/4                 time signature (C for common time)
tempo "Allegro" q=132    tempo mark (or just: tempo 120)
width 700                measures wrap onto lines this wide
staff bass               start another staff (two make a grand staff)
staff tab notation       guitar tab, with notation worked out above
staff tab tuning=dropd   standard, dropd, dadgad, open-g, bass, ukulele, …
staff chromatic range=3-5  chromatic staff, octaves 3 to 5 (default: the notes' octaves)</pre>
            <h3>Voices and notes</h3>
            <pre>voice C5/q, B4, A4, G4 | E4/h, C4     | separates measures
lyrics Hel- lo there my friend         one word per note; _ skips one
C#4  Bb4  Fn4       sharp, flat, natural
/w /h /q /8 /16     durations; they carry on until changed
C4/q.  (C4 E4 G4)/h  B4/q/r           dotted, chord, rest
C4/h~, C4/q         tie
(C4/8, D4, E4)      slur: ( before the first note, ) after the last
{C5/8, D5, E5}      triplet ({5:4 …} for other ratios)
.C4 -C4 >C4 ^C4 @C4 staccato, tenuto, accent, marcato, fermata
"Am7"C4  _"rit."C4  !mf!C4          text above, text below, dynamics
|| |] |: :| :|:     double, final and repeat bar lines
[key D] [time 3/4] [clef bass]       changes, at the start of a measure</pre>
            <h3>Tab notes</h3>
            <pre>5/3  (0/1 1/2 0/3)/h  x/6  r/q       fret/string, chord, muted, rest
7/3h, 9/3     hammer-on  ·  p pull-off  ·  s slide
7/3/q b       bend  ·  v vibrato</pre>
            <h3>Chromatic notes</h3>
            <pre>60/q  (60 64 67)/h  r/q              MIDI number (60 = C4), chord, rest</pre>
            <p>On a chromatic staff every semitone has its own place: even notes sit on lines
              (solid), odd ones in spaces (hollow), and every C is a bold line. Half notes have a
              double stem. The number at the start of each octave replaces the clef.</p>
            <p>Write notes as they sound: the key signature decides which accidentals are shown.
              Short notes are beamed automatically; with two voices the first has stems up.
              Lines starting with <code>#</code> are comments.</p>
          </div>
        </details>
        <details class="reference" data-for="progression">
          <summary>Progression reference</summary>
          <div class="reference-body">
            <h3>Settings</h3>
            <pre>root A                   the root the first chord relates to (optional)
width 700                grid width in px
tempo 100  time 3/4      for Play: quarter notes per minute, beats per bar
section Verse            a label for the rows that follow</pre>
            <h3>Bars</h3>
            <pre>| Am | C | G  F |        one row; | separates bars
|| |] |: :| :|: :|x3     double, final and repeat bar lines
|[1 E7 :|[2 Am |]        1st and 2nd endings
C / / G                  / holds the chord for one more slot
%   N.C.                 repeat the previous bar · no chord</pre>
            <h3>Chords</h3>
            <pre>Am  Bb7  F#m7b5  G/B     chord symbols
bIII.M  V.M(b7)          relationships: interval.quality(added)
I.m(11)                  same root: e.g. the first chord, without a root</pre>
            <p>A relationship goes from the previous chord: the Roman numeral is the interval up from
              its root, then the new quality (M major, m minor, d diminished, A augmented) and any
              added intervals (7 is a major 7th, b7 a minor 7th; 9, #11, …). Each cell shows the
              chord symbol and the relationship, whichever was written. Without a root, a
              progression written in relationships shows them only.
              Lines starting with <code>#</code> are comments.</p>
          </div>
        </details>
        <details class="reference" data-for="markdown">
          <summary>Markdown reference</summary>
          <div class="reference-body">
            <pre># Heading   ## Smaller heading
**bold**   *italic*   ~~struck~~   \`code\`
- list item       1. numbered item
- [ ] to do       - [x] done
> quote
[link](https://example.com)
| Chord | Shape |
| ----- | ----- |
| C     | x32010 |</pre>
            <h3>Music notebook extras</h3>
            <pre>\`\`\`fretboard           a fretboard diagram, in the
show notes=5/6,7/6     fretboard syntax
\`\`\`
| Dm7 | G7 | Cmaj7 % |  a chord chart (one bar per cell)
\`\`\`notation            music notation, in the
voice C5/q, B4, A4, G4 notation syntax
\`\`\`
\`\`\`progression         a chord progression grid, in
| Am | bIII.M | F |     the progression syntax
\`\`\`
[[G major]]             link to a snippet by name
[[G major|the shape]]   … with your own label</pre>
            <p>A single line break is kept as a line break. Paste or drop an image to add it.
              Ctrl+B bold · Ctrl+I italic · Ctrl+K link · Enter continues a list.</p>
          </div>
        </details>
      </section>
    </main>
  </div>

  <footer class="app-footer">
    Based on <a href="https://github.com/0xfe/fretboard" target="_blank" rel="noopener">0xfe/fretboard</a>
    by Mohit Muthanna Cheppudira (MIT), rendered with Paper.js.
    Notation by <a href="https://www.vexflow.com" target="_blank" rel="noopener">VexFlow</a> (MIT).
  </footer>
`;

const $ = <T extends HTMLElement>(sel: string) => app.querySelector<T>(sel)!;
const stage = $<HTMLDivElement>('#stage');
const note = $<HTMLDivElement>('#note');
const status = $<HTMLParagraphElement>('#status');
const codeInput = $<HTMLTextAreaElement>('#code');
const examplesSelect = $<HTMLSelectElement>('#examples');
const scaleSelect = $<HTMLSelectElement>('#scale');
const transparentInput = $<HTMLInputElement>('#transparent');
const savePngButton = $<HTMLButtonElement>('#save-png');
const saveSvgButton = $<HTMLButtonElement>('#save-svg');
const playButton = $<HTMLButtonElement>('#play');
const copyLinkButton = $<HTMLButtonElement>('#copy-link');
const saveMdButton = $<HTMLButtonElement>('#save-md');
const viewSelect = $<HTMLSelectElement>('#view');

const player = new Player();
const library = new Library();
const sync = new FolderSync(library);
let sidebar: Sidebar;
let meta: SnippetMeta;
const noteView = new NoteView(note, library, {
  folderId: () => (currentId ? library.getSnippet(currentId)?.folderId ?? null : sidebar.selectedFolderId),
  openLink,
  setTask: (index, checked) => {
    codeInput.value = setTask(codeInput.value, index, checked);
    onCodeEdited();
  },
});

// The open snippet: a library snippet (currentId), or a draft from a share link.
let currentId: string | null = null;
let currentType: SnippetType = 'fretboard';
let draftName = 'Shared snippet';
let pendingSave = false;

// What the preview shows: a fretboard, or a notation drawing.
let current: FretboardDiv | null = null;
let currentNotation: SVGSVGElement | null = null;
let currentSize = { width: 0, height: 0 };
let renderTimer: number | undefined;

function setStatus(message: string, kind: 'ok' | 'error' | 'info' = 'ok') {
  status.textContent = message;
  status.dataset.kind = kind;
}

// Switches the panels (and the editor's spellcheck) to the open snippet's type.
function setType(type: SnippetType) {
  if (type === currentType) return;
  currentType = type;
  app.dataset.type = type;
  showView();
  codeInput.spellcheck = type === 'markdown';
  codeInput.setAttribute('aria-label', CODE_LABEL[type]);
  player.stop();
  current?.destroy();
  current = null;
  currentNotation = null;
  stage.replaceChildren();
  note.replaceChildren();
  setButtonsEnabled(false);
}

function render() {
  player.stop();
  if (currentType === 'markdown') return renderNote();
  if (currentType === 'notation') return renderScore();
  if (currentType === 'progression') return renderGrid();
  const next = new FretboardDiv();
  try {
    const canvas = next.build(codeInput.value);
    current?.destroy();
    current = next;
    showDrawing(canvas, Number(next.options.width), Number(next.options.height));
  } catch (e) {
    next.destroy();
    showRenderError(e, current !== null);
  }
}

function renderScore() {
  try {
    const { svg, width, height } = renderNotation(codeInput.value);
    currentNotation = svg;
    showDrawing(svg, width, height);
  } catch (e) {
    showRenderError(e, currentNotation !== null);
  }
}

function renderGrid() {
  try {
    const { svg, width, height } = renderProgression(codeInput.value);
    currentNotation = svg;
    showDrawing(svg, width, height);
  } catch (e) {
    showRenderError(e, currentNotation !== null);
  }
}

function showDrawing(el: Element, width: number, height: number) {
  currentSize = { width, height };
  stage.replaceChildren(el);
  stage.classList.remove('stale');
  setButtonsEnabled(true);
  setStatus(`Rendered · ${width} × ${height}px`);
}

// Keeps the last good render visible, dimmed, so typing isn't jarring.
function showRenderError(e: unknown, hasPrevious: boolean) {
  stage.classList.toggle('stale', hasPrevious);
  setStatus(e instanceof Error ? e.message : String(e), 'error');
}

function renderNote() {
  noteView.render(codeInput.value);
  const words = wordCount(codeInput.value);
  setStatus(`${words} word${words === 1 ? '' : 's'}`, 'info');
}

function setButtonsEnabled(enabled: boolean) {
  savePngButton.disabled = !enabled;
  saveSvgButton.disabled = !enabled;
  playButton.disabled = !enabled;
}

function showPlaying(playing: boolean) {
  playButton.innerHTML = playing ? `${icons.stop} Stop` : `${icons.play} Play`;
  if (!playing) showPlayingBar(null);
}

// Highlights the progression bar being played.
function showPlayingBar(bar: number | null) {
  stage.querySelectorAll('[data-bar].playing').forEach((el) => el.classList.remove('playing'));
  if (bar !== null) stage.querySelector(`[data-bar="${bar}"]`)?.classList.add('playing');
}

function togglePlay() {
  if (player.playing) return player.stop();
  try {
    const performance = currentType === 'progression' ? performProgression(codeInput.value) : performNotation(codeInput.value);
    if (!performance.events.length) return setStatus('Nothing to play', 'info');
    player.play(performance);
    showPlaying(true);
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), 'error');
  }
}

// --- Opening and saving snippets ---

// Writes pending edits to the library. Code with errors is saved too, so no
// typing is ever lost.
function flushSave() {
  window.clearTimeout(renderTimer);
  if (!pendingSave) return;
  pendingSave = false;
  if (currentId) {
    const s = library.getSnippet(currentId);
    if (s && s.code !== codeInput.value) library.updateSnippet(currentId, { code: codeInput.value });
    meta.setSaveState('saved');
  }
}

function setHash(hash: string) {
  history.replaceState(null, '', `#${hash}`);
}

function openSnippet(id: string) {
  const s = library.getSnippet(id);
  if (!s) return;
  flushSave();
  currentId = id;
  setType(s.type);
  codeInput.value = s.code;
  render();
  meta.show(s);
  meta.setSaveState('saved');
  setHash(`s=${id}`);
  void library.setMeta('lastOpened', id);
  sidebar.reveal(id);
}

function openDraft({ code, type }: SharedCode) {
  flushSave();
  currentId = null;
  draftName = DRAFT_NAME[type];
  setType(type);
  codeInput.value = code;
  render();
  meta.show({ id: null, name: draftName, folderId: null, tags: [] });
  sidebar.requestRender();
}

function newSnippet(folderId: string | null, init: SnippetInit = {}) {
  flushSave();
  const code = NEW_SNIPPET_CODE[init.type ?? 'fretboard'];
  const s = library.createSnippet({ name: 'Untitled', code, folderId, ...init });
  openSnippet(s.id);
  return s;
}

// Opens the most recently edited snippet, or creates one if the library is empty.
function openFallback() {
  const recent = library.recentSnippets()[0];
  if (recent) openSnippet(recent.id);
  else newSnippet(null, { name: EXAMPLES[0].name, code: EXAMPLES[0].code });
}

async function openInitial() {
  const shared = sharedFromHash();
  if (shared) return openDraft(shared);

  const linked = location.hash.match(/^#s=(.+)$/)?.[1];
  const lastOpened = await library.getMeta<string>('lastOpened');
  const id = [linked, lastOpened].find((i) => i && library.getSnippet(i));
  if (id) openSnippet(id);
  else openFallback();
}

function deleteCurrent() {
  if (!currentId) return;
  const removed = library.deleteSnippet(currentId);
  if (!removed) return;
  pendingSave = false;
  currentId = null;
  openFallback();
  toast(`Deleted “${removed.name}”`, {
    label: 'Undo',
    run: () => {
      library.restoreSnippet(removed);
      openSnippet(removed.id);
    },
  });
}

// Keeps the editor in step with changes made elsewhere (sync, folder deletes).
let refreshQueued = false;
function refreshCurrent() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    if (!currentId) return;
    const s = library.getSnippet(currentId);
    if (!s) {
      currentId = null;
      openFallback();
      return;
    }
    if (!pendingSave && (s.code !== codeInput.value || s.type !== currentType)) {
      const { selectionStart, selectionEnd } = codeInput;
      setType(s.type);
      codeInput.value = s.code;
      codeInput.setSelectionRange(selectionStart, selectionEnd);
      render();
    } else if (currentType === 'markdown') {
      // Links and images in the note may point at what just changed.
      renderNote();
    }
    meta.show(s);
  });
}

// Opens the snippet a [[link]] names, or creates a note by that name.
function openLink(target: string) {
  const folderId = currentId ? library.getSnippet(currentId)?.folderId ?? null : sidebar.selectedFolderId;
  const found = library.findByName(target, folderId);
  if (found) return openSnippet(found.id);
  newSnippet(folderId, { type: 'markdown', name: target });
  codeInput.focus();
  toast(`Created note “${target}”`);
}

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

// Stores a pasted or dropped image; returns its attachment name.
async function saveImage(file: File): Promise<string> {
  const ext = IMAGE_EXT[file.type];
  if (!ext) {
    toast(`Images of type ${file.type} are not supported`);
    throw new Error(`Unsupported image type ${file.type}`);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    toast('Images over 20 MB are not supported');
    throw new Error('Image too large');
  }
  // Clipboard images are all called "image.png", so they get a timestamp.
  const given = file.name.replace(/\.[^.]*$/, '');
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const base = given && given.toLowerCase() !== 'image' ? sanitizeName(given) : `Pasted image ${stamp}`;
  const name = library.newAssetName(base, ext);
  await library.putAsset({ name, type: file.type, blob: file, createdAt: Date.now() });
  return name;
}

function storedView(type: SnippetType): View {
  let view: string | null = null;
  try {
    view = localStorage.getItem(viewKey(type)) ?? (type === 'markdown' ? localStorage.getItem(OLD_NOTE_VIEW_KEY) : null);
  } catch {
    // ignore
  }
  return VIEWS.includes(view as View) ? (view as View) : DEFAULT_VIEW[type];
}

// Shows the open snippet type's view.
function showView() {
  const view = storedView(currentType);
  app.dataset.view = view;
  viewSelect.value = view;
}

function setView(view: string) {
  try {
    localStorage.setItem(viewKey(currentType), view);
  } catch {
    // ignore
  }
  showView();
}

// --- Share links ---

interface SharedCode {
  code: string;
  type: SnippetType;
}

function sharedFromHash(): SharedCode | null {
  const m = location.hash.match(/^#(code|md|notation|prog)=(.*)$/);
  const code = m ? decodeCode(m[2]) : null;
  if (code == null) return null;
  const type = (Object.keys(SHARE_PREFIX) as SnippetType[]).find((t) => SHARE_PREFIX[t] === m![1])!;
  return { code, type };
}

function encodeCode(code: string): string {
  const bytes = new TextEncoder().encode(code);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeCode(encoded: string): string | null {
  try {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

// --- Export ---

function exportName(ext: string): string {
  const name = currentId ? library.getSnippet(currentId)?.name : draftName;
  return `${sanitizeName(name ?? 'Untitled')}.${ext}`;
}

function currentSvg(): string | null {
  if (currentType === 'notation') return currentNotation ? standaloneSvg(currentNotation) : null;
  if (currentType === 'progression') return currentNotation ? new XMLSerializer().serializeToString(currentNotation) : null;
  if (!current?.scope) return null;
  return current.scope.project.exportSVG({ asString: true, bounds: 'view' }) as string;
}

function saveMarkdown() {
  download(new Blob([codeInput.value], { type: 'text/markdown' }), exportName('md'));
}

function saveSvg() {
  const svg = currentSvg();
  if (!svg) return;
  download(new Blob([svg], { type: 'image/svg+xml' }), exportName('svg'));
}

// Rasterises the vector output rather than copying the on-screen canvas, so
// the PNG is sharp at any scale regardless of the screen's pixel density.
async function savePng() {
  const svg = currentSvg();
  if (!svg) return;
  const scale = Number(scaleSelect.value);
  const { width, height } = currentSize;

  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();

    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d')!;
    if (!transparentInput.checked) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not encode PNG');
    download(blob, exportName('png'));
  } catch (e) {
    setStatus(`Export failed: ${e instanceof Error ? e.message : e}`, 'error');
  } finally {
    URL.revokeObjectURL(url);
  }
}

// --- Wiring ---

function onCodeEdited() {
  if (currentId) {
    pendingSave = true;
    meta.setSaveState('saving');
  }
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => {
    render();
    flushSave();
  }, RENDER_DELAY_MS);
}

function wireEditor() {
  codeInput.addEventListener('input', onCodeEdited);
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      codeInput.setRangeText('  ', codeInput.selectionStart, codeInput.selectionEnd, 'end');
      onCodeEdited();
    }
  });

  examplesSelect.addEventListener('change', () => {
    const example = EXAMPLES[Number(examplesSelect.value)];
    examplesSelect.value = '';
    if (!example) return;
    newSnippet(sidebar.selectedFolderId, { name: example.name, type: example.type, code: example.code });
    codeInput.focus();
  });

  savePngButton.addEventListener('click', savePng);
  saveSvgButton.addEventListener('click', saveSvg);
  playButton.addEventListener('click', togglePlay);
  player.onStop = () => showPlaying(false);
  player.onCue = (bar) => showPlayingBar(bar);
  saveMdButton.addEventListener('click', saveMarkdown);
  viewSelect.addEventListener('change', () => setView(viewSelect.value));
  attachMarkdownEditor(codeInput, { active: () => currentType === 'markdown', saveImage });

  copyLinkButton.addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}#${SHARE_PREFIX[currentType]}=${encodeCode(codeInput.value)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Share link copied');
    } catch {
      toast('Could not access the clipboard');
    }
  });

  $('#library-toggle').addEventListener('click', () => document.body.classList.add('library-open'));
  $('#backdrop').addEventListener('click', () => document.body.classList.remove('library-open'));

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === ' ' && (currentType === 'notation' || currentType === 'progression')) {
      e.preventDefault();
      if (!playButton.disabled) togglePlay();
      return;
    }
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
    e.preventDefault();
    if (e.shiftKey) {
      if (currentType !== 'markdown' && !savePngButton.disabled) void savePng();
    } else if (currentId) {
      flushSave();
      toast('Saved');
    } else {
      saveDraft();
    }
  });

  window.addEventListener('hashchange', () => {
    const shared = sharedFromHash();
    if (shared) return openDraft(shared);
    const id = location.hash.match(/^#s=(.+)$/)?.[1];
    if (id && id !== currentId && library.getSnippet(id)) openSnippet(id);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
  window.addEventListener('pagehide', flushSave);
}

function saveDraft() {
  if (currentId) return;
  const s = library.createSnippet({
    name: draftName,
    type: currentType,
    code: codeInput.value,
    folderId: sidebar.selectedFolderId,
  });
  openSnippet(s.id);
  meta.focusName();
  toast('Saved to library');
}

async function start() {
  app.dataset.type = currentType;
  showView();
  showPlaying(false);
  setButtonsEnabled(false);
  // Notation is measured with its music font, so that loads first.
  await loadNotationFonts().catch((e) => console.error('Could not load notation fonts', e));
  try {
    await library.init();
  } catch (e) {
    console.error(e);
    setStatus('Could not open browser storage, so snippets will not be saved.', 'error');
    return;
  }

  sidebar = new Sidebar($('#sidebar'), library, sync, {
    currentId: () => currentId,
    open: openSnippet,
    newSnippet: (folderId, type) => {
      newSnippet(folderId, { type });
      meta.focusName();
    },
  });

  meta = new SnippetMeta($('#snippet-meta'), library, {
    rename: (name) => currentId && library.updateSnippet(currentId, { name }),
    move: (folderId) => currentId && library.moveSnippet(currentId, folderId),
    setTags: (tags) => currentId && library.updateSnippet(currentId, { tags }),
    duplicate: () => {
      if (!currentId) return;
      flushSave();
      const copy = library.duplicateSnippet(currentId);
      if (copy) {
        openSnippet(copy.id);
        meta.focusName();
      }
    },
    remove: deleteCurrent,
    saveDraft,
  });

  library.onChange(refreshCurrent);
  wireEditor();
  if (import.meta.env.DEV) Object.assign(window, { __notebook: { library, sync } });
  await openInitial();
  await sync.init();
}

void start();
