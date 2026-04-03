import test from "node:test";
import assert from "node:assert/strict";

import { createAttachmentQueue } from "../../src/extension/background/attachment-queue.js";

test("attachment queue processes screenshot jobs and updates action metadata", async () => {
  const updates = [];
  const queue = createAttachmentQueue({
    captureScreenshot: async ({ actionId }) => ({
      dataUrl: `data:image/jpeg;base64,${actionId}`,
      mimeType: "image/jpeg",
      width: 800,
      height: 600
    }),
    saveScreenshot: async ({ actionId, payload }) => ({
      storageKey: `monitorAttachment:${actionId}`,
      sizeBytes: payload.dataUrl.length
    }),
    updateActionAttachment: async (job, patch) => {
      updates.push({ actionId: job.actionId, patch });
    },
    onHealthChange: async () => {}
  });

  await queue.enqueue({
    actionId: "act_queue_1",
    sessionId: "ses_1",
    tabId: 1,
    windowId: 1
  });

  assert.equal(updates[0].patch.status, "pending");
  assert.equal(updates.at(-1).patch.status, "ready");
  assert.equal(updates.at(-1).patch.storageKey, "monitorAttachment:act_queue_1");
});

test("attachment queue skips screenshots when quota policy says capture is disabled", async () => {
  const updates = [];
  const queue = createAttachmentQueue({
    captureScreenshot: async () => {
      throw new Error("should not capture");
    },
    saveScreenshot: async () => {
      throw new Error("should not save");
    },
    updateActionAttachment: async (job, patch) => {
      updates.push({ actionId: job.actionId, patch });
    },
    evaluatePolicy: () => ({
      allowScreenshot: false,
      reason: "disabled_auto_quota"
    }),
    onHealthChange: async () => {}
  });

  await queue.enqueue({
    actionId: "act_skip_1",
    sessionId: "ses_1",
    tabId: 1,
    windowId: 1
  });

  assert.equal(updates.length, 1);
  assert.equal(updates[0].patch.status, "disabled_auto_quota");
  assert.equal(updates[0].patch.error, "disabled_auto_quota");
});

test("attachment queue auto-disables screenshots after repeated failures", async () => {
  const healthChanges = [];
  const queue = createAttachmentQueue({
    captureScreenshot: async () => {
      throw new Error("capture-failed");
    },
    saveScreenshot: async () => {
      throw new Error("should not save");
    },
    updateActionAttachment: async () => {},
    onHealthChange: async (health) => {
      healthChanges.push(health);
    },
    failureThreshold: 2
  });

  await queue.enqueue({ actionId: "act_fail_1", sessionId: "ses_1", tabId: 1, windowId: 1 });
  await queue.enqueue({ actionId: "act_fail_2", sessionId: "ses_1", tabId: 1, windowId: 1 });

  assert.equal(healthChanges.at(-1).autoDisabled.screenshots, true);
  assert.equal(healthChanges.at(-1).autoDisabled.screenshotReason, "capture-failures");
});

test("attachment queue immediately auto-disables screenshots on storage quota failure", async () => {
  const updates = [];
  const healthChanges = [];
  const queue = createAttachmentQueue({
    captureScreenshot: async () => ({
      dataUrl: "data:image/jpeg;base64,quota",
      mimeType: "image/jpeg",
      width: 320,
      height: 240
    }),
    saveScreenshot: async () => {
      throw new Error("Resource::kQuotaBytes quota exceeded");
    },
    updateActionAttachment: async (job, patch) => {
      updates.push({ actionId: job.actionId, patch });
    },
    onHealthChange: async (health) => {
      healthChanges.push(health);
    }
  });

  await queue.enqueue({
    actionId: "act_quota_1",
    sessionId: "ses_1",
    tabId: 1,
    windowId: 1
  });

  assert.equal(updates[0].patch.status, "pending");
  assert.equal(updates.at(-1).patch.status, "failed");
  assert.equal(updates.at(-1).patch.error, "Resource::kQuotaBytes quota exceeded");
  assert.equal(healthChanges.at(-1).autoDisabled.screenshots, true);
  assert.equal(healthChanges.at(-1).autoDisabled.screenshotReason, "storage-pressure");
});
