import test from "node:test";
import assert from "node:assert/strict";

import { createInitialState, createSession } from "../../src/extension/background/session-store.js";
import { buildSyncRequest, syncPendingActions } from "../../src/extension/background/sync.js";
import { DEFAULT_SETTINGS } from "../../src/extension/shared/constants.js";
import { createAttachmentStorageAdapter, saveScreenshotAttachment } from "../../src/extension/background/attachment-store.js";

test("buildSyncRequest omits auth headers in none mode", () => {
  const request = buildSyncRequest({
    serverUrl: "https://collector.example.com",
    authMode: "none",
    apiKey: ""
  }, {
    session: { sessionId: "ses_1" },
    actions: []
  });

  assert.equal(request.url, "https://collector.example.com/api/actions/batch");
  assert.equal(request.headers["Content-Type"], "application/json");
  assert.equal("X-API-Key" in request.headers, false);
});

test("syncPendingActions uploads pending actions and marks them synced", async () => {
  const state = createInitialState();
  const session = createSession({ now: 1711111111000 });
  state.currentSessionId = session.sessionId;
  state.sessions[session.sessionId] = session;
  state.actionsBySession[session.sessionId] = [
    {
      id: "act_1",
      sessionId: session.sessionId,
      timestamp: 1,
      type: "click",
      page: { url: "https://example.com", title: "Example" },
      sync: { status: "pending", attempts: 0, lastAttemptAt: null, lastError: "" }
    }
  ];

  const result = await syncPendingActions({
    state,
    settings: {
      serverUrl: "https://collector.example.com",
      authMode: "apiKey",
      apiKey: "abc123"
    },
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://collector.example.com/api/actions/batch");
      assert.equal(options.headers["X-API-Key"], "abc123");
      return {
        ok: true,
        status: 200,
        json: async () => ({ acceptedActionIds: ["act_1"] })
      };
    }
  });

  assert.equal(result.syncedCount, 1);
  assert.equal(state.actionsBySession[session.sessionId][0].sync.status, "synced");
});

test("syncPendingActions splits large uploads into multiple batches", async () => {
  const state = createInitialState();
  const session = createSession({ now: 1711111111000 });
  state.currentSessionId = session.sessionId;
  state.sessions[session.sessionId] = session;
  state.actionsBySession[session.sessionId] = Array.from({ length: 205 }, (_, index) => ({
    id: `act_${index + 1}`,
    sessionId: session.sessionId,
    timestamp: index + 1,
    type: "click",
    page: { url: "https://example.com", title: "Example" },
    sync: { status: "failed", attempts: 0, lastAttemptAt: null, lastError: "" }
  }));

  const batchSizes = [];
  const result = await syncPendingActions({
    state,
    settings: {
      serverUrl: "https://collector.example.com",
      authMode: "none",
      apiKey: "",
      syncBatchSize: 100
    },
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      batchSizes.push(body.actions.length);
      return {
        ok: true,
        status: 200,
        json: async () => ({ acceptedActionIds: body.actions.map((action) => action.id) })
      };
    }
  });

  assert.deepEqual(batchSizes, [100, 100, 5]);
  assert.equal(result.syncedCount, 205);
  assert.equal(result.failedCount, 0);
  assert.equal(state.actionsBySession[session.sessionId].every((action) => action.sync.status === "synced"), true);
});

