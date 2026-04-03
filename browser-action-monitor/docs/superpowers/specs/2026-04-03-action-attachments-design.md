# Action Attachments Design

Date: 2026-04-03

## Context

The extension already records normalized browser actions and supports:

- local action/session storage
- local records browsing
- agent-oriented export
- optional remote sync

The current action model captures:

- page metadata
- target metadata
- payload
- privacy state
- sync state

It does not yet capture richer evidence for each action. The next product step is to attach DOM snapshots and screenshots in a way that remains usable under large data volume, privacy-sensitive scenarios, and optional remote sync.

## Goals

- Attach richer evidence to recorded actions using DOM snapshots and screenshots
- Keep action recording fast and non-blocking even when screenshot capture is slow or unavailable
- Support privacy-aware capture for both DOM snapshots and screenshots
- Keep the feature practical under large datasets through storage controls, throttling, and automatic degradation
- Extend local records, agent export, and server sync so attachments remain visible and usable end to end
- Add explicit operator controls to enable or disable DOM snapshots and screenshots independently

## Non-Goals

- No full-page long screenshot capture in this phase
- No video capture or replay in this phase
- No OCR or semantic screenshot understanding in this phase
- No full remote object storage migration in this phase
- No login/auth redesign in this phase
- No cross-device attachment deduplication in this phase

## Product Direction Already Confirmed

- Attach both DOM snapshots and screenshots
- Attempt screenshot capture for every action
- Record DOM snapshots first and use them as the guaranteed fallback
- Keep screenshot capture asynchronous rather than blocking action ingestion
- When privacy protection is enabled, keep both DOM snapshots and screenshots but apply masking/redaction
- Add large-volume protection so the system can degrade gracefully rather than fail outright
- Add separate settings for DOM snapshot capture and screenshot capture, both enabled by default
- Allow automatic shutdown of attachment capture when pressure thresholds are reached

## High-Level Architecture

This phase adds an attachment pipeline alongside the existing action pipeline:

1. content capture produces the raw action plus a lightweight DOM snapshot candidate
2. normalization writes attachment metadata into the action record without embedding heavy binary content
3. background storage persists the action immediately
4. a background attachment queue attempts screenshot capture asynchronously
5. export and sync layers move attachment metadata first and screenshot files separately
6. local and server UIs surface attachment state, previews, and fallbacks

The design keeps action ingestion and attachment capture decoupled so heavy attachment work cannot break the primary recording flow.

## Action Model Changes

Each action gains an `attachment` block while preserving the existing top-level action structure.

### Attachment Structure

- `domSnapshot`
- `screenshot`

### DOM Snapshot Shape

The DOM snapshot is lightweight and action-local. It should include:

- capture status
- capture timestamp
- a trimmed structural node tree rooted around the target
- a text/HTML preview summary for quick inspection
- privacy metadata indicating whether values were masked

### Screenshot Shape

The screenshot block stores metadata and references, not the image bytes inside the main action record. It should include:

- capture status
- capture timestamp
- mime type
- image size metadata
- local storage key or attachment identifier
- privacy/redaction metadata
- latest error or skip reason

### Status Model

DOM snapshot status values:

- `ready`
- `disabled_manual`
- `disabled_auto_quota`
- `failed`

Screenshot status values:

- `pending`
- `ready`
- `failed`
- `skipped`
- `skipped_quota`
- `disabled_manual`
- `disabled_auto_quota`
- `failed_privacy_guard`

## Capture Flow

### Action Ingestion

For each recorded browser action:

1. the action is normalized as usual
2. if DOM snapshot capture is enabled, a lightweight DOM snapshot is created synchronously and attached
3. the action is appended to session state immediately
4. if screenshot capture is enabled, a screenshot task is queued using the action id and tab context

This guarantees that actions remain available even when screenshot capture fails or is skipped.

### Screenshot Capture

Screenshots are captured asynchronously by the background layer using browser-level capture APIs rather than the content script.

Key rules:

- action recording never waits for screenshot completion
- screenshot tasks are queued by action id and tab id
- capture is limited to the visible viewport in this phase
- queued tasks run with low concurrency to avoid browser instability
- screenshot results update only the related action attachment state

### Failure and Fallback

When screenshot capture fails because of visibility, permissions, runtime timing, or privacy masking failure:

- the action remains valid
- the DOM snapshot remains the fallback evidence
- the screenshot attachment stores the failure or skip reason

## Privacy Model

### DOM Snapshot Privacy

When privacy protection is disabled:

- DOM snapshots may include readable nearby text and non-sensitive values within bounded limits

When privacy protection is enabled:

- sensitive inputs and editable targets must be masked
- high-risk values must not be stored raw
- long text and attribute values must be truncated aggressively
- output must preserve enough structural information for training without preserving secrets

### Screenshot Privacy

When privacy protection is disabled:

- screenshots may be stored as captured

When privacy protection is enabled:

- sensitive targets and high-risk visible fields must be masked before the screenshot is committed
- if masking cannot be applied reliably, the screenshot is discarded and marked `failed_privacy_guard`
- discarded screenshots must not be exported or uploaded

### Privacy Metadata

Attachment exports must clearly indicate whether the evidence is:

- raw
- masked
- unavailable because privacy enforcement blocked capture

## Scale and Large-Volume Strategy

Large data volume is a first-class requirement in this phase.

### Storage Separation

Action records remain lightweight:

- action JSON stores only attachment metadata and references
- DOM snapshots stay compact and bounded
- screenshot binaries are stored separately from the main action list

This prevents records browsing, filtering, and summary generation from loading large image payloads.

### Capture Quotas

