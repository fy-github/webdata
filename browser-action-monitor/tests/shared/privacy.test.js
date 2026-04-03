import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeValue } from "../../src/extension/shared/privacy.js";

test("sanitizeValue masks password-like fields when privacy mode is enabled", () => {
  const result = sanitizeValue({
    value: "secret123",
    target: { type: "password", name: "password" },
    privacyEnabled: true
  });

  assert.equal(result.value, "[masked]");
  assert.equal(result.masked, true);
  assert.equal(result.reason, "sensitive-field");
  assert.equal(result.valueLength, 9);
});

test("sanitizeValue preserves raw values when privacy mode is disabled", () => {
  const result = sanitizeValue({
    value: "secret123",
    target: { type: "password", name: "password" },
    privacyEnabled: false
  });

  assert.equal(result.value, "secret123");
  assert.equal(result.masked, false);
  assert.equal(result.reason, "");
  assert.equal(result.valueLength, 9);
});
