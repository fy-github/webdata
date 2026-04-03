function normalizeTimestamp(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
}

function buildKeywordHaystack(action = {}) {
  const fields = [
    action.target?.selector,
    action.target?.tagName,
    action.target?.id,
    action.target?.className,
    action.target?.name,
    action.target?.placeholder,
    action.target?.ariaLabel,
    action.target?.text,
    action.page?.url,
    action.page?.title,
    action.payload?.value,
    action.payload?.key
  ];

  return fields
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join(" ");
}

function createSummary(actions = []) {
  const summary = {
    totalActions: actions.length,
    syncStatusCounts: {
      pending: 0,
      failed: 0,
      synced: 0
    },
    eventTypeCounts: {}
  };

  for (const action of actions) {
    const status = action.sync?.status || "";
    const type = action.type || "unknown";

    if (Object.hasOwn(summary.syncStatusCounts, status)) {
      summary.syncStatusCounts[status] += 1;
    }

    summary.eventTypeCounts[type] = (summary.eventTypeCounts[type] || 0) + 1;
  }

  return summary;
}

export function normalizeRecordFilters(filters = {}, { currentSessionId = "" } = {}) {
  return {
    sessionId: String(filters.sessionId || currentSessionId || "").trim(),
    eventType: String(filters.eventType || "").trim(),
    syncStatus: String(filters.syncStatus || "").trim(),
    dateFrom: normalizeTimestamp(filters.dateFrom),
    dateTo: normalizeTimestamp(filters.dateTo),
    keyword: String(filters.keyword || "").trim().toLowerCase()
  };
}

function matchesFilters(action, query) {
  if (query.eventType && action.type !== query.eventType) {
    return false;
  }

  if (query.syncStatus && action.sync?.status !== query.syncStatus) {
    return false;
  }

  if (query.dateFrom && action.timestamp < query.dateFrom) {
    return false;
  }

  if (query.dateTo && action.timestamp > query.dateTo) {
    return false;
  }

  if (query.keyword && !buildKeywordHaystack(action).includes(query.keyword)) {
    return false;
  }

  return true;
}

export function queryRecordsState({
  state,
  filters = {}
}) {
  const query = normalizeRecordFilters(filters, {
    currentSessionId: state?.currentSessionId || ""
  });
  const sessions = Object.values(state?.sessions || {}).sort((left, right) => right.startedAt - left.startedAt);
  const sessionIds = query.sessionId ? [query.sessionId] : sessions.map((session) => session.sessionId);
  const actions = sessionIds
    .flatMap((sessionId) => state?.actionsBySession?.[sessionId] || [])
    .filter((action) => matchesFilters(action, query))
    .sort((left, right) => right.timestamp - left.timestamp);

  return {
    sessions,
    actions,
    summary: createSummary(actions),
    query,
    currentSessionId: state?.currentSessionId || ""
  };
}
