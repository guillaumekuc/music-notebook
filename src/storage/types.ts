export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
  // Folder sync bookkeeping: directory path at the last sync, and when.
  syncedPath?: string;
  syncedAt?: number;
}

export interface Snippet {
  id: string;
  name: string;
  folderId: string | null;
  tags: string[];
  code: string;
  createdAt: number;
  updatedAt: number;
  // Folder sync bookkeeping. The snippet changed locally when
  // updatedAt > syncedAt; the file changed when its content hash differs
  // from syncedHash (read is skipped while path and mtime are unchanged).
  syncedAt?: number;
  syncedPath?: string;
  syncedHash?: string;
  syncedMtime?: number;
}

// Remembers deletions so folder sync can remove the matching file/directory.
export interface Tombstone {
  id: string;
  kind: 'snippet' | 'folder';
  deletedAt: number;
  path?: string;
}

export interface LibraryExport {
  format: 'music-notebook-library' | 'vex-fretboard-library';
  version: 1;
  exportedAt: number;
  folders: Folder[];
  snippets: Snippet[];
}
