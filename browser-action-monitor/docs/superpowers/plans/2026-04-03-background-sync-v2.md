# Background Sync V2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade extension background sync to support multi-session compensation, exponential backoff, richer scheduling policy, and idle/battery aware gating.

**Architecture:** The existing per-session upload path remains the source of truth for how one session syncs, while a new orchestrator module selects and executes candidate sessions under bounded concurrency. Browser entry points in `background.js` become thinner and delegate policy decisions to scheduler, gate, and orchestrator helpers.

**Tech Stack:** Manifest V3 extension APIs, `chrome.alarms`, local extension storage, Node test runner, lightweight policy modules.

---

## File Map

- Create: `src/extension/background/sync-orchestrator.js`
- Create: `src/extension/background/runtime-gates.js`
- Modify: `src/extension/background/sync.js`
- Modify: `src/extension/background/session-store.js`
- Modify: `src/extension/background/sync-scheduler.js`
- Modify: `src/extension/shared/constants.js`
- Modify: `background.js`
- Modify: `src/ui/options.js`
- Modify: `options.html`
- Modify: `README.md`
- Create: `tests/background/sync-orchestrator.test.js`
- Create: `tests/background/runtime-gates.test.js`
- Modify: `tests/background/sync.test.js`
- Modify: `tests/background/session-store.test.js`
- Modify: `tests/background/sync-scheduler.test.js`

## Chunk 1: Session Metadata and Per-Session Sync

### Task 1: Add failing tests for session-level retry metadata

**Files:**
- Modify: `tests/background/session-store.test.js`

- [ ] **Step 1: Write a failing test for session sync metadata defaults**

Cover:
- new sessions initialize retry metadata fields

- [ ] **Step 2: Write a failing test for success metadata updates**

Cover:
- successful sync resets `consecutiveFailureCount`
- `nextRetryAt` clears
- `lastSuccessfulSyncAt` updates

- [ ] **Step 3: Write a failing test for failure metadata updates**

Cover:
- failed sync increments `consecutiveFailureCount`
- `lastFailedSyncAt` updates
- `lastTrigger` and `lastSkippedReason` are writable

- [ ] **Step 4: Run the session store tests and verify they fail**

Run: `npm.cmd test -- tests/background/session-store.test.js`
Expected: FAIL because the metadata is not implemented yet.

### Task 2: Implement session-level retry metadata

**Files:**
- Modify: `src/extension/background/session-store.js`
- Modify: `tests/background/session-store.test.js`

- [ ] **Step 1: Add new sync metadata fields to session creation**

Add:
- `lastSuccessfulSyncAt`
- `lastFailedSyncAt`
- `consecutiveFailureCount`
- `nextRetryAt`
- `lastTrigger`
- `lastSkippedReason`

- [ ] **Step 2: Extend sync result update logic**

Handle:
- success reset behavior
- failure increment behavior
- optional trigger/skipped reason persistence

- [ ] **Step 3: Run the session store tests**

Run: `npm.cmd test -- tests/background/session-store.test.js`
Expected: PASS

### Task 3: Add failing tests for syncing one specified session

**Files:**
- Modify: `tests/background/sync.test.js`

- [ ] **Step 1: Write a failing test for syncing a specified non-current session**

Cover:
- sync helper accepts `sessionId`
- only the target session is uploaded

- [ ] **Step 2: Write a failing test for success resetting backoff metadata**

Cover:
- successful run clears `nextRetryAt`

- [ ] **Step 3: Write a failing test for failure computing next retry**

Cover:
- failed run sets `nextRetryAt`
- failed run increments `consecutiveFailureCount`

- [ ] **Step 4: Run sync tests and verify they fail**

Run: `npm.cmd test -- tests/background/sync.test.js`
Expected: FAIL because sync still only targets the current session and does not manage backoff metadata.

### Task 4: Implement per-session sync execution

**Files:**
- Modify: `src/extension/background/sync.js`
- Modify: `tests/background/sync.test.js`

- [ ] **Step 1: Add support for explicit `sessionId` input**

- [ ] **Step 2: Add trigger-aware metadata writes**

- [ ] **Step 3: Add backoff calculation with max cap**

- [ ] **Step 4: Run sync tests**

Run: `npm.cmd test -- tests/background/sync.test.js`
Expected: PASS

## Chunk 2: Gates and Orchestrator

### Task 5: Add failing tests for runtime gates

**Files:**
- Create: `tests/background/runtime-gates.test.js`

- [ ] **Step 1: Write a failing test for idle gate reduction**

Cover:
- active state reduces concurrency to `1`
- idle or locked state keeps requested concurrency

- [ ] **Step 2: Write a failing test for battery-aware degradation**

Cover:
- unsupported battery API degrades cleanly
- low battery can return a power-save skip or reduced mode

- [ ] **Step 3: Run runtime gate tests and verify they fail**

Run: `npm.cmd test -- tests/background/runtime-gates.test.js`
Expected: FAIL because the module does not exist yet.

