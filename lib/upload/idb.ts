/**
 * IndexedDB persistence for the upload queue.
 *
 * Storing the `File` object itself (browsers allow Blob/File to be structured
 * cloned into IndexedDB) is what makes it possible to resume an upload after the
 * tab was closed - without it we could only resume while the page stays open.
 */

export const UPLOAD_DB_NAME = "katsu-upload-manager";
export const UPLOAD_DB_VERSION = 1;
export const UPLOAD_STORE = "queue";

export interface StoredUploadItem {
  id: string;
  filename: string;
  size: number;
  lastModified: number;
  contentType: string;
  visibility: "public" | "private";
  preferredStorageId?: string | null;
  sessionId?: string | null;
  partSize?: number;
  partsTotal?: number;
  uploadedParts?: Array<{ partNumber: number; etag: string }>;
  bytesUploaded: number;
  status: string;
  error?: string | null;
  storageName?: string | null;
  downloadUrl?: string | null;
  addedAt: number;
  updatedAt: number;
  file?: File;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function isAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export function openUploadDb(): Promise<IDBDatabase | null> {
  if (!isAvailable()) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(UPLOAD_DB_NAME, UPLOAD_DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(UPLOAD_STORE)) {
            db.createObjectStore(UPLOAD_STORE, { keyPath: "id" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

export async function idbPut(item: StoredUploadItem): Promise<void> {
  const db = await openUploadDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(UPLOAD_STORE, "readwrite");
      tx.objectStore(UPLOAD_STORE).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function idbGetAll(): Promise<StoredUploadItem[]> {
  const db = await openUploadDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(UPLOAD_STORE, "readonly");
      const request = tx.objectStore(UPLOAD_STORE).getAll();
      request.onsuccess = () => resolve((request.result as StoredUploadItem[]) ?? []);
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function idbDelete(id: string): Promise<void> {
  const db = await openUploadDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(UPLOAD_STORE, "readwrite");
      tx.objectStore(UPLOAD_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function idbClear(): Promise<void> {
  const db = await openUploadDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(UPLOAD_STORE, "readwrite");
      tx.objectStore(UPLOAD_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** `nama:ukuran:lastModified` - dipakai untuk mencocokkan sesi server dengan file lokal. */
export function fileFingerprint(name: string, size: number, lastModified: number): string {
  return `${name}:${size}:${lastModified}`;
}
