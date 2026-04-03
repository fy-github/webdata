import { DEFAULT_SETTINGS, EVENT_SETTINGS_MAP, STORAGE_KEYS } from "./src/extension/shared/constants.js";
import { normalizeAction } from "./src/extension/shared/normalize.js";
import {
  createChromeAttachmentStorageAdapter,
  getAttachmentUsage,
  readScreenshotAttachment,
  saveScreenshotAttachment
} from "./src/extension/background/attachment-store.js";
import { createAttachmentQueue } from "./src/extension/background/attachment-queue.js";
import {
  appendAction,
  clearState,
  createInitialState,
  exportSession,
  getSessionActions,
  markSyncResult,
  markSyncEnabled,
  startNewSession,
  updateActionAttachment,
  updateAttachmentHealth
} from "./src/extension/background/session-store.js";
import { downloadAgentExport } from "./src/extension/background/agent-export.js";
import { queryRecordsState } from "./src/extension/background/records-query.js";
import { evaluateAttachmentPressure, resolveAttachmentPolicy } from "./src/extension/background/screenshot-policy.js";
import { syncPendingActions } from "./src/extension/background/sync.js";
import { evaluateRuntimeGates } from "./src/extension/background/runtime-gates.js";
import { runSyncOrchestrator } from "./src/extension/background/sync-orchestrator.js";
import { bootstrapExistingTabs } from "./src/extension/background/content-script-bootstrap.js";
import {
  applyBackgroundSyncAlarm,
  BACKGROUND_SYNC_ALARM_NAME,
  getBackgroundSyncPolicy
} from "./src/extension/background/sync-scheduler.js";

let settings = { ...DEFAULT_SETTINGS };
let state = createInitialState();
let syncTimer = null;
let syncSweepInFlight = null;
const runningSessionIds = new Set();
let attachmentStorageAdapter = null;
let attachmentQueue = null;

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result));
  });
}

function storageSet(value) {
  return new Promise((resolve) => {
    chrome.storage.local.set(value, () => resolve());
  });
}

async function persistState() {
  await storageSet({
    [STORAGE_KEYS.state]: state
  });
}

async function persistSettings() {
  await storageSet({
    [STORAGE_KEYS.settings]: settings
  });
}

function clearShortSyncTimer() {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
}

function ensureAttachmentInfrastructure() {
  if (!attachmentStorageAdapter) {
    attachmentStorageAdapter = createChromeAttachmentStorageAdapter(chrome.storage.local);
  }

  if (!attachmentQueue) {
    attachmentQueue = createAttachmentQueue({
      captureScreenshot: async ({ windowId }) => new Promise((resolve, reject) => {
        chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 60 }, (dataUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (!dataUrl) {
            reject(new Error("empty-screenshot"));
            return;
          }

          resolve({
            dataUrl,
            mimeType: "image/jpeg",
            width: 0,
            height: 0
          });
        });
      }),
      saveScreenshot: async ({ actionId, payload }) => saveScreenshotAttachment(attachmentStorageAdapter, {
        actionId,
        dataUrl: payload.dataUrl,
        mimeType: payload.mimeType,
        width: payload.width,
        height: payload.height
      }),
      updateActionAttachment: async (job, patch) => {
        updateActionAttachment(state, job.sessionId, job.actionId, {
          screenshot: patch
        });
        await persistState();
      },
      evaluatePolicy: (job, health) => {
        const attachmentPolicy = resolveAttachmentPolicy(settings, state);
        if (!attachmentPolicy.screenshots.enabled) {
          return {
            allowScreenshot: false,
            reason: attachmentPolicy.screenshots.mode
          };
        }

        const sessionActions = getSessionActions(state, job.sessionId);
        const screenshotCount = sessionActions.filter((action) => action.attachment?.screenshot?.status === "ready").length;
        if (screenshotCount >= Math.max(1, Number(settings.screenshotSessionLimit) || 500)) {
          return {
            allowScreenshot: false,
            reason: "skipped_quota"
          };
        }

        if (Number(health.screenshotQueueSize || 0) >= Math.max(1, Number(settings.screenshotQueueLimit) || 40)) {
          return {
            allowScreenshot: false,
            reason: "disabled_auto_quota"
          };
        }

        return {
          allowScreenshot: true,
          reason: ""
        };
      },
      onHealthChange: async (health) => {
        updateAttachmentHealth(state, health);
        applyAttachmentPressureToState(state.currentSessionId);
        await persistState();
      },
      failureThreshold: Math.max(1, Number(settings.screenshotFailureThreshold) || 3)
    });
  }
}

