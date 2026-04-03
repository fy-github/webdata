import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function loadRuntimeHelpers() {
  const source = await readFile(new URL("../../src/extension/content/runtime-messaging.js", import.meta.url), "utf8");
  const context = {
    globalThis: {},
    console: {
      warn: (...args) => {
        context.__warnings.push(args);
      }
    },
    __warnings: []
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return {
    helpers: context.BrowserActionMonitorRuntime,
    warnings: context.__warnings
  };
}

test("safeSendMessage ignores invalidated extension context errors", async () => {
  const { helpers, warnings } = await loadRuntimeHelpers();

  const result = helpers.safeSendMessage(() => {
    throw new Error("Extension context invalidated.");
  }, { action: "recordAction" });

  assert.equal(result, false);
  assert.equal(warnings.length, 0);
});

test("safeSendMessage warns on unexpected runtime failures", async () => {
  const { helpers, warnings } = await loadRuntimeHelpers();

  const result = helpers.safeSendMessage(() => {
    throw new Error("boom");
  }, { action: "recordAction" });

  assert.equal(result, false);
  assert.equal(warnings.length, 1);
});
