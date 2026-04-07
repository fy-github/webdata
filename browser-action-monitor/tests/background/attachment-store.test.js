import test from "node:test";
import assert from "node:assert/strict";

import {
  createAttachmentStorageAdapter,
  createIndexedDbAttachmentStorageAdapter,
  createIndexedDbBackedAttachmentStorageAdapter,
  createChromeAttachmentStorageAdapter,
  getAttachmentStorageKey,
  saveScreenshotAttachment,
  readScreenshotAttachment,
  deleteScreenshotAttachment,
  getAttachmentUsage,
  clearAllAttachments
} from "../../src/extension/background/attachment-store.js";

function createFakeIndexedDbBackend(initialState = {}) {
  const store = new Map(Object.entries(initialState));

  return {
    async put(record) {
      store.set(record.actionId, record);
    },
    async get(actionId) {
      return store.get(actionId) || null;
    },
    async delete(actionId) {
      store.delete(actionId);
    },
    async getAll() {
      return [...store.values()];
    },
    async clear() {
      store.clear();
    }
  };
}

test("attachment store saves, reads, and deletes screenshot payloads by action id", async () => {
  const adapter = createAttachmentStorageAdapter();

  await saveScreenshotAttachment(adapter, {
    actionId: "act_1",
    dataUrl: "data:image/jpeg;base64,abcd",
    mimeType: "image/jpeg",
    width: 800,
    height: 600
  });

  const stored = await readScreenshotAttachment(adapter, "act_1");
  assert.equal(stored.dataUrl, "data:image/jpeg;base64,abcd");
  assert.equal(stored.mimeType, "image/jpeg");

  await deleteScreenshotAttachment(adapter, "act_1");
  const missing = await readScreenshotAttachment(adapter, "act_1");
  assert.equal(missing, null);
});

test("attachment store reports usage in bytes and count", async () => {
  const adapter = createAttachmentStorageAdapter();

  await saveScreenshotAttachment(adapter, {
    actionId: "act_a",
    dataUrl: "data:image/jpeg;base64,aaaa",
    mimeType: "image/jpeg",
    width: 100,
    height: 100
  });
  await saveScreenshotAttachment(adapter, {
    actionId: "act_b",
    dataUrl: "data:image/jpeg;base64,bbbbbb",
    mimeType: "image/jpeg",
    width: 100,
    height: 100
  });

  const usage = await getAttachmentUsage(adapter);

  assert.equal(usage.count, 2);
  assert.equal(usage.totalBytes > 0, true);
  assert.equal(usage.keys.includes(getAttachmentStorageKey("act_a")), true);
});

test("chrome attachment adapter rejects when storage quota is exceeded", async () => {
  const previousChrome = globalThis.chrome;
  const storageArea = {
    set(_entries, callback) {
      globalThis.chrome = {
        runtime: {
          lastError: {
            message: "Resource::kQuotaBytes quota exceeded"
          }
        }
      };
      callback();
      globalThis.chrome = {
        runtime: {
          lastError: undefined
        }
      };
    },
    get(_keys, callback) {
      callback({});
    },
    remove(_keys, callback) {
      callback();
    }
  };
  const adapter = createChromeAttachmentStorageAdapter(storageArea);

  await assert.rejects(
    saveScreenshotAttachment(adapter, {
      actionId: "act_quota",
      dataUrl: "data:image/jpeg;base64,quota",
      mimeType: "image/jpeg",
      width: 100,
      height: 100
    }),
    /QuotaBytes quota exceeded/
  );

  globalThis.chrome = previousChrome;
});

test("indexeddb-backed attachment store saves, reads, and deletes screenshot payloads by action id", async () => {
  const adapter = createIndexedDbAttachmentStorageAdapter(createFakeIndexedDbBackend());

  await saveScreenshotAttachment(adapter, {
    actionId: "act_indexed",
    dataUrl: "data:image/jpeg;base64,indexed",
    mimeType: "image/jpeg",
    width: 1280,
    height: 720
  });

  const stored = await readScreenshotAttachment(adapter, "act_indexed");
  assert.equal(stored.dataUrl, "data:image/jpeg;base64,indexed");
  assert.equal(stored.width, 1280);

  const usage = await getAttachmentUsage(adapter);
  assert.equal(usage.count, 1);
  assert.equal(usage.keys.includes(getAttachmentStorageKey("act_indexed")), true);

  await deleteScreenshotAttachment(adapter, "act_indexed");
  assert.equal(await readScreenshotAttachment(adapter, "act_indexed"), null);
});

test("indexeddb-backed attachment store falls back to legacy storage when new storage misses", async () => {
  const legacyAdapter = createAttachmentStorageAdapter({
    [getAttachmentStorageKey("act_legacy")]: {
      actionId: "act_legacy",
      dataUrl: "data:image/jpeg;base64,legacy",
      mimeType: "image/jpeg",
      width: 800,
      height: 600,
      sizeBytes: 31,
      savedAt: 1
    }
  });
  const adapter = createIndexedDbBackedAttachmentStorageAdapter({
    indexedDbAdapter: createIndexedDbAttachmentStorageAdapter(createFakeIndexedDbBackend()),
    legacyAdapter
  });

  const stored = await readScreenshotAttachment(adapter, "act_legacy");
  assert.equal(stored.dataUrl, "data:image/jpeg;base64,legacy");

  const usage = await getAttachmentUsage(adapter);
  assert.equal(usage.count, 1);
  assert.equal(usage.keys.includes(getAttachmentStorageKey("act_legacy")), true);
});

test("clearing attachments removes both indexeddb and legacy screenshot payloads", async () => {
  const legacyAdapter = createAttachmentStorageAdapter({
    [getAttachmentStorageKey("act_legacy_clear")]: {
      actionId: "act_legacy_clear",
      dataUrl: "data:image/jpeg;base64,legacyclear",
      mimeType: "image/jpeg",
      width: 640,
      height: 360,
      sizeBytes: 36,
      savedAt: 1
    }
  });
  const adapter = createIndexedDbBackedAttachmentStorageAdapter({
    indexedDbAdapter: createIndexedDbAttachmentStorageAdapter(createFakeIndexedDbBackend()),
    legacyAdapter
  });

  await saveScreenshotAttachment(adapter, {
    actionId: "act_new_clear",
    dataUrl: "data:image/jpeg;base64,newclear",
    mimeType: "image/jpeg",
    width: 640,
    height: 360
  });

  await clearAllAttachments(adapter);

  assert.equal(await readScreenshotAttachment(adapter, "act_new_clear"), null);
  assert.equal(await readScreenshotAttachment(adapter, "act_legacy_clear"), null);

  const usage = await getAttachmentUsage(adapter);
  assert.equal(usage.count, 0);
  assert.equal(usage.totalBytes, 0);
});
