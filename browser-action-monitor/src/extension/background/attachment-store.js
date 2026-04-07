function estimateBytes(value) {
  return new TextEncoder().encode(String(value || "")).length;
}

function getRuntimeError() {
  return globalThis.chrome?.runtime?.lastError || null;
}

export function getAttachmentStorageKey(actionId) {
  return `monitorAttachment:${actionId}`;
}

export function createAttachmentStorageAdapter(initialState = {}) {
  const store = new Map(Object.entries(initialState));

  return {
    async get(keys) {
      if (keys == null) {
        return Object.fromEntries(store.entries());
      }

      const list = Array.isArray(keys) ? keys : [keys];
      const result = {};
      for (const key of list) {
        if (store.has(key)) {
          result[key] = store.get(key);
        }
      }
      return result;
    },
    async set(entries) {
      for (const [key, value] of Object.entries(entries || {})) {
        store.set(key, value);
      }
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) {
        store.delete(key);
      }
    },
    async clear() {
      store.clear();
    }
  };
}

export function createChromeAttachmentStorageAdapter(storageArea) {
  return {
    async get(keys) {
      return new Promise((resolve, reject) => {
        storageArea.get(keys, (result) => {
          const runtimeError = getRuntimeError();
          if (runtimeError) {
            reject(new Error(runtimeError.message || String(runtimeError)));
            return;
          }

          resolve(result || {});
        });
      });
    },
    async set(entries) {
      return new Promise((resolve, reject) => {
        storageArea.set(entries, () => {
          const runtimeError = getRuntimeError();
          if (runtimeError) {
            reject(new Error(runtimeError.message || String(runtimeError)));
            return;
          }

          resolve();
        });
      });
    },
    async remove(keys) {
      return new Promise((resolve, reject) => {
        storageArea.remove(keys, () => {
          const runtimeError = getRuntimeError();
          if (runtimeError) {
            reject(new Error(runtimeError.message || String(runtimeError)));
            return;
          }

          resolve();
        });
      });
    },
    async clear() {
      const entries = await this.get(null);
      const keys = Object.keys(entries || {});
      if (!keys.length) {
        return;
      }

      await this.remove(keys);
    }
  };
}

function getActionIdFromStorageKey(storageKey) {
  return String(storageKey || "").replace(/^monitorAttachment:/, "");
}

export function createIndexedDbAttachmentStorageAdapter(indexedDbBackend) {
  if (!indexedDbBackend) {
    throw new Error("missing_indexeddb_backend");
  }

  return {
    async get(keys) {
      if (keys == null) {
        const records = await indexedDbBackend.getAll();
        return Object.fromEntries(
          (records || []).map((record) => [getAttachmentStorageKey(record.actionId), record])
        );
      }

      const list = Array.isArray(keys) ? keys : [keys];
      const result = {};
      for (const key of list) {
        const record = await indexedDbBackend.get(getActionIdFromStorageKey(key));
        if (record) {
          result[key] = record;
        }
      }
      return result;
    },
    async set(entries) {
      for (const [storageKey, value] of Object.entries(entries || {})) {
        await indexedDbBackend.put({
          ...value,
          actionId: value?.actionId || getActionIdFromStorageKey(storageKey)
        });
      }
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) {
        await indexedDbBackend.delete(getActionIdFromStorageKey(key));
      }
    },
    async clear() {
      await indexedDbBackend.clear();
    }
  };
}

export function createIndexedDbBackedAttachmentStorageAdapter({
  indexedDbAdapter,
  legacyAdapter = null
}) {
  if (!indexedDbAdapter) {
    throw new Error("missing_indexeddb_adapter");
  }

  return {
    async get(keys) {
      if (keys == null) {
        const [primaryEntries, legacyEntries] = await Promise.all([
          indexedDbAdapter.get(null),
          legacyAdapter ? legacyAdapter.get(null) : {}
        ]);

        return {
          ...(legacyEntries || {}),
          ...(primaryEntries || {})
        };
      }

      const list = Array.isArray(keys) ? keys : [keys];
      const primaryEntries = await indexedDbAdapter.get(list);
      const missingKeys = list.filter((key) => !(key in (primaryEntries || {})));
      const legacyEntries = missingKeys.length && legacyAdapter
        ? await legacyAdapter.get(missingKeys)
        : {};

      return {
        ...(legacyEntries || {}),
        ...(primaryEntries || {})
      };
    },
    async set(entries) {
      await indexedDbAdapter.set(entries);
    },
    async remove(keys) {
      await indexedDbAdapter.remove(keys);
      if (legacyAdapter) {
        await legacyAdapter.remove(keys);
      }
    },
    async clear() {
      await indexedDbAdapter.clear();
      if (legacyAdapter) {
        if (typeof legacyAdapter.clear === "function") {
          await legacyAdapter.clear();
        } else {
          const legacyEntries = await legacyAdapter.get(null);
          const legacyKeys = Object.keys(legacyEntries || {});
          if (legacyKeys.length) {
            await legacyAdapter.remove(legacyKeys);
          }
        }
      }
    }
  };
}

export async function saveScreenshotAttachment(adapter, {
  actionId,
  dataUrl,
  mimeType = "image/jpeg",
  width = 0,
  height = 0
}) {
  const storageKey = getAttachmentStorageKey(actionId);
  const payload = {
    actionId,
    dataUrl,
    mimeType,
    width,
    height,
    sizeBytes: estimateBytes(dataUrl),
    savedAt: Date.now()
  };

  await adapter.set({
    [storageKey]: payload
  });

  return {
    storageKey,
    sizeBytes: payload.sizeBytes
  };
}

export async function readScreenshotAttachment(adapter, actionId) {
  const storageKey = getAttachmentStorageKey(actionId);
  const result = await adapter.get(storageKey);
  return result[storageKey] || null;
}

export async function deleteScreenshotAttachment(adapter, actionId) {
  await adapter.remove(getAttachmentStorageKey(actionId));
}

export async function getAttachmentUsage(adapter) {
  const entries = await adapter.get(null);
  const keys = Object.keys(entries).filter((key) => key.startsWith("monitorAttachment:"));
  const totalBytes = keys.reduce((sum, key) => sum + Number(entries[key]?.sizeBytes || 0), 0);

  return {
    count: keys.length,
    totalBytes,
    keys
  };
}

export async function clearAllAttachments(adapter) {
  if (typeof adapter?.clear === "function") {
    await adapter.clear();
    return;
  }

  const usage = await getAttachmentUsage(adapter);
  if (usage.keys.length) {
    await adapter.remove(usage.keys);
  }
}
