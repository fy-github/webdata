import express from "express";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildAgentExportArchive,
  buildAgentExportBundle,
  buildBulkAgentExportArchive
} from "./agent-export/export-service.js";
import { createApiAuthMiddleware, sendApiError } from "./api-response.js";
import { buildRawExportArchive, buildRawExportBundle } from "./raw-export/export-service.js";
import { createRepository } from "./repository.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "public");
const defaultDashboardTemplatePath = join(__dirname, "views", "dashboard.html");
const packageVersion = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")).version;

function renderDashboardHtml(templatePath, dashboardConfig = {}) {
  return readFileSync(templatePath, "utf8")
    .replace("__INITIAL_SESSION_ID__", JSON.stringify(dashboardConfig.initialSessionId || ""))
    .replace("__AUTH_MODE__", JSON.stringify(dashboardConfig.authMode || "none"))
    .replace("__API_KEY__", JSON.stringify(dashboardConfig.apiKey || ""));
}

export function createApp(config) {
  const app = express();
  const repository = createRepository(config);
  const apiAuthMiddleware = createApiAuthMiddleware(config);
  const dashboardTemplatePath = config.dashboardTemplatePath || defaultDashboardTemplatePath;

  app.use(express.json({ limit: "2mb" }));
  app.use("/dashboard-assets", express.static(publicDir));
  app.use("/api", apiAuthMiddleware);

  app.get("/health", (request, response) => {
    response.json({
      ok: true,
      authMode: config.authMode,
      version: packageVersion,
      features: {
        agentExport: true
      }
    });
  });

  app.get("/dashboard", (request, response) => {
    response.type("html").send(renderDashboardHtml(dashboardTemplatePath, {
      initialSessionId: "",
      authMode: config.authMode,
      apiKey: config.authMode === "apiKey" ? config.apiKey : ""
    }));
  });

  app.get("/dashboard/session/:sessionId", (request, response) => {
    response.type("html").send(renderDashboardHtml(dashboardTemplatePath, {
      initialSessionId: request.params.sessionId,
      authMode: config.authMode,
      apiKey: config.authMode === "apiKey" ? config.apiKey : ""
    }));
  });

  app.post("/api/actions/batch", async (request, response) => {
    const { session, actions } = request.body || {};

    if (!session?.sessionId || !Array.isArray(actions)) {
      sendApiError(response, 400, "invalid_payload", "Invalid batch payload");
      return;
    }

    const result = await repository.saveBatch({ session, actions });

    response.json({
      acceptedActionIds: result.acceptedActionIds
    });
  });

  app.get("/api/tags", async (request, response) => {
    const tags = await repository.listTags();
    response.json({ tags });
  });

  app.post("/api/sessions/bulk/tags", async (request, response) => {
    const { sessionIds, tags } = request.body || {};
    if (!Array.isArray(sessionIds) || !Array.isArray(tags)) {
      sendApiError(response, 400, "invalid_payload", "Invalid bulk tag payload");
      return;
    }

    response.json(await repository.bulkTagSessions(sessionIds, tags));
  });

  app.post("/api/sessions/bulk/export", async (request, response) => {
    const { sessionIds } = request.body || {};
    if (!Array.isArray(sessionIds)) {
      sendApiError(response, 400, "invalid_payload", "Invalid bulk export payload");
      return;
    }

    response.json(await repository.exportSessions(sessionIds));
  });

  app.post("/api/sessions/bulk/export-agent", async (request, response) => {
    const { sessionIds } = request.body || {};
    if (!Array.isArray(sessionIds)) {
      sendApiError(response, 400, "invalid_payload", "Invalid bulk export payload");
      return;
    }

    const records = [];
    for (const sessionId of sessionIds) {
      const record = await repository.getSession(sessionId);
      if (record.session) {
        records.push(record);
      }
    }

    const archive = buildBulkAgentExportArchive(records);
    response
      .set("Content-Type", "application/zip")
      .set("Content-Disposition", `attachment; filename="agent-export-bulk-${Date.now()}.zip"`)
      .send(archive);
  });

  app.post("/api/sessions/bulk/delete", async (request, response) => {
    const { sessionIds } = request.body || {};
    if (!Array.isArray(sessionIds)) {
      sendApiError(response, 400, "invalid_payload", "Invalid bulk delete payload");
      return;
    }

    response.json(await repository.bulkDeleteSessions(sessionIds));
  });

  app.get("/api/sessions", async (request, response) => {
    const result = await repository.listSessions(request.query || {});
    response.json(result);
  });

  app.patch("/api/sessions/:sessionId/tags", async (request, response) => {
    if (!Array.isArray(request.body?.tags)) {
      sendApiError(response, 400, "invalid_payload", "Invalid tags payload");
      return;
    }

    const session = await repository.updateSessionTags(request.params.sessionId, request.body.tags);
    if (!session) {
      sendApiError(response, 404, "not_found", "Session not found");
      return;
    }

    response.json({ session });
  });

  app.delete("/api/sessions/:sessionId", async (request, response) => {
    const result = await repository.deleteSession(request.params.sessionId);
    if (!result.deleted) {
      sendApiError(response, 404, "not_found", "Session not found");
      return;
    }

    response.json(result);
  });

  app.get("/api/sessions/:sessionId", async (request, response) => {
    const record = await repository.getSession(request.params.sessionId);

    if (!record.session) {
      sendApiError(response, 404, "not_found", "Session not found");
      return;
    }

    response.json(record);
  });

  app.post("/api/sessions/:sessionId/actions/:actionId/attachments/screenshot", async (request, response) => {
    if (!request.body?.attachment?.dataUrl) {
      sendApiError(response, 400, "invalid_payload", "Invalid attachment payload");
      return;
    }

    const result = await repository.saveScreenshotAttachment(
      request.params.sessionId,
      request.params.actionId,
      request.body.attachment
    );

    if (!result) {
      sendApiError(response, 404, "not_found", "Action not found");
      return;
    }

    response.json(result);
  });

  app.get("/api/attachments/:sessionId/:actionId", async (request, response) => {
    const attachment = await repository.getScreenshotAttachment(
      request.params.sessionId,
      request.params.actionId
    );

    if (!attachment) {
      sendApiError(response, 404, "not_found", "Attachment not found");
      return;
    }

    response
      .set("Content-Type", attachment.mimeType)
      .send(attachment.content);
  });

  app.get("/api/sessions/:sessionId/export", async (request, response) => {
    const record = await repository.getSession(request.params.sessionId);

    if (!record.session) {
      sendApiError(response, 404, "not_found", "Session not found");
      return;
    }

    const format = String(request.query.format || "json").toLowerCase();
    const exportType = String(request.query.type || "").toLowerCase();

    if (exportType !== "agent") {
      if (format === "json") {
        response.json(buildRawExportBundle(record));
        return;
      }

      if (format === "zip") {
        const archive = await buildRawExportArchive(repository, record);
        response
          .set("Content-Type", "application/zip")
          .set("Content-Disposition", `attachment; filename="${record.session.sessionId}-export.zip"`)
          .send(archive);
        return;
      }

      sendApiError(response, 400, "unsupported_format", "Unsupported export format");
      return;
    }

    if (format === "json") {
      response.json(buildAgentExportBundle(record));
      return;
    }

    if (format === "zip") {
      const archive = buildAgentExportArchive(record);
      response
        .set("Content-Type", "application/zip")
        .set("Content-Disposition", `attachment; filename="${record.session.sessionId}-agent-export.zip"`)
        .send(archive);
      return;
    }

    sendApiError(response, 400, "unsupported_format", "Unsupported export format");
  });

  app.delete("/api/actions/:actionId", async (request, response) => {
    const result = await repository.deleteAction(request.params.actionId);
    if (!result.deleted) {
      sendApiError(response, 404, "not_found", "Action not found");
      return;
    }

    response.json(result);
  });

  return app;
}
