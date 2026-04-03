# Local Records Workbench Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the extension records page into a local records workbench with structured background querying, richer filters, and dashboard-like summaries.

**Architecture:** Keep all filtering logic in the extension background layer so the UI stays thin and the query model remains reusable. Add a focused local query helper that normalizes filters, searches local state, and returns a structured response shaped for future local/remote query unification.

**Tech Stack:** Manifest V3 extension messaging, local extension state, plain HTML/CSS/JS, Node test runner.

---

## File Map

- Create: `src/extension/background/records-query.js`
- Create: `tests/background/records-query.test.js`
- Create: `tests/ui/records-ui.test.js`
- Modify: `background.js`
- Modify: `records.html`
- Modify: `src/ui/records.js`

## Chunk 1: Background Query Helper

### Task 1: Add failing tests for structured local record querying

**Files:**
- Create: `tests/background/records-query.test.js`

- [ ] **Step 1: Write a failing test for filter normalization defaults**

Cover:
- empty filters normalize to safe defaults
- current session fallback is preserved in the normalized query

- [ ] **Step 2: Write a failing test for date range and sync status filtering**

Cover:
- `dateFrom` and `dateTo` constrain `timestamp`
- `syncStatus` filters `pending`, `failed`, `synced`

- [ ] **Step 3: Write a failing test for keyword filtering across readable fields**

Cover:
- selector, URL, target text, and payload text are searchable

- [ ] **Step 4: Write a failing test for combined filters and summary generation**

Cover:
- multiple filters compose correctly
- summary returns total count, counts by sync status, and counts by event type

- [ ] **Step 5: Run the new background query tests and verify they fail**

Run: `npm.cmd test -- tests/background/records-query.test.js`
Expected: FAIL because the query helper does not exist yet.

### Task 2: Implement the local records query helper

**Files:**
- Create: `src/extension/background/records-query.js`
- Modify: `tests/background/records-query.test.js`

- [ ] **Step 1: Implement filter normalization**

Handle:
- `sessionId`
- `eventType`
- `syncStatus`
- `dateFrom`
- `dateTo`
- `keyword`

- [ ] **Step 2: Implement keyword matching against readable action fields**

Cover:
- target metadata
- page metadata
- payload summaries

- [ ] **Step 3: Implement filtered action selection and summary generation**

Return:
- `actions`
- `summary`
- `query`
- `sessions`
- `currentSessionId`

- [ ] **Step 4: Run the background query tests**

Run: `npm.cmd test -- tests/background/records-query.test.js`
Expected: PASS

## Chunk 2: Background Integration

### Task 3: Add failing integration tests for `getRecords`

**Files:**
- Modify: `tests/background/records-query.test.js`

- [ ] **Step 1: Write a failing test for `getRecords`-style response shape**

Cover:
- sessions remain available even when actions are filtered down
- normalized query is echoed back

- [ ] **Step 2: Run the affected tests to verify red**

Run: `npm.cmd test -- tests/background/records-query.test.js`
Expected: FAIL until `background.js` uses the helper.

### Task 4: Wire `background.js` to the structured query helper

**Files:**
- Modify: `background.js`
- Modify: `src/extension/background/records-query.js`

- [ ] **Step 1: Replace ad hoc `getRecords` filtering with the query helper**

- [ ] **Step 2: Preserve current-session behavior as the default view**

- [ ] **Step 3: Keep existing session list ordering**

- [ ] **Step 4: Run the background query tests again**

Run: `npm.cmd test -- tests/background/records-query.test.js`
Expected: PASS

## Chunk 3: Records Workbench UI

### Task 5: Add failing UI shell tests for the local workbench page

**Files:**
- Create: `tests/ui/records-ui.test.js`

- [ ] **Step 1: Write a failing test for the richer filter bar**

Cover:
- session filter
- event type filter
- sync status filter
- date inputs
- keyword input
- refresh and reset buttons

- [ ] **Step 2: Write a failing test for summary and two-column workbench structure**

Cover:
- summary region
- result table
- sticky or dedicated detail region

- [ ] **Step 3: Write a failing test for records client hooks**

Cover:
- refresh handler
- reset handler
- keyword debounce seam

- [ ] **Step 4: Run the UI shell tests and verify they fail**

Run: `npm.cmd test -- tests/ui/records-ui.test.js`
Expected: FAIL because the existing page only exposes the old lightweight viewer shell.

### Task 6: Rebuild `records.html` as a local workbench shell

**Files:**
- Modify: `records.html`
- Modify: `tests/ui/records-ui.test.js`

- [ ] **Step 1: Add the richer filter controls**

- [ ] **Step 2: Add the summary strip**

- [ ] **Step 3: Preserve the action list plus detail split layout**

- [ ] **Step 4: Run the UI shell tests**

Run: `npm.cmd test -- tests/ui/records-ui.test.js`
Expected: PASS or partially PASS depending on the remaining client script expectations.

### Task 7: Upgrade `src/ui/records.js` to use the structured query response

**Files:**
- Modify: `src/ui/records.js`
- Modify: `tests/ui/records-ui.test.js`

- [ ] **Step 1: Send the full structured `filters` object to `getRecords`**

- [ ] **Step 2: Render the summary strip from `response.summary`**

- [ ] **Step 3: Render the results table and explicit empty state**

- [ ] **Step 4: Add reset behavior and keyword debounce**

- [ ] **Step 5: Keep the JSON detail pane behavior**

- [ ] **Step 6: Run syntax and UI tests**

Run:
- `node --check src/ui/records.js`
- `npm.cmd test -- tests/ui/records-ui.test.js`

Expected: PASS

## Chunk 4: Final Verification

### Task 8: Verify the workbench end to end

**Files:**
- Modify: `README.md` only if a user-facing note about records filtering is warranted during implementation

- [ ] **Step 1: Run the focused test suite**

Run: `npm.cmd test -- tests/background/records-query.test.js tests/ui/records-ui.test.js`
Expected: PASS

- [ ] **Step 2: Run the full automated test suite**

Run: `npm.cmd test`
Expected: PASS

- [ ] **Step 3: Perform syntax checks**

Run:
- `node --check background.js`
- `node --check src/ui/records.js`

Expected: PASS

- [ ] **Step 4: Manual smoke-check checklist**

Check:
- default view opens on the current session
- session filter, event type filter, sync status filter, date range, and keyword all affect the result list
- reset restores the default local workbench view
- summary changes with the active filtered result
- selecting a row still shows the raw JSON detail

- [ ] **Step 5: Record deferred follow-up items**

Keep deferred scope limited to:
- pagination
- sorting
- local/remote unified query adapters
- richer previews such as screenshots or DOM snapshots
