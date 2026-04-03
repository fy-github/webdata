# Background Resync V1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a balanced background retry and periodic resync flow for extension-side remote sync so pending and failed actions are retried automatically.

**Architecture:** The extension keeps its existing short-delay sync after new actions and adds a second Manifest V3 compatible retry lane based on `chrome.alarms`. A small scheduler helper owns policy normalization and alarm configuration, while the background entry point owns guarded execution and persistence.

**Tech Stack:** Manifest V3 extension APIs, `chrome.alarms`, Node test runner, local extension storage, existing sync pipeline.

---

## File Map

- Create: `src/extension/background/sync-scheduler.js`
- Modify: `src/extension/shared/constants.js`
- Modify: `background.js`
- Modify: `src/ui/options.js`
- Modify: `options.html`
- Create: `tests/background/sync-scheduler.test.js`
- Modify: `tests/background/sync.test.js`
- Modify: `README.md`
- Modify: `manifest.json`

## Chunk 1: Scheduler Policy and Tests

### Task 1: Add failing tests for sync scheduler policy

**Files:**
- Create: `tests/background/sync-scheduler.test.js`

- [ ] **Step 1: Write a failing test for default policy normalization**

Cover:
- background sync defaults to enabled
- interval defaults to 5 minutes
- startup sync defaults to enabled

- [ ] **Step 2: Run the scheduler test file and verify it fails**

Run: `npm.cmd test -- tests/background/sync-scheduler.test.js`
Expected: FAIL because the scheduler module does not exist yet.

- [ ] **Step 3: Write a failing test for disabled remote sync scheduling**

Cover:
- empty `serverUrl` disables alarm scheduling
- disabled background sync toggle disables alarm scheduling

- [ ] **Step 4: Write a failing test for interval normalization**

Cover:
- invalid interval falls back to default
- too-small interval is clamped to a minimum safe value

- [ ] **Step 5: Run the scheduler test file again and verify it still fails for missing implementation**

Run: `npm.cmd test -- tests/background/sync-scheduler.test.js`
Expected: FAIL with missing module or missing exports.

### Task 2: Implement scheduler helper

**Files:**
- Create: `src/extension/background/sync-scheduler.js`
- Modify: `src/extension/shared/constants.js`
- Test: `tests/background/sync-scheduler.test.js`

- [ ] **Step 1: Add the new sync settings to extension defaults**

Add:
- `syncBatchSize`
- `backgroundSyncEnabled`
- `backgroundSyncIntervalMinutes`
- `syncOnStartup`

- [ ] **Step 2: Implement scheduler policy helpers**

Implement:
- alarm name constant
- interval normalization
- enabled/disabled policy derivation
- alarm descriptor generation

- [ ] **Step 3: Run the scheduler tests**

Run: `npm.cmd test -- tests/background/sync-scheduler.test.js`
Expected: PASS

## Chunk 2: Background Integration

### Task 3: Add failing tests for guarded background sync behavior

**Files:**
- Modify: `tests/background/sync.test.js`

- [ ] **Step 1: Write a failing test for empty pending work**

Cover:
- sync still returns skipped cleanly when there is no work

- [ ] **Step 2: Write a failing test for custom batch size from settings defaults**

Cover:
- updated defaults continue to flow into `syncPendingActions`

- [ ] **Step 3: Run the sync tests and verify new expectations fail**

Run: `npm.cmd test -- tests/background/sync.test.js`
Expected: FAIL if helper behavior is not yet aligned.

### Task 4: Implement background alarm orchestration

**Files:**
- Modify: `background.js`
- Modify: `manifest.json`
- Modify: `tests/background/sync.test.js`

- [ ] **Step 1: Add the `alarms` permission**

Update manifest permissions for periodic retry support.

- [ ] **Step 2: Add a guarded sync runner in `background.js`**

Requirements:
- reuse existing `runSync` internals
- prevent overlapping sync attempts
- persist state after completion

- [ ] **Step 3: Add alarm configuration logic**

Requirements:
- create one periodic alarm when remote sync is enabled
- clear the alarm when disabled

- [ ] **Step 4: Trigger one compensation sync on initialize or startup**

Requirements:
- respect `syncOnStartup`
- avoid surfacing skipped runs as errors

- [ ] **Step 5: Refresh alarm configuration on settings save**

Requirements:
- persist settings
- reconfigure alarms
- run one compensation sync if remote sync is enabled

- [ ] **Step 6: Run targeted tests**

Run: `npm.cmd test -- tests/background/sync-scheduler.test.js tests/background/sync.test.js`
Expected: PASS

## Chunk 3: Options UI and Docs

### Task 5: Add options UI for background sync controls

**Files:**
- Modify: `src/ui/options.js`
- Modify: `options.html`

- [ ] **Step 1: Add form fields for background sync controls**

Add:
- background sync enabled
- interval in minutes
- startup sync enabled
- batch size

- [ ] **Step 2: Load and save the new values**

Make sure defaults flow through the same settings message path.

- [ ] **Step 3: Run syntax checks**

Run:
- `node --check background.js`
- `node --check src/ui/options.js`

Expected: PASS

### Task 6: Update docs and run final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the new background sync behavior**

Cover:
- startup compensation sync
- periodic retry
- new options page controls

- [ ] **Step 2: Run the full test suite**

Run: `npm.cmd test`
Expected: PASS

- [ ] **Step 3: Perform manual smoke checks**

Check:
- enabling remote sync schedules retries
- disabling remote sync stops retries
- startup sync attempts once when pending work exists
- manual sync still works

- [ ] **Step 4: Record deferred follow-up items**

Keep deferred scope limited to:
- exponential backoff
- multi-session background retry
- online/offline event specific triggers
