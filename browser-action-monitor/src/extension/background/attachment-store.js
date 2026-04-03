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