function applyAttachmentPressureToState(sessionId = state.currentSessionId) {
  const patch = evaluateAttachmentPressure({
    settings,
    state,
    sessionId
  });

  updateAttachmentHealth(state, patch);
}

function resetAutoDisabledFlagsForManualEnable(previousSettings, nextSettings) {
  const patch = {
    autoDisabled: {}
  };

  if (previousSettings.captureDomSnapshots === false && nextSettings.captureDomSnapshots !== false) {
    patch.autoDisabled.domSnapshots = false;
    patch.autoDisabled.domReason = "";
  }

  if (previousSettings.captureScreenshots === false && nextSettings.captureScreenshots !== false) {
    patch.autoDisabled.screenshots = false;
    patch.autoDisabled.screenshotReason = "";
  }

  if (Object.keys(patch.autoDisabled).length > 0) {
    updateAttachmentHealth(state, patch);
  }
}

function ensureSession() {
  if (!state.currentSessionId || !state.sessions[state.currentSessionId]) {
    startNewSession(state);
  }
}

function refreshSessionSyncFlags() {
  ensureSession();
  for (const sessionId of Object.keys(state.sessions)) {
    markSyncEnabled(state, sessionId, Boolean(settings.serverUrl));
  }
}

function isEventEnabled(eventType) {
  const key = EVENT_SETTINGS_MAP[eventType];
  return key ? settings[key] !== false : true;
}

function getCurrentSessionSummary() {
  ensureSession();
  const session = state.sessions[state.currentSessionId];
  const actions = getSessionActions(state, state.currentSessionId);
  const attachmentPolicy = resolveAttachmentPolicy(settings, state);

  return {
    sessionId: session.sessionId,
    actionCount: actions.length,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    lastUrl: session.lastUrl,
    isRecording: state.isRecording,
    sync: session.sync,
    attachments: {
      domSnapshots: {
        mode: attachmentPolicy.domSnapshots.mode,
        reason: attachmentPolicy.domSnapshots.reason
      },
      screenshots: {
        mode: attachmentPolicy.screenshots.mode,
        reason: attachmentPolicy.screenshots.reason
      },
      health: state.attachmentHealth
    }
  };
}

function scheduleSync() {
  if (!settings.serverUrl) {
    return;
  }

  clearShortSyncTimer();
  syncTimer = setTimeout(async () => {
    syncTimer = null;
    await runCurrentSessionSync("recent-action");
  }, 1200);
}

async function clearAlarm(name) {
  return new Promise((resolve) => {
    chrome.alarms.clear(name, () => resolve());
  });
}

async function createAlarm(name, info) {
  chrome.alarms.create(name, info);
}

function queryTabs(queryInfo) {
  return new Promise((resolve) => {
    chrome.tabs.query(queryInfo, (tabs) => resolve(tabs || []));
  });
}

function executeScript(options) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(options, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}

async function bootstrapRecorderContentScripts() {
  if (!chrome.tabs?.query || !chrome.scripting?.executeScript) {
    return {
      scannedCount: 0,
      injectedTabIds: []
    };
  }

  return bootstrapExistingTabs({
    tabsApi: {
      query: queryTabs
    },
    scriptingApi: {
      executeScript
    },
    onError: (error, tab) => {
      console.warn("Failed to bootstrap content script", tab?.id, error.message);
    }
  });
}

async function configureBackgroundSync() {
  return applyBackgroundSyncAlarm({
    settings,
    alarmsApi: {
      clear: clearAlarm,
      create: createAlarm
    }
  });
}

async function runImmediateSessionSync(sessionId, trigger = "manual") {
  if (!settings.serverUrl || !sessionId) {
    return {
      syncedCount: 0,
      failedCount: 0,
      skipped: true,
      reason: "disabled",
      trigger,
      sessionId: sessionId || ""
    };
  }

  if (runningSessionIds.has(sessionId)) {
    return {
      syncedCount: 0,
      failedCount: 0,
      skipped: true,
      reason: "busy",
      trigger,
      sessionId
    };
  }

  try {
    runningSessionIds.add(sessionId);
    const result = await syncPendingActions({
      state,
      settings,
      sessionId,
      trigger,
      attachmentStore: attachmentStorageAdapter
    });
    await persistState();
    return {
      ...result,
      trigger,
      sessionId
    };
  } finally {
    runningSessionIds.delete(sessionId);
  }
}

