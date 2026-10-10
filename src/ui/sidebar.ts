import type { Library } from '../storage/library';
import { FolderSync } from '../storage/folderSync';
import { exportLibrary, importLibrary } from '../storage/backup';
import { escapeHtml, timeAgo } from '../util';
import { icons } from './icons';
import { thumbnail } from './thumbnail';
import { markdownExcerpt } from '../markdown';
import type { SnippetType } from '../storage/types';
import { toast } from './toast';

export interface SidebarHandlers {
  currentId(): string | null;
  open(id: string): void;
  newSnippet(folderId: string | null, type: SnippetType): void;
}

const EXPANDED_KEY = 'music-notebook:expanded';
const DRAG_TYPE = 'application/x-music-notebook';

export class Sidebar {
  selectedFolderId: string | null = null;
  private query = '';
  private activeTags = new Set<string>();
  private expanded: Set<string>;
  private renaming: string | null = null;
  private renderQueued = false;

  private readonly body: HTMLDivElement;
  private readonly tagsEl: HTMLDivElement;
  private readonly syncEl: HTMLDivElement;
  private readonly searchInput: HTMLInputElement;
  private readonly importInput: HTMLInputElement;

  constructor(
    root: HTMLElement,
    private readonly library: Library,
    private readonly sync: FolderSync,
    private readonly handlers: SidebarHandlers,
  ) {
    this.expanded = loadExpanded();
    root.innerHTML = `
      <div class="sb-head">
        <h2>Library</h2>
        <div class="sb-head-actions">
          <button type="button" class="icon-btn" data-act="new-fretboard" title="New fretboard" aria-label="New fretboard">${icons.newFretboard}</button>
          <button type="button" class="icon-btn" data-act="new-note" title="New Markdown note" aria-label="New Markdown note">${icons.newNote}</button>
          <button type="button" class="icon-btn" data-act="new-folder" title="New folder" aria-label="New folder">${icons.folderPlus}</button>
          <button type="button" class="icon-btn only-narrow" data-act="close" title="Close" aria-label="Close library">${icons.close}</button>
        </div>
      </div>
      <input type="search" class="sb-search" placeholder="Search name, tags, code…" aria-label="Search snippets" />
      <div class="sb-tags" aria-label="Filter by tag"></div>
      <div class="sb-body"></div>
      <div class="sb-sync"></div>
      <input type="file" accept="application/json,.json" hidden />
    `;
    this.body = root.querySelector('.sb-body')!;
    this.tagsEl = root.querySelector('.sb-tags')!;
    this.syncEl = root.querySelector('.sb-sync')!;
    this.searchInput = root.querySelector('.sb-search')!;
    this.importInput = root.querySelector('input[type=file]')!;

    this.searchInput.addEventListener('input', () => {
      this.query = this.searchInput.value;
      this.render();
    });
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('dblclick', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.row[data-kind=folder]');
      if (row?.dataset.id) this.startRename(row.dataset.id);
    });
    this.importInput.addEventListener('change', () => this.onImport());
    this.setupDragAndDrop();

