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

function formatDate(timestamp) {
  return timestamp ? new Date(timestamp).toLocaleString() : "-";
}

function setFeedback(message, isError = false) {
  const feedback = document.getElementById("feedback");
  feedback.textContent = message;
  feedback.style.color = isError ? "#ef4444" : "#64748b";
}

function formatStorageInMb(bytes) {
  const value = Number(bytes) || 0;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function runWithButtonState(button, pendingMessage, action) {
  const previousDisabled = button.disabled;
  button.disabled = true;
  setFeedback(pendingMessage);

  try {
    return await action();
  } finally {
    button.disabled = previousDisabled;
  }
}

function resolveAttachmentEnabled(settingValue, runtimeMode) {
  if (runtimeMode === "enabled") {
    return true;
  }

  if (runtimeMode === "disabled") {
    return false;
  }

  return settingValue !== false;
}

function renderStatusChip(label, isEnabled) {
  const stateLabel = isEnabled ? "开启" : "关闭";
  const dotClass = isEnabled ? "status-dot is-on" : "status-dot is-off";
  return `<span class="status-chip"><span class="${dotClass}"></span>${escapeHtml(label)} ${stateLabel}</span>`;
}

function renderMetricChip(label, value) {
  return `<span class="status-chip metric">${escapeHtml(label)} ${escapeHtml(value)}</span>`;
}

function renderAttachmentStatus(settings = {}, stats = {}) {
  const health = stats.attachments?.health || {};
  const domEnabled = resolveAttachmentEnabled(
    settings.captureDomSnapshots,
    stats.attachments?.domSnapshots?.mode
  );
  const screenshotEnabled = resolveAttachmentEnabled(
    settings.captureScreenshots,
    stats.attachments?.screenshots?.mode
  );

  document.getElementById("attachmentStatus").innerHTML = [
    renderStatusChip("DOM", domEnabled),
    renderStatusChip("截图", screenshotEnabled),
    renderMetricChip("队列", String(health.screenshotQueueSize || 0)),
    renderMetricChip("存储", formatStorageInMb(health.screenshotStorageBytes))
  ].join("");
}

function updateView(stats = {}, settings = {}) {
  document.getElementById("sessionId").textContent = stats.sessionId || "-";
  document.getElementById("actionCount").textContent = String(stats.actionCount || 0);
  document.getElementById("startedAt").textContent = formatDate(stats.startedAt);
  document.getElementById("syncSummary").textContent = stats.sync?.enabled
    ? `待同步 ${stats.sync.pendingCount} / 失败 ${stats.sync.failedCount}`
    : "仅本地模式";

  const isRecording = stats.isRecording !== false;
  document.getElementById("statusText").textContent = isRecording ? "记录中" : "已暂停";
  document.getElementById("statusDot").className = isRecording ? "dot" : "dot paused";
  document.getElementById("syncBadge").textContent = stats.sync?.enabled ? "远程同步已启用" : "仅本地模式";
  document.getElementById("startBtn").disabled = isRecording;
  document.getElementById("pauseBtn").disabled = !isRecording;
  renderAttachmentStatus(settings, stats);
}

async function refreshStats(preserveFeedback = false) {
  const settingsResponse = await sendMessage("getSettings");
  if (!settingsResponse?.success) {
    setFeedback(settingsResponse?.error || "读取设置失败", true);
    return;
  }

  const statsResponse = await sendMessage("getStats");
  if (!statsResponse?.success) {
    setFeedback(statsResponse?.error || "刷新状态失败", true);
    return;
  }

  updateView(statsResponse.stats, settingsResponse.settings);
  if (!preserveFeedback) {
    setFeedback("");
  }
}

async function exportData() {
  const response = await sendMessage("exportData");
  if (!response?.success) {
    setFeedback(response?.error || "导出失败", true);
    return false;
  }

  downloadBlob(
    `browser-actions-${response.data.sessionId}.json`,
    new Blob([JSON.stringify(response.data, null, 2)], { type: "application/json" })
  );
  setFeedback("本地 JSON 已导出");
  return true;
}

async function exportAgentData(format) {
  const response = await sendMessage("exportAgentData", { format });
  if (!response?.success) {
    setFeedback(response?.error || "Agent 导出失败", true);
    return false;
  }

  setFeedback(`Agent ${format.toUpperCase()} 已开始下载`);
  return true;
}

document.getElementById("startBtn").addEventListener("click", async (event) => {
  await runWithButtonState(event.currentTarget, "正在开始记录...", async () => {
    const response = await sendMessage("startRecording");
    if (!response?.success) {
      setFeedback(response?.error || "开始记录失败", true);
      return;
    }

    setFeedback("已开始记录");
    await refreshStats(true);
  });
});

document.getElementById("pauseBtn").addEventListener("click", async (event) => {
  await runWithButtonState(event.currentTarget, "正在暂停记录...", async () => {
    const response = await sendMessage("pauseRecording");
    if (!response?.success) {
      setFeedback(response?.error || "暂停记录失败", true);
      return;
    }

    setFeedback("已暂停记录");
    await refreshStats(true);
  });
});

document.getElementById("recordsBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("records.html") });
  setFeedback("已打开记录页");
});

document.getElementById("settingsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  setFeedback("已打开设置页");
});

document.getElementById("exportBtn").addEventListener("click", (event) => {
  void runWithButtonState(event.currentTarget, "正在导出本地 JSON...", async () => {
    await exportData();
  });
});

document.getElementById("exportAgentJsonBtn").addEventListener("click", (event) => {
  void runWithButtonState(event.currentTarget, "正在同步并导出 Agent JSON...", async () => {
    await exportAgentData("json");
    await refreshStats(true);
  });
});

document.getElementById("exportAgentZipBtn").addEventListener("click", (event) => {
  void runWithButtonState(event.currentTarget, "正在同步并导出 Agent ZIP...", async () => {
    await exportAgentData("zip");
    await refreshStats(true);
  });
});

document.getElementById("retrySyncBtn").addEventListener("click", async (event) => {
  await runWithButtonState(event.currentTarget, "正在同步到服务端...", async () => {
    const response = await sendMessage("retrySync");
    if (!response?.success) {
      setFeedback(response?.error || "同步失败", true);
      await refreshStats(true);
      return;
    }

    if (response.result?.skipped) {
      setFeedback("当前无需同步，或尚未配置服务端");
    } else if (response.result?.failedCount) {
      const suffix = response.result.error ? `：${response.result.error}` : "";
      setFeedback(`同步失败 ${response.result.failedCount} 条${suffix}`, true);
    } else {
      setFeedback(`同步完成，已上传 ${response.result.syncedCount} 条`);
    }

    await refreshStats(true);
  });
});

document.getElementById("newSessionBtn").addEventListener("click", async (event) => {
  await runWithButtonState(event.currentTarget, "正在创建新会话...", async () => {
    const response = await sendMessage("initSession");
    if (!response?.success) {
      setFeedback(response?.error || "创建新会话失败", true);
      return;
    }

    setFeedback("已创建新会话");
    await refreshStats(true);
  });
});

document.getElementById("clearBtn").addEventListener("click", async (event) => {
  if (!window.confirm("确认清空所有本地记录吗？此操作不可恢复。")) {
    return;
  }

  await runWithButtonState(event.currentTarget, "正在清空本地数据...", async () => {
    const response = await sendMessage("clearData");
    if (!response?.success) {
      setFeedback(response?.error || "清空数据失败", true);
      return;
    }

    setFeedback("本地数据已清空");
    await refreshStats(true);
  });
});

void refreshStats();