### Task 6: Implement runtime gates helper

**Files:**
- Create: `src/extension/background/runtime-gates.js`
- Modify: `tests/background/runtime-gates.test.js`

- [ ] **Step 1: Implement idle gate policy**

- [ ] **Step 2: Implement best-effort battery gate policy**

- [ ] **Step 3: Run runtime gate tests**

Run: `npm.cmd test -- tests/background/runtime-gates.test.js`
Expected: PASS

### Task 7: Add failing tests for the multi-session orchestrator

**Files:**
- Create: `tests/background/sync-orchestrator.test.js`
- Modify: `tests/background/sync-scheduler.test.js`

- [ ] **Step 1: Write a failing test for candidate session selection**

Cover:
- sessions with no `pending` or `failed` actions are skipped
- sessions inside backoff window are skipped

- [ ] **Step 2: Write a failing test for limited concurrency**

Cover:
- orchestrator executes at most configured concurrent sessions

- [ ] **Step 3: Write a failing test for one-session failure not aborting sweep**

Cover:
- other sessions still run and report results

- [ ] **Step 4: Write a failing test for manual trigger bypassing gates**

Cover:
- manual trigger still runs when idle/power gate would skip automatic work

- [ ] **Step 5: Run orchestrator-related tests and verify they fail**

Run: `npm.cmd test -- tests/background/sync-orchestrator.test.js tests/background/sync-scheduler.test.js`
Expected: FAIL because orchestrator logic is not implemented yet.

### Task 8: Implement scheduler policy and orchestrator

**Files:**
- Create: `src/extension/background/sync-orchestrator.js`
- Modify: `src/extension/background/sync-scheduler.js`
- Modify: `src/extension/shared/constants.js`
- Modify: `tests/background/sync-orchestrator.test.js`
- Modify: `tests/background/sync-scheduler.test.js`

- [ ] **Step 1: Add V2 settings defaults**

Add:
- `maxConcurrentSessionSyncs`
- `syncBackoffEnabled`
- `maxSyncBackoffMinutes`
- `idleGateEnabled`
- `batteryAwareSyncEnabled`

- [ ] **Step 2: Extend scheduler policy to include V2 knobs**

- [ ] **Step 3: Implement orchestrator planning**

Cover:
- candidate enumeration
- backoff checks
- gate decisions
- concurrency selection

- [ ] **Step 4: Implement orchestrator execution**

Cover:
- bounded parallel execution
- per-session result aggregation

- [ ] **Step 5: Run orchestrator-related tests**

Run: `npm.cmd test -- tests/background/runtime-gates.test.js tests/background/sync-orchestrator.test.js tests/background/sync-scheduler.test.js`
Expected: PASS

## Chunk 3: Background Integration and UI

### Task 9: Add failing tests for background entry-point routing

**Files:**
- Modify: `tests/background/sync-orchestrator.test.js`

- [ ] **Step 1: Write a failing test for startup/alarm/manual routing assumptions if direct unit seams exist**

If direct background entry testing is too heavy, document the routing through smaller helper seams instead of inventing a full browser harness.

- [ ] **Step 2: Run the affected tests and verify red where applicable**

### Task 10: Integrate orchestrator into background entry points

**Files:**
- Modify: `background.js`
- Modify: `manifest.json` if additional permissions are required

- [ ] **Step 1: Replace single-session automatic flows with orchestrator entry points**

- [ ] **Step 2: Keep recent-action sync lightweight**

- [ ] **Step 3: Route startup and alarm through the full orchestrator**

- [ ] **Step 4: Keep manual retry higher priority and gate-bypassing**

- [ ] **Step 5: Run syntax checks**

Run:
- `node --check background.js`

Expected: PASS

### Task 11: Expose V2 controls in the options UI

**Files:**
- Modify: `src/ui/options.js`
- Modify: `options.html`

- [ ] **Step 1: Add new form controls**

Add:
- max concurrent session syncs
- sync backoff enabled
- max sync backoff minutes
- idle gate enabled
- battery-aware sync enabled

- [ ] **Step 2: Load and save the new values**

- [ ] **Step 3: Run syntax checks**

Run:
- `node --check src/ui/options.js`

Expected: PASS

## Chunk 4: Docs and Final Verification

### Task 12: Update docs and verify the full feature set

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document V2 background sync behavior**

Cover:
- multi-session compensation
- exponential backoff
- limited concurrency
- idle and battery gating semantics

- [ ] **Step 2: Run the full automated test suite**

Run: `npm.cmd test`
Expected: PASS

- [ ] **Step 3: Perform manual smoke checks**

Check:
- multiple sessions with pending work are retried over time
- repeated failures back off progressively
- manual retry still runs immediately
- disabling idle or battery gating changes behavior as expected

- [ ] **Step 4: Record deferred follow-up items**

Keep deferred scope limited to:
- cross-device sync orchestration
- durable persistent task queue
- server-directed scheduling policy
