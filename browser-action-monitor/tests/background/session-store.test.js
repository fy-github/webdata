import test from "node:test";
import assert from "node:assert/strict";

import {
  appendAction,
  createInitialState,
  createSession,
  exportSession,
  getSessionActions,
  markSyncResult,
  updateActionAttachment,
  updateAttachmentHealth
} from "../../src/extension/background/session-store.js";

test("createSession initializes extended retry metadata", () => {
  const session = createSession({ now: 1711111111000 });

  assert.equal(session.sync.lastSuccessfulSyncAt, null);
  assert.equal(session.sync.lastFailedSyncAt, null);
  assert.equal(session.sync.consecutiveFailureCount, 0);
  assert.equal(session.sync.nextRetryAt, null);
  assert.equal(session.sync.lastTrigger, "");
  assert.equal(session.sync.lastSkippedReason, "");
});

test("appendAction updates session counts and stores actions under the active session", () => {
  const state = createInitialState();
  const session = createSession({ now: 1711111111000 });
  state.currentSessionId = session.sessionId;
  state.sessions[session.sessionId] = session;
  state.actionsBySession[session.sessionId] = [];

  appendAction(state, {
    id: "act_1",
    sessionId: session.sessionId,
    timestamp: 1711111111222,
    type: "click",
    page: { url: "https://example.com", title: "Example" },
    sync: { status: "pending", attempts: 0, lastAttemptAt: null, lastError: "" }
  });

  assert.equal(state.sessions[session.sessionId].actionCount, 1);
  assert.equal(state.sessions[session.sessionId].lastUrl, "https://example.com");
  assert.equal(getSessionActions(state, session.sessionId).length, 1);
});

test("markSyncResult marks successful and failed actions independently", () => {
  const state = createInitialState();
  const session = createSession({ now: 1711111111000 });
  state.currentSessionId = session.sessionId;
  state.sessions[session.sessionId] = session;
  state.actionsBySession[session.sessionId] = [
    {
      id: "act_ok",
      sessionId: session.sessionId,
      timestamp: 1,
      type: "click",
      page: { url: "https://example.com", title: "Example" },
      sync: { status: "pending", attempts: 0, lastAttemptAt: null, lastError: "" }
    },
    {
      id: "act_fail",
      sessionId: session.sessionId,
      timestamp: 2,
      type: "input",
      page: { url: "https://example.com", title: "Example" },
      sync: { status: "pending", attempts: 0, lastAttemptAt: null, lastError: "" }
    }
  ];

  markSyncResult(state, session.sessionId, {
    succeededIds: ["act_ok"],
    failedIds: ["act_fail"],
    errorMessage: "Server unavailable",
    attemptedAt: 1711111111333
  });

  const exported = exportSession(state, session.sessionId);

  assert.equal(exported.actions[0].sync.status, "synced");
  assert.equal(exported.actions[1].sync.status, "failed");
  assert.equal(exported.actions[1].sync.lastError, "Server unavailable");
  assert.equal(exported.sync.failedCount, 1);
});

test("markSyncResult resets retry metadata after a successful sync", () => {
  const state = createInitialState();
  const session = createSession({ now: 1711111111000 });
  session.sync.consecutiveFailureCount = 3;
  session.sync.nextRetryAt = 1711111119000;
  state.currentSessionId = session.sessionId;
  state.sessions[session.sessionId] = session;
  state.actionsBySession[session.sessionId] = [
    {
      id: "act_ok",
      sessionId: session.sessionId,
      timestamp: 1,
      type: "click",
      page: { url: "https://example.com", title: "Example" },
      sync: { status: "failed", attempts: 2, lastAttemptAt: 1, lastError: "boom" }
    }
  ];

  markSyncResult(state, session.sessionId, {
    succeededIds: ["act_ok"],
    failedIds: [],
    attemptedAt: 1711111111333,
    trigger: "manual",
    nextRetryAt: null
  });

  const exported = exportSession(state, session.sessionId);

  assert.equal(exported.sync.lastSuccessfulSyncAt, 1711111111333);
  assert.equal(exported.sync.consecutiveFailureCount, 0);
  assert.equal(exported.sync.nextRetryAt, null);
  assert.equal(exported.sync.lastTrigger, "manual");
});

