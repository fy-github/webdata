import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

function getStorePath(dataDir) {
  return join(dataDir, "store.json");
}

function getAttachmentDir(dataDir) {
  return join(dataDir, "attachments");
}

function getAttachmentPath(dataDir, sessionId, actionId, mimeType = "image/jpeg") {
  const extension = mimeType.includes("png") ? "png" : "jpg";
  return join(getAttachmentDir(dataDir), sessionId, `${actionId}.${extension}`);
}

async function readStoreFile(dataDir) {
  const filePath = getStorePath(dataDir);

  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        sessions: {},
        actionsBySession: {}
      };
    }

    throw error;
  }
}

async function writeStoreFile(dataDir, store) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(getStorePath(dataDir), JSON.stringify(store, null, 2), "utf8");
}

function normalizeTags(tags) {
  return [...new Set((tags || []).map((tag) => String(tag).trim()).filter(Boolean))];
}

function buildSyncSummary(session = {}, actions = []) {
  const defaultSync = {
    enabled: true,
    pendingCount: 0,
    failedCount: 0,
    lastSyncedAt: null,
    lastError: ""
  };
  const summary = {
    ...defaultSync,
    ...(session.sync || {})
  };
  const syncActions = actions.filter((action) => action?.sync);

  if (!syncActions.length) {
    return summary;
  }

  let pendingCount = 0;
  let failedCount = 0;
  let lastSyncedAt = null;
  let lastFailure = null;

  for (const action of syncActions) {
    if (action.sync.status === "pending") {
      pendingCount += 1;
    }

    if (action.sync.status === "failed") {
      failedCount += 1;
      if (!lastFailure || (action.sync.lastAttemptAt || 0) >= (lastFailure.lastAttemptAt || 0)) {
        lastFailure = {
          lastAttemptAt: action.sync.lastAttemptAt || null,
          lastError: action.sync.lastError || ""
        };
      }
    }

    if (action.sync.status === "synced" && action.sync.lastAttemptAt != null) {
      lastSyncedAt = Math.max(lastSyncedAt || 0, action.sync.lastAttemptAt);
    }
  }

  return {
    ...summary,
    pendingCount,
    failedCount,
    lastSyncedAt,
    lastError: lastFailure?.lastError || ""
  };
}

function enrichSession(session = {}, actions = []) {
  return {
    ...session,
    actionCount: typeof session.actionCount === "number" ? session.actionCount : actions.length,
    tags: normalizeTags(session.tags),
    sync: buildSyncSummary(session, actions),
    management: {
      createdAt: session.management?.createdAt || session.startedAt || Date.now(),
      updatedAt: session.management?.updatedAt || session.endedAt || session.startedAt || Date.now()
    }
  };
}

function getSortedActions(actions = []) {
  return [...actions].sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0));
}

function matchSession(session, query) {
  const keyword = String(query.q || "").trim().toLowerCase();
  const tag = String(query.tag || "").trim().toLowerCase();
  const status = String(query.status || "").trim().toLowerCase();
  const dateFrom = query.dateFrom ? Number(query.dateFrom) : null;
  const dateTo = query.dateTo ? Number(query.dateTo) : null;

  if (keyword) {
    const haystack = [session.sessionId, session.lastUrl, ...(session.tags || [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(keyword)) {
      return false;
    }
  }

  if (tag && !(session.tags || []).some((item) => item.toLowerCase() === tag)) {
    return false;
  }

  if (status && String(session.status || "").toLowerCase() !== status) {
    return false;
  }

  if (dateFrom && (session.startedAt || 0) < dateFrom) {
    return false;
  }

  if (dateTo && (session.startedAt || 0) > dateTo) {
    return false;
  }

  return true;
}

function paginate(items, page = 1, pageSize = 20) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Number(pageSize) || 20);
  const start = (safePage - 1) * safePageSize;

  return {
    total: items.length,
    page: safePage,
    pageSize: safePageSize,
    sessions: items.slice(start, start + safePageSize)
  };
}

function updateSessionFromActions(session, actions) {
  const sortedActions = getSortedActions(actions);
  const lastAction = sortedActions[sortedActions.length - 1] || null;

  return enrichSession({
    ...session,
    actionCount: sortedActions.length,
    endedAt: lastAction?.timestamp || session.startedAt || session.endedAt,
    lastUrl: lastAction?.page?.url || session.lastUrl || ""
  }, sortedActions);
}