test("syncPendingActions retries a 413 batch by splitting it into smaller batches", async () => {
  const state = createInitialState();
  const session = createSession({ now: 1711111111000 });
  state.currentSessionId = session.sessionId;
  state.sessions[session.sessionId] = session;
  state.actionsBySession[session.sessionId] = Array.from({ length: 4 }, (_, index) => ({
    id: `act_${index + 1}`,
    sessionId: session.sessionId,
    timestamp: index + 1,
    type: "click",
    page: { url: "https://example.com", title: "Example" },
    sync: { status: "failed", attempts: 0, lastAttemptAt: null, lastError: "" }
  }));

  const batchSizes = [];
  const result = await syncPendingActions({
    state,
    settings: {
      serverUrl: "https://collector.example.com",
      authMode: "none",
      apiKey: "",
      syncBatchSize: 4
    },
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      batchSizes.push(body.actions.length);

      if (body.actions.length > 2) {
        return {
          ok: false,
          status: 413,
          json: async () => ({})
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ acceptedActionIds: body.actions.map((action) => action.id) })
      };
    }
  });

  assert.deepEqual(batchSizes, [4, 2, 2]);
  assert.equal(result.syncedCount, 4);
  assert.equal(result.failedCount, 0);
  assert.equal(state.actionsBySession[session.sessionId].every((action) => action.sync.status === "synced"), true);
});

test("syncPendingActions omits full session action history from batch payload", async () => {
  const state = createInitialState();
  const session = createSession({ now: 1711111111000 });
  state.currentSessionId = session.sessionId;
  state.sessions[session.sessionId] = session;
  state.actionsBySession[session.sessionId] = Array.from({ length: 3 }, (_, index) => ({
    id: `act_${index + 1}`,
    sessionId: session.sessionId,
    timestamp: index + 1,
    type: "click",
    page: { url: `https://example.com/${index + 1}`, title: "Example" },
    payload: {
      note: "x".repeat(4096)
    },
    sync: {
      status: index === 2 ? "pending" : "synced",
      attempts: 0,
      lastAttemptAt: null,
      lastError: ""
    }
  }));

  const result = await syncPendingActions({
    state,
    settings: {
      serverUrl: "https://collector.example.com",
      authMode: "none",
      apiKey: "",
      syncBatchSize: 1
    },
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(Array.isArray(body.session.actions), false);
      assert.equal(body.actions.length, 1);
      assert.equal(body.actions[0].id, "act_3");
      return {
        ok: true,
        status: 200,
        json: async () => ({ acceptedActionIds: ["act_3"] })
      };
    }
  });

  assert.equal(result.syncedCount, 1);
  assert.equal(result.failedCount, 0);
});

test("syncPendingActions returns skipped when the current session has no pending work", async () => {
  const state = createInitialState();
  const session = createSession({ now: 1711111111000 });
  state.currentSessionId = session.sessionId;
  state.sessions[session.sessionId] = session;
  state.actionsBySession[session.sessionId] = [
    {
      id: "act_synced",
      sessionId: session.sessionId,
      timestamp: 1,
      type: "click",
      page: { url: "https://example.com", title: "Example" },
      sync: { status: "synced", attempts: 1, lastAttemptAt: 1, lastError: "" }
    }
  ];

  const result = await syncPendingActions({
    state,
    settings: {
      serverUrl: "https://collector.example.com",
      authMode: "none",
      apiKey: ""
    },
    fetchImpl: async () => {
      throw new Error("should not fetch");
    }
  });

  assert.equal(result.skipped, true);
  assert.equal(result.syncedCount, 0);
  assert.equal(result.failedCount, 0);
});

test("DEFAULT_SETTINGS includes balanced background sync defaults", () => {
  assert.equal(DEFAULT_SETTINGS.syncBatchSize, 100);
  assert.equal(DEFAULT_SETTINGS.backgroundSyncEnabled, true);
  assert.equal(DEFAULT_SETTINGS.backgroundSyncIntervalMinutes, 5);
  assert.equal(DEFAULT_SETTINGS.syncOnStartup, true);
});

