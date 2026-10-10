// Mirrors the library into a user-chosen directory using the File System
// Access API (Chromium only). Folders become directories and snippets become
// files holding the snippet id, name and tags in a header:
// - fretboards are `<name>.fret`, with the header as `#` comments in the
//   fretboard syntax, so every file is still valid fretboard code;
// - Markdown notes are `<name>.md`, with the header as YAML front matter, which
//   Markdown editors and previewers understand.
// Put the directory in Dropbox/OneDrive/a git repo and the library follows you
// to other devices.

import { hashString } from '../util';
import { normalizeTags, type Library } from './library';
import type { Folder, Snippet, SnippetType } from './types';

export type SyncStatus = 'unsupported' | 'disconnected' | 'needs-permission' | 'idle' | 'syncing' | 'error';

export interface SyncState {
  status: SyncStatus;
  folderName?: string;
  lastSync?: number;
  message?: string;
}

interface RemoteFile {
  path: string;
  dir: string[];
  name: string;
  type: SnippetType;
  file: File;
  // Only read when the file may have changed since the last sync.
  text?: string;
  parsed?: ParsedFile;
}

interface ParsedFile {
  id?: string;
  name?: string;
  tags: string[];
  code: string;
}

const HANDLE_KEY = 'syncHandle';
const EXT: Record<SnippetType, string> = { fretboard: '.fret', markdown: '.md' };
const LOCAL_CHANGE_DELAY_MS = 1500;
const POLL_INTERVAL_MS = 60_000;

const key = (parts: string[]) => parts.join('/');
const depth = (path: string) => (path ? path.split('/').length : 0);
const dirOf = (path: string) => path.split('/').slice(0, -1);
const stripExt = (name: string) => name.replace(/\.(fret|md)$/i, '');
const baseName = (path: string) => stripExt(path.split('/').pop()!);

function typeOfFile(name: string): SnippetType | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(EXT.fretboard)) return 'fretboard';
  if (lower.endsWith(EXT.markdown)) return 'markdown';
  return null;
}

// --- File format ---

export function serializeSnippet(s: Snippet): string {
  if (s.type === 'markdown') return serializeMarkdown(s);
  const header = [`# id: ${s.id}`, `# name: ${s.name}`];
  if (s.tags.length) header.push(`# tags: ${s.tags.join(', ')}`);
  return header.join('\n') + '\n' + s.code;
}

export function parseSnippetFile(text: string, type: SnippetType): ParsedFile {
  if (type === 'markdown') return parseMarkdown(text);
  const lines = text.split(/\r?\n/);
  const meta: Record<string, string> = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^#\s*(id|name|tags):\s?(.*)$/);
    if (!m || m[1] in meta) break;
    meta[m[1]] = m[2].trim();
  }
  return {
    id: meta.id || undefined,
    name: meta.name || undefined,
    tags: meta.tags ? meta.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    code: lines.slice(i).join('\n'),
  };
}

// Front matter a note already has (e.g. from Obsidian) stays part of its
// code, and the header keys are merged into it.
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/;
const HEADER_KEY = /^(id|name|tags):\s?(.*)$/;

function serializeMarkdown(s: Snippet): string {
  const header = [`id: ${s.id}`, `name: ${JSON.stringify(s.name)}`];
  if (s.tags.length) header.push(`tags: [${s.tags.join(', ')}]`);
  if (!FRONT_MATTER.test(s.code)) return `---\n${header.join('\n')}\n---\n${s.code}`;
  return `---\n${header.join('\n')}\n${s.code.replace(/^---\r?\n/, '')}`;
}

function parseMarkdown(text: string): ParsedFile {
  const m = text.match(FRONT_MATTER);
  if (!m) return { tags: [], code: text };
  const meta: Record<string, string> = {};
  const rest: string[] = [];
  for (const line of m[1].split(/\r?\n/)) {
    const h = line.match(HEADER_KEY);
    if (h && !(h[1] in meta)) meta[h[1]] = h[2].trim();
    else if (line) rest.push(line);
  }
  let name = meta.name;
  if (name?.startsWith('"')) {
    try {
      name = JSON.parse(name);
    } catch {
      // keep it as written
    }
  }
  const body = text.slice(m[0].length);
  return {
    id: meta.id || undefined,
    name: name || undefined,
    tags: meta.tags ? meta.tags.replace(/^\[|\]$/g, '').split(',').map((t) => t.trim()).filter(Boolean) : [],
    code: rest.length ? `---\n${rest.join('\n')}\n---\n${body}` : body,
  };
}

