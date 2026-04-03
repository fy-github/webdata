import { clearFeedbackBar, updateFeedbackBar } from "./dashboard-feedback.js";

const state = {
  filters: {
    q: "",
    tag: "",
    status: "",
    dateFrom: "",
    dateTo: "",
    page: 1,
    pageSize: 10
  },
  selectedSessionIds: new Set(),
  sessions: [],
  total: 0,
  currentSession: null,
  currentActionId: ""
};

function buildApiAuthHeaders() {
  if (window.DASHBOARD_CONFIG?.authMode !== "apiKey" || !window.DASHBOARD_CONFIG?.apiKey) {
    return {};
  }

  return {
    "X-API-Key": window.DASHBOARD_CONFIG.apiKey,
    Authorization: `Bearer ${window.DASHBOARD_CONFIG.apiKey}`
  };
}

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showFeedback(message, tone = "busy") {
  updateFeedbackBar(byId("feedbackBar"), message, tone);
}

function clearFeedback() {
  clearFeedbackBar(byId("feedbackBar"));
}

function extractErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("<!DOCTYPE")
    ? "Server returned HTML instead of the expected API payload."
    : message;
}

async function withButtonFeedback(button, pendingMessage, successMessage, action) {
  const previousText = button?.textContent || "";

  if (button) {
    button.disabled = true;
    button.classList.add("is-busy");
  }

  showFeedback(pendingMessage, "busy");

  try {
    const result = await action();
    if (successMessage) {
      showFeedback(successMessage, "success");
    } else {
      clearFeedback();
    }
    return result;
  } catch (error) {
    showFeedback(extractErrorMessage(error), "error");
    throw error;
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove("is-busy");
      button.textContent = previousText;
    }
  }
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...buildApiAuthHeaders(),
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

function buildQuery() {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(state.filters)) {
    if (value !== "" && value != null) {
      params.set(key, String(value));
    }
  }

  return params.toString();
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

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  downloadBlob(filename, blob);
}

function buildSessionExportUrl(sessionId, format, type = "") {
  const params = new URLSearchParams();
  params.set("format", format);
  if (type) {
    params.set("type", type);
  }
  return `/api/sessions/${sessionId}/export?${params.toString()}`;
}

function parseFilename(response, fallbackName) {
  const contentDisposition = response.headers.get("content-disposition") || "";
  const match = contentDisposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallbackName;
}

async function downloadExportArtifact(url, options = {}, fallbackName = "export.json") {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...buildApiAuthHeaders(),
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }

  const blob = await response.blob();
  downloadBlob(parseFilename(response, fallbackName), blob);
}

function formatDate(timestamp) {
  return timestamp ? new Date(timestamp).toLocaleString() : "-";
}

function renderTags(tags = []) {
  if (!tags.length) {
    return '<span class="muted">No tags</span>';
  }

  return tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
}

function renderStatus(status = "") {
  const safeStatus = status || "unknown";
  const className = safeStatus === "failed"
    ? "status-pill status-failed"
    : safeStatus === "pending"
      ? "status-pill status-pending"
      : "status-pill";

  return `<span class="${className}">${escapeHtml(safeStatus)}</span>`;
}

function getCurrentAction() {
  if (!state.currentSession || !state.currentActionId) {
    return null;
  }

  return state.currentSession.actions.find((action) => action.id === state.currentActionId) || null;
}

function buildActionAttachmentSummary(action = {}) {
  const domStatus = action.attachment?.domSnapshot?.status || "none";
  const screenshot = action.attachment?.screenshot || {};
  const screenshotStatus = screenshot.remoteStatus || screenshot.status || "none";

  return [
    { label: `DOM ${domStatus}`, tone: domStatus },
    { label: `Shot ${screenshotStatus}`, tone: screenshotStatus }
  ];
}

function renderAttachmentIndicators(action = {}) {
  return `<div class="attachment-indicators">${buildActionAttachmentSummary(action)
    .map((item) => `<span class="attachment-chip is-${escapeHtml(item.tone)}">${escapeHtml(item.label)}</span>`)
    .join("")}</div>`;
}

