import test from "node:test";
import assert from "node:assert/strict";

import { normalizeAction } from "../../src/extension/shared/normalize.js";

test("normalizeAction masks input payloads when privacy mode is enabled", () => {
  const action = normalizeAction({
    eventType: "input",
    timestamp: 1711111111111,
    page: {
      url: "https://example.com/login",
      title: "Login"
    },
    target: {
      tagName: "INPUT",
      id: "password",
      name: "password",
      type: "password",
      className: "field",
      selector: "form > input#password"
    },
    payload: {
      value: "topsecret"
    }
  }, {
    sessionId: "ses_123",
    privacyEnabled: true
  });

  assert.equal(action.sessionId, "ses_123");
  assert.equal(action.type, "input");
  assert.equal(action.payload.value, "[masked]");
  assert.equal(action.payload.valueLength, 9);
  assert.equal(action.privacy.masked, true);
  assert.equal(action.target.selector, "form > input#password");
});

test("normalizeAction preserves click coordinates and text summaries", () => {
  const action = normalizeAction({
    eventType: "click",
    timestamp: 1711111111111,
    page: {
      url: "https://example.com",
      title: "Homepage"
    },
    target: {
      tagName: "BUTTON",
      id: "submit",
      className: "primary",
      text: "Submit form",
      selector: "button#submit"
    },
    payload: {
      clientX: 88,
      clientY: 42
    }
  }, {
    sessionId: "ses_123",
    privacyEnabled: true
  });

  assert.equal(action.payload.clientX, 88);
  assert.equal(action.payload.clientY, 42);
  assert.equal(action.privacy.masked, false);
  assert.equal(action.target.text, "Submit form");
});

test("normalizeAction initializes attachment metadata for DOM snapshots and screenshots", () => {
  const action = normalizeAction({
    eventType: "click",
    timestamp: 1711111111111,
    page: {
      url: "https://example.com",
      title: "Homepage"
    },
    target: {
      tagName: "BUTTON",
      id: "submit",
      className: "primary",
      text: "Submit form",
      selector: "button#submit"
    },
    payload: {
      clientX: 88,
      clientY: 42
    }
  }, {
    sessionId: "ses_attach",
    privacyEnabled: true
  });

  assert.equal(action.attachment.domSnapshot.status, "ready");
  assert.equal(action.attachment.domSnapshot.privacyMode, "masked");
  assert.equal(action.attachment.screenshot.status, "pending");
  assert.equal(action.attachment.screenshot.storageKey, "");
});

test("normalizeAction fail-closes screenshot capture when privacy mode is enabled", () => {
  const action = normalizeAction({
    eventType: "click",
    timestamp: 1711111111111,
    page: {
      url: "https://example.com",
      title: "Homepage"
    },
    target: {
      tagName: "BUTTON",
      id: "submit",
      className: "primary",
      text: "Submit form",
      selector: "button#submit"
    },
    payload: {
      clientX: 88,
      clientY: 42
    }
  }, {
    sessionId: "ses_privacy",
    privacyEnabled: true,
    attachmentPolicy: {
      domSnapshots: {
        enabled: true,
        mode: "enabled",
        reason: ""
      },
      screenshots: {
        enabled: false,
        mode: "failed_privacy_guard",
        reason: "failed_privacy_guard"
      }
    }
  });

  assert.equal(action.attachment.domSnapshot.status, "ready");
  assert.equal(action.attachment.screenshot.status, "failed_privacy_guard");
  assert.equal(action.attachment.screenshot.error, "failed_privacy_guard");
});
