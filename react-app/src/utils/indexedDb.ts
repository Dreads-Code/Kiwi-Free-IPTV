const DB_NAME = "KiwiIPTVCache";
const STORE_NAME = "epg_cache";
const DB_VERSION = 1;

interface CacheEntry {
  id: string;
  data: string;
  timestamp: number;
}

/**
 * A simple IndexedDB wrapper for caching large chunks of data (like EPG XML).
 */
class IndexedDbCache {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.addEventListener("error", (event) => {
        const error = (event.target as IDBOpenDBRequest).error;
        console.error("IndexedDB error:", error);
        reject(error ?? new Error("Unknown IndexedDB error"));
      });
    });
  }

  async set(id: string, data: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("DB not initialized"));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const entry: CacheEntry = {
        id,
        data,
        timestamp: Date.now(),
      };

      const request = store.put(entry);
      request.onsuccess = () => {
        resolve();
      };
      request.addEventListener("error", () => {
        reject(request.error ?? new Error("IndexedDB set error"));
      });
    });
  }

  async get(id: string, maxAgeMs: number): Promise<string | null> {
    await this.init();
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("DB not initialized"));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined;
        if (!entry) {
          resolve(null);
          return;
        }

        const age = Date.now() - entry.timestamp;
        if (age > maxAgeMs) {
          resolve(null); // Expired
        } else {
          resolve(entry.data);
        }
      };

      request.addEventListener("error", () => {
        reject(request.error ?? new Error("IndexedDB get error"));
      });
    });
  }
}

export const epgCache = new IndexedDbCache();