function describeScreenshot(action = {}) {
  const screenshot = action.attachment?.screenshot || {};
  const effectiveStatus = screenshot.remoteStatus || screenshot.status || "none";
  const details = [`Screenshot status: ${effectiveStatus}`];

  if (screenshot.remoteStatus) {
    details.push(`Remote sync: ${screenshot.remoteStatus}`);
  }
  if (screenshot.error) {
    details.push(`Capture error: ${screenshot.error}`);
  }
  if (screenshot.remoteError) {
    details.push(`Upload error: ${screenshot.remoteError}`);
  }
  if (screenshot.remoteUploadedAt) {
    details.push(`Uploaded: ${formatDate(screenshot.remoteUploadedAt)}`);
  }
  if (screenshot.width && screenshot.height) {
    details.push(`Size: ${screenshot.width}x${screenshot.height}`);
  }

  return details.join(" | ");
}

function renderAttachmentDetail(action = {}) {
  const attachmentSummary = byId("attachmentSummary");
  const domSnapshot = action.attachment?.domSnapshot || {};

  if (!action.id) {
    attachmentSummary.textContent = "Select an action to inspect DOM snapshot and screenshot status.";
    return;
  }

  const domParts = [
    `DOM status: ${domSnapshot.status || "none"}`,
    domSnapshot.privacyMode ? `DOM privacy: ${domSnapshot.privacyMode}` : "",
    domSnapshot.preview ? `DOM preview: ${domSnapshot.preview}` : ""
  ].filter(Boolean);

  attachmentSummary.innerHTML = `
    <div>${escapeHtml(domParts.join(" | "))}</div>
    <div>${escapeHtml(describeScreenshot(action))}</div>
  `;
}

function renderAttachmentPreview(action = {}) {
  const preview = byId("attachmentPreview");
  const empty = byId("attachmentPreviewEmpty");
  const screenshot = action.attachment?.screenshot || {};
  const remoteUrl = screenshot.remoteUrl || "";
  const domPreview = action.attachment?.domSnapshot?.preview || "";
  const screenshotStatus = screenshot.remoteStatus || screenshot.status || "none";

  preview.hidden = true;
  preview.removeAttribute("src");
  empty.hidden = false;

  if (remoteUrl) {
    preview.src = remoteUrl;
    preview.hidden = false;
    empty.hidden = true;
    return;
  }

  if (screenshotStatus === "failed_privacy_guard") {
    empty.textContent = "Screenshot was blocked by privacy guard. DOM snapshot remains available as fallback evidence.";
    return;
  }

  if (domPreview) {
    empty.textContent = `No remote screenshot preview. DOM fallback: ${domPreview}`;
    return;
  }

  empty.textContent = `No remote screenshot preview for this action. Current status: ${screenshotStatus}.`;
}

function renderActionJson(action = null) {
  byId("actionDetail").textContent = action
    ? JSON.stringify(action, null, 2)
    : "Select an action to inspect its normalized payload.";
}

function updateSelectedActionUI() {
  const currentAction = getCurrentAction();
  renderAttachmentDetail(currentAction || {});
  renderAttachmentPreview(currentAction || {});
  renderActionJson(currentAction);

  document.querySelectorAll("[data-action-id]").forEach((element) => {
    if (element.classList.contains("action-item")) {
      element.classList.toggle("is-selected", element.dataset.actionId === state.currentActionId);
    }
  });
}

function selectAction(actionId) {
  state.currentActionId = actionId || "";
  updateSelectedActionUI();
}

function buildDrawerMeta(session = {}) {
  return [
    `Started: ${formatDate(session.startedAt)}`,
    `Ended: ${formatDate(session.endedAt)}`,
    `Actions: ${session.actionCount ?? 0}`,
    `Last URL: ${session.lastUrl || "-"}`,
    `Tags: ${(session.tags || []).join(", ") || "-"}`,
    `Pending sync: ${session.sync?.pendingCount ?? 0}`,
    `Failed sync: ${session.sync?.failedCount ?? 0}`
  ].map((line) => `<div>${escapeHtml(line)}</div>`).join("");
}

