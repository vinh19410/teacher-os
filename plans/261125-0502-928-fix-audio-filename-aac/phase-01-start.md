---
phase: 1
title: "Phase 1: Support .aac in audioFilename & Add TDD Tests"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Support .aac in audioFilename & Add TDD Tests

## Goal
Update `audioFilename(mime)` in `apps/server/src/lib/placement-ai/run-placement-grading.ts:107-122` to normalize its input via `normalizeMediaType(mime)` and map AAC/ADTS and supported audio MIME types via an exact allowlist table (`Object.hasOwn`) to `speaking.<ext>`, verified end-to-end and at unit level via TDD.

## Files to Create / Modify
- Modify: `apps/server/src/routes/placement-ai-grading.test.ts`
- Modify: `apps/server/src/lib/placement-ai/run-placement-grading.ts`
- Create: `apps/server/src/lib/placement-ai/run-placement-grading.test.ts`

## Requirements
- [x] Export `audioFilename(mime: string): string` from `apps/server/src/lib/placement-ai/run-placement-grading.ts` (internal to `apps/server`; do not edit `apps/server/package.json`).
- [x] Normalize `mime` using `normalizeMediaType(mime)` inside `audioFilename` so uppercase values and `;params` (e.g. `"audio/aac; codecs=mp4a.40.2"`) never fall through or match wrong entries.
- [x] Use an exact allowlist lookup table `AUDIO_EXTENSION_BY_MIME` with `Object.hasOwn` covering every `LIBRARY_AUDIO_MIME`, every `QUIZ_MEDIA_MIME_ALIASES` entry (including all AAC/ADTS aliases → `"aac"` and `"audio/opus"` → `"ogg"`), and legacy `"video/mp4"` → `"mp4"` / `"video/webm"` → `"webm"`, falling back to `"webm"` for unrecognized MIMEs. <!-- Updated: Red Team Session 1 - replace .includes() heuristic with exact allowlist table to prevent MIME confusion and support audio/opus parity -->
- [x] Keep `apps/server/src/lib/placement-ai/fake-grader.ts` untouched; observe `grader.transcribe` input via a test-local wrapper in `createHarness` inside `apps/server/src/routes/placement-ai-grading.test.ts`.

## Tests Before (TDD Red)

