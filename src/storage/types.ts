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

export type SnippetType = 'fretboard' | 'markdown' | 'notation';
export const SNIPPET_TYPES: SnippetType[] = ['fretboard', 'markdown', 'notation'];

export interface Snippet {
  id: string;
  name: string;
  type: SnippetType;
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

// Pasted images are referenced from notes as `attachments/<name>`, and folder
// sync keeps them in a directory of that name.
export const ATTACHMENTS_DIR = 'attachments';

// An image pasted into a note.
export interface Asset {
  name: string;
  type: string;
  blob: Blob;
  createdAt: number;
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
  // Images as data URLs (added after version 1, so may be missing).
  assets?: { name: string; type: string; data: string }[];
}
