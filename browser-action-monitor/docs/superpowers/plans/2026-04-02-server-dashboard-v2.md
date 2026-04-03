# Server Dashboard V2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a server-side dashboard for browsing and managing sessions with tags, search/filtering, export, deletion, and batch operations.

**Architecture:** Keep the existing Express server and JSON repository, add management-oriented repository methods plus dashboard routes, and render the UI with server-served HTML and small vanilla JavaScript modules. Session management remains the primary surface, with action deletion handled inside the session drawer.

**Tech Stack:** Node.js, Express, server-rendered HTML/CSS/JS, JSON file storage, Node test runner

---

## Chunk 1: Repository Foundation

### Task 1: Extend repository read models for dashboard queries

**Files:**
- Modify: `server/repository.js`
- Test: `tests/server/repository-dashboard.test.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

### Task 2: Add session tags and management metadata

**Files:**
- Modify: `server/repository.js`
- Test: `tests/server/repository-dashboard.test.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

### Task 3: Add delete and export operations

**Files:**
- Modify: `server/repository.js`
- Test: `tests/server/repository-dashboard.test.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

## Chunk 2: API Layer

### Task 4: Add dashboard JSON endpoints

**Files:**
- Modify: `server/app.js`
- Test: `tests/server/api.test.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

### Task 5: Add session and action write endpoints

**Files:**
- Modify: `server/app.js`
- Test: `tests/server/api.test.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

## Chunk 3: Dashboard UI

### Task 6: Create dashboard shell and static assets

**Files:**
- Create: `server/views/dashboard.html`
- Create: `server/public/dashboard.css`
- Create: `server/public/dashboard.js`
- Modify: `server/app.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

### Task 7: Implement toolbar, session table, drawer, and batch flows

**Files:**
- Modify: `server/views/dashboard.html`
- Modify: `server/public/dashboard.css`
- Modify: `server/public/dashboard.js`
- Test: `tests/server/api.test.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

## Chunk 4: Docs and Verification

### Task 8: Update docs

**Files:**
- Modify: `README.md`
- Modify: `docs/v2-backlog.md`

- [ ] **Step 1: Document dashboard routes and usage**
- [ ] **Step 2: Mark completed V2 scope and note remaining backlog**

### Task 9: Verify all behavior

**Files:**
- Test: `tests/server/repository-dashboard.test.js`
- Test: `tests/server/api.test.js`

- [ ] **Step 1: Run focused server tests**

Run: `node --test --test-concurrency=1 --test-isolation=none tests/server/repository-dashboard.test.js tests/server/api.test.js`
Expected: PASS

- [ ] **Step 2: Run full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Manual smoke check**

Run server, open `/dashboard`, verify search/filter, open drawer, update tags, delete action, bulk export, bulk delete.
