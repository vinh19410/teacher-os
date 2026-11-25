---
phase: 1
title: "Phase 1: Guard MaterialOpenActions & Add TDD Unit Tests"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Guard MaterialOpenActions & Add TDD Unit Tests

## Goal
Enforce `isSafeMaterialUrl(item.url)` before rendering `<a href={item.url}>` in `MaterialOpenActions` (`apps/web/src/components/materials/material-item.tsx:67-82`) and lock the behavior with comprehensive TDD unit tests in `apps/web/src/components/materials/material-item.test.tsx`.

## Files to Create / Modify
- Create: `apps/web/src/components/materials/material-item.test.tsx`
- Modify: `apps/web/src/components/materials/material-item.tsx`

## Requirements
- [x] Guard `item.kind === "link"` rendering in `MaterialOpenActions` with `item.url && isSafeMaterialUrl(item.url) ? (<a ...>) : null` (ternary returning `null`, never `&&` which can emit `""` when `item.url === ""`).
- [x] Keep `href={item.url}`, `target="_blank"`, `rel="noopener noreferrer"`, `aria-label={`Mở liên kết ${item.title}`}`, and `buttonVariants({ variant: "ghost", size: "sm" })` unchanged for valid `http:`/`https:` URLs.
- [x] Keep `file` and `media` action rendering in `MaterialOpenActions` unchanged.
- [x] Create `apps/web/src/components/materials/material-item.test.tsx` with `// @vitest-environment jsdom` on line 1 and `afterEach(cleanup)` (required because `apps/web/vitest.config.ts:32` defaults to `"node"` and has no global RTL cleanup).

## Tasks & Steps

### Task 1.1 — Write failing TDD unit tests for `MaterialOpenActions` (Red phase)
- **Goal:** Create unit tests that prove unsafe link schemes currently slip through `MaterialOpenActions` while documenting expected safe-link, unsafe-link, non-link, and `MaterialItem` composition behavior.
- **Target files and symbols:** Create `apps/web/src/components/materials/material-item.test.tsx` testing exports `MaterialOpenActions`, `MaterialItem`, and type `MaterialRowItem` from `@/components/materials/material-item`.
- **Steps:**
  1. Put `// @vitest-environment jsdom` on line 1 (matching `apps/web/src/components/materials/material-preview.test.tsx:1`).
  2. Import `{ cleanup, render, screen }` from `@testing-library/react`, `{ afterEach, describe, expect, it }` from `vitest`, and `{ MaterialItem, MaterialOpenActions, type MaterialRowItem }` from `@/components/materials/material-item`.
  3. Register `afterEach(() => { cleanup(); });`.
  4. Add a local `makeItem(overrides: Partial<MaterialRowItem> = {}): MaterialRowItem` factory helper defaulting to a `link` item (`id: "mat-1"`, `title: "Bài đọc IELTS"`, `description: ""`, `kind: "link"`, `url: "https://example.com/doc"`, `mimeType: null`, `sizeBytes: null`, `originalName: null`).
  5. Add test cases in `describe("MaterialOpenActions", ...)`:
     - **Valid `http:`/`https:` URLs** (`it.each`): `"https://example.com/path?a=1#frag"`, `"http://example.com"`, `"HTTPS://EXAMPLE.COM/x"` → renders exactly 1 `<a>` with DOM attributes `link.getAttribute("href") === url`, `link.getAttribute("target") === "_blank"`, `link.getAttribute("rel") === "noopener noreferrer"`, accessible name `"Mở liên kết Bài đọc IELTS"`, text `"Mở"`, and an `<svg aria-hidden="true">` icon. <!-- Updated: Red Team Session 1 - use getAttribute("href") to avoid jsdom URL property normalization failures and drop untrimmed whitespace lock-in -->
     - **Unsafe schemes & obfuscated payloads** (`it.each`): `"javascript:alert(1)"`, `"JAVASCRIPT:alert(1)"`, `"JaVaScRiPt:alert(1)"`, `"  javascript:alert(1)"`, `"\u0001javascript:alert(1)"`, `"java\tscript:alert(1)"`, `"java\nscript:alert(1)"`, `"data:text/html,<script>alert(1)</script>"`, `"vbscript:msgbox(1)"`, `"blob:https://example.com/123"`, `"file:///etc/passwd"`, `"ftp://example.com/a"`, `"mailto:a@b.com"`, `"tel:+84123456"` → renders nothing (`container.firstChild` is `null` and `screen.queryByRole("link")` is `null`).
     - **Relative, protocol-relative, malformed, whitespace, empty, and null URLs** (`it.each`): `"//evil.com/phish"`, `"/internal/path"`, `"example.com"`, `"https://"`, `"   "`, `""`, `null` → renders nothing (`container.firstChild` is `null` and `screen.queryByRole("link")` is `null`).
     - **`file` kind regression** (`it.each([null, "javascript:alert(1)"])`): `kind: "file"`, `url` from test case, `mimeType: "application/pdf"`, `sizeBytes: 1024`, `originalName: "de.pdf"` → renders only `Tải xuống Bài đọc IELTS` with `getAttribute("href")` matching `/\/api\/materials\/mat-1\/file\?download=1$/`, no `Phát` link, no `target="_blank"` link. <!-- Updated: Red Team Session 1 - isolate each file render with it.each under manual afterEach(cleanup) -->
     - **`media` kind regression**: `kind: "media"`, `url: null`, `mimeType: "audio/mpeg"`, `sizeBytes: 2048`, `originalName: "audio.mp3"` → renders both `Phát Bài đọc IELTS` (`getAttribute("href")` matching `/\/api\/materials\/mat-1\/file$/`, `getAttribute("target") === "_blank"`, `getAttribute("rel") === "noopener noreferrer"`) and `Tải xuống Bài đọc IELTS` (`getAttribute("href")` matching `/\/api\/materials\/mat-1\/file\?download=1$/`).
  6. Add a `describe("MaterialItem with MaterialOpenActions", ...)` test rendering `<MaterialItem item={unsafeItem} actions={<MaterialOpenActions item={unsafeItem} />} />` with `url: "javascript:alert(1)"`, asserting the item title renders inside `[data-testid="material-item"]` while `container.querySelectorAll("a")` has length `0`.
