# Server Public API Design

Date: 2026-04-03

## Context

The server already exposes a working set of `/api/*` routes used by:

- the browser extension for uploads and sync
- the dashboard for querying, export, and management
- ad hoc local inspection workflows

The current issue is not the absence of read APIs. The issue is that these APIs are still shaped like internal application routes:

- read routes are not consistently protected when `AUTH_MODE=apiKey`
- error payloads are not normalized
- external consumers do not have a stable reference document
- read and management routes are mixed together without an explicit contract

The goal is to keep the current route set and success payloads, but formalize them into a stable public API surface.

## Goals

- Reuse the existing `/api/*` routes instead of introducing a parallel public API namespace
- Make read access to server-stored data safe for external consumers under API key mode
- Preserve compatibility for the dashboard and current extension workflows
- Publish clear external API documentation with authentication, parameters, and response examples
- Normalize error responses so external clients can handle them predictably

## Non-Goals

- No path versioning such as `/api/v1`
- No new OAuth, session, or user identity system
- No broad response-schema redesign for successful requests
- No CORS, rate-limiting, or tenancy redesign in this phase
- No new read models or query DSL beyond the current filters

## Product Direction Confirmed

- Directly reuse existing endpoints
- Add external-facing documentation
- Add consistent authentication behavior
- Normalize error payloads
- Keep successful response bodies compatible with existing clients

## API Surface Classification

### Read APIs

These routes are part of the public external data access surface:

- `GET /health`
- `GET /api/tags`
- `GET /api/sessions`
- `GET /api/sessions/:sessionId`
- `GET /api/sessions/:sessionId/export`
- `GET /api/attachments/:sessionId/:actionId`

### Write and Management APIs

These routes remain public in the sense that they are callable, but they are explicitly documented as management or ingestion routes rather than read APIs:

- `POST /api/actions/batch`
- `POST /api/sessions/:sessionId/actions/:actionId/attachments/screenshot`
- `PATCH /api/sessions/:sessionId/tags`
- `DELETE /api/sessions/:sessionId`
- `DELETE /api/actions/:actionId`
- bulk tag/export/delete routes

## Authentication Model

### Policy

When `AUTH_MODE=none`:

- all existing API routes continue to work without credentials

When `AUTH_MODE=apiKey`:

- all `/api/*` routes require either:
  - `X-API-Key: <key>`
  - `Authorization: Bearer <key>`

### Health Endpoint

`GET /health` remains unauthenticated by default so operators can continue to use it for:

- service liveness checks
- deployment verification
- local startup tooling

This avoids breaking existing health-check flows while still protecting stored data under `/api/*`.

### Compatibility

This is stricter than the current implementation because read routes become protected in API key mode.
That is intentional and is part of the formalization of the public API.
The dashboard and extension already live in the same system and can be updated to send the same key when needed in later work if required, but the immediate design goal is consistency of the API contract.

## Success Response Compatibility

Successful responses stay compatible with the current route behavior.

Examples:

- `GET /api/sessions` continues returning:
  - `total`
  - `page`
  - `pageSize`
  - `sessions`
- `GET /api/sessions/:sessionId` continues returning:
  - `session`
  - `actions`
- `GET /api/tags` continues returning:
  - `tags`
- export routes continue returning JSON or ZIP depending on query params
- attachment routes continue returning binary image content

This avoids unnecessary migration work for the dashboard and any existing tooling that already depends on these payloads.

## Error Response Contract

All API errors should return a normalized JSON structure:

```json
{
  "error": "Session not found",
  "code": "not_found",
  "details": {}
}
```

### Initial Error Codes

- `unauthorized`
- `invalid_payload`
- `not_found`
- `unsupported_format`
- `internal_error`

### HTTP Mapping

- `400`:
  - `invalid_payload`
  - `unsupported_format`
- `401`:
  - `unauthorized`
- `404`:
  - `not_found`
- `500`:
  - `internal_error`

### Notes

- binary routes still use JSON for failure responses
- successful binary responses remain binary
- this phase does not attempt to standardize every success payload into a `{ data }` envelope

## Documentation Design

Add a dedicated API document at:

- `docs/api.md`

The final published API document must be written in Simplified Chinese.

The document should include:

1. overview and purpose
2. authentication
3. environment variables relevant to the API server
4. health endpoint
5. read API reference
6. export API reference
7. write and management API reference
8. error model
9. curl examples

Each documented endpoint should include:

- method and path
- auth requirement
- query parameters or request body
- success response example
- common error responses
- notes on behavior that matter externally

## Implementation Boundaries

### Likely Modified Files

- `server/app.js`
- `README.md`
- `docs/api.md`

### Likely New Helper

To keep `server/app.js` from accumulating repeated auth and error branches, add a focused helper module such as:

- `server/api-response.js`

This helper should centralize:

- auth extraction and validation
- JSON error response formatting

The design goal is to reduce repetition while preserving the current route structure.

## Testing Strategy

Required verification for this phase:

- unauthenticated `/api/*` read requests are rejected in `AUTH_MODE=apiKey`
- authenticated read requests still succeed
- health remains reachable without auth
- existing success payloads stay backward-compatible
- normalized error payloads include both `error` and `code`
- export and attachment routes preserve binary success behavior

Recommended checks:

- targeted server API tests
- `npm test`
- `node --check server/app.js`

## Risks and Mitigations

### Risk: breaking the dashboard or local tools

Mitigation:

- preserve existing route paths
- preserve success payload shapes
- keep `/health` open

### Risk: route-by-route auth drift

Mitigation:

- use one shared API auth middleware for `/api/*`
- use one shared error helper for JSON API failures

### Risk: documentation diverges from implementation

Mitigation:

- document only the routes that actually exist
- use current query parameters and payloads rather than aspirational shapes

## Recommendation

Formalize the current server routes into a documented public API by:

- keeping existing paths
- requiring API key auth consistently for `/api/*` when configured
- normalizing error payloads
- publishing a dedicated API reference

This achieves external data access with minimal migration cost and without introducing a redundant second API surface.
