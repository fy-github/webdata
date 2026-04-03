# Agent Export V1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first usable agent-oriented export pipeline that emits raw steps, enhanced Playwright steps, and a rule-based task summary from recorded browser sessions.

**Architecture:** The server becomes the single export authority by adding a dedicated export service and exporter modules for raw steps, Playwright output, and task summaries. The dashboard and extension both call the same server endpoints so export rules stay centralized and the extension does not duplicate conversion logic.

**Tech Stack:** Node.js, Express, native browser extension APIs, Node test runner, JSON and ZIP-like archive generation in server code.

---

## File Map

- Create: `server/agent-export/export-service.js`
- Create: `server/agent-export/raw-exporter.js`
- Create: `server/agent-export/playwright-exporter.js`
- Create: `server/agent-export/summary-exporter.js`
- Create: `server/agent-export/archive.js`
- Modify: `server/app.js`
- Modify: `server/public/dashboard.js`
- Modify: `server/views/dashboard.html`
- Modify: `src/ui/popup.js`
- Modify: `popup.html`
- Modify: `background.js`
- Test: `tests/server/agent-export.test.js`
- Modify: `tests/server/api.test.js`
- Modify: `tests/server/dashboard-ui.test.js`

## Chunk 1: Server Export Pipeline

### Task 1: Add failing server tests for agent export generation

**Files:**
- Create: `tests/server/agent-export.test.js`

- [ ] **Step 1: Write failing tests for raw step export**

Cover:
- navigation becomes raw `navigate`
- click keeps selector and source action id
- input keeps value after privacy masking

- [ ] **Step 2: Run the new test file and verify it fails**

Run: `npm.cmd test -- tests/server/agent-export.test.js`
Expected: FAIL because the export modules do not exist yet.

- [ ] **Step 3: Write failing tests for Playwright export**

Cover:
- raw-like steps are emitted
- executable steps merge obvious input/change pairs
- script text is generated from executable steps

- [ ] **Step 4: Run the test file and verify it still fails for missing implementation**

Run: `npm.cmd test -- tests/server/agent-export.test.js`
Expected: FAIL with missing module or missing export behavior.

- [ ] **Step 5: Write failing tests for summary export**

Cover:
- navigation starts a task segment
- consecutive form fills merge into one task
- submit plus URL change forms a navigation-oriented task

- [ ] **Step 6: Run the test file and verify it fails for expected reasons**

Run: `npm.cmd test -- tests/server/agent-export.test.js`
Expected: FAIL because summary exporter is not implemented.

- [ ] **Step 7: If workspace is under git, commit the red tests**

```bash
git add tests/server/agent-export.test.js
git commit -m "test: add agent export pipeline coverage"
```

### Task 2: Implement exporter modules and bundle assembly

**Files:**
- Create: `server/agent-export/export-service.js`
- Create: `server/agent-export/raw-exporter.js`
- Create: `server/agent-export/playwright-exporter.js`
- Create: `server/agent-export/summary-exporter.js`
- Create: `server/agent-export/archive.js`
- Test: `tests/server/agent-export.test.js`

- [ ] **Step 1: Implement the raw exporter with minimal stable mapping**

Implement a function that accepts `{ session, actions }` and returns normalized `rawSteps`.

- [ ] **Step 2: Run the raw exporter tests**

Run: `npm.cmd test -- tests/server/agent-export.test.js`
Expected: raw-export assertions PASS; Playwright and summary tests may still FAIL.

- [ ] **Step 3: Implement the Playwright exporter**

Implement:
- `rawLikeSteps`
- `executableSteps`
- `script`
- per-step confidence

- [ ] **Step 4: Run the test file again**

Run: `npm.cmd test -- tests/server/agent-export.test.js`
Expected: raw and Playwright assertions PASS; summary assertions may still FAIL.

- [ ] **Step 5: Implement the summary exporter**

Emit deterministic structured tasks with rule-based grouping.

- [ ] **Step 6: Implement the export service and archive formatter**

Implement:
- bundle assembly for agent JSON
- bundle assembly for agent ZIP payload
- metadata population

- [ ] **Step 7: Run the dedicated exporter tests and make them pass**

Run: `npm.cmd test -- tests/server/agent-export.test.js`
Expected: PASS

- [ ] **Step 8: If workspace is under git, commit the exporter implementation**

```bash
git add server/agent-export tests/server/agent-export.test.js
git commit -m "feat: add agent export pipeline"
```

## Chunk 2: Server API Integration

### Task 3: Add failing API tests for single-session and bulk agent export

**Files:**
- Modify: `tests/server/api.test.js`

- [ ] **Step 1: Write a failing API test for single-session agent JSON export**

Cover:
- `GET /api/sessions/:sessionId/export?format=json&type=agent`
- response includes `rawSteps`, `playwright`, and `summary`

- [ ] **Step 2: Write a failing API test for single-session agent ZIP export**

Cover:
- content type or body marker indicates archive output
- archive contains expected logical files

- [ ] **Step 3: Write a failing API test for bulk agent export**

Cover:
- `POST /api/sessions/bulk/export-agent`
- multiple seeded sessions appear in the bundle

- [ ] **Step 4: Run API tests and verify they fail**

Run: `npm.cmd test -- tests/server/api.test.js`
Expected: FAIL because the new routes do not exist yet.

- [ ] **Step 5: If workspace is under git, commit the red API tests**

```bash
git add tests/server/api.test.js
git commit -m "test: cover agent export api"
```

### Task 4: Implement agent export API endpoints

