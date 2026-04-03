import test from "node:test";
import assert from "node:assert/strict";

import {
  createInitialState,
  createSession
} from "../../src/extension/background/session-store.js";
import {
  normalizeRecordFilters,
  queryRecordsState
} from "../../src/extension/background/records-query.js";

function createAction({
  id,
  sessionId,
  timestamp,
  type,
  status,
  selector = "",
  tagName = "",
  text = "",
  url = "",
  title = "",
  value = "",
  key = ""
}) {
  return {
    id,
    sessionId,
    timestamp,
    type,
    page: {
      url,
      title
    },
    target: {
      selector,
      tagName,
      id: "",
      className: "",
      name: "",
      placeholder: "",
      ariaLabel: "",
      text
    },
    payload: {
      value,
      key
    },
    sync: {
      status,
      attempts: 0,
      lastAttemptAt: null,
      lastError: ""
    }
  };
}

function buildState() {
  const state = createInitialState();
  const now = 1711111111000;
  const current = createSession({ now });
  const other = createSession({ now: now + 1000 });

  state.currentSessionId = current.sessionId;
  state.sessions[current.sessionId] = current;
  state.sessions[other.sessionId] = other;
  state.actionsBySession[current.sessionId] = [
    createAction({
      id: "act_nav",
      sessionId: current.sessionId,
      timestamp: 1711111112000,
      type: "navigation",
      status: "synced",
      selector: "a.nav-link",
      tagName: "A",
      text: "Open console",
      url: "https://example.com/dashboard",
      title: "Dashboard"
    }),
    createAction({
      id: "act_input",
      sessionId: current.sessionId,
      timestamp: 1711111113000,
      type: "input",
      status: "pending",
      selector: "input[name='email']",
      tagName: "INPUT",
      text: "",
      url: "https://example.com/login",
      title: "Login",
      value: "alice@example.com"
    }),
    createAction({
      id: "act_click",
      sessionId: current.sessionId,
      timestamp: 1711111114000,
      type: "click",
      status: "failed",
      selector: "button[type='submit']",
      tagName: "BUTTON",
      text: "Submit form",
      url: "https://example.com/login",
      title: "Login"
    })
  ];
  state.actionsBySession[other.sessionId] = [
    createAction({
      id: "act_key",
      sessionId: other.sessionId,
      timestamp: 1711111115000,
      type: "keydown",
      status: "pending",
      selector: "body",
      tagName: "BODY",
      text: "",
      url: "https://example.com/editor",
      title: "Editor",
      key: "Escape"
    })
  ];

  state.sessions[current.sessionId].actionCount = state.actionsBySession[current.sessionId].length;
  state.sessions[current.sessionId].lastUrl = "https://example.com/login";
  state.sessions[other.sessionId].actionCount = state.actionsBySession[other.sessionId].length;
  state.sessions[other.sessionId].lastUrl = "https://example.com/editor";

  return state;
}

test("normalizeRecordFilters applies safe defaults and preserves current session fallback", () => {
  const normalized = normalizeRecordFilters({}, {
    currentSessionId: "ses_current"
  });

  assert.deepEqual(normalized, {
    sessionId: "ses_current",
    eventType: "",
    syncStatus: "",
    dateFrom: null,
    dateTo: null,
    keyword: ""
  });
});

test("queryRecordsState filters by date range and sync status", () => {
  const state = buildState();

  const result = queryRecordsState({
    state,
    filters: {
      sessionId: state.currentSessionId,
      syncStatus: "pending",
      dateFrom: 1711111112500,
      dateTo: 1711111113500
    }
  });

  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].id, "act_input");
  assert.equal(result.summary.totalActions, 1);
  assert.equal(result.summary.syncStatusCounts.pending, 1);
});

test("queryRecordsState matches keyword across readable action fields", () => {
  const state = buildState();

  const selectorMatch = queryRecordsState({
    state,
    filters: {
      sessionId: state.currentSessionId,
      keyword: "submit"
    }
  });
  const payloadMatch = queryRecordsState({
    state,
    filters: {
      sessionId: state.currentSessionId,
      keyword: "alice@example.com"
    }
  });
  const urlMatch = queryRecordsState({
    state,
    filters: {
      sessionId: state.currentSessionId,
      keyword: "dashboard"
    }
  });

  assert.deepEqual(selectorMatch.actions.map((action) => action.id), ["act_click"]);
  assert.deepEqual(payloadMatch.actions.map((action) => action.id), ["act_input"]);
  assert.deepEqual(urlMatch.actions.map((action) => action.id), ["act_nav"]);
});

test("queryRecordsState composes filters and generates summary counts", () => {
  const state = buildState();
  const otherSessionId = Object.keys(state.sessions).find((sessionId) => sessionId !== state.currentSessionId);

  const result = queryRecordsState({
    state,
    filters: {
      sessionId: otherSessionId,
      eventType: "keydown",
      syncStatus: "pending",
      keyword: "escape"
    }
  });

  assert.deepEqual(result.actions.map((action) => action.id), ["act_key"]);
  assert.equal(result.summary.totalActions, 1);
  assert.equal(result.summary.syncStatusCounts.pending, 1);
  assert.equal(result.summary.syncStatusCounts.failed, 0);
  assert.equal(result.summary.eventTypeCounts.keydown, 1);
  assert.equal(result.query.keyword, "escape");
});

test("queryRecordsState keeps sessions in the response and echoes the normalized query", () => {
  const state = buildState();

  const result = queryRecordsState({
    state,
    filters: {
      sessionId: state.currentSessionId,
      eventType: "scroll"
    }
  });

  assert.equal(result.sessions.length, 2);
  assert.equal(result.actions.length, 0);
  assert.equal(result.currentSessionId, state.currentSessionId);
  assert.equal(result.query.sessionId, state.currentSessionId);
  assert.equal(result.query.eventType, "scroll");
});