test("markSyncResult increments retry metadata after a failed sync", () => {
  const state = createInitialState();
  const session = createSession({ now: 1711111111000 });
  state.currentSessionId = session.sessionId;
  state.sessions[session.sessionId] = session;
  state.actionsBySession[session.sessionId] = [
    {
      id: "act_fail",
      sessionId: session.sessionId,
      timestamp: 2,
      type: "input",
      page: { url: "https://example.com", title: "Example" },
      sync: { status: "pending", attempts: 0, lastAttemptAt: null, lastError: "" }
    }
  ];

  markSyncResult(state, session.sessionId, {
    succeededIds: [],
    failedIds: ["act_fail"],
    errorMessage: "HTTP 500",
    attemptedAt: 1711111111888,
    trigger: "alarm",
    nextRetryAt: 1711111171888,
    skippedReason: ""
  });

  const exported = exportSession(state, session.sessionId);

  assert.equal(exported.sync.lastFailedSyncAt, 1711111111888);
  assert.equal(exported.sync.consecutiveFailureCount, 1);
  assert.equal(exported.sync.nextRetryAt, 1711111171888);
  assert.equal(exported.sync.lastTrigger, "alarm");
});

test("createInitialState initializes attachment health counters", () => {
  const state = createInitialState();

  assert.deepEqual(state.attachmentHealth, {
    screenshotQueueSize: 0,
    screenshotStorageBytes: 0,
    consecutiveScreenshotFailures: 0,
    autoDisabled: {
      domSnapshots: false,
      screenshots: false,
      domReason: "",
      screenshotReason: ""
    }
  });
});

test("updateActionAttachment merges attachment metadata into an existing action", () => {
  const state = createInitialState();
  const session = createSession({ now: 1711111111000 });
  state.currentSessionId = session.sessionId;
  state.sessions[session.sessionId] = session;
  state.actionsBySession[session.sessionId] = [
    {
      id: "act_attach",
      sessionId: session.sessionId,
      timestamp: 1,
      type: "click",
      page: { url: "https://example.com", title: "Example" },
      attachment: {
        domSnapshot: { status: "ready", preview: "button" },
        screenshot: { status: "pending", storageKey: "", error: "" }
      },
      sync: { status: "pending", attempts: 0, lastAttemptAt: null, lastError: "" }
    }
  ];

  updateActionAttachment(state, session.sessionId, "act_attach", {
    screenshot: {
      status: "ready",
      storageKey: "monitorAttachment:act_attach",
      width: 800,
      height: 600
    }
  });

  const exported = exportSession(state, session.sessionId);

  assert.equal(exported.actions[0].attachment.screenshot.status, "ready");
  assert.equal(exported.actions[0].attachment.screenshot.storageKey, "monitorAttachment:act_attach");
  assert.equal(exported.actions[0].attachment.screenshot.width, 800);
});

test("updateAttachmentHealth tracks queue size, storage bytes, and auto-disable reasons", () => {
  const state = createInitialState();

  updateAttachmentHealth(state, {
    screenshotQueueSize: 3,
    screenshotStorageBytes: 2048,
    consecutiveScreenshotFailures: 2,
    autoDisabled: {
      screenshots: true,
      screenshotReason: "storage-pressure"
    }
  });

  assert.equal(state.attachmentHealth.screenshotQueueSize, 3);
  assert.equal(state.attachmentHealth.screenshotStorageBytes, 2048);
  assert.equal(state.attachmentHealth.consecutiveScreenshotFailures, 2);
  assert.equal(state.attachmentHealth.autoDisabled.screenshots, true);
  assert.equal(state.attachmentHealth.autoDisabled.screenshotReason, "storage-pressure");
});
