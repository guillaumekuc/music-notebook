import './style.css';
import './library.css';
import { FretboardDiv } from './fretboard';
import { EXAMPLES } from './examples';
import { Library, type SnippetInit } from './storage/library';
import { FolderSync, sanitizeName } from './storage/folderSync';
import type { SnippetType } from './storage/types';
import { renderMarkdown, wordCount } from './markdown';
import { Sidebar } from './ui/sidebar';
import { SnippetMeta } from './ui/snippetMeta';
import { icons } from './ui/icons';
import { toast } from './ui/toast';
import { download } from './util';

const RENDER_DELAY_MS = 200;
const NEW_SNIPPET_CODE: Record<SnippetType, string> = {
  fretboard: 'fretboard\noption frets=12\n',
  markdown: '',
};
// Share links carry the code in the hash, with a prefix per type.
const SHARE_PREFIX: Record<SnippetType, string> = { fretboard: 'code', markdown: 'md' };

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="app-header">
    <button type="button" id="library-toggle" class="btn only-narrow" aria-label="Open library">${icons.library} Library</button>
    <div>
      <h1>Music Notebook</h1>
      <p>Quick musical notes: fretboard diagrams and Markdown, rendered as you type.</p>
    </div>
  </header>

  <div class="workspace">
    <aside class="sidebar" id="sidebar" aria-label="Snippet library"></aside>
    <div class="backdrop" id="backdrop"></div>

    <main class="layout">
      <section class="panel" aria-labelledby="preview-title">
        <div class="panel-head">
          <h2 id="preview-title">Preview</h2>
          <div class="actions" data-for="fretboard">
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
        <div class="stage" id="stage" data-for="fretboard"></div>
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
            <p>A single line break is kept as a line break.</p>
          </div>
        </details>
      </section>
    </main>
  </div>

  <footer class="app-footer">
    Based on <a href="https://github.com/0xfe/fretboard" target="_blank" rel="noopener">0xfe/fretboard</a>
    by Mohit Muthanna Cheppudira (MIT), rendered with Paper.js.
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
const copyLinkButton = $<HTMLButtonElement>('#copy-link');
const saveMdButton = $<HTMLButtonElement>('#save-md');

const library = new Library();
const sync = new FolderSync(library);
let sidebar: Sidebar;
let meta: SnippetMeta;

// The open snippet: a library snippet (currentId), or a draft from a share link.
let currentId: string | null = null;
let currentType: SnippetType = 'fretboard';
let draftName = 'Shared snippet';
let pendingSave = false;

let current: FretboardDiv | null = null;
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
  codeInput.spellcheck = type === 'markdown';
  codeInput.setAttribute('aria-label', type === 'markdown' ? 'Markdown' : 'Fretboard code');
  if (type === 'markdown') {
    current?.destroy();
    current = null;
    stage.replaceChildren();
    setButtonsEnabled(false);
  } else {
    note.replaceChildren();
  }
}

function render() {
  if (currentType === 'markdown') return renderNote();
  const next = new FretboardDiv();
  try {
    const canvas = next.build(codeInput.value);
    current?.destroy();
    current = next;
    currentSize = { width: Number(next.options.width), height: Number(next.options.height) };
    stage.replaceChildren(canvas);
    stage.classList.remove('stale');
    setButtonsEnabled(true);
    setStatus(`Rendered · ${currentSize.width} × ${currentSize.height}px`);
  } catch (e) {
    next.destroy();
    // Keep the last good render visible, dimmed, so typing isn't jarring.
    stage.classList.toggle('stale', current !== null);
    setStatus(e instanceof Error ? e.message : String(e), 'error');
  }
}

function renderNote() {
  note.innerHTML = renderMarkdown(codeInput.value);
  const words = wordCount(codeInput.value);
  setStatus(`${words} word${words === 1 ? '' : 's'}`, 'info');
}

function setButtonsEnabled(enabled: boolean) {
  savePngButton.disabled = !enabled;
  saveSvgButton.disabled = !enabled;
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
  draftName = type === 'markdown' ? 'Shared note' : 'Shared snippet';
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
    }
    meta.show(s);
  });
}

// --- Share links ---

interface SharedCode {
  code: string;
  type: SnippetType;
}

function sharedFromHash(): SharedCode | null {
  const m = location.hash.match(/^#(code|md)=(.*)$/);
  const code = m ? decodeCode(m[2]) : null;
  if (code == null) return null;
  return { code, type: m![1] === 'md' ? 'markdown' : 'fretboard' };
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
    newSnippet(sidebar.selectedFolderId, { name: example.name, code: example.code });
    codeInput.focus();
  });

  savePngButton.addEventListener('click', savePng);
  saveSvgButton.addEventListener('click', saveSvg);
  saveMdButton.addEventListener('click', saveMarkdown);

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
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
    e.preventDefault();
    if (e.shiftKey) {
      if (currentType === 'fretboard' && !savePngButton.disabled) void savePng();
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
  setButtonsEnabled(false);
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