test("syncPendingActions can target a specified non-current session", async () => {
  const state = createInitialState();
  const currentSession = createSession({ now: 1711111111000 });
  const targetSession = createSession({ now: 1711111112000 });
  state.currentSessionId = currentSession.sessionId;
  state.sessions[currentSession.sessionId] = currentSession;
  state.sessions[targetSession.sessionId] = targetSession;
  state.actionsBySession[currentSession.sessionId] = [];
  state.actionsBySession[targetSession.sessionId] = [
    {
      id: "act_target",
      sessionId: targetSession.sessionId,
      timestamp: 1,
      type: "click",
      page: { url: "https://example.com/target", title: "Target" },
      sync: { status: "pending", attempts: 0, lastAttemptAt: null, lastError: "" }
    }
  ];

  const result = await syncPendingActions({
    state,
    sessionId: targetSession.sessionId,
    settings: {
      serverUrl: "https://collector.example.com",
      authMode: "none",
      apiKey: ""
    },
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.session.sessionId, targetSession.sessionId);
      assert.equal(body.actions.length, 1);
      assert.equal(body.actions[0].id, "act_target");
      return {
        ok: true,
        status: 200,
        json: async () => ({ acceptedActionIds: ["act_target"] })
      };
    }
  });

  assert.equal(result.syncedCount, 1);
  assert.equal(state.actionsBySession[targetSession.sessionId][0].sync.status, "synced");
});

test("syncPendingActions resets session backoff metadata after success", async () => {
  const state = createInitialState();
  const session = createSession({ now: 1711111111000 });
  session.sync.consecutiveFailureCount = 3;
  session.sync.nextRetryAt = 1711111171000;
  state.currentSessionId = session.sessionId;
  state.sessions[session.sessionId] = session;
  state.actionsBySession[session.sessionId] = [
    {
      id: "act_1",
      sessionId: session.sessionId,
      timestamp: 1,
      type: "click",
      page: { url: "https://example.com", title: "Example" },
      sync: { status: "failed", attempts: 3, lastAttemptAt: 1, lastError: "HTTP 500" }
    }
  ];

  await syncPendingActions({
    state,
    settings: {
      serverUrl: "https://collector.example.com",
      authMode: "none",
      apiKey: "",
      maxSyncBackoffMinutes: 60
    },
    trigger: "manual",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ acceptedActionIds: ["act_1"] })
    })
  });

  assert.equal(state.sessions[session.sessionId].sync.consecutiveFailureCount, 0);
  assert.equal(state.sessions[session.sessionId].sync.nextRetryAt, null);
  assert.equal(state.sessions[session.sessionId].sync.lastTrigger, "manual");
});

test("syncPendingActions sets next retry metadata after failure", async () => {
  const state = createInitialState();
  const session = createSession({ now: 1711111111000 });
  state.currentSessionId = session.sessionId;
  state.sessions[session.sessionId] = session;
  state.actionsBySession[session.sessionId] = [
    {
      id: "act_1",
      sessionId: session.sessionId,
      timestamp: 1,
      type: "click",
      page: { url: "https://example.com", title: "Example" },
      sync: { status: "pending", attempts: 0, lastAttemptAt: null, lastError: "" }
    }
  ];

  const now = 1711111111000;
  const originalNow = Date.now;
  Date.now = () => now;

  try {
    const result = await syncPendingActions({
      state,
      settings: {
        serverUrl: "https://collector.example.com",
        authMode: "none",
        apiKey: "",
        maxSyncBackoffMinutes: 60
      },
      trigger: "alarm",
      fetchImpl: async () => ({
        ok: false,
        status: 500,
        json: async () => ({})
      })
    });

    assert.equal(result.failedCount, 1);
    assert.equal(state.sessions[session.sessionId].sync.consecutiveFailureCount, 1);
    assert.equal(state.sessions[session.sessionId].sync.lastFailedSyncAt, now);
    assert.equal(state.sessions[session.sessionId].sync.nextRetryAt, now + 60 * 1000);
    assert.equal(state.sessions[session.sessionId].sync.lastTrigger, "alarm");
  } finally {
    Date.now = originalNow;
  }
});

