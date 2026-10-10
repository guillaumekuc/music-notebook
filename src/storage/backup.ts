import { download } from '../util';
import { normalizeTags, type Library } from './library';
import type { Folder, LibraryExport, Snippet } from './types';

export function exportLibrary(library: Library): void {
  // Sync bookkeeping is per-device, so it stays out of the export.
  const data: LibraryExport = {
    format: 'vex-fretboard-library',
    version: 1,
    exportedAt: Date.now(),
    folders: library.allFolders().map(({ syncedPath: _p, syncedAt: _a, ...f }) => f),
    snippets: library.allSnippets().map(
      ({ syncedAt: _a, syncedPath: _p, syncedHash: _h, syncedMtime: _m, ...s }) => s),
  };
  const date = new Date().toISOString().slice(0, 10);
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    `fretboard-library-${date}.json`);
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
}

// Merges an export into the library by id; the newer updatedAt wins.
export async function importLibrary(library: Library, file: File): Promise<ImportResult> {
  let data: LibraryExport;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('Not a valid JSON file');
  }
  if (data?.format !== 'vex-fretboard-library' || !Array.isArray(data.snippets) || !Array.isArray(data.folders)) {
    throw new Error('Not a Music Notebook library export');
  }

  const result: ImportResult = { added: 0, updated: 0, skipped: 0 };
  const isString = (v: unknown): v is string => typeof v === 'string';

  // Folders first so snippets can reference them; parents may come later in
  // the list, so dangling parents are fixed up afterwards.
  const folders = data.folders.filter((f): f is Folder => isString(f?.id) && isString(f?.name));
  for (const f of folders) {
    const existing = library.getFolder(f.id);
    if (existing && existing.updatedAt >= (f.updatedAt ?? 0)) continue;
    library.putFolder({
      id: f.id,
      name: f.name,
      parentId: isString(f.parentId) ? f.parentId : null,
      createdAt: Number(f.createdAt) || Date.now(),
      updatedAt: Number(f.updatedAt) || Date.now(),
      syncedPath: existing?.syncedPath,
      syncedAt: existing?.syncedAt,
    }, 'local');
  }
  for (const f of library.allFolders()) {
    if (f.parentId && (!library.getFolder(f.parentId) || library.isDescendant(f.parentId, f.id))) {
      library.putFolder({ ...f, parentId: null }, 'local');
    }
  }

  for (const s of data.snippets as Partial<Snippet>[]) {
    if (!isString(s?.id) || !isString(s.code)) {
      result.skipped++;
      continue;
    }
    const existing = library.getSnippet(s.id);
    const updatedAt = Number(s.updatedAt) || Date.now();
    if (existing && existing.updatedAt >= updatedAt) {
      result.skipped++;
      continue;
    }
    library.putSnippet({
      id: s.id,
      name: isString(s.name) && s.name.trim() ? s.name : 'Untitled',
      folderId: isString(s.folderId) && library.getFolder(s.folderId) ? s.folderId : null,
      tags: normalizeTags(Array.isArray(s.tags) ? s.tags.filter(isString) : []),
      code: s.code,
      createdAt: Number(s.createdAt) || updatedAt,
      // Count as a local edit so folder sync writes it out.
      updatedAt: Math.max(updatedAt, (existing?.syncedAt ?? 0) + 1),
      syncedAt: existing?.syncedAt,
      syncedPath: existing?.syncedPath,
      syncedHash: existing?.syncedHash,
      syncedMtime: existing?.syncedMtime,
    }, 'local');
    if (existing) result.updated++;
    else result.added++;
  }
  return result;
}
