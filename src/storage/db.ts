import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Folder, Snippet, Tombstone } from './types';

export interface LibrarySchema extends DBSchema {
  snippets: { key: string; value: Snippet };
  folders: { key: string; value: Folder };
  tombstones: { key: string; value: Tombstone };
  meta: { key: string; value: unknown };
}

export type LibraryDB = IDBPDatabase<LibrarySchema>;

export function openLibraryDB(): Promise<LibraryDB> {
  return openDB<LibrarySchema>('vex-fretboard', 1, {
    upgrade(db) {
      db.createObjectStore('snippets', { keyPath: 'id' });
      db.createObjectStore('folders', { keyPath: 'id' });
      db.createObjectStore('tombstones', { keyPath: 'id' });
      db.createObjectStore('meta');
    },
  });
}
