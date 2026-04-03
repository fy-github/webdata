import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("popup shell exposes attachment capture toggles and status region", async () => {
  const html = await readFile(new URL("../../popup.html", import.meta.url), "utf8");

  assert.match(html, /id="domSnapshotsToggle"/);
  assert.match(html, /id="screenshotsToggle"/);
  assert.match(html, /id="attachmentStatus"/);
});

test("popup client wires attachment toggles and renders attachment state", async () => {
  const script = await readFile(new URL("../../src/ui/popup.js", import.meta.url), "utf8");

  assert.match(script, /domSnapshotsToggle/);
  assert.match(script, /screenshotsToggle/);
  assert.match(script, /attachmentStatus/);
  assert.match(script, /saveSettings/);
  assert.match(script, /screenshotStorageBytes/);
  assert.match(script, /MB/);
});

async function loadPopupUi() {
  const source = await readFile(new URL("../../src/ui/popup.js", import.meta.url), "utf8");
  const elements = new Map();
  const ids = [
    "feedback",
    "attachmentStatus",
    "domSnapshotsToggle",
    "screenshotsToggle",
    "sessionId",
    "actionCount",
    "startedAt",
    "syncSummary",
    "statusText",
    "statusDot",
    "syncBadge",
    "startBtn",
    "pauseBtn",
    "recordsBtn",
    "settingsBtn",
    "exportBtn",
    "exportAgentJsonBtn",
    "exportAgentZipBtn",
    "retrySyncBtn",
    "newSessionBtn",
    "clearBtn"
  ];

  function createElement(id) {
    return {
      id,
      textContent: "",
      style: {},
      disabled: false,
      checked: false,
      className: "",
      handlers: {},
      addEventListener(type, handler) {
        this.handlers[type] = handler;
      }
    };
  }

  for (const id of ids) {
    elements.set(id, createElement(id));
  }

  const messageLog = [];
  const context = {
    Blob,
    URL: {
      createObjectURL() {
        return "blob:test";
      },
      revokeObjectURL() {}
    },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(payload, callback) {
          messageLog.push(payload);
          const action = payload.action;
          if (action === "getSettings") {
            callback({
              success: true,
              settings: {
                captureDomSnapshots: true,
                captureScreenshots: true
              }
            });
            return;
          }

          if (action === "getStats") {
            callback({
              success: true,
              stats: {
                sessionId: "ses_popup",
                actionCount: 1,
                startedAt: 1711111111000,
                isRecording: true,
                sync: {
                  enabled: false,
                  pendingCount: 0,
                  failedCount: 0
                },
                attachments: {
                  domSnapshots: { mode: "enabled", reason: "" },
                  screenshots: { mode: "enabled", reason: "" },
                  health: {
                    screenshotQueueSize: 0,
                    screenshotStorageBytes: 726161
                  }
                }
              }
            });
            return;
          }

          if (action === "saveSettings") {
            callback({
              success: true,
              settings: payload.data
            });
            return;
          }

          callback({ success: true });
        },
        getURL(path) {
          return path;
        },
        openOptionsPage() {}
      },
      tabs: {
        create() {}
      }
    },
    document: {
      body: {
        appendChild() {}
      },
      getElementById(id) {
        const element = elements.get(id);
        if (!element) {
          throw new Error(`Missing element ${id}`);
        }
        return element;
      },
      createElement() {
        return {
          click() {},
          remove() {}
        };
      }
    },
    console,
    setTimeout,
    clearTimeout
  };
  context.globalThis = context;

  vm.runInNewContext(source, context);
  await Promise.resolve();
  await Promise.resolve();

  return {
    elements,
    messageLog
  };
}

test("popup screenshot toggle handler keeps working after async save clears currentTarget", async () => {
  const { elements, messageLog } = await loadPopupUi();
  const toggle = elements.get("screenshotsToggle");
  const changeHandler = toggle.handlers.change;
  const event = {
    currentTarget: toggle
  };

  toggle.checked = false;
  const pending = changeHandler(event);
  event.currentTarget = null;

  await assert.doesNotReject(pending);
  assert.equal(messageLog.at(-1).action, "getStats");
  assert.match(elements.get("feedback").textContent, /关闭/);
});
