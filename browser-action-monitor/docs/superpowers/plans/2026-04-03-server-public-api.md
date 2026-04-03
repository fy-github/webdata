# Server Public API Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse the existing server routes as a stable public API by adding consistent `/api/*` authentication, normalized error payloads, and external-facing documentation without breaking current successful response shapes.

**Architecture:** Keep the current route paths and success payloads intact. Introduce a small shared API helper for auth and JSON error formatting, wire it through `server/app.js`, add focused server tests that lock compatibility, and publish the external contract in `docs/api.md` and the README.

**Tech Stack:** Node.js, Express, built-in `node:test`, existing server repository/export helpers, Markdown docs.

---

## File Map

- Modify: `server/app.js`
  - Apply a shared `/api/*` auth policy.
  - Replace ad hoc JSON error payloads with normalized `{ error, code, details }`.
  - Preserve all existing success payloads and binary responses.
- Create: `server/api-response.js`
  - Centralize API key extraction and validation.
  - Centralize JSON error response helpers for `invalid_payload`, `unauthorized`, `not_found`, `unsupported_format`, and `internal_error`.
- Create: `tests/server/public-api.test.js`
  - Cover read-route auth, health-route no-auth behavior, normalized error bodies, and compatibility of success payloads.
- Modify: `README.md`
  - Add a concise “Public API” section pointing to the formal docs and auth model.
- Create: `docs/api.md`
  - Publish endpoint reference, auth rules, error model, and curl examples in Simplified Chinese.

## Chunk 1: Shared API Helpers

### Task 1: Add auth and error helpers

**Files:**
- Create: `server/api-response.js`
- Test: `tests/server/public-api.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("API routes reject unauthenticated reads in apiKey mode", async () => {
  const response = await fetch(`${server.baseUrl}/api/sessions`);
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.code, "unauthorized");
  assert.equal(payload.error, "Unauthorized");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/server/public-api.test.js`
Expected: FAIL because the route currently succeeds or returns a non-normalized error body.

- [ ] **Step 3: Write minimal implementation**

Add `server/api-response.js` with:

```js
export function readApiKey(request) {
  return request.header("X-API-Key") || request.header("Authorization")?.replace(/^Bearer\s+/i, "");
}

export function requireApiAuth(config) {
  return (request, response, next) => {
    if (config.authMode !== "apiKey") {
      next();
      return;
    }

    const providedKey = readApiKey(request);
    if (!providedKey || providedKey !== config.apiKey) {
      response.status(401).json({
        error: "Unauthorized",
        code: "unauthorized",
        details: {}
      });
      return;
    }

    next();
  };
}

export function sendApiError(response, status, code, error, details = {}) {
  response.status(status).json({ error, code, details });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- tests/server/public-api.test.js`
Expected: PASS for the auth rejection case.

- [ ] **Step 5: Commit**

```bash
git add server/api-response.js tests/server/public-api.test.js
git commit -m "feat: add shared server api auth helpers"
```

## Chunk 2: Route Integration Without Breaking Success Payloads

### Task 2: Protect `/api/*` consistently and normalize JSON errors

**Files:**
- Modify: `server/app.js`
- Modify: `tests/server/public-api.test.js`
- Test: `tests/server/app.test.js`
- Test: `tests/server/attachments-api.test.js`

- [ ] **Step 1: Write the failing tests**

Add these cases to `tests/server/public-api.test.js`:

```js
test("health remains readable without auth in apiKey mode", async () => {
  const response = await fetch(`${server.baseUrl}/health`);
  assert.equal(response.status, 200);
});

test("API routes accept X-API-Key for read requests in apiKey mode", async () => {
  const response = await fetch(`${server.baseUrl}/api/sessions`, {
    headers: { "X-API-Key": "demo-key" }
  });
  assert.equal(response.status, 200);
});

test("missing session returns normalized not_found error", async () => {
  const response = await fetch(`${server.baseUrl}/api/sessions/ses_missing`, {
    headers: { "X-API-Key": "demo-key" }
  });
  const payload = await response.json();
  assert.equal(response.status, 404);
  assert.equal(payload.code, "not_found");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm.cmd test -- tests/server/public-api.test.js tests/server/app.test.js tests/server/attachments-api.test.js`
Expected: FAIL on missing auth enforcement and non-normalized error payloads.

- [ ] **Step 3: Write minimal implementation**

In `server/app.js`:

- import the shared helper(s)
- create one `apiAuthMiddleware`
- mount it with `app.use("/api", apiAuthMiddleware)`
- remove route-local auth duplication where it becomes redundant
- preserve `/health` outside the `/api` auth gate
- replace inline JSON error bodies such as:

```js
response.status(404).json({ error: "Session not found" });
```

