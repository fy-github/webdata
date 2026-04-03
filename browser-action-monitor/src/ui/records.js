function sendMessage(action, extra = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action, ...extra }, (response) => resolve(response));
  });
}

function formatDate(timestamp) {
  return timestamp ? new Date(timestamp).toLocaleString() : "-";
}

function getFilters() {
  return {
    sessionId: document.getElementById("sessionFilter").value,
    eventType: document.getElementById("typeFilter").value,
    syncStatus: document.getElementById("syncStatusFilter").value,
    dateFrom: document.getElementById("dateFromFilter").value.trim(),
    dateTo: document.getElementById("dateToFilter").value.trim(),
    keyword: document.getElementById("keywordFilter").value.trim()
  };
}

function applyNormalizedQuery(query = {}) {
  document.getElementById("sessionFilter").value = query.sessionId || "";
  document.getElementById("typeFilter").value = query.eventType || "";
  document.getElementById("syncStatusFilter").value = query.syncStatus || "";
  document.getElementById("dateFromFilter").value = query.dateFrom ? String(query.dateFrom) : "";
  document.getElementById("dateToFilter").value = query.dateTo ? String(query.dateTo) : "";
  document.getElementById("keywordFilter").value = query.keyword || "";
}

function renderSessions(sessions, currentSessionId, query = {}) {
  const select = document.getElementById("sessionFilter");
  const selected = query.sessionId || select.value || "";

  select.innerHTML = [`<option value="">当前会话 (${currentSessionId || "-"})</option>`]
    .concat(
      sessions.map((session) => (
        `<option value="${session.sessionId}">${session.sessionId} (${session.actionCount})</option>`
      ))
    )
    .join("");

  select.value = selected;
}

function formatSummaryEventMeta(eventTypeCounts = {}) {
  const pairs = Object.entries(eventTypeCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3);

  if (pairs.length === 0) {
    return "当前筛选下没有动作类型统计";
  }

  return pairs.map(([type, count]) => `${type}: ${count}`).join(" | ");
}

function renderSummary(summary = {}) {
  document.getElementById("summaryTotal").textContent = String(summary.totalActions || 0);
  document.getElementById("summaryPending").textContent = String(summary.syncStatusCounts?.pending || 0);
  document.getElementById("summaryFailed").textContent = String(summary.syncStatusCounts?.failed || 0);
  document.getElementById("summarySynced").textContent = String(summary.syncStatusCounts?.synced || 0);
  document.getElementById("summaryEventMeta").textContent = formatSummaryEventMeta(summary.eventTypeCounts || {});
}

function buildTargetSummary(action) {
  return action.target?.selector || action.target?.text || action.target?.tagName || "-";
}

function buildPayloadSummary(action) {
  return action.payload?.value || action.payload?.key || action.page?.url || "-";
}

function buildStatusPill(status = "") {
  const safeStatus = status || "unknown";
  const className = safeStatus === "pending"
    ? "status-pill status-pending"
    : safeStatus === "failed"
      ? "status-pill status-failed"
      : safeStatus === "synced"
        ? "status-pill status-synced"
        : "status-pill";

  return `<span class="${className}">${safeStatus}</span>`;
}

function buildAttachmentSummary(action = {}) {
  const domStatus = action.attachment?.domSnapshot?.status || "none";
  const screenshotStatus = action.attachment?.screenshot?.status || "none";
  if (domStatus === "ready" && screenshotStatus === "ready") {
    return "DOM + SHOT";
  }
  if (domStatus === "ready") {
    return "DOM";
  }
  if (screenshotStatus === "ready") {
    return "SHOT";
  }
  return screenshotStatus !== "none" ? screenshotStatus : domStatus;
}

function renderAttachmentDetail(action = {}) {
  const dom = action.attachment?.domSnapshot;
  const screenshot = action.attachment?.screenshot;

  document.getElementById("attachmentSummary").textContent = [
    `DOM: ${dom?.status || "none"}`,
    dom?.preview ? `预览: ${dom.preview}` : "",
    `截图: ${screenshot?.status || "none"}`,
    screenshot?.error ? `原因: ${screenshot.error}` : ""
  ].filter(Boolean).join(" | ");
}

