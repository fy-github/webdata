const DEFAULT_DB_NAME = "browserActionMonitorAttachments";
const DEFAULT_STORE_NAME = "screenshots";
const DEFAULT_DB_VERSION = 1;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("indexeddb_request_failed"));
  });
}

function transactionToPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("indexeddb_transaction_failed"));
    transaction.onabort = () => reject(transaction.error || new Error("indexeddb_transaction_aborted"));
  });
}

export function createBrowserIndexedDbAttachmentBackend({
  indexedDbFactory = globalThis.indexedDB,
  dbName = DEFAULT_DB_NAME,
  storeName = DEFAULT_STORE_NAME,
  version = DEFAULT_DB_VERSION
} = {}) {
  if (!indexedDbFactory || typeof indexedDbFactory.open !== "function") {
    throw new Error("indexeddb_unavailable");
  }

  let dbPromise = null;

  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDbFactory.open(dbName, version);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(storeName)) {
            database.createObjectStore(storeName, { keyPath: "actionId" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("indexeddb_open_failed"));
      });
    }

    return dbPromise;
  }

  async function withStore(mode, operation) {
    const database = await openDb();
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = await operation(store);
    await transactionToPromise(transaction);
    return result;
  }

  return {
    async put(record) {
      await withStore("readwrite", async (store) => {
        await requestToPromise(store.put(record));
      });
    },
    async get(actionId) {
      return withStore("readonly", (store) => requestToPromise(store.get(actionId)));
    },
    async delete(actionId) {
      await withStore("readwrite", async (store) => {
        await requestToPromise(store.delete(actionId));
      });
    },
    async getAll() {
      return withStore("readonly", (store) => requestToPromise(store.getAll()));
    },
    async clear() {
      await withStore("readwrite", async (store) => {
        await requestToPromise(store.clear());
      });
    }
  };
}
