function getHeader(headers, name) {
  if (!headers) {
    return "";
  }

  if (typeof headers.get === "function") {
    return headers.get(name) || "";
  }

  if (typeof headers[name] === "string") {
    return headers[name];
  }

  if (typeof headers[name.toLowerCase()] === "string") {
    return headers[name.toLowerCase()];
  }

  if (typeof headers.entries === "function") {
    for (const [key, value] of headers.entries()) {
      if (String(key).toLowerCase() === name.toLowerCase()) {
        return value;
      }
    }
  }

  return "";
}

function parseFilename(contentDisposition, fallbackName) {
  const match = String(contentDisposition || "").match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallbackName;
}

function buildAcceptHeader(format) {
  return format === "zip" ? "application/zip" : "application/json";
}

function encodeBase64FromBytes(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function toDownloadUrl(file) {
  if (file.mimeType.includes("json")) {
    return `data:${file.mimeType};base64,${encodeBase64FromBytes(
      new TextEncoder().encode(JSON.stringify(file.data, null, 2))
    )}`;
  }

  return `data:${file.mimeType};base64,${encodeBase64FromBytes(file.data)}`;
}

export function buildAgentExportRequest(settings, { sessionId, format = "json" }) {
  const baseUrl = String(settings.serverUrl || "").replace(/\/+$/, "");
  const normalizedFormat = format === "zip" ? "zip" : "json";
  const headers = {
    Accept: buildAcceptHeader(normalizedFormat)
  };

  if (settings.authMode === "apiKey" && settings.apiKey) {
    headers["X-API-Key"] = settings.apiKey;
  }

  return {
    url: `${baseUrl}/api/sessions/${sessionId}/export?format=${normalizedFormat}&type=agent`,
    headers,
    format: normalizedFormat
  };
}

async function buildResponseError(response) {
  let details = "";
  const contentType = getHeader(response.headers, "content-type");
  if (typeof response.text === "function") {
    details = await response.text();
  }

  if (
    contentType.includes("text/html")
    && /Cannot GET\s+\/api\/sessions\/.+\/export/i.test(details)
  ) {
    return new Error("Server does not support agent export. Restart the latest server.");
  }

  if (details) {
    try {
      const payload = JSON.parse(details);
      if (payload?.error) {
        return new Error(payload.error);
      }
    } catch {
      return new Error(details);
    }
  }

  return new Error(`HTTP ${response.status}`);
}

export async function exportAgentSession({
  settings,
  sessionId,
  format = "json",
  runSyncImpl = async () => ({ skipped: true, syncedCount: 0, failedCount: 0 }),
  fetchImpl = fetch
}) {
  if (!settings?.serverUrl) {
    throw new Error("请先在设置中配置服务端地址");
  }

  if (!sessionId) {
    throw new Error("当前没有可导出的会话");
  }

  const syncResult = await runSyncImpl();
  if ((syncResult?.failedCount || 0) > 0) {
    const suffix = syncResult?.error ? `：${syncResult.error}` : "";
    throw new Error(`同步失败，仍有 ${syncResult.failedCount} 条记录未同步${suffix}`);
  }

  const request = buildAgentExportRequest(settings, { sessionId, format });
  const response = await fetchImpl(request.url, {
    method: "GET",
    headers: request.headers
  });

  if (!response.ok) {
    throw await buildResponseError(response);
  }

  if (request.format === "zip") {
    return {
      filename: parseFilename(
        getHeader(response.headers, "content-disposition"),
        `${sessionId}-agent-export.zip`
      ),
      mimeType: getHeader(response.headers, "content-type") || "application/zip",
      data: new Uint8Array(await response.arrayBuffer())
    };
  }

  return {
    filename: `${sessionId}-agent.json`,
    mimeType: getHeader(response.headers, "content-type") || "application/json",
    data: await response.json()
  };
}

export async function downloadAgentExport({
  settings,
  sessionId,
  format = "json",
  runSyncImpl,
  fetchImpl,
  downloadImpl
}) {
  const file = await exportAgentSession({
    settings,
    sessionId,
    format,
    runSyncImpl,
    fetchImpl
  });

  const url = toDownloadUrl(file);
  const downloadId = await downloadImpl({
    url,
    filename: file.filename,
    saveAs: true
  });

  return {
    downloadId,
    filename: file.filename
  };
}