async function loadAttachmentPreview(action = {}) {
  const preview = document.getElementById("attachmentPreview");
  const empty = document.getElementById("attachmentPreviewEmpty");

  preview.hidden = true;
  preview.removeAttribute("src");
  empty.hidden = false;
  empty.textContent = "当前记录没有可展示的截图。";

  if (!action.attachment?.screenshot?.storageKey) {
    return;
  }

  const response = await sendMessage("getActionAttachmentPreview", {
    data: {
      actionId: action.id
    }
  });

  if (!response?.success || !response.attachment?.dataUrl) {
    empty.textContent = "截图尚未就绪或读取失败。";
    return;
  }

  preview.src = response.attachment.dataUrl;
  preview.hidden = false;
  empty.hidden = true;
}

function renderEmptyState(message) {
  const body = document.getElementById("recordsBody");
  body.innerHTML = `<tr><td colspan="6" class="empty">${message}</td></tr>`;
}

function renderRecords(actions) {
  const body = document.getElementById("recordsBody");
  if (!actions.length) {
    renderEmptyState("当前筛选条件下没有记录。");
    return;
  }

  body.innerHTML = actions.map((action, index) => `
    <tr data-index="${index}">
      <td>${formatDate(action.timestamp)}</td>
      <td>${action.type}</td>
      <td>${buildTargetSummary(action)}</td>
      <td>${buildPayloadSummary(action)}</td>
      <td><span class="attachment-pill">${buildAttachmentSummary(action)}</span></td>
      <td>${buildStatusPill(action.sync?.status)}</td>
    </tr>
  `).join("");

  body.querySelectorAll("tr[data-index]").forEach((row) => {
    row.addEventListener("click", async () => {
      body.querySelectorAll("tr[data-index]").forEach((entry) => entry.classList.remove("active"));
      row.classList.add("active");
      const action = actions[Number(row.dataset.index)];
      renderAttachmentDetail(action);
      await loadAttachmentPreview(action);
      document.getElementById("recordDetail").textContent = JSON.stringify(action, null, 2);
    });
  });
}

function renderError(errorMessage) {
  renderEmptyState("读取记录失败。");
  document.getElementById("attachmentSummary").textContent = "附件状态读取失败。";
  document.getElementById("recordDetail").textContent = errorMessage || "读取记录失败。";
  renderSummary({
    totalActions: 0,
    syncStatusCounts: { pending: 0, failed: 0, synced: 0 },
    eventTypeCounts: {}
  });
}

async function refresh() {
  const response = await sendMessage("getRecords", {
    filters: getFilters()
  });

  if (!response?.success) {
    renderError(response?.error);
    return;
  }

  renderSessions(response.sessions || [], response.currentSessionId, response.query || {});
  applyNormalizedQuery(response.query || {});
  renderSummary(response.summary || {});
  renderRecords(response.actions || []);

  if (!response.actions?.length) {
    document.getElementById("attachmentSummary").textContent = "当前没有可展示的附件信息。";
    document.getElementById("recordDetail").textContent = "当前没有可展示的记录详情。";
  }
}

function resetFilters() {
  document.getElementById("sessionFilter").value = "";
  document.getElementById("typeFilter").value = "";
  document.getElementById("syncStatusFilter").value = "";
  document.getElementById("dateFromFilter").value = "";
  document.getElementById("dateToFilter").value = "";
  document.getElementById("keywordFilter").value = "";
}

let keywordDebounceTimer = null;

function scheduleKeywordRefresh() {
  clearTimeout(keywordDebounceTimer);
  keywordDebounceTimer = setTimeout(() => {
    void refresh();
  }, 220);
}

document.getElementById("refreshBtn").addEventListener("click", () => void refresh());
document.getElementById("resetBtn").addEventListener("click", () => {
  resetFilters();
  void refresh();
});
document.getElementById("sessionFilter").addEventListener("change", () => void refresh());
document.getElementById("typeFilter").addEventListener("change", () => void refresh());
document.getElementById("syncStatusFilter").addEventListener("change", () => void refresh());
document.getElementById("dateFromFilter").addEventListener("change", () => void refresh());
document.getElementById("dateToFilter").addEventListener("change", () => void refresh());
document.getElementById("keywordFilter").addEventListener("input", () => {
  scheduleKeywordRefresh();
});

void refresh();
