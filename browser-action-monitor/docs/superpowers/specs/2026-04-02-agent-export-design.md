# Agent Export Design

Date: 2026-04-02

## Context

The project already records browser actions through the extension and stores sessions on the server. The next stage is to make collected sessions more useful for agent training and browser replay by exporting richer agent-oriented artifacts instead of only the current raw JSON payload.

This design targets a first usable version with a single export pipeline owned by the server and reused by both the dashboard and the extension.

## Goals

- Export one session into agent-oriented artifacts that are directly usable for:
  - dataset building
  - Playwright replay
  - higher-level task learning
- Keep one canonical export implementation on the server
- Let both the server dashboard and the extension download the same export result
- Support both a single JSON bundle and a ZIP bundle
- Produce three layers of output:
  - raw low-level steps
  - enhanced executable Playwright steps
  - rule-based high-level task summary
- Keep the first version fully offline and deterministic

## Non-Goals

- No LLM dependency in V1
- No screenshot or DOM snapshot packaging in this phase
- No asynchronous export job queue
- No replacement of the existing plain JSON export
- No local-only agent export logic duplicated inside the extension

## Product Decisions Already Confirmed

- Export both low-level and high-level agent formats
- Keep both raw-like and executable Playwright variants
- Make the server the source of truth for export generation
- Allow both dashboard and extension export entry points
- Support both JSON and ZIP output
- Use rule-based summarization now and reserve an LLM plug-in point for later

## High-Level Architecture

The new export path will be organized as a server-side pipeline:

1. Repository loads the session and actions
2. Export service normalizes the session into a stable internal model
3. Specialized exporters derive:
   - raw steps
   - Playwright bundle
   - summary bundle
4. Bundle formatter emits:
   - one JSON document, or
   - one ZIP archive with multiple files
5. API returns the artifact to the caller

The dashboard and extension will call the same server export API so the conversion rules stay in one place.

## Components

### 1. Export Service

Add a dedicated service layer under the server for agent export. It owns orchestration only and does not contain transport or UI code.

Responsibilities:

- validate export request
- load source session data
- call each exporter
- assemble metadata
- choose JSON or ZIP formatter

### 2. Raw Step Exporter

Transforms recorded browser actions into a stable low-level step list while staying close to the original captured behavior.

Responsibilities:

- map each supported action to a normalized step shape
- preserve timestamps, selectors, page info, privacy flags, and source action IDs
- keep noisy actions if they were truly captured, but mark them with type and replay suitability

### 3. Playwright Exporter

Produces two outputs:

- `rawLikeSteps`: near one-to-one Playwright-oriented mapping
- `executableSteps`: replay-focused steps with rule-based cleanup and merging

Responsibilities:

- turn navigation into `goto`
- turn clicks into locator-driven `click`
- turn input/change into `fill`
- preserve meaningful keys like `Enter`, `Tab`, and `Escape`
- merge obvious intermediate noise
- attach confidence levels to each generated step

### 4. Summary Exporter

Builds a rule-based high-level task summary using action sequences and page transitions.

Responsibilities:

- split the flow into task segments
- use navigation as a strong stage boundary
- group consecutive form inputs into a form-fill task
- group submit and subsequent URL changes into a submit-and-transition task
- emit structured task objects instead of only free text

### 5. Bundle Formatter

Formats the export result as either:

- one JSON document, or
- one ZIP archive containing multiple JSON files

## Export Data Model

## Single JSON Shape

```json
{
  "meta": {
    "version": "v1",
    "exportedAt": 1712345678901,
    "source": "browser-action-monitor",
    "format": "agent-json",
    "privacyEnabled": true
  },
  "session": {
    "sessionId": "ses_xxx",
    "startedAt": 1712345600000,
    "endedAt": 1712345670000,
    "lastUrl": "https://example.com/login",
    "tags": []
  },
  "rawSteps": [],
  "playwright": {
    "rawLikeSteps": [],
    "executableSteps": [],
    "script": ""
  },
  "summary": {
    "tasks": [],
    "stats": {}
  }
}
```

## ZIP Layout

Default ZIP output will contain:

- `manifest.json`
- `raw-steps.json`
- `playwright.json`
- `summary.json`

This structure leaves room for future additions like `dom-snapshots.json` or `screenshots/` without changing the API contract shape.

## Raw Step Rules

Each raw step will include:

