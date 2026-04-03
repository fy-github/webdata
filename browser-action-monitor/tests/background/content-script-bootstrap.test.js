import test from "node:test";
import assert from "node:assert/strict";

import { bootstrapExistingTabs } from "../../src/extension/background/content-script-bootstrap.js";

test("bootstrapExistingTabs injects recorder scripts into existing web tabs", async () => {
  const executed = [];

  await bootstrapExistingTabs({
    tabsApi: {
      async query() {
        return [
          { id: 1, url: "https://example.com" },
          { id: 2, url: "chrome://extensions" },
          { id: 3, url: "http://localhost:3000" },
          { id: 4, url: "about:blank" },
          { id: 5, url: "file:///tmp/demo.html" }
        ];
      }
    },
    scriptingApi: {
      async executeScript(options) {
        executed.push(options);
      }
    }
  });

  assert.deepEqual(executed.map((entry) => entry.target.tabId), [1, 3, 5]);
  assert.deepEqual(executed.map((entry) => entry.files), [
    ["src/extension/content/runtime-messaging.js", "content.js"],
    ["src/extension/content/runtime-messaging.js", "content.js"],
    ["src/extension/content/runtime-messaging.js", "content.js"]
  ]);
});
