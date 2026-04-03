export function createDomSnapshotDefault({
  status = "ready",
  capturedAt = Date.now(),
  privacyMode = "masked",
  root = null,
  preview = ""
} = {}) {
  return {
    status,
    capturedAt,
    privacyMode,
    root,
    preview
  };
}

export function createScreenshotDefault({
  status = "pending",
  capturedAt = null,
  privacyMode = "masked",
  mimeType = "",
  storageKey = "",
  width = 0,
  height = 0,
  error = "",
  remoteStatus = "",
  remoteUrl = "",
  remoteUploadedAt = null,
  remoteError = "",
  remoteMimeType = ""
} = {}) {
  return {
    status,
    capturedAt,
    privacyMode,
    mimeType,
    storageKey,
    width,
    height,
    error,
    remoteStatus,
    remoteUrl,
    remoteUploadedAt,
    remoteError,
    remoteMimeType
  };
}

export function createAttachmentDefault(options = {}) {
  return {
    domSnapshot: createDomSnapshotDefault(options.domSnapshot),
    screenshot: createScreenshotDefault(options.screenshot)
  };
}
