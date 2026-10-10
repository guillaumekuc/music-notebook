// The snippet library. Everything is held in memory and written through to
// IndexedDB, so reads are synchronous for the UI. This is the only storage
// interface the UI uses; folder sync and backup work through it too.

import { openLibraryDB, type LibraryDB } from './db';
import type { Folder, Snippet, Tombstone } from './types';

const LEGACY_STORAGE_KEY = 'vex-fretboard:code';

export type ChangeSource = 'local' | 'sync';

export interface LibraryChange {
  source: ChangeSource;
}

export interface SnippetFilter {
  query?: string;
  tags?: string[];
}

export type SnippetInit = Partial<Pick<Snippet, 'name' | 'type' | 'folderId' | 'tags' | 'code'>>;

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  for (const tag of tags) {
    const t = tag.trim().toLowerCase().replace(/\s+/g, '-');
    if (t) seen.add(t);
  }
  return [...seen].sort();
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

export class Library extends EventTarget {
  private db!: LibraryDB;
  private snippetMap = new Map<string, Snippet>();
  private folderMap = new Map<string, Folder>();
  private tombstoneMap = new Map<string, Tombstone>();

  async init(): Promise<void> {
    this.db = await openLibraryDB();
    // Snippets saved before Markdown notes existed have no type.
    for (const s of await this.db.getAll('snippets')) this.snippetMap.set(s.id, { ...s, type: s.type ?? 'fretboard' });
    for (const f of await this.db.getAll('folders')) this.folderMap.set(f.id, f);
    for (const t of await this.db.getAll('tombstones')) this.tombstoneMap.set(t.id, t);
    await this.migrateLegacy();
  }

