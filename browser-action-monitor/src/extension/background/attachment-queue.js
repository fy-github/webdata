function createDefaultPolicy() {
  return {
    allowScreenshot: true,
    reason: ""
  };
}

function isStorageQuotaError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("quotabytes quota exceeded")
    || (message.includes("quota") && message.includes("exceeded"));
}

export function createAttachmentQueue({
  captureScreenshot,
  saveScreenshot,
  updateActionAttachment,
  onHealthChange = async () => {},
  evaluatePolicy = () => createDefaultPolicy(),
  failureThreshold = 3
}) {
  const jobs = [];
  let running = false;
  let health = {
    screenshotQueueSize: 0,
    consecutiveScreenshotFailures: 0,
    screenshotStorageBytes: 0,
    autoDisabled: {
      domSnapshots: false,
      screenshots: false,
      domReason: "",
      screenshotReason: ""
    }
  };

  async function emitHealth(patch = {}) {
    health = {
      ...health,
      ...patch,
      autoDisabled: {
        ...(health.autoDisabled || {}),
        ...(patch.autoDisabled || {})
      }
    };
    await onHealthChange(health);
  }

  async function processNext() {
    if (running || jobs.length === 0) {
      return;
    }

    running = true;
    const job = jobs.shift();
    await emitHealth({
      screenshotQueueSize: jobs.length
    });

    try {
      const policy = evaluatePolicy(job, health) || createDefaultPolicy();
      if (!policy.allowScreenshot) {
        await updateActionAttachment(job, {
          status: policy.reason || "disabled_auto_quota",
          error: policy.reason || "disabled_auto_quota"
        });
        return;
      }

      await updateActionAttachment(job, {
        status: "pending",
        error: ""
      });

      const payload = await captureScreenshot(job);
      const saved = await saveScreenshot({
        actionId: job.actionId,
        payload
      });

      await updateActionAttachment(job, {
        status: "ready",
        storageKey: saved.storageKey,
        mimeType: payload.mimeType,
        width: payload.width,
        height: payload.height,
        capturedAt: Date.now(),
        error: ""
      });
      await emitHealth({
        consecutiveScreenshotFailures: 0,
        screenshotStorageBytes: health.screenshotStorageBytes + Number(saved.sizeBytes || 0)
      });
    } catch (error) {
      const nextFailureCount = health.consecutiveScreenshotFailures + 1;
      const quotaExceeded = isStorageQuotaError(error);
      await updateActionAttachment(job, {
        status: "failed",
        error: error.message || String(error)
      });
      await emitHealth({
        consecutiveScreenshotFailures: nextFailureCount,
        autoDisabled: quotaExceeded
          ? {
            screenshots: true,
            screenshotReason: "storage-pressure"
          }
          : nextFailureCount >= failureThreshold
            ? {
              screenshots: true,
              screenshotReason: "capture-failures"
            }
            : {}
      });
    } finally {
      running = false;
      if (jobs.length > 0) {
        await processNext();
      }
    }
  }

  return {
    async enqueue(job) {
      jobs.push(job);
      await emitHealth({
        screenshotQueueSize: jobs.length
      });
      await processNext();
    },
    getHealth() {
      return { ...health };
    }
  };
}