async function runCurrentSessionSync(trigger = "manual") {
  ensureSession();
  return runImmediateSessionSync(state.currentSessionId, trigger);
}

function markSessionSkipped({ sessionId, reason, trigger, now }) {
  if (!sessionId || !state.sessions[sessionId]) {
    return;
  }

  markSyncResult(state, sessionId, {
    attemptedAt: now,
    trigger,
    skippedReason: reason
  });
}

async function runBackgroundSyncSweep(trigger = "alarm") {
  const policy = getBackgroundSyncPolicy(settings);
  if (!policy.enabled) {
    return {
      plan: {
        candidateSessionIds: [],
        skippedBySessionId: {},
        effectiveConcurrency: 0,
        runtimeGateResult: {
          allowed: false,
          effectiveConcurrency: 0,
          reason: "disabled"
        }
      },
      result: {
        trigger,
        completed: [],
        failed: [],
        skipped: []
      }
    };
  }

  if (syncSweepInFlight) {
    return {
      plan: {
        candidateSessionIds: [],
        skippedBySessionId: {},
        effectiveConcurrency: 0,
        runtimeGateResult: {
          allowed: false,
          effectiveConcurrency: 0,
          reason: "busy"
        }
      },
      result: {
        trigger,
        completed: [],
        failed: [],
        skipped: []
      }
    };
  }

  syncSweepInFlight = (async () => {
    const now = Date.now();
    const runtimeGateResult = await evaluateRuntimeGates({
      trigger,
      requestedConcurrency: policy.maxConcurrentSessionSyncs,
      idleGateEnabled: policy.idleGateEnabled,
      batteryAwareSyncEnabled: policy.batteryAwareSyncEnabled
    });
    const orchestrated = await runSyncOrchestrator({
      state,
      trigger,
      now,
      policy,
      runtimeGateResult,
      runningSessionIds,
      runSessionSync: async ({ sessionId }) => syncPendingActions({
        state,
        settings,
        sessionId,
        trigger,
        attachmentStore: attachmentStorageAdapter
      }),
      onSessionSkipped: ({ sessionId, reason, trigger: skippedTrigger, now: skippedAt }) => {
        markSessionSkipped({
          sessionId,
          reason,
          trigger: skippedTrigger,
          now: skippedAt
        });
      }
    });
    await persistState();
    return orchestrated;
  })();

  try {
    return await syncSweepInFlight;
  } finally {
    syncSweepInFlight = null;
  }
}

async function maybeRunStartupSync(trigger = "startup") {
  const policy = getBackgroundSyncPolicy(settings);
  if (!policy.enabled || !policy.syncOnStartup) {
    return {
      syncedCount: 0,
      failedCount: 0,
      skipped: true,
      reason: "startup-disabled",
      trigger
    };
  }

  return runBackgroundSyncSweep(trigger);
}

async function recordAction(rawAction, sender) {
  ensureSession();

  if (!state.isRecording || !isEventEnabled(rawAction.eventType || rawAction.type)) {
    return {
      ignored: true
    };
  }

  ensureAttachmentInfrastructure();
  applyAttachmentPressureToState(state.currentSessionId);
  const attachmentPolicy = resolveAttachmentPolicy(settings, state);
  const action = normalizeAction(rawAction, {
    sessionId: state.currentSessionId,
    privacyEnabled: settings.privacyEnabled,
    attachmentPolicy
  });

  appendAction(state, action);
  markSyncEnabled(state, state.currentSessionId, Boolean(settings.serverUrl));
  await persistState();
  if (
    attachmentPolicy.screenshots.enabled
    && Number.isInteger(sender?.tab?.id)
    && Number.isInteger(sender?.tab?.windowId)
  ) {
    void attachmentQueue.enqueue({
      actionId: action.id,
      sessionId: state.currentSessionId,
      tabId: sender.tab.id,
      windowId: sender.tab.windowId
    });
  }
  scheduleSync();

  return {
    ignored: false,
    actionId: action.id
  };
}

