# Background Resync Design

Date: 2026-04-02

## Context

The extension already supports manual sync and opportunistic sync shortly after new actions are recorded. This is enough for short happy-path sessions, but it leaves two reliability gaps:

- failed uploads can remain stuck until the user manually retries
- pending actions can remain local for too long when the browser or extension lifecycle interrupts the short in-memory retry path

The next phase adds a balanced background resync policy to improve remote durability without turning the extension into an aggressive polling client.

## Goals

- Retry `pending` and `failed` actions automatically in the background
- Run a startup compensation sync when the extension environment becomes available
- Reconfigure periodic sync automatically when settings change
- Keep the first version lightweight and fully deterministic
- Preserve current manual sync and immediate post-action sync behavior

## Non-Goals

- No job queue or server-side scheduler
- No multi-session concurrent sync manager
- No exponential backoff in this phase
- No push channel or websocket-based sync trigger
- No per-action retry policy customization

## Product Decision

This phase uses the confirmed "balanced" strategy:

1. keep the existing near-real-time sync after action capture
2. add background periodic retry for `pending` and `failed` actions
3. add startup compensation sync
4. re-run configuration and compensation when remote sync settings are saved

## High-Level Approach

The browser extension service worker becomes responsible for a second sync lane:

- the current short-delay sync path remains for fresh actions
- a new background alarm wakes the service worker periodically
- each wake attempts a conservative sync for the current session only

This keeps the implementation aligned with Manifest V3 constraints, where long-lived timers are unreliable and alarm-based wakeups are the stable option.

## Components

### 1. Sync Policy Settings

Add new extension settings:

- `syncBatchSize`
- `backgroundSyncEnabled`
- `backgroundSyncIntervalMinutes`
- `syncOnStartup`

These settings should live with existing extension defaults and be persisted in the same local storage payload.

### 2. Background Alarm Scheduler

Add a small scheduler layer in the extension background code that:

- creates one periodic alarm when remote sync is enabled
- clears the alarm when remote sync is disabled
- normalizes the sync interval to a safe minimum
- avoids duplicate alarm creation logic spread across handlers

### 3. Guarded Sync Runner

The background script should prevent overlapping sync attempts.

Requirements:

- if one sync is already running, new automatic triggers should return a skipped result
- manual sync should reuse the same guarded runner
- persistence should still happen after each completed sync attempt

### 4. Startup Compensation Trigger

When the extension background context initializes or the browser startup event fires, the extension should attempt one conservative sync if:

- remote sync is configured
- startup sync is enabled

If there are no pending or failed actions, the sync should safely return `skipped`.

### 5. Settings Reconfiguration Trigger

When the user saves settings:

- background alarm scheduling should be refreshed immediately
- if remote sync becomes enabled, one compensation sync should run once

## Data Flow

1. Extension loads settings and state
2. Background sync policy is normalized
3. Alarm schedule is created or cleared
4. One-time startup compensation sync may run
5. Alarm wakes service worker periodically
6. Guarded sync runner uploads `pending` and `failed` actions for the current session
7. Session sync summary is persisted back to local storage

## Settings UX

The options page should expose the new controls in the remote sync section:

- background sync enabled
- periodic interval in minutes
- sync on startup
- sync batch size

The first version should keep defaults conservative:

- `backgroundSyncEnabled: true`
- `backgroundSyncIntervalMinutes: 5`
- `syncOnStartup: true`
- `syncBatchSize: 100`

## Error Handling

- alarm-based sync failures should update normal session sync error state, not raise intrusive UI
- overlapping automatic sync attempts should be treated as skipped, not errors
- invalid or out-of-range interval values should be normalized to a safe minimum
- disabling remote sync should stop future alarm-based retries immediately

## Manifest and Platform Constraints

Because the extension uses Manifest V3 service workers, periodic sync should use `chrome.alarms` rather than relying on in-memory timers for long-running background behavior.

This requires adding the `alarms` permission.

## Testing Strategy

Required coverage in this phase:

- policy normalization for interval and toggle settings
- scheduler output for enabled vs disabled remote sync
- guarded runner behavior when sync is already in flight
- startup compensation behavior when sync is enabled
- settings save path reconfigures the scheduler
- existing sync tests continue to pass

## Recommendation

Implement a small dedicated background sync scheduler module rather than embedding all new logic directly in `background.js`. Keep the runner orchestration in the background entry point, but move policy normalization and alarm configuration into focused helpers so the new behavior is testable without a full browser harness.
