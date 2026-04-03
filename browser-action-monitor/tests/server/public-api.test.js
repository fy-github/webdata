import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createApp } from "../../server/app.js";

async function startServer(configOverrides = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), "browser-action-monitor-public-api-"));
  const app = createApp({
    dataDir,
    authMode: "none",
    apiKey: "",
    ...configOverrides
  });

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    close: async () => {
      await new Promise((resolve, reject) => server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      }));
      await rm(dataDir, { recursive: true, force: true });
    }
  };
}

async function seedSession(baseUrl, sessionId, headers = {}) {
  const response = await fetch(`${baseUrl}/api/actions/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify({
      session: {
        sessionId,
        startedAt: 100,
        endedAt: 100,
        actionCount: 1,
        lastUrl: "https://example.com",
        sync: { pendingCount: 0, failedCount: 0, lastSyncedAt: null, lastError: "" }
      },
      actions: [
        {
          id: `act_${sessionId}`,
          sessionId,
          type: "click",
          timestamp: 100,
          page: { url: "https://example.com", title: "Example" },
          target: { selector: "button#demo" },
          payload: { clientX: 10, clientY: 20 },
          privacy: { enabled: true, masked: false, reason: "" },
          sync: { status: "pending", attempts: 0, lastAttemptAt: null, lastError: "" }
        }
      ]
    })
  });

  assert.equal(response.status, 200);
}

test("health remains readable without auth in apiKey mode", async () => {
  const server = await startServer({
    authMode: "apiKey",
    apiKey: "demo-key"
  });

  try {
    const response = await fetch(`${server.baseUrl}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.authMode, "apiKey");
  } finally {
    await server.close();
  }
});

test("API routes reject unauthenticated reads in apiKey mode", async () => {
  const server = await startServer({
    authMode: "apiKey",
    apiKey: "demo-key"
  });

  try {
    const response = await fetch(`${server.baseUrl}/api/sessions`);
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.code, "unauthorized");
    assert.equal(payload.error, "Unauthorized");
  } finally {
    await server.close();
  }
});

test("API routes accept X-API-Key for read requests in apiKey mode", async () => {
  const server = await startServer({
    authMode: "apiKey",
    apiKey: "demo-key"
  });

  try {
    await seedSession(server.baseUrl, "ses_public_api", {
      "X-API-Key": "demo-key"
    });

    const response = await fetch(`${server.baseUrl}/api/sessions`, {
      headers: {
        "X-API-Key": "demo-key"
      }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.total, 1);
    assert.equal(payload.sessions[0].sessionId, "ses_public_api");
  } finally {
    await server.close();
  }
});

test("missing session returns normalized not_found error", async () => {
  const server = await startServer({
    authMode: "apiKey",
    apiKey: "demo-key"
  });

  try {
    const response = await fetch(`${server.baseUrl}/api/sessions/ses_missing`, {
      headers: {
        "X-API-Key": "demo-key"
      }
    });
    const payload = await response.json();

    assert.equal(response.status, 404);
    assert.equal(payload.code, "not_found");
    assert.equal(payload.error, "Session not found");
  } finally {
    await server.close();
  }
});

test("attachment route rejects unauthenticated access in apiKey mode", async () => {
  const server = await startServer({
    authMode: "apiKey",
    apiKey: "demo-key"
  });

  try {
    const response = await fetch(`${server.baseUrl}/api/attachments/ses_missing/act_missing`);
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.code, "unauthorized");
  } finally {
    await server.close();
  }
});
