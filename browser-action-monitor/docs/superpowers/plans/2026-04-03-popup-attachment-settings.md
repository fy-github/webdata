# Popup Attachment Settings Relocation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move DOM snapshot and screenshot toggles from the popup into the settings page, and merge attachment state into the popup header status block with clearer visual status indicators.

**Architecture:** Reuse existing settings fields `captureDomSnapshots` and `captureScreenshots`, extend the settings page with a new attachment section, and simplify the popup into a read-only runtime dashboard. Keep popup behavior changes localized to its HTML shell and rendering code, while updating UI tests to lock the new information structure.

**Tech Stack:** Plain HTML/CSS, browser extension popup/options scripts, Node test runner

---

## Chunk 1: Lock the New UI Contract with Tests

### Task 1: Update popup UI expectations

**Files:**
- Modify: `tests/ui/popup-attachments.test.js`

- [ ] **Step 1: Write the failing test**

Update popup tests to assert:
- popup no longer contains `domSnapshotsToggle`
- popup no longer contains `screenshotsToggle`
- popup still exposes a unified attachment status region
- popup renders DOM and screenshot status indicators plus queue/storage metrics

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/popup-attachments.test.js`
Expected: FAIL because popup still contains the two toggles and old script logic.

- [ ] **Step 3: Write minimal implementation later**

No production change in this task.

### Task 2: Add settings page coverage for attachment toggles

**Files:**
- Create: `tests/ui/options-attachments.test.js`

- [ ] **Step 1: Write the failing test**

Cover:
- settings page HTML includes `captureDomSnapshots` and `captureScreenshots`
- settings script loads and saves those fields through existing settings plumbing

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/options-attachments.test.js`
Expected: FAIL because settings page does not yet expose those controls.

## Chunk 2: Implement Settings and Popup Changes

### Task 3: Move attachment toggles into the settings page

**Files:**
- Modify: `options.html`
- Modify: `src/ui/options.js`

- [ ] **Step 1: Add the new attachment settings section**

Insert an `附件采集` section after the precision/privacy block and before remote sync.

- [ ] **Step 2: Bind the two new controls**

Wire `captureDomSnapshots` and `captureScreenshots` into:
- `getFormValues`
- `fillForm`
- default load/save flow

- [ ] **Step 3: Run focused tests**

Run: `npm test -- tests/ui/options-attachments.test.js`
Expected: PASS

### Task 4: Simplify the popup into a read-only status block

**Files:**
- Modify: `popup.html`
- Modify: `src/ui/popup.js`

- [ ] **Step 1: Remove popup attachment toggles from the shell**

Delete the two toggle cards and expand the existing top status area to include attachment state.

- [ ] **Step 2: Rebuild popup attachment rendering**

Render:
- DOM state chip with green/gray dot
- screenshot state chip with green/gray dot
- queue metric
- storage metric

Do not keep popup-side save logic for attachment settings.

- [ ] **Step 3: Run focused tests**

Run: `npm test -- tests/ui/popup-attachments.test.js`
Expected: PASS

## Chunk 3: Final Verification

### Task 5: Run full verification

**Files:**
- Verify only

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: PASS with zero failures.