export function createRepository({ dataDir }) {
  return {
    async saveBatch({ session, actions }) {
      const store = await readStoreFile(dataDir);
      const existingSession = store.sessions[session.sessionId] || {};
      const existingActions = store.actionsBySession[session.sessionId] || [];
      const actionMap = new Map(existingActions.map((action) => [action.id, action]));

      for (const action of actions) {
        actionMap.set(action.id, action);
      }

      const mergedActions = getSortedActions(Array.from(actionMap.values()));
      store.sessions[session.sessionId] = updateSessionFromActions({
        ...existingSession,
        ...session,
        tags: existingSession.tags || session.tags || [],
        management: {
          createdAt: existingSession.management?.createdAt || session.startedAt || Date.now(),
          updatedAt: Date.now()
        }
      }, mergedActions);
      store.actionsBySession[session.sessionId] = mergedActions;

      await writeStoreFile(dataDir, store);
      return {
        acceptedActionIds: actions.map((action) => action.id)
      };
    },

    async listSessions(query = {}) {
      const store = await readStoreFile(dataDir);
      const sessions = Object.values(store.sessions)
        .map((session) => enrichSession(session, store.actionsBySession[session.sessionId] || []))
        .filter((session) => matchSession(session, query))
        .sort((left, right) => (right.startedAt || 0) - (left.startedAt || 0));

      return paginate(sessions, query.page, query.pageSize);
    },

    async getSession(sessionId) {
      const store = await readStoreFile(dataDir);
      const actions = getSortedActions(store.actionsBySession[sessionId] || []);
      const session = store.sessions[sessionId] ? enrichSession(store.sessions[sessionId], actions) : null;

      return {
        session,
        actions
      };
    },

    async listTags() {
      const store = await readStoreFile(dataDir);
      const tags = new Set();

      for (const session of Object.values(store.sessions)) {
        for (const tag of normalizeTags(session.tags)) {
          tags.add(tag);
        }
      }

      return Array.from(tags).sort();
    },

    async updateSessionTags(sessionId, tags) {
      const store = await readStoreFile(dataDir);
      if (!store.sessions[sessionId]) {
        return null;
      }

      store.sessions[sessionId] = enrichSession({
        ...store.sessions[sessionId],
        tags: normalizeTags(tags),
        management: {
          ...(store.sessions[sessionId].management || {}),
          updatedAt: Date.now()
        }
      }, store.actionsBySession[sessionId] || []);

      await writeStoreFile(dataDir, store);
      return store.sessions[sessionId];
    },

    async deleteSession(sessionId) {
      const store = await readStoreFile(dataDir);
      const existed = Boolean(store.sessions[sessionId]);

      delete store.sessions[sessionId];
      delete store.actionsBySession[sessionId];
      await writeStoreFile(dataDir, store);

      return { deleted: existed };
    },

    async deleteAction(actionId) {
      const store = await readStoreFile(dataDir);

      for (const [sessionId, actions] of Object.entries(store.actionsBySession)) {
        const nextActions = actions.filter((action) => action.id !== actionId);
        if (nextActions.length !== actions.length) {
          store.actionsBySession[sessionId] = nextActions;
          store.sessions[sessionId] = updateSessionFromActions(store.sessions[sessionId], nextActions);
          await writeStoreFile(dataDir, store);
          return { deleted: true, sessionId };
        }
      }

      return { deleted: false, sessionId: null };
    },

    async bulkDeleteSessions(sessionIds) {
      let deletedCount = 0;
      for (const sessionId of sessionIds || []) {
        const result = await this.deleteSession(sessionId);
        if (result.deleted) {
          deletedCount += 1;
        }
      }

      return { deletedCount };
    },

    async bulkTagSessions(sessionIds, tags) {
      let updatedCount = 0;
      for (const sessionId of sessionIds || []) {
        const updated = await this.updateSessionTags(sessionId, tags);
        if (updated) {
          updatedCount += 1;
        }
      }

      return { updatedCount };
    },

    async exportSessions(sessionIds) {
      const exportedAt = Date.now();
      const sessions = [];

      for (const sessionId of sessionIds || []) {
        const record = await this.getSession(sessionId);
        if (record.session) {
          sessions.push({
            ...record.session,
            actions: record.actions
          });
        }
      }

      return {
        exportedAt,
        sessionCount: sessions.length,
        sessions
      };
    },

    async saveScreenshotAttachment(sessionId, actionId, attachment = {}) {
      const store = await readStoreFile(dataDir);
      const actions = store.actionsBySession[sessionId] || [];
      const action = actions.find((item) => item.id === actionId);

      if (!action) {
        return null;
      }

      const match = String(attachment.dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        throw new Error("Invalid attachment payload");
      }

      const [, mimeType, base64] = match;
      const buffer = Buffer.from(base64, "base64");
      const filePath = getAttachmentPath(dataDir, sessionId, actionId, mimeType);
      await mkdir(join(getAttachmentDir(dataDir), sessionId), { recursive: true });
      await writeFile(filePath, buffer);

      action.attachment ||= {};
      action.attachment.screenshot ||= {};
      action.attachment.screenshot.remoteStatus = "uploaded";
      action.attachment.screenshot.remoteUrl = `/api/attachments/${sessionId}/${actionId}`;
      action.attachment.screenshot.remoteUploadedAt = Date.now();
      action.attachment.screenshot.remoteMimeType = mimeType;
      store.sessions[sessionId] = updateSessionFromActions(store.sessions[sessionId], actions);
      await writeStoreFile(dataDir, store);

      return {
        uploaded: true,
        remoteUrl: action.attachment.screenshot.remoteUrl,
        uploadedAt: action.attachment.screenshot.remoteUploadedAt
      };
    },

    async getScreenshotAttachment(sessionId, actionId) {
      const store = await readStoreFile(dataDir);
      const action = (store.actionsBySession[sessionId] || []).find((item) => item.id === actionId);
      const mimeType = action?.attachment?.screenshot?.remoteMimeType || "image/jpeg";
      const filePath = getAttachmentPath(dataDir, sessionId, actionId, mimeType);

      try {
        const content = await readFile(filePath);
        return {
          content,
          mimeType
        };
      } catch (error) {
        if (error.code === "ENOENT") {
          return null;
        }

        throw error;
      }
    }
  };
}
