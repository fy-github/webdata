# Browser Action Monitor V1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a usable browser action monitoring extension with local record viewing/export plus optional remote upload to a Node.js + Express service.

**Architecture:** The extension captures raw browser events in `content.js`, normalizes and persists them via shared modules invoked by `background.js`, and renders UI through popup/options/records pages. The server exposes a small JSON API with optional API key protection and stores data on disk.

**Tech Stack:** Chrome Extension Manifest V3, vanilla JavaScript, Node.js, Express, Vitest, Supertest

---

## Chunk 1: Project Foundation

### Task 1: Create project metadata and test tooling

**Files:**
- Create: `package.json`
- Create: `vitest.config.js`
- Modify: `README.md`
- Test: `tests/shared/privacy.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from "vitest";
import { sanitizeValue } from "../../src/extension/shared/privacy.js";

describe("sanitizeValue", () => {
  it("masks password-like fields when privacy mode is enabled", () => {
    const result = sanitizeValue({
      value: "secret123",
      target: { type: "password", name: "password" },
      privacyEnabled: true
    });

    expect(result.value).toBe("[masked]");
    expect(result.masked).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/shared/privacy.test.js`
Expected: FAIL because `src/extension/shared/privacy.js` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create the shared privacy module with `sanitizeValue`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/shared/privacy.test.js`
Expected: PASS

## Chunk 2: Extension Shared Logic

### Task 2: Normalize captured actions

**Files:**
- Create: `src/extension/shared/constants.js`
- Create: `src/extension/shared/selectors.js`
- Create: `src/extension/shared/normalize.js`
- Test: `tests/shared/normalize.test.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

### Task 3: Persist sessions/actions and track sync state

**Files:**
- Create: `src/extension/background/storage.js`
- Create: `src/extension/background/session-store.js`
- Test: `tests/background/session-store.test.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

### Task 4: Add remote sync client behavior

**Files:**
- Create: `src/extension/background/sync.js`
- Test: `tests/background/sync.test.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

## Chunk 3: Extension Runtime and UI

### Task 5: Refactor `content.js` to emit normalized raw event envelopes

**Files:**
- Modify: `content.js`
- Modify: `manifest.json`
- Test: `tests/shared/normalize.test.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

### Task 6: Refactor `background.js` to orchestrate settings, storage, export, and sync

**Files:**
- Modify: `background.js`
- Modify: `manifest.json`
- Test: `tests/background/session-store.test.js`
- Test: `tests/background/sync.test.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

### Task 7: Build records viewer page and update popup/options UIs

**Files:**
- Create: `records.html`
- Create: `src/ui/popup.js`
- Create: `src/ui/options.js`
- Create: `src/ui/records.js`
- Modify: `popup.html`
- Modify: `options.html`

- [ ] **Step 1: Write the failing test**

Document manual smoke checks for UI since extension UI is browser-driven.

- [ ] **Step 2: Run test to verify it fails**

Use manual smoke check notes to confirm the current UI lacks records viewing and sync status.

- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run smoke checks to verify it passes**

## Chunk 4: Server

### Task 8: Add Express server and disk-backed repository

**Files:**
- Create: `server/app.js`
- Create: `server/index.js`
- Create: `server/config.js`
- Create: `server/repository.js`
- Create: `server/data/.gitkeep`
- Test: `tests/server/api.test.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

### Task 9: Add optional API key auth support

**Files:**
- Modify: `server/app.js`
- Modify: `server/config.js`
- Test: `tests/server/api.test.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

## Chunk 5: Documentation and Verification

### Task 10: Document setup and usage

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update setup instructions for extension and server**
- [ ] **Step 2: Add example server env configuration**
- [ ] **Step 3: Add manual verification checklist**

### Task 11: Verify end-to-end behavior

**Files:**
- Test: `tests/shared/privacy.test.js`
- Test: `tests/shared/normalize.test.js`
- Test: `tests/background/session-store.test.js`
- Test: `tests/background/sync.test.js`
- Test: `tests/server/api.test.js`

- [ ] **Step 1: Run unit and API tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 2: Run manual smoke checks**

Install extension, capture actions, inspect records, export JSON, and validate remote sync in both auth modes.
