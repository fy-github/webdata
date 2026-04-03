function hasPendingSyncWork(actions = []) {
  return actions.some((action) => action.sync?.status === "pending" || action.sync?.status === "failed");
}

function normalizeConcurrency(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.max(1, Math.floor(parsed));
}

export function buildSyncCandidates({
  state,
  now = Date.now(),
  runningSessionIds = new Set(),
  policy = {}
}) {
  const skippedBySessionId = {};
  const candidateSessionIds = [];
  const sessions = Object.values(state?.sessions || {}).sort((left, right) => left.startedAt - right.startedAt);

  for (const session of sessions) {
    const sessionId = session.sessionId;
    const actions = state?.actionsBySession?.[sessionId] || [];

    if (!hasPendingSyncWork(actions)) {
      skippedBySessionId[sessionId] = "no-pending-work";
      continue;
    }

    if (runningSessionIds.has(sessionId)) {
      skippedBySessionId[sessionId] = "already-running";
      continue;
    }

    if (policy.syncBackoffEnabled !== false && session.sync?.nextRetryAt && session.sync.nextRetryAt > now) {
      skippedBySessionId[sessionId] = "backoff";
      continue;
    }

    candidateSessionIds.push(sessionId);
  }

  return {
    candidateSessionIds,
    skippedBySessionId
  };
}

async function runWithConcurrencyLimit(items, limit, worker) {
  const concurrency = normalizeConcurrency(limit);
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const sessionId = queue.shift();
      await worker(sessionId);
    }
  });

  await Promise.all(workers);
}

export async function runSyncOrchestrator({
  state,
  trigger = "alarm",
  now = Date.now(),
  policy = {},
  runtimeGateResult = { allowed: true, effectiveConcurrency: 1, reason: "" },
  runningSessionIds = new Set(),
  runSessionSync,
  onSessionSkipped
}) {
  const plan = buildSyncCandidates({
    state,
    now,
    runningSessionIds,
    policy
  });
  const result = {
    trigger,
    completed: [],
    failed: [],
    skipped: []
  };

  const pushSkipped = async (sessionId, reason) => {
    const entry = { sessionId, reason };
    result.skipped.push(entry);
    if (typeof onSessionSkipped === "function") {
      await onSessionSkipped({ sessionId, reason, trigger, now });
    }
  };

  for (const [sessionId, reason] of Object.entries(plan.skippedBySessionId)) {
    await pushSkipped(sessionId, reason);
  }

  plan.runtimeGateResult = runtimeGateResult;
  plan.effectiveConcurrency = normalizeConcurrency(
    runtimeGateResult?.effectiveConcurrency,
    normalizeConcurrency(policy.maxConcurrentSessionSyncs, 1)
  );

  if (runtimeGateResult?.allowed === false) {
    for (const sessionId of plan.candidateSessionIds) {
      await pushSkipped(sessionId, runtimeGateResult.reason || "runtime-gated");
    }

    return { plan, result };
  }

  if (typeof runSessionSync !== "function" || plan.candidateSessionIds.length === 0) {
    return { plan, result };
  }

  await runWithConcurrencyLimit(
    plan.candidateSessionIds,
    plan.effectiveConcurrency,
    async (sessionId) => {
      runningSessionIds.add(sessionId);

      try {
        const sessionResult = await runSessionSync({ sessionId, trigger, now });
        if (sessionResult?.skipped) {
          await pushSkipped(sessionId, sessionResult.reason || "skipped");
          return;
        }

        result.completed.push({
          sessionId,
          ...sessionResult
        });
      } catch (error) {
        result.failed.push({
          sessionId,
          error: error?.message || String(error)
        });
      } finally {
        runningSessionIds.delete(sessionId);
      }
    }
  );

  return { plan, result };
}
