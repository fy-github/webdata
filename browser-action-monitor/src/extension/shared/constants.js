export const SCREENSHOT_STORAGE_PROFILES = {
  light: {
    storageLimitMb: 64,
    jpegQuality: 0.55,
    maxWidth: 1280
  },
  balanced: {
    storageLimitMb: 256,
    jpegQuality: 0.72,
    maxWidth: 1600
  },
  forensics: {
    storageLimitMb: 1024,
    jpegQuality: 0.86,
    maxWidth: 1920
  }
};

export const DEFAULT_SCREENSHOT_STORAGE_PROFILE = "balanced";

export const DEFAULT_SETTINGS = {
  captureClicks: true,
  captureInput: true,
  captureChange: true,
  captureSubmit: true,
  captureNavigation: true,
  captureScroll: true,
  captureKeydown: true,
  captureMousemove: false,
  scrollThrottleMs: 200,
  mousemoveThrottleMs: 800,
  captureDomSnapshots: true,
  captureScreenshots: true,
  screenshotStorageProfile: DEFAULT_SCREENSHOT_STORAGE_PROFILE,
  screenshotQueueLimit: 40,
  screenshotStorageLimitMb: SCREENSHOT_STORAGE_PROFILES[DEFAULT_SCREENSHOT_STORAGE_PROFILE].storageLimitMb,
  screenshotFailureThreshold: 3,
  screenshotSessionLimit: 500,
  domSnapshotActionLimit: 3000,
  privacyEnabled: true,
  serverUrl: "",
  authMode: "none",
  apiKey: "",
  syncBatchSize: 100,
  backgroundSyncEnabled: true,
  backgroundSyncIntervalMinutes: 5,
  syncOnStartup: true,
  maxConcurrentSessionSyncs: 2,
  syncBackoffEnabled: true,
  maxSyncBackoffMinutes: 60,
  idleGateEnabled: true,
  batteryAwareSyncEnabled: true
};

export const STORAGE_KEYS = {
  settings: "monitorSettings",
  state: "monitorState"
};

export const SENSITIVE_FIELD_HINTS = [
  "password",
  "passwd",
  "pwd",
  "token",
  "secret",
  "auth",
  "session",
  "cookie",
  "email",
  "phone",
  "mobile",
  "idcard",
  "credit",
  "card",
  "cvv"
];

export const EVENT_SETTINGS_MAP = {
  click: "captureClicks",
  input: "captureInput",
  change: "captureChange",
  submit: "captureSubmit",
  navigation: "captureNavigation",
  scroll: "captureScroll",
  keydown: "captureKeydown",
  mousemove: "captureMousemove"
};
