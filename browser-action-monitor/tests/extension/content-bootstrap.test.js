import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

class FakeElement {}

function createEventTarget() {
  const listeners = new Map();

  return {
    listeners,
    addEventListener(type, handler) {
      const current = listeners.get(type) || [];
      current.push(handler);
      listeners.set(type, current);
    },
    removeEventListener(type, handler) {
      const current = listeners.get(type) || [];
      listeners.set(type, current.filter((entry) => entry !== handler));
    }
  };
}

async function loadContentScriptIntoContext(context) {
  const source = await readFile(new URL("../../content.js", import.meta.url), "utf8");
  vm.runInNewContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
}

function createContentContext() {
  const documentTarget = createEventTarget();
  const windowTarget = createEventTarget();
  const storageListeners = [];

  const context = {
    console,
    Promise,
    Element: FakeElement,
    setTimeout(callback) {
      return callback;
    },
    clearTimeout() {},
    window: {
      ...windowTarget,
      location: {
        href: "https://example.com"
      }
    },
    document: {
      ...documentTarget,
      title: "Example"
    },
    history: {
      pushState() {},
      replaceState() {}
    },
    chrome: {
      runtime: {
        id: "ext_123",
        sendMessage() {}
      },
      storage: {
        local: {
          get(keys, callback) {
            callback({ monitorSettings: undefined });
          }
        },
        onChanged: {
          addListener(listener) {
            storageListeners.push(listener);
          },
          removeListener(listener) {
            const index = storageListeners.indexOf(listener);
            if (index >= 0) {
              storageListeners.splice(index, 1);
            }
          }
        }
      }
    }
  };

  context.globalThis = context;
  return {
    context,
    documentTarget,
    windowTarget,
    storageListeners
  };
}

test("content script bootstrap is idempotent across reinjection", async () => {
  const harness = createContentContext();

  await loadContentScriptIntoContext(harness.context);
  await loadContentScriptIntoContext(harness.context);

  assert.equal(harness.documentTarget.listeners.get("click")?.length || 0, 1);
  assert.equal(harness.documentTarget.listeners.get("input")?.length || 0, 1);
  assert.equal(harness.windowTarget.listeners.get("hashchange")?.length || 0, 1);
  assert.equal(harness.storageListeners.length, 1);
});
