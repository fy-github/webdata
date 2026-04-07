import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SCREENSHOT_STORAGE_PROFILE,
  DEFAULT_SETTINGS,
  SCREENSHOT_STORAGE_PROFILES
} from "../../src/extension/shared/constants.js";
import {
  evaluateAttachmentPressure,
  resolveAttachmentPolicy,
  shouldAutoRecoverScreenshots
} from "../../src/extension/background/screenshot-policy.js";

test("screenshot storage profiles expose the approved defaults", () => {
  assert.equal(DEFAULT_SCREENSHOT_STORAGE_PROFILE, "balanced");
  assert.equal(DEFAULT_SETTINGS.screenshotStorageProfile, "balanced");
  assert.deepEqual(SCREENSHOT_STORAGE_PROFILES.light, {
    storageLimitMb: 64,
    jpegQuality: 0.55,
    maxWidth: 1280
  });
  assert.deepEqual(SCREENSHOT_STORAGE_PROFILES.balanced, {
    storageLimitMb: 256,
    jpegQuality: 0.72,
    maxWidth: 1600
  });
  assert.deepEqual(SCREENSHOT_STORAGE_PROFILES.forensics, {
    storageLimitMb: 1024,
    jpegQuality: 0.86,
    maxWidth: 1920
  });
});

test("attachment pressure uses the selected screenshot storage profile limit", () => {
  const patch = evaluateAttachmentPressure({
    settings: {
      screenshotStorageProfile: "balanced",
      screenshotQueueLimit: 40,
      screenshotFailureThreshold: 3,
      domSnapshotActionLimit: 3000
    },
    state: {
      attachmentHealth: {
        screenshotQueueSize: 0,
        screenshotStorageBytes: 256 * 1024 * 1024,
        consecutiveScreenshotFailures: 0,
        autoDisabled: {
          domSnapshots: false,
          screenshots: false,
          domReason: "",
          screenshotReason: ""
        }
      },
      actionsBySession: {
        ses_policy: []
      }
    },
    sessionId: "ses_policy"
  });

  assert.equal(patch.autoDisabled.screenshots, true);
  assert.equal(patch.autoDisabled.screenshotReason, "storage-pressure");
});

test("manual screenshot disable still wins over auto-disabled state", () => {
  const policy = resolveAttachmentPolicy({
    captureScreenshots: false,
    privacyEnabled: false
  }, {
    attachmentHealth: {
      autoDisabled: {
        screenshots: true,
        screenshotReason: "storage-pressure"
      }
    }
  });

  assert.equal(policy.screenshots.enabled, false);
  assert.equal(policy.screenshots.mode, "disabled_manual");
  assert.equal(policy.screenshots.reason, "disabled_manual");
});

test("auto recovery only clears screenshot auto-disable after a larger profile is selected", () => {
  assert.equal(shouldAutoRecoverScreenshots({
    previousSettings: {
      captureScreenshots: true,
      screenshotStorageProfile: "balanced"
    },
    nextSettings: {
      captureScreenshots: true,
      screenshotStorageProfile: "forensics"
    },
    state: {
      attachmentHealth: {
        screenshotStorageBytes: 300 * 1024 * 1024,
        autoDisabled: {
          screenshots: true,
          screenshotReason: "storage-pressure"
        }
      }
    }
  }), true);

  assert.equal(shouldAutoRecoverScreenshots({
    previousSettings: {
      captureScreenshots: true,
      screenshotStorageProfile: "balanced"
    },
    nextSettings: {
      captureScreenshots: false,
      screenshotStorageProfile: "forensics"
    },
    state: {
      attachmentHealth: {
        screenshotStorageBytes: 300 * 1024 * 1024,
        autoDisabled: {
          screenshots: true,
          screenshotReason: "storage-pressure"
        }
      }
    }
  }), false);

  assert.equal(shouldAutoRecoverScreenshots({
    previousSettings: {
      captureScreenshots: true,
      screenshotStorageProfile: "balanced"
    },
    nextSettings: {
      captureScreenshots: true,
      screenshotStorageProfile: "forensics"
    },
    state: {
      attachmentHealth: {
        screenshotStorageBytes: 300 * 1024 * 1024,
        autoDisabled: {
          screenshots: true,
          screenshotReason: "capture-failures"
        }
      }
    }
  }), false);
});
