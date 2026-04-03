# Action Attachments Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-action DOM snapshot and screenshot attachments with privacy-aware capture, large-volume protection, export support, local records visibility, and remote server compatibility.

**Architecture:** Extend the existing action model with lightweight attachment metadata, keep DOM snapshots synchronous and bounded, and run screenshots through a background queue so action ingestion stays fast. Store screenshot payloads outside the main action list, expose attachment states in local and remote UIs, and split remote sync into metadata-first plus binary attachment uploads to avoid oversized requests.

**Tech Stack:** Manifest V3 extension messaging and storage, plain HTML/CSS/JS UI, Node test runner, Express server, JSZip export flow.

---

## File Map

- Create: `src/extension/shared/dom-snapshot.js`
- Create: `src/extension/shared/attachment-defaults.js`
- Create: `src/extension/background/attachment-store.js`
- Create: `src/extension/background/attachment-queue.js`
- Create: `src/extension/background/screenshot-policy.js`
- Create: `tests/shared/dom-snapshot.test.js`
- Create: `tests/background/attachment-store.test.js`
- Create: `tests/background/attachment-queue.test.js`
- Create: `tests/background/attachment-export.test.js`
- Create: `tests/ui/popup-attachments.test.js`
- Create: `tests/ui/records-attachments.test.js`
- Create: `tests/server/attachments-api.test.js`
- Modify: `src/extension/shared/constants.js`
- Modify: `src/extension/shared/privacy.js`
- Modify: `src/extension/shared/normalize.js`
- Modify: `content.js`
- Modify: `background.js`
- Modify: `src/extension/background/session-store.js`
- Modify: `src/extension/background/sync.js`
- Modify: `src/extension/background/agent-export.js`
- Modify: `src/ui/popup.js`
- Modify: `popup.html`
- Modify: `records.html`
- Modify: `src/ui/records.js`
- Modify: `server/app.js`
- Modify: `server/storage.js`
- Modify: `server/dashboard.js`
- Modify: `README.md`

## Chunk 1: Attachment Data Model and Defaults

### Task 1: Add failing tests for normalized attachment defaults

**Files:**
- Create: `tests/shared/dom-snapshot.test.js`
- Modify: `tests/background/session-store.test.js`

- [ ] **Step 1: Write a failing test for `normalizeAction()` attachment defaults**

Cover:
- actions receive `attachment.domSnapshot` and `attachment.screenshot`
- default statuses match enabled capture settings
- old actions without attachment data remain readable

- [ ] **Step 2: Write a failing test for DOM snapshot masking behavior**

Cover:
- privacy enabled masks sensitive values
- privacy disabled preserves bounded readable values

- [ ] **Step 3: Run the focused tests to verify they fail**

Run:
- `npm.cmd test -- tests/shared/dom-snapshot.test.js tests/background/session-store.test.js`

Expected:
- FAIL because attachment helpers and defaults do not exist yet.

### Task 2: Add attachment defaults and DOM snapshot helper

**Files:**
- Create: `src/extension/shared/attachment-defaults.js`
- Create: `src/extension/shared/dom-snapshot.js`
- Modify: `src/extension/shared/privacy.js`
- Modify: `src/extension/shared/normalize.js`
- Modify: `tests/shared/dom-snapshot.test.js`

- [ ] **Step 1: Add a helper that returns attachment default objects**

Include:
- DOM snapshot status initialization
- screenshot status initialization
- manual/auto-disable compatibility hooks

- [ ] **Step 2: Implement DOM snapshot extraction with bounded depth and text limits**

Cover:
- target-focused node tree
- readable summary preview
- privacy-aware masking

- [ ] **Step 3: Update `normalizeAction()` to attach DOM snapshot metadata and screenshot metadata**

- [ ] **Step 4: Re-run the focused tests**

Run:
- `npm.cmd test -- tests/shared/dom-snapshot.test.js tests/background/session-store.test.js`

Expected:
- PASS

## Chunk 2: Extension Settings and Attachment Storage

### Task 3: Add failing tests for attachment settings and storage

**Files:**
- Create: `tests/background/attachment-store.test.js`
- Create: `tests/ui/popup-attachments.test.js`

- [ ] **Step 1: Write a failing test for new settings defaults**

Cover:
- DOM snapshot capture enabled by default
- screenshot capture enabled by default
- auto-disable metadata can be surfaced

- [ ] **Step 2: Write a failing test for attachment persistence helpers**

Cover:
- saving screenshot payload by action id
- reading and deleting stored screenshot payloads
- reporting storage usage

