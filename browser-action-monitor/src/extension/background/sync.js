import { exportSession, getSessionActions, markSyncEnabled, markSyncResult } from "./session-store.js";
import { readScreenshotAttachment } from "./attachment-store.js";

const DEFAULT_SYNC_BATCH_SIZE = 100;
const DEFAULT_MAX_SYNC_BACKOFF_MINUTES = 60;

function buildSyncSessionPayload(state, sessionId) {
  const exported = exportSession(state, sessionId);
  if (!exported) {
    return null;
  }

  const { actions: _ignoredActions, ...sessionPayload } = exported;
  return sessionPayload;
}

export function buildSyncRequest(settings, payload) {
  const baseUrl = (settings.serverUrl || "").replace(/\/+$/, "");
  const headers = {
    "Content-Type": "application/json"
  };

  if (settings.authMode === "apiKey" && settings.apiKey) {
    headers["X-API-Key"] = settings.apiKey;
  }

  return {
    url: `${baseUrl}/api/actions/batch`,
    headers,
    body: JSON.stringify(payload)
  };
}

export function buildAttachmentUploadRequest(settings, { sessionId, actionId, attachment }) {
  const baseUrl = (settings.serverUrl || "").replace(/\/+$/, "");
  const headers = {
    "Content-Type": "application/json"
  };

  if (settings.authMode === "apiKey" && settings.apiKey) {
    headers["X-API-Key"] = settings.apiKey;
  }

  return {
    url: `${baseUrl}/api/sessions/${sessionId}/actions/${actionId}/attachments/screenshot`,
    headers,
    body: JSON.stringify({
      attachment
    })
  };
}

export function hasRemoteSync(settings = {}) {
  return Boolean(settings.serverUrl);
}

function getSyncTargetSessionId(state, requestedSessionId) {
  return requestedSessionId || state.currentSessionId;
}

function computeNextRetryAt({
  attemptedAt,
  consecutiveFailureCount,
  maxBackoffMinutes = DEFAULT_MAX_SYNC_BACKOFF_MINUTES,
  backoffEnabled = true
}) {
  if (!backoffEnabled) {
    return null;
  }

  const safeCount = Math.max(1, Number(consecutiveFailureCount) || 1);
  const delayMinutes = Math.min(2 ** (safeCount - 1), Math.max(1, Number(maxBackoffMinutes) || DEFAULT_MAX_SYNC_BACKOFF_MINUTES));
  return attemptedAt + delayMinutes * 60 * 1000;
}

function chunkActions(actions, chunkSize) {
  const batches = [];
  for (let index = 0; index < actions.length; index += chunkSize) {
    batches.push(actions.slice(index, index + chunkSize));
  }
  return batches;
}

