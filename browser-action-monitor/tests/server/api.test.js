import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createApp } from "../../server/app.js";

async function startServer(configOverrides = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), "browser-action-monitor-"));
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

async function seedSession(baseUrl, sessionId, timestamp, url = "https://example.com", actionId = `act_${sessionId}`) {
  const response = await fetch(`${baseUrl}/api/actions/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session: {
        sessionId,
        startedAt: timestamp,
        endedAt: timestamp,
        actionCount: 1,
        lastUrl: url,
        sync: { pendingCount: 0, failedCount: 0, lastSyncedAt: null, lastError: "" }
      },
      actions: [
        {
          id: actionId,
          sessionId,
          type: "click",
          timestamp,
          page: { url, title: "Example" },
          target: { selector: `button#${actionId}` },
          payload: { clientX: 10, clientY: 20 },
          privacy: { enabled: true, masked: false, reason: "" },
          sync: { status: "pending", attempts: 0, lastAttemptAt: null, lastError: "" }
        }
      ]
    })
  });

  assert.equal(response.status, 200);
}

async function seedAgentSession(baseUrl, sessionId) {
  const response = await fetch(`${baseUrl}/api/actions/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session: {
        sessionId,
        startedAt: 100,
        endedAt: 140,
        actionCount: 4,
        lastUrl: "https://example.com/dashboard",
        sync: { pendingCount: 0, failedCount: 0, lastSyncedAt: 140, lastError: "" }
      },
      actions: [
        {
          id: `${sessionId}_nav`,
          sessionId,
          type: "navigation",
          timestamp: 100,
          page: { url: "https://example.com/login", title: "Login" },
          target: { selector: "" },
          payload: {},
          privacy: { enabled: true, masked: false, reason: "" },
          sync: { status: "synced", attempts: 1, lastAttemptAt: 100, lastError: "" }
        },
        {
          id: `${sessionId}_input`,
          sessionId,
          type: "input",
          timestamp: 110,
          page: { url: "https://example.com/login", title: "Login" },
          target: { selector: "input[name=email]", name: "email", type: "email" },
          payload: { value: "agent@example.com", valueLength: 17 },
          privacy: { enabled: false, masked: false, reason: "" },
          sync: { status: "synced", attempts: 1, lastAttemptAt: 110, lastError: "" }
        },
        {
          id: `${sessionId}_click`,
          sessionId,
          type: "click",
          timestamp: 120,
          page: { url: "https://example.com/login", title: "Login" },
          target: { selector: "button[type=submit]", text: "Sign in" },
          payload: { clientX: 10, clientY: 20 },
          privacy: { enabled: true, masked: false, reason: "" },
          sync: { status: "synced", attempts: 1, lastAttemptAt: 120, lastError: "" }
        },
        {
          id: `${sessionId}_nav_done`,
          sessionId,
          type: "navigation",
          timestamp: 140,
          page: { url: "https://example.com/dashboard", title: "Dashboard" },
          target: { selector: "" },
          payload: {},
          privacy: { enabled: true, masked: false, reason: "" },
          sync: { status: "synced", attempts: 1, lastAttemptAt: 140, lastError: "" }
        }
      ]
    })
  });

  assert.equal(response.status, 200);
}

test("GET /health returns auth mode, version, and feature flags", async () => {
  const server = await startServer();

  try {
    const response = await fetch(`${server.baseUrl}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.authMode, "none");
    assert.equal(typeof body.version, "string");
    assert.equal(body.features.agentExport, true);
  } finally {
    await server.close();
  }
});

