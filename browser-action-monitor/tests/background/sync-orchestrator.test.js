import test from "node:test";
import assert from "node:assert/strict";

import { createInitialState, createSession } from "../../src/extension/background/session-store.js";
import {
  buildSyncCandidates,
  runSyncOrchestrator
} from "../../src/extension/background/sync-orchestrator.js";

function addSession(state, session, actions) {
  state.sessions[session.sessionId] = session;
  state.actionsBySession[session.sessionId] = actions;
}

test("buildSyncCandidates only includes sessions with pending or failed work outside backoff", () => {
  const state = createInitialState();
  const now = 1711111111000;
  const runnable = createSession({ now });
  const backoff = createSession({ now });
  backoff.sync.nextRetryAt = now + 60_000;
  const clean = createSession({ now });

  addSession(state, runnable, [
    { id: "act_1", sessionId: runnable.sessionId, sync: { status: "pending" } }
  ]);
  addSession(state, backoff, [
    { id: "act_2", sessionId: backoff.sessionId, sync: { status: "failed" } }
  ]);
  addSession(state, clean, [
    { id: "act_3", sessionId: clean.sessionId, sync: { status: "synced" } }
  ]);

  const plan = buildSyncCandidates({
    state,
    now,
    runningSessionIds: new Set(),
    policy: {
      maxConcurrentSessionSyncs: 2,
      syncBackoffEnabled: true
    }
  });

  assert.deepEqual(plan.candidateSessionIds, [runnable.sessionId]);
  assert.equal(plan.skippedBySessionId[backoff.sessionId], "backoff");
  assert.equal(plan.skippedBySessionId[clean.sessionId], "no-pending-work");
});

test("runSyncOrchestrator limits concurrent session execution", async () => {
  const state = createInitialState();
  const now = 1711111111000;
  const sessions = Array.from({ length: 3 }, () => createSession({ now }));

  for (const session of sessions) {
    addSession(state, session, [
      { id: `act_${session.sessionId}`, sessionId: session.sessionId, sync: { status: "pending" } }
    ]);
  }

  const active = [];
  let maxActive = 0;

  const result = await runSyncOrchestrator({
    state,
    trigger: "alarm",
    now,
    policy: {
      maxConcurrentSessionSyncs: 2,
      syncBackoffEnabled: true
    },
    runtimeGateResult: {
      allowed: true,
      effectiveConcurrency: 2,
      reason: ""
    },
    runSessionSync: async ({ sessionId }) => {
      active.push(sessionId);
      maxActive = Math.max(maxActive, active.length);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active.splice(active.indexOf(sessionId), 1);
      return { sessionId, syncedCount: 1, failedCount: 0, skipped: false };
    }
  });

  assert.equal(maxActive, 2);
  assert.equal(result.result.completed.length, 3);
});

test("runSyncOrchestrator keeps other sessions running when one session fails", async () => {
  const state = createInitialState();
  const now = 1711111111000;
  const one = createSession({ now });
  const two = createSession({ now });

  addSession(state, one, [
    { id: "act_1", sessionId: one.sessionId, sync: { status: "pending" } }
  ]);
  addSession(state, two, [
    { id: "act_2", sessionId: two.sessionId, sync: { status: "pending" } }
  ]);

  const result = await runSyncOrchestrator({
    state,
    trigger: "alarm",
    now,
    policy: {
      maxConcurrentSessionSyncs: 2,
      syncBackoffEnabled: true
    },
    runtimeGateResult: {
      allowed: true,
      effectiveConcurrency: 2,
      reason: ""
    },
    runSessionSync: async ({ sessionId }) => {
      if (sessionId === one.sessionId) {
        throw new Error("boom");
      }
      return { sessionId, syncedCount: 1, failedCount: 0, skipped: false };
    }
  });

  assert.equal(result.result.failed.length, 1);
  assert.equal(result.result.completed.length, 1);
});

test("runSyncOrchestrator respects runtime gate skip for automatic triggers", async () => {
  const state = createInitialState();
  const now = 1711111111000;
  const session = createSession({ now });

  addSession(state, session, [
    { id: "act_1", sessionId: session.sessionId, sync: { status: "pending" } }
  ]);

  const result = await runSyncOrchestrator({
    state,
    trigger: "alarm",
    now,
    policy: {
      maxConcurrentSessionSyncs: 2,
      syncBackoffEnabled: true
    },
    runtimeGateResult: {
      allowed: false,
      effectiveConcurrency: 0,
      reason: "power-save"
    },
    runSessionSync: async () => {
      throw new Error("should not run");
    }
  });

  assert.equal(result.result.completed.length, 0);
  assert.equal(result.result.skipped.length, 1);
  assert.equal(result.result.skipped[0].reason, "power-save");
});

test("runSyncOrchestrator allows manual trigger to run sessions when gate says allowed", async () => {
  const state = createInitialState();
  const now = 1711111111000;
  const session = createSession({ now });

  addSession(state, session, [
    { id: "act_1", sessionId: session.sessionId, sync: { status: "pending" } }
  ]);

  const result = await runSyncOrchestrator({
    state,
    trigger: "manual",
    now,
    policy: {
      maxConcurrentSessionSyncs: 2,
      syncBackoffEnabled: true
    },
    runtimeGateResult: {
      allowed: true,
      effectiveConcurrency: 2,
      reason: ""
    },
    runSessionSync: async ({ sessionId }) => ({
      sessionId,
      syncedCount: 1,
      failedCount: 0,
      skipped: false
    })
  });

  assert.equal(result.result.completed.length, 1);
});