### Task 1.1 — Add failing pipeline integration test for `audio/aac` Speaking upload (Red phase)
- **Goal:** Prove that uploading a valid `audio/aac` Speaking recording currently passes `filename: "speaking.webm"` instead of `"speaking.aac"` to `grader.transcribe`.
- **Target files and symbols:** Modify `apps/server/src/routes/placement-ai-grading.test.ts` (imports lines 28 & 35, `createHarness` lines 216-366, and end of `describe("placement AI grading pipeline (#730)", ...)` closing at line 519). <!-- Updated: Red Team Session 1 - corrected createHarness range to 216-366 and describe closing line to 519 -->
- **Steps:**
  1. In `apps/server/src/routes/placement-ai-grading.test.ts:28`, update the type import from `../lib/placement-ai/grader` to import `type PlacementAiAudio` alongside `type PlacementAiGrader`.
  2. In `apps/server/src/routes/placement-ai-grading.test.ts:35`, import `aacAdtsBytes` alongside `webmBytes` from `../lib/test-media-fixtures`.
  3. In `createHarness` (`apps/server/src/routes/placement-ai-grading.test.ts:216-366`), add an optional `onTranscribe?: (audio: PlacementAiAudio) => void` field to `opts`. At line 252, rename `const grader: PlacementAiGrader | undefined = ...` to `const baseGrader: PlacementAiGrader | undefined = ...`, then immediately define `const grader: PlacementAiGrader | undefined` wrapping `baseGrader` when `opts.onTranscribe` is provided so `transcribe(audio, signal)` invokes `opts.onTranscribe(audio)` before delegating to `baseGrader.transcribe(audio, signal)`. Both `deps.getPlacementAiGrader` (`:267`) and `pipelineDeps.getPlacementAiGrader` (`:342`) automatically receive the wrapped `grader`. Do not modify `apps/server/src/lib/placement-ai/fake-grader.ts`. <!-- Updated: Red Team Session 1 - explicitly rename line 252 grader -> baseGrader so both deps:267 and pipelineDeps:342 capture the wrapped grader -->
  4. At the end of `describe("placement AI grading pipeline (#730)", ...)` (immediately before line 519 `});`), add a test `"upload Speaking audio/aac gửi đúng filename speaking.aac cho grader.transcribe"`: <!-- Updated: Red Team Session 1 - place inside describe("placement AI grading pipeline (#730)") before line 519, not line 1829 -->
     - Create `const transcribed: PlacementAiAudio[] = []` and `const h = await createHarness({ onTranscribe: (audio) => transcribed.push(audio) })`.
     - Submit a placement test with `speakingMode: "upload"` via `h.submit({ speakingMode: "upload" })`.
     - Upload `const bytes = aacAdtsBytes(16, 5)` via `PUT /public/placement-test/submissions/${created.submissionId}/speaking-media` with headers `origin: PROFILE_ORIGIN`, `"x-upload-token": created.uploadToken`, `"x-media-filename": "speaking.aac"`, `"content-type": "audio/aac"`, `"content-length": String(bytes.byteLength)`. Assert `res.status === 200`.
     - Call `await h.flush()`.
     - Assert `transcribed` has length `1`, `transcribed[0]?.mime === "audio/aac"`, `transcribed[0]?.filename === "speaking.aac"`, and `transcribed[0]?.bytes.byteLength === bytes.byteLength`.
- **Success criteria:** The new test compiles cleanly and fails specifically because `transcribed[0]?.filename` is `"speaking.webm"` instead of `"speaking.aac"`.
- **Verify (TDD Red):** `pnpm --filter server exec vitest run src/routes/placement-ai-grading.test.ts` exits **non-zero** with an assertion failure on `"upload Speaking audio/aac gửi đúng filename speaking.aac cho grader.transcribe"` showing `expected 'speaking.webm' to be 'speaking.aac'` (zero syntax/import errors). Exit code 0 at this stage is a verification failure.

## Refactor / Implementation (TDD Green)

### Task 1.2 — Export and fix `audioFilename(mime)` in `run-placement-grading.ts`
- **Goal:** Normalize `mime` and map AAC/ADTS and all supported audio MIME types via an exact allowlist table to `speaking.<ext>` without substring MIME confusion or regressions.
- **Target files and symbols:** Modify `apps/server/src/lib/placement-ai/run-placement-grading.ts` (function `audioFilename`, lines 107-122).
- **Steps:**
  1. Immediately above `audioFilename` (line 107), add an exact allowlist lookup table `AUDIO_EXTENSION_BY_MIME: Readonly<Record<string, string>>` covering all `LIBRARY_AUDIO_MIME`, `QUIZ_MEDIA_MIME_ALIASES`, and legacy `"video/mp4"` / `"video/webm"` entries: <!-- Updated: Red Team Session 1 - use exact allowlist map with Object.hasOwn instead of .includes() chain -->
     ```ts
     const AUDIO_EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
     	"audio/webm": "webm",
     	"video/webm": "webm",
     	"video/mp4": "mp4",
     	"audio/mp4": "m4a",
     	"audio/x-m4a": "m4a",
     	"audio/m4a": "m4a",
     	"audio/mp4a-latm": "m4a",
     	"audio/aac": "aac",
     	"audio/x-aac": "aac",
     	"audio/aacp": "aac",
     	"audio/adts": "aac",
     	"audio/vnd.dlna.adts": "aac",
     	"audio/x-hx-aac-adts": "aac",
     	"audio/mpeg": "mp3",
     	"audio/mp3": "mp3",
     	"audio/x-mp3": "mp3",
     	"audio/x-mpeg": "mp3",
     	"audio/mpeg3": "mp3",
     	"audio/x-mpeg-3": "mp3",
     	"audio/ogg": "ogg",
     	"audio/opus": "ogg",
     	"audio/x-opus+ogg": "ogg",
     	"audio/x-vorbis+ogg": "ogg",
     	"audio/x-speex+ogg": "ogg",
     	"video/ogg": "ogg",
     	"application/ogg": "ogg",
     	"audio/wav": "wav",
     	"audio/x-wav": "wav",
     	"audio/wave": "wav",
     	"audio/vnd.wave": "wav",
     };

     export function audioFilename(mime: string): string {
     	const normalized = normalizeMediaType(mime);
     	const ext = Object.hasOwn(AUDIO_EXTENSION_BY_MIME, normalized)
     		? AUDIO_EXTENSION_BY_MIME[normalized]
     		: "webm";
     	return `speaking.${ext}`;
     }
     ```
  2. Do not alter `loadSpeakingAudio`, `isTranscribableMime`, `openai-grader.ts`, or `apps/server/package.json`.
