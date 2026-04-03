import test from "node:test";
import assert from "node:assert/strict";

import {
  BACKGROUND_SYNC_ALARM_NAME,
  applyBackgroundSyncAlarm,
  getBackgroundSyncPolicy
} from "../../src/extension/background/sync-scheduler.js";

test("getBackgroundSyncPolicy applies balanced defaults", () => {
  const policy = getBackgroundSyncPolicy({
    serverUrl: "https://collector.example.com"
  });

  assert.equal(policy.alarmName, BACKGROUND_SYNC_ALARM_NAME);
  assert.equal(policy.enabled, true);
  assert.equal(policy.backgroundSyncEnabled, true);
  assert.equal(policy.syncOnStartup, true);
  assert.equal(policy.syncBatchSize, 100);
  assert.equal(policy.periodInMinutes, 5);
  assert.equal(policy.maxConcurrentSessionSyncs, 2);
  assert.equal(policy.syncBackoffEnabled, true);
  assert.equal(policy.maxSyncBackoffMinutes, 60);
  assert.equal(policy.idleGateEnabled, true);
  assert.equal(policy.batteryAwareSyncEnabled, true);
});

test("getBackgroundSyncPolicy disables scheduling without remote sync or when toggle is off", () => {
  const missingServer = getBackgroundSyncPolicy({
    serverUrl: "",
    backgroundSyncEnabled: true
  });
  const disabledToggle = getBackgroundSyncPolicy({
    serverUrl: "https://collector.example.com",
    backgroundSyncEnabled: false
  });

  assert.equal(missingServer.enabled, false);
  assert.equal(disabledToggle.enabled, false);
});

test("getBackgroundSyncPolicy normalizes invalid interval and batch size values", () => {
  const fallbackPolicy = getBackgroundSyncPolicy({
    serverUrl: "https://collector.example.com",
    backgroundSyncIntervalMinutes: 0,
    syncBatchSize: -3,
    maxConcurrentSessionSyncs: 0,
    maxSyncBackoffMinutes: -1
  });
  const parsedPolicy = getBackgroundSyncPolicy({
    serverUrl: "https://collector.example.com",
    backgroundSyncIntervalMinutes: "9",
    syncBatchSize: "25",
    maxConcurrentSessionSyncs: "4",
    maxSyncBackoffMinutes: "30"
  });

  assert.equal(fallbackPolicy.periodInMinutes, 5);
  assert.equal(fallbackPolicy.syncBatchSize, 100);
  assert.equal(fallbackPolicy.maxConcurrentSessionSyncs, 2);
  assert.equal(fallbackPolicy.maxSyncBackoffMinutes, 60);
  assert.equal(parsedPolicy.periodInMinutes, 9);
  assert.equal(parsedPolicy.syncBatchSize, 25);
  assert.equal(parsedPolicy.maxConcurrentSessionSyncs, 4);
  assert.equal(parsedPolicy.maxSyncBackoffMinutes, 30);
});

test("applyBackgroundSyncAlarm creates a periodic alarm when policy is enabled", async () => {
  const calls = [];

  const policy = await applyBackgroundSyncAlarm({
    settings: {
      serverUrl: "https://collector.example.com",
      backgroundSyncEnabled: true,
      backgroundSyncIntervalMinutes: 7
    },
    alarmsApi: {
      clear: async (name) => {
        calls.push(["clear", name]);
        return true;
      },
      create: async (name, info) => {
        calls.push(["create", name, info]);
      }
    }
  });

  assert.equal(policy.enabled, true);
  assert.deepEqual(calls, [
    ["clear", BACKGROUND_SYNC_ALARM_NAME],
    ["create", BACKGROUND_SYNC_ALARM_NAME, { periodInMinutes: 7 }]
  ]);
});

test("applyBackgroundSyncAlarm clears the alarm when background sync is disabled", async () => {
  const calls = [];

  const policy = await applyBackgroundSyncAlarm({
    settings: {
      serverUrl: "",
      backgroundSyncEnabled: true
    },
    alarmsApi: {
      clear: async (name) => {
        calls.push(["clear", name]);
        return true;
      },
      create: async () => {
        throw new Error("should not create");
      }
    }
  });

  assert.equal(policy.enabled, false);
  assert.deepEqual(calls, [["clear", BACKGROUND_SYNC_ALARM_NAME]]);
});
