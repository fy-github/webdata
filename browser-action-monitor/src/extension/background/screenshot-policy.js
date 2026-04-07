import {
  DEFAULT_SCREENSHOT_STORAGE_PROFILE,
  SCREENSHOT_STORAGE_PROFILES
} from "../shared/constants.js";

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveProfileName(settings = {}) {
  const profileName = settings.screenshotStorageProfile;
  return Object.hasOwn(SCREENSHOT_STORAGE_PROFILES, profileName)
    ? profileName
    : DEFAULT_SCREENSHOT_STORAGE_PROFILE;
}

export function resolveScreenshotStorageProfile(settings = {}) {
  const profileName = resolveProfileName(settings);
  return {
    name: profileName,
    ...SCREENSHOT_STORAGE_PROFILES[profileName]
  };
}

function toStorageLimitBytes(settings = {}) {
  if (Object.hasOwn(SCREENSHOT_STORAGE_PROFILES, settings.screenshotStorageProfile)) {
    return SCREENSHOT_STORAGE_PROFILES[settings.screenshotStorageProfile].storageLimitMb * 1024 * 1024;
  }

  const fallbackMb = SCREENSHOT_STORAGE_PROFILES[DEFAULT_SCREENSHOT_STORAGE_PROFILE].storageLimitMb;
  return toPositiveNumber(settings.screenshotStorageLimitMb, fallbackMb) * 1024 * 1024;
}

export function shouldAutoRecoverScreenshots({
  previousSettings = {},
  nextSettings = {},
  state = {}
}) {
  if (nextSettings.captureScreenshots === false) {
    return false;
  }

  const autoDisabled = state.attachmentHealth?.autoDisabled || {};
  if (!autoDisabled.screenshots || autoDisabled.screenshotReason !== "storage-pressure") {
    return false;
  }

  const previousLimit = toStorageLimitBytes(previousSettings);
  const nextLimit = toStorageLimitBytes(nextSettings);
  const currentUsage = Number(state.attachmentHealth?.screenshotStorageBytes || 0);

  return nextLimit > previousLimit && currentUsage < nextLimit;
}

export function resolveAttachmentPolicy(settings = {}, state = {}) {
  const autoDisabled = state.attachmentHealth?.autoDisabled || {};
  const domSnapshotsManuallyEnabled = settings.captureDomSnapshots !== false;
  const screenshotsManuallyEnabled = settings.captureScreenshots !== false;
  const privacyBlocksScreenshots = settings.privacyEnabled === true;

  return {
    domSnapshots: {
      enabled: domSnapshotsManuallyEnabled && !autoDisabled.domSnapshots,
      mode: !domSnapshotsManuallyEnabled
        ? "disabled_manual"
        : autoDisabled.domSnapshots
          ? "disabled_auto_quota"
          : "enabled",
      reason: !domSnapshotsManuallyEnabled ? "disabled_manual" : autoDisabled.domReason || ""
    },
    screenshots: {
      enabled: screenshotsManuallyEnabled && !autoDisabled.screenshots && !privacyBlocksScreenshots,
      mode: !screenshotsManuallyEnabled
        ? "disabled_manual"
        : privacyBlocksScreenshots
          ? "failed_privacy_guard"
        : autoDisabled.screenshots
          ? "disabled_auto_quota"
          : "enabled",
      reason: !screenshotsManuallyEnabled
        ? "disabled_manual"
        : privacyBlocksScreenshots
          ? "failed_privacy_guard"
          : autoDisabled.screenshotReason || ""
    }
  };
}

export function evaluateAttachmentPressure({
  settings = {},
  state = {},
  sessionId = ""
}) {
  const health = state.attachmentHealth || {};
  const queueLimit = toPositiveNumber(settings.screenshotQueueLimit, 40);
  const storageLimitBytes = toStorageLimitBytes(settings);
  const actionLimit = toPositiveNumber(settings.domSnapshotActionLimit, 3000);
  const failureThreshold = toPositiveNumber(settings.screenshotFailureThreshold, 3);
  const sessionActions = sessionId ? (state.actionsBySession?.[sessionId] || []) : [];

  const nextAutoDisabled = {
    ...(health.autoDisabled || {})
  };

  if (
    Number(health.screenshotQueueSize || 0) >= queueLimit
    || Number(health.screenshotStorageBytes || 0) >= storageLimitBytes
    || Number(health.consecutiveScreenshotFailures || 0) >= failureThreshold
  ) {
    nextAutoDisabled.screenshots = true;
    nextAutoDisabled.screenshotReason = Number(health.consecutiveScreenshotFailures || 0) >= failureThreshold
      ? "capture-failures"
      : Number(health.screenshotStorageBytes || 0) >= storageLimitBytes
        ? "storage-pressure"
        : "queue-pressure";
  }

  if (
    Number(health.screenshotStorageBytes || 0) >= storageLimitBytes * 2
    || sessionActions.length >= actionLimit
  ) {
    nextAutoDisabled.domSnapshots = true;
    nextAutoDisabled.domReason = sessionActions.length >= actionLimit
      ? "action-volume"
      : "storage-pressure";
  }

  return {
    autoDisabled: nextAutoDisabled
  };
}