Even though screenshots are attempted for every action, the system must apply hard limits:

- per-session screenshot cap
- per-minute screenshot throughput cap
- queued screenshot backlog cap
- local attachment storage cap

When a limit is exceeded:

- new actions still record normally
- DOM snapshots continue if allowed
- screenshots are marked `skipped_quota`

### Compression and Downscaling

Screenshots must not be stored as original high-size images:

- compress to a bounded lossy format such as JPEG or WebP when practical
- constrain maximum dimensions
- store viewport captures only

### Lazy Loading

UI surfaces must not preload large attachment sets:

- lists show attachment state only
- details panels fetch or render previews on demand
- server pages load previews only for the selected action

### Retention and Cleanup

Attachments need an independent lifecycle:

- actions may remain even when screenshot binaries are later deleted
- uploaded screenshots may be eligible for local cleanup
- exported data must tolerate missing screenshot files and preserve attachment status

## Feature Controls and Automatic Shutdown

This phase adds two independent capture settings:

- `DOM snapshot capture`
- `Screenshot capture`

Both default to enabled.

### Manual Disable

Users can manually disable either feature. When disabled manually:

- no new attachment of that type is created
- historical attachments remain intact
- exports and queries remain backward-compatible

### Automatic Shutdown

The system must automatically disable attachment features when pressure becomes too high.

Signals may include:

- session action volume beyond threshold
- screenshot queue backlog beyond threshold
- local attachment storage near cap
- sustained screenshot failure rate
- upload backlog pressure

Shutdown order:

1. disable screenshot capture first
2. disable DOM snapshot capture only if pressure remains too high
3. continue recording core actions at all times

### Recovery Behavior

Automatic shutdown should be stable and predictable:

- no aggressive auto-reenable flapping in this phase
- manual disable always wins over automatic state changes
- auto-disabled features stay off until the user re-enables them or a new session policy explicitly resets them

### Operator Feedback

Popup and records UI must show whether each feature is:

- enabled
- manually disabled
- automatically disabled due to quota or pressure

The UI should also surface the disable reason where available.

## Export Design

### Local Export

Existing export entry points remain intact, but the payload is extended:

- action JSON includes attachment metadata
- screenshot files are referenced rather than embedded inline

### JSON Export

JSON exports include:

- action attachment metadata
- DOM snapshot data
- relative screenshot references when available

### ZIP Export

ZIP exports include:

- session JSON
- screenshot files under an attachment directory

If a screenshot file is unavailable, the action still exports with attachment status and DOM snapshot data intact.

## Remote Sync Design

To avoid oversized requests and repeat the prior 413-class failure mode, remote sync is split:

1. sync action/session data plus attachment metadata first
2. upload screenshot binaries separately in small requests or batches

This allows the server to show actions immediately even if screenshots lag behind.

### Attachment Sync State

Attachment state should distinguish:

- action sync state
- screenshot upload state

This prevents false success where an action appears fully synced even though its screenshot never reached the server.

## UI Design

### Extension Popup

The popup settings area should add:

- DOM snapshot capture toggle
- screenshot capture toggle
- visible status when either feature is auto-disabled

### Extension Records Page

The local records page remains the local workbench and gains richer attachment visibility.

List changes:

- add an attachment indicator column or compact state badge

Detail pane changes:

- show DOM snapshot summary or structured preview
- show screenshot state
- show local screenshot preview when available
- show explicit fallback when only DOM evidence exists

### Server Dashboard

The server dashboard remains the remote view and should add:

- attachment coverage metrics
- screenshot availability metrics
- failed or pending attachment indicators
- selected-record preview for screenshot and DOM snapshot summaries

## File and Module Boundaries

Likely modified areas:

- `content.js`
- `background.js`
- `src/extension/shared/normalize.js`
- `src/extension/background/session-store.js`
- `src/extension/background/sync.js`
- `src/extension/background/agent-export.js`
- `src/ui/popup.js`
- `records.html`
- `src/ui/records.js`
- server-side upload/query/dashboard modules

Likely new modules:

- background attachment queue helper
- DOM snapshot helper
- screenshot capture helper
- attachment persistence helper
- attachment export helper
- server attachment handling module(s)

The goal is to isolate attachment responsibilities from the existing action core rather than growing `background.js` and UI scripts into monoliths.

## Testing Strategy

Required coverage in this phase:

- action normalization with attachment metadata defaults
- DOM snapshot creation and privacy masking
- screenshot task lifecycle and state transitions
- quota and auto-disable behavior
- export behavior with and without screenshot files
- sync behavior for metadata-first plus binary follow-up upload
- records UI rendering for ready, pending, failed, disabled, and fallback states
- server-side attachment status and preview behavior
- compatibility with actions recorded before the attachment feature existed

Recommended checks:

- `npm test`
- targeted UI tests for records and popup
- syntax checks for updated extension/background/server entry files

## Error Handling and Compatibility

- old actions without `attachment` fields must continue to work
- missing screenshot files must not crash exports, records pages, or sync
- privacy masking failures must fail closed for screenshots
- queue saturation must degrade to skip states rather than blocking action storage
- remote upload failures must preserve retriable state rather than silently claiming success

## Recommendation

Implement action attachments as a decoupled evidence pipeline:

- DOM snapshots are lightweight, synchronous, and the guaranteed fallback
- screenshots are asynchronous, separately stored, privacy-aware, and subject to quotas
- both capture modes are user-controllable and can automatically shut down under pressure

This approach delivers richer action evidence without sacrificing recording reliability, keeps the system practical under large datasets, and preserves a clean path for future expansion into stronger export, sync, and retention capabilities.
