# Background Sync V2 Design

Date: 2026-04-03

## Context

The extension already supports:

- immediate short-delay sync after new actions are recorded
- startup compensation sync
- periodic background retry using one alarm

This is good enough for the single-session case, but it still leaves gaps:

- only the current session is retried automatically
- failed sessions do not have per-session exponential backoff
- scheduling logic is still mostly entry-point driven rather than policy driven
- idle and battery conditions are not considered

The next phase upgrades background sync into a small policy-driven orchestrator while keeping the implementation lightweight enough for a browser extension.

## Goals

- Retry all local sessions that still contain `pending` or `failed` actions
- Support bounded multi-session compensation with limited concurrency
- Add per-session exponential backoff with reset-on-success behavior
- Introduce a more capable background orchestrator without building a heavy persistent queue
- Gate automatic background work using browser idle state and best-effort battery awareness
- Keep manual sync usable and higher priority than background restrictions

## Non-Goals

- No cross-device or server-coordinated scheduling
- No persistent job table or durable queue state machine
- No websocket or server push sync triggers
- No per-project or per-tag sync routing in this phase
- No hard dependency on battery APIs being available

## Product Decisions Already Confirmed

- Start with local multi-session compensation only
- Battery awareness is best-effort and must gracefully degrade when unsupported
- Use a scheduler-style orchestrator rather than piling more logic into `background.js`

## High-Level Architecture

Background sync V2 is split into four layers:

1. `session-store` keeps session-level sync metadata
2. `sync.js` knows how to upload one specified session and update action/session sync state
3. `sync-orchestrator.js` selects candidate sessions, applies backoff and runtime gates, and executes limited-concurrency sync runs
4. `background.js` listens to browser events and invokes orchestrator entry points

This keeps the upload behavior, scheduling policy, and browser-specific event wiring separate.

## Core Concepts

### Session-Level Sync Metadata

Each session gets richer sync metadata stored alongside existing sync counters:

- `lastSuccessfulSyncAt`
- `lastFailedSyncAt`
- `consecutiveFailureCount`
- `nextRetryAt`
- `lastTrigger`
- `lastSkippedReason`

These fields are sufficient for:

- retry eligibility
- backoff windows
- debugging why a session was not processed

No separate persistent task table is required in this phase.

### In-Memory Runtime State

The orchestrator keeps a small in-memory runtime state:

- whether one sweep is currently running
- which session IDs are actively syncing
- last sweep timestamp

This state is intentionally not persisted because Manifest V3 service workers are ephemeral and "currently running" state should not survive process loss.

## Trigger Types

Background sync V2 recognizes four trigger types:

- `recent-action`
- `startup`
- `alarm`
- `manual`

Trigger handling rules:

- `manual` has highest priority and ignores idle/battery gating
- `startup` and `alarm` go through the full orchestrator
- `recent-action` primarily targets the active session and remains lightweight

## Multi-Session Compensation

Automatic compensation no longer stops at the current session.

Candidate session rules:

- session exists in local state
- session contains at least one `pending` or `failed` action
- session is not already running
- session is not inside the backoff window

Execution rules:

- process up to `maxConcurrentSessionSyncs` sessions per sweep
- only one in-flight sync is allowed per session
- one failed session must not abort the whole sweep

## Exponential Backoff

Backoff applies to failed sessions only.

Recommended sequence:

- first failure: 1 minute
- second failure: 2 minutes
- third failure: 4 minutes
- fourth failure: 8 minutes
- continue doubling up to a configured cap

When a session sync succeeds:

- `consecutiveFailureCount` resets to `0`
- `nextRetryAt` clears
- future failures restart from the shortest backoff window

## Runtime Gates

### Idle State

Idle gating only affects automatic triggers:

- `alarm`
- `startup`

Rules:

- if browser is idle or locked, background compensation can run normally
- if browser is active, automatic work may still run but at a reduced concurrency of `1`
- manual sync ignores idle gating

### Battery Awareness

Battery awareness is best-effort:

- if `navigator.getBattery` or equivalent access is available, low-battery state can reduce concurrency or skip the current automatic sweep
- if battery information is unavailable, orchestrator falls back to idle-only gating
- battery gating must never block manual sync

The goal is graceful power sensitivity, not strict power management.

## Orchestrator Output

The orchestrator should expose two structured outputs:

- `plan`
  - selected session IDs
  - skipped session IDs with reasons
  - effective concurrency
  - runtime gate decisions
- `result`
  - per-session success/failure/skipped entries
  - aggregate counts
  - trigger source

This supports future UI surfacing without coupling UI code to internal scheduler logic.

## Error Handling

- one session failure does not fail the entire sweep
- backoff-hit, idle-gated, power-gated, and already-running are `skipped`, not `error`
- unsupported battery API is not an error
- manual sync can still return session-level failures, but should not be blocked by background gate logic

## Settings

New V2 settings:

- `maxConcurrentSessionSyncs`
- `syncBackoffEnabled`
- `maxSyncBackoffMinutes`
- `idleGateEnabled`
- `batteryAwareSyncEnabled`

Recommended defaults:

- `maxConcurrentSessionSyncs: 2`
- `syncBackoffEnabled: true`
- `maxSyncBackoffMinutes: 60`
- `idleGateEnabled: true`
- `batteryAwareSyncEnabled: true`

## File Boundaries

Create:

- `src/extension/background/sync-orchestrator.js`
- `src/extension/background/runtime-gates.js`

Modify:

- `src/extension/background/sync.js`
- `src/extension/background/session-store.js`
- `src/extension/background/sync-scheduler.js`
- `src/extension/shared/constants.js`
- `background.js`
- `src/ui/options.js`
- `options.html`
- `README.md`

Tests:

- `tests/background/sync-orchestrator.test.js`
- `tests/background/runtime-gates.test.js`
- `tests/background/sync.test.js`
- `tests/background/session-store.test.js`
- `tests/background/sync-scheduler.test.js`

## Testing Strategy

Required coverage:

- session-level retry metadata updates
- single-session sync by explicit session ID
- candidate session selection
- concurrency limiting
- backoff calculation and reset-on-success
- idle gate reduction behavior
- battery-aware degradation behavior when battery API is missing or indicates low power
- background entry points routing to orchestrator

## Recommendation

Implement V2 as a policy-based orchestrator layered on top of the existing upload pipeline. This keeps the system understandable, allows the requested scheduling features to coexist cleanly, and avoids overcommitting to a heavy queue architecture before the product actually needs one.
