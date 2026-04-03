import { DEFAULT_SETTINGS } from "../extension/shared/constants.js";

function sendMessage(action, data = undefined) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action, data }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({
          success: false,
          error: chrome.runtime.lastError.message
        });
        return;
      }

      resolve(response);
    });
  });
}

function getNumberValue(id, fallback) {
  const value = Number(document.getElementById(id).value);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.floor(value);
}

function getFormValues() {
  return {
    captureClicks: document.getElementById("captureClicks").checked,
    captureInput: document.getElementById("captureInput").checked,
    captureChange: document.getElementById("captureChange").checked,
    captureSubmit: document.getElementById("captureSubmit").checked,
    captureNavigation: document.getElementById("captureNavigation").checked,
    captureScroll: document.getElementById("captureScroll").checked,
    captureKeydown: document.getElementById("captureKeydown").checked,
    captureMousemove: document.getElementById("captureMousemove").checked,
    scrollThrottleMs: getNumberValue("scrollThrottleMs", DEFAULT_SETTINGS.scrollThrottleMs),
    mousemoveThrottleMs: getNumberValue("mousemoveThrottleMs", DEFAULT_SETTINGS.mousemoveThrottleMs),
    privacyEnabled: document.getElementById("privacyEnabled").checked,
    serverUrl: document.getElementById("serverUrl").value.trim(),
    authMode: document.getElementById("authMode").value,
    apiKey: document.getElementById("apiKey").value.trim(),
    syncBatchSize: getNumberValue("syncBatchSize", DEFAULT_SETTINGS.syncBatchSize),
    backgroundSyncEnabled: document.getElementById("backgroundSyncEnabled").checked,
    backgroundSyncIntervalMinutes: getNumberValue(
      "backgroundSyncIntervalMinutes",
      DEFAULT_SETTINGS.backgroundSyncIntervalMinutes
    ),
    syncOnStartup: document.getElementById("syncOnStartup").checked,
    maxConcurrentSessionSyncs: getNumberValue(
      "maxConcurrentSessionSyncs",
      DEFAULT_SETTINGS.maxConcurrentSessionSyncs
    ),
    syncBackoffEnabled: document.getElementById("syncBackoffEnabled").checked,
    maxSyncBackoffMinutes: getNumberValue(
      "maxSyncBackoffMinutes",
      DEFAULT_SETTINGS.maxSyncBackoffMinutes
    ),
    idleGateEnabled: document.getElementById("idleGateEnabled").checked,
    batteryAwareSyncEnabled: document.getElementById("batteryAwareSyncEnabled").checked
  };
}

function fillForm(settings) {
  document.getElementById("captureClicks").checked = settings.captureClicks;
  document.getElementById("captureInput").checked = settings.captureInput;
  document.getElementById("captureChange").checked = settings.captureChange;
  document.getElementById("captureSubmit").checked = settings.captureSubmit;
  document.getElementById("captureNavigation").checked = settings.captureNavigation;
  document.getElementById("captureScroll").checked = settings.captureScroll;
  document.getElementById("captureKeydown").checked = settings.captureKeydown;
  document.getElementById("captureMousemove").checked = settings.captureMousemove;
  document.getElementById("scrollThrottleMs").value = String(settings.scrollThrottleMs);
  document.getElementById("mousemoveThrottleMs").value = String(settings.mousemoveThrottleMs);
  document.getElementById("privacyEnabled").checked = settings.privacyEnabled;
  document.getElementById("serverUrl").value = settings.serverUrl;
  document.getElementById("authMode").value = settings.authMode;
  document.getElementById("apiKey").value = settings.apiKey;
  document.getElementById("syncBatchSize").value = String(settings.syncBatchSize);
  document.getElementById("backgroundSyncEnabled").checked = settings.backgroundSyncEnabled;
  document.getElementById("backgroundSyncIntervalMinutes").value = String(settings.backgroundSyncIntervalMinutes);
  document.getElementById("syncOnStartup").checked = settings.syncOnStartup;
  document.getElementById("maxConcurrentSessionSyncs").value = String(settings.maxConcurrentSessionSyncs);
  document.getElementById("syncBackoffEnabled").checked = settings.syncBackoffEnabled;
  document.getElementById("maxSyncBackoffMinutes").value = String(settings.maxSyncBackoffMinutes);
  document.getElementById("idleGateEnabled").checked = settings.idleGateEnabled;
  document.getElementById("batteryAwareSyncEnabled").checked = settings.batteryAwareSyncEnabled;
}

function setStatus(message, isError = false) {
  const element = document.getElementById("status");
  element.textContent = message;
  element.dataset.error = isError ? "true" : "false";
}

function updateAuthModeHint() {
  const authMode = document.getElementById("authMode").value;
  const apiKeyRow = document.getElementById("apiKeyRow");
  apiKeyRow.hidden = authMode !== "apiKey";
}

async function loadSettings() {
  const response = await sendMessage("getSettings");
  if (!response?.success) {
    fillForm(DEFAULT_SETTINGS);
    updateAuthModeHint();
    setStatus(response?.error || "加载设置失败。", true);
    return;
  }

  fillForm({ ...DEFAULT_SETTINGS, ...(response.settings || {}) });
  updateAuthModeHint();
  setStatus("");
}

document.getElementById("authMode").addEventListener("change", () => {
  updateAuthModeHint();
});

document.getElementById("saveBtn").addEventListener("click", async () => {
  const response = await sendMessage("saveSettings", getFormValues());
  if (!response?.success) {
    setStatus(response?.error || "保存设置失败。", true);
    return;
  }

  fillForm({ ...DEFAULT_SETTINGS, ...(response.settings || {}) });
  updateAuthModeHint();
  setStatus("设置已保存。");
});

document.getElementById("resetBtn").addEventListener("click", () => {
  fillForm(DEFAULT_SETTINGS);
  updateAuthModeHint();
  setStatus("已恢复为默认值，点击“保存设置”后生效。");
});

void loadSettings();
