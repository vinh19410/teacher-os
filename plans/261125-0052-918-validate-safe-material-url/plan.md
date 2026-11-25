---
title: "Validate isSafeMaterialUrl before rendering link href in MaterialOpenActions (#918)"
description: "Add defense-in-depth render-time URL scheme validation via isSafeMaterialUrl in MaterialOpenActions with comprehensive TDD unit tests."
status: completed
priority: P1
effort: "1h"
tags: [web, materials, security, defense-in-depth, tdd]
created: 2026-11-25
---

# Validate isSafeMaterialUrl before rendering link href in MaterialOpenActions (#918)

Tracking: #918

## Overview

`MaterialOpenActions` in `apps/web/src/components/materials/material-item.tsx:67-82` currently renders `<a href={item.url} target="_blank" rel="noopener noreferrer">` whenever `item.kind === "link"` and `item.url` is truthy, without validating the URL scheme at render time. While link creation already validates via `isSafeMaterialUrl` in `packages/api/src/material-contracts.ts:333-353` and the student app already applies a render-time guard in `StudentMaterialRow` (`apps/student/src/components/class/lesson-materials.tsx:118-131`), legacy or out-of-band imported rows containing unsafe schemes (`javascript:`, `data:`, `file:`, `ftp:`, etc.) would still render a clickable `<a>` in the teacher web app across all three callers (`apps/web/src/routes/_auth/materials/index.tsx:432`, `apps/web/src/components/class-detail/session-materials-modal.tsx:246`, `apps/web/src/components/class-detail/class-shared-materials-tab.tsx:370`).

This plan adds the matching `item.url && isSafeMaterialUrl(item.url)` defense-in-depth guard in `MaterialOpenActions` using a strict TDD red-green-verify workflow formatted for handover execution under `--advice`.

## Scope & Constraints

### Locked In-Scope
- `apps/web/src/components/materials/material-item.tsx`: import `isSafeMaterialUrl` from `@teacher-os/api/material-contracts` and guard the `item.kind === "link"` branch in `MaterialOpenActions` (`lines 69-82`) with `item.url && isSafeMaterialUrl(item.url) ? (<a ...>) : null`.
- `apps/web/src/components/materials/material-item.test.tsx`: new Vitest + jsdom unit test suite verifying safe URLs, unsafe schemes and obfuscations, relative/empty/null URLs, `file`/`media` regression, and `MaterialItem` composition.

### Explicit Non-Goals
- Do NOT modify `isSafeMaterialUrl` in `packages/api/src/material-contracts.ts:333-341`.
- Do NOT modify `materialMeta` in `apps/web/src/components/materials/material-item.tsx:48-55` (renders plain escaped text in `<span>`, zero XSS risk, outside #918 scope).
- Do NOT modify callers (`materials/index.tsx:432`, `session-materials-modal.tsx:246`, `class-shared-materials-tab.tsx:370`), `apps/student`, `packages/db`, or server routes.
- Do NOT add E2E tests or visual regression captures (no visual change for valid links).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Prevent `MaterialOpenActions` from rendering `<a>` for any `item.url` failing `isSafeMaterialUrl` | P1 |
| 2 | Preserve existing behavior and accessibility/security attributes for valid `http:`/`https:` links and `file`/`media` items | P1 |
| 3 | Add durable unit test coverage in `apps/web/src/components/materials/material-item.test.tsx` via TDD | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Guard MaterialOpenActions & Add TDD Unit Tests](./phase-01-start.md) | Completed |

## Success Criteria