- stable step id
- source action id
- action type
- timestamp
- page context
- target selector and target metadata if available
- payload after privacy masking rules have already been applied
- replayability hint

Supported mappings in V1:

- `navigation` -> `navigate`
- `click` -> `click`
- `input` -> `input`
- `change` -> `change`
- `submit` -> `submit`
- `keydown` -> `keydown`
- `scroll` -> `scroll`

`mousemove` remains available in raw output only if it was captured, but it should be marked as low replay value.

## Playwright Generation Rules

### Raw-Like Steps

These steps are close to the original action stream:

- `navigation` -> `page.goto(url)`
- `click` -> `page.locator(selector).click()`
- `input` and `change` -> `page.locator(selector).fill(value)`
- meaningful `keydown` values -> `page.keyboard.press(key)`

### Executable Steps

These steps are optimized for replay:

- merge repeated input intermediate states where safe
- merge adjacent input and change operations on the same target
- drop low-value noise such as passive mouse movement
- prefer stable selectors already captured by the recorder
- assign `confidence`:
  - `high`
  - `medium`
  - `low`

The exporter should only emit a script string from executable steps, never from raw steps.

## Summary Generation Rules

The summary output must be structured and deterministic.

Task segmentation rules in V1:

- new navigation usually starts a new task block
- consecutive input/change actions on related fields form a `form_fill` block
- click on buttons or links forms an `action_trigger` block
- submit plus later URL transition forms `submit_and_navigate`
- scroll is kept in raw data and only summarized if it is the dominant action in a segment

Example task object:

```json
{
  "id": "task_2",
  "type": "form_fill",
  "title": "填写登录表单",
  "startActionId": "act_4",
  "endActionId": "act_8",
  "fields": ["email", "password"]
}
```

## API Design

Keep the existing export APIs intact and add agent export endpoints.

### New Endpoints

- `GET /api/sessions/:sessionId/export?format=json&type=agent`
- `GET /api/sessions/:sessionId/export?format=zip&type=agent`
- `POST /api/sessions/bulk/export-agent`

Bulk agent export should return one ZIP archive containing one folder per session in the first version.

## UI Design

### Dashboard

Extend current export actions with explicit agent export choices:

- plain JSON
- agent JSON
- agent ZIP

For batch export:

- plain JSON bundle
- agent ZIP bundle

### Extension

The extension should expose the same export choices, but the actual conversion stays on the server.

V1 behavior:

- if server is configured and reachable, call the server export API and download the result
- if server is not configured, disable agent export and show a clear message that agent export requires the server

## Error Handling

- if session does not exist, return 404
- if requested export type or format is unsupported, return 400
- if ZIP generation fails, return 500 with a short export-specific error message
- if an action cannot be translated into executable Playwright form, keep it in `rawSteps`, optionally keep it in `rawLikeSteps`, and record the reason in exporter diagnostics instead of failing the whole export

## Extensibility

The design should keep a clean future insertion point for:

- LLM-assisted summary generation
- screenshot packaging
- DOM snapshot packaging
- additional replay formats beyond Playwright

This means exporter modules should return structured objects and diagnostics rather than only finalized strings.

## Testing Strategy

Add server-side tests first.

Required V1 coverage:

- raw exporter maps recorded actions into normalized raw steps
- Playwright exporter emits both raw-like and executable variants
- summary exporter groups action sequences into task blocks
- JSON export endpoint returns all three layers
- ZIP export endpoint returns expected filenames
- dashboard export controls expose the new options
- extension export entry correctly handles the "server not configured" state

## Implementation Boundaries For V1

Included:

- server export service
- agent export API
- dashboard agent export UI
- extension agent export entry wired to server APIs
- JSON and ZIP outputs
- rule-based summary
- Playwright raw-like and executable variants

Deferred:

- LLM summary
- screenshots
- DOM snapshots
- background export jobs
- local extension-side export generation without server

## Risks

- selector quality may limit executable replay success
- raw action streams may contain noisy input transitions that need conservative merging
- large sessions may make ZIP generation memory-heavy if done naively in memory

V1 should prefer correctness and traceability over aggressive replay optimization.

## Recommendation

Implement the export pipeline as a dedicated server module rather than extending existing route handlers directly. This keeps format logic centralized, supports both dashboard and extension entry points, and makes later expansion to richer agent artifacts materially easier.
