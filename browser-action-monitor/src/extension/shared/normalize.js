import { sanitizeValue } from "./privacy.js";
import { createAttachmentDefault } from "./attachment-defaults.js";
import { buildDomSnapshot } from "./dom-snapshot.js";

function generateId(prefix = "act") {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function cleanText(value, maxLength = 120) {
  if (!value) {
    return "";
  }

  return String(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeTarget(target = {}) {
  return {
    tagName: target.tagName || "",
    id: target.id || "",
    className: target.className || "",
    name: target.name || "",
    type: target.type || "",
    placeholder: target.placeholder || "",
    ariaLabel: target.ariaLabel || "",
    text: cleanText(target.text || target.textContent),
    selector: target.selector || "",
    bounds: target.bounds || null
  };
}

function normalizePayload(eventType, payload = {}, target = {}, privacyEnabled = true) {
  if (eventType === "input" || eventType === "change") {
    const sanitized = sanitizeValue({
      value: payload.value,
      target,
      privacyEnabled
    });

    return {
      value: sanitized.value,
      valueLength: sanitized.valueLength
    };
  }

  if (eventType === "keydown") {
    const sanitized = sanitizeValue({
      value: payload.key,
      target,
      privacyEnabled
    });

    return {
      key: sanitized.value,
      keyLength: sanitized.valueLength
    };
  }

  return {
    ...payload
  };
}

function buildPrivacy(eventType, payload = {}, target = {}, privacyEnabled = true) {
  if (eventType !== "input" && eventType !== "change" && eventType !== "keydown") {
    return {
      enabled: privacyEnabled,
      masked: false,
      reason: ""
    };
  }

  const sourceValue = eventType === "keydown" ? payload.key : payload.value;
  const sanitized = sanitizeValue({
    value: sourceValue,
    target,
    privacyEnabled
  });

  return {
    enabled: privacyEnabled,
    masked: sanitized.masked,
    reason: sanitized.reason
  };
}

function resolveDisabledScreenshotStatus(mode = "") {
  if (mode === "disabled_manual") {
    return "disabled_manual";
  }

  if (mode === "failed_privacy_guard") {
    return "failed_privacy_guard";
  }

  return "disabled_auto_quota";
}

function createScreenshotAttachmentState({
  screenshotPolicy = {},
  privacyEnabled = true
} = {}) {
  if (screenshotPolicy.enabled) {
    return {
      status: "pending",
      privacyMode: privacyEnabled ? "masked" : "raw",
      error: ""
    };
  }

  return {
    status: resolveDisabledScreenshotStatus(screenshotPolicy.mode),
    privacyMode: privacyEnabled ? "masked" : "raw",
    error: screenshotPolicy.reason || screenshotPolicy.mode || ""
  };
}

function createAttachment(rawAction, target, privacyEnabled, attachmentPolicy = {}) {
  const domSnapshotPolicy = attachmentPolicy.domSnapshots || {
    enabled: true,
    mode: "enabled",
    reason: ""
  };
  const screenshotPolicy = attachmentPolicy.screenshots || {
    enabled: true,
    mode: "enabled",
    reason: ""
  };

  if (!domSnapshotPolicy.enabled) {
    return createAttachmentDefault({
      domSnapshot: {
        status: domSnapshotPolicy.mode === "disabled_manual" ? "disabled_manual" : "disabled_auto_quota",
        capturedAt: rawAction.timestamp || Date.now(),
        privacyMode: privacyEnabled ? "masked" : "raw",
        root: null,
        preview: domSnapshotPolicy.reason || ""
      },
      screenshot: createScreenshotAttachmentState({
        screenshotPolicy,
        privacyEnabled
      })
    });
  }

  const domSnapshot = buildDomSnapshot({
    target: {
      ...target,
      value: rawAction.payload?.value || ""
    },
    privacyEnabled,
    timestamp: rawAction.timestamp || Date.now()
  });

  return createAttachmentDefault({
    domSnapshot,
    screenshot: createScreenshotAttachmentState({
      screenshotPolicy,
      privacyEnabled
    })
  });
}

export function normalizeAction(rawAction, {
  sessionId,
  privacyEnabled = true,
  attachmentPolicy = {}
}) {
  const eventType = rawAction.eventType || rawAction.type || "unknown";
  const target = normalizeTarget(rawAction.target);

  return {
    id: rawAction.id || generateId("act"),
    sessionId,
    type: eventType,
    timestamp: rawAction.timestamp || Date.now(),
    page: {
      url: rawAction.page?.url || rawAction.url || "",
      title: rawAction.page?.title || ""
    },
    target,
    payload: normalizePayload(eventType, rawAction.payload || {}, target, privacyEnabled),
    privacy: buildPrivacy(eventType, rawAction.payload || {}, target, privacyEnabled),
    attachment: createAttachment(rawAction, target, privacyEnabled, attachmentPolicy),
    sync: {
      status: "pending",
      attempts: 0,
      lastAttemptAt: null,
      lastError: ""
    }
  };
}
