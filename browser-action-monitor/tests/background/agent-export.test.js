import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAgentExportRequest,
  downloadAgentExport,
  exportAgentSession
} from "../../src/extension/background/agent-export.js";

test("buildAgentExportRequest builds agent json request without auth header in none mode", () => {
  const request = buildAgentExportRequest({
    serverUrl: "https://collector.example.com/",
    authMode: "none",
    apiKey: ""
  }, {
    sessionId: "ses_1",
    format: "json"
  });

  assert.equal(request.url, "https://collector.example.com/api/sessions/ses_1/export?format=json&type=agent");
  assert.equal(request.headers.Accept, "application/json");
  assert.equal("X-API-Key" in request.headers, false);
});

test("buildAgentExportRequest includes api key and zip accept header in api key mode", () => {
  const request = buildAgentExportRequest({
    serverUrl: "https://collector.example.com",
    authMode: "apiKey",
    apiKey: "demo-key"
  }, {
    sessionId: "ses_2",
    format: "zip"
  });

  assert.equal(request.url, "https://collector.example.com/api/sessions/ses_2/export?format=zip&type=agent");
  assert.equal(request.headers.Accept, "application/zip");
  assert.equal(request.headers["X-API-Key"], "demo-key");
});

test("exportAgentSession rejects when server url is not configured", async () => {
  await assert.rejects(() => exportAgentSession({
    settings: {
      serverUrl: "",
      authMode: "none",
      apiKey: ""
    },
    sessionId: "ses_1",
    format: "json",
    runSyncImpl: async () => ({ skipped: true }),
    fetchImpl: async () => {
      throw new Error("should not fetch");
    }
  }), /请先在设置中配置服务端地址/);
});

test("exportAgentSession runs sync before downloading json export", async () => {
  let syncCalls = 0;
  let fetchCalls = 0;

  const result = await exportAgentSession({
    settings: {
      serverUrl: "https://collector.example.com",
      authMode: "apiKey",
      apiKey: "demo-key"
    },
    sessionId: "ses_9",
    format: "json",
    runSyncImpl: async () => {
      syncCalls += 1;
      return {
        skipped: false,
        syncedCount: 3,
        failedCount: 0
      };
    },
    fetchImpl: async (url, options) => {
      fetchCalls += 1;
      assert.equal(url, "https://collector.example.com/api/sessions/ses_9/export?format=json&type=agent");
      assert.equal(options.headers["X-API-Key"], "demo-key");

      return {
        ok: true,
        status: 200,
        headers: new Map([["content-type", "application/json"]]),
        json: async () => ({
          sessionId: "ses_9",
          rawSteps: []
        })
      };
    }
  });

  assert.equal(syncCalls, 1);
  assert.equal(fetchCalls, 1);
  assert.equal(result.filename, "ses_9-agent.json");
  assert.equal(result.mimeType, "application/json");
  assert.deepEqual(result.data, {
    sessionId: "ses_9",
    rawSteps: []
  });
});

test("exportAgentSession rejects when sync still has failed actions", async () => {
  await assert.rejects(() => exportAgentSession({
    settings: {
      serverUrl: "https://collector.example.com",
      authMode: "none",
      apiKey: ""
    },
    sessionId: "ses_4",
    format: "json",
    runSyncImpl: async () => ({
      skipped: false,
      syncedCount: 1,
      failedCount: 2,
      error: "HTTP 413"
    }),
    fetchImpl: async () => {
      throw new Error("should not fetch");
    }
  }), /同步失败，仍有 2 条记录未同步：HTTP 413/);
});

test("exportAgentSession downloads zip export and returns bytes plus filename", async () => {
  const result = await exportAgentSession({
    settings: {
      serverUrl: "https://collector.example.com",
      authMode: "none",
      apiKey: ""
    },
    sessionId: "ses_10",
    format: "zip",
    runSyncImpl: async () => ({
      skipped: false,
      syncedCount: 0,
      failedCount: 0
    }),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: new Map([
        ["content-type", "application/zip"],
        ["content-disposition", "attachment; filename=\"ses_10-agent-export.zip\""]
      ]),
      arrayBuffer: async () => Uint8Array.from([80, 75, 3, 4]).buffer
    })
  });

  assert.equal(result.filename, "ses_10-agent-export.zip");
  assert.equal(result.mimeType, "application/zip");
  assert.deepEqual(Array.from(result.data), [80, 75, 3, 4]);
});

test("downloadAgentExport triggers browser download for json export without returning the file payload", async () => {
  let downloadCall = null;

  const result = await downloadAgentExport({
    settings: {
      serverUrl: "https://collector.example.com",
      authMode: "none",
      apiKey: ""
    },
    sessionId: "ses_20",
    format: "json",
    runSyncImpl: async () => ({
      skipped: false,
      syncedCount: 0,
      failedCount: 0
    }),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: new Map([["content-type", "application/json"]]),
      json: async () => ({
        sessionId: "ses_20",
        rawSteps: [{ type: "navigate" }]
      })
    }),
    downloadImpl: async (options) => {
      downloadCall = options;
      return 7;
    }
  });

  assert.equal(result.filename, "ses_20-agent.json");
  assert.equal(result.downloadId, 7);
  assert.equal(downloadCall.filename, "ses_20-agent.json");
  assert.match(downloadCall.url, /^data:application\/json;base64,/);
  assert.equal(downloadCall.saveAs, true);
});

test("downloadAgentExport triggers browser download for zip export", async () => {
  let downloadCall = null;

  const result = await downloadAgentExport({
    settings: {
      serverUrl: "https://collector.example.com",
      authMode: "none",
      apiKey: ""
    },
    sessionId: "ses_21",
    format: "zip",
    runSyncImpl: async () => ({
      skipped: false,
      syncedCount: 0,
      failedCount: 0
    }),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: new Map([
        ["content-type", "application/zip"],
        ["content-disposition", "attachment; filename=\"ses_21-agent-export.zip\""]
      ]),
      arrayBuffer: async () => Uint8Array.from([80, 75, 3, 4]).buffer
    }),
    downloadImpl: async (options) => {
      downloadCall = options;
      return 9;
    }
  });

  assert.equal(result.filename, "ses_21-agent-export.zip");
  assert.equal(result.downloadId, 9);
  assert.equal(downloadCall.filename, "ses_21-agent-export.zip");
  assert.match(downloadCall.url, /^data:application\/zip;base64,/);
  assert.equal(downloadCall.saveAs, true);
});

test("exportAgentSession reports a clear error when server route is missing", async () => {
  await assert.rejects(() => exportAgentSession({
    settings: {
      serverUrl: "https://collector.example.com",
      authMode: "none",
      apiKey: ""
    },
    sessionId: "ses_legacy",
    format: "json",
    runSyncImpl: async () => ({
      skipped: false,
      syncedCount: 0,
      failedCount: 0
    }),
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      headers: new Map([["content-type", "text/html; charset=utf-8"]]),
      text: async () => "<!DOCTYPE html><html><body><pre>Cannot GET /api/sessions/ses_legacy/export</pre></body></html>"
    })
  }), /does not support agent export|restart the latest server/i);
});
