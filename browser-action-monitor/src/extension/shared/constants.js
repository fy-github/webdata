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
  screenshotQueueLimit: 40,
  screenshotStorageLimitMb: 8,
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