async function initialize() {
  const result = await storageGet([STORAGE_KEYS.settings, STORAGE_KEYS.state]);
  settings = {
    ...DEFAULT_SETTINGS,
    ...(result[STORAGE_KEYS.settings] || {})
  };
  state = {
    ...createInitialState(),
    ...(result[STORAGE_KEYS.state] || {})
  };

  state.sessions ||= {};
  state.actionsBySession ||= {};
  state.attachmentHealth ||= createInitialState().attachmentHealth;
  if (typeof state.isRecording !== "boolean") {
    state.isRecording = true;
  }

  ensureSession();
  ensureAttachmentInfrastructure();
  const usage = await getAttachmentUsage(attachmentStorageAdapter);
  updateAttachmentHealth(state, {
    screenshotStorageBytes: usage.totalBytes
  });
  applyAttachmentPressureToState(state.currentSessionId);
  refreshSessionSyncFlags();
  await configureBackgroundSync();
  await Promise.all([persistSettings(), persistState()]);
}

const initPromise = initialize();

chrome.runtime.onStartup.addListener(() => {
  void initPromise.then(async () => {
    await bootstrapRecorderContentScripts();
    await maybeRunStartupSync("startup");
  });
});

chrome.runtime.onInstalled.addListener(() => {
  void initPromise.then(async () => {
    await bootstrapRecorderContentScripts();
    await configureBackgroundSync();
    await maybeRunStartupSync("startup");
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== BACKGROUND_SYNC_ALARM_NAME) {
    return;
  }

  void initPromise.then(async () => {
    await runBackgroundSyncSweep("alarm");
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  void initPromise.then(async () => {
    switch (request.action) {
      case "recordAction":
        sendResponse({ success: true, ...(await recordAction(request.data, sender)) });
        return;
      case "getStats":
        sendResponse({ success: true, stats: getCurrentSessionSummary() });
        return;
      case "getSettings":
        sendResponse({ success: true, settings });
        return;
      case "saveSettings":
        resetAutoDisabledFlagsForManualEnable(settings, { ...DEFAULT_SETTINGS, ...(request.data || {}) });
        settings = { ...DEFAULT_SETTINGS, ...(request.data || {}) };
        refreshSessionSyncFlags();
        await persistSettings();
        await persistState();
        await configureBackgroundSync();
        if (getBackgroundSyncPolicy(settings).enabled) {
          await maybeRunStartupSync("startup");
        } else {
          clearShortSyncTimer();
        }
        sendResponse({ success: true, settings });
        return;
      case "exportData":
        ensureSession();
        sendResponse({ success: true, data: exportSession(state, state.currentSessionId) });
        return;
      case "exportAgentData": {
        ensureSession();
        const result = await downloadAgentExport({
          settings,
          sessionId: request.data?.sessionId || state.currentSessionId,
          format: request.data?.format || "json",
          runSyncImpl: async () => runImmediateSessionSync(
            request.data?.sessionId || state.currentSessionId,
            "agent-export"
          ),
          downloadImpl: (options) => new Promise((resolve, reject) => {
            chrome.downloads.download(options, (downloadId) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }

              resolve(downloadId);
            });
          })
        });

        sendResponse({
          success: true,
          filename: result.filename,
          downloadId: result.downloadId
        });
        return;
      }
      case "getRecords": {
        const records = queryRecordsState({
          state,
          filters: request.filters || {}
        });
        sendResponse({ success: true, ...records });
        return;
      }
      case "getActionAttachmentPreview": {
        const actionId = request.data?.actionId || "";
        const attachment = await readScreenshotAttachment(attachmentStorageAdapter, actionId);
        sendResponse({
          success: true,
          attachment
        });
        return;
      }
      case "initSession": {
        const session = startNewSession(state);
        markSyncEnabled(state, session.sessionId, Boolean(settings.serverUrl));
        updateAttachmentHealth(state, {
          autoDisabled: {
            domSnapshots: false,
            screenshots: false,
            domReason: "",
            screenshotReason: ""
          }
        });
        await persistState();
        sendResponse({ success: true, sessionId: session.sessionId });
        return;
      }
      case "clearData":
        clearState(state);
        startNewSession(state);
        refreshSessionSyncFlags();
        await persistState();
        sendResponse({ success: true });
        return;
      case "startRecording":
        state.isRecording = true;
        await bootstrapRecorderContentScripts();
        await persistState();
        sendResponse({ success: true, isRecording: true });
        return;
      case "pauseRecording":
        state.isRecording = false;
        await persistState();
        sendResponse({ success: true, isRecording: false });
        return;
      case "retrySync":
        sendResponse({ success: true, result: await runCurrentSessionSync("manual-retry") });
        return;
      default:
        sendResponse({ success: false, error: "Unknown action" });
    }
  }).catch((error) => {
    sendResponse({ success: false, error: error.message });
  });

  return true;
});
