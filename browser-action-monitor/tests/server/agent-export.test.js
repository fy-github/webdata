import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentExportBundle, buildBulkAgentExportArchive } from "../../server/agent-export/export-service.js";

function createSession(sessionId = "ses_agent") {
  return {
    sessionId,
    startedAt: 100,
    endedAt: 140,
    status: "completed",
    actionCount: 5,
    lastUrl: "https://example.com/dashboard",
    tags: ["training"],
    sync: {
      enabled: true,
      pendingCount: 0,
      failedCount: 0,
      lastSyncedAt: 140,
      lastError: ""
    }
  };
}

function createActions(sessionId = "ses_agent") {
  return [
    {
      id: "act_nav",
      sessionId,
      type: "navigation",
      timestamp: 100,
      page: { url: "https://example.com/login", title: "Login" },
      target: { selector: "" },
      payload: {},
      privacy: { enabled: true, masked: false, reason: "" },
      sync: { status: "synced", attempts: 1, lastAttemptAt: 100, lastError: "" }
    },
    {
      id: "act_email_input",
      sessionId,
      type: "input",
      timestamp: 110,
      page: { url: "https://example.com/login", title: "Login" },
      target: { selector: "input[name=email]", name: "email", type: "email" },
      payload: { value: "agent@example.com", valueLength: 17 },
      privacy: { enabled: false, masked: false, reason: "" },
      sync: { status: "synced", attempts: 1, lastAttemptAt: 110, lastError: "" }
    },
    {
      id: "act_email_change",
      sessionId,
      type: "change",
      timestamp: 111,
      page: { url: "https://example.com/login", title: "Login" },
      target: { selector: "input[name=email]", name: "email", type: "email" },
      payload: { value: "agent@example.com", valueLength: 17 },
      privacy: { enabled: false, masked: false, reason: "" },
      sync: { status: "synced", attempts: 1, lastAttemptAt: 111, lastError: "" }
    },
    {
      id: "act_submit_click",
      sessionId,
      type: "click",
      timestamp: 120,
      page: { url: "https://example.com/login", title: "Login" },
      target: { selector: "button[type=submit]", text: "Sign in" },
      payload: { clientX: 10, clientY: 20 },
      privacy: { enabled: true, masked: false, reason: "" },
      sync: { status: "synced", attempts: 1, lastAttemptAt: 120, lastError: "" }
    },
    {
      id: "act_post_submit_nav",
      sessionId,
      type: "navigation",
      timestamp: 140,
      page: { url: "https://example.com/dashboard", title: "Dashboard" },
      target: { selector: "" },
      payload: {},
      privacy: { enabled: true, masked: false, reason: "" },
      sync: { status: "synced", attempts: 1, lastAttemptAt: 140, lastError: "" }
    }
  ];
}

test("agent export bundle includes raw steps, Playwright variants, and summary tasks", () => {
  const bundle = buildAgentExportBundle({
    session: createSession(),
    actions: createActions()
  });

  assert.equal(bundle.meta.version, "v1");
  assert.equal(bundle.session.sessionId, "ses_agent");
  assert.equal(bundle.rawSteps[0].type, "navigate");
  assert.equal(bundle.rawSteps[1].sourceActionId, "act_email_input");
  assert.equal(bundle.playwright.rawLikeSteps[0].command, "goto");
  assert.equal(bundle.playwright.executableSteps[1].command, "fill");
  assert.equal(bundle.playwright.executableSteps[1].confidence, "high");
  assert.match(bundle.playwright.script, /page\.goto/);
  assert.match(bundle.playwright.script, /locator\("input\[name=email\]"\)\.fill/);
  assert.ok(bundle.summary.tasks.some((task) => task.type === "form_fill"));
  assert.ok(bundle.summary.tasks.some((task) => task.type === "page_visit"));
});

test("agent export merges adjacent input and change actions into one executable fill step", () => {
  const bundle = buildAgentExportBundle({
    session: createSession(),
    actions: createActions()
  });

  const fillSteps = bundle.playwright.executableSteps.filter((step) => step.command === "fill");
  assert.equal(fillSteps.length, 1);
  assert.equal(fillSteps[0].selector, "input[name=email]");
  assert.equal(fillSteps[0].value, "agent@example.com");
  assert.deepEqual(fillSteps[0].sourceActionIds, ["act_email_input", "act_email_change"]);
});

test("bulk agent export archive creates one folder per session with expected files", () => {
  const archive = buildBulkAgentExportArchive([
    {
      session: createSession("ses_one"),
      actions: createActions("ses_one")
    },
    {
      session: createSession("ses_two"),
      actions: createActions("ses_two")
    }
  ]);

  const archiveText = archive.toString("utf8");
  assert.match(archiveText, /ses_one\/manifest\.json/);
  assert.match(archiveText, /ses_one\/playwright\.json/);
  assert.match(archiveText, /ses_two\/summary\.json/);
});
