import test from "node:test";
import assert from "node:assert/strict";

import {
  createAttachmentStorageAdapter,
  createChromeAttachmentStorageAdapter,
  getAttachmentStorageKey,
  saveScreenshotAttachment,
  readScreenshotAttachment,
  deleteScreenshotAttachment,
  getAttachmentUsage
} from "../../src/extension/background/attachment-store.js";

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