// Makes a name safe as a file/directory name on Windows, macOS and Linux.
export function sanitizeName(name: string): string {
  let safe = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .slice(0, 80)
    .trim();
  if (!safe) safe = 'Untitled';
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(safe)) safe = `_${safe}`;
  return safe;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Picks a unique name within a directory, keeping `previous` if it still fits
// so files are not renamed back and forth between devices. `taken` holds
// lowercased names, each including `ext`.
function uniqueName(base: string, taken: Set<string>, previous?: string, ext = ''): string {
  const free = (name: string) => !taken.has((name + ext).toLowerCase());
  const fits = new RegExp(`^${escapeRegExp(base)}( \\(\\d+\\))?$`, 'i');
  if (previous && fits.test(previous) && free(previous)) return previous;
  let candidate = base;
  for (let n = 2; !free(candidate); n++) candidate = `${base} (${n})`;
  return candidate;
}

// --- Sync engine ---

export class FolderSync extends EventTarget {
  state: SyncState;
  private root: FileSystemDirectoryHandle | null = null;
  private running = false;
  private rerun = false;
  private timer: number | undefined;

  static get supported(): boolean {
    return typeof window.showDirectoryPicker === 'function';
  }

  constructor(private readonly library: Library) {
    super();
    this.state = { status: FolderSync.supported ? 'disconnected' : 'unsupported' };
  }

