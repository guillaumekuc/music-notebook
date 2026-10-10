import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Folder, Snippet, Tombstone } from './types';

export interface LibrarySchema extends DBSchema {
  snippets: { key: string; value: Snippet };
  folders: { key: string; value: Folder };
  tombstones: { key: string; value: Tombstone };
  meta: { key: string; value: unknown };
}

export type LibraryDB = IDBPDatabase<LibrarySchema>;

const DB_NAME = 'music-notebook';
// The app was called Vex Fretboard and kept its library under this name.
const LEGACY_DB_NAME = 'vex-fretboard';
const MIGRATED_KEY = 'migratedFromLegacy';

export async function openLibraryDB(): Promise<LibraryDB> {
  const db = await openDB<LibrarySchema>(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore('snippets', { keyPath: 'id' });
      db.createObjectStore('folders', { keyPath: 'id' });
      db.createObjectStore('tombstones', { keyPath: 'id' });
      db.createObjectStore('meta');
    },
  });
  await migrateLegacyDB(db);
  return db;
}

// Copies the legacy database into the new one, then deletes it. The copy and
// the migrated flag are written in one transaction, so an interrupted
// migration is simply redone on the next launch and never overwrites newer
// data with old.
async function migrateLegacyDB(db: LibraryDB): Promise<void> {
  // Opening without a version creates an empty database if none existed.
  const legacy = await openDB<LibrarySchema>(LEGACY_DB_NAME);
  const hasData = legacy.objectStoreNames.contains('snippets');
  const migrated = await db.get('meta', MIGRATED_KEY);

  if (hasData && !migrated) {
    const [snippets, folders, tombstones, metaKeys, metaValues] = await Promise.all([
      legacy.getAll('snippets'),
      legacy.getAll('folders'),
      legacy.getAll('tombstones'),
      legacy.getAllKeys('meta'),
      legacy.getAll('meta'),
    ]);
    const tx = db.transaction(['snippets', 'folders', 'tombstones', 'meta'], 'readwrite');
    await Promise.all([
      ...snippets.map((s) => tx.objectStore('snippets').put(s)),
      ...folders.map((f) => tx.objectStore('folders').put(f)),
      ...tombstones.map((t) => tx.objectStore('tombstones').put(t)),
      ...metaKeys.map((k, i) => tx.objectStore('meta').put(metaValues[i], k)),
      tx.objectStore('meta').put(true, MIGRATED_KEY),
      tx.done,
    ]);
  }

  legacy.close();
  // Not awaited: another tab still running the old version blocks the delete
  // until it closes, and startup shouldn't wait for that.
  void deleteDB(LEGACY_DB_NAME);
}
