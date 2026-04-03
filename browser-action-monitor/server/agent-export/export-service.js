import { createZip } from "./archive.js";
import { buildPlaywrightBundle } from "./playwright-exporter.js";
import { buildRawSteps } from "./raw-exporter.js";
import { buildSummaryBundle } from "./summary-exporter.js";

function buildMeta(session, actions) {
  return {
    version: "v1",
    exportedAt: Date.now(),
    source: "browser-action-monitor",
    format: "agent-json",
    privacyEnabled: actions.some((action) => action.privacy?.enabled)
      ? actions.every((action) => action.privacy?.enabled)
      : Boolean(session.sync?.enabled)
  };
}

function normalizeSession(session) {
  return {
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    lastUrl: session.lastUrl || "",
    tags: session.tags || [],
    status: session.status || "completed"
  };
}

function createAgentExportRecord(record) {
  const actions = [...(record.actions || [])].sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0));
  const session = normalizeSession(record.session);
  const rawSteps = buildRawSteps(actions);
  const playwright = buildPlaywrightBundle(actions);
  const summary = buildSummaryBundle(actions);

  return {
    meta: buildMeta(record.session, actions),
    session,
    rawSteps,
    playwright,
    summary
  };
}

export function buildAgentExportBundle(record) {
  return createAgentExportRecord(record);
}

export function buildAgentExportArchive(record) {
  const bundle = createAgentExportRecord(record);
  const entries = [
    {
      name: "manifest.json",
      content: JSON.stringify({
        meta: bundle.meta,
        session: bundle.session,
        files: ["raw-steps.json", "playwright.json", "summary.json"]
      }, null, 2)
    },
    {
      name: "raw-steps.json",
      content: JSON.stringify(bundle.rawSteps, null, 2)
    },
    {
      name: "playwright.json",
      content: JSON.stringify(bundle.playwright, null, 2)
    },
    {
      name: "summary.json",
      content: JSON.stringify(bundle.summary, null, 2)
    }
  ];

  return createZip(entries);
}

export function buildBulkAgentExportArchive(records = []) {
  const entries = [];

  for (const record of records) {
    const bundle = createAgentExportRecord(record);
    const folder = `${bundle.session.sessionId}/`;

    entries.push({
      name: `${folder}manifest.json`,
      content: JSON.stringify({
        meta: bundle.meta,
        session: bundle.session,
        files: ["raw-steps.json", "playwright.json", "summary.json"]
      }, null, 2)
    });
    entries.push({
      name: `${folder}raw-steps.json`,
      content: JSON.stringify(bundle.rawSteps, null, 2)
    });
    entries.push({
      name: `${folder}playwright.json`,
      content: JSON.stringify(bundle.playwright, null, 2)
    });
    entries.push({
      name: `${folder}summary.json`,
      content: JSON.stringify(bundle.summary, null, 2)
    });
  }

  return createZip(entries);
}