  async init(): Promise<void> {
    if (!FolderSync.supported) return;

    this.library.onChange(({ source }) => {
      if (source === 'local') this.schedule(LOCAL_CHANGE_DELAY_MS);
    });
    window.addEventListener('focus', () => this.schedule(0));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.schedule(0);
    });
    window.setInterval(() => {
      if (document.visibilityState === 'visible') this.schedule(0);
    }, POLL_INTERVAL_MS);

    const handle = await this.library.getMeta<FileSystemDirectoryHandle>(HANDLE_KEY);
    if (!handle) return;
    this.root = handle;
    const lastSync = await this.library.getMeta<number>('lastSync');
    const permission = await handle.queryPermission?.({ mode: 'readwrite' });
    if (permission === 'granted') {
      this.setState({ status: 'idle', folderName: handle.name, lastSync });
      void this.sync();
    } else {
      this.setState({ status: 'needs-permission', folderName: handle.name, lastSync });
    }
  }

  onState(listener: (state: SyncState) => void): void {
    this.addEventListener('state', () => listener(this.state));
  }

  private setState(patch: Partial<SyncState> & { status: SyncStatus }): void {
    this.state = { folderName: this.state.folderName, lastSync: this.state.lastSync, ...patch };
    this.dispatchEvent(new Event('state'));
  }

  get connected(): boolean {
    return this.root != null && ['idle', 'syncing', 'error'].includes(this.state.status);
  }

  // Must be called from a user gesture (it opens the directory picker).
  async connect(): Promise<void> {
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await window.showDirectoryPicker!({ id: 'music-notebook', mode: 'readwrite' });
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return;
      throw e;
    }
    await this.connectHandle(handle);
  }

  async connectHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    // Bookkeeping from a previous folder means nothing for this one.
    this.clearBookkeeping();
    this.root = handle;
    await this.library.setMeta(HANDLE_KEY, handle);
    this.setState({ status: 'idle', folderName: handle.name, lastSync: undefined, message: undefined });
    await this.sync();
  }

  // Must be called from a user gesture (it may show a permission prompt).
  async reconnect(): Promise<void> {
    if (!this.root) return;
    const permission = await this.root.requestPermission?.({ mode: 'readwrite' });
    if (permission !== 'granted') return;
    this.setState({ status: 'idle', message: undefined });
    await this.sync();
  }

  async disconnect(): Promise<void> {
    window.clearTimeout(this.timer);
    this.root = null;
    this.clearBookkeeping();
    await this.library.setMeta(HANDLE_KEY, undefined);
    await this.library.setMeta('lastSync', undefined);
    this.setState({ status: 'disconnected', folderName: undefined, lastSync: undefined, message: undefined });
  }

  private clearBookkeeping(): void {
    const lib = this.library;
    for (const s of lib.allSnippets()) {
      if (s.syncedAt == null && s.syncedPath == null) continue;
      const { syncedAt: _a, syncedPath: _p, syncedHash: _h, syncedMtime: _m, ...rest } = s;
      lib.putSnippet(rest, 'sync');
    }
    for (const f of lib.allFolders()) {
      if (f.syncedAt == null && f.syncedPath == null) continue;
      const { syncedAt: _a, syncedPath: _p, ...rest } = f;
      lib.putFolder(rest, 'sync');
    }
    for (const t of lib.tombstones()) lib.removeTombstone(t.id);
  }

  schedule(delay: number): void {
    if (!this.connected) return;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.sync(), delay);
  }

  async sync(): Promise<void> {
    if (!this.root || !this.connected) return;
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.running = true;
    this.setState({ status: 'syncing' });
    try {
      do {
        this.rerun = false;
        await this.runSync(this.root);
      } while (this.rerun);
      const lastSync = Date.now();
      await this.library.setMeta('lastSync', lastSync);
      this.setState({ status: 'idle', lastSync, message: undefined });
    } catch (e) {
      const err = e as DOMException;
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
        this.setState({ status: 'needs-permission' });
      } else if (err.name === 'NotFoundError') {
        this.setState({ status: 'error', message: 'The sync folder was moved or deleted. Connect it again.' });
      } else {
        console.error('Folder sync failed', e);
        this.setState({ status: 'error', message: err.message || String(e) });
      }
    } finally {
      this.running = false;
    }
  }

  private async runSync(root: FileSystemDirectoryHandle): Promise<void> {
    const lib = this.library;

    // 1. Scan the directory.
    const files = new Map<string, RemoteFile>();
    const dirs = new Set<string>();
    await scan(root, [], files, dirs);

    // 2. Work out which snippet each file belongs to. Files that have not been
    //    touched since we last wrote them are matched without being read.
    const bySyncedPath = new Map<string, Snippet>();
    for (const s of lib.allSnippets()) if (s.syncedPath) bySyncedPath.set(s.syncedPath, s);

    const fileById = new Map<string, RemoteFile>();
    const unidentified: RemoteFile[] = [];
    for (const rf of files.values()) {
      const known = bySyncedPath.get(rf.path);
      if (known && known.syncedMtime === rf.file.lastModified && !fileById.has(known.id)) {
        fileById.set(known.id, rf);
        continue;
      }
      rf.text = await rf.file.text();
      rf.parsed = parseSnippetFile(rf.text, rf.type);
      const id = rf.parsed.id;
      // A missing id is a hand-made file; a repeated id is a copied file.
      if (id && !fileById.has(id)) fileById.set(id, rf);
      else unidentified.push(rf);
    }

    // Directory path -> folder id, for both current and last-synced paths.
    const dirToFolder = new Map<string, string | null>([['', null]]);
    const startPaths = this.folderPaths();
    for (const f of lib.allFolders()) {
      if (f.syncedPath != null) dirToFolder.set(f.syncedPath, f.id);
    }
    for (const [id, path] of startPaths) dirToFolder.set(path, id);

    const ensureFolder = (dir: string[]): string | null => {
      const k = key(dir);
      const existing = dirToFolder.get(k);
      if (existing !== undefined && (existing === null || lib.getFolder(existing))) return existing;
      const parentId = ensureFolder(dir.slice(0, -1));
      const folder = lib.createFolder(dir[dir.length - 1], parentId, 'sync');
      lib.putFolder({ ...folder, syncedPath: k, syncedAt: folder.updatedAt }, 'sync');
      dirToFolder.set(k, folder.id);
      return folder.id;
    };

    // 3. New directories become folders (parents first). Directories of
    //    folders deleted here are left alone; step 7 removes them if empty.
    const deletedFolderPaths = new Set(
      lib.tombstones().filter((t) => t.kind === 'folder' && t.path).map((t) => t.path!));
    for (const d of [...dirs].sort((a, b) => depth(a) - depth(b))) {
      if (dirToFolder.has(d) || deletedFolderPaths.has(d)) continue;
      if ([...deletedFolderPaths].some((p) => d.startsWith(p + '/'))) continue;
      ensureFolder(d.split('/'));
    }

    // 4. Bring remote changes in.
    const tombstones = new Map(lib.tombstones().map((t) => [t.id, t]));

    const imported = new Set<string>();
    const importNew = (rf: RemoteFile, keepId: boolean) => {
      const parsed = rf.parsed!;
      const id = keepId && parsed.id ? parsed.id : crypto.randomUUID();
      const created = lib.createSnippet({
        name: nameFromFile(rf, parsed),
        type: rf.type,
        folderId: ensureFolder(rf.dir),
        tags: parsed.tags,
        code: parsed.code,
      }, 'sync', id);
      // A rewritten id means the header must be written back out.
      const needsHeader = id !== parsed.id;
      lib.putSnippet({
        ...created,
        syncedAt: needsHeader ? created.updatedAt - 1 : created.updatedAt,
        syncedPath: rf.path,
        syncedHash: hashString(rf.text!),
        syncedMtime: rf.file.lastModified,
      }, 'sync');
      fileById.set(id, rf);
      imported.add(id);
    };

    for (const [id, rf] of [...fileById]) {
      if (lib.getSnippet(id)) continue;
      const tomb = tombstones.get(id);
      if (tomb && rf.file.lastModified <= tomb.deletedAt) {
        fileById.delete(id);
        await removeFile(root, rf.path);
      } else {
        // New on another device - or edited there after we deleted it.
        importNew(rf, true);
      }
    }
    for (const rf of unidentified) importNew(rf, false);

    for (const s of lib.allSnippets()) {
      if (imported.has(s.id)) continue;
      const rf = fileById.get(s.id);
      const localChanged = s.syncedAt == null || s.updatedAt > s.syncedAt;

      if (!rf) {
        // Deleted (or moved away) in the folder, and not edited here since.
        if (s.syncedAt != null && !localChanged) lib.deleteSnippet(s.id, 'sync');
        continue;
      }
      if (!rf.text) continue; // unchanged since the last sync

      // Edited, or moved/renamed by hand.
      const remoteChanged = hashString(rf.text) !== s.syncedHash || rf.path !== s.syncedPath;
      const parsed = rf.parsed!;
      const remoteTags = normalizeTags(parsed.tags);
      const bookkeeping = {
        syncedPath: rf.path,
        syncedHash: hashString(rf.text),
        syncedMtime: rf.file.lastModified,
      };

      if (!remoteChanged) {
        // Only the timestamp changed (e.g. a sync service touched it).
        lib.putSnippet({ ...s, ...bookkeeping }, 'sync');
      } else if (!localChanged) {
        const now = Date.now();
        lib.putSnippet({
          ...s,
          name: nameFromFile(rf, parsed),
          type: rf.type,
          folderId: ensureFolder(rf.dir),
          tags: remoteTags,
          code: parsed.code,
          updatedAt: now,
          syncedAt: now,
          ...bookkeeping,
        }, 'sync');
      } else if (rf.type === s.type && parsed.code === s.code && remoteTags.join() === s.tags.join()) {
        lib.putSnippet({ ...s, syncedAt: s.updatedAt, ...bookkeeping }, 'sync');
      } else {
        // Changed on both sides: keep ours, and the folder's version as a copy.
        lib.createSnippet({
          name: `${nameFromFile(rf, parsed)} (conflict)`,
          type: rf.type,
          folderId: ensureFolder(rf.dir),
          tags: parsed.tags,
          code: parsed.code,
        }, 'sync');
        lib.putSnippet({ ...s, ...bookkeeping }, 'sync');
      }
    }

    // 5. Folders whose directory disappeared, deepest first. A folder that
    //    still holds snippets (edited here since) is kept.
    const sortedFolders = lib.allFolders().sort(
      (a, b) => depth(b.syncedPath ?? '') - depth(a.syncedPath ?? ''));
    for (const f of sortedFolders) {
      if (f.syncedPath == null || f.syncedAt == null || dirs.has(f.syncedPath)) continue;
      if (f.updatedAt > f.syncedAt || lib.countIn(f.id) > 0 || lib.childFolders(f.id).length) continue;
      lib.deleteFolder(f.id, 'sync');
    }

    // 6. Write local changes out.
    const folderPaths = this.folderPaths();
    const snippetPaths = this.snippetPaths(folderPaths);
    const staleDirs = new Set<string>(deletedFolderPaths);

    for (const f of lib.allFolders()) {
      const path = folderPaths.get(f.id)!;
      if (f.syncedPath != null && f.syncedPath !== path) staleDirs.add(f.syncedPath);
      await getDir(root, path.split('/'), true);
      if (f.syncedPath !== path || f.syncedAt !== f.updatedAt) {
        lib.putFolder({ ...f, syncedPath: path, syncedAt: f.updatedAt }, 'sync');
      }
    }

    for (const s of lib.allSnippets()) {
      const path = snippetPaths.get(s.id)!;
      const localChanged = s.syncedAt == null || s.updatedAt > s.syncedAt;
      if (!localChanged && s.syncedPath === path) continue;

      const text = serializeSnippet(s);
      const dir = await getDir(root, dirOf(path), true);
      const handle = await dir.getFileHandle(path.split('/').pop()!, { create: true });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      const file = await handle.getFile();

      // Moved or renamed: remove the old file, if it is still ours.
      const old = fileById.get(s.id);
      if (old && old.path !== path) await removeFile(root, old.path);

      const current = lib.getSnippet(s.id);
      if (current) {
        lib.putSnippet({
          ...current,
          // Edits made while we were writing stay marked as unsynced.
          syncedAt: s.updatedAt,
          syncedPath: path,
          syncedHash: hashString(text),
          syncedMtime: file.lastModified,
        }, 'sync');
      }
    }

    // 7. Remove directories that no folder uses any more (only when empty).
    const livePaths = new Set(folderPaths.values());
    for (const d of [...staleDirs].sort((a, b) => depth(b) - depth(a))) {
      if (d && !livePaths.has(d)) await removeDirIfEmpty(root, d);
    }
    for (const t of lib.tombstones()) lib.removeTombstone(t.id);
  }

  // Directory path for every folder, keeping existing names stable.
  private folderPaths(): Map<string, string> {
    const lib = this.library;
    const paths = new Map<string, string>();
    const visit = (parentId: string | null, parentPath: string) => {
      const taken = new Set<string>();
      const children = lib.childFolders(parentId).sort(stableOrder(parentPath));
      for (const f of children) {
        const previous = f.syncedPath && key(dirOf(f.syncedPath)) === parentPath ? baseName(f.syncedPath) : undefined;
        const name = uniqueName(sanitizeName(f.name), taken, previous);
        taken.add(name.toLowerCase());
        const path = parentPath ? `${parentPath}/${name}` : name;
        paths.set(f.id, path);
        visit(f.id, path);
      }
    };
    visit(null, '');
    return paths;
  }

  // File path for every snippet, keeping existing file names stable.
  private snippetPaths(folderPaths: Map<string, string>): Map<string, string> {
    const lib = this.library;
    const paths = new Map<string, string>();
    for (const folderId of [null, ...folderPaths.keys()]) {
      const dirPath = folderId == null ? '' : folderPaths.get(folderId)!;
      const taken = new Set<string>();
      for (const s of lib.snippetsIn(folderId).sort(stableOrder(dirPath))) {
        const previous = s.syncedPath && key(dirOf(s.syncedPath)) === dirPath ? baseName(s.syncedPath) : undefined;
        const ext = EXT[s.type];
        const name = uniqueName(sanitizeName(s.name), taken, previous, ext);
        taken.add((name + ext).toLowerCase());
        paths.set(s.id, `${dirPath ? dirPath + '/' : ''}${name}${ext}`);
      }
    }
    return paths;
  }
}

