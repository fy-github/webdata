# Local Records Workbench Design

Date: 2026-04-03

## Context

The extension already includes a local records page:

- `records.html`
- `src/ui/records.js`
- `background.js` message action `getRecords`

That page currently behaves like a lightweight viewer:

- filter by one session
- filter by one event type
- refresh and inspect raw JSON

This is enough for quick debugging, but it is not yet useful as a real local data console. The server-side dashboard already supports richer browsing and management, while the extension records page still has a narrow "peek at recent actions" role.

The next step upgrades the extension records page into a local records workbench: a local-first browsing surface for recorded actions that feels closer to a lightweight dashboard, while still querying extension-local state only.

## Goals

- Turn the extension records page into a local data workbench rather than a simple viewer
- Add richer filtering for locally recorded actions
- Keep the data source local to the extension so the page remains usable without server configuration
- Move filtering logic into the background query path instead of duplicating it in the page script
- Shape the query and response models so they can later align with a local/remote unified query model

## Non-Goals

- No direct server-backed querying from the extension records page in this phase
- No pagination in this phase
- No sorting controls in this phase
- No local/remote shared query engine extraction yet
- No changes to the server dashboard behavior in this phase
- No action screenshots or DOM snapshot capture in this phase

## Product Direction Already Confirmed

- Prefer the "local workbench" direction instead of keeping the page as a simple debug view
- Implement the local data workbench approach rather than front-end-only filtering
- Preserve a path toward a future local/remote unified query model
- Stop at advanced filtering for this phase, without adding pagination or sorting yet

## High-Level Architecture

This phase is split into three responsibilities:

1. `background.js` becomes the local query entry point for structured record lookups
2. a focused local query helper performs normalization, filtering, and summary generation over extension state
3. `records.html` and `src/ui/records.js` become a local workbench UI that renders the query response

This keeps the filtering semantics centralized and testable while allowing the UI to stay thin.

## Query Model

The upgraded `getRecords` message accepts a structured `filters` object. The response shape is intentionally designed to be reusable later if local and remote querying are unified.

### Filters

Supported filters in this phase:

- `sessionId`
- `eventType`
- `syncStatus`
- `dateFrom`
- `dateTo`
- `keyword`

### Filter Semantics

- `sessionId`: narrows results to one session when provided
- `eventType`: matches one action type such as `click`, `input`, `navigation`, or `scroll`
- `syncStatus`: matches action sync states such as `pending`, `failed`, or `synced`
- `dateFrom`: includes actions whose `timestamp` is greater than or equal to the normalized lower bound
- `dateTo`: includes actions whose `timestamp` is less than or equal to the normalized upper bound
- `keyword`: performs a case-insensitive fuzzy match against readable action fields

### Keyword Coverage

Keyword matching should cover the fields most useful for local inspection:

- `target.selector`
- `target.tagName`
- `target.id`
- `target.className`
- `target.name`
- `target.placeholder`
- `target.ariaLabel`
- `target.text`
- `page.url`
- `page.title`
- `payload.value`
- `payload.key`

The goal is practical discoverability, not exhaustive full-text indexing.

## Response Model

The upgraded response returns:

- `sessions`
- `actions`
- `summary`
- `query`
- `currentSessionId`

### `sessions`

The page still needs the local session list for the session selector. This should remain available even when the filtered action result is empty.

### `actions`

This is the filtered action list to render in the main table.

### `summary`

Summary is generated from the filtered result set and includes:

- total action count
- counts by sync status
- counts by event type

This supports a more dashboard-like overview without requiring pagination.

### `query`

The normalized query object is echoed back so the UI can reflect what actually took effect. This is especially useful later if local and remote query adapters share a common shape.

## UI Design

The records page becomes a "filter bar + summary + list + detail" layout.

### Top Filter Bar

Controls in this phase:

- session selector
- event type selector
- sync status selector
- date from input
- date to input
- keyword input
- refresh button
- reset filters button

Interaction rules:

- changing selectors triggers a refresh immediately
- date changes trigger a refresh immediately
- keyword uses a short debounce before refresh
- reset returns to the default workbench state

### Summary Strip

The page shows a compact summary of the current result set:

- total hits
- pending count
- failed count
- synced count
- optional event-type mini counts

This gives the page a local-dashboard feel without making it visually heavy.

### Results Table

The list remains action-oriented and should show at least:

- timestamp
- event type
- target summary
- payload or page summary
- sync status

The detail pane continues to show the selected action JSON, with room left for future richer previews.

### Empty State

When no actions match the current query, the page should show an explicit empty state rather than an empty-looking table.

## Default View Behavior

The default workbench state should stay practical for everyday use:

- default to the current session if available
- otherwise show all sessions
- no event type filter
- no sync status filter
- no keyword
- no date bounds

This preserves the "quick local check" behavior while allowing the user to branch into deeper filtering.

## File Boundaries

Create:

- `src/extension/background/records-query.js`
- `tests/background/records-query.test.js`
- `tests/ui/records-ui.test.js`

Modify:

- `background.js`
- `records.html`
- `src/ui/records.js`

## Testing Strategy

### Background Query Tests

Required coverage:

- filter normalization
- session filter
- event type filter
- sync status filter
- date range filter
- keyword filter
- combined filter behavior
- summary generation
- query echo behavior

### Records UI Tests

The UI tests should stay lightweight and align with the existing dashboard shell tests:

- confirm the new filter controls exist
- confirm the summary region exists
- confirm the two-column workbench layout remains intact
- confirm reset and refresh hooks are present in the client script

### Syntax Checks

- `node --check src/ui/records.js`

## Error Handling

- missing or malformed filter values are normalized to safe defaults
- invalid date bounds do not crash the page
- keyword matching never assumes optional fields exist
- failed `getRecords` responses should render a visible error in the detail panel or status area

## Future Compatibility With Unified Local/Remote Querying

This phase deliberately keeps the query surface neutral:

- structured `filters`
- normalized `query`
- `summary` block
- stable `actions` payload

Later, a remote adapter can expose the same request and response shape without forcing the records page to learn a second rendering model. That future direction is preserved, but not implemented yet.

## Recommendation

Implement the records page upgrade as a local workbench backed by a structured background query helper. This adds the filtering depth the product needs now, keeps the page useful without a server, and lays a clean foundation for a later unified local/remote query model without overbuilding it today.