- **Success criteria:** `placement-ai-grading.test.ts` now passes, including the new `audio/aac` Speaking upload integration test.
- **Verify (TDD Green — Integration):** `pnpm --filter server exec vitest run src/routes/placement-ai-grading.test.ts` exits `0` with all tests passing (0 failed, 0 skipped).

## Tests After

### Task 1.3 — Add colocated unit test suite for `audioFilename(mime)`
- **Goal:** Exhaustively test `audioFilename` across every `LIBRARY_AUDIO_MIME`, AAC/ADTS alias, uppercase/codec-parameter edge case, `audio/opus`, legacy video MIME, MIME-confusion strings, and unknown fallback.
- **Target files and symbols:** Create `apps/server/src/lib/placement-ai/run-placement-grading.test.ts` importing `audioFilename` from `./run-placement-grading` and `LIBRARY_AUDIO_MIME` from `@teacher-os/api/library-contracts`.
- **Steps:**
  1. Create `apps/server/src/lib/placement-ai/run-placement-grading.test.ts` with `describe("audioFilename", ...)` using Vitest `describe`, `expect`, `test`.
  2. Add `test.each` verifying AAC & ADTS MIME types map to `"speaking.aac"`:
     - `"audio/aac"`, `"audio/x-aac"`, `"audio/aacp"`, `"audio/adts"`, `"audio/vnd.dlna.adts"`, `"audio/x-hx-aac-adts"`, `"AUDIO/AAC"`, `"  audio/aac ; codecs=mp4a.40.2 "`.
  3. Add `test.each` verifying every non-AAC supported MIME preserves its exact extension:
     - `"audio/webm"`, `"video/webm"`, `"audio/webm;codecs=opus"` → `"speaking.webm"`
     - `"video/mp4"`, `"video/mp4; codecs=avc1.42E01E"` → `"speaking.mp4"`
     - `"audio/mp4"`, `"audio/x-m4a"`, `"audio/m4a"`, `"audio/mp4a-latm"` → `"speaking.m4a"`
     - `"audio/mpeg"`, `"audio/mp3"`, `"audio/x-mp3"`, `"audio/x-mpeg"`, `"audio/mpeg3"`, `"audio/x-mpeg-3"` → `"speaking.mp3"`
     - `"audio/ogg"`, `"audio/ogg; codecs=opus"`, `"audio/opus"`, `"audio/x-opus+ogg"`, `"audio/x-vorbis+ogg"`, `"audio/x-speex+ogg"`, `"video/ogg"`, `"application/ogg"` → `"speaking.ogg"` <!-- Updated: Red Team Session 1 - cover audio/opus and OGG aliases -->
     - `"audio/wav"`, `"audio/x-wav"`, `"audio/wave"`, `"audio/vnd.wave"` → `"speaking.wav"`
  4. Add a test verifying every key in `Object.keys(LIBRARY_AUDIO_MIME)` maps to its expected `speaking.<ext>` (ensuring `"audio/aac"` maps to `"speaking.aac"` and no `LIBRARY_AUDIO_MIME` entry silently falls back).
  5. Add `test.each` verifying unknown, empty, or confused MIME strings (`""`, `"audio/flac"`, `"application/octet-stream"`, `"audio/x-mpegurl"`, `"audio/wavpack"`, `"text/html+aac"`, `"__proto__"`) safely fall back to `"speaking.webm"`. <!-- Updated: Red Team Session 1 - assert MIME-confusion and prototype-key safety -->
