# Browser Action Monitor Server Dashboard V2 Design

## Overview

Phase 2 adds a server-side web dashboard for browsing and managing captured sessions. The dashboard is a read/write admin surface built directly into the existing Express service using server-rendered HTML plus small vanilla JavaScript enhancements. It must remain compatible with the current JSON storage model while leaving room for future auth, multi-project separation, and richer dataset workflows.

## Goals

- Add a browser-accessible dashboard to the Node.js service.
- Display sessions as the primary management unit.
- Support keyword search, filters, pagination, and bulk selection.
- Support session tags, session export, session deletion, and bulk operations.
- Support single action deletion from within a session detail drawer.
- Preserve future upgrade paths for auth, multi-project support, review queues, and richer exporters.

## Non-Goals

- Login or account system.
- API key enforcement on dashboard routes.
- Multi-project or multi-device separation.
- Database migration.
- Review workflows, screenshot views, or action-level labels.

## Dashboard Structure

### Route Layout

- `GET /dashboard`
  - Main session list page
- `GET /dashboard/session/:sessionId`
  - Same dashboard shell with a pre-opened detail drawer
- `GET /api/...`
  - JSON endpoints for list/detail/update/delete/export interactions

### UI Layout

The UI follows the approved “B” layout:

- Top toolbar
  - Search
  - Tag filter
  - Sync status filter
  - Time range filter
  - Batch action bar
- Main session table
  - Multi-select
  - Session metadata columns
  - Pagination
- Right detail drawer
  - Session overview
  - Tag editor
  - Export/delete actions
  - Nested action list
  - Action detail view with readable fields plus raw JSON

## Data Model Changes

### Session additions

Each session gains optional management metadata:

```json
{
  "tags": ["checkout", "training"],
  "management": {
    "createdAt": 1710000000000,
    "updatedAt": 1710001234567
  }
}
```

Notes:

- Tags live on sessions only.
- Existing sessions without tags remain valid.
- Management fields are optional and backfilled lazily.

### Action deletion support

The repository must support locating an action by `actionId`, removing it from its owning session, and updating the parent session’s `actionCount` and timestamps when needed.

## API Additions

### Read endpoints

- `GET /api/sessions`
  - Query params:
    - `q`
    - `tag`
    - `status`
    - `dateFrom`
    - `dateTo`
    - `page`
    - `pageSize`
- `GET /api/sessions/:sessionId`
- `GET /api/tags`
  - Returns all known tags for filter UIs

### Write endpoints

- `PATCH /api/sessions/:sessionId/tags`
  - Replace tags on a session
- `DELETE /api/sessions/:sessionId`
- `DELETE /api/actions/:actionId`
- `POST /api/sessions/bulk/tags`
- `POST /api/sessions/bulk/delete`
- `POST /api/sessions/bulk/export`

## Export Behavior

Exports remain JSON-first.

- Single export returns the existing session JSON shape.
- Bulk export returns:

```json
{
  "exportedAt": 1710001234567,
  "sessionCount": 2,
  "sessions": [
    { "sessionId": "ses_1", "actions": [] }
  ]
}
```

This keeps V2 simple while allowing future zipped exporters or agent-specific export templates.

## Repository Responsibilities

The repository becomes the stable boundary for future storage upgrades. It must expose clearly separated methods:

- `saveBatch`
- `listSessions`
- `getSession`
- `listTags`
- `updateSessionTags`
- `deleteSession`
- `deleteAction`
- `bulkDeleteSessions`
- `bulkTagSessions`
- `exportSessions`

Internally it continues using `server/data/store.json`, but route handlers should no longer manipulate the raw JSON structure directly.

## UI Behavior

### Session list

- Default sort: newest sessions first
- Search matches:
  - `sessionId`
  - `lastUrl`
  - tag text
- Filters combine with AND semantics
- Multi-select enables batch actions

### Session drawer

- Opens when clicking a session row
- Shows:
  - metadata
  - tags
  - actions table
  - export/delete controls
- Action rows open a nested detail panel

### Batch actions

- Batch tag: replace or append tags to selected sessions
- Batch export: export selected sessions as one JSON payload
- Batch delete: confirm before destructive action

## Extensibility Guidance

Phase 2 must keep clean boundaries for later additions:

- Dashboard auth can be added as route middleware without rewriting view logic.
- Project/device separation can be added as query scoping in repository methods.
- Dataset/review/export modules can be added as new top-level dashboard sections without rewriting the session list shell.

## Testing Strategy

- Repository tests for:
  - tag updates
  - filtering
  - pagination
  - delete session
  - delete action
  - bulk tag
  - bulk export
- API tests for:
  - dashboard page render
  - new JSON endpoints
  - destructive operations
- Manual checks for:
  - search and filter behavior
  - drawer interaction
  - batch selection and export flow

## Deferred to Later Phases

- Dashboard auth
- Review queue
- Dataset builder
- Action-level labels
- Screenshot and DOM snapshot display
- Background job orchestration for large exports
