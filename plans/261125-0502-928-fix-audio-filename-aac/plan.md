---
title: "Support .aac extension in audioFilename for Placement AI Speaking pipeline (#928)"
description: "Normalize MIME inside audioFilename and map AAC/ADTS and supported audio MIME types via an exact allowlist table to speaking.<ext> with TDD unit and pipeline integration tests."
status: completed
priority: P1
effort: "1h"
tags: [server, placement-ai, audio, aac, bugfix, tdd]
created: 2026-11-25
---

# Support .aac extension in audioFilename for Placement AI Speaking pipeline (#928)

Tracking: #928

## Overview

Speaking upload routes (`apps/server/src/routes/public-placement-test.ts:839-887` and `apps/server/src/routes/student-placement-test.ts:947-995`) validate Speaking audio against `LIBRARY_AUDIO_MIME` (`packages/api/src/library-contracts.ts:47-57`), which explicitly allows `audio/aac`, and derive the R2 storage key extension from the validated filename (`public-placement-test.ts:127`, `apps/server/src/lib/placement-submission-service.ts:181`, with MIME fallbacks at `:134` and `:188`). Client upload metadata in `packages/api/src/placement-test-contracts.ts:3000-3032` (`PLACEMENT_SPEAKING_UPLOAD_META_BY_MIME`) also maps `audio/aac` and its ADTS aliases to `speaking.aac`.

However, `audioFilename(mime)` in `apps/server/src/lib/placement-ai/run-placement-grading.ts:107-122` lacks an AAC branch and falls back to `"speaking.webm"`. When `loadSpeakingAudio()` (`run-placement-grading.ts:131-151`) prepares `PlacementAiAudio` for `grader.transcribe(...)`, an `audio/aac` recording is labeled `speaking.webm` — mismatching its actual format.

This plan fixes `audioFilename(mime)` using a strict TDD red-green-verify workflow formatted for handover execution under `--advice` (`kongming` Checkpoint 1 Verdict: `GO`).

## Scope & Constraints

### Locked In-Scope
- `apps/server/src/lib/placement-ai/run-placement-grading.ts`: export `audioFilename(mime: string): string`, normalize `mime` via existing `normalizeMediaType(mime)` (already imported on line 1), and replace the fragile substring `.includes(...)` chain with an exact allowlist lookup (`AUDIO_EXTENSION_BY_MIME` + `Object.hasOwn`) covering all `LIBRARY_AUDIO_MIME`, `QUIZ_MEDIA_MIME_ALIASES` (including all AAC/ADTS variants → `"aac"` and `"audio/opus"` → `"ogg"`), and legacy video MIME types (`"video/mp4"` → `"mp4"`, `"video/webm"` → `"webm"`), with `"webm"` fallback.
- `apps/server/src/lib/placement-ai/run-placement-grading.test.ts`: new colocated Vitest unit test file covering `audioFilename` across all AAC/ADTS variants, case/parameter edge cases (including `"audio/aac; codecs=mp4a.40.2"`), all `LIBRARY_AUDIO_MIME` entries, `audio/opus`, legacy video types (`video/mp4`, `video/webm`), MIME-confusion strings (`audio/x-mpegurl`, `text/html+aac`), and unknown MIME fallback.
- `apps/server/src/routes/placement-ai-grading.test.ts`: integration test uploading `aacAdtsBytes()` (`audio/aac`, `speaking.aac`) through the public Speaking upload route and verifying `grader.transcribe` receives `{ mime: "audio/aac", filename: "speaking.aac" }` via a test-local transcribe spy in `createHarness`.