- [ ] **Step 3: Write a failing popup shell test for the two new toggles and auto-disable status**

- [ ] **Step 4: Run the focused tests to verify they fail**

Run:
- `npm.cmd test -- tests/background/attachment-store.test.js tests/ui/popup-attachments.test.js`

Expected:
- FAIL because settings and storage helpers do not exist yet.

### Task 4: Implement settings and attachment store

**Files:**
- Create: `src/extension/background/attachment-store.js`
- Modify: `src/extension/shared/constants.js`
- Modify: `background.js`
- Modify: `popup.html`
- Modify: `src/ui/popup.js`
- Modify: `tests/background/attachment-store.test.js`
- Modify: `tests/ui/popup-attachments.test.js`

- [ ] **Step 1: Add settings keys and defaults for DOM snapshot capture and screenshot capture**

- [ ] **Step 2: Add attachment-store helpers for save/read/delete/usage accounting**

- [ ] **Step 3: Surface settings and attachment status through background messaging**

- [ ] **Step 4: Add popup toggles and visible attachment status text**

- [ ] **Step 5: Re-run the focused tests**

Run:
- `npm.cmd test -- tests/background/attachment-store.test.js tests/ui/popup-attachments.test.js`

Expected:
- PASS

## Chunk 3: Screenshot Queue, Quotas, and Auto-Shutdown

### Task 5: Add failing tests for queue lifecycle and pressure control

**Files:**
- Create: `tests/background/attachment-queue.test.js`

- [ ] **Step 1: Write a failing test for queued screenshot lifecycle**

Cover:
- enqueue on action record
- pending to ready transition
- failed capture state

- [ ] **Step 2: Write a failing test for quota-based screenshot skipping**

Cover:
- per-session cap
- backlog cap
- storage cap

- [ ] **Step 3: Write a failing test for automatic shutdown order**

Cover:
- screenshot capture auto-disables first
- DOM snapshots auto-disable only under higher pressure
- action recording continues

- [ ] **Step 4: Run the queue tests and verify they fail**

Run:
- `npm.cmd test -- tests/background/attachment-queue.test.js`

Expected:
- FAIL because the queue and policy helpers do not exist yet.

### Task 6: Implement attachment queue and pressure policy

**Files:**
- Create: `src/extension/background/attachment-queue.js`
- Create: `src/extension/background/screenshot-policy.js`
- Modify: `background.js`
- Modify: `src/extension/background/session-store.js`
- Modify: `tests/background/attachment-queue.test.js`

- [ ] **Step 1: Add per-action attachment mutation helpers in session state**

Include:
- update DOM status
- update screenshot status and metadata
- record auto-disable state and reasons

- [ ] **Step 2: Implement queue bookkeeping and screenshot task execution seam**

- [ ] **Step 3: Implement quota checks, storage pressure checks, and auto-disable decisions**

- [ ] **Step 4: Wire action recording to enqueue screenshot work without blocking ingestion**

- [ ] **Step 5: Re-run the queue tests**

Run:
- `npm.cmd test -- tests/background/attachment-queue.test.js`

Expected:
- PASS

## Chunk 4: Export and Sync

### Task 7: Add failing tests for attachment export and sync payloads

**Files:**
- Create: `tests/background/attachment-export.test.js`
- Modify: `tests/background/sync.test.js`

- [ ] **Step 1: Write a failing test for JSON export attachment metadata**

Cover:
- DOM snapshot data included
- screenshot file references included when available
- missing screenshots remain represented by status

- [ ] **Step 2: Write a failing test for ZIP export attachment bundling**

Cover:
- session JSON plus attachment directory
- no inline binary blob in action JSON

- [ ] **Step 3: Write a failing test for sync metadata-first payloads**

Cover:
- action sync excludes raw screenshot bytes
- screenshot upload request is separate

- [ ] **Step 4: Run the focused tests to verify they fail**

Run:
- `npm.cmd test -- tests/background/attachment-export.test.js tests/background/sync.test.js`

Expected:
- FAIL because export and sync do not understand attachments yet.

### Task 8: Implement export and sync support for attachments

**Files:**
- Modify: `src/extension/background/agent-export.js`
- Modify: `src/extension/background/sync.js`
- Modify: `background.js`
- Modify: `src/extension/background/attachment-store.js`
- Modify: `tests/background/attachment-export.test.js`
- Modify: `tests/background/sync.test.js`

- [ ] **Step 1: Extend export builders to include attachment metadata and file references**

- [ ] **Step 2: Extend ZIP generation to include saved screenshot files**

