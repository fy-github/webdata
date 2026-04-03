import { createDomSnapshotDefault } from "./attachment-defaults.js";
import { sanitizeValue } from "./privacy.js";

function cleanText(value, maxLength = 160) {
  if (!value) {
    return "";
  }

  return String(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function buildSnapshotNode(target = {}, privacyEnabled = true) {
  const sanitizedValue = sanitizeValue({
    value: target.value || target.text || "",
    target,
    privacyEnabled
  });

  const hasValue = Boolean(target.value || target.text);

  return {
    tagName: target.tagName || "",
    id: target.id || "",
    name: target.name || "",
    type: target.type || "",
    selector: target.selector || "",
    text: cleanText(target.text || ""),
    value: hasValue ? sanitizedValue.value : "",
    valueLength: hasValue ? sanitizedValue.valueLength : 0
  };
}

function buildPreview(node) {
  return cleanText([
    node.tagName,
    node.selector,
    node.text,
    node.value
  ].filter(Boolean).join(" "));
}

export function buildDomSnapshot({
  target = {},
  privacyEnabled = true,
  timestamp = Date.now()
} = {}) {
  const root = buildSnapshotNode(target, privacyEnabled);

  return createDomSnapshotDefault({
    status: "ready",
    capturedAt: timestamp,
    privacyMode: privacyEnabled ? "masked" : "raw",
    root,
    preview: buildPreview(root)
  });
}