- **Success criteria:** All unit tests in `run-placement-grading.test.ts` pass cleanly.
- **Verify:** `pnpm --filter server exec vitest run src/lib/placement-ai/run-placement-grading.test.ts` exits `0` with all tests passing (0 failed, 0 skipped).

## Regression Gate

### Task 1.4 — Run server test suite and repository quality gates
- **Goal:** Confirm zero regressions in `apps/server` tests (including `test:ledger`), Biome lint/format, workspace typechecking, and full workspace build.
- **Target files and symbols:** Read-only verification across modified/created files and workspace gates (`.github/workflows/quality.yml:22-23,48-50,104-106,134`). <!-- Updated: Red Team Session 1 - aligned with quality.yml including test:ledger -->
- **Steps:**
  1. Run `pnpm exec biome check .` (if Biome reports formatting on newly edited/created files, run `pnpm exec biome check --write apps/server/src/lib/placement-ai/run-placement-grading.ts apps/server/src/lib/placement-ai/run-placement-grading.test.ts apps/server/src/routes/placement-ai-grading.test.ts` and re-run `pnpm exec biome check .`).
  2. Run `VITEST_SKIP_SLOW=1 pnpm --filter server test && pnpm --filter server run test:ledger` (matching `.github/workflows/quality.yml:104-106,134`).
  3. Run `VITE_SERVER_URL=http://localhost:8000 pnpm check-types` and `VITE_SERVER_URL=http://localhost:8000 pnpm build`.
- **Success criteria:** All commands exit `0` with zero lint errors, zero type errors, zero build errors, and all server test suites passing.
- **Verify:** `pnpm exec biome check . && VITEST_SKIP_SLOW=1 pnpm --filter server test && pnpm --filter server run test:ledger && VITE_SERVER_URL=http://localhost:8000 pnpm check-types && VITE_SERVER_URL=http://localhost:8000 pnpm build` exits `0`.

## Todo
- [x] Task 1.1: Add failing `audio/aac` Speaking integration test in `apps/server/src/routes/placement-ai-grading.test.ts` and verify TDD Red
- [x] Task 1.2: Export and update `audioFilename(mime)` with exact allowlist table in `apps/server/src/lib/placement-ai/run-placement-grading.ts` and verify TDD Green
- [x] Task 1.3: Create `apps/server/src/lib/placement-ai/run-placement-grading.test.ts` and verify all unit cases pass
- [x] Task 1.4: Pass Biome check, server tests + ledger test, workspace typecheck, and build

## Verification
- TDD Red: `pnpm --filter server exec vitest run src/routes/placement-ai-grading.test.ts` (exits non-zero on `"speaking.webm"` !== `"speaking.aac"`)
- TDD Green: `pnpm --filter server exec vitest run src/routes/placement-ai-grading.test.ts src/lib/placement-ai/run-placement-grading.test.ts` (exits 0)
- Regression & quality gates: `pnpm exec biome check . && VITEST_SKIP_SLOW=1 pnpm --filter server test && pnpm --filter server run test:ledger && VITE_SERVER_URL=http://localhost:8000 pnpm check-types && VITE_SERVER_URL=http://localhost:8000 pnpm build` (exits 0)

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