  // Before the library existed the app kept a single snippet in localStorage.
  private async migrateLegacy(): Promise<void> {
    let legacy: string | null = null;
    try {
      legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    } catch {
      return;
    }
    if (legacy == null) return;
    if (legacy.trim()) this.createSnippet({ name: 'Untitled', code: legacy });
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  private emit(source: ChangeSource) {
    this.dispatchEvent(new CustomEvent<LibraryChange>('change', { detail: { source } }));
  }

  onChange(listener: (change: LibraryChange) => void): void {
    this.addEventListener('change', (e) => listener((e as CustomEvent<LibraryChange>).detail));
  }

  // --- Reads ---

  get isEmpty(): boolean {
    return this.snippetMap.size === 0;
  }

  getSnippet(id: string): Snippet | undefined {
    return this.snippetMap.get(id);
  }

  getFolder(id: string | null): Folder | undefined {
    return id == null ? undefined : this.folderMap.get(id);
  }

  allSnippets(): Snippet[] {
    return [...this.snippetMap.values()];
  }

  allFolders(): Folder[] {
    return [...this.folderMap.values()];
  }

  tombstones(): Tombstone[] {
    return [...this.tombstoneMap.values()];
  }

  childFolders(parentId: string | null): Folder[] {
    return this.allFolders().filter((f) => f.parentId === parentId).sort(byName);
  }

  snippetsIn(folderId: string | null): Snippet[] {
    return this.allSnippets().filter((s) => s.folderId === folderId).sort(byName);
  }

  recentSnippets(): Snippet[] {
    return this.allSnippets().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // Number of snippets in a folder, including subfolders.
  countIn(folderId: string | null): number {
    if (folderId == null) return this.snippetMap.size;
    return this.snippetsIn(folderId).length +
      this.childFolders(folderId).reduce((n, f) => n + this.countIn(f.id), 0);
  }

  search(filter: SnippetFilter): Snippet[] {
    const query = filter.query?.trim().toLowerCase() ?? '';
    const tags = filter.tags ?? [];
    return this.recentSnippets().filter((s) =>
      tags.every((t) => s.tags.includes(t)) &&
      (!query ||
        s.name.toLowerCase().includes(query) ||
        s.tags.some((t) => t.includes(query)) ||
        s.code.toLowerCase().includes(query)));
  }

  tagCounts(): [string, number][] {
    const counts = new Map<string, number>();
    for (const s of this.snippetMap.values()) {
      for (const t of s.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => a[0].localeCompare(b[0]));
  }

  folderPath(folderId: string | null): Folder[] {
    const path: Folder[] = [];
    for (let f = this.getFolder(folderId); f; f = this.getFolder(f.parentId)) path.unshift(f);
    return path;
  }

  isDescendant(folderId: string | null, ancestorId: string): boolean {
    return this.folderPath(folderId).some((f) => f.id === ancestorId);
  }

  // --- Snippet writes ---

  createSnippet(init: SnippetInit = {}, source: ChangeSource = 'local', id: string = crypto.randomUUID()): Snippet {
    const now = Date.now();
    const snippet: Snippet = {
      id,
      name: init.name?.trim() || 'Untitled',
      type: init.type ?? 'fretboard',
      folderId: init.folderId ?? null,
      tags: normalizeTags(init.tags ?? []),
      code: init.code ?? '',
      createdAt: now,
      updatedAt: now,
    };
    this.putSnippet(snippet, source);
    return snippet;
  }

  updateSnippet(id: string, patch: SnippetInit): Snippet | undefined {
    const current = this.snippetMap.get(id);
    if (!current) return undefined;
    const next: Snippet = { ...current, ...patch, updatedAt: Date.now() };
    if (patch.tags) next.tags = normalizeTags(patch.tags);
    if (patch.name != null) next.name = patch.name.trim() || 'Untitled';
    this.putSnippet(next, 'local');
    return next;
  }

  duplicateSnippet(id: string): Snippet | undefined {
    const s = this.snippetMap.get(id);
    if (!s) return undefined;
    return this.createSnippet({ name: `${s.name} copy`, type: s.type, folderId: s.folderId, tags: s.tags, code: s.code });
  }

  deleteSnippet(id: string, source: ChangeSource = 'local'): Snippet | undefined {
    const s = this.snippetMap.get(id);
    if (!s) return undefined;
    this.snippetMap.delete(id);
    void this.db.delete('snippets', id);
    if (source === 'local' && s.syncedPath) {
      this.putTombstone({ id, kind: 'snippet', deletedAt: Date.now(), path: s.syncedPath });
    }
    this.emit(source);
    return s;
  }

  // Undo for deleteSnippet: puts the snippet back as a local change.
  restoreSnippet(snippet: Snippet): void {
    this.removeTombstone(snippet.id);
    const folderId = snippet.folderId && this.folderMap.has(snippet.folderId) ? snippet.folderId : null;
    this.putSnippet({ ...snippet, folderId, updatedAt: Date.now() }, 'local');
  }

  // Stores a snippet exactly as given (no timestamp changes). Used by sync and import.
  putSnippet(snippet: Snippet, source: ChangeSource): void {
    this.snippetMap.set(snippet.id, snippet);
    void this.db.put('snippets', snippet);
    this.emit(source);
  }

  // --- Folder writes ---

  createFolder(name: string, parentId: string | null = null, source: ChangeSource = 'local'): Folder {
    const now = Date.now();
    const folder: Folder = {
      id: crypto.randomUUID(),
      name: name.trim() || 'New folder',
      parentId,
      createdAt: now,
      updatedAt: now,
    };
    this.putFolder(folder, source);
    return folder;
  }

  renameFolder(id: string, name: string): void {
    const f = this.folderMap.get(id);
    if (!f || !name.trim()) return;
    this.putFolder({ ...f, name: name.trim(), updatedAt: Date.now() }, 'local');
  }

  moveFolder(id: string, parentId: string | null): boolean {
    const f = this.folderMap.get(id);
    if (!f || f.parentId === parentId || id === parentId) return false;
    if (parentId && this.isDescendant(parentId, id)) return false;
    this.putFolder({ ...f, parentId, updatedAt: Date.now() }, 'local');
    return true;
  }

  moveSnippet(id: string, folderId: string | null): boolean {
    const s = this.snippetMap.get(id);
    if (!s || s.folderId === folderId) return false;
    this.updateSnippet(id, { folderId });
    return true;
  }

  // Deletes a folder, moving its snippets and subfolders up to its parent.
  // Returns what is needed to undo it.
  deleteFolder(id: string, source: ChangeSource = 'local') {
    const folder = this.folderMap.get(id);
    if (!folder) return undefined;
    const now = Date.now();
    const movedSnippets = this.snippetsIn(id).map((s) => s.id);
    const movedFolders = this.childFolders(id).map((f) => f.id);
    for (const sid of movedSnippets) {
      const s = this.snippetMap.get(sid)!;
      this.putSnippet({ ...s, folderId: folder.parentId, updatedAt: source === 'local' ? now : s.updatedAt }, source);
    }
    for (const fid of movedFolders) {
      const f = this.folderMap.get(fid)!;
      this.putFolder({ ...f, parentId: folder.parentId, updatedAt: source === 'local' ? now : f.updatedAt }, source);
    }
    this.folderMap.delete(id);
    void this.db.delete('folders', id);
    if (source === 'local' && folder.syncedPath) {
      this.putTombstone({ id, kind: 'folder', deletedAt: now, path: folder.syncedPath });
    }
    this.emit(source);
    return { folder, movedSnippets, movedFolders };
  }

  restoreFolder(undo: { folder: Folder; movedSnippets: string[]; movedFolders: string[] }): void {
    const { folder, movedSnippets, movedFolders } = undo;
    this.removeTombstone(folder.id);
    const parentId = folder.parentId && this.folderMap.has(folder.parentId) ? folder.parentId : null;
    this.putFolder({ ...folder, parentId, updatedAt: Date.now() }, 'local');
    for (const sid of movedSnippets) this.moveSnippet(sid, folder.id);
    for (const fid of movedFolders) this.moveFolder(fid, folder.id);
  }

  putFolder(folder: Folder, source: ChangeSource): void {
    this.folderMap.set(folder.id, folder);
    void this.db.put('folders', folder);
    this.emit(source);
  }

  // --- Tombstones & metadata ---

  putTombstone(t: Tombstone): void {
    this.tombstoneMap.set(t.id, t);
    void this.db.put('tombstones', t);
  }

  removeTombstone(id: string): void {
    if (!this.tombstoneMap.delete(id)) return;
    void this.db.delete('tombstones', id);
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.db.get('meta', key)) as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    if (value === undefined) await this.db.delete('meta', key);
    else await this.db.put('meta', value, key);
  }
}