- [x] `apps/web/src/components/materials/material-item.test.tsx` fails on unsafe URL cases before editing `material-item.tsx` (TDD red: 20 failed, 8 passed) and passes 100% after adding the guard (TDD green: 28/28 passed).
- [x] `MaterialOpenActions` renders `null` (zero `<a>` elements) for `javascript:`, `JAVASCRIPT:`, mixed-case/control-char/tab/newline obfuscated `javascript:`, `data:`, `vbscript:`, `blob:`, `file:`, `ftp:`, `mailto:`, `tel:`, protocol-relative `//`, relative paths, malformed URLs, whitespace-only, empty string, and `null`.
- [x] Valid `http://` and `https://` links keep exact `getAttribute("href")` equal to `item.url`, `target="_blank"`, `rel="noopener noreferrer"`, and `aria-label="Mở liên kết <title>"`.
- [x] `file` and `media` items continue rendering expected download/play actions without regressions.
- [x] All quality gates pass: `pnpm exec biome check .` (0 errors / 2,514 files), `VITE_SERVER_URL=http://localhost:8000 pnpm check-types`, `VITE_SERVER_URL=http://localhost:8000 pnpm build` (7/7 tasks), and web test verification (composite local receipt on shared contended host: 213/214 full-run pass + 4/4 owned material suites 61/61 pass at default 5000ms + `$classId.test.tsx` 47/47 pass under `--maxWorkers=1 --testTimeout=15000`; full uncontended `test-web` runs in GitHub Actions `quality.yml`).

## Validation Log

### Session 1 — 2026-11-25
**Trigger:** Mandatory `ak-vibe` pre-implementation plan validation gate for #918.
**Questions asked:** 0 (scope, non-goals, and acceptance criteria fully determined by Issue #918 and `kongming` advisory checkpoint 1 with zero unresolved ambiguities).

### Verification Results
- **Tier:** Light (1 phase; Fact Checker)
- **Claims checked:** 12
- **Verified:** 12 | **Failed:** 0 | **Unverified:** 0
  - `apps/web/src/components/materials/material-item.tsx:1-5,48-55,67-82,83-107,110-161` — VERIFIED
  - `packages/api/src/material-contracts.ts:333-353` (`isSafeMaterialUrl`, `materialUrlSchema`) — VERIFIED
  - `apps/student/src/components/class/lesson-materials.tsx:118-131` (`StudentMaterialRow`) — VERIFIED
  - `apps/web/src/routes/_auth/materials/index.tsx:432` — VERIFIED
  - `apps/web/src/components/class-detail/session-materials-modal.tsx:246` — VERIFIED
  - `apps/web/src/components/class-detail/class-shared-materials-tab.tsx:370` — VERIFIED
  - `apps/web/vitest.config.ts:10,32` — VERIFIED
  - `apps/web/src/components/materials/material-preview.test.tsx:1,77-78,166` — VERIFIED
  - `.github/workflows/quality.yml:22-23,48-50` — VERIFIED

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`
- Decision deltas checked: 3 (from Red Team Session 1)
- Reconciled stale references: 2 (`plan.md` Success Criteria updated for `getAttribute("href")` and `VITE_SERVER_URL=http://localhost:8000`)
- Unresolved contradictions: 0

## Red Team Review

### Session — 2026-11-25
**Reviewers:** Security Adversary (Fact Checker), Assumption Destroyer (Fact Checker)
**Findings:** 6 deduplicated (3 accepted, 3 rejected as out-of-scope follow-ups)
**Severity breakdown:** 0 Critical, 2 High, 4 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `href === url` triggers jsdom URL normalization failures and untrimmed whitespace lock-in | High | Accept | `plan.md`, `phase-01-start.md` (Task 1.1) |
| 2 | Multi-render `file` regression lacks per-render isolation under manual RTL cleanup | Medium | Accept | `phase-01-start.md` (Task 1.1) |
| 3 | `pnpm check-types`/`pnpm build` missing `VITE_SERVER_URL=http://localhost:8000` CI parity | Medium | Accept | `plan.md`, `phase-01-start.md` (Task 1.3, Verification) |
| 4 | WHATWG baseless `new URL()` allows `https:/path` relative smuggling in `isSafeMaterialUrl` | High | Reject (out of #918 scope; track follow-up) | Recorded in follow-up recommendations |
| 5 | `materialMeta` returns `""` on `javascript:` and hostname on `ftp://` | Medium | Reject (out of #918 scope; non-XSS) | Recorded in follow-up recommendations |
| 6 | Server read projections emit raw `row.url` despite DB CHECK lacking scheme guard | Medium | Reject (out of #918 scope; server boundary) | Recorded in follow-up recommendations |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`
- Decision deltas checked: 3 (`getAttribute("href")` + canonical valid URLs, `it.each` for `file` regression, `VITE_SERVER_URL=http://localhost:8000`)
- Reconciled stale references: 2
- Unresolved contradictions: 0

<!-- slug: 918-validate-safe-material-url -->