test("POST /api/actions/batch stores a session and its actions", async () => {
  const server = await startServer();

  try {
    const batchResponse = await fetch(`${server.baseUrl}/api/actions/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session: {
          sessionId: "ses_1",
          startedAt: 1,
          endedAt: 2,
          actionCount: 1,
          sync: { pendingCount: 0, failedCount: 0, lastSyncedAt: null, lastError: "" }
        },
        actions: [
          {
            id: "act_1",
            sessionId: "ses_1",
            type: "click",
            timestamp: 1,
            page: { url: "https://example.com", title: "Example" },
            target: { selector: "button#go" },
            payload: { clientX: 10, clientY: 20 },
            privacy: { enabled: true, masked: false, reason: "" },
            sync: { status: "pending", attempts: 0, lastAttemptAt: null, lastError: "" }
          }
        ]
      })
    });

    assert.equal(batchResponse.status, 200);

    const sessionResponse = await fetch(`${server.baseUrl}/api/sessions/ses_1`);
    const sessionBody = await sessionResponse.json();

    assert.equal(sessionResponse.status, 200);
    assert.equal(sessionBody.session.sessionId, "ses_1");
    assert.equal(sessionBody.actions.length, 1);
  } finally {
    await server.close();
  }
});

test("POST /api/actions/batch merges multiple batches for the same session", async () => {
  const server = await startServer();

  try {
    const createBatch = (actionId, timestamp) => ({
      session: {
        sessionId: "ses_merge",
        startedAt: 1,
        endedAt: timestamp,
        actionCount: timestamp,
        sync: { pendingCount: 0, failedCount: 0, lastSyncedAt: null, lastError: "" }
      },
      actions: [
        {
          id: actionId,
          sessionId: "ses_merge",
          type: "click",
          timestamp,
          page: { url: "https://example.com", title: "Example" },
          target: { selector: `button#${actionId}` },
          payload: { clientX: 10, clientY: 20 },
          privacy: { enabled: true, masked: false, reason: "" },
          sync: { status: "pending", attempts: 0, lastAttemptAt: null, lastError: "" }
        }
      ]
    });

    await fetch(`${server.baseUrl}/api/actions/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createBatch("act_1", 1))
    });

    await fetch(`${server.baseUrl}/api/actions/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createBatch("act_2", 2))
    });

    const sessionResponse = await fetch(`${server.baseUrl}/api/sessions/ses_merge`);
    const sessionBody = await sessionResponse.json();

    assert.equal(sessionBody.actions.length, 2);
    assert.deepEqual(sessionBody.actions.map((action) => action.id), ["act_1", "act_2"]);
  } finally {
    await server.close();
  }
});

test("API key mode rejects unauthorized uploads", async () => {
  const server = await startServer({
    authMode: "apiKey",
    apiKey: "secret-key"
  });

  try {
    const response = await fetch(`${server.baseUrl}/api/actions/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: {}, actions: [] })
    });

    assert.equal(response.status, 401);
  } finally {
    await server.close();
  }
});

test("GET /dashboard returns the dashboard shell", async () => {
  const server = await startServer();

  try {
    const response = await fetch(`${server.baseUrl}/dashboard`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /Browser Action Monitor Dashboard/);
  } finally {
    await server.close();
  }
});

test("GET /dashboard reloads the template file for later requests", async () => {
  const templateDir = await mkdtemp(join(tmpdir(), "browser-action-monitor-template-"));
  const templatePath = join(templateDir, "dashboard.html");
  const initialTemplate = `<!DOCTYPE html>
<html lang="zh-CN">
<body>
  <main>template-v1</main>
</body>
</html>`;
  const updatedTemplate = `<!DOCTYPE html>
<html lang="zh-CN">
<body>
  <section id="feedbackBar"></section>
  <main>template-v2</main>
</body>
</html>`;
  const server = await startServer({
    dashboardTemplatePath: templatePath
  });

  try {
    await writeFile(templatePath, initialTemplate, "utf8");

    const firstResponse = await fetch(`${server.baseUrl}/dashboard`);
    const firstHtml = await firstResponse.text();

    await writeFile(templatePath, updatedTemplate, "utf8");

    const secondResponse = await fetch(`${server.baseUrl}/dashboard`);
    const secondHtml = await secondResponse.text();

    assert.match(firstHtml, /template-v1/);
    assert.doesNotMatch(firstHtml, /feedbackBar/);
    assert.match(secondHtml, /template-v2/);
    assert.match(secondHtml, /feedbackBar/);
  } finally {
    await server.close();
    await rm(templateDir, { recursive: true, force: true });
  }
});

test("PATCH /api/sessions/:sessionId/tags updates tags and GET /api/tags lists them", async () => {
  const server = await startServer();

  try {
    await seedSession(server.baseUrl, "ses_tags", 100, "https://example.com/checkout");

    const patchResponse = await fetch(`${server.baseUrl}/api/sessions/ses_tags/tags`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: ["checkout", "training"] })
    });

    assert.equal(patchResponse.status, 200);

    const tagsResponse = await fetch(`${server.baseUrl}/api/tags`);
    const tagsBody = await tagsResponse.json();
    assert.deepEqual(tagsBody.tags, ["checkout", "training"]);
  } finally {
    await server.close();
  }
});

test("GET /api/sessions returns paginated filtered sessions", async () => {
  const server = await startServer();

  try {
    await seedSession(server.baseUrl, "ses_checkout", 100, "https://example.com/checkout");
    await seedSession(server.baseUrl, "ses_login", 200, "https://example.com/login");

    await fetch(`${server.baseUrl}/api/sessions/ses_checkout/tags`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: ["checkout"] })
    });

    const response = await fetch(`${server.baseUrl}/api/sessions?q=checkout&tag=checkout&page=1&pageSize=10`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.total, 1);
    assert.equal(body.sessions.length, 1);
    assert.equal(body.sessions[0].sessionId, "ses_checkout");
  } finally {
    await server.close();
  }
});

test("DELETE /api/actions/:actionId removes one action from the session", async () => {
  const server = await startServer();

  try {
    await seedSession(server.baseUrl, "ses_delete_action", 100, "https://example.com/one", "act_delete_me");
    await fetch(`${server.baseUrl}/api/actions/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session: {
          sessionId: "ses_delete_action",
          startedAt: 100,
          endedAt: 101,
          actionCount: 2,
          lastUrl: "https://example.com/one",
          sync: { pendingCount: 0, failedCount: 0, lastSyncedAt: null, lastError: "" }
        },
        actions: [
          {
            id: "act_keep_me",
            sessionId: "ses_delete_action",
            type: "click",
            timestamp: 101,
            page: { url: "https://example.com/one", title: "Example" },
            target: { selector: "button#keep" },
            payload: { clientX: 10, clientY: 20 },
            privacy: { enabled: true, masked: false, reason: "" },
            sync: { status: "pending", attempts: 0, lastAttemptAt: null, lastError: "" }
          }
        ]
      })
    });

    const deleteResponse = await fetch(`${server.baseUrl}/api/actions/act_delete_me`, {
      method: "DELETE"
    });
    const detailResponse = await fetch(`${server.baseUrl}/api/sessions/ses_delete_action`);
    const detailBody = await detailResponse.json();

    assert.equal(deleteResponse.status, 200);
    assert.equal(detailBody.actions.length, 1);
    assert.equal(detailBody.actions[0].id, "act_keep_me");
  } finally {
    await server.close();
  }
});

