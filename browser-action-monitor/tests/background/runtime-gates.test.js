import test from "node:test";
import assert from "node:assert/strict";

import { evaluateRuntimeGates } from "../../src/extension/background/runtime-gates.js";

test("evaluateRuntimeGates reduces automatic concurrency when browser is active", async () => {
  const result = await evaluateRuntimeGates({
    trigger: "alarm",
    requestedConcurrency: 3,
    idleGateEnabled: true,
    batteryAwareSyncEnabled: false,
    getIdleState: async () => "active"
  });

  assert.equal(result.allowed, true);
  assert.equal(result.effectiveConcurrency, 1);
  assert.equal(result.idleState, "active");
});

test("evaluateRuntimeGates keeps requested concurrency when browser is idle", async () => {
  const result = await evaluateRuntimeGates({
    trigger: "startup",
    requestedConcurrency: 2,
    idleGateEnabled: true,
    batteryAwareSyncEnabled: false,
    getIdleState: async () => "idle"
  });

  assert.equal(result.allowed, true);
  assert.equal(result.effectiveConcurrency, 2);
  assert.equal(result.idleState, "idle");
});

test("evaluateRuntimeGates bypasses idle and battery gates for manual trigger", async () => {
  const result = await evaluateRuntimeGates({
    trigger: "manual",
    requestedConcurrency: 4,
    idleGateEnabled: true,
    batteryAwareSyncEnabled: true,
    getIdleState: async () => "active",
    getBatteryState: async () => ({ supported: true, charging: false, level: 0.1, lowPower: true })
  });

  assert.equal(result.allowed, true);
  assert.equal(result.effectiveConcurrency, 4);
  assert.equal(result.reason, "");
});

test("evaluateRuntimeGates degrades cleanly when battery state is unsupported", async () => {
  const result = await evaluateRuntimeGates({
    trigger: "alarm",
    requestedConcurrency: 2,
    idleGateEnabled: false,
    batteryAwareSyncEnabled: true,
    getBatteryState: async () => ({ supported: false })
  });

  assert.equal(result.allowed, true);
  assert.equal(result.effectiveConcurrency, 2);
  assert.equal(result.battery.supported, false);
});

test("evaluateRuntimeGates can skip automatic work in low power mode", async () => {
  const result = await evaluateRuntimeGates({
    trigger: "alarm",
    requestedConcurrency: 2,
    idleGateEnabled: false,
    batteryAwareSyncEnabled: true,
    getBatteryState: async () => ({ supported: true, charging: false, level: 0.08, lowPower: true })
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "power-save");
});
