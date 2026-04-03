function generateSessionId() {
  return `ses_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function createInitialState() {
  return {
    isRecording: true,
    currentSessionId: null,
    sessions: {},
    actionsBySession: {},
    attachmentHealth: {
      screenshotQueueSize: 0,
      screenshotStorageBytes: 0,
      consecutiveScreenshotFailures: 0,
      autoDisabled: {
        domSnapshots: false,
        screenshots: false,
        domReason: "",
        screenshotReason: ""
      }
    }
  };
}

export function createSession({ now = Date.now() } = {}) {
  return {
    sessionId: generateSessionId(),
    startedAt: now,
    endedAt: now,
    status: "active",
    actionCount: 0,
    lastUrl: "",
    sync: {
      enabled: false,
      pendingCount: 0,
      failedCount: 0,
      lastSyncedAt: null,
      lastError: "",
      lastSuccessfulSyncAt: null,
      lastFailedSyncAt: null,
      consecutiveFailureCount: 0,
      nextRetryAt: null,
      lastTrigger: "",
      lastSkippedReason: ""
    }
  };
}

export function startNewSession(state, { now = Date.now() } = {}) {
  if (state.currentSessionId && state.sessions[state.currentSessionId]) {
    state.sessions[state.currentSessionId].status = "completed";
    state.sessions[state.currentSessionId].endedAt = now;
  }

  const session = createSession({ now });
  state.currentSessionId = session.sessionId;
  state.sessions[session.sessionId] = session;
  state.actionsBySession[session.sessionId] = [];
  return session;
}

function ensureActionList(state, sessionId) {
  if (!state.actionsBySession[sessionId]) {
    state.actionsBySession[sessionId] = [];
  }

  return state.actionsBySession[sessionId];
}

export function appendAction(state, action) {
  const session = state.sessions[action.sessionId];

  if (!session) {
    throw new Error(`Missing session ${action.sessionId}`);
  }

  const actions = ensureActionList(state, action.sessionId);
  actions.push(action);

  session.actionCount = actions.length;
  session.endedAt = action.timestamp;
  session.lastUrl = action.page?.url || session.lastUrl;
  session.sync.pendingCount = actions.filter((entry) => entry.sync.status === "pending").length;
  session.sync.failedCount = actions.filter((entry) => entry.sync.status === "failed").length;
}

export function getSessionActions(state, sessionId) {
  return [...(state.actionsBySession[sessionId] || [])];
}

export function updateActionAttachment(state, sessionId, actionId, patch = {}) {
  const actions = ensureActionList(state, sessionId);
  const action = actions.find((entry) => entry.id === actionId);

  if (!action) {
    return false;
  }

  action.attachment ||= {};
  if (patch.domSnapshot) {
    action.attachment.domSnapshot = {
      ...(action.attachment.domSnapshot || {}),
      ...patch.domSnapshot
    };
  }

  if (patch.screenshot) {
    action.attachment.screenshot = {
      ...(action.attachment.screenshot || {}),
      ...patch.screenshot
    };
  }

  return true;
}

export function updateAttachmentHealth(state, patch = {}) {
  state.attachmentHealth ||= createInitialState().attachmentHealth;
  state.attachmentHealth = {
    ...state.attachmentHealth,
    ...patch,
    autoDisabled: {
      ...(state.attachmentHealth.autoDisabled || {}),
      ...(patch.autoDisabled || {})
    }
  };
}

export function exportSession(state, sessionId) {
  const session = state.sessions[sessionId];
  const actions = getSessionActions(state, sessionId);

  if (!session) {
    return null;
  }

  return {
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    status: session.status,
    actionCount: session.actionCount,
    lastUrl: session.lastUrl,
    sync: { ...session.sync },
    actions
  };
}

export function markSyncResult(state, sessionId, {
  succeededIds = [],
  failedIds = [],
  errorMessage = "",
  attemptedAt = Date.now(),
  trigger = "",
  nextRetryAt = null,
  skippedReason = ""
}) {
  const actions = ensureActionList(state, sessionId);
  const session = state.sessions[sessionId];

  for (const action of actions) {
    if (succeededIds.includes(action.id)) {
      action.sync.status = "synced";
      action.sync.attempts += 1;
      action.sync.lastAttemptAt = attemptedAt;
      action.sync.lastError = "";
    }

    if (failedIds.includes(action.id)) {
      action.sync.status = "failed";
      action.sync.attempts += 1;
      action.sync.lastAttemptAt = attemptedAt;
      action.sync.lastError = errorMessage;
    }
  }

  session.sync.pendingCount = actions.filter((entry) => entry.sync.status === "pending").length;
  session.sync.failedCount = actions.filter((entry) => entry.sync.status === "failed").length;
  session.sync.lastSyncedAt = succeededIds.length > 0 ? attemptedAt : session.sync.lastSyncedAt;
  session.sync.lastError = failedIds.length > 0 ? errorMessage : "";
  session.sync.lastTrigger = trigger || session.sync.lastTrigger || "";
  session.sync.lastSkippedReason = skippedReason || "";

  if (succeededIds.length > 0) {
    session.sync.lastSuccessfulSyncAt = attemptedAt;
    session.sync.consecutiveFailureCount = 0;
    session.sync.nextRetryAt = null;
  }

  if (failedIds.length > 0) {
    session.sync.lastFailedSyncAt = attemptedAt;
    session.sync.consecutiveFailureCount += 1;
    session.sync.nextRetryAt = nextRetryAt;
  }
}

export function markSyncEnabled(state, sessionId, enabled) {
  const session = state.sessions[sessionId];
  if (session) {
    session.sync.enabled = enabled;
  }
}

export function clearState(state) {
  state.currentSessionId = null;
  state.sessions = {};
  state.actionsBySession = {};
  state.attachmentHealth = createInitialState().attachmentHealth;
}