- **Success criteria:** Test file compiles and runs under Vitest, failing specifically because `MaterialOpenActions` still renders `<a>` for unsafe/malformed non-empty link URLs.
- **Verify (TDD Red):** `pnpm --filter web exec vitest run src/components/materials/material-item.test.tsx` exits **non-zero** with assertion failures on the unsafe/malformed URL test cases (and zero syntax/import errors). Passing with exit code 0 at this stage is a verification failure.

### Task 1.2 — Add `isSafeMaterialUrl` guard to `MaterialOpenActions` (Green phase)
- **Goal:** Block unsafe/invalid link URLs from rendering `<a>` in `MaterialOpenActions`, matching `StudentMaterialRow` (`apps/student/src/components/class/lesson-materials.tsx:118-131`).
- **Target files and symbols:** Modify `apps/web/src/components/materials/material-item.tsx` (imports lines 1-5 and function `MaterialOpenActions` lines 67-82).
- **Steps:**
  1. In `apps/web/src/components/materials/material-item.tsx:1-5`, add `isSafeMaterialUrl` to the existing import from `"@teacher-os/api/material-contracts"` (sorted per Biome rules).
  2. In `MaterialOpenActions` (`apps/web/src/components/materials/material-item.tsx:70`), change `return item.url ? (` to `return item.url && isSafeMaterialUrl(item.url) ? (`, keeping the existing `<a>` JSX and `: null` branch unchanged.
  3. Do not modify `materialMeta`, `MaterialItem`, or the `file`/`media` return branch.
- **Success criteria:** `MaterialOpenActions` renders `<a>` exclusively when `item.url` is truthy and `isSafeMaterialUrl(item.url)` returns `true`, and returns `null` otherwise.
- **Verify (TDD Green):** `pnpm --filter web exec vitest run src/components/materials/material-item.test.tsx` exits `0` with all tests passing (0 failed, 0 skipped).

### Task 1.3 — Run full web tests and repository quality gates
- **Goal:** Verify no regressions across `apps/web`, workspace typechecking, Biome lint/format, and production build.
- **Target files and symbols:** Workspace-wide read-only verification on `apps/web/src/components/materials/material-item.tsx` and `apps/web/src/components/materials/material-item.test.tsx`.
- **Steps:**
  1. Run `pnpm exec biome check .` (if formatting differs, run `pnpm exec biome check --write apps/web/src/components/materials/material-item.tsx apps/web/src/components/materials/material-item.test.tsx` then re-run `pnpm exec biome check .`).
  2. Run `VITE_SERVER_URL=http://localhost:8000 pnpm check-types`. <!-- Updated: Red Team Session 1 - set VITE_SERVER_URL to match .github/workflows/quality.yml:23 and lms assemble-dist guard -->
  3. Run `pnpm --filter web test`.
  4. Run `VITE_SERVER_URL=http://localhost:8000 pnpm build`.
- **Success criteria:** All four commands exit `0` with zero errors, zero lint issues, and all web test suites passing.
- **Verify:** `pnpm exec biome check . && VITE_SERVER_URL=http://localhost:8000 pnpm check-types && pnpm --filter web test && VITE_SERVER_URL=http://localhost:8000 pnpm build` exits `0`.

## Todo
- [x] Task 1.1: Create `apps/web/src/components/materials/material-item.test.tsx` and confirm TDD red failure
- [x] Task 1.2: Add `isSafeMaterialUrl(item.url)` guard in `MaterialOpenActions` and confirm TDD green pass
- [x] Task 1.3: Pass Biome check, typecheck, full web test suite, and build

## Verification
- TDD Red: `pnpm --filter web exec vitest run src/components/materials/material-item.test.tsx` (exits non-zero on unsafe URL assertions before fix)
- TDD Green: `pnpm --filter web exec vitest run src/components/materials/material-item.test.tsx` (exits 0 after fix)
- Regression & quality gates: `pnpm exec biome check . && VITE_SERVER_URL=http://localhost:8000 pnpm check-types && pnpm --filter web test && VITE_SERVER_URL=http://localhost:8000 pnpm build` (exits 0)

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
