import { DEFAULT_SETTINGS } from "../shared/constants.js";

export const BACKGROUND_SYNC_ALARM_NAME = "browser-action-monitor.background-sync";
const MIN_BACKGROUND_SYNC_INTERVAL_MINUTES = 1;

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

export function getBackgroundSyncPolicy(settings = {}) {
  const syncBatchSize = normalizePositiveInteger(
    settings.syncBatchSize,
    DEFAULT_SETTINGS.syncBatchSize
  );
  const maxConcurrentSessionSyncs = normalizePositiveInteger(
    settings.maxConcurrentSessionSyncs,
    DEFAULT_SETTINGS.maxConcurrentSessionSyncs
  );
  const requestedInterval = normalizePositiveInteger(
    settings.backgroundSyncIntervalMinutes,
    DEFAULT_SETTINGS.backgroundSyncIntervalMinutes
  );
  const maxSyncBackoffMinutes = normalizePositiveInteger(
    settings.maxSyncBackoffMinutes,
    DEFAULT_SETTINGS.maxSyncBackoffMinutes
  );
  const periodInMinutes = Math.max(
    MIN_BACKGROUND_SYNC_INTERVAL_MINUTES,
    requestedInterval
  );
  const backgroundSyncEnabled = settings.backgroundSyncEnabled !== false;
  const syncOnStartup = settings.syncOnStartup !== false;
  const syncBackoffEnabled = settings.syncBackoffEnabled !== false;
  const idleGateEnabled = settings.idleGateEnabled !== false;
  const batteryAwareSyncEnabled = settings.batteryAwareSyncEnabled !== false;
  const enabled = Boolean(settings.serverUrl) && backgroundSyncEnabled;

  return {
    alarmName: BACKGROUND_SYNC_ALARM_NAME,
    enabled,
    backgroundSyncEnabled,
    syncOnStartup,
    syncBatchSize,
    periodInMinutes,
    maxConcurrentSessionSyncs,
    syncBackoffEnabled,
    maxSyncBackoffMinutes,
    idleGateEnabled,
    batteryAwareSyncEnabled
  };
}

export async function applyBackgroundSyncAlarm({
  settings,
  alarmsApi
}) {
  const policy = getBackgroundSyncPolicy(settings);
  await alarmsApi.clear(policy.alarmName);

  if (policy.enabled) {
    await alarmsApi.create(policy.alarmName, {
      periodInMinutes: policy.periodInMinutes
    });
  }

  return policy;
}