async function uploadBatch({ sessionPayload, actions, settings, fetchImpl }) {
  const request = buildSyncRequest(settings, {
    session: sessionPayload,
    actions
  });
  const response = await fetchImpl(request.url, {
    method: "POST",
    headers: request.headers,
    body: request.body
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const body = await response.json();
  return body.acceptedActionIds || actions.map((action) => action.id);
}

function stripAttachmentPayloads(actions = []) {
  return actions.map((action) => ({
    ...action,
    attachment: action.attachment
      ? {
        ...action.attachment,
        screenshot: action.attachment.screenshot
          ? { ...action.attachment.screenshot }
          : action.attachment.screenshot
      }
      : action.attachment
  }));
}

function markAttachmentRemoteFailure(action, errorCode) {
  if (!action?.attachment?.screenshot) {
    return;
  }

  action.attachment.screenshot.remoteStatus = "failed";
  action.attachment.screenshot.remoteError = errorCode;
}

async function uploadScreenshotAttachments({
  state,
  sessionId,
  actionIds,
  settings,
  attachmentStore,
  fetchImpl
}) {
  if (!attachmentStore || !actionIds.length) {
    return;
  }

  const actions = getSessionActions(state, sessionId)
    .filter((action) => actionIds.includes(action.id))
    .filter((action) => action.attachment?.screenshot?.status === "ready");

  for (const action of actions) {
    const attachment = await readScreenshotAttachment(attachmentStore, action.id);
    if (!attachment?.dataUrl) {
      markAttachmentRemoteFailure(action, "missing_local_attachment");
      continue;
    }

    const request = buildAttachmentUploadRequest(settings, {
      sessionId,
      actionId: action.id,
      attachment
    });

    const response = await fetchImpl(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body
    });

    if (!response.ok) {
      markAttachmentRemoteFailure(action, `HTTP ${response.status}`);
      continue;
    }

    const payload = await response.json();
    action.attachment.screenshot.remoteStatus = "uploaded";
    action.attachment.screenshot.remoteUrl = payload.remoteUrl || "";
    action.attachment.screenshot.remoteUploadedAt = payload.uploadedAt || Date.now();
    action.attachment.screenshot.remoteError = "";
  }
}

async function uploadBatchWithFallback({ sessionPayload, actions, settings, fetchImpl }) {
  try {
    return {
      succeededIds: await uploadBatch({ sessionPayload, actions, settings, fetchImpl }),
      failedIds: [],
      errorMessage: ""
    };
  } catch (error) {
    const message = error.message || String(error);

    if (message !== "HTTP 413" || actions.length <= 1) {
      return {
        succeededIds: [],
        failedIds: actions.map((action) => action.id),
        errorMessage: message
      };
    }

    const middle = Math.ceil(actions.length / 2);
    const leftResult = await uploadBatchWithFallback({
      sessionPayload,
      actions: actions.slice(0, middle),
      settings,
      fetchImpl
    });
    const rightResult = await uploadBatchWithFallback({
      sessionPayload,
      actions: actions.slice(middle),
      settings,
      fetchImpl
    });

    return {
      succeededIds: [...leftResult.succeededIds, ...rightResult.succeededIds],
      failedIds: [...leftResult.failedIds, ...rightResult.failedIds],
      errorMessage: rightResult.errorMessage || leftResult.errorMessage || ""
    };
  }
}

export async function syncPendingActions({
  state,
  sessionId,
  settings,
  trigger = "",
  fetchImpl = fetch,
  attachmentStore = null
}) {
  const targetSessionId = getSyncTargetSessionId(state, sessionId);

  if (!hasRemoteSync(settings) || !targetSessionId) {
    return {
      syncedCount: 0,
      failedCount: 0,
      skipped: true
    };
  }

  const pendingActions = getSessionActions(state, targetSessionId).filter((action) => action.sync.status === "pending" || action.sync.status === "failed");

  markSyncEnabled(state, targetSessionId, true);

  if (pendingActions.length === 0) {
    return {
      syncedCount: 0,
      failedCount: 0,
      skipped: true
    };
  }

  const sessionPayload = buildSyncSessionPayload(state, targetSessionId);
  const batchSize = Math.max(1, Number(settings.syncBatchSize) || DEFAULT_SYNC_BATCH_SIZE);
  const batches = chunkActions(pendingActions, batchSize);
  let syncedCount = 0;
  let failedCount = 0;
  let lastError = "";

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    const attemptedAt = Date.now();

    const result = await uploadBatchWithFallback({
      sessionPayload,
      actions: stripAttachmentPayloads(batch),
      settings,
      fetchImpl
    });

    markSyncResult(state, targetSessionId, {
      succeededIds: result.succeededIds,
      failedIds: [],
      errorMessage: "",
      attemptedAt,
      trigger,
      nextRetryAt: null
    });
    syncedCount += result.succeededIds.length;
    await uploadScreenshotAttachments({
      state,
      sessionId: targetSessionId,
      actionIds: result.succeededIds,
      settings,
      attachmentStore,
      fetchImpl
    });

    if (result.failedIds.length > 0) {
      lastError = result.errorMessage;
      const nextRetryAt = computeNextRetryAt({
        attemptedAt,
        consecutiveFailureCount: (state.sessions[targetSessionId]?.sync?.consecutiveFailureCount || 0) + 1,
        maxBackoffMinutes: settings.maxSyncBackoffMinutes,
        backoffEnabled: settings.syncBackoffEnabled !== false
      });
      const remainingFailedIds = [
        ...result.failedIds,
        ...batches.slice(batchIndex + 1).flat().map((action) => action.id)
      ];
      markSyncResult(state, targetSessionId, {
        succeededIds: [],
        failedIds: remainingFailedIds,
        errorMessage: lastError,
        attemptedAt,
        trigger,
        nextRetryAt
      });
      failedCount += remainingFailedIds.length;
      break;
    }
  }

  return {
    syncedCount,
    failedCount,
    skipped: false,
    ...(lastError ? { error: lastError } : {})
  };
}
