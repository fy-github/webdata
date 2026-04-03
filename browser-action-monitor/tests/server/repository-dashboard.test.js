import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createRepository } from "../../server/repository.js";

async function withRepository(run) {
  const dataDir = await mkdtemp(join(tmpdir(), "browser-action-monitor-repo-"));
  const repository = createRepository({ dataDir });

  try {
    await run(repository);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

function createSession(sessionId, startedAt, lastUrl) {
  return {
    sessionId,
    startedAt,
    endedAt: startedAt + 10,
    status: "completed",
    actionCount: 1,
    lastUrl,
    sync: {
      enabled: true,
      pendingCount: 0,
      failedCount: 0,
      lastSyncedAt: null,
      lastError: ""
    }
  };
}

function createAction(actionId, sessionId, timestamp, selector = "button#go") {
  return {
    id: actionId,
    sessionId,
    type: "click",
    timestamp,
    page: { url: "https://example.com", title: "Example" },
    target: { selector },
    payload: { clientX: 10, clientY: 20 },
    privacy: { enabled: true, masked: false, reason: "" },
    sync: { status: "synced", attempts: 1, lastAttemptAt: timestamp, lastError: "" }
  };
}

test("repository listSessions supports keyword filtering, tag filtering, and pagination", async () => {
  await withRepository(async (repository) => {
    await repository.saveBatch({
      session: createSession("ses_checkout", 100, "https://example.com/checkout"),
      actions: [createAction("act_1", "ses_checkout", 100)]
    });
    await repository.saveBatch({
      session: createSession("ses_login", 200, "https://example.com/login"),
      actions: [createAction("act_2", "ses_login", 200)]
    });
    await repository.updateSessionTags("ses_checkout", ["checkout", "training"]);
    await repository.updateSessionTags("ses_login", ["login"]);

    const filtered = await repository.listSessions({
      q: "checkout",
      tag: "training",
      page: 1,
      pageSize: 10
    });

    assert.equal(filtered.total, 1);
    assert.equal(filtered.sessions.length, 1);
    assert.equal(filtered.sessions[0].sessionId, "ses_checkout");

    const paged = await repository.listSessions({
      page: 2,
      pageSize: 1
    });

    assert.equal(paged.total, 2);
    assert.equal(paged.sessions.length, 1);
    assert.equal(paged.sessions[0].sessionId, "ses_checkout");
  });
});

test("repository deleteAction removes the action and updates the parent session count", async () => {
  await withRepository(async (repository) => {
    await repository.saveBatch({
      session: createSession("ses_detail", 100, "https://example.com/detail"),
      actions: [
        createAction("act_1", "ses_detail", 100, "button#one"),
        createAction("act_2", "ses_detail", 101, "button#two")
      ]
    });

    const result = await repository.deleteAction("act_1");
    const session = await repository.getSession("ses_detail");

    assert.equal(result.deleted, true);
    assert.equal(session.actions.length, 1);
    assert.equal(session.actions[0].id, "act_2");
    assert.equal(session.session.actionCount, 1);
  });
});

test("repository bulkTagSessions and exportSessions return tagged sessions in one payload", async () => {
  await withRepository(async (repository) => {
    await repository.saveBatch({
      session: createSession("ses_export_1", 100, "https://example.com/a"),
      actions: [createAction("act_1", "ses_export_1", 100)]
    });
    await repository.saveBatch({
      session: createSession("ses_export_2", 101, "https://example.com/b"),
      actions: [createAction("act_2", "ses_export_2", 101)]
    });

    const tagResult = await repository.bulkTagSessions(["ses_export_1", "ses_export_2"], ["dataset-a"]);
    const exportResult = await repository.exportSessions(["ses_export_1", "ses_export_2"]);

    assert.equal(tagResult.updatedCount, 2);
    assert.equal(exportResult.sessionCount, 2);
    assert.deepEqual(exportResult.sessions.map((session) => session.tags), [["dataset-a"], ["dataset-a"]]);
  });
});

test("repository derives session sync summary from action sync states", async () => {
  await withRepository(async (repository) => {
    await repository.saveBatch({
      session: {
        ...createSession("ses_sync", 100, "https://example.com/sync"),
        sync: {
          enabled: true,
          pendingCount: 0,
          failedCount: 1740,
          lastSyncedAt: null,
          lastError: "HTTP 413"
        }
      },
      actions: [
        {
          ...createAction("act_synced", "ses_sync", 100),
          sync: { status: "synced", attempts: 1, lastAttemptAt: 120, lastError: "" }
        },
        {
          ...createAction("act_pending", "ses_sync", 101),
          sync: { status: "pending", attempts: 0, lastAttemptAt: 121, lastError: "" }
        },
        {
          ...createAction("act_failed", "ses_sync", 102),
          sync: { status: "failed", attempts: 2, lastAttemptAt: 122, lastError: "timeout" }
        }
      ]
    });

    const list = await repository.listSessions({ page: 1, pageSize: 10 });
    const detail = await repository.getSession("ses_sync");

    assert.equal(list.sessions[0].sync.pendingCount, 1);
    assert.equal(list.sessions[0].sync.failedCount, 1);
    assert.equal(list.sessions[0].sync.lastSyncedAt, 120);
    assert.equal(list.sessions[0].sync.lastError, "timeout");
    assert.equal(detail.session.sync.pendingCount, 1);
    assert.equal(detail.session.sync.failedCount, 1);
    assert.equal(detail.session.sync.lastSyncedAt, 120);
    assert.equal(detail.session.sync.lastError, "timeout");
  });
});