- [ ] **Step 3: Split remote sync into action metadata sync and screenshot upload flow**

- [ ] **Step 4: Track attachment upload status separately from action sync status**

- [ ] **Step 5: Re-run the focused export and sync tests**

Run:
- `npm.cmd test -- tests/background/attachment-export.test.js tests/background/sync.test.js`

Expected:
- PASS

## Chunk 5: Local Records UI

### Task 9: Add failing tests for attachment visibility in the records page

**Files:**
- Create: `tests/ui/records-attachments.test.js`

- [ ] **Step 1: Write a failing UI shell test for attachment state indicators**

Cover:
- list-level attachment badge/column
- detail area attachment sections

- [ ] **Step 2: Write a failing test for DOM snapshot preview and screenshot fallback messaging**

- [ ] **Step 3: Run the records attachment UI tests and verify they fail**

Run:
- `npm.cmd test -- tests/ui/records-attachments.test.js`

Expected:
- FAIL because the records UI does not render attachment states yet.

### Task 10: Implement records page attachment views

**Files:**
- Modify: `records.html`
- Modify: `src/ui/records.js`
- Modify: `tests/ui/records-attachments.test.js`

- [ ] **Step 1: Add list-level attachment summary UI**

- [ ] **Step 2: Add detail-panel sections for DOM snapshot summary and screenshot preview/state**

- [ ] **Step 3: Keep the raw JSON detail available alongside the richer preview**

- [ ] **Step 4: Re-run the records attachment UI tests**

Run:
- `npm.cmd test -- tests/ui/records-attachments.test.js`

Expected:
- PASS

## Chunk 6: Server Attachment Support

### Task 11: Add failing tests for server-side attachment storage and dashboard exposure

**Files:**
- Create: `tests/server/attachments-api.test.js`

- [ ] **Step 1: Write a failing test for metadata-first session ingest compatibility**

Cover:
- attachment metadata stored with actions
- old payloads without attachment fields remain accepted

- [ ] **Step 2: Write a failing test for separate screenshot upload API**

Cover:
- upload by session/action identifier
- attachment status updates on success

- [ ] **Step 3: Write a failing test for dashboard attachment summary and detail payloads**

- [ ] **Step 4: Run the server tests and verify they fail**

Run:
- `npm.cmd test -- tests/server/attachments-api.test.js`

Expected:
- FAIL because the server does not store or expose attachment payloads yet.

### Task 12: Implement server-side attachment support

**Files:**
- Modify: `server/app.js`
- Modify: `server/storage.js`
- Modify: `server/dashboard.js`
- Modify: `tests/server/attachments-api.test.js`

- [ ] **Step 1: Extend session ingest to store attachment metadata safely**

- [ ] **Step 2: Add screenshot upload endpoint and persisted attachment references**

- [ ] **Step 3: Expose attachment metrics and detail payloads in dashboard data**

- [ ] **Step 4: Re-run the server attachment tests**

Run:
- `npm.cmd test -- tests/server/attachments-api.test.js`

Expected:
- PASS

## Chunk 7: Final Verification and Documentation

### Task 13: Verify the feature end to end

**Files:**
- Modify: `README.md`
- Modify: `docs/v2-backlog.md` only if deferred follow-up items need to be clarified

- [ ] **Step 1: Update user-facing setup and behavior notes**

Document:
- attachment toggles
- privacy behavior
- export behavior
- large-volume auto-disable behavior

- [ ] **Step 2: Run focused attachment-related tests**

Run:
- `npm.cmd test -- tests/shared/dom-snapshot.test.js tests/background/attachment-store.test.js tests/background/attachment-queue.test.js tests/background/attachment-export.test.js tests/ui/popup-attachments.test.js tests/ui/records-attachments.test.js tests/server/attachments-api.test.js`

Expected:
- PASS

- [ ] **Step 3: Run the full test suite**

Run:
- `npm.cmd test`

Expected:
- PASS

- [ ] **Step 4: Run syntax checks**

Run:
- `node --check background.js`
- `node --check content.js`
- `node --check src/ui/popup.js`
- `node --check src/ui/records.js`
- `node --check server/app.js`

Expected:
- PASS

- [ ] **Step 5: Manual smoke-check checklist**

Check:
- recording still works with attachments enabled
- manually disabling DOM snapshot capture prevents new DOM attachments
- manually disabling screenshot capture prevents screenshot queueing
- sustained pressure auto-disables screenshot capture first
- exports still work when screenshots are missing or skipped
- records page shows DOM and screenshot states correctly
- server dashboard shows remote attachment state after sync/upload