// Items already synced into this directory claim their names first.
function stableOrder(dirPath: string) {
  const rank = (x: Folder | Snippet) => (x.syncedPath && key(dirOf(x.syncedPath)) === dirPath ? 0 : 1);
  return (a: Folder | Snippet, b: Folder | Snippet) => rank(a) - rank(b) || a.createdAt - b.createdAt;
}

// The header's name is kept unless the file was renamed by hand.
function nameFromFile(rf: RemoteFile, parsed: ParsedFile): string {
  const base = stripExt(rf.name);
  if (parsed.name) {
    const safe = sanitizeName(parsed.name);
    if (new RegExp(`^${escapeRegExp(safe)}( \\(\\d+\\))?$`, 'i').test(base)) return parsed.name;
  }
  return base;
}

async function scan(
  dir: FileSystemDirectoryHandle,
  prefix: string[],
  files: Map<string, RemoteFile>,
  dirs: Set<string>,
): Promise<void> {
  for await (const [name, handle] of dir.entries()) {
    if (name.startsWith('.')) continue;
    const parts = [...prefix, name];
    if (handle.kind === 'directory') {
      dirs.add(key(parts));
      await scan(handle as FileSystemDirectoryHandle, parts, files, dirs);
    } else {
      const type = typeOfFile(name);
      if (!type) continue;
      const file = await (handle as FileSystemFileHandle).getFile();
      files.set(key(parts), { path: key(parts), dir: prefix, name, type, file });
    }
  }
}

async function getDir(root: FileSystemDirectoryHandle, parts: string[], create: boolean) {
  let dir = root;
  for (const part of parts) if (part) dir = await dir.getDirectoryHandle(part, { create });
  return dir;
}

async function removeFile(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  try {
    const dir = await getDir(root, dirOf(path), false);
    await dir.removeEntry(path.split('/').pop()!);
  } catch (e) {
    if ((e as DOMException).name !== 'NotFoundError') throw e;
  }
}

async function removeDirIfEmpty(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  try {
    const parts = path.split('/');
    const dir = await getDir(root, parts, false);
    if (!(await dir.keys().next()).done) return;
    const parent = await getDir(root, parts.slice(0, -1), false);
    await parent.removeEntry(parts[parts.length - 1]);
  } catch (e) {
    if ((e as DOMException).name !== 'NotFoundError') throw e;
  }
}