test("syncPendingActions uploads screenshot attachments separately after action metadata sync", async () => {
  const state = createInitialState();
  const session = createSession({ now: 1711111111000 });
  state.currentSessionId = session.sessionId;
  state.sessions[session.sessionId] = session;
  state.actionsBySession[session.sessionId] = [
    {
      id: "act_attachment",
      sessionId: session.sessionId,
      timestamp: 1,
      type: "click",
      page: { url: "https://example.com", title: "Example" },
      attachment: {
        domSnapshot: { status: "ready", preview: "button" },
        screenshot: { status: "ready", storageKey: "monitorAttachment:act_attachment", mimeType: "image/jpeg" }
      },
      sync: { status: "pending", attempts: 0, lastAttemptAt: null, lastError: "" }
    }
  ];

  const attachmentStore = createAttachmentStorageAdapter();
  await saveScreenshotAttachment(attachmentStore, {
    actionId: "act_attachment",
    dataUrl: "data:image/jpeg;base64,abcd",
    mimeType: "image/jpeg",
    width: 800,
    height: 600
  });

  const calls = [];
  const result = await syncPendingActions({
    state,
    settings: {
      serverUrl: "https://collector.example.com",
      authMode: "none",
      apiKey: ""
    },
    attachmentStore,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/api/actions/batch")) {
        const body = JSON.parse(options.body);
        assert.equal(body.actions[0].attachment.screenshot.storageKey, "monitorAttachment:act_attachment");
        assert.equal("dataUrl" in body.actions[0].attachment.screenshot, false);
        return {
          ok: true,
          status: 200,
          json: async () => ({ acceptedActionIds: ["act_attachment"] })
        };
      }

      assert.match(url, /\/api\/sessions\/.+\/actions\/act_attachment\/attachments\/screenshot$/);
      const body = JSON.parse(options.body);
      assert.equal(body.attachment.dataUrl, "data:image/jpeg;base64,abcd");
      return {
        ok: true,
        status: 200,
        json: async () => ({ uploaded: true, remoteUrl: "/api/attachments/test" })
      };
    }
  });

  assert.equal(result.syncedCount, 1);
  assert.equal(calls.length, 2);
  assert.equal(state.actionsBySession[session.sessionId][0].attachment.screenshot.remoteStatus, "uploaded");
});

test("syncPendingActions marks screenshot upload as failed when local attachment bytes are missing", async () => {
  const state = createInitialState();
  const session = createSession({ now: 1711111111000 });
  state.currentSessionId = session.sessionId;
  state.sessions[session.sessionId] = session;
  state.actionsBySession[session.sessionId] = [
    {
      id: "act_missing_attachment",
      sessionId: session.sessionId,
      timestamp: 1,
      type: "click",
      page: { url: "https://example.com", title: "Example" },
      attachment: {
        domSnapshot: { status: "ready", preview: "button" },
        screenshot: {
          status: "ready",
          storageKey: "monitorAttachment:act_missing_attachment",
          mimeType: "image/jpeg"
        }
      },
      sync: { status: "pending", attempts: 0, lastAttemptAt: null, lastError: "" }
    }
  ];

  const attachmentStore = createAttachmentStorageAdapter();
  let batchCalls = 0;

  const result = await syncPendingActions({
    state,
    settings: {
      serverUrl: "https://collector.example.com",
      authMode: "none",
      apiKey: ""
    },
    attachmentStore,
    fetchImpl: async (url) => {
      if (url.endsWith("/api/actions/batch")) {
        batchCalls += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({ acceptedActionIds: ["act_missing_attachment"] })
        };
      }

      throw new Error("should not upload screenshot bytes");
    }
  });

  assert.equal(result.syncedCount, 1);
  assert.equal(batchCalls, 1);
  assert.equal(state.actionsBySession[session.sessionId][0].attachment.screenshot.remoteStatus, "failed");
  assert.equal(state.actionsBySession[session.sessionId][0].attachment.screenshot.remoteError, "missing_local_attachment");
});