### Explicit Non-Goals
- Do NOT remap `audio/aac` to `"speaking.m4a"` (contradicts #928 and mislabels raw ADTS payloads).
- Do NOT remove or restrict `audio/aac` in `LIBRARY_AUDIO_MIME` (`packages/api/src/library-contracts.ts:51`) or `PLACEMENT_SPEAKING_UPLOAD_META_BY_MIME`.
- Do NOT add server-side ADTS-to-M4A/MP3 transcoding/remuxing, magic-byte container rewriting in `loadSpeakingAudio`, or changes to `apps/server/src/lib/placement-ai/openai-grader.ts` or `packages/api/src/lib/media-magic.ts`.
- Do NOT modify `apps/server/src/lib/placement-ai/fake-grader.ts` (exported by `apps/server/package.json:11` for E2E) or add new subpath exports in `apps/server/package.json`.
- Follow-up caveats (outside #928, record in PR/issue notes):
  1. OpenAI `/v1/audio/transcriptions` documentation lists `flac, mp3, mp4, mpeg, mpga, m4a, oga, ogg, wav, webm` without listing raw `.aac`; additionally `media-magic.ts:345-351` currently allows ISO-BMFF/ID3v2 payloads under `audio/aac`. This fix resolves internal pipeline filename consistency per #928 and does not claim live OpenAI acceptance of raw ADTS `.aac` without separate empirical verification.
  2. Tightening `matchesAdtsSync` / ISO-BMFF brand filtering for `audio/aac` in `packages/api/src/lib/media-magic.ts` and canonicalizing/allowlisting `loadSpeakingAudio` DB/R2 `mime` values remain separate follow-ups.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Ensure `audioFilename(mime)` maps `audio/aac` and ADTS MIME aliases (including uppercase and `;params`) to `"speaking.aac"` | P1 |
| 2 | Preserve exact mappings for `webm`, `video/mp4`, `mp4`/`m4a`, `mpeg`/`mp3`, `ogg`/`opus`, `wav`, and fallback `"speaking.webm"` without substring MIME confusion | P1 |
| 3 | Lock behavior with TDD integration + unit test coverage and pass all server/workspace quality gates | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Support .aac in audioFilename & Add TDD Tests](./phase-01-start.md) | Completed |

## Success Criteria

- [x] Integration test in `apps/server/src/routes/placement-ai-grading.test.ts` fails on unmodified production code with `"speaking.webm"` instead of `"speaking.aac"` (TDD Red: 1 failed / 47 passed), and passes after the fix (TDD Green: 48/48 passed).
- [x] `audioFilename` returns `"speaking.aac"` for `"audio/aac"`, `"audio/x-aac"`, `"audio/aacp"`, `"audio/adts"`, `"audio/vnd.dlna.adts"`, `"audio/x-hx-aac-adts"`, `"AUDIO/AAC"`, and `"audio/aac; codecs=mp4a.40.2"` (47/47 unit tests passed).
- [x] `audioFilename` returns exact extensions for `"audio/webm"`/`"video/webm"` (`speaking.webm`), `"video/mp4"` (`speaking.mp4`), `"audio/mp4"`/`"audio/x-m4a"`/`"audio/m4a"`/`"audio/mp4a-latm"` (`speaking.m4a`), `"audio/mpeg"`/`"audio/mp3"` (`speaking.mp3`), `"audio/ogg"`/`"audio/opus"` (`speaking.ogg`), `"audio/wav"`/`"audio/x-wav"`/`"audio/wave"` (`speaking.wav`), and falls back to `"speaking.webm"` for unknown/confused MIMEs (`""`, `"audio/flac"`, `"audio/x-mpegurl"`, `"text/html+aac"`).
- [x] All quality gates pass: `pnpm exec biome check .` (2,519 files / 0 errors), `VITEST_SKIP_SLOW=1 pnpm --filter server test` (132/132 files, 1,774/1,774 tests), `pnpm --filter server run test:ledger` (9 passed | 1 expected fail), `VITE_SERVER_URL=http://localhost:8000 pnpm check-types` (14/14 tasks), and `VITE_SERVER_URL=http://localhost:8000 pnpm build` (7/7 tasks).

## Validation Log

### Session 1 — 2026-11-25
**Trigger:** Mandatory `ak-vibe` pre-implementation plan validation gate for #928.
**Questions asked:** 0 (scope, non-goals, and acceptance criteria fully determined by Issue #928 and `kongming` advisory Checkpoint 1 with zero unresolved ambiguities).

### Verification Results
- **Tier:** Light (1 phase; Fact Checker)
- **Claims checked:** 16
- **Verified:** 16 | **Failed:** 0 | **Unverified:** 0 (after applying Red Team Session 1 corrections below)
  - `apps/server/src/routes/public-placement-test.ts:122-137,752-957` — VERIFIED
  - `apps/server/src/routes/student-placement-test.ts:879-1065` — VERIFIED
  - `apps/server/src/lib/placement-submission-service.ts:176-191` — VERIFIED
  - `packages/api/src/library-contracts.ts:47-57` (`LIBRARY_AUDIO_MIME`, `"audio/aac"` at `:51`) — VERIFIED
  - `packages/api/src/placement-test-contracts.ts:3000-3032` (`PLACEMENT_SPEAKING_UPLOAD_META_BY_MIME`) — VERIFIED
  - `packages/api/src/lib/quiz-media.ts:46-66,78-80` (`QUIZ_MEDIA_MIME_ALIASES`, `normalizeMediaType`) — VERIFIED
  - `apps/server/src/lib/placement-ai/run-placement-grading.ts:1,107-122,124-128,131-151` — VERIFIED
  - `apps/server/src/lib/placement-ai/grader.ts:18-22,46-62` (`PlacementAiAudio`, `PlacementAiGrader`) — VERIFIED
  - `apps/server/src/lib/placement-ai/fake-grader.ts:103-108` & `apps/server/package.json:11` — VERIFIED
  - `apps/server/src/lib/test-media-fixtures.ts:118,123-125` (`webmBytes`, `aacAdtsBytes`) — VERIFIED
  - `apps/server/src/routes/placement-ai-grading.test.ts:28,35,38,216-366,252,267,342,380-519` — VERIFIED
  - `apps/server/vitest.config.ts:10-18` & `.github/workflows/quality.yml:22-23,48-50,104-106,134` — VERIFIED

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`
- Decision deltas checked: 5 (exact allowlist map in `audioFilename` replacing `.includes()`, `describe` target line `519`, `grader` → `baseGrader` rename before lines `:267`/`:342`, accurate key-extension line citations, aligned server test gate with `VITEST_SKIP_SLOW=1` + `test:ledger`)
- Reconciled stale references: 5
- Unresolved contradictions: 0

## Red Team Review

### Session — 2026-11-25
**Reviewers:** Security Adversary (Fact Checker), Assumption Destroyer (Fact Checker)
**Findings:** 6 deduplicated (2 accepted, 4 rejected as out-of-scope follow-ups)
**Severity breakdown:** 1 Critical, 3 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | OpenAI `/v1/audio/transcriptions` does not list raw `.aac`, and `media-magic.ts` accepts ISO-BMFF M4A / ID3v2 under `audio/aac` | Critical | Reject (out of #928 scope; do not reverse explicit #928 spec — clarify scope caveat & track follow-up) | `plan.md` (Explicit Non-Goals) |
| 2 | Substring `.includes()` heuristic in exported `audioFilename` allows MIME confusion (`audio/x-mpegurl`, `text/html+aac`) and drops `audio/opus` | High | Accept | `plan.md`, `phase-01-start.md` (Requirements, Task 1.2, Task 1.3) |
| 3 | Uncanonicalized/unvalidated `mime` in `loadSpeakingAudio` passed to `Blob.type` in `openai-grader.ts` | High | Reject (out of #928 scope; upload routes already canonicalize via `resolveLibraryAudioMimeType`; track defense-in-depth follow-up) | `plan.md` (Explicit Non-Goals) |
| 4 | Magic-byte spoofing on `audio/aac` in `packages/api/src/lib/media-magic.ts` (ISO-BMFF video brands & 7-byte ADTS without `frameLen <= totalSize`) | High | Reject (out of #928 scope; shared upload validator; track security follow-up) | `plan.md` (Explicit Non-Goals) |
| 5 | Student upload route & `speakingMediaMime = ""` fallback not covered by integration test | Medium | Reject (out of #928 scope; both upload routes invoke the same `runPlacementAiGrading` → `loadSpeakingAudio` → `audioFilename` pipeline; track minor follow-up) | Recorded in follow-up notes |
| 6 | Factual inaccuracies in Task 1.1 (`describe` closing line `519` not `1829`, `createHarness` range `216-366` and `grader`→`baseGrader` rename for `:267`/`:342`), dead-fallback citation in `plan.md:17`, and `VITEST_SKIP_SLOW=1` gate mismatch | Medium | Accept | `plan.md`, `phase-01-start.md` (Task 1.1, Task 1.4, Verification) |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`
- Decision deltas checked: 5
- Reconciled stale references: 5
- Unresolved contradictions: 0

<!-- slug: 928-fix-audio-filename-aac -->
