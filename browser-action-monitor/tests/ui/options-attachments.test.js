import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("options page exposes attachment capture toggles", async () => {
  const html = await readFile(new URL("../../options.html", import.meta.url), "utf8");

  assert.match(html, /id="captureDomSnapshots"/);
  assert.match(html, /id="captureScreenshots"/);
  assert.match(html, /id="screenshotStorageProfile"/);
  assert.match(html, /value="light"/);
  assert.match(html, /value="balanced"/);
  assert.match(html, /value="forensics"/);
});

async function loadOptionsUi() {
  const elements = new Map();
  const ids = [
    "captureClicks",
    "captureInput",
    "captureChange",
    "captureSubmit",
    "captureNavigation",
    "captureScroll",
    "captureKeydown",
    "captureMousemove",
    "scrollThrottleMs",
    "mousemoveThrottleMs",
    "privacyEnabled",
    "captureDomSnapshots",
    "captureScreenshots",
    "screenshotStorageProfile",
    "serverUrl",
    "authMode",
    "apiKey",
    "apiKeyRow",
    "syncBatchSize",
    "backgroundSyncEnabled",
    "backgroundSyncIntervalMinutes",
    "syncOnStartup",
    "maxConcurrentSessionSyncs",
    "syncBackoffEnabled",
    "maxSyncBackoffMinutes",
    "idleGateEnabled",
    "batteryAwareSyncEnabled",
    "saveBtn",
    "resetBtn",
    "status"
  ];

  function createElement(id) {
    return {
      id,
      value: "",
      checked: false,
      textContent: "",
      hidden: false,
      dataset: {},
      handlers: {},
      addEventListener(type, handler) {
        this.handlers[type] = handler;
      }
    };
  }

  for (const id of ids) {
    elements.set(id, createElement(id));
  }
  elements.get("authMode").value = "none";
  elements.get("screenshotStorageProfile").value = "";

  const messageLog = [];
  const previousDocument = globalThis.document;
  const previousChrome = globalThis.chrome;

  globalThis.document = {
    getElementById(id) {
      const element = elements.get(id);
      if (!element) {
        throw new Error(`Missing element ${id}`);
      }
      return element;
    }
  };
  globalThis.chrome = {
    runtime: {
      lastError: null,
      sendMessage(payload, callback) {
        messageLog.push(payload);
        if (payload.action === "getSettings") {
          callback({
            success: true,
            settings: {
              captureDomSnapshots: true,
              captureScreenshots: false
            }
          });
          return;
        }

        if (payload.action === "saveSettings") {
          callback({
            success: true,
            settings: payload.data
          });
          return;
        }

        callback({ success: true });
      }
    }
  };

  const moduleUrl = new URL("../../src/ui/options.js", import.meta.url);
  await import(`${moduleUrl.href}?test=${Date.now()}`);
  await Promise.resolve();
  await Promise.resolve();

  return {
    elements,
    messageLog,
    cleanup() {
      globalThis.document = previousDocument;
      globalThis.chrome = previousChrome;
    }
  };
}

test("options UI loads and saves attachment capture toggles", async () => {
  const { elements, messageLog, cleanup } = await loadOptionsUi();

  try {
    assert.equal(elements.get("captureDomSnapshots").checked, true);
    assert.equal(elements.get("captureScreenshots").checked, false);
    assert.equal(elements.get("screenshotStorageProfile").value, "balanced");

    elements.get("captureDomSnapshots").checked = false;
    elements.get("captureScreenshots").checked = true;
    elements.get("screenshotStorageProfile").value = "forensics";

    const saveHandler = elements.get("saveBtn").handlers.click;
    await saveHandler();

    const saveMessage = messageLog.find((entry) => entry.action === "saveSettings");
    assert.equal(saveMessage.data.captureDomSnapshots, false);
    assert.equal(saveMessage.data.captureScreenshots, true);
    assert.equal(saveMessage.data.screenshotStorageProfile, "forensics");
  } finally {
    cleanup();
  }
});