with helper usage such as:

```js
sendApiError(response, 404, "not_found", "Session not found");
```

Do not wrap successful responses in a new `{ data }` envelope.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm.cmd test -- tests/server/public-api.test.js tests/server/app.test.js tests/server/attachments-api.test.js`
Expected: PASS with existing success payload assertions still green.

- [ ] **Step 5: Commit**

```bash
git add server/app.js tests/server/public-api.test.js
git commit -m "feat: enforce public api auth and error format"
```

## Chunk 3: Export and Binary Route Compatibility

### Task 3: Lock export and attachment behaviors under the new auth model

**Files:**
- Modify: `tests/server/public-api.test.js`
- Test: `tests/server/attachments-api.test.js`

- [ ] **Step 1: Write the failing tests**

Add focused cases such as:

```js
test("export zip still returns binary content when authenticated", async () => {
  const response = await fetch(`${server.baseUrl}/api/sessions/${sessionId}/export?format=zip`, {
    headers: { "X-API-Key": "demo-key" }
  });

  const archive = Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/zip");
  assert.equal(archive.subarray(0, 2).toString("utf8"), "PK");
});

test("attachment route rejects unauthenticated access in apiKey mode", async () => {
  const response = await fetch(`${server.baseUrl}/api/attachments/${sessionId}/${actionId}`);
  const payload = await response.json();
  assert.equal(response.status, 401);
  assert.equal(payload.code, "unauthorized");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm.cmd test -- tests/server/public-api.test.js tests/server/attachments-api.test.js`
Expected: FAIL until the auth middleware and binary-route handling are correctly integrated.

- [ ] **Step 3: Write minimal implementation**

Adjust `server/app.js` only as needed so that:

- binary success responses stay binary
- binary-route failures still produce normalized JSON errors
- `GET /api/sessions/:sessionId/export` preserves the existing JSON/ZIP contract
- `GET /api/attachments/:sessionId/:actionId` preserves the existing image contract

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm.cmd test -- tests/server/public-api.test.js tests/server/attachments-api.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/app.js tests/server/public-api.test.js tests/server/attachments-api.test.js
git commit -m "test: lock public api binary compatibility"
```

## Chunk 4: External Documentation

### Task 4: Publish the public API contract

**Files:**
- Create: `docs/api.md`
- Modify: `README.md`

- [ ] **Step 1: Write the failing doc checklist**

Create a short manual checklist in the plan execution notes:

- README points to public API docs
- auth modes are documented
- read routes are documented
- management routes are documented
- export route query params are documented
- normalized error shape is documented
- curl examples exist for sessions, session detail, export, and attachment fetch

- [ ] **Step 2: Verify the checklist currently fails**

Run: `rg -n "Public API|/api/sessions|X-API-Key|Authorization: Bearer|error.*code" README.md docs/api.md`
Expected: no `docs/api.md`, incomplete or missing external API guidance.

- [ ] **Step 3: Write minimal documentation**

Create `docs/api.md` with:

- overview
- authentication
- environment variables
- endpoint reference
- error model
- curl examples

Write the final document in Simplified Chinese. Keep route paths, header names, query parameter names, and JSON field names in their literal API form.

Update `README.md` with a short “Public API” section linking to `docs/api.md`.

- [ ] **Step 4: Verify the docs exist and are discoverable**

Run: `rg -n "Public API|X-API-Key|Authorization: Bearer|GET /api/sessions|GET /api/sessions/:sessionId/export" README.md docs/api.md`
Expected: matching lines in both docs.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/api.md
git commit -m "docs: publish server public api reference"
```

## Chunk 5: Final Verification

### Task 5: Run end-to-end verification before handoff

**Files:**
- Verify: `server/app.js`
- Verify: `server/api-response.js`
- Verify: `tests/server/public-api.test.js`
- Verify: `docs/api.md`

- [ ] **Step 1: Run targeted server tests**

Run:

```bash
npm.cmd test -- tests/server/public-api.test.js tests/server/app.test.js tests/server/attachments-api.test.js
```

Expected: PASS.

- [ ] **Step 2: Run the full test suite**

Run:

```bash
npm.cmd test
```

Expected: PASS.

- [ ] **Step 3: Run syntax checks**

Run:

```bash
node --check server/app.js
node --check server/api-response.js
```

Expected: both exit with code `0`.

- [ ] **Step 4: Manually inspect the final public API docs**

Check:

- auth examples match implementation
- route list matches `server/app.js`
- error codes in docs match helper code

- [ ] **Step 5: Commit the final integrated state**

```bash
git add server/app.js server/api-response.js tests/server/public-api.test.js README.md docs/api.md
git commit -m "feat: formalize server public api contract"
```