    library.onChange(() => this.requestRender());
    sync.onState(() => this.renderSync());
    window.setInterval(() => this.renderSync(), 30_000);
    this.render();
  }

  requestRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.render();
    });
  }

  // Makes sure the folders above a snippet are expanded.
  reveal(snippetId: string): void {
    const s = this.library.getSnippet(snippetId);
    if (!s) return;
    for (const f of this.library.folderPath(s.folderId)) this.expanded.add(f.id);
    saveExpanded(this.expanded);
    this.requestRender();
  }

  render(): void {
    if (this.renaming) return;
    this.renderTags();
    if (this.query.trim() || this.activeTags.size) this.renderResults();
    else this.renderTree();
    this.renderSync();
  }

  private renderTags(): void {
    const tags = this.library.tagCounts();
    for (const t of this.activeTags) if (!tags.some(([name]) => name === t)) this.activeTags.delete(t);
    this.tagsEl.hidden = tags.length === 0;
    this.tagsEl.innerHTML = tags.map(([tag, count]) => `
      <button type="button" class="chip${this.activeTags.has(tag) ? ' active' : ''}" data-tag="${escapeHtml(tag)}"
        aria-pressed="${this.activeTags.has(tag)}">${escapeHtml(tag)} <span class="chip-count">${count}</span></button>`).join('');
  }

  private renderTree(): void {
    const lib = this.library;
    const currentId = this.handlers.currentId();
    const rows: string[] = [];

    const rootSelected = this.selectedFolderId == null;
    rows.push(`
      <div class="row folder-row root${rootSelected ? ' selected' : ''}" data-kind="folder" data-id="" style="--depth:0">
        <span class="row-icon">${icons.library}</span>
        <span class="row-name">All snippets</span>
        <span class="row-count">${lib.countIn(null)}</span>
      </div>`);

    const visit = (parentId: string | null, depth: number) => {
      for (const f of lib.childFolders(parentId)) {
        const open = this.expanded.has(f.id);
        rows.push(`
          <div class="row folder-row${this.selectedFolderId === f.id ? ' selected' : ''}" data-kind="folder" data-id="${f.id}"
            draggable="true" style="--depth:${depth}" aria-expanded="${open}">
            <span class="caret${open ? ' open' : ''}">${icons.caret}</span>
            <span class="row-icon">${icons.folder}</span>
            <span class="row-name">${escapeHtml(f.name)}</span>
            <span class="row-count">${lib.countIn(f.id)}</span>
            <span class="row-actions">
              <button type="button" class="icon-btn" data-act="rename-folder" title="Rename folder" aria-label="Rename ${escapeHtml(f.name)}">${icons.pencil}</button>
              <button type="button" class="icon-btn" data-act="delete-folder" title="Delete folder" aria-label="Delete ${escapeHtml(f.name)}">${icons.trash}</button>
            </span>
          </div>`);
        if (open) visit(f.id, depth + 1);
      }
      for (const s of lib.snippetsIn(parentId)) {
        rows.push(`
          <div class="row snippet-row${s.id === currentId ? ' current' : ''}" data-kind="snippet" data-id="${s.id}"
            draggable="true" style="--depth:${depth}" ${s.id === currentId ? 'aria-current="true"' : ''}>
            <span class="caret-space"></span>
            <span class="row-icon">${icons[s.type === 'markdown' ? 'note' : 'fretboard']}</span>
            <span class="row-name">${escapeHtml(s.name)}</span>
          </div>`);
      }
    };
    visit(null, 1);

    this.body.innerHTML = `<div class="tree" role="list">${rows.join('')}</div>`;
    if (lib.isEmpty && lib.allFolders().length === 0) {
      this.body.insertAdjacentHTML('beforeend', '<p class="sb-empty">No snippets yet.</p>');
    }
  }

  private renderResults(): void {
    const lib = this.library;
    const results = lib.search({ query: this.query, tags: [...this.activeTags] });
    const currentId = this.handlers.currentId();
    if (!results.length) {
      this.body.innerHTML = '<p class="sb-empty">No matching snippets.</p>';
      return;
    }
    this.body.innerHTML = `<div class="results">${results.map((s) => {
      const path = lib.folderPath(s.folderId).map((f) => f.name).join(' / ') || 'Library';
      return `
        <button type="button" class="result${s.id === currentId ? ' current' : ''}" data-kind="snippet" data-id="${s.id}">
          <span class="thumb" data-code-id="${s.id}"></span>
          <span class="result-name">${escapeHtml(s.name)}</span>
          <span class="result-meta">${escapeHtml(path)} · ${timeAgo(s.updatedAt)}</span>
          ${s.tags.length ? `<span class="result-tags">${s.tags.map((t) => `<span class="mini-chip">${escapeHtml(t)}</span>`).join('')}</span>` : ''}
        </button>`;
    }).join('')}</div>`;

    // Thumbnails render after the list so typing in search stays responsive.
    requestAnimationFrame(() => {
      for (const el of this.body.querySelectorAll<HTMLElement>('.thumb[data-code-id]')) {
        const s = lib.getSnippet(el.dataset.codeId!);
        if (s?.type === 'markdown') {
          el.classList.add('text');
          el.textContent = markdownExcerpt(s.code) || 'Empty note';
          continue;
        }
        const url = s ? thumbnail(s.code) : null;
        if (url) el.innerHTML = `<img src="${url}" alt="" />`;
        else el.classList.add('broken');
      }
    });
  }

  private renderSync(): void {
    const st = this.sync.state;
    const folder = st.folderName ? `<strong>${escapeHtml(st.folderName)}</strong>` : '';
    let status = '';
    let actions = '';
    switch (st.status) {
      case 'unsupported':
        status = 'Folder sync needs Chrome or Edge. Use export/import to move your library between devices.';
        break;
      case 'disconnected':
        status = 'Sync to a folder (e.g. in Dropbox or OneDrive) to use your library on other devices.';
        actions = `<button type="button" class="btn btn-small" data-act="sync-connect">Connect folder…</button>`;
        break;
      case 'needs-permission':
        status = `${folder} — click to allow access again.`;
        actions = `<button type="button" class="btn btn-small btn-primary" data-act="sync-reconnect">Reconnect</button>
          <button type="button" class="btn btn-small" data-act="sync-disconnect">Disconnect</button>`;
        break;
      case 'syncing':
        status = `${folder} · syncing…`;
        break;
      case 'idle':
        status = `${folder} · ${st.lastSync ? `synced ${timeAgo(st.lastSync)}` : 'not synced yet'}`;
        actions = `<button type="button" class="btn btn-small" data-act="sync-now">Sync now</button>
          <button type="button" class="btn btn-small" data-act="sync-disconnect">Disconnect</button>`;
        break;
      case 'error':
        status = `${folder} · <span class="sync-error">${escapeHtml(st.message ?? 'Sync failed')}</span>`;
        actions = `<button type="button" class="btn btn-small" data-act="sync-now">Retry</button>
          <button type="button" class="btn btn-small" data-act="sync-disconnect">Disconnect</button>`;
        break;
    }
    this.syncEl.innerHTML = `
      <div class="sync-status" data-status="${st.status}">
        <span class="row-icon">${icons.sync}</span><span>${status}</span>
      </div>
      ${actions ? `<div class="sync-actions">${actions}</div>` : ''}
      <div class="sync-backup">
        <button type="button" class="link-btn" data-act="export">Export JSON</button>
        <button type="button" class="link-btn" data-act="import">Import JSON</button>
      </div>`;
  }

  private onClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
    const row = target.closest<HTMLElement>('[data-kind]');
    const lib = this.library;

    if (act) {
      const folderId = row?.dataset.id || null;
      switch (act) {
        case 'new-fretboard':
          this.handlers.newSnippet(this.selectedFolderId, 'fretboard');
          return;
        case 'new-note':
          this.handlers.newSnippet(this.selectedFolderId, 'markdown');
          return;
        case 'new-folder': {
          const parent = this.selectedFolderId;
          if (parent) this.expanded.add(parent);
          const folder = lib.createFolder('New folder', parent);
          this.selectedFolderId = folder.id;
          this.render();
          this.startRename(folder.id);
          return;
        }
        case 'rename-folder':
          if (folderId) this.startRename(folderId);
          return;
        case 'delete-folder': {
          if (!folderId) return;
          const undo = lib.deleteFolder(folderId);
          if (!undo) return;
          if (this.selectedFolderId === folderId) this.selectedFolderId = undo.folder.parentId;
          const moved = undo.movedSnippets.length + undo.movedFolders.length;
          toast(`Deleted folder “${undo.folder.name}”${moved ? ` (${moved} item${moved > 1 ? 's' : ''} moved up)` : ''}`,
            { label: 'Undo', run: () => lib.restoreFolder(undo) });
          return;
        }
        case 'close':
          document.body.classList.remove('library-open');
          return;
        case 'sync-connect':
          void this.sync.connect().catch((err) => toast(`Could not connect: ${err.message}`));
          return;
        case 'sync-reconnect':
          void this.sync.reconnect();
          return;
        case 'sync-now':
          void this.sync.sync();
          return;
        case 'sync-disconnect':
          void this.sync.disconnect().then(() => toast('Folder sync turned off. Your files were left in place.'));
          return;
        case 'export':
          exportLibrary(lib);
          return;
        case 'import':
          this.importInput.click();
          return;
      }
    }

    const tag = target.closest<HTMLElement>('[data-tag]')?.dataset.tag;
    if (tag) {
      if (this.activeTags.has(tag)) this.activeTags.delete(tag);
      else this.activeTags.add(tag);
      this.render();
      return;
    }

    if (!row || row.querySelector('.rename-input')) return;
    if (row.dataset.kind === 'snippet') {
      this.handlers.open(row.dataset.id!);
      document.body.classList.remove('library-open');
    } else if (row.dataset.kind === 'folder') {
      const id = row.dataset.id || null;
      if (id && (this.selectedFolderId === id || target.closest('.caret'))) {
        if (this.expanded.has(id)) this.expanded.delete(id);
        else this.expanded.add(id);
        saveExpanded(this.expanded);
      } else if (id) {
        this.expanded.add(id);
        saveExpanded(this.expanded);
      }
      this.selectedFolderId = id;
      this.render();
    }
  }

  private startRename(folderId: string): void {
    const folder = this.library.getFolder(folderId);
    const nameEl = this.body.querySelector<HTMLElement>(`.row[data-id="${folderId}"] .row-name`);
    if (!folder || !nameEl) return;
    this.renaming = folderId;
    const input = Object.assign(document.createElement('input'), {
      className: 'rename-input',
      value: folder.name,
    });
    input.setAttribute('aria-label', 'Folder name');
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      this.renaming = null;
      if (commit && input.value.trim()) this.library.renameFolder(folderId, input.value);
      this.render();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  private async onImport(): Promise<void> {
    const file = this.importInput.files?.[0];
    this.importInput.value = '';
    if (!file) return;
    try {
      const r = await importLibrary(this.library, file);
      toast(`Imported ${r.added} new, ${r.updated} updated${r.skipped ? `, ${r.skipped} unchanged` : ''}`);
    } catch (e) {
      toast(`Import failed: ${(e as Error).message}`);
    }
  }

  private setupDragAndDrop(): void {
    const lib = this.library;
    let dragged: { kind: string; id: string } | null = null;

    this.body.addEventListener('dragstart', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.row[draggable=true]');
      if (!row || !e.dataTransfer) return;
      dragged = { kind: row.dataset.kind!, id: row.dataset.id! };
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(dragged));
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
    });
    this.body.addEventListener('dragend', () => {
      dragged = null;
      this.body.querySelectorAll('.dragging, .drop-target').forEach((el) => el.classList.remove('dragging', 'drop-target'));
    });

    const dropFolder = (e: DragEvent): string | null | undefined => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.row[data-kind=folder]');
      if (!row || !dragged) return undefined;
      const folderId = row.dataset.id || null;
      if (dragged.kind === 'folder' && folderId && (folderId === dragged.id || lib.isDescendant(folderId, dragged.id))) {
        return undefined;
      }
      return folderId;
    };

    this.body.addEventListener('dragover', (e) => {
      const folderId = dropFolder(e);
      this.body.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
      if (folderId === undefined) return;
      e.preventDefault();
      (e.target as HTMLElement).closest('.row')!.classList.add('drop-target');
    });
    this.body.addEventListener('drop', (e) => {
      const folderId = dropFolder(e);
      if (folderId === undefined || !dragged) return;
      e.preventDefault();
      const moved = dragged.kind === 'folder' ? lib.moveFolder(dragged.id, folderId) : lib.moveSnippet(dragged.id, folderId);
      if (moved && folderId) {
        this.expanded.add(folderId);
        saveExpanded(this.expanded);
      }
    });
  }
}

function loadExpanded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

function saveExpanded(expanded: Set<string>): void {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
  } catch {
    // ignore
  }
}