**Files:**
- Modify: `server/app.js`
- Create: `server/agent-export/export-service.js`
- Create: `server/agent-export/archive.js`
- Modify: `tests/server/api.test.js`

- [ ] **Step 1: Wire the export service into `server/app.js`**

Add:
- single-session agent export route
- bulk agent export route
- request validation

- [ ] **Step 2: Return JSON for `format=json`**

Use the export service directly for the response payload.

- [ ] **Step 3: Return downloadable archive content for `format=zip` and bulk export**

Use the archive helper to return one binary or string-backed archive payload consistently in tests.

- [ ] **Step 4: Run API tests**

Run: `npm.cmd test -- tests/server/api.test.js`
Expected: PASS

- [ ] **Step 5: Run exporter tests again for regression coverage**

Run: `npm.cmd test -- tests/server/agent-export.test.js`
Expected: PASS

- [ ] **Step 6: If workspace is under git, commit the API integration**

```bash
git add server/app.js server/agent-export tests/server/api.test.js
git commit -m "feat: add agent export api endpoints"
```

## Chunk 3: Dashboard Export UI

### Task 5: Add failing UI tests for dashboard export controls

**Files:**
- Modify: `tests/server/dashboard-ui.test.js`

- [ ] **Step 1: Write failing shell tests for new agent export controls**

Cover:
- single-session export controls expose Agent JSON and Agent ZIP
- batch export controls expose agent export choice

- [ ] **Step 2: Run the dashboard UI tests and verify they fail**

Run: `npm.cmd test -- tests/server/dashboard-ui.test.js`
Expected: FAIL because the controls are not rendered yet.

- [ ] **Step 3: If workspace is under git, commit the red dashboard UI tests**

```bash
git add tests/server/dashboard-ui.test.js
git commit -m "test: cover dashboard agent export controls"
```

### Task 6: Implement dashboard agent export actions

**Files:**
- Modify: `server/views/dashboard.html`
- Modify: `server/public/dashboard.js`
- Modify: `tests/server/dashboard-ui.test.js`

- [ ] **Step 1: Add explicit export choices to the dashboard shell**

Add UI for:
- plain JSON
- agent JSON
- agent ZIP

- [ ] **Step 2: Update dashboard client logic to call the new export endpoints**

Keep the existing plain export flow intact while adding new agent export downloads.

- [ ] **Step 3: Add batch agent export support**

Use the same selected session set with a separate request path for agent export.

- [ ] **Step 4: Run dashboard UI tests**

Run: `npm.cmd test -- tests/server/dashboard-ui.test.js`
Expected: PASS

- [ ] **Step 5: Run API tests because the dashboard depends on new routes**

Run: `npm.cmd test -- tests/server/api.test.js`
Expected: PASS

- [ ] **Step 6: If workspace is under git, commit the dashboard export UI**

```bash
git add server/views/dashboard.html server/public/dashboard.js tests/server/dashboard-ui.test.js
git commit -m "feat: add dashboard agent export controls"
```

## Chunk 4: Extension Entry Point

### Task 7: Add failing tests or minimal regression checks for extension-side agent export entry

**Files:**
- Modify: `background.js`
- Modify: `src/ui/popup.js`
- Modify: `popup.html`

- [ ] **Step 1: Add a focused regression test if extension UI tests exist**

If no popup test harness exists yet, document a manual check instead of inventing heavy UI infrastructure.

- [ ] **Step 2: Define the failing behavior at code level**

The extension should:
- request agent export from the server when configured
- refuse gracefully when server URL is missing

- [ ] **Step 3: If a test harness is added, run it and verify red**

Use the smallest possible scope.

### Task 8: Implement extension popup agent export flow

**Files:**
- Modify: `src/ui/popup.js`
- Modify: `popup.html`
- Modify: `background.js`

- [ ] **Step 1: Add popup controls for Agent JSON and Agent ZIP**

Keep the existing local plain JSON export button available.

- [ ] **Step 2: Add background message handling for server-backed agent export**

The background should:
- verify server URL is configured
- package current session id
- call the server export endpoint
- return a downloadable payload to the popup

- [ ] **Step 3: Update popup logic to download the returned payload**

Handle:
- JSON file download
- ZIP file download
- clear feedback when server is not configured

- [ ] **Step 4: Run targeted automated tests if available; otherwise perform manual smoke verification**

Manual checks:
- without server URL, agent export shows a clear error
- with server URL, Agent JSON downloads
- with server URL, Agent ZIP downloads

- [ ] **Step 5: If workspace is under git, commit the extension entry changes**

```bash
git add popup.html src/ui/popup.js background.js
git commit -m "feat: add extension agent export entry"
```

## Chunk 5: Final Verification and Docs

### Task 9: Update documentation and verify end-to-end behavior

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README export documentation**

Document:
- new agent export endpoints
- dashboard export choices
- extension dependency on configured server for agent export

- [ ] **Step 2: Run the full automated test suite**

Run: `npm.cmd test`
Expected: PASS with zero failing tests.

- [ ] **Step 3: Perform final manual smoke checks**

Check:
- dashboard single-session Agent JSON export
- dashboard single-session Agent ZIP export
- dashboard bulk agent export
- extension popup agent export with server configured
- extension popup rejection when server is not configured

- [ ] **Step 4: If workspace is under git, commit docs and final integration**

```bash
git add README.md
git commit -m "docs: describe agent export workflows"
```

- [ ] **Step 5: Record any deferred follow-up items**

Keep deferred scope limited to:
- LLM summary plug-in
- screenshot packaging
- DOM snapshot packaging
- archive streaming optimization
