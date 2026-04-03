import { SENSITIVE_FIELD_HINTS } from "./constants.js";

function hasSensitiveHint(value) {
  if (!value) {
    return false;
  }

  const normalized = String(value).toLowerCase();
  return SENSITIVE_FIELD_HINTS.some((hint) => normalized.includes(hint));
}

function isSensitiveTarget(target = {}) {
  if (target.type && String(target.type).toLowerCase() === "password") {
    return true;
  }

  return [target.name, target.id, target.placeholder, target.ariaLabel].some(hasSensitiveHint);
}

export function sanitizeValue({ value, target = {}, privacyEnabled }) {
  const stringValue = value == null ? "" : String(value);

  if (!privacyEnabled) {
    return {
      value: stringValue,
      valueLength: stringValue.length,
      masked: false,
      reason: ""
    };
  }

  if (!stringValue) {
    return {
      value: "",
      valueLength: 0,
      masked: false,
      reason: ""
    };
  }

  if (isSensitiveTarget(target)) {
    return {
      value: "[masked]",
      valueLength: stringValue.length,
      masked: true,
      reason: "sensitive-field"
    };
  }

  return {
    value: "[masked]",
    valueLength: stringValue.length,
    masked: true,
    reason: "privacy-enabled"
  };
}