test("bulk export and bulk delete endpoints operate on selected sessions", async () => {
  const server = await startServer();

  try {
    await seedSession(server.baseUrl, "ses_bulk_1", 100, "https://example.com/a");
    await seedSession(server.baseUrl, "ses_bulk_2", 200, "https://example.com/b");

    const exportResponse = await fetch(`${server.baseUrl}/api/sessions/bulk/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionIds: ["ses_bulk_1", "ses_bulk_2"] })
    });
    const exportBody = await exportResponse.json();

    assert.equal(exportResponse.status, 200);
    assert.equal(exportBody.sessionCount, 2);

    const deleteResponse = await fetch(`${server.baseUrl}/api/sessions/bulk/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionIds: ["ses_bulk_1", "ses_bulk_2"] })
    });
    const deleteBody = await deleteResponse.json();

    assert.equal(deleteResponse.status, 200);
    assert.equal(deleteBody.deletedCount, 2);

    const listResponse = await fetch(`${server.baseUrl}/api/sessions`);
    const listBody = await listResponse.json();

    assert.equal(listBody.total, 0);
  } finally {
    await server.close();
  }
});

test("GET /api/sessions/:sessionId/export returns agent JSON bundle", async () => {
  const server = await startServer();

  try {
    await seedAgentSession(server.baseUrl, "ses_agent_json");

    const response = await fetch(`${server.baseUrl}/api/sessions/ses_agent_json/export?format=json&type=agent`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.session.sessionId, "ses_agent_json");
    assert.ok(Array.isArray(body.rawSteps));
    assert.ok(Array.isArray(body.playwright.rawLikeSteps));
    assert.ok(Array.isArray(body.playwright.executableSteps));
    assert.ok(Array.isArray(body.summary.tasks));
  } finally {
    await server.close();
  }
});

test("GET /api/sessions/:sessionId/export returns agent ZIP archive", async () => {
  const server = await startServer();

  try {
    await seedAgentSession(server.baseUrl, "ses_agent_zip");

    const response = await fetch(`${server.baseUrl}/api/sessions/ses_agent_zip/export?format=zip&type=agent`);
    const buffer = Buffer.from(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/zip");
    assert.equal(buffer.subarray(0, 2).toString("utf8"), "PK");
    assert.match(buffer.toString("utf8"), /manifest\.json/);
    assert.match(buffer.toString("utf8"), /playwright\.json/);
  } finally {
    await server.close();
  }
});

test("POST /api/sessions/bulk/export-agent returns one archive with multiple session folders", async () => {
  const server = await startServer();

  try {
    await seedAgentSession(server.baseUrl, "ses_bulk_agent_1");
    await seedAgentSession(server.baseUrl, "ses_bulk_agent_2");

    const response = await fetch(`${server.baseUrl}/api/sessions/bulk/export-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionIds: ["ses_bulk_agent_1", "ses_bulk_agent_2"] })
    });
    const buffer = Buffer.from(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/zip");
    assert.equal(buffer.subarray(0, 2).toString("utf8"), "PK");
    assert.match(buffer.toString("utf8"), /ses_bulk_agent_1\/manifest\.json/);
    assert.match(buffer.toString("utf8"), /ses_bulk_agent_2\/summary\.json/);
  } finally {
    await server.close();
  }
});
