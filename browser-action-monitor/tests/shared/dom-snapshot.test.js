import test from "node:test";
import assert from "node:assert/strict";

import { buildDomSnapshot } from "../../src/extension/shared/dom-snapshot.js";

test("buildDomSnapshot masks sensitive values when privacy is enabled", () => {
  const snapshot = buildDomSnapshot({
    target: {
      tagName: "INPUT",
      id: "password",
      name: "password",
      type: "password",
      text: "",
      selector: "form > input#password",
      value: "topsecret"
    },
    privacyEnabled: true
  });

  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.privacyMode, "masked");
  assert.equal(snapshot.root.tagName, "INPUT");
  assert.equal(snapshot.root.value, "[masked]");
  assert.equal(snapshot.root.valueLength, 9);
});

test("buildDomSnapshot keeps bounded readable values when privacy is disabled", () => {
  const snapshot = buildDomSnapshot({
    target: {
      tagName: "TEXTAREA",
      id: "notes",
      name: "notes",
      type: "",
      text: "Line 1 Line 2",
      selector: "form > textarea#notes",
      value: "Visible note content"
    },
    privacyEnabled: false
  });

  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.privacyMode, "raw");
  assert.equal(snapshot.root.tagName, "TEXTAREA");
  assert.equal(snapshot.root.value, "Visible note content");
  assert.match(snapshot.preview, /Visible note content/);
});
