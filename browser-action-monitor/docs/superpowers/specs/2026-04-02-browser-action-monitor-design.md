# Browser Action Monitor V1 Design

## Overview

Browser Action Monitor is a Chrome extension plus optional Node.js service for collecting browser interaction data in an agent-readable format. The extension must work fully in local-only mode. When a remote server is configured, it should asynchronously upload captured actions without blocking local capture.

## Goals

- Capture browser actions including click, input, change, submit, scroll, navigation, and keydown.
- Store all captured data locally inside the extension.
- Let developers inspect records inside the extension.
- Export session data as stable JSON for agent training.
- Optionally sync to a remote Node.js + Express server.
- Support privacy protection as a runtime switch.
- Support remote upload in either unauthenticated mode or API key mode.

## Non-Goals

- User accounts or multi-user tenancy.
- Server-side web dashboard.
- Full browser replay engine.
- Automatic Playwright or Puppeteer script generation.
- Distributed or cloud-native storage.

## Architecture

### Browser Extension

- `content.js` listens to DOM/browser events and emits raw event payloads.
- `background.js` acts as the coordinator for settings, sessions, persistence, export, and remote sync.
- Shared logic under `src/extension/` handles normalization, privacy masking, storage access, export formatting, and sync queue behavior.
- `popup.html` provides the compact control panel.
- `options.html` manages capture settings, privacy mode, and remote sync configuration.
- `records.html` displays local records with simple filtering and detail inspection.

### Node.js Service

- Express app exposes a health endpoint and a small JSON API.
- The service stores sessions and actions locally on disk for V1.
- Remote auth mode is controlled by environment variables:
  - `AUTH_MODE=none`
  - `AUTH_MODE=apiKey`
- When `AUTH_MODE=apiKey`, requests must include a matching API key header.

## Data Model

### Session

```json
{
  "sessionId": "ses_123",
  "startedAt": 1710000000000,
  "endedAt": 1710000123456,
  "status": "active",
  "actionCount": 12,
  "lastUrl": "https://example.com",
  "sync": {
    "enabled": true,
    "pendingCount": 2,
    "failedCount": 1,
    "lastSyncedAt": 1710000120000,
    "lastError": ""
  }
}
```

### Action

```json
{
  "id": "act_123",
  "sessionId": "ses_123",
  "type": "input",
  "timestamp": 1710000001234,
  "page": {
    "url": "https://example.com/login",
    "title": "Login"
  },
  "target": {
    "tagName": "INPUT",
    "id": "email",
    "className": "form-control",
    "name": "email",
    "type": "email",
    "text": "",
    "selector": "form > input#email"
  },
  "payload": {
    "value": "[masked]",
    "valueLength": 14
  },
  "privacy": {
    "enabled": true,
    "masked": true,
    "reason": "sensitive-field"
  },
  "sync": {
    "status": "pending",
    "attempts": 0,
    "lastAttemptAt": null,
    "lastError": ""
  }
}
```

## Privacy Rules

- Privacy protection is controlled by a boolean setting.
- When enabled:
  - Password fields are always masked.
  - Sensitive field names like `password`, `token`, `secret`, `email`, `phone`, `idcard`, and similar are masked.
  - Input-like actions store masked values plus metadata such as length.
- When disabled:
  - Raw input values are stored, including password values.

## Remote Sync Rules

- If `serverUrl` is empty, no remote requests are made.
- Local persistence always happens before remote sync.
- Remote failures must not block local capture.
- Upload status is tracked per action.
- Failed actions remain available for retry.
- Upload API supports:
  - No auth
  - Fixed API key auth

## API Surface

### `GET /health`

Returns server health and auth mode.

### `POST /api/actions/batch`

Accepts a batch payload:

```json
{
  "session": {},
  "actions": []
}
```

### `GET /api/sessions`

Returns a session list with summary metadata.

### `GET /api/sessions/:sessionId`

Returns a single session plus all actions.

## UX Surface

### Popup

- Monitoring status
- Session ID
- Action count
- Sync status
- Buttons: export, new session, open records, retry sync, clear data

### Options

- Event toggles
- Scroll and mouse throttling
- Privacy protection switch
- Remote server URL
- Auth mode
- API key

### Records

- Filter by session and action type
- List records
- View full JSON details

## Error Handling

- Catch and isolate event listener failures.
- Surface storage or sync errors in extension UI state.
- Return structured JSON errors from the server.
- Keep extension usable if remote server is unavailable.

## Testing

- Unit tests for normalization, privacy masking, export formatting, and sync state transitions.
- API tests for health, auth modes, batch ingestion, and session queries.
- Manual smoke checks for extension install, capture, local review, export, and remote sync.

## V2 Candidates

- Server-side dashboard
- Multi-session comparison tools
- Rich filtering/search in records UI
- Replay helpers and action-to-script conversion
- Screenshot or DOM snapshot attachment
- Retention policies and bulk cleanup
