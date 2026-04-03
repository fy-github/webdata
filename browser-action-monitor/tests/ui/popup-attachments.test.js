import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("popup shell exposes unified attachment status block without popup toggles", async () => {
  const html = await readFile(new URL("../../popup.html", import.meta.url), "utf8");

  assert.doesNotMatch(html, /id="domSnapshotsToggle"/);
  assert.doesNotMatch(html, /id="screenshotsToggle"/);
  assert.match(html, /id="attachmentStatus"/);
  assert.match(html, /\.status-bar\s*\{[^}]*display:\s*grid;/);
  assert.match(html, /\.status-bar\s*\{[^}]*grid-template-columns:\s*1fr 1fr;/);
  assert.match(html, /\.status-main,\s*\.pill\s*\{/);
  assert.match(html, /\.status-main,\s*\.pill\s*\{[^}]*min-height:\s*34px;/);
  assert.match(html, /\.status-main,\s*\.pill\s*\{[^}]*padding:\s*8px 10px;/);
  assert.match(html, /\.status-main,\s*\.pill\s*\{[^}]*border-radius:\s*12px;/);
  assert.match(html, /\.status-main,\s*\.pill\s*\{[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.84\);/);
  assert.match(html, /\.pill\s*\{[^}]*width:\s*100%;/);
  assert.match(html, /\.pill\s*\{[^}]*justify-content:\s*center;/);
});

test("popup client renders read-only attachment status indicators", async () => {
  const script = await readFile(new URL("../../src/ui/popup.js", import.meta.url), "utf8");

  assert.doesNotMatch(script, /domSnapshotsToggle/);
  assert.doesNotMatch(script, /screenshotsToggle/);
  assert.doesNotMatch(script, /saveSettings/);
  assert.match(script, /attachmentStatus/);
  assert.match(script, /status-dot/);
  assert.match(script, /screenshotStorageBytes/);
  assert.match(script, /MB/);
});

async function loadPopupUi() {
  const source = await readFile(new URL("../../src/ui/popup.js", import.meta.url), "utf8");
  const elements = new Map();
  const ids = [
    "feedback",
    "attachmentStatus",
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
      innerHTML: "",
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
                captureScreenshots: false
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
                  health: {
                    screenshotQueueSize: 0,
                    screenshotStorageBytes: 726161
                  }
                }
              }
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

test("popup renders DOM and screenshot state with dots plus queue and storage metrics", async () => {
  const { elements, messageLog } = await loadPopupUi();
  const attachmentStatus = elements.get("attachmentStatus");

  assert.equal(messageLog[0].action, "getSettings");
  assert.equal(messageLog[1].action, "getStats");
  assert.match(attachmentStatus.innerHTML, /DOM 开启/);
  assert.match(attachmentStatus.innerHTML, /截图 关闭/);
  assert.match(attachmentStatus.innerHTML, /队列 0/);
  assert.match(attachmentStatus.innerHTML, /存储 0\.69 MB/);
  assert.match(attachmentStatus.innerHTML, /status-dot is-on/);
  assert.match(attachmentStatus.innerHTML, /status-dot is-off/);
});