function renderActionList() {
  const list = byId("actionsList");
  const actions = state.currentSession?.actions || [];

  if (!actions.length) {
    list.innerHTML = '<div class="muted">This session has no actions.</div>';
    renderAttachmentDetail({});
    renderAttachmentPreview({});
    renderActionJson(null);
    return;
  }

  list.innerHTML = actions.map((action) => `
    <div class="action-item" data-action-id="${escapeHtml(action.id)}">
      <header>
        <strong>${escapeHtml(action.type || "unknown")}</strong>
        <span class="muted">${escapeHtml(formatDate(action.timestamp))}</span>
      </header>
      <div class="muted action-target" title="${escapeHtml(action.target?.selector || action.page?.url || "-")}">
        ${escapeHtml(action.target?.selector || action.page?.url || "-")}
      </div>
      ${renderAttachmentIndicators(action)}
      <div class="action-row-actions">
        <button data-role="view-action" data-action-id="${escapeHtml(action.id)}" type="button">Inspect</button>
        <button class="danger" data-role="delete-action" data-action-id="${escapeHtml(action.id)}" type="button">Delete</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll('button[data-role="view-action"]').forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      selectAction(button.dataset.actionId);
      showFeedback(`Loaded action ${button.dataset.actionId}`, "success");
    });
  });

  list.querySelectorAll('button[data-role="delete-action"]').forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!window.confirm("Delete this action from the session?")) {
        return;
      }

      await withButtonFeedback(button, "Deleting action...", "Action deleted.", async () => {
        await request(`/api/actions/${button.dataset.actionId}`, { method: "DELETE" });
        await openSession(state.currentSession.session.sessionId);
        await loadSessions();
      });
    });
  });

  list.querySelectorAll(".action-item").forEach((item) => {
    item.addEventListener("click", () => {
      selectAction(item.dataset.actionId);
    });
  });
}

function renderDrawer() {
  const drawer = byId("drawer");

  if (!state.currentSession) {
    drawer.classList.add("hidden");
    return;
  }

  drawer.classList.remove("hidden");
  byId("drawerTitle").textContent = state.currentSession.session.sessionId;
  byId("drawerMeta").innerHTML = buildDrawerMeta(state.currentSession.session);
  byId("tagEditorInput").value = (state.currentSession.session.tags || []).join(", ");

  renderActionList();

  if (!state.currentActionId && state.currentSession.actions.length) {
    state.currentActionId = state.currentSession.actions[0].id;
  }

  updateSelectedActionUI();
  history.replaceState({}, "", `/dashboard/session/${state.currentSession.session.sessionId}`);
}

function updateBatchBar() {
  const count = state.selectedSessionIds.size;
  byId("selectedCount").textContent = `Selected ${count} session${count === 1 ? "" : "s"}`;
  byId("batchBar").classList.toggle("hidden", count === 0);
  byId("selectAllCheckbox").checked = count > 0 && count === state.sessions.length;
}

function renderSessions() {
  const body = byId("sessionsBody");

  if (!state.sessions.length) {
    body.innerHTML = '<tr><td colspan="7" class="muted">No sessions matched the current filters.</td></tr>';
    updateBatchBar();
    return;
  }

  body.innerHTML = state.sessions.map((session) => `
    <tr data-session-id="${escapeHtml(session.sessionId)}">
      <td><input type="checkbox" data-role="select-row" data-session-id="${escapeHtml(session.sessionId)}" ${state.selectedSessionIds.has(session.sessionId) ? "checked" : ""}></td>
      <td><span class="session-id-text" title="${escapeHtml(session.sessionId)}">${escapeHtml(session.sessionId)}</span></td>
      <td><span class="session-time">${escapeHtml(formatDate(session.startedAt))}</span></td>
      <td><span class="session-count">${escapeHtml(String(session.actionCount ?? 0))}</span></td>
      <td><div class="session-tag-list">${renderTags(session.tags)}</div></td>
      <td>${renderStatus(session.status)}</td>
      <td><span class="session-url" title="${escapeHtml(session.lastUrl || "-")}">${escapeHtml(session.lastUrl || "-")}</span></td>
    </tr>
  `).join("");

  body.querySelectorAll('input[data-role="select-row"]').forEach((checkbox) => {
    checkbox.addEventListener("click", (event) => {
      event.stopPropagation();
      const { sessionId } = checkbox.dataset;
      if (checkbox.checked) {
        state.selectedSessionIds.add(sessionId);
      } else {
        state.selectedSessionIds.delete(sessionId);
      }
      updateBatchBar();
    });
  });

  body.querySelectorAll("tr[data-session-id]").forEach((row) => {
    row.addEventListener("click", () => {
      void openSession(row.dataset.sessionId);
    });
  });

  updateBatchBar();
}

function collectFiltersFromInputs() {
  state.filters.q = byId("searchInput").value.trim();
  state.filters.tag = byId("tagFilter").value;
  state.filters.status = byId("statusFilter").value;
  state.filters.dateFrom = byId("dateFromInput").value.trim();
  state.filters.dateTo = byId("dateToInput").value.trim();
  state.filters.page = 1;
}

function resetFilters() {
  byId("searchInput").value = "";
  byId("tagFilter").value = "";
  byId("statusFilter").value = "";
  byId("dateFromInput").value = "";
  byId("dateToInput").value = "";
  state.filters = {
    q: "",
    tag: "",
    status: "",
    dateFrom: "",
    dateTo: "",
    page: 1,
    pageSize: 10
  };
}

async function loadTags() {
  const data = await request("/api/tags");
  const select = byId("tagFilter");
  const current = select.value;
  select.innerHTML = `<option value="">All tags</option>${data.tags.map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join("")}`;
  select.value = current;
}

async function loadSessions() {
  const query = buildQuery();
  const data = await request(query ? `/api/sessions?${query}` : "/api/sessions");
  state.sessions = data.sessions;
  state.total = data.total;
  byId("paginationSummary").textContent = `Total ${data.total} sessions, page ${data.page}`;
  renderSessions();
}

async function openSession(sessionId) {
  showFeedback("Loading session detail...", "busy");
  const data = await request(`/api/sessions/${sessionId}`);
  state.currentSession = data;
  state.currentActionId = data.actions[0]?.id || "";
  renderDrawer();
  showFeedback(`Loaded session ${sessionId}`, "success");
}

async function applyFilters() {
  collectFiltersFromInputs();
  state.selectedSessionIds.clear();
  await loadSessions();
}

async function saveTags(button) {
  if (!state.currentSession) {
    return;
  }

  const tags = byId("tagEditorInput").value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  await withButtonFeedback(button, "Saving tags...", "Tags updated.", async () => {
    await request(`/api/sessions/${state.currentSession.session.sessionId}/tags`, {
      method: "PATCH",
      body: JSON.stringify({ tags })
    });
    await loadTags();
    await openSession(state.currentSession.session.sessionId);
    await loadSessions();
  });
}

async function exportCurrentSession(button) {
  if (!state.currentSession) {
    return;
  }

  const sessionId = state.currentSession.session.sessionId;
  const format = byId("exportFormatSelect").value;

  await withButtonFeedback(button, "Preparing export...", "Session export downloaded.", async () => {
    if (format === "plain-json") {
      const payload = await request(buildSessionExportUrl(sessionId, "json"));
      downloadJson(`${sessionId}.json`, payload);
      return;
    }

    if (format === "plain-zip") {
      await downloadExportArtifact(
        buildSessionExportUrl(sessionId, "zip"),
        {},
        `${sessionId}-export.zip`
      );
      return;
    }

    if (format === "agent-json") {
      const payload = await request(buildSessionExportUrl(sessionId, "json", "agent"));
      downloadJson(`${sessionId}-agent.json`, payload);
      return;
    }

    await downloadExportArtifact(
      buildSessionExportUrl(sessionId, "zip", "agent"),
      {},
      `${sessionId}-agent-export.zip`
    );
  });
}

async function deleteCurrentSession(button) {
  if (!state.currentSession || !window.confirm("Delete this session and all of its actions?")) {
    return;
  }

  await withButtonFeedback(button, "Deleting session...", "Session deleted.", async () => {
    await request(`/api/sessions/${state.currentSession.session.sessionId}`, { method: "DELETE" });
    state.currentSession = null;
    state.currentActionId = "";
    byId("drawer").classList.add("hidden");
    history.replaceState({}, "", "/dashboard");
    await loadTags();
    await loadSessions();
  });
}

async function batchTag(button) {
  const raw = window.prompt("Enter comma separated tags for the selected sessions:");
  if (raw == null) {
    return;
  }

  const tags = raw.split(",").map((tag) => tag.trim()).filter(Boolean);

  await withButtonFeedback(button, "Updating selected tags...", "Selected sessions updated.", async () => {
    await request("/api/sessions/bulk/tags", {
      method: "POST",
      body: JSON.stringify({ sessionIds: [...state.selectedSessionIds], tags })
    });
    await loadTags();
    await loadSessions();
    if (state.currentSession) {
      await openSession(state.currentSession.session.sessionId);
    }
  });
}

async function batchExport(button) {
  const format = byId("batchExportFormatSelect").value;
  const sessionIds = [...state.selectedSessionIds];

  await withButtonFeedback(button, "Preparing selected export...", "Selected export downloaded.", async () => {
    if (format === "plain-json") {
      const payload = await request("/api/sessions/bulk/export", {
        method: "POST",
        body: JSON.stringify({ sessionIds })
      });
      downloadJson(`sessions-export-${Date.now()}.json`, payload);
      return;
    }

    if (format === "agent-json" && sessionIds.length === 1) {
      const payload = await request(buildSessionExportUrl(sessionIds[0], "json", "agent"));
      downloadJson(`${sessionIds[0]}-agent.json`, payload);
      return;
    }

    await downloadExportArtifact("/api/sessions/bulk/export-agent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ sessionIds })
    }, `agent-export-bulk-${Date.now()}.zip`);
  });
}

async function batchDelete(button) {
  if (!window.confirm(`Delete ${state.selectedSessionIds.size} selected session(s)?`)) {
    return;
  }

  await withButtonFeedback(button, "Deleting selected sessions...", "Selected sessions deleted.", async () => {
    await request("/api/sessions/bulk/delete", {
      method: "POST",
      body: JSON.stringify({ sessionIds: [...state.selectedSessionIds] })
    });
    state.selectedSessionIds.clear();
    state.currentSession = null;
    state.currentActionId = "";
    byId("drawer").classList.add("hidden");
    history.replaceState({}, "", "/dashboard");
    await loadTags();
    await loadSessions();
  });
}

function bindEvents() {
  byId("applyFiltersButton").addEventListener("click", (event) => {
    void withButtonFeedback(event.currentTarget, "Applying filters...", "Filters applied.", applyFilters);
  });

  byId("resetFiltersButton").addEventListener("click", (event) => {
    void withButtonFeedback(event.currentTarget, "Resetting filters...", "Filters reset.", async () => {
      resetFilters();
      state.selectedSessionIds.clear();
      await loadSessions();
    });
  });

  byId("refreshButton").addEventListener("click", (event) => {
    void withButtonFeedback(event.currentTarget, "Refreshing dashboard...", "Dashboard refreshed.", async () => {
      await loadTags();
      await loadSessions();
      if (state.currentSession) {
        await openSession(state.currentSession.session.sessionId);
      }
    });
  });

  byId("closeDrawerButton").addEventListener("click", () => {
    state.currentSession = null;
    state.currentActionId = "";
    byId("drawer").classList.add("hidden");
    history.replaceState({}, "", "/dashboard");
    showFeedback("Closed session detail.", "success");
  });

  byId("saveTagsButton").addEventListener("click", (event) => {
    void saveTags(event.currentTarget);
  });
  byId("exportSessionButton").addEventListener("click", (event) => {
    void exportCurrentSession(event.currentTarget);
  });
  byId("deleteSessionButton").addEventListener("click", (event) => {
    void deleteCurrentSession(event.currentTarget);
  });
  byId("batchTagButton").addEventListener("click", (event) => {
    void batchTag(event.currentTarget);
  });
  byId("batchExportButton").addEventListener("click", (event) => {
    void batchExport(event.currentTarget);
  });
  byId("batchDeleteButton").addEventListener("click", (event) => {
    void batchDelete(event.currentTarget);
  });

  byId("prevPageButton").addEventListener("click", (event) => {
    void withButtonFeedback(event.currentTarget, "Loading previous page...", "Page updated.", async () => {
      state.filters.page = Math.max(1, state.filters.page - 1);
      await loadSessions();
    });
  });

  byId("nextPageButton").addEventListener("click", (event) => {
    void withButtonFeedback(event.currentTarget, "Loading next page...", "Page updated.", async () => {
      const maxPage = Math.max(1, Math.ceil(state.total / state.filters.pageSize));
      state.filters.page = Math.min(maxPage, state.filters.page + 1);
      await loadSessions();
    });
  });

  byId("selectAllCheckbox").addEventListener("click", (event) => {
    if (event.target.checked) {
      state.sessions.forEach((session) => state.selectedSessionIds.add(session.sessionId));
      showFeedback("Selected all visible sessions.", "success");
    } else {
      state.selectedSessionIds.clear();
      showFeedback("Cleared selected sessions.", "success");
    }
    renderSessions();
  });
}

async function bootstrap() {
  bindEvents();
  showFeedback("Loading dashboard...", "busy");
  await loadTags();
  await loadSessions();
  if (window.DASHBOARD_CONFIG.initialSessionId) {
    await openSession(window.DASHBOARD_CONFIG.initialSessionId);
  } else {
    showFeedback("Dashboard ready.", "success");
  }
}

void bootstrap();
