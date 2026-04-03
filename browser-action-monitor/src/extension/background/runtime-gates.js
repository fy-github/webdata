function normalizeConcurrency(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.max(1, Math.floor(parsed));
}

function isManualTrigger(trigger = "") {
  return trigger === "manual" || trigger === "manual-retry" || trigger === "agent-export";
}

async function getDefaultIdleState() {
  const idleApi = globalThis.chrome?.idle;
  if (!idleApi?.queryState) {
    return "unknown";
  }

  return new Promise((resolve) => {
    try {
      idleApi.queryState(60, (state) => {
        if (globalThis.chrome?.runtime?.lastError) {
          resolve("unknown");
          return;
        }

        resolve(state || "unknown");
      });
    } catch {
      resolve("unknown");
    }
  });
}

async function getDefaultBatteryState() {
  const getBattery = globalThis.navigator?.getBattery;
  if (typeof getBattery !== "function") {
    return { supported: false };
  }

  try {
    const battery = await getBattery.call(globalThis.navigator);
    const level = Number(battery?.level);
    const charging = Boolean(battery?.charging);
    const lowPower = !charging && Number.isFinite(level) && level <= 0.15;

    return {
      supported: true,
      charging,
      level: Number.isFinite(level) ? level : null,
      lowPower
    };
  } catch {
    return { supported: false };
  }
}

export async function evaluateRuntimeGates({
  trigger = "alarm",
  requestedConcurrency = 1,
  idleGateEnabled = true,
  batteryAwareSyncEnabled = true,
  getIdleState = getDefaultIdleState,
  getBatteryState = getDefaultBatteryState
} = {}) {
  const normalizedConcurrency = normalizeConcurrency(requestedConcurrency);
  const result = {
    allowed: true,
    reason: "",
    requestedConcurrency: normalizedConcurrency,
    effectiveConcurrency: normalizedConcurrency,
    idleState: "unknown",
    battery: { supported: false }
  };

  if (isManualTrigger(trigger)) {
    return result;
  }

  if (idleGateEnabled && typeof getIdleState === "function") {
    result.idleState = (await getIdleState()) || "unknown";
    if (result.idleState === "active") {
      result.effectiveConcurrency = 1;
    }
  }

  if (batteryAwareSyncEnabled && typeof getBatteryState === "function") {
    result.battery = (await getBatteryState()) || { supported: false };
    if (result.battery.supported && result.battery.lowPower) {
      result.allowed = false;
      result.reason = "power-save";
      result.effectiveConcurrency = 0;
    }
  }

  return result;
}
