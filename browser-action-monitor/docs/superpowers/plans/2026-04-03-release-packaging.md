# Release Packaging Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repeatable packaging script that outputs a complete release directory for the extension and server, plus Chinese release documentation.

**Architecture:** Keep packaging logic in a single Node script under `scripts/` so it can inspect project files, stage curated release contents, invoke native ZIP creation on Windows, and generate checksums and release notes in one run. Keep documentation separate in a dedicated Chinese release guide to avoid risky edits to the existing README encoding.

**Tech Stack:** Node.js, built-in `fs/promises`, `crypto`, `child_process`, Windows PowerShell `Compress-Archive`

---

## Chunk 1: Release Script

### Task 1: Add a failing testable surface for packaging helpers

**Files:**
- Create: `tests/scripts/package-release.test.js`
- Create: `scripts/package-release.mjs`

- [ ] **Step 1: Write the failing test**

Verify helper exports can build the expected release paths, choose the correct include set, and exclude runtime data from the server package manifest.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/scripts/package-release.test.js`
Expected: FAIL because the release script helpers do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Export focused helpers from `scripts/package-release.mjs` for:
- release directory naming
- extension include list
- server include list
- runtime data exclusion detection

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/scripts/package-release.test.js`
Expected: PASS

### Task 2: Implement the full release pack workflow

**Files:**
- Modify: `scripts/package-release.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing integration-oriented test**

Extend `tests/scripts/package-release.test.js` to verify the script can build:
- `dist/release-<version>/extension/...zip`
- `dist/release-<version>/server/...zip`
- `dist/release-<version>/RELEASE_NOTES_zh-CN.md`
- `dist/release-<version>/checksums.txt`

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/scripts/package-release.test.js`
Expected: FAIL because the full workflow and npm script entry are not implemented.

- [ ] **Step 3: Write minimal implementation**

Implement:
- curated staging directories for extension and server packages
- ZIP creation via PowerShell on Windows
- SHA-256 checksum generation
- `release:pack` entry in `package.json`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/scripts/package-release.test.js`
Expected: PASS

## Chunk 2: Chinese Release Documentation

### Task 3: Publish release packaging documentation in Chinese

**Files:**
- Create: `docs/release.md`

- [ ] **Step 1: Write the document**

Document:
- packaging command
- release directory layout
- extension package contents
- server package contents
- startup commands
- excluded runtime data

- [ ] **Step 2: Verify the document matches the script output**

Run the packaging script once and confirm the documented directory names and filenames match the actual generated result.

## Chunk 3: Final Verification

### Task 4: Run final verification and capture release evidence

**Files:**
- Verify only

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: PASS with zero failures.

- [ ] **Step 2: Run packaging script**

Run: `npm run release:pack`
Expected: release directory created under `dist/` with both ZIPs, Chinese notes, and checksums.

- [ ] **Step 3: Inspect generated outputs**

Confirm:
- ZIP files exist
- `checksums.txt` contains both ZIP entries
- `RELEASE_NOTES_zh-CN.md` exists and is readable

