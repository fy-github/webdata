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

function renderAttachmentStatus(stats = {}) {
  const domMode = stats.attachments?.domSnapshots?.mode || "enabled";
  const domReason = stats.attachments?.domSnapshots?.reason || "";
  const screenshotMode = stats.attachments?.screenshots?.mode || "enabled";
  const screenshotReason = stats.attachments?.screenshots?.reason || "";
  const health = stats.attachments?.health || {};

  document.getElementById("attachmentStatus").textContent = [
    `DOM: ${domMode}${domReason ? ` (${domReason})` : ""}`,
    `截图: ${screenshotMode}${screenshotReason ? ` (${screenshotReason})` : ""}`,
    `队列 ${health.screenshotQueueSize || 0}`,
    `存储 ${formatStorageInMb(health.screenshotStorageBytes)}`
  ].join(" | ");
}

async function refreshAttachmentToggles() {
  const response = await sendMessage("getSettings");
  if (!response?.success) {
    setFeedback(response?.error || "读取设置失败", true);
    return;
  }

  document.getElementById("domSnapshotsToggle").checked = response.settings.captureDomSnapshots !== false;
  document.getElementById("screenshotsToggle").checked = response.settings.captureScreenshots !== false;
}

async function saveAttachmentSettings(patch) {
  const current = await sendMessage("getSettings");
  if (!current?.success) {
    setFeedback(current?.error || "读取设置失败", true);
    return false;
  }

  const response = await sendMessage("saveSettings", {
    ...current.settings,
    ...patch
  });

  if (!response?.success) {
    setFeedback(response?.error || "保存设置失败", true);
    return false;
  }

  return true;
}

function updateView(stats) {
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
  renderAttachmentStatus(stats);
}

async function refreshStats(preserveFeedback = false) {
  await refreshAttachmentToggles();

  const response = await sendMessage("getStats");
  if (!response?.success) {
    setFeedback(response?.error || "刷新状态失败", true);
    return;
  }

  updateView(response.stats);
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

document.getElementById("domSnapshotsToggle").addEventListener("change", async (event) => {
  const toggle = event.currentTarget;
  const nextChecked = toggle.checked;
  const success = await saveAttachmentSettings({
    captureDomSnapshots: nextChecked
  });
  if (!success) {
    toggle.checked = !nextChecked;
    return;
  }

  setFeedback(`DOM 快照已${nextChecked ? "开启" : "关闭"}`);
  await refreshStats(true);
});

document.getElementById("screenshotsToggle").addEventListener("change", async (event) => {
  const toggle = event.currentTarget;
  const nextChecked = toggle.checked;
  const success = await saveAttachmentSettings({
    captureScreenshots: nextChecked
  });
  if (!success) {
    toggle.checked = !nextChecked;
    return;
  }

  setFeedback(`动作截图已${nextChecked ? "开启" : "关闭"}`);
  await refreshStats(true);
});

void refreshStats();
