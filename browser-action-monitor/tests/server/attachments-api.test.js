import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createApp } from "../../server/app.js";

async function createServer() {
  const dataDir = await mkdtemp(join(tmpdir(), "browser-action-monitor-attachments-"));
  const app = createApp({
    dataDir,
    authMode: "none",
    apiKey: "",
    port: 0
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  return {
    dataDir,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  };
}

test("server stores screenshot uploads separately and exposes remote attachment metadata", async () => {
  const server = await createServer();

  try {
    const sessionId = "ses_attach_api";
    const actionId = "act_attach_api";

    await fetch(`${server.baseUrl}/api/actions/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session: {
          sessionId,
          startedAt: 1,
          endedAt: 1,
          status: "completed",
          actionCount: 1
        },
        actions: [
          {
            id: actionId,
            sessionId,
            timestamp: 1,
            type: "click",
            page: { url: "https://example.com", title: "Example" },
            attachment: {
              domSnapshot: { status: "ready", preview: "button" },
              screenshot: { status: "ready", storageKey: "monitorAttachment:act_attach_api", mimeType: "image/jpeg" }
            },
            sync: { status: "pending", attempts: 0, lastAttemptAt: null, lastError: "" }
          }
        ]
      })
    });

    const uploadResponse = await fetch(`${server.baseUrl}/api/sessions/${sessionId}/actions/${actionId}/attachments/screenshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attachment: {
          dataUrl: "data:image/jpeg;base64,abcd",
          mimeType: "image/jpeg",
          width: 800,
          height: 600
        }
      })
    });

    assert.equal(uploadResponse.status, 200);
    const uploadPayload = await uploadResponse.json();
    assert.equal(uploadPayload.uploaded, true);
    assert.match(uploadPayload.remoteUrl, /\/api\/attachments\/ses_attach_api\/act_attach_api$/);

    const sessionResponse = await fetch(`${server.baseUrl}/api/sessions/${sessionId}`);
    const sessionPayload = await sessionResponse.json();
    assert.equal(sessionPayload.actions[0].attachment.screenshot.remoteStatus, "uploaded");
    assert.match(sessionPayload.actions[0].attachment.screenshot.remoteUrl, /\/api\/attachments\/ses_attach_api\/act_attach_api$/);

    const fileResponse = await fetch(`${server.baseUrl}${sessionPayload.actions[0].attachment.screenshot.remoteUrl}`);
    assert.equal(fileResponse.status, 200);
    assert.equal(fileResponse.headers.get("content-type"), "image/jpeg");

    const store = JSON.parse(await readFile(join(server.dataDir, "store.json"), "utf8"));
    assert.equal(store.actionsBySession[sessionId][0].attachment.screenshot.remoteStatus, "uploaded");
  } finally {
    await server.close();
  }
});

test("server exports raw session zip with attachment files when screenshots are available", async () => {
  const server = await createServer();

  try {
    const sessionId = "ses_attach_zip";
    const actionId = "act_attach_zip";

    await fetch(`${server.baseUrl}/api/actions/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session: {
          sessionId,
          startedAt: 1,
          endedAt: 1,
          status: "completed",
          actionCount: 1
        },
        actions: [
          {
            id: actionId,
            sessionId,
            timestamp: 1,
            type: "click",
            page: { url: "https://example.com", title: "Example" },
            attachment: {
              domSnapshot: { status: "ready", preview: "button" },
              screenshot: { status: "ready", storageKey: "monitorAttachment:act_attach_zip", mimeType: "image/jpeg" }
            },
            sync: { status: "pending", attempts: 0, lastAttemptAt: null, lastError: "" }
          }
        ]
      })
    });

    await fetch(`${server.baseUrl}/api/sessions/${sessionId}/actions/${actionId}/attachments/screenshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attachment: {
          dataUrl: "data:image/jpeg;base64,abcd",
          mimeType: "image/jpeg",
          width: 800,
          height: 600
        }
      })
    });

    const exportResponse = await fetch(`${server.baseUrl}/api/sessions/${sessionId}/export?format=zip`);
    const archive = Buffer.from(await exportResponse.arrayBuffer());

    assert.equal(exportResponse.status, 200);
    assert.equal(exportResponse.headers.get("content-type"), "application/zip");
    assert.equal(archive.subarray(0, 2).toString("utf8"), "PK");
    assert.match(archive.toString("utf8"), /session\.json/);
    assert.match(archive.toString("utf8"), /attachments\/act_attach_zip\.jpg/);
  } finally {
    await server.close();
  }
});
