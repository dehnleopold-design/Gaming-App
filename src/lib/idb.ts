/** Minimaler IndexedDB-Wrapper für Audiodateien des Soundboards. */

const DB_NAME = 'squadnight'
const DB_VERSION = 1
export const SOUND_STORE = 'sounds'

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(SOUND_STORE)) {
          db.createObjectStore(SOUND_STORE, { keyPath: 'id' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => {
        dbPromise = null
        reject(req.error)
      }
    })
  }
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(SOUND_STORE, mode)
        const req = fn(tx.objectStore(SOUND_STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export const idb = {
  getAll: <T>() => run<T[]>('readonly', (s) => s.getAll() as IDBRequest<T[]>),
  put: <T>(value: T) => run('readwrite', (s) => s.put(value)),
  delete: (id: string) => run('readwrite', (s) => s.delete(id)),
  clear: () => run('readwrite', (s) => s.clear()),
}
